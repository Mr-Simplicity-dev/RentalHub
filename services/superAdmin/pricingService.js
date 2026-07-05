const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { logAction } = require('./schemaHelpers');
const {
  DEFAULT_FEATURE_FLAGS,
  ensureFeatureFlagsTable,
  syncDefaultFeatureFlags,
} = require('../../config/middleware/featureFlags');
const { getLocationOptions } = require('../../config/utils/locationDirectory');
const {
  createLocationPricingRule,
  deleteLocationPricingRule,
  getPricingTargets,
  listLocationPricingRules,
  updateLocationPricingRule,
} = require('../../config/utils/locationPricing');
const {
  createRegistrationAccessRule,
  deleteRegistrationAccessRule,
  getRegistrationAccessTargets,
  listRegistrationAccessRules,
  updateRegistrationAccessRule,
} = require('../../config/utils/registrationAccess');

// feature flags
const ensureFeatureFlagOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS feature_flag_operations (
      id SERIAL PRIMARY KEY,
      flag_key VARCHAR(100) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      previous_enabled BOOLEAN,
      new_enabled BOOLEAN,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feature_flag_operations_key
      ON feature_flag_operations(flag_key, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feature_flag_operations_created
      ON feature_flag_operations(created_at DESC)
  `);
};

const createFeatureFlagOperation = async ({
  flagKey,
  actor,
  eventType,
  note,
  previousEnabled,
  newEnabled,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO feature_flag_operations (
       flag_key, actor_id, actor_name, event_type, note, previous_enabled, new_enabled, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      flagKey,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      typeof previousEnabled === 'boolean' ? previousEnabled : null,
      typeof newEnabled === 'boolean' ? newEnabled : null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getFeatureFlags = async (req, res) => {
  try {
    await ensureFeatureFlagsTable({ syncDefaults: true });
    await ensureFeatureFlagOperationSchema();

    const { rows } = await db.query(
      `SELECT ff.*,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM feature_flags ff
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, previous_enabled, new_enabled, metadata, created_at
           FROM feature_flag_operations
           WHERE flag_key = ff.key
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY ff.key`
    );
    const flagMap = new Map(
      DEFAULT_FEATURE_FLAGS.map((flag) => [flag.key, { ...flag }])
    );

    rows.forEach((row) => {
      flagMap.set(row.key, {
        ...(flagMap.get(row.key) || {}),
        ...row,
      });
    });

    const flags = Array.from(flagMap.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );

    res.json({ success: true, flags });
  } catch {
    res.status(500).json({ message: 'Failed to load flags' });
  }
};

const updateFeatureFlag = async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensureFeatureFlagsTable();
    await ensureFeatureFlagOperationSchema();
    await syncDefaultFeatureFlags();

    if (!reason) {
      return res.status(400).json({ message: 'A feature flag change reason is required' });
    }

    const defaultFlag = DEFAULT_FEATURE_FLAGS.find((flag) => flag.key === key);
    const existing = await db.query(`SELECT key, enabled, description FROM feature_flags WHERE key = $1`, [key]);
    const previousEnabled = existing.rows.length
      ? existing.rows[0].enabled
      : defaultFlag
        ? defaultFlag.enabled
        : null;
    let result;

    if (defaultFlag) {
      result = await db.query(
        `INSERT INTO feature_flags (key, enabled, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
         RETURNING key, enabled, description`,
        [key, enabled, defaultFlag.description]
      );
    } else {
      result = await db.query(
        `UPDATE feature_flags SET enabled = $1, updated_at = NOW() WHERE key = $2 RETURNING key, enabled, description`,
        [enabled, key]
      );
    }

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Feature flag not found' });
    }

    await createFeatureFlagOperation({
      flagKey: key,
      actor: req.user,
      eventType: enabled ? 'feature_flag_enabled' : 'feature_flag_disabled',
      note: reason,
      previousEnabled,
      newEnabled: !!enabled,
      metadata: {
        description: result.rows[0].description || defaultFlag?.description || null,
      },
    });

    await logAction(req.user.id, `TOGGLE_FLAG_${key}`, 'feature_flag', null);

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Failed to update flag' });
  }
};

const getPricingRules = async (req, res) => {
  try {
    await ensurePricingRuleOperationSchema();
    const [rules, locations] = await Promise.all([
      listLocationPricingRules(),
      getLocationOptions(),
    ]);

    const rulesWithOperations = await attachPricingRuleOperations(rules);

    res.json({
      success: true,
      data: {
        rules: rulesWithOperations,
        targets: getPricingTargets(),
        locations,
      },
    });
  } catch (error) {
    req.logger.error(error);
    res.status(500).json({ message: 'Failed to load pricing rules' });
  }
};

const ensurePricingRuleOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pricing_rule_operations (
      id SERIAL PRIMARY KEY,
      pricing_rule_id INTEGER,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pricing_rule_operations_rule
      ON pricing_rule_operations(pricing_rule_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_pricing_rule_operations_created
      ON pricing_rule_operations(created_at DESC);
  `);
};

const createPricingRuleOperation = async ({
  pricingRuleId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO pricing_rule_operations (
       pricing_rule_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      pricingRuleId || null,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const attachPricingRuleOperations = async (rules = []) => {
  if (!rules.length) return rules;

  const ruleIds = rules.map((rule) => Number(rule.id)).filter(Boolean);
  if (!ruleIds.length) return rules;

  const { rows } = await db.query(
    `SELECT pricing_rule_id,
            json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
     FROM (
       SELECT id, pricing_rule_id, actor_id, actor_name, event_type, note, metadata, created_at
       FROM pricing_rule_operations
       WHERE pricing_rule_id = ANY($1::int[])
       ORDER BY created_at DESC, id DESC
     ) operation_rows
     GROUP BY pricing_rule_id`,
    [ruleIds]
  );

  const operationsByRule = new Map(
    rows.map((row) => [Number(row.pricing_rule_id), (row.operations || []).slice(0, 3)])
  );

  return rules.map((rule) => ({
    ...rule,
    operations: operationsByRule.get(Number(rule.id)) || [],
  }));
};

const requirePricingRuleReason = (req, message) => {
  const reason = String(req.body?.reason || req.body?.note || '').trim();
  if (!reason) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return reason;
};

const getPricingRuleSnapshot = async (ruleId) => {
  const rules = await listLocationPricingRules();
  return rules.find((rule) => Number(rule.id) === Number(ruleId)) || null;
};

const createPricingRule = async (req, res) => {
  try {
    await ensurePricingRuleOperationSchema();
    const rule = await createLocationPricingRule({
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      amount: req.body.amount,
      isActive: req.body.is_active !== false,
    });

    await createPricingRuleOperation({
      pricingRuleId: rule.id,
      actor: req.user,
      eventType: 'pricing_rule_created',
      note: String(req.body?.reason || req.body?.note || '').trim() || null,
      metadata: {
        applies_to: rule.applies_to,
        state_name: rule.state_name,
        lga_name: rule.lga_name,
        amount: rule.amount,
        is_active: rule.is_active,
      },
    });

    await logAction(req.user.id, 'CREATE_PRICING_RULE', 'pricing_rule', rule.id);

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    req.logger.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A pricing rule already exists for that target and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to create pricing rule',
    });
  }
};

const updatePricingRule = async (req, res) => {
  try {
    await ensurePricingRuleOperationSchema();
    const previousRule = await getPricingRuleSnapshot(req.params.ruleId);
    if (!previousRule) {
      return res.status(404).json({ message: 'Pricing rule not found' });
    }

    const nextIsActive = req.body.is_active !== false;
    const statusChanged = previousRule.is_active !== nextIsActive;
    const reason = statusChanged
      ? requirePricingRuleReason(
          req,
          nextIsActive
            ? 'An enable reason is required'
            : 'A disable reason is required'
        )
      : String(req.body?.reason || req.body?.note || '').trim();

    const rule = await updateLocationPricingRule(req.params.ruleId, {
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      amount: req.body.amount,
      isActive: req.body.is_active !== false,
    });

    if (statusChanged || reason) {
      await createPricingRuleOperation({
        pricingRuleId: rule.id,
        actor: req.user,
        eventType: statusChanged
          ? nextIsActive
            ? 'pricing_rule_enabled'
            : 'pricing_rule_disabled'
          : 'pricing_rule_updated',
        note: reason || null,
        metadata: {
          previous_amount: previousRule.amount,
          new_amount: rule.amount,
          previous_is_active: previousRule.is_active,
          new_is_active: rule.is_active,
          applies_to: rule.applies_to,
          state_name: rule.state_name,
          lga_name: rule.lga_name,
        },
      });
    }

    await logAction(req.user.id, 'UPDATE_PRICING_RULE', 'pricing_rule', rule.id);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    req.logger.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A pricing rule already exists for that target and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update pricing rule',
    });
  }
};

