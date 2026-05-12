const db = require('../middleware/database');
const { sendEmail } = require('./mailer');
const { getFrontendUrl } = require('./frontendUrl');
const { sendWhatsAppText } = require('./whatsappService');

let schemaReady = false;
const ALERT_REQUEST_FEE_NGN = 5000;
const FRONTEND_URL = getFrontendUrl();
const ACTIVE_MATCH_STATUSES = [
  'approved_assigned',
  'sourcing',
  'lga_coverage_missing',
];

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
      lga_name VARCHAR(120),
      city VARCHAR(120),
      min_price NUMERIC(12,2),
      max_price NUMERIC(12,2),
      bedrooms INTEGER,
      bathrooms INTEGER,
      workflow_status VARCHAR(40) NOT NULL DEFAULT 'pending_support_review',
      support_note TEXT,
      support_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      support_reviewed_at TIMESTAMP,
      assigned_state_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMP,
      state_admin_status VARCHAR(40),
      state_admin_note TEXT,
      state_admin_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      state_admin_updated_at TIMESTAMP,
      lga_coverage_missing_at TIMESTAMP,
      fulfilled_at TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      notified_at TIMESTAMP,
      matched_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_active
    ON tenant_property_alerts(is_active, property_type, state_id);

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_email
    ON tenant_property_alerts(email);

    CREATE TABLE IF NOT EXISTS tenant_property_alert_payments (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30),
      property_type VARCHAR(50) NOT NULL,
      state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
      lga_name VARCHAR(120),
      city VARCHAR(120),
      min_price NUMERIC(12,2),
      max_price NUMERIC(12,2),
      bedrooms INTEGER,
      bathrooms INTEGER,
      amount DECIMAL(12,2) NOT NULL DEFAULT 5000,
      currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      payment_method VARCHAR(50) NOT NULL DEFAULT 'paystack',
      transaction_reference VARCHAR(255) NOT NULL UNIQUE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_alert_id INTEGER REFERENCES tenant_property_alerts(id) ON DELETE SET NULL,
      gateway_response JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      processed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_alert_payments_reference
    ON tenant_property_alert_payments(transaction_reference);

    CREATE INDEX IF NOT EXISTS idx_tenant_alert_payments_status
    ON tenant_property_alert_payments(payment_status, processed_at);

    ALTER TABLE tenant_property_alerts
      ADD COLUMN IF NOT EXISTS lga_name VARCHAR(120);

    ALTER TABLE tenant_property_alerts
      ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(40) NOT NULL DEFAULT 'pending_support_review',
      ADD COLUMN IF NOT EXISTS support_note TEXT,
      ADD COLUMN IF NOT EXISTS support_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS support_reviewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS assigned_state_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS state_admin_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS state_admin_note TEXT,
      ADD COLUMN IF NOT EXISTS state_admin_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS state_admin_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS lga_coverage_missing_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;

    UPDATE tenant_property_alerts
    SET workflow_status = 'approved_assigned'
    WHERE workflow_status IS NULL;

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_workflow
    ON tenant_property_alerts(workflow_status, state_id, lga_name, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tenant_alerts_assigned_admin
    ON tenant_property_alerts(assigned_state_admin_id, workflow_status);

    ALTER TABLE tenant_property_alert_payments
      ADD COLUMN IF NOT EXISTS lga_name VARCHAR(120);
  `);

  schemaReady = true;
};

const buildAlertPayloadFromPayment = (payment) => ({
  full_name: payment.full_name,
  email: payment.email,
  phone: payment.phone,
  property_type: payment.property_type,
  state_id: payment.state_id,
  lga_name: payment.lga_name,
  city: payment.city,
  min_price: payment.min_price,
  max_price: payment.max_price,
  bedrooms: payment.bedrooms,
  bathrooms: payment.bathrooms,
});

exports.createTenantAlert = async (payload) => {
  await ensureAlertSchema();

  const {
    user_id = null,
    full_name,
    email,
    phone = null,
    property_type,
    state_id = null,
    lga_name = null,
    city = null,
    min_price = null,
    max_price = null,
    bedrooms = null,
    bathrooms = null,
    workflow_status = 'pending_support_review',
    is_active = false,
  } = payload;

  const result = await db.query(
    `INSERT INTO tenant_property_alerts (
      user_id, full_name, email, phone, property_type,
      state_id, lga_name, city, min_price, max_price, bedrooms, bathrooms,
      workflow_status, is_active
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      user_id,
      full_name,
      email,
      phone,
      property_type,
      state_id || null,
      lga_name || null,
      city || null,
      min_price || null,
      max_price || null,
      bedrooms || null,
      bathrooms || null,
      workflow_status,
      is_active === true,
    ]
  );

  return result.rows[0];
};

