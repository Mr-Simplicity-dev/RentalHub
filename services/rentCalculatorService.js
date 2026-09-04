const db = require('../config/middleware/database');
const nigeriaLocations = require('../data/nigeriaLocations');
const { computeRentEstimate } = require('./rentCalculatorMath');

const GLOBAL_SCOPED_ROLES = ['super_admin', 'super_financial_admin'];
const STATE_SCOPED_ROLES = ['financial_admin', 'state_admin', 'state_financial_admin'];
const LGA_SCOPED_ROLES = ['lga_financial_admin'];

const resolveLgaEntry = (stateName, lgaId) => {
  const numericLgaId = Number(lgaId);
  if (!stateName || !Number.isInteger(numericLgaId) || numericLgaId < 1) return null;

  const state = nigeriaLocations.find((location) =>
    [location.state, location.displayName, location.slug]
      .some((value) => String(value || '').toLowerCase() === String(stateName).toLowerCase())
  );
  const lgaName = state?.lgas?.[numericLgaId - 1] || null;
  return lgaName ? { lga_id: numericLgaId, lga_name: lgaName } : null;
};

const lgaEntryForName = (stateName, lgaName) => {
  if (!stateName || !lgaName) return null;
  const state = nigeriaLocations.find((location) =>
    [location.state, location.displayName, location.slug]
      .some((value) => String(value || '').toLowerCase() === String(stateName).toLowerCase())
  );
  const index = state?.lgas?.findIndex((name) => String(name).toLowerCase() === String(lgaName).toLowerCase());
  if (!state || index === undefined || index < 0) return null;
  return { lga_id: index + 1, lga_name: state.lgas[index] };
};

const getActorName = (user = {}) =>
  user.full_name || user.name || user.email || user.username || `Admin #${user.id || 'unknown'}`;

const requireFeeNote = (body, message) => {
  const note = String(body?.governance_note || body?.reason || body?.note || '').trim();
  if (!note) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return note;
};

