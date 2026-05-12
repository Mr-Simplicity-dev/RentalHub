const db = require('../middleware/database');
const { getLocationPricingQuote } = require('./locationPricing');
const { normalizeLgaKey, resolveLocationSelection } = require('./locationDirectory');

const TENANT_LOCATION_ACCESS_TARGET = 'tenant_location_access';
const TENANT_LOCATION_ACCESS_DAYS =
  Math.max(Number(process.env.TENANT_LOCATION_ACCESS_DAYS || 30), 1);

let tenantLocationAccessSchemaReady = false;

const ensureTenantLocationAccessSchema = async () => {
  if (tenantLocationAccessSchemaReady) return;

  await db.query(`
    ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS payments_payment_type_check;

    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_type_check
      CHECK (
        payment_type IN (
          'tenant_subscription',
          'tenant_multiple_property_subscription',
          'landlord_subscription',
          'landlord_listing',
          'rent_payment',
          'property_unlock',
          'general_platform_fee',
          'registration_fee',
          'wallet_funding',
          'tenant_property_alert',
          'tenant_location_access',
          'evidence_verification',
          'lawyer_directory_unlock',
          'lawyer_access_fee',
          'agent_access_fee',
          'transportation_booking'
        )
      );

    CREATE TABLE IF NOT EXISTS tenant_location_access_payments (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      state_name VARCHAR(120),
      lga_name VARCHAR(120),
      location_key VARCHAR(160) NOT NULL DEFAULT '',
      amount NUMERIC(12,2) NOT NULL,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120) NOT NULL UNIQUE,
      payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      gateway_response JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      expires_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_location_access_payments_reference
      ON tenant_location_access_payments(transaction_reference);

    CREATE TABLE IF NOT EXISTS tenant_location_access_grants (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      state_name VARCHAR(120),
      lga_name VARCHAR(120),
      location_key VARCHAR(160) NOT NULL DEFAULT '',
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120),
      granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      UNIQUE (tenant_id, state_id, location_key)
    );

    CREATE INDEX IF NOT EXISTS idx_tenant_location_access_grants_lookup
      ON tenant_location_access_grants(tenant_id, state_id, location_key, expires_at);
  `);

  tenantLocationAccessSchemaReady = true;
};

const getTenantLocationProfile = async (tenantId) => {
  const result = await db.query(
    `SELECT u.id, u.preferred_state_id, u.preferred_lga_name, s.state_name
     FROM users u
     LEFT JOIN states s ON s.id = u.preferred_state_id
     WHERE u.id = $1
     LIMIT 1`,
    [tenantId]
  );

  return result.rows[0] || null;
};

const normalizeLocationKey = (lgaName) =>
  lgaName ? normalizeLgaKey(lgaName) : '';

const getActiveTenantLocationGrant = async ({
  tenantId,
  stateId,
  lgaName = null,
}) => {
  await ensureTenantLocationAccessSchema();

  const locationKey = normalizeLocationKey(lgaName);
  const result = await db.query(
    `SELECT *
     FROM tenant_location_access_grants
     WHERE tenant_id = $1
       AND state_id = $2
       AND location_key = $3
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tenantId, stateId, locationKey]
  );

  if (result.rows.length) {
    return result.rows[0];
  }

  if (locationKey) {
    const stateGrant = await db.query(
      `SELECT *
       FROM tenant_location_access_grants
       WHERE tenant_id = $1
         AND state_id = $2
         AND location_key = ''
         AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [tenantId, stateId]
    );

    return stateGrant.rows[0] || null;
  }

  return null;
};

const buildLocationPaymentPayload = async ({ stateId, lgaName = null }) => {
  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });
  const quote = await getLocationPricingQuote({
    appliesTo: TENANT_LOCATION_ACCESS_TARGET,
    stateId: resolvedLocation.state_id,
    lgaName: resolvedLocation.lga_name,
  });

  return {
    ...quote,
    location: resolvedLocation,
    access_days: TENANT_LOCATION_ACCESS_DAYS,
  };
};

const sameTenantHomeLocation = (profile, location) => {
  const homeStateId = Number(profile?.preferred_state_id);
  const requestedStateId = Number(location?.state_id);

  if (!homeStateId || homeStateId !== requestedStateId) {
    return false;
  }

  const homeLgaKey = normalizeLocationKey(profile?.preferred_lga_name);
  const requestedLgaKey = normalizeLocationKey(location?.lga_name);

  return homeLgaKey && homeLgaKey === requestedLgaKey;
};

