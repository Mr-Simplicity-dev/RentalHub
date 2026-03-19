const db = require('../middleware/database');
const { resolveLocationSelection } = require('./locationDirectory');

const PRICING_TARGETS = {
  tenant_registration: {
    key: 'tenant_registration',
    label: 'Tenant Registration',
    base_amount: 2500,
  },
  landlord_registration: {
    key: 'landlord_registration',
    label: 'Landlord Registration',
    base_amount: 5000,
  },
  property_alert_request: {
    key: 'property_alert_request',
    label: 'Property Alert Request',
    base_amount: 5000,
  },
};

let locationPricingSchemaReady = false;

const ensureLocationPricingSchema = async () => {
  if (locationPricingSchemaReady) {
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS location_pricing_rules (
      id SERIAL PRIMARY KEY,
      applies_to VARCHAR(50) NOT NULL CHECK (
        applies_to IN (
          'tenant_registration',
          'landlord_registration',
          'property_alert_request'
        )
      ),
      state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      lga_name VARCHAR(120),
      location_key VARCHAR(160) NOT NULL DEFAULT '',
      amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT location_pricing_rules_scope_check CHECK (
        (location_key = '' AND lga_name IS NULL) OR
        (location_key <> '' AND lga_name IS NOT NULL)
      ),
      CONSTRAINT location_pricing_rules_unique_scope UNIQUE (
        applies_to,
        state_id,
        location_key
      )
    );

    CREATE INDEX IF NOT EXISTS idx_location_pricing_rules_lookup
      ON location_pricing_rules(applies_to, state_id, location_key, is_active);
  `);

  locationPricingSchemaReady = true;
};

const getPricingTargets = () =>
  Object.values(PRICING_TARGETS).map((target) => ({ ...target }));

const getBaseAmountForTarget = (appliesTo) => {
  const target = PRICING_TARGETS[appliesTo];

  if (!target) {
    const error = new Error('Unsupported pricing target');
    error.statusCode = 400;
    throw error;
  }

  return target.base_amount;
};

const parseAmount = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Amount must be greater than zero');
    error.statusCode = 400;
    throw error;
  }

  return amount;
};

const mapPricingRuleRow = (row) => ({
  ...row,
  amount: Number(row.amount),
});

const getLocationPricingQuote = async ({
  appliesTo,
  stateId = null,
  lgaName = null,
}) => {
  await ensureLocationPricingSchema();

  const baseAmount = getBaseAmountForTarget(appliesTo);
  const hasState = Number.isFinite(Number.parseInt(stateId, 10));
  const hasLga = Boolean(String(lgaName || '').trim());

  let resolvedLocation = null;

  if (hasState) {
    try {
      resolvedLocation = await resolveLocationSelection({
        stateId,
        lgaName,
        requireLga: false,
      });
    } catch (error) {
      resolvedLocation = null;
    }
  }

  if (resolvedLocation?.location_key) {
    const lgaRuleResult = await db.query(
      `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
              r.location_key, r.amount, r.is_active, r.created_at, r.updated_at
       FROM location_pricing_rules r
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
        applies_to: appliesTo,
        base_amount: baseAmount,
        amount: Number(lgaRuleResult.rows[0].amount),
        rule_scope: 'lga',
        location_complete: hasState && hasLga,
        matched_rule: mapPricingRuleRow(lgaRuleResult.rows[0]),
      };
    }
  }

  if (resolvedLocation?.state_id) {
    const stateRuleResult = await db.query(
      `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
              r.location_key, r.amount, r.is_active, r.created_at, r.updated_at
       FROM location_pricing_rules r
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
        applies_to: appliesTo,
        base_amount: baseAmount,
        amount: Number(stateRuleResult.rows[0].amount),
        rule_scope: 'state',
        location_complete: hasState && hasLga,
        matched_rule: mapPricingRuleRow(stateRuleResult.rows[0]),
      };
    }
  }

  return {
    applies_to: appliesTo,
    base_amount: baseAmount,
    amount: baseAmount,
    rule_scope: 'base',
    location_complete: hasState && hasLga,
    matched_rule: null,
  };
};

const listLocationPricingRules = async () => {
  await ensureLocationPricingSchema();

  const result = await db.query(
    `SELECT r.id, r.applies_to, r.state_id, s.state_name, r.lga_name,
            r.location_key, r.amount, r.is_active, r.created_at, r.updated_at
     FROM location_pricing_rules r
     JOIN states s ON s.id = r.state_id
     ORDER BY r.applies_to ASC, s.state_name ASC, r.location_key ASC, r.created_at DESC`
  );

  return result.rows.map(mapPricingRuleRow);
};

const createLocationPricingRule = async ({
  appliesTo,
  stateId,
  lgaName = null,
  amount,
  isActive = true,
}) => {
  await ensureLocationPricingSchema();
  getBaseAmountForTarget(appliesTo);

  const parsedAmount = parseAmount(amount);
  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });

  const result = await db.query(
    `INSERT INTO location_pricing_rules (
       applies_to,
       state_id,
       lga_name,
       location_key,
       amount,
       is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, applies_to, state_id, lga_name, location_key, amount, is_active, created_at, updated_at`,
    [
      appliesTo,
      resolvedLocation.state_id,
      resolvedLocation.lga_name,
      resolvedLocation.location_key,
      parsedAmount,
      isActive === true,
    ]
  );

  const createdRule = result.rows[0];
  return {
    ...mapPricingRuleRow(createdRule),
    state_name: resolvedLocation.state_name,
  };
};

const updateLocationPricingRule = async (
  ruleId,
  { appliesTo, stateId, lgaName = null, amount, isActive }
) => {
  await ensureLocationPricingSchema();
  getBaseAmountForTarget(appliesTo);

  const parsedAmount = parseAmount(amount);
  const resolvedLocation = await resolveLocationSelection({
    stateId,
    lgaName,
    requireLga: false,
  });

  const result = await db.query(
    `UPDATE location_pricing_rules
     SET applies_to = $2,
         state_id = $3,
         lga_name = $4,
         location_key = $5,
         amount = $6,
         is_active = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, applies_to, state_id, lga_name, location_key, amount, is_active, created_at, updated_at`,
    [
      ruleId,
      appliesTo,
      resolvedLocation.state_id,
      resolvedLocation.lga_name,
      resolvedLocation.location_key,
      parsedAmount,
      isActive === true,
    ]
  );

  if (!result.rows.length) {
    const error = new Error('Pricing rule not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...mapPricingRuleRow(result.rows[0]),
    state_name: resolvedLocation.state_name,
  };
};

const deleteLocationPricingRule = async (ruleId) => {
  await ensureLocationPricingSchema();

  const result = await db.query(
    `DELETE FROM location_pricing_rules
     WHERE id = $1
     RETURNING id`,
    [ruleId]
  );

  if (!result.rows.length) {
    const error = new Error('Pricing rule not found');
    error.statusCode = 404;
    throw error;
  }
};

module.exports = {
  PRICING_TARGETS,
  createLocationPricingRule,
  deleteLocationPricingRule,
  ensureLocationPricingSchema,
  getBaseAmountForTarget,
  getLocationPricingQuote,
  getPricingTargets,
  listLocationPricingRules,
  updateLocationPricingRule,
};