const recordFeeOperation = async ({ feeId, actor, eventType, note, metadata = {} }) => {
  await db.query(
    `INSERT INTO rent_calculator_fee_operations (
       fee_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      feeId || null,
      actor?.id || null,
      getActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getStateRow = async (stateName) => {
  if (!stateName) return null;
  const result = await db.query('SELECT id, state_name FROM states WHERE LOWER(state_name) = LOWER($1) LIMIT 1', [stateName]);
  return result.rows[0] || null;
};

const feeScopeForActor = async (user = {}) => {
  if (GLOBAL_SCOPED_ROLES.includes(user.user_type)) {
    return { level: 'global', state_id: null, state_name: null, lga_id: null, lga_name: null };
  }

  if (LGA_SCOPED_ROLES.includes(user.user_type)) {
    const stateRow = await getStateRow(user.assigned_state);
    if (!stateRow || !user.assigned_city) {
      const error = new Error('LGA finance admin account is missing a valid assigned state/LGA');
      error.statusCode = 403;
      throw error;
    }
    const lgaEntry = lgaEntryForName(stateRow.state_name, user.assigned_city);
    if (!lgaEntry) {
      const error = new Error('Assigned LGA does not belong to the assigned state');
      error.statusCode = 403;
      throw error;
    }
    return {
      level: 'lga',
      state_id: stateRow.id,
      state_name: stateRow.state_name,
      lga_id: lgaEntry.lga_id,
      lga_name: lgaEntry.lga_name,
    };
  }

  if (STATE_SCOPED_ROLES.includes(user.user_type)) {
    const stateRow = await getStateRow(user.assigned_state);
    if (!stateRow) {
      const error = new Error('Finance admin account is missing a valid assigned state');
      error.statusCode = 403;
      throw error;
    }
    return { level: 'state', state_id: stateRow.id, state_name: stateRow.state_name, lga_id: null, lga_name: null };
  }

  const error = new Error('This role is not allowed to manage calculator fees');
  error.statusCode = 403;
  throw error;
};

const resolveFeeConfig = async ({ state_id, lga_id } = {}) => {
  if (lga_id && state_id) {
    const result = await db.query(
      `SELECT * FROM rent_calculator_fees
       WHERE (state_id = $1 AND lga_id = $2)
          OR (state_id = $1 AND lga_id IS NULL)
          OR (state_id IS NULL AND lga_id IS NULL)
       ORDER BY CASE
         WHEN state_id IS NULL THEN 2
         WHEN lga_id IS NULL THEN 1
         ELSE 0 END
       LIMIT 1`,
      [state_id, lga_id]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  if (state_id) {
    const result = await db.query(
      `SELECT * FROM rent_calculator_fees
       WHERE (state_id = $1 AND lga_id IS NULL)
          OR (state_id IS NULL AND lga_id IS NULL)
       ORDER BY CASE WHEN state_id IS NULL THEN 1 ELSE 0 END
       LIMIT 1`,
      [state_id]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  const result = await db.query(
    `SELECT * FROM rent_calculator_fees
     WHERE state_id IS NULL AND lga_id IS NULL
     LIMIT 1`
  );
  if (result.rows.length > 0) return result.rows[0];

  return {
    id: null,
    state_id: null,
    state_name: null,
    lga_id: null,
    lga_name: null,
    agent_fee_pct: 10,
    legal_fee_pct: 10,
    caution_months: 1,
    agreement_fee: 5000,
    service_charge: 0,
  };
};

const decorateConfig = (row) => ({
  ...row,
  is_default: row?.state_id === null || row?.state_id === undefined,
});

const withDefaultFees = (fees = {}) => ({
  agent_fee_pct: Number(fees.agent_fee_pct) || 0,
  legal_fee_pct: Number(fees.legal_fee_pct) || 0,
  caution_months: Number(fees.caution_months) || 0,
  agreement_fee: Number(fees.agreement_fee) || 0,
  service_charge: Number(fees.service_charge) || 0,
});

// ════════════════════════════════════════════════════════════
// PUBLIC: GET RESOLVED FEES FOR A LOCATION
// ════════════════════════════════════════════════════════════
exports.getFees = async (req, res) => {
  try {
    const { state_id, lga_id } = req.query;
    const config = await resolveFeeConfig({
      state_id: state_id || null,
      lga_id: lga_id || null,
    });
    res.json({ success: true, data: decorateConfig(config) });
  } catch (error) {
    req.logger.error('Error fetching rent calculator fees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rent calculator fees' });
  }
};

// ════════════════════════════════════════════════════════════
// PUBLIC: ESTIMATE
// ════════════════════════════════════════════════════════════
exports.estimate = async (req, res) => {
  try {
    const {
      rent_amount,
      payment_frequency,
      upfront_months,
      state_id,
      lga_id,
      monthly_income,
      ratio_pct,
      months_to_goal,
    } = req.body;

    const config = await resolveFeeConfig({
      state_id: state_id || null,
      lga_id: lga_id || null,
    });

    const estimate = computeRentEstimate({
      rent_amount,
      payment_frequency,
      upfront_months,
      monthly_income: monthly_income || null,
      ratio_pct: ratio_pct || null,
      months_to_goal: months_to_goal || null,
      fees: withDefaultFees(config),
    });

    if (!estimate) {
      return res.status(400).json({ success: false, message: 'A positive rent amount is required' });
    }

    res.json({
      success: true,
      data: {
        ...estimate,
        fees_config: decorateConfig(config),
      },
    });
  } catch (error) {
    req.logger.error('Error estimating rent:', error);
    res.status(500).json({ success: false, message: 'Failed to estimate rent' });
  }
};

// ════════════════════════════════════════════════════════════
// ADMIN: LIST FEES (scoped by actor hierarchy)
// ════════════════════════════════════════════════════════════
exports.adminGetFees = async (req, res) => {
  try {
    const scope = await feeScopeForActor(req.user);

    let rows;
    if (scope.level === 'global') {
      const result = await db.query(`
        SELECT rcf.*, s.state_name
        FROM rent_calculator_fees rcf
        LEFT JOIN states s ON rcf.state_id = s.id
        ORDER BY (rcf.state_id IS NULL) DESC, rcf.state_name NULLS FIRST, rcf.lga_id NULLS FIRST, rcf.id
      `);
      rows = result.rows;
    } else if (scope.level === 'state') {
      const result = await db.query(
        `SELECT rcf.*
         FROM rent_calculator_fees rcf
         WHERE (rcf.state_id IS NULL AND rcf.lga_id IS NULL)
            OR LOWER(rcf.state_name) = LOWER($1)
         ORDER BY (rcf.state_id IS NULL) DESC, rcf.lga_id NULLS FIRST, rcf.id`,
        [scope.state_name]
      );
      rows = result.rows;
    } else {
      const result = await db.query(
        `SELECT rcf.*
         FROM rent_calculator_fees rcf
         WHERE (rcf.state_id IS NULL AND rcf.lga_id IS NULL)
            OR (rcf.state_id = $1 AND rcf.lga_id IS NULL)
            OR (rcf.state_id = $1 AND LOWER(rcf.lga_name) = LOWER($2))
         ORDER BY (rcf.state_id IS NULL) DESC, rcf.lga_id NULLS FIRST, rcf.id`,
        [scope.state_id, scope.lga_name]
      );
      rows = result.rows;
    }

    res.json({
      success: true,
      data: rows.map(decorateConfig),
      scope: {
        level: scope.level,
        assigned_state: scope.state_name,
        assigned_lga: scope.lga_name,
        can_edit_global: scope.level === 'global',
        can_edit_state_rows: scope.level === 'global' || scope.level === 'state',
        can_edit_lga_rows: scope.level !== 'lga' || true,
      },
    });
  } catch (error) {
    req.logger.error('Error fetching rent calculator admin fees:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch rent calculator fees',
    });
  }
};

// ════════════════════════════════════════════════════════════
// ADMIN: UPSERT A FEE ROW (scope-enforced)
// ════════════════════════════════════════════════════════════
exports.adminCreateFee = async (req, res) => {
  try {
    const scope = await feeScopeForActor(req.user);
    const governanceNote = requireFeeNote(req.body, 'A governance note is required for fee changes');

    let stateId = scope.state_id;
    let stateName = scope.state_name;
    let lgaId = scope.lga_id;
    let lgaName = scope.lga_name;

    if (scope.level === 'global') {
      if (req.body.state_id) {
        const stateRow = await db.query('SELECT id, state_name FROM states WHERE id = $1', [req.body.state_id]);
        if (stateRow.rows.length === 0) {
          return res.status(400).json({ success: false, message: 'Invalid state_id' });
        }
        stateId = stateRow.rows[0].id;
        stateName = stateRow.rows[0].state_name;
      }
      lgaId = null;
      lgaName = null;
      if (req.body.lga_id && stateId) {
        const entry = resolveLgaEntry(stateName, req.body.lga_id);
        if (!entry) {
          return res.status(400).json({ success: false, message: 'Invalid lga_id for the selected state' });
        }
        lgaId = entry.lga_id;
        lgaName = entry.lga_name;
      }
    } else if (scope.level === 'state') {
      if (req.body.lga_id) {
        const entry = resolveLgaEntry(stateName, req.body.lga_id);
        if (!entry) {
          return res.status(400).json({ success: false, message: 'Invalid lga_id for your state' });
        }
        lgaId = entry.lga_id;
        lgaName = entry.lga_name;
      }
    }

    const existing = await db.query(
      `SELECT id FROM rent_calculator_fees
       WHERE (state_id = $1 AND (lga_id = $2 OR (lga_id IS NULL AND $2 IS NULL)))
          OR (state_id IS NULL AND $1 IS NULL AND $2 IS NULL)`,
      [stateId || null, lgaId || null]
    );

    const values = {
      agent_fee_pct: Number(req.body.agent_fee_pct),
      legal_fee_pct: Number(req.body.legal_fee_pct),
      caution_months: Number(req.body.caution_months),
      agreement_fee: Number(req.body.agreement_fee),
      service_charge: Number(req.body.service_charge),
      state_id: stateId || null,
      state_name: stateName || null,
      lga_id: lgaId || null,
      lga_name: lgaName || null,
      updated_by: req.user.id,
    };

    let result;
    if (existing.rows.length > 0) {
      const feeId = existing.rows[0].id;
      result = await db.query(
        `UPDATE rent_calculator_fees
         SET agent_fee_pct = $1, legal_fee_pct = $2, caution_months = $3,
             agreement_fee = $4, service_charge = $5,
             state_name = $6, lga_name = $7, updated_by = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9
         RETURNING *`,
        [
          values.agent_fee_pct, values.legal_fee_pct, values.caution_months,
          values.agreement_fee, values.service_charge,
          values.state_name, values.lga_name, values.updated_by,
          feeId,
        ]
      );
      await recordFeeOperation({
        feeId,
        actor: req.user,
        eventType: 'calculator_fee_updated',
        note: governanceNote,
        metadata: values,
      });
      return res.json({ success: true, message: 'Calculator fees updated', data: result.rows[0] });
    }

    result = await db.query(
      `INSERT INTO rent_calculator_fees
         (state_id, state_name, lga_id, lga_name, agent_fee_pct, legal_fee_pct,
          caution_months, agreement_fee, service_charge, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        values.state_id, values.state_name, values.lga_id, values.lga_name,
        values.agent_fee_pct, values.legal_fee_pct, values.caution_months,
        values.agreement_fee, values.service_charge, values.updated_by,
      ]
    );

    await recordFeeOperation({
      feeId: result.rows[0].id,
      actor: req.user,
      eventType: 'calculator_fee_created',
      note: governanceNote,
      metadata: values,
    });

    res.status(201).json({ success: true, message: 'Calculator fees created', data: result.rows[0] });
  } catch (error) {
    req.logger.error('Error creating/updating calculator fees:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create/update calculator fees',
    });
  }
};

