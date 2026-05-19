const db = require('../middleware/database');
const { resolveLocationSelection } = require('./locationDirectory');

const REGISTRATION_TARGETS = {
  tenant: {
    key: 'tenant',
    label: 'Tenant Registration',
  },
  landlord: {
    key: 'landlord',
    label: 'Landlord Registration',
  },
};

let registrationAccessSchemaReady = false;

const ensureRegistrationAccessSchema = async () => {
  if (registrationAccessSchemaReady) {
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS location_registration_access_rules (
      id SERIAL PRIMARY KEY,
      applies_to VARCHAR(20) NOT NULL CHECK (applies_to IN ('tenant', 'landlord')),
      state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      lga_name VARCHAR(120),
      location_key VARCHAR(160) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT location_registration_access_rules_scope_check CHECK (
        (location_key = '' AND lga_name IS NULL) OR
        (location_key <> '' AND lga_name IS NOT NULL)
      ),
      CONSTRAINT location_registration_access_rules_unique_scope UNIQUE (
        applies_to,
        state_id,
        location_key
      )
    );

    CREATE INDEX IF NOT EXISTS idx_location_registration_access_rules_lookup
      ON location_registration_access_rules(applies_to, state_id, location_key, is_active);
  `);

  registrationAccessSchemaReady = true;
};

const normalizeRegistrationUserType = (userType) => {
  const normalized = String(userType || '').trim().toLowerCase();

  if (!REGISTRATION_TARGETS[normalized]) {
    const error = new Error('Registration access target must be tenant or landlord');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const isRegistrationMasterEnabled = (flags = {}) =>
  flags.allow_registration !== false;

const isGlobalRegistrationEnabled = (flags = {}, userType) => {
  if (!isRegistrationMasterEnabled(flags)) {
    return false;
  }

  const appliesTo = normalizeRegistrationUserType(userType);

  if (appliesTo === 'tenant') {
    return flags.allow_tenant_registration !== false;
  }

  return flags.allow_landlord_registration !== false;
};

const mapRegistrationAccessRuleRow = (row) => ({
  ...row,
  is_active: row.is_active === true,
});

const countActiveRegistrationAccessRules = async (appliesTo) => {
  await ensureRegistrationAccessSchema();

  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM location_registration_access_rules
     WHERE applies_to = $1
       AND is_active = TRUE`,
    [appliesTo]
  );

  return Number(result.rows[0]?.count || 0);
};

const findMatchingRegistrationAccessRule = async ({
  appliesTo,
  stateId = null,
  lgaName = null,
}) => {
  await ensureRegistrationAccessSchema();

  const hasState = Number.isFinite(Number.parseInt(stateId, 10));
  const hasLga = Boolean(String(lgaName || '').trim());

  if (!hasState) {
    return null;
  }

  let resolvedLocation = null;

  try {
    resolvedLocation = await resolveLocationSelection({
      stateId,
      lgaName,
      requireLga: false,
    });
  } catch {
    return null;
  }

  if (resolvedLocation?.location_key) {
    const lgaRuleResult = await db.query(
      `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
              r.location_key, r.is_active, r.created_at, r.updated_at
       FROM location_registration_access_rules r
       JOIN states s ON s.id = r.state_id
       WHERE r.applies_to = $1
         AND r.state_id = $2
         AND r.location_key = $3
         AND r.is_active = TRUE
       LIMIT 1`,
      [appliesTo, resolvedLocation.state_id, resolvedLocation.location_key]
    );

    if (lgaRuleResult.rows.length) {
      return {
        rule_scope: 'lga',
        matched_rule: mapRegistrationAccessRuleRow(lgaRuleResult.rows[0]),
      };
    }
  }

  if (resolvedLocation?.state_id) {
    const stateRuleResult = await db.query(
      `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
              r.location_key, r.is_active, r.created_at, r.updated_at
       FROM location_registration_access_rules r
       JOIN states s ON s.id = r.state_id
       WHERE r.applies_to = $1
         AND r.state_id = $2
         AND r.location_key = ''
         AND r.is_active = TRUE
       LIMIT 1`,
      [appliesTo, resolvedLocation.state_id]
    );

    if (stateRuleResult.rows.length) {
      return {
        rule_scope: 'state',
        matched_rule: mapRegistrationAccessRuleRow(stateRuleResult.rows[0]),
      };
    }
  }

  return null;
};

