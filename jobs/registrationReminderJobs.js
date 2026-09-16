/**
 * Reminds registrants who started but did not complete their registration
 * payment. Emails a secure resume link (/register?registration_ref=...) so
 * they can continue exactly where they stopped.
 *
 * Rules:
 * - Automatically links and completes registrations for users who already exist in `users`.
 * - Maximum of 3 reminders sent per registration (12h, 48h, 5 days).
 * - Registrations older than 14 days or exceeding 3 reminders are marked 'abandoned'.
 * - Verifies email legitimacy and ignores malformed/test records.
 */

const db = require('../config/middleware/database');
const { sendCompleteRegistrationEmail } = require('../config/utils/emailService');

const MAX_REMINDERS = 3;
const ABANDONED_AFTER_DAYS = 14;
const BATCH_LIMIT = 50;

let schemaEnsured = false;
const ensureRegistrationReminderSchema = async () => {
  if (schemaEnsured) return;
  try {
    await db.query(`
      ALTER TABLE tenant_registration_payments
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMP;
    `);
    schemaEnsured = true;
  } catch (err) {
    // Non-fatal if already applied by migrations
  }
};

/**
 * Reconcile pending registration payments where the user already completed
 * an account with the same email (e.g. through a retry or social signup).
 */
const reconcileRegisteredUsers = async () => {
  try {
    const result = await db.query(
      `UPDATE tenant_registration_payments trp
       SET payment_status = 'completed',
           registered_user_id = u.id,
           completed_at = COALESCE(trp.completed_at, u.created_at)
       FROM users u
       WHERE trp.payment_status = 'pending'
         AND trp.registered_user_id IS NULL
         AND LOWER(TRIM(trp.email)) = LOWER(TRIM(u.email))
       RETURNING trp.id`
    );
    if (result.rows && result.rows.length > 0) {
      console.log(`Reconciled ${result.rows.length} pending registrations to existing users`);
    }
    return result.rows ? result.rows.length : 0;
  } catch (error) {
    console.warn('Registration reconciliation error:', error.message);
    return 0;
  }
};

/**
 * Mark stale registrations (older than 14 days or >= 3 reminders) as abandoned
 */
const expireAbandonedRegistrations = async () => {
  try {
    const result = await db.query(
      `UPDATE tenant_registration_payments
       SET payment_status = 'abandoned',
           abandoned_at = COALESCE(abandoned_at, CURRENT_TIMESTAMP)
       WHERE payment_status = 'pending'
         AND registered_user_id IS NULL
         AND (
           created_at < NOW() - ($1::int * INTERVAL '1 day')
           OR COALESCE(reminder_count, 0) >= $2
         )
       RETURNING id`,
      [ABANDONED_AFTER_DAYS, MAX_REMINDERS]
    );
    if (result.rows && result.rows.length > 0) {
      console.log(`Marked ${result.rows.length} stale registrations as abandoned`);
    }
    return result.rows ? result.rows.length : 0;
  } catch (error) {
    console.warn('Registration expiry error:', error.message);
    return 0;
  }
};

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  // Ignore dummy/test addresses
  if (trimmed.endsWith('@example.com') || trimmed.endsWith('@test.com') || trimmed.startsWith('test@')) {
    return false;
  }
  return true;
};