// ════════════════════════════════════════════════════════════
// ADMIN: DELETE A FEE ROW (scope-enforced)
// ════════════════════════════════════════════════════════════
exports.adminDeleteFee = async (req, res) => {
  try {
    const scope = await feeScopeForActor(req.user);
    const governanceNote = requireFeeNote(req.body, 'A deletion reason is required');
    const { id } = req.params;

    const existing = await db.query(
      `SELECT * FROM rent_calculator_fees WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Calculator fees record not found' });
    }

    const row = existing.rows[0];
    const isGlobal = row.state_id === null;

    if (isGlobal && scope.level !== 'global') {
      return res.status(403).json({ success: false, message: 'Only national finance roles can change the global default' });
    }

    if (!isGlobal && scope.level !== 'global') {
      const stateMatches = row.state_name && String(row.state_name).toLowerCase() === String(scope.state_name || '').toLowerCase();
      const lgaMatch = !row.lga_id || (row.lga_name && String(row.lga_name).toLowerCase() === String(scope.lga_name || '').toLowerCase());
      if (!stateMatches || (scope.level === 'lga' && !row.lga_id)) {
        return res.status(403).json({ success: false, message: 'You can only delete fee records within your assigned area' });
      }
      if (scope.level === 'lga' && !lgaMatch) {
        return res.status(403).json({ success: false, message: 'You can only delete fee records within your assigned LGA' });
      }
    }

    await db.query('DELETE FROM rent_calculator_fees WHERE id = $1', [id]);

    await recordFeeOperation({
      feeId: Number(id),
      actor: req.user,
      eventType: 'calculator_fee_deleted',
      note: governanceNote,
      metadata: {
        state_id: row.state_id,
        state_name: row.state_name,
        lga_id: row.lga_id,
        lga_name: row.lga_name,
      },
    });

    res.json({ success: true, message: 'Calculator fees deleted' });
  } catch (error) {
    req.logger.error('Error deleting calculator fees:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete calculator fees',
    });
  }
};
