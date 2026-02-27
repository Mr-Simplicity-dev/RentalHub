const db = require('../middleware/database');
const { sendEmail } = require('./mailer');
const { sendWhatsAppText } = require('./whatsappService');

let schemaReady = false;

const ensureAlertSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_property_alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30),
      property_type VARCHAR(50) NOT NULL,
      state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
      city VARCHAR(120),
      min_price NUMERIC(12,2),
      max_price NUMERIC(12,2),
      bedrooms INTEGER,
      bathrooms INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      notified_at TIMESTAMP,
      matched_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_active
    ON tenant_property_alerts(is_active, property_type, state_id);

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_email
    ON tenant_property_alerts(email);
  `);

  schemaReady = true;
};

exports.createTenantAlert = async (payload) => {
  await ensureAlertSchema();

  const {
    user_id = null,
    full_name,
    email,
    phone = null,
    property_type,
    state_id = null,
    city = null,
    min_price = null,
    max_price = null,
    bedrooms = null,
    bathrooms = null,
  } = payload;

  const result = await db.query(
    `INSERT INTO tenant_property_alerts (
      user_id, full_name, email, phone, property_type,
      state_id, city, min_price, max_price, bedrooms, bathrooms
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      user_id,
      full_name,
      email,
      phone,
      property_type,
      state_id || null,
      city || null,
      min_price || null,
      max_price || null,
      bedrooms || null,
      bathrooms || null,
    ]
  );

  return result.rows[0];
};

const findMatchingAlerts = async (property) => {
  await ensureAlertSchema();

  const result = await db.query(
    `SELECT *
     FROM tenant_property_alerts
     WHERE is_active = TRUE
       AND notified_at IS NULL
       AND property_type = $1
       AND (state_id IS NULL OR state_id = $2)
       AND (city IS NULL OR LOWER(city) = LOWER($3))
       AND (min_price IS NULL OR min_price <= $4)
       AND (max_price IS NULL OR max_price >= $4)
       AND (bedrooms IS NULL OR bedrooms <= $5)
       AND (bathrooms IS NULL OR bathrooms <= $6)`,
    [
      property.property_type,
      property.state_id,
      property.city || '',
      property.rent_amount || 0,
      property.bedrooms || 0,
      property.bathrooms || 0,
    ]
  );

  return result.rows;
};

const buildMessage = (property, alert) => {
  const lines = [
    `Hi ${alert.full_name},`,
    `A ${property.property_type} matching your request is now available.`,
    `Title: ${property.title}`,
    `Location: ${property.area || ''}, ${property.city || ''}`,
    `Rent: NGN ${property.rent_amount}`,
    `${process.env.FRONTEND_URL || ''}/properties/${property.id}`,
  ];
  return lines.filter(Boolean).join('\n');
};

exports.notifyAlertsForProperty = async (property) => {
  try {
    const alerts = await findMatchingAlerts(property);
    if (!alerts.length) return { matched: 0, notified: 0 };

    let notified = 0;

    for (const alert of alerts) {
      const message = buildMessage(property, alert);

      try {
        await sendEmail({
          to: alert.email,
          subject: 'A property matching your request is now available',
          html: `
            <p>Hi ${alert.full_name},</p>
            <p>A <strong>${property.property_type}</strong> matching your request is now available.</p>
            <p><strong>${property.title}</strong></p>
            <p>Location: ${property.area || ''}, ${property.city || ''}</p>
            <p>Rent: NGN ${property.rent_amount}</p>
            <p><a href="${process.env.FRONTEND_URL || ''}/properties/${property.id}">View Property</a></p>
          `,
        });
      } catch (error) {
        console.error('Property alert email failed:', error.message);
      }

      if (alert.phone) {
        const waResult = await sendWhatsAppText({
          to: alert.phone,
          message,
        });
        if (!waResult.success) {
          console.error('Property alert WhatsApp failed:', waResult.message);
        }
      }

      await db.query(
        `UPDATE tenant_property_alerts
         SET notified_at = NOW(), matched_property_id = $2
         WHERE id = $1`,
        [alert.id, property.id]
      );
      notified++;
    }

    return { matched: alerts.length, notified };
  } catch (error) {
    console.error('Property alert dispatch error:', error.message);
    return { matched: 0, notified: 0 };
  }
};