const removePricingRule = async (req, res) => {
  try {
    await ensurePricingRuleOperationSchema();
    const reason = requirePricingRuleReason(req, 'A deletion reason is required');
    const existingRule = await getPricingRuleSnapshot(req.params.ruleId);
    if (!existingRule) {
      return res.status(404).json({ message: 'Pricing rule not found' });
    }

    await deleteLocationPricingRule(req.params.ruleId);

    await createPricingRuleOperation({
      pricingRuleId: Number(req.params.ruleId),
      actor: req.user,
      eventType: 'pricing_rule_deleted',
      note: reason,
      metadata: {
        applies_to: existingRule.applies_to,
        state_name: existingRule.state_name,
        lga_name: existingRule.lga_name,
        amount: existingRule.amount,
        was_active: existingRule.is_active,
      },
    });

    await logAction(req.user.id, 'DELETE_PRICING_RULE', 'pricing_rule', req.params.ruleId);

    res.json({ success: true });
  } catch (error) {
    req.logger.error(error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to delete pricing rule',
    });
  }
};

const getRegistrationAccessRules = async (req, res) => {
  try {
    await ensureRegistrationAccessRuleOperationSchema();
    const [rules, locations] = await Promise.all([
      listRegistrationAccessRules(),
      getLocationOptions(),
    ]);
    const rulesWithOperations = await attachRegistrationAccessRuleOperations(rules);

    res.json({
      success: true,
      data: {
        rules: rulesWithOperations,
        targets: getRegistrationAccessTargets(),
        locations,
      },
    });
  } catch (error) {
    req.logger.error(error);
    res.status(500).json({ message: 'Failed to load registration access rules' });
  }
};

const ensureRegistrationAccessRuleOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS registration_access_rule_operations (
      id SERIAL PRIMARY KEY,
      registration_access_rule_id INTEGER,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_registration_access_rule_ops_rule
      ON registration_access_rule_operations(registration_access_rule_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_registration_access_rule_ops_created
      ON registration_access_rule_operations(created_at DESC);
  `);
};

const createRegistrationAccessRuleOperation = async ({
  ruleId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO registration_access_rule_operations (
       registration_access_rule_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      ruleId || null,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const attachRegistrationAccessRuleOperations = async (rules = []) => {
  if (!rules.length) return rules;

  const ruleIds = rules.map((rule) => Number(rule.id)).filter(Boolean);
  if (!ruleIds.length) return rules;

  const { rows } = await db.query(
    `SELECT registration_access_rule_id,
            json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
     FROM (
       SELECT id, registration_access_rule_id, actor_id, actor_name, event_type, note, metadata, created_at
       FROM registration_access_rule_operations
       WHERE registration_access_rule_id = ANY($1::int[])
       ORDER BY created_at DESC, id DESC
     ) operation_rows
     GROUP BY registration_access_rule_id`,
    [ruleIds]
  );

  const operationsByRule = new Map(
    rows.map((row) => [Number(row.registration_access_rule_id), (row.operations || []).slice(0, 3)])
  );

  return rules.map((rule) => ({
    ...rule,
    operations: operationsByRule.get(Number(rule.id)) || [],
  }));
};

const requireRegistrationAccessRuleReason = (req, message) => {
  const reason = String(req.body?.reason || req.body?.note || '').trim();
  if (!reason) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return reason;
};

const getRegistrationAccessRuleSnapshot = async (ruleId) => {
  const rules = await listRegistrationAccessRules();
  return rules.find((rule) => Number(rule.id) === Number(ruleId)) || null;
};

const createRegistrationAccessRuleHandler = async (req, res) => {
  try {
    await ensureRegistrationAccessRuleOperationSchema();
    const rule = await createRegistrationAccessRule({
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      isActive: req.body.is_active !== false,
    });

    await createRegistrationAccessRuleOperation({
      ruleId: rule.id,
      actor: req.user,
      eventType: 'registration_access_rule_created',
      note: String(req.body?.reason || req.body?.note || '').trim() || null,
      metadata: {
        applies_to: rule.applies_to,
        state_name: rule.state_name,
        lga_name: rule.lga_name,
        is_active: rule.is_active,
      },
    });

    await logAction(
      req.user.id,
      'CREATE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      rule.id
    );

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    req.logger.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message:
          'A registration access rule already exists for that role and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to create registration access rule',
    });
  }
};

const updateRegistrationAccessRuleHandler = async (req, res) => {
  try {
    await ensureRegistrationAccessRuleOperationSchema();
    const previousRule = await getRegistrationAccessRuleSnapshot(req.params.ruleId);
    if (!previousRule) {
      return res.status(404).json({ message: 'Registration access rule not found' });
    }

    const nextIsActive = req.body.is_active !== false;
    const statusChanged = previousRule.is_active !== nextIsActive;
    const reason = statusChanged
      ? requireRegistrationAccessRuleReason(
          req,
          nextIsActive
            ? 'An enable reason is required'
            : 'A disable reason is required'
        )
      : String(req.body?.reason || req.body?.note || '').trim();

    const rule = await updateRegistrationAccessRule(req.params.ruleId, {
      appliesTo: req.body.applies_to,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      isActive: req.body.is_active !== false,
    });

    if (statusChanged || reason) {
      await createRegistrationAccessRuleOperation({
        ruleId: rule.id,
        actor: req.user,
        eventType: statusChanged
          ? nextIsActive
            ? 'registration_access_rule_enabled'
            : 'registration_access_rule_disabled'
          : 'registration_access_rule_updated',
        note: reason || null,
        metadata: {
          previous: previousRule,
          next: rule,
        },
      });
    }

    await logAction(
      req.user.id,
      'UPDATE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      rule.id
    );

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    req.logger.error(error);

    if (error.code === '23505') {
      return res.status(409).json({
        message:
          'A registration access rule already exists for that role and location',
      });
    }

    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update registration access rule',
    });
  }
};

const removeRegistrationAccessRule = async (req, res) => {
  try {
    await ensureRegistrationAccessRuleOperationSchema();
    const reason = requireRegistrationAccessRuleReason(req, 'A deletion reason is required');
    const existingRule = await getRegistrationAccessRuleSnapshot(req.params.ruleId);
    if (!existingRule) {
      return res.status(404).json({ message: 'Registration access rule not found' });
    }

    await deleteRegistrationAccessRule(req.params.ruleId);

    await createRegistrationAccessRuleOperation({
      ruleId: Number(req.params.ruleId),
      actor: req.user,
      eventType: 'registration_access_rule_deleted',
      note: reason,
      metadata: {
        applies_to: existingRule.applies_to,
        state_name: existingRule.state_name,
        lga_name: existingRule.lga_name,
        was_active: existingRule.is_active,
      },
    });

    await logAction(
      req.user.id,
      'DELETE_REGISTRATION_ACCESS_RULE',
      'registration_access_rule',
      req.params.ruleId
    );

    res.json({ success: true });
  } catch (error) {
    req.logger.error(error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to delete registration access rule',
    });
  }
};


module.exports = {
  ensureFeatureFlagOperationSchema,
  createFeatureFlagOperation,
  getFeatureFlags,
  updateFeatureFlag,
  getPricingRules,
  ensurePricingRuleOperationSchema,
  createPricingRuleOperation,
  attachPricingRuleOperations,
  getPricingRuleSnapshot,
  createPricingRule,
  updatePricingRule,
  removePricingRule,
  getRegistrationAccessRules,
  ensureRegistrationAccessRuleOperationSchema,
  createRegistrationAccessRuleOperation,
  attachRegistrationAccessRuleOperations,
  getRegistrationAccessRuleSnapshot,
  createRegistrationAccessRuleHandler,
  updateRegistrationAccessRuleHandler,
  removeRegistrationAccessRule,
};

