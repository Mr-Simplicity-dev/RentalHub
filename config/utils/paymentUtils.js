const db = require('../middleware/database');
const { sendEmail } = require('./mailer');
const { getFrontendUrl } = require('./frontendUrl');
const { formatCurrency, formatDate } = require('./helpers');

const FRONTEND_URL = getFrontendUrl();
let tenancyExpiryReminderSchemaReady = false;

const sendEmailsSafely = async (messages) => {
  await Promise.all(
    messages.map(async (message) => {
      try {
        await sendEmail(message);
      } catch (error) {
        console.error('Failed to send expiration email:', error.message);
      }
    })
  );
};

const ensureTenancyExpiryReminderSchema = async () => {
  if (tenancyExpiryReminderSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenancy_expiry_reminders (
      id SERIAL PRIMARY KEY,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE UNIQUE,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      landlord_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      tenancy_expires_at TIMESTAMP NOT NULL,
      tenant_email_sent_at TIMESTAMP,
      landlord_email_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_tenant
      ON tenancy_expiry_reminders(tenant_id, tenancy_expires_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_landlord
      ON tenancy_expiry_reminders(landlord_id, tenancy_expires_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_property
      ON tenancy_expiry_reminders(property_id, tenancy_expires_at DESC);
  `);

  tenancyExpiryReminderSchemaReady = true;
};

const tenancyDurationSql = `
  CASE
    WHEN prop.payment_frequency = 'monthly' THEN INTERVAL '1 month'
    ELSE INTERVAL '1 year'
  END
`;

const escapeHtml = (value) => {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const buildPropertyLabel = (tenancy) => {
  return [
    tenancy.property_title,
    tenancy.area,
    tenancy.city,
  ]
    .filter(Boolean)
    .join(', ');
};

const sendTenantTenancyExpiredEmail = async (tenancy) => {
  if (!tenancy.tenant_email) return false;

  const propertyLabel = escapeHtml(buildPropertyLabel(tenancy) || 'your rented property');
  const expiredAt = formatDate(tenancy.tenancy_expires_at);
  const amountPaid = formatCurrency(Number(tenancy.amount || 0));
  const tenantName = escapeHtml(tenancy.tenant_name || 'there');

  await sendEmail({
    to: tenancy.tenant_email,
    subject: `Your tenancy has expired - ${tenancy.property_title || 'RentalHub NG'}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6;">
        <h2>Tenancy Expiry Reminder</h2>
        <p>Hello ${tenantName},</p>
        <p>Your tenancy for <strong>${propertyLabel}</strong> expired on <strong>${expiredAt}</strong>.</p>
        <p><strong>Last rent payment:</strong> ${amountPaid}</p>
        <p>Please contact your landlord or open your dashboard if you need to renew, request a grace period, or start a refund discussion.</p>
        <p>
          <a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
            Open Dashboard
          </a>
        </p>
      </div>
    `,
  });

  return true;
};

const sendLandlordTenancyExpiredEmail = async (tenancy) => {
  if (!tenancy.landlord_email) return false;

  const propertyLabel = escapeHtml(buildPropertyLabel(tenancy) || 'your property');
  const expiredAt = formatDate(tenancy.tenancy_expires_at);
  const tenantName = escapeHtml(tenancy.tenant_name || 'A tenant');
  const landlordName = escapeHtml(tenancy.landlord_name || 'there');

  await sendEmail({
    to: tenancy.landlord_email,
    subject: `Tenant tenancy expired - ${tenancy.property_title || 'RentalHub NG'}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6;">
        <h2>Tenant Tenancy Expired</h2>
        <p>Hello ${landlordName},</p>
        <p><strong>${tenantName}</strong>'s tenancy for <strong>${propertyLabel}</strong> expired on <strong>${expiredAt}</strong>.</p>
        <p>Please open your dashboard to follow up, renew the tenancy, grant a grace period, or respond to any refund request.</p>
        <p>
          <a href="${FRONTEND_URL}/dashboard" style="background:#0284c7;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
            Open Dashboard
          </a>
        </p>
      </div>
    `,
  });

  return true;
};


// Check and update expired subscriptions (run as cron job)
exports.checkExpiredSubscriptions = async () => {
  try {
    const result = await db.query(
      `UPDATE users 
       SET subscription_active = FALSE
       WHERE subscription_active = TRUE 
         AND subscription_expires_at < CURRENT_TIMESTAMP
       RETURNING id, email, full_name`
    );

    console.log(`Deactivated ${result.rows.length} expired subscriptions`);

    if (result.rows.length) {
      const messages = result.rows
        .filter((user) => user.email)
        .map((user) => ({
          to: user.email,
          subject: 'Your tenant subscription has expired',
          html: `
            <p>Hello ${user.full_name || 'there'},</p>
            <p>Your subscription has expired and premium tenant access has been paused.</p>
            <p>Renew your plan to continue contacting landlords and viewing full property details.</p>
          `,
        }));

      await sendEmailsSafely(messages);
    }

    return result.rows;

  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
    return [];
  }
};

// Check and update expired property listings
exports.checkExpiredListings = async () => {
  try {
    const result = await db.query(
      `UPDATE properties 
       SET is_available = FALSE
       WHERE is_available = TRUE 
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id, title, landlord_id`
    );

    console.log(`Deactivated ${result.rows.length} expired listings`);

    if (result.rows.length) {
      const landlordIds = [
        ...new Set(
          result.rows
            .map((property) => property.landlord_id)
            .filter(Boolean)
        ),
      ];

      if (landlordIds.length) {
        const landlords = await db.query(
          `SELECT id, email, full_name
           FROM users
           WHERE id = ANY($1::int[])`,
          [landlordIds]
        );

        const landlordById = new Map(
          landlords.rows.map((landlord) => [String(landlord.id), landlord])
        );

        const messages = result.rows
          .map((property) => {
            const landlord = landlordById.get(String(property.landlord_id));
            if (!landlord || !landlord.email) return null;

            return {
              to: landlord.email,
              subject: 'A property listing has expired',
              html: `
                <p>Hello ${landlord.full_name || 'there'},</p>
                <p>Your property listing <strong>${property.title}</strong> has expired and is now unavailable.</p>
                <p>Renew your listing plan to make the property visible again.</p>
              `,
            };
          })
          .filter(Boolean);

        await sendEmailsSafely(messages);
      }
    }

    return result.rows;

  } catch (error) {
    console.error('Error checking expired listings:', error);
    return [];
  }
};

// Send one-time email reminders when a tenant's latest rent period has expired.
exports.checkExpiredTenancyReminders = async ({ limit = 50 } = {}) => {
  try {
    await ensureTenancyExpiryReminderSchema();

    const batchLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const expiredTenancies = await db.query(
      `WITH latest_rent_payments AS (
         SELECT
           pay.id AS payment_id,
           pay.user_id AS tenant_id,
           pay.property_id,
           pay.amount,
           pay.completed_at,
           prop.landlord_id,
           prop.title AS property_title,
           prop.area,
           prop.city,
           prop.payment_frequency,
           COALESCE(pay.completed_at, pay.created_at) + ${tenancyDurationSql} AS tenancy_expires_at,
           ROW_NUMBER() OVER (
             PARTITION BY pay.user_id, pay.property_id
             ORDER BY COALESCE(pay.completed_at, pay.created_at) DESC, pay.id DESC
           ) AS rn
         FROM payments pay
         JOIN properties prop ON prop.id = pay.property_id
         WHERE pay.payment_type = 'rent_payment'
           AND pay.payment_status = 'completed'
           AND pay.property_id IS NOT NULL
       )
       SELECT
         lrp.*,
         tenant.full_name AS tenant_name,
         tenant.email AS tenant_email,
         landlord.full_name AS landlord_name,
         landlord.email AS landlord_email,
         ter.id AS reminder_id,
         ter.tenant_email_sent_at,
         ter.landlord_email_sent_at
       FROM latest_rent_payments lrp
       JOIN users tenant ON tenant.id = lrp.tenant_id
       LEFT JOIN users landlord ON landlord.id = lrp.landlord_id
       LEFT JOIN tenancy_expiry_reminders ter ON ter.payment_id = lrp.payment_id
       WHERE lrp.rn = 1
         AND lrp.tenancy_expires_at <= CURRENT_TIMESTAMP
         AND (
           ter.id IS NULL
           OR (tenant.email IS NOT NULL AND ter.tenant_email_sent_at IS NULL)
           OR (landlord.email IS NOT NULL AND ter.landlord_email_sent_at IS NULL)
         )
       ORDER BY lrp.tenancy_expires_at ASC
       LIMIT $1`,
      [batchLimit]
    );

    let tenantEmailsSent = 0;
    let landlordEmailsSent = 0;

    for (const tenancy of expiredTenancies.rows) {
      const reminderResult = await db.query(
        `INSERT INTO tenancy_expiry_reminders (
           payment_id,
           tenant_id,
           landlord_id,
           property_id,
           tenancy_expires_at
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (payment_id) DO UPDATE
           SET tenancy_expires_at = EXCLUDED.tenancy_expires_at,
               updated_at = CURRENT_TIMESTAMP
         RETURNING tenant_email_sent_at, landlord_email_sent_at`,
        [
          tenancy.payment_id,
          tenancy.tenant_id,
          tenancy.landlord_id,
          tenancy.property_id,
          tenancy.tenancy_expires_at,
        ]
      );

      const reminder = reminderResult.rows[0] || {};
      const shouldEmailTenant = tenancy.tenant_email && !reminder.tenant_email_sent_at;
      const shouldEmailLandlord = tenancy.landlord_email && !reminder.landlord_email_sent_at;

      if (shouldEmailTenant) {
        try {
          const sent = await sendTenantTenancyExpiredEmail(tenancy);
          if (sent) {
            tenantEmailsSent += 1;
            await db.query(
              `UPDATE tenancy_expiry_reminders
               SET tenant_email_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE payment_id = $1`,
              [tenancy.payment_id]
            );
          }
        } catch (emailError) {
          console.error('Failed to send tenant tenancy expiry email:', emailError.message);
        }
      }

      if (shouldEmailLandlord) {
        try {
          const sent = await sendLandlordTenancyExpiredEmail(tenancy);
          if (sent) {
            landlordEmailsSent += 1;
            await db.query(
              `UPDATE tenancy_expiry_reminders
               SET landlord_email_sent_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE payment_id = $1`,
              [tenancy.payment_id]
            );
          }
        } catch (emailError) {
          console.error('Failed to send landlord tenancy expiry email:', emailError.message);
        }
      }
    }

    console.log(
      `Tenancy expiry reminder check complete. Tenant emails: ${tenantEmailsSent}. Landlord emails: ${landlordEmailsSent}.`
    );

    return {
      checked: expiredTenancies.rows.length,
      tenantEmailsSent,
      landlordEmailsSent,
    };
  } catch (error) {
    console.error('Error checking expired tenancy reminders:', error);
    return {
      checked: 0,
      tenantEmailsSent: 0,
      landlordEmailsSent: 0,
      error: error.message,
    };
  }
};

// Calculate platform revenue
exports.calculateRevenue = async (startDate, endDate) => {
  try {
    const result = await db.query(
      `SELECT 
         payment_type,
         COUNT(*) as transaction_count,
         SUM(amount) as total_amount
       FROM payments
       WHERE payment_status = 'completed'
         AND completed_at BETWEEN $1 AND $2
       GROUP BY payment_type`,
      [startDate, endDate]
    );

    return result.rows;

  } catch (error) {
    console.error('Error calculating revenue:', error);
    return [];
  }
};

// Get payment statistics for admin dashboard
exports.getPaymentStats = async () => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE payment_type IN ('tenant_subscription', 'tenant_multiple_property_subscription', 'landlord_subscription') AND payment_status = 'completed') as total_subscriptions,
        COUNT(*) FILTER (WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') as total_listings_paid,
        COUNT(*) FILTER (WHERE payment_type = 'rent_payment' AND payment_status = 'completed') as total_rent_payments,
        SUM(amount) FILTER (WHERE payment_status = 'completed') as total_revenue,
        SUM(amount) FILTER (WHERE payment_type IN ('tenant_subscription', 'tenant_multiple_property_subscription', 'landlord_subscription') AND payment_status = 'completed') as subscription_revenue,
        SUM(amount) FILTER (WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') as listing_revenue,
        SUM(amount) FILTER (WHERE payment_type = 'rent_payment' AND payment_status = 'completed') as rent_revenue
      FROM payments
    `);

    return stats.rows[0];

  } catch (error) {
    console.error('Error getting payment stats:', error);
    return null;
  }
};