const resolveTenantPropertyLocationAccess = async ({
  tenantId,
  requestedStateId = null,
  requestedLgaName = null,
}) => {
  await ensureTenantLocationAccessSchema();

  const profile = await getTenantLocationProfile(tenantId);

  if (!profile?.preferred_state_id || !String(profile?.preferred_lga_name || '').trim()) {
    const error = new Error('Complete your registered state and LGA before browsing properties.');
    error.statusCode = 403;
    error.code = 'TENANT_LOCATION_PROFILE_REQUIRED';
    throw error;
  }

  const hasRequestedState = Number.isFinite(Number.parseInt(requestedStateId, 10));
  const targetLocation = hasRequestedState
    ? await resolveLocationSelection({
        stateId: requestedStateId,
        lgaName: requestedLgaName,
        requireLga: false,
      })
    : await resolveLocationSelection({
        stateId: profile.preferred_state_id,
        lgaName: profile.preferred_lga_name,
        requireLga: true,
      });

  if (sameTenantHomeLocation(profile, targetLocation)) {
    return {
      allowed: true,
      payment_required: false,
      source: 'home_location',
      location: targetLocation,
      profile,
    };
  }

  const grant = await getActiveTenantLocationGrant({
    tenantId,
    stateId: targetLocation.state_id,
    lgaName: targetLocation.lga_name,
  });

  if (grant) {
    return {
      allowed: true,
      payment_required: false,
      source: 'paid_location_access',
      location: targetLocation,
      profile,
      grant,
    };
  }

  const quote = await buildLocationPaymentPayload({
    stateId: targetLocation.state_id,
    lgaName: targetLocation.lga_name,
  });

  return {
    allowed: false,
    payment_required: true,
    code: 'LOCATION_ACCESS_PAYMENT_REQUIRED',
    message: `Pay N${Number(quote.amount).toLocaleString()} to browse properties in ${
      targetLocation.lga_name || targetLocation.state_name
    }.`,
    location: targetLocation,
    profile,
    quote,
  };
};

const createTenantLocationAccessPayment = async ({
  tenantId,
  stateId,
  lgaName = null,
  amount,
  paymentId,
  transactionReference,
}) => {
  await ensureTenantLocationAccessSchema();

  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });

  const result = await db.query(
    `INSERT INTO tenant_location_access_payments (
       tenant_id, state_id, state_name, lga_name, location_key,
       amount, payment_id, transaction_reference, payment_status,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending',
             CURRENT_TIMESTAMP + ($9::int * INTERVAL '1 day'))
     RETURNING *`,
    [
      tenantId,
      resolvedLocation.state_id,
      resolvedLocation.state_name,
      resolvedLocation.lga_name,
      resolvedLocation.location_key,
      amount,
      paymentId,
      transactionReference,
      TENANT_LOCATION_ACCESS_DAYS,
    ]
  );

  return result.rows[0];
};

const getTenantLocationAccessPaymentByReference = async (reference, tenantId) => {
  await ensureTenantLocationAccessSchema();

  const result = await db.query(
    `SELECT *
     FROM tenant_location_access_payments
     WHERE transaction_reference = $1
       AND tenant_id = $2
     LIMIT 1`,
    [reference, tenantId]
  );

  return result.rows[0] || null;
};

const grantTenantLocationAccess = async ({
  tenantId,
  stateId,
  stateName,
  lgaName = null,
  locationKey = '',
  paymentId,
  transactionReference,
  gatewayResponse,
}) => {
  await ensureTenantLocationAccessSchema();

  const expiresAtSql = `CURRENT_TIMESTAMP + ($8::int * INTERVAL '1 day')`;
  const params = [
    tenantId,
    stateId,
    stateName,
    lgaName,
    locationKey || '',
    paymentId,
    transactionReference,
    TENANT_LOCATION_ACCESS_DAYS,
    gatewayResponse ? JSON.stringify(gatewayResponse) : null,
  ];

  const result = await db.query(
    `INSERT INTO tenant_location_access_grants (
       tenant_id, state_id, state_name, lga_name, location_key,
       payment_id, transaction_reference, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${expiresAtSql})
     ON CONFLICT (tenant_id, state_id, location_key)
     DO UPDATE SET
       state_name = EXCLUDED.state_name,
       lga_name = EXCLUDED.lga_name,
       payment_id = EXCLUDED.payment_id,
       transaction_reference = EXCLUDED.transaction_reference,
       granted_at = CURRENT_TIMESTAMP,
       expires_at = EXCLUDED.expires_at
     RETURNING *`,
    params.slice(0, 8)
  );

  await db.query(
    `UPDATE tenant_location_access_payments
     SET payment_status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         gateway_response = COALESCE($2::jsonb, gateway_response)
     WHERE transaction_reference = $1`,
    [transactionReference, params[8]]
  );

  return result.rows[0];
};

module.exports = {
  TENANT_LOCATION_ACCESS_DAYS,
  TENANT_LOCATION_ACCESS_TARGET,
  buildLocationPaymentPayload,
  createTenantLocationAccessPayment,
  ensureTenantLocationAccessSchema,
  getTenantLocationAccessPaymentByReference,
  grantTenantLocationAccess,
  resolveTenantPropertyLocationAccess,
};