const runRegistrationReminders = async () => {
  try {
    await ensureRegistrationReminderSchema();
    await reconcileRegisteredUsers();
    await expireAbandonedRegistrations();

    // Select pending registrations due for their next reminder:
    // - 1st reminder: pending >= 12h, reminder_count = 0
    // - 2nd reminder: pending >= 48h, reminder_count = 1, last reminder >= 24h ago
    // - 3rd reminder: pending >= 5 days, reminder_count = 2, last reminder >= 48h ago
    const due = await db.query(
      `SELECT id, email, full_name, transaction_reference, created_at, reminder_sent_at,
              COALESCE(reminder_count, 0) AS reminder_count
       FROM tenant_registration_payments trp
       WHERE trp.payment_status = 'pending'
         AND trp.registered_user_id IS NULL
         AND trp.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND COALESCE(trp.reminder_count, 0) < $2
         AND (
           (COALESCE(trp.reminder_count, 0) = 0 AND trp.created_at < NOW() - INTERVAL '12 hours')
           OR (COALESCE(trp.reminder_count, 0) = 1 AND trp.created_at < NOW() - INTERVAL '48 hours' AND (trp.reminder_sent_at IS NULL OR trp.reminder_sent_at < NOW() - INTERVAL '24 hours'))
           OR (COALESCE(trp.reminder_count, 0) = 2 AND trp.created_at < NOW() - INTERVAL '5 days' AND (trp.reminder_sent_at IS NULL OR trp.reminder_sent_at < NOW() - INTERVAL '48 hours'))
         )
         AND NOT EXISTS (
           SELECT 1 FROM users u WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(trp.email))
         )
       ORDER BY trp.created_at ASC
       LIMIT $3`,
      [ABANDONED_AFTER_DAYS, MAX_REMINDERS, BATCH_LIMIT]
    );

    let sent = 0;
    for (const row of due.rows) {
      if (!isValidEmail(row.email)) {
        // Mark invalid email records as abandoned immediately
        await db.query(
          `UPDATE tenant_registration_payments
           SET payment_status = 'abandoned', abandoned_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [row.id]
        );
        continue;
      }

      const count = Number(row.reminder_count) || 0;
      let subject = 'Finish Your Registration on RentalHub NG';
      let message = 'You started creating your account but your registration payment is still pending. Complete it to activate your account.';

      if (count === 1) {
        subject = 'Reminder: Complete your RentalHub NG account';
        message = 'We noticed you haven\'t finished setting up your RentalHub NG account. Your saved details are ready so you can pick up right where you left off.';
      } else if (count >= 2) {
        subject = 'Final Notice: Your RentalHub NG registration link is expiring soon';
        message = 'This is your final reminder to complete your registration. Your reserved registration link will expire soon.';
      }

      const result = await sendCompleteRegistrationEmail({
        email: row.email,
        fullName: row.full_name,
        reference: row.transaction_reference,
        subject,
        message,
      });

      if (result.success) {
        const nextCount = count + 1;
        await db.query(
          `UPDATE tenant_registration_payments
           SET reminder_sent_at = CURRENT_TIMESTAMP,
               reminder_count = $1,
               abandoned_at = CASE WHEN $1 >= $2 THEN CURRENT_TIMESTAMP ELSE abandoned_at END,
               payment_status = CASE WHEN $1 >= $2 THEN 'abandoned' ELSE payment_status END
           WHERE id = $3`,
          [nextCount, MAX_REMINDERS, row.id]
        );
        sent++;
      }
    }

    if (due.rows.length > 0) {
      console.log(`Registration reminders: ${sent}/${due.rows.length} emailed`);
    }
  } catch (error) {
    console.error('Registration reminder job error:', error.message);
  }
};

const getAbandonedRegistrationsSummary = async () => {
  try {
    await ensureRegistrationReminderSchema();
    const stats = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE payment_status = 'pending' AND registered_user_id IS NULL) AS pending_total,
        COUNT(*) FILTER (WHERE payment_status = 'pending' AND registered_user_id IS NULL AND created_at < NOW() - INTERVAL '12 hours') AS pending_over_12h,
        COUNT(*) FILTER (WHERE payment_status = 'abandoned') AS abandoned_total,
        COUNT(*) FILTER (WHERE payment_status = 'completed') AS completed_total,
        COUNT(*) FILTER (WHERE reminder_count > 0) AS reminders_sent_total
      FROM tenant_registration_payments
    `);
    return stats.rows[0] || {};
  } catch (error) {
    console.error('getAbandonedRegistrationsSummary error:', error.message);
    return {};
  }
};

const startRegistrationReminderJobs = () => {
  // Run hourly
  setInterval(runRegistrationReminders, 60 * 60 * 1000);
  runRegistrationReminders();
  console.log('Registration reminder job started (hourly)');
};

module.exports = {
  runRegistrationReminders,
  expireAbandonedRegistrations,
  reconcileRegisteredUsers,
  getAbandonedRegistrationsSummary,
  startRegistrationReminderJobs,
};