exports.ALERT_REQUEST_FEE_NGN = ALERT_REQUEST_FEE_NGN;

exports.createTenantAlertPayment = async (payload) => {
  await ensureAlertSchema();

  const {
    full_name,
    email,
    phone = null,
    property_type,
    state_id = null,
    lga_name = null,
    city = null,
    min_price = null,
    max_price = null,
    bedrooms = null,
    bathrooms = null,
    amount = ALERT_REQUEST_FEE_NGN,
    transaction_reference,
    payment_method = 'paystack',
  } = payload;

  const result = await db.query(
    `INSERT INTO tenant_property_alert_payments (
      full_name, email, phone, property_type, state_id, lga_name, city,
      min_price, max_price, bedrooms, bathrooms, amount,
      payment_method, transaction_reference
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      full_name,
      email,
      phone,
      property_type,
      state_id || null,
      lga_name || null,
      city || null,
      min_price || null,
      max_price || null,
      bedrooms || null,
      bathrooms || null,
      amount,
      payment_method,
      transaction_reference,
    ]
  );

  return result.rows[0];
};

exports.getTenantAlertPaymentByReference = async (reference) => {
  await ensureAlertSchema();

  const result = await db.query(
    `SELECT *
     FROM tenant_property_alert_payments
     WHERE transaction_reference = $1
     LIMIT 1`,
    [reference]
  );

  return result.rows[0] || null;
};

exports.markTenantAlertPaymentCompleted = async (reference, gatewayResponse) => {
  await ensureAlertSchema();

  const result = await db.query(
    `UPDATE tenant_property_alert_payments
     SET payment_status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         gateway_response = $1
     WHERE transaction_reference = $2
     RETURNING *`,
    [JSON.stringify(gatewayResponse), reference]
  );

  return result.rows[0] || null;
};

exports.markTenantAlertPaymentProcessed = async (reference, alertId) => {
  await ensureAlertSchema();

  const result = await db.query(
    `UPDATE tenant_property_alert_payments
     SET processed_at = CURRENT_TIMESTAMP,
         created_alert_id = $2
     WHERE transaction_reference = $1
     RETURNING *`,
    [reference, alertId]
  );

  return result.rows[0] || null;
};

exports.createTenantAlertFromPayment = async (payment) => {
  const alert = await exports.createTenantAlert(buildAlertPayloadFromPayment(payment));

  await exports.markTenantAlertPaymentProcessed(
    payment.transaction_reference,
    alert.id
  );

  return alert;
};

exports.getTenantAlertById = async (alertId) => {
  await ensureAlertSchema();

  const result = await db.query(
    `SELECT *
     FROM tenant_property_alerts
     WHERE id = $1
     LIMIT 1`,
    [alertId]
  );

  return result.rows[0] || null;
};

const findMatchingAlerts = async (property) => {
  await ensureAlertSchema();

  const result = await db.query(
    `SELECT *
     FROM tenant_property_alerts
     WHERE is_active = TRUE
       AND notified_at IS NULL
       AND workflow_status = ANY($7)
       AND property_type = $1
       AND (state_id IS NULL OR state_id = $2)
       AND (
         lga_name IS NULL
         OR LOWER(COALESCE(lga_name, '')) = LOWER($8)
       )
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
      ACTIVE_MATCH_STATUSES,
      property.lga_name || '',
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
    `${FRONTEND_URL}/properties/${property.id}`,
  ];
  return lines.filter(Boolean).join('\n');
};

const buildRequestSearchUrl = (alert) => {
  const url = new URL('/properties', FRONTEND_URL);

  if (alert.property_type) url.searchParams.set('property_type', alert.property_type);
  if (alert.state_id) url.searchParams.set('state_id', alert.state_id);
  if (alert.lga_name) url.searchParams.set('lga_name', alert.lga_name);
  if (alert.city) url.searchParams.set('city', alert.city);

  return url.toString();
};