const evaluateRegistrationAccess = async ({
  userType,
  flags = {},
  stateId = null,
  lgaName = null,
}) => {
  const appliesTo = normalizeRegistrationUserType(userType);
  const globalEnabled = isGlobalRegistrationEnabled(flags, appliesTo);
  const roleLabel = appliesTo === 'tenant' ? 'Tenant' : 'Landlord';

  if (!globalEnabled) {
    return {
      allowed: false,
      applies_to: appliesTo,
      global_enabled: false,
      location_restricted: false,
      active_rule_count: 0,
      rule_scope: 'denied',
      reason: 'role_disabled',
      message: `${roleLabel} registration is currently disabled`,
    };
  }

  const activeRuleCount = await countActiveRegistrationAccessRules(appliesTo);

  if (activeRuleCount === 0) {
    return {
      allowed: true,
      applies_to: appliesTo,
      global_enabled: true,
      location_restricted: false,
      active_rule_count: 0,
      rule_scope: 'global',
      matched_rule: null,
    };
  }

  const hasState = Number.isFinite(Number.parseInt(stateId, 10));
  const hasLga = Boolean(String(lgaName || '').trim());

  if (!hasState) {
    return {
      allowed: false,
      applies_to: appliesTo,
      global_enabled: true,
      location_restricted: true,
      active_rule_count: activeRuleCount,
      rule_scope: 'pending_location',
      reason: 'location_required',
      message:
        'Select your state and local government area to confirm registration is available in your location',
      matched_rule: null,
    };
  }

  const match = await findMatchingRegistrationAccessRule({
    appliesTo,
    stateId,
    lgaName,
  });

  if (match) {
    return {
      allowed: true,
      applies_to: appliesTo,
      global_enabled: true,
      location_restricted: true,
      active_rule_count: activeRuleCount,
      rule_scope: match.rule_scope,
      matched_rule: match.matched_rule,
    };
  }

  return {
    allowed: false,
    applies_to: appliesTo,
    global_enabled: true,
    location_restricted: true,
    active_rule_count: activeRuleCount,
    rule_scope: 'denied',
    reason: 'location_not_allowed',
    message: `${roleLabel} registration is not available for the selected location`,
    matched_rule: null,
  };
};

const getRegistrationAccessTargets = () =>
  Object.values(REGISTRATION_TARGETS).map((target) => ({ ...target }));

const listRegistrationAccessRules = async () => {
  await ensureRegistrationAccessSchema();

  const result = await db.query(
    `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
            r.location_key, r.is_active, r.created_at, r.updated_at
     FROM location_registration_access_rules r
     JOIN states s ON s.id = r.state_id
     ORDER BY r.applies_to ASC, s.state_name ASC, r.location_key ASC, r.created_at DESC`
  );

  return result.rows.map(mapRegistrationAccessRuleRow);
};

const createRegistrationAccessRule = async ({
  appliesTo,
  stateId,
  lgaName = null,
  isActive = true,
}) => {
  await ensureRegistrationAccessSchema();
  normalizeRegistrationUserType(appliesTo);

  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });

  const result = await db.query(
    `INSERT INTO location_registration_access_rules (
       applies_to,
       state_id,
       lga_name,
       location_key,
       is_active
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, applies_to, state_id, lga_name, location_key, is_active, created_at, updated_at`,
    [
      appliesTo,
      resolvedLocation.state_id,
      resolvedLocation.lga_name,
      resolvedLocation.location_key,
      isActive === true,
    ]
  );

  return {
    ...mapRegistrationAccessRuleRow(result.rows[0]),
    state_name: resolvedLocation.state_name,
  };
};

const updateRegistrationAccessRule = async (
  ruleId,
  { appliesTo, stateId, lgaName = null, isActive }
) => {
  await ensureRegistrationAccessSchema();
  normalizeRegistrationUserType(appliesTo);

  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });

  const result = await db.query(
    `UPDATE location_registration_access_rules
     SET applies_to = $2,
         state_id = $3,
         lga_name = $4,
         location_key = $5,
         is_active = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, applies_to, state_id, lga_name, location_key, is_active, created_at, updated_at`,
    [
      ruleId,
      appliesTo,
      resolvedLocation.state_id,
      resolvedLocation.lga_name,
      resolvedLocation.location_key,
      isActive === true,
    ]
  );

  if (!result.rows.length) {
    const error = new Error('Registration access rule not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...mapRegistrationAccessRuleRow(result.rows[0]),
    state_name: resolvedLocation.state_name,
  };
};

const deleteRegistrationAccessRule = async (ruleId) => {
  await ensureRegistrationAccessSchema();

  const result = await db.query(
    `DELETE FROM location_registration_access_rules
     WHERE id = $1
     RETURNING id`,
    [ruleId]
  );

  if (!result.rows.length) {
    const error = new Error('Registration access rule not found');
    error.statusCode = 404;
    throw error;
  }
};

const assertRegistrationAllowed = async ({
  userType,
  flags,
  stateId = null,
  lgaName = null,
}) => {
  const access = await evaluateRegistrationAccess({
    userType,
    flags,
    stateId,
    lgaName,
  });

  if (!access.allowed) {
    const error = new Error(access.message || 'Registration disabled');
    error.statusCode = 403;
    error.data = access;
    throw error;
  }

  return access;
};

module.exports = {
  REGISTRATION_TARGETS,
  assertRegistrationAllowed,
  countActiveRegistrationAccessRules,
  createRegistrationAccessRule,
  deleteRegistrationAccessRule,
  ensureRegistrationAccessSchema,
  evaluateRegistrationAccess,
  getRegistrationAccessTargets,
  isGlobalRegistrationEnabled,
  isRegistrationMasterEnabled,
  listRegistrationAccessRules,
  normalizeRegistrationUserType,
  updateRegistrationAccessRule,
};
