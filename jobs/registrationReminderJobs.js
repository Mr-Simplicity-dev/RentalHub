/**
 * Reminds registrants who started but did not complete their registration
 * payment. Emails a secure resume link (/register?registration_ref=...) so
 * they can continue exactly where they stopped.
 */

const db = require('../config/middleware/database');
const { sendCompleteRegistrationEmail } = require('../config/utils/emailService');

const PENDING_AFTER_HOURS = 12;
const REMINDER_COOLDOWN_HOURS = 24;
const BATCH_LIMIT = 50;

const runRegistrationReminders = async () => {
  try {
    const due = await db.query(
      `SELECT id, email, full_name, transaction_reference, created_at, reminder_sent_at
       FROM tenant_registration_payments
       WHERE payment_status = 'pending'
         AND registered_user_id IS NULL
         AND created_at < NOW() - ($1::int * INTERVAL '1 hour')
         AND (
           reminder_sent_at IS NULL
           OR reminder_sent_at < NOW() - ($2::int * INTERVAL '1 hour')
         )
       ORDER BY created_at ASC
       LIMIT $3`,
      [PENDING_AFTER_HOURS, REMINDER_COOLDOWN_HOURS, BATCH_LIMIT]
    );

    let sent = 0;
    for (const row of due.rows) {
      const result = await sendCompleteRegistrationEmail({
        email: row.email,
        fullName: row.full_name,
        reference: row.transaction_reference,
        subject: 'Finish Your Registration on RentalHub NG',
        message:
          'You started creating your account but your registration payment is still pending. Complete it to activate your account.',
      });

      if (result.success) {
        await db.query(
          `UPDATE tenant_registration_payments
           SET reminder_sent_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [row.id]
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

const startRegistrationReminderJobs = () => {
  // Run hourly
  setInterval(runRegistrationReminders, 60 * 60 * 1000);
  runRegistrationReminders();
  console.log('Registration reminder job started (hourly)');
};

module.exports = { runRegistrationReminders, startRegistrationReminderJobs };