const sendManualFulfillmentNotification = async (alert, note = '') => {
  const searchUrl = buildRequestSearchUrl(alert);
  const locationLabel = [alert.state_name, alert.lga_name, alert.city]
    .filter(Boolean)
    .join(', ');
  const message = [
    `Hi ${alert.full_name},`,
    `Your ${alert.property_type} property request has been completed by the RentalHub state team.`,
    locationLabel ? `Requested location: ${locationLabel}` : null,
    note ? `Update: ${note}` : null,
    `You can now check matching properties here: ${searchUrl}`,
  ].filter(Boolean).join('\n');

  try {
    await sendEmail({
      to: alert.email,
      subject: 'Your property request has been completed',
      html: `
        <p>Hi ${alert.full_name},</p>
        <p>Your <strong>${alert.property_type}</strong> property request has been completed by the RentalHub state team.</p>
        ${locationLabel ? `<p><strong>Requested location:</strong> ${locationLabel}</p>` : ''}
        ${note ? `<p><strong>Update:</strong> ${note}</p>` : ''}
        <p><a href="${searchUrl}">Check matching properties</a></p>
      `,
    });
  } catch (error) {
    console.error('Manual property request fulfillment email failed:', error.message);
  }

  if (alert.phone) {
    const waResult = await sendWhatsAppText({
      to: alert.phone,
      message,
    });
    if (!waResult.success) {
      console.error('Manual property request fulfillment WhatsApp failed:', waResult.message);
    }
  }
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
            <p><a href="${FRONTEND_URL}/properties/${property.id}">View Property</a></p>
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
         SET notified_at = NOW(),
             matched_property_id = $2,
             workflow_status = 'fulfilled',
             fulfilled_at = NOW(),
             is_active = FALSE
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

const mapAlertRow = (row) => ({
  ...row,
  amount: row.amount == null ? null : Number(row.amount),
  min_price: row.min_price == null ? null : Number(row.min_price),
  max_price: row.max_price == null ? null : Number(row.max_price),
});

const normalizeStatusFilter = (status) => {
  const value = String(status || 'all').trim();
  return value === 'all' ? null : value;
};

const normalizeState = (value) => String(value || '').trim().toLowerCase();

const getAdminAssignedState = async (adminId) => {
  const result = await db.query(
    `SELECT assigned_state, assigned_city, user_type
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [adminId]
  );

  return result.rows[0] || null;
};

const findAutoAssignableStateAdmin = async (stateName, lgaName = null) => {
  const state = String(stateName || '').trim();
  if (!state) return null;

  const lga = String(lgaName || '').trim();
  const result = await db.query(
    `SELECT id, full_name, email, user_type, assigned_state, assigned_city
     FROM users
     WHERE is_active IS DISTINCT FROM FALSE
       AND user_type IN ('state_admin', 'state_financial_admin', 'admin')
       AND LOWER(COALESCE(assigned_state, '')) = LOWER($1)
     ORDER BY
       CASE
         WHEN $2 <> '' AND LOWER(COALESCE(assigned_city, '')) = LOWER($2) THEN 0
         WHEN user_type = 'state_admin' THEN 1
         WHEN user_type = 'state_financial_admin' THEN 2
         ELSE 3
       END,
       created_at ASC
     LIMIT 1`,
    [state, lga]
  );

  return result.rows[0] || null;
};

exports.ensureAlertSchema = ensureAlertSchema;

exports.listTenantPropertyRequestsForAdmin = async ({
  viewer,
  status = 'all',
  limit = 50,
}) => {
  await ensureAlertSchema();

  const viewerRole = String(viewer?.user_type || '').trim().toLowerCase();
  const statusFilter = normalizeStatusFilter(status);
  const params = [];
  const where = ['1=1'];

  if (statusFilter) {
    params.push(statusFilter);
    where.push(`a.workflow_status = $${params.length}`);
  }

  if (viewerRole === 'state_support_admin') {
    const assignedState = normalizeState(viewer.assigned_state);
    if (!assignedState) return [];
    params.push(assignedState);
    where.push(`LOWER(COALESCE(s.state_name, '')) = $${params.length}`);
    where.push(`a.workflow_status IN ('pending_support_review', 'approved_assigned', 'sourcing', 'lga_coverage_missing', 'fulfilled', 'rejected')`);
  } else if (['state_admin', 'state_financial_admin', 'admin'].includes(viewerRole)) {
    const assignedState = normalizeState(viewer.assigned_state);
    if (!assignedState) return [];
    params.push(assignedState);
    where.push(`LOWER(COALESCE(s.state_name, '')) = $${params.length}`);

    if (viewerRole === 'admin' && viewer.assigned_city) {
      params.push(String(viewer.assigned_city).trim().toLowerCase());
      where.push(`LOWER(COALESCE(a.lga_name, '')) = $${params.length}`);
    }

    where.push(`a.workflow_status IN ('approved_assigned', 'sourcing', 'lga_coverage_missing', 'fulfilled')`);
  } else if (!['super_support_admin', 'super_admin'].includes(viewerRole)) {
    return [];
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  params.push(parsedLimit);

  const result = await db.query(
    `SELECT
       a.*,
       s.state_name,
       reviewer.full_name AS support_reviewer_name,
       assigned.full_name AS assigned_admin_name,
       assigned.email AS assigned_admin_email,
       assigned.user_type AS assigned_admin_role,
       updater.full_name AS state_admin_updater_name
     FROM tenant_property_alerts a
     LEFT JOIN states s ON s.id = a.state_id
     LEFT JOIN users reviewer ON reviewer.id = a.support_reviewed_by
     LEFT JOIN users assigned ON assigned.id = a.assigned_state_admin_id
     LEFT JOIN users updater ON updater.id = a.state_admin_updated_by
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE a.workflow_status
         WHEN 'pending_support_review' THEN 0
         WHEN 'approved_assigned' THEN 1
         WHEN 'sourcing' THEN 2
         WHEN 'lga_coverage_missing' THEN 3
         ELSE 4
       END,
       a.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map(mapAlertRow);
};

exports.reviewTenantPropertyRequest = async ({
  alertId,
  reviewer,
  decision,
  note = '',
  assignedAdminId = null,
}) => {
  await ensureAlertSchema();

  const normalizedDecision = String(decision || '').trim().toLowerCase();
  if (!['approved', 'rejected'].includes(normalizedDecision)) {
    const error = new Error('Decision must be approved or rejected');
    error.statusCode = 400;
    throw error;
  }

  const alertResult = await db.query(
    `SELECT a.*, s.state_name
     FROM tenant_property_alerts a
     LEFT JOIN states s ON s.id = a.state_id
     WHERE a.id = $1
     LIMIT 1`,
    [alertId]
  );
  const alert = alertResult.rows[0];

  if (!alert) {
    const error = new Error('Property request not found');
    error.statusCode = 404;
    throw error;
  }

  if (String(alert.workflow_status || '') !== 'pending_support_review') {
    const error = new Error('Only pending support review requests can be reviewed');
    error.statusCode = 400;
    throw error;
  }

  const reviewerRole = String(reviewer?.user_type || '').trim().toLowerCase();
  if (reviewerRole === 'state_support_admin') {
    const assignedState = normalizeState(reviewer.assigned_state);
    if (!assignedState || assignedState !== normalizeState(alert.state_name)) {
      const error = new Error('This request is outside your assigned state');
      error.statusCode = 403;
      throw error;
    }
  } else if (!['super_support_admin', 'super_admin'].includes(reviewerRole)) {
    const error = new Error('Support admin access required');
    error.statusCode = 403;
    throw error;
  }

  if (normalizedDecision === 'rejected') {
    const result = await db.query(
      `UPDATE tenant_property_alerts
       SET workflow_status = 'rejected',
           is_active = FALSE,
           support_note = $2,
           support_reviewed_by = $3,
           support_reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [alertId, note || null, reviewer.id]
    );

    return mapAlertRow(result.rows[0]);
  }

  let assignedAdmin = null;
  if (assignedAdminId) {
    const adminResult = await db.query(
      `SELECT id, full_name, email, user_type, assigned_state, assigned_city
       FROM users
       WHERE id = $1
         AND is_active IS DISTINCT FROM FALSE
         AND user_type IN ('state_admin', 'state_financial_admin', 'admin')
       LIMIT 1`,
      [assignedAdminId]
    );
    assignedAdmin = adminResult.rows[0] || null;

    if (!assignedAdmin || normalizeState(assignedAdmin.assigned_state) !== normalizeState(alert.state_name)) {
      const error = new Error('Assigned admin must belong to the requested state');
      error.statusCode = 400;
      throw error;
    }
  } else {
    assignedAdmin = await findAutoAssignableStateAdmin(alert.state_name, alert.lga_name);
  }

  const result = await db.query(
    `UPDATE tenant_property_alerts
     SET workflow_status = 'approved_assigned',
         is_active = TRUE,
         support_note = $2,
         support_reviewed_by = $3,
         support_reviewed_at = NOW(),
         assigned_state_admin_id = $4,
         assigned_at = NOW(),
         state_admin_status = COALESCE(state_admin_status, 'assigned')
     WHERE id = $1
     RETURNING *`,
    [alertId, note || null, reviewer.id, assignedAdmin?.id || null]
  );

  if (assignedAdmin?.email) {
    sendEmail({
      to: assignedAdmin.email,
      subject: 'New tenant property request assigned',
      html: `
        <p>Hello ${assignedAdmin.full_name || 'Admin'},</p>
        <p>A tenant property request has been approved for your state.</p>
        <p><strong>Location:</strong> ${alert.state_name || 'Unknown state'}${alert.lga_name ? `, ${alert.lga_name}` : ''}</p>
        <p><strong>Property type:</strong> ${alert.property_type}</p>
        <p>Please open your dashboard and begin sourcing or posting a matching property.</p>
      `,
    }).catch((error) => {
      console.error('Property request assignment email failed:', error.message);
    });
  }

  return mapAlertRow(result.rows[0]);
};

exports.updateTenantPropertyRequestStateAction = async ({
  alertId,
  actor,
  action,
  note = '',
}) => {
  await ensureAlertSchema();

  const normalizedAction = String(action || '').trim().toLowerCase();
  const actionMap = {
    sourcing: {
      workflow_status: 'sourcing',
      state_admin_status: 'sourcing',
      is_active: true,
    },
    lga_missing: {
      workflow_status: 'lga_coverage_missing',
      state_admin_status: 'lga_coverage_missing',
      is_active: true,
    },
    fulfilled: {
      workflow_status: 'fulfilled',
      state_admin_status: 'fulfilled',
      is_active: false,
    },
  };
  const next = actionMap[normalizedAction];

  if (!next) {
    const error = new Error('Unsupported request action');
    error.statusCode = 400;
    throw error;
  }

  const alertResult = await db.query(
    `SELECT a.*, s.state_name
     FROM tenant_property_alerts a
     LEFT JOIN states s ON s.id = a.state_id
     WHERE a.id = $1
     LIMIT 1`,
    [alertId]
  );
  const alert = alertResult.rows[0];

  if (!alert) {
    const error = new Error('Property request not found');
    error.statusCode = 404;
    throw error;
  }

  const actorRole = String(actor?.user_type || '').trim().toLowerCase();
  if (!['state_admin', 'state_financial_admin', 'admin'].includes(actorRole)) {
    const error = new Error('State admin access required');
    error.statusCode = 403;
    throw error;
  }

  if (normalizeState(actor.assigned_state) !== normalizeState(alert.state_name)) {
    const error = new Error('This request is outside your assigned state');
    error.statusCode = 403;
    throw error;
  }

  if (actorRole === 'admin' && actor.assigned_city && normalizeState(actor.assigned_city) !== normalizeState(alert.lga_name)) {
    const error = new Error('This request is outside your assigned LGA');
    error.statusCode = 403;
    throw error;
  }

  const result = await db.query(
    `UPDATE tenant_property_alerts
     SET workflow_status = $2,
         state_admin_status = $3,
         state_admin_note = $4,
         state_admin_updated_by = $5,
         state_admin_updated_at = NOW(),
         lga_coverage_missing_at = CASE WHEN $3 = 'lga_coverage_missing' THEN NOW() ELSE lga_coverage_missing_at END,
         fulfilled_at = CASE WHEN $3 = 'fulfilled' THEN NOW() ELSE fulfilled_at END,
         notified_at = CASE WHEN $3 = 'fulfilled' AND notified_at IS NULL THEN NOW() ELSE notified_at END,
         is_active = $6
     WHERE id = $1
     RETURNING *`,
    [
      alertId,
      next.workflow_status,
      next.state_admin_status,
      note || null,
      actor.id,
      next.is_active,
    ]
  );

  const updatedRequest = {
    ...alert,
    ...result.rows[0],
  };

  if (normalizedAction === 'fulfilled' && !alert.notified_at) {
    await sendManualFulfillmentNotification(updatedRequest, note);
  }

  return mapAlertRow(result.rows[0]);
};

exports.listAssignableAdminsForPropertyRequest = async ({ viewer, stateName = null } = {}) => {
  await ensureAlertSchema();

  const viewerRole = String(viewer?.user_type || '').trim().toLowerCase();
  const params = [];
  const where = [
    `is_active IS DISTINCT FROM FALSE`,
    `user_type IN ('state_admin', 'state_financial_admin', 'admin')`,
  ];

  if (stateName) {
    params.push(String(stateName).trim());
    where.push(`LOWER(COALESCE(assigned_state, '')) = LOWER($${params.length})`);
  } else if (viewerRole === 'state_support_admin') {
    params.push(String(viewer.assigned_state || '').trim());
    where.push(`LOWER(COALESCE(assigned_state, '')) = LOWER($${params.length})`);
  }

  const result = await db.query(
    `SELECT id, full_name, email, user_type, assigned_state, assigned_city
     FROM users
     WHERE ${where.join(' AND ')}
     ORDER BY assigned_state ASC, assigned_city ASC NULLS LAST, user_type ASC, full_name ASC`,
    params
  );

  return result.rows;
};
