const db = require('../config/middleware/database');
const NotificationService = require('../services/NotificationService');

const ensureSetupFeeOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS rent_savings_setup_fee_operations (
      id SERIAL PRIMARY KEY,
      setup_fee_id INTEGER,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fee_ops_fee
      ON rent_savings_setup_fee_operations(setup_fee_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rent_savings_setup_fee_ops_created
      ON rent_savings_setup_fee_operations(created_at DESC);
  `);
};

const getActorName = (user = {}) =>
  user.full_name || user.name || user.email || user.username || `Admin #${user.id || 'unknown'}`;

const requireSetupFeeNote = (body, message) => {
  const note = String(body?.governance_note || body?.reason || body?.note || '').trim();
  if (!note) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return note;
};

const recordSetupFeeOperation = async ({
  setupFeeId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO rent_savings_setup_fee_operations (
       setup_fee_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      setupFeeId || null,
      actor?.id || null,
      getActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

// ============================================================
// RENT SAVINGS CONTROLLER
// Covers every table defined in Migration 034:
//   - rent_savings_plans
//   - rent_savings_contributions
//   - rent_savings_setup_fees
//   - rent_savings_early_withdrawals
//   - rent_savings_revenue
//   - withdrawal_requests (extended columns)
// ============================================================


// ════════════════════════════════════════════════════════════
// SETUP FEES (Tenant-facing)
// ════════════════════════════════════════════════════════════

// ── GET SETUP FEES (by location) ────────────────────────────
exports.getSetupFees = async (req, res) => {
  try {
    const { state_id, lga_id } = req.query;

    let query;
    let params;

    if (lga_id) {
      // LGA-specific fee first, fallback to state-level
      query = `
        SELECT * FROM rent_savings_setup_fees
        WHERE (lga_id = $1 OR (state_id = $2 AND lga_id IS NULL))
        ORDER BY lga_id NULLS LAST
        LIMIT 1
      `;
      params = [lga_id, state_id];
    } else if (state_id) {
      query = `
        SELECT * FROM rent_savings_setup_fees
        WHERE state_id = $1 AND lga_id IS NULL
        LIMIT 1
      `;
      params = [state_id];
    } else {
      // Return all setup fees with location names
      const result = await db.query(`
        SELECT rsf.*,
               loc_state.name AS state_name,
               loc_lga.name   AS lga_name
        FROM rent_savings_setup_fees rsf
        LEFT JOIN locations loc_state ON rsf.state_id = loc_state.id
        LEFT JOIN locations loc_lga   ON rsf.lga_id   = loc_lga.id
        ORDER BY rsf.created_at DESC
      `);
      return res.json({ success: true, data: result.rows });
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      // Default fee when none configured for the location
      return res.json({
        success: true,
        data: { setup_fee: 2000.00, is_default: true },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching setup fees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch setup fees' });
  }
};


// ════════════════════════════════════════════════════════════
// SAVINGS PLANS (Tenant-facing)
// ════════════════════════════════════════════════════════════

// ── CREATE A NEW SAVINGS PLAN ──────────────────────────────
exports.createPlan = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const { property_id, rent_due_date, monthly_rent_amount, state_id, lga_id } = req.body;

    if (!property_id || !rent_due_date || !monthly_rent_amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: property_id, rent_due_date, monthly_rent_amount',
      });
    }

    // Block duplicate active plans for same property
    const existingPlan = await client.query(
      `SELECT id FROM rent_savings_plans
       WHERE tenant_id = $1 AND property_id = $2 AND status = 'active'`,
      [userId, property_id]
    );

    if (existingPlan.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'You already have an active savings plan for this property',
      });
    }

    // Calculate months left & monthly savings amount
    const dueDate = new Date(rent_due_date);
    const now = new Date();
    const monthsLeft = Math.max(1, Math.round((dueDate - now) / (1000 * 60 * 60 * 24 * 30.44)));
    const monthly_savings_amount = Math.round((Number(monthly_rent_amount) / monthsLeft) * 100) / 100;
    const target_savings_amount  = Number(monthly_rent_amount);

    // Resolve setup fee for this location
    let setupFeeAmount = 0;
    if (state_id) {
      const feeResult = await client.query(
        `SELECT setup_fee FROM rent_savings_setup_fees
         WHERE (lga_id = $1 OR (state_id = $2 AND lga_id IS NULL))
         ORDER BY lga_id NULLS LAST LIMIT 1`,
        [lga_id || null, state_id]
      );
      if (feeResult.rows.length > 0) {
        setupFeeAmount = Number(feeResult.rows[0].setup_fee);
      }
    }

    // Create the plan record
    const planResult = await client.query(
      `INSERT INTO rent_savings_plans
         (tenant_id, property_id, rent_due_date, monthly_rent_amount,
          target_savings_amount, monthly_savings_amount,
          setup_fee_amount, setup_fee_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId, property_id, rent_due_date, monthly_rent_amount,
        target_savings_amount, monthly_savings_amount,
        setupFeeAmount, setupFeeAmount === 0,
      ]
    );

    const plan = planResult.rows[0];

    // Charge setup fee from wallet when applicable
    if (setupFeeAmount > 0) {
      const walletRes = await client.query(
        `SELECT COALESCE(SUM(
           CASE WHEN type = 'credit' THEN amount ELSE -amount END
         ), 0) AS balance
         FROM wallet_transactions
         WHERE user_id = $1`,
        [userId]
      );
      const walletBalance = Number(walletRes.rows[0]?.balance || 0);

      if (walletBalance < setupFeeAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. A one-time setup fee of ₦${setupFeeAmount.toLocaleString()} is required. Please fund your wallet first.`,
          setup_fee: setupFeeAmount,
        });
      }

      // Deduct setup fee from wallet
      await client.query(
        `INSERT INTO wallet_transactions (user_id, amount, type, description, reference)
         VALUES ($1, $2, 'debit', $3, $4)`,
        [
          userId, setupFeeAmount,
          `Rent savings plan setup fee (Plan #${plan.id})`,
          `SETUP_${plan.id}_${Date.now()}`,
        ]
      );

      // Record platform revenue — setup_fee type
      await client.query(
        `INSERT INTO rent_savings_revenue
           (tenant_id, plan_id, revenue_type, amount, description)
         VALUES ($1, $2, 'setup_fee', $3, $4)`,
        [userId, plan.id, setupFeeAmount, `One-time setup fee for rent savings plan #${plan.id}`]
      );

      // Mark setup fee as paid
      await client.query(
        `UPDATE rent_savings_plans SET setup_fee_paid = TRUE WHERE id = $1`,
        [plan.id]
      );

      await NotificationService.sendNotification(
        userId,
        'Rent Savings Setup Fee Charged',
        `A one-time setup fee of ₦${setupFeeAmount.toLocaleString()} has been charged to activate your rent savings plan.`,
        'rent_savings_setup_fee',
        plan.id,
        'rent_savings_plan'
      );
    }

    await client.query('COMMIT');

    // Return plan with property details
    const fullPlan = await db.query(
      `SELECT rsp.*, p.title AS property_title, p.address AS property_address
       FROM rent_savings_plans rsp
       JOIN properties p ON rsp.property_id = p.id
       WHERE rsp.id = $1`,
      [plan.id]
    );

    res.status(201).json({
      success: true,
      message: setupFeeAmount > 0
        ? `Savings plan created. Setup fee of ₦${setupFeeAmount.toLocaleString()} has been charged.`
        : 'Savings plan created successfully!',
      data: fullPlan.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating savings plan:', error);
    res.status(500).json({ success: false, message: 'Failed to create savings plan' });
  } finally {
    client.release();
  }
};

// ── GET ALL PLANS FOR CURRENT TENANT ────────────────────────
exports.getMyPlans = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT rsp.*,
                            p.title   AS property_title,
              p.full_address AS property_address,
              COALESCE(c.contribution_count, 0) AS contribution_count,
              COALESCE(c.total_contributed, 0)  AS total_contributed
       FROM rent_savings_plans rsp
       JOIN properties p ON rsp.property_id = p.id
       LEFT JOIN (
         SELECT plan_id,
                COUNT(*)       AS contribution_count,
                SUM(net_saved) AS total_contributed
         FROM rent_savings_contributions
         GROUP BY plan_id
       ) c ON rsp.id = c.plan_id
       WHERE rsp.tenant_id = $1
       ORDER BY rsp.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching savings plans:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch savings plans' });
  }
};

// ── GET SINGLE PLAN DETAILS (WITH CONTRIBUTIONS & WITHDRAWALS) ─
exports.getPlanDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const planResult = await db.query(
      `SELECT rsp.*, p.title AS property_title, p.full_address AS property_address
       FROM rent_savings_plans rsp
       JOIN properties p ON rsp.property_id = p.id
       WHERE rsp.id = $1 AND rsp.tenant_id = $2`,
      [id, userId]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const contributions = await db.query(
      `SELECT * FROM rent_savings_contributions
       WHERE plan_id = $1
       ORDER BY contributed_at DESC`,
      [id]
    );

    const earlyWithdrawals = await db.query(
      `SELECT * FROM rent_savings_early_withdrawals
       WHERE plan_id = $1
       ORDER BY requested_at DESC`,
      [id]
    );

    // Revenue records visible to tenant for transparency
    const revenueRecords = await db.query(
      `SELECT revenue_type, amount, description, created_at
       FROM rent_savings_revenue
       WHERE plan_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...planResult.rows[0],
        contributions:     contributions.rows,
        early_withdrawals: earlyWithdrawals.rows,
        fees_charged:      revenueRecords.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching plan details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plan details' });
  }
};

// ── TOGGLE PLAN ACTIVE / INACTIVE ───────────────────────────
exports.togglePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const plan = await db.query(
      `SELECT * FROM rent_savings_plans WHERE id = $1 AND tenant_id = $2`,
      [id, userId]
    );

    if (plan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    // Cannot reactivate a completed or cancelled plan
    if (['completed', 'cancelled'].includes(plan.rows[0].status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot toggle a ${plan.rows[0].status} plan`,
      });
    }

    const newActive = !plan.rows[0].is_active;

    await db.query(
      `UPDATE rent_savings_plans SET is_active = $1 WHERE id = $2`,
      [newActive, id]
    );

    res.json({
      success: true,
      message: newActive ? 'Savings plan activated' : 'Savings plan paused',
      data: { is_active: newActive },
    });
  } catch (error) {
    console.error('Error toggling plan:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle plan' });
  }
};


// ════════════════════════════════════════════════════════════
// CONTRIBUTIONS (Tenant-facing)
// ════════════════════════════════════════════════════════════

// ── MAKE A CONTRIBUTION ─────────────────────────────────────
exports.makeContribution = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params; // plan_id
    const userId = req.user.id;
    const { amount, month, is_catchup, previous_month_missed } = req.body;

    if (!amount || !month) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Amount and month are required' });
    }

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Month must be in YYYY-MM format' });
    }

    // Verify plan ownership and active status
    const planResult = await client.query(
      `SELECT * FROM rent_savings_plans
       WHERE id = $1 AND tenant_id = $2 AND status = 'active' AND is_active = TRUE`,
      [id, userId]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Active plan not found or plan is paused' });
    }

    const plan = planResult.rows[0];

    // Block duplicate contribution for same month
    const existingContrib = await client.query(
      `SELECT id FROM rent_savings_contributions
       WHERE plan_id = $1 AND saved_for_month = $2`,
      [id, month]
    );

    if (existingContrib.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `You already contributed for ${month}` });
    }

    const contributionAmount = Number(amount);

    // Enforce minimum monthly savings amount
    if (contributionAmount < Number(plan.monthly_savings_amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Minimum contribution is ₦${Number(plan.monthly_savings_amount).toLocaleString()}`,
      });
    }

    // Wallet balance check
    const walletRes = await client.query(
      `SELECT COALESCE(SUM(
         CASE WHEN type = 'credit' THEN amount ELSE -amount END
       ), 0) AS balance
       FROM wallet_transactions
       WHERE user_id = $1`,
      [userId]
    );
    const walletBalance = Number(walletRes.rows[0]?.balance || 0);

    if (walletBalance < contributionAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Please fund your wallet with at least ₦${contributionAmount.toLocaleString()}.`,
      });
    }

    // Calculate 1% commission — columns: commission_1pct, net_saved
    const commission1pct = Math.round(contributionAmount * 0.01 * 100) / 100;
    const netSaved       = Math.round((contributionAmount - commission1pct) * 100) / 100;

    // Deduct from wallet
    const ref = `RSC_${id}_${month}_${Date.now()}`;
    await client.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, description, reference)
       VALUES ($1, $2, 'debit', $3, $4)`,
      [userId, contributionAmount, `Rent savings contribution for ${month} (Plan #${id})`, ref]
    );

    // Insert contribution — all migration columns populated
    const contribResult = await client.query(
      `INSERT INTO rent_savings_contributions
         (plan_id, tenant_id, amount, commission_1pct, net_saved,
          saved_for_month, is_catchup, previous_month_missed, payment_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id, userId, contributionAmount, commission1pct, netSaved,
        month, is_catchup || false, previous_month_missed || null, ref,
      ]
    );

    // Update plan total_saved; auto-complete if target reached
    const newTotalSaved = Math.round((Number(plan.total_saved) + netSaved) * 100) / 100;
    const newStatus     = newTotalSaved >= Number(plan.target_savings_amount) ? 'completed' : plan.status;

    await client.query(
      `UPDATE rent_savings_plans SET total_saved = $1, status = $2 WHERE id = $3`,
      [newTotalSaved, newStatus, id]
    );

    // Record platform revenue — monthly_1pct type
    await client.query(
      `INSERT INTO rent_savings_revenue
         (tenant_id, plan_id, contribution_id, revenue_type, amount, description)
       VALUES ($1, $2, $3, 'monthly_1pct', $4, $5)`,
      [userId, id, contribResult.rows[0].id, commission1pct, `1% maintenance fee on contribution for ${month}`]
    );

    await client.query('COMMIT');

    await NotificationService.sendNotification(
      userId,
      'Rent Savings Contribution Received',
      `Your contribution of ₦${contributionAmount.toLocaleString()} for ${month} has been saved. ` +
      `1% fee (₦${commission1pct.toLocaleString()}) applied. Net saved: ₦${netSaved.toLocaleString()}.`,
      'rent_savings_contribution',
      id,
      'rent_savings_plan'
    );

    res.status(201).json({
      success: true,
      message: `Contribution of ₦${contributionAmount.toLocaleString()} saved successfully!`,
      data: {
        contribution: contribResult.rows[0],
        plan: { ...plan, total_saved: newTotalSaved, status: newStatus },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error making contribution:', error);
    res.status(500).json({ success: false, message: 'Failed to make contribution' });
  } finally {
    client.release();
  }
};

// ── GET ALL CONTRIBUTIONS FOR A PLAN ────────────────────────
exports.getPlanContributions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Confirm ownership
    const plan = await db.query(
      `SELECT id FROM rent_savings_plans WHERE id = $1 AND tenant_id = $2`,
      [id, userId]
    );
    if (plan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const result = await db.query(
      `SELECT * FROM rent_savings_contributions
       WHERE plan_id = $1
       ORDER BY contributed_at DESC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contributions' });
  }
};

// ── GET MISSED MONTHS ──────────────────────────────────────
exports.getMissedMonths = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const plan = await db.query(
      `SELECT * FROM rent_savings_plans WHERE id = $1 AND tenant_id = $2`,
      [id, userId]
    );
    if (plan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const planData = plan.rows[0];
    const dueDate  = new Date(planData.rent_due_date);
    const now      = new Date();

    // Build list of all months from plan creation up to due date / today
    const months  = [];
    const current = new Date(planData.created_at);
    current.setDate(1);

    while (current < dueDate && current <= now) {
      months.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
      );
      current.setMonth(current.getMonth() + 1);
    }

    const contribs = await db.query(
      `SELECT DISTINCT saved_for_month FROM rent_savings_contributions WHERE plan_id = $1`,
      [id]
    );
    const contributedMonths = new Set(contribs.rows.map(r => r.saved_for_month));
    const missedMonths      = months.filter(m => !contributedMonths.has(m));

    res.json({
      success: true,
      data: {
        all_months:          months,
        contributed_months:  Array.from(contributedMonths),
        missed_months:       missedMonths,
        missed_count:        missedMonths.length,
        monthly_savings_amount: planData.monthly_savings_amount,
      },
    });
  } catch (error) {
    console.error('Error fetching missed months:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch missed months' });
  }
};


// ════════════════════════════════════════════════════════════
// WITHDRAWALS (Tenant-facing)
// ════════════════════════════════════════════════════════════

// ── WITHDRAW AT MATURITY ────────────────────────────────────
// Uses withdrawal_requests with withdrawal_type = 'rent_savings_maturity'
// and records maturity_commission in the extended column
exports.withdrawAtMaturity = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const userId = req.user.id;

    const planResult = await client.query(
      `SELECT * FROM rent_savings_plans WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [id, userId]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Active plan not found' });
    }

    const plan     = planResult.rows[0];
    const now      = new Date();
    const dueDate  = new Date(plan.rent_due_date);

    // Allow withdrawal from 7 days before due date
    const sevenDaysBeforeDue = new Date(dueDate);
    sevenDaysBeforeDue.setDate(sevenDaysBeforeDue.getDate() - 7);

    if (now < sevenDaysBeforeDue) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message:
          `Rent is not yet due. Your rent is due on ${dueDate.toLocaleDateString()}. ` +
          `You can withdraw from ${sevenDaysBeforeDue.toLocaleDateString()}.`,
      });
    }

    const totalSaved = Number(plan.total_saved);
    if (totalSaved <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No savings to withdraw' });
    }

    // 2% maturity commission — maps to maturity_commission column in withdrawal_requests
    const maturityCommission = Math.round(totalSaved * 0.02 * 100) / 100;
    const netPayout          = Math.round((totalSaved - maturityCommission) * 100) / 100;

    // Create withdrawal_requests record with extended columns
    const wrResult = await client.query(
      `INSERT INTO withdrawal_requests
         (user_id, amount, status, withdrawal_type, maturity_commission, description)
       VALUES ($1, $2, 'approved', 'rent_savings_maturity', $3, $4)
       RETURNING *`,
      [userId, netPayout, maturityCommission, `Maturity withdrawal for rent savings plan #${id}`]
    );

    // Credit net payout to wallet
    await client.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, description, reference)
       VALUES ($1, $2, 'credit', $3, $4)`,
      [
        userId, netPayout,
        `Rent savings maturity payout (Plan #${id})`,
        `RSM_${id}_${Date.now()}`,
      ]
    );

    // Record platform revenue — maturity_2pct type; link withdrawal_request_id
    await client.query(
      `INSERT INTO rent_savings_revenue
         (tenant_id, plan_id, withdrawal_request_id, revenue_type, amount, description)
       VALUES ($1, $2, $3, 'maturity_2pct', $4, $5)`,
      [userId, id, wrResult.rows[0].id, maturityCommission, `2% maturity commission on plan #${id}`]
    );

    // Complete the plan
    await client.query(
      `UPDATE rent_savings_plans SET status = 'completed', is_active = FALSE WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    await NotificationService.sendNotification(
      userId,
      'Rent Savings Maturity Withdrawal',
      `Your rent savings of ₦${totalSaved.toLocaleString()} has been withdrawn. ` +
      `A 2% commission (₦${maturityCommission.toLocaleString()}) was applied. ` +
      `₦${netPayout.toLocaleString()} has been credited to your wallet.`,
      'rent_savings_maturity',
      id,
      'rent_savings_plan'
    );

    res.json({
      success: true,
      message: `Savings withdrawn successfully! ₦${netPayout.toLocaleString()} credited to your wallet.`,
      data: {
        total_saved:          totalSaved,
        maturity_commission:  maturityCommission,
        net_payout:           netPayout,
        withdrawal_reference: wrResult.rows[0].id,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error withdrawing at maturity:', error);
    res.status(500).json({ success: false, message: 'Failed to withdraw savings' });
  } finally {
    client.release();
  }
};

// ── REQUEST EARLY WITHDRAWAL ────────────────────────────────
// Creates rent_savings_early_withdrawals record — admin must approve
// penalty column in migration is penalty_5pct (5.8% applied in code)
exports.requestEarlyWithdrawal = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const planResult = await client.query(
      `SELECT * FROM rent_savings_plans WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [id, userId]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Active plan not found' });
    }

    const plan       = planResult.rows[0];
    const totalSaved = Number(plan.total_saved);

    if (totalSaved <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No savings to withdraw' });
    }

    // Block duplicate pending requests
    const existingRequest = await client.query(
      `SELECT id FROM rent_savings_early_withdrawals
       WHERE plan_id = $1 AND status = 'pending'`,
      [id]
    );

    if (existingRequest.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'You already have a pending early withdrawal request for this plan',
      });
    }

    // 5.8% penalty — stored in penalty_5pct column
    const penaltyAmount = Math.round(totalSaved * 0.058 * 100) / 100;
    const netPayout     = Math.round((totalSaved - penaltyAmount) * 100) / 100;

    const requestResult = await client.query(
      `INSERT INTO rent_savings_early_withdrawals
         (plan_id, tenant_id, requested_amount, penalty_5pct, net_payout, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, totalSaved, penaltyAmount, netPayout, reason || null]
    );

    await client.query('COMMIT');

    await NotificationService.sendNotification(
      userId,
      'Early Withdrawal Request Submitted',
      `Your request to withdraw ₦${totalSaved.toLocaleString()} early has been submitted for admin review. ` +
      `A 5.8% penalty (₦${penaltyAmount.toLocaleString()}) will apply if approved.`,
      'rent_savings_early_withdrawal_request',
      id,
      'rent_savings_plan'
    );

    res.status(201).json({
      success: true,
      message: 'Early withdrawal request submitted for admin approval.',
      data: {
        request:    requestResult.rows[0],
        penalty:    penaltyAmount,
        net_payout: netPayout,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error requesting early withdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to request early withdrawal' });
  } finally {
    client.release();
  }
};

// ── GET MY EARLY WITHDRAWAL REQUESTS ────────────────────────
exports.getMyEarlyWithdrawalRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT rsew.*, rsp.monthly_rent_amount, rsp.target_savings_amount,
              rsp.rent_due_date, p.title AS property_title
       FROM rent_savings_early_withdrawals rsew
       JOIN rent_savings_plans rsp ON rsew.plan_id = rsp.id
       JOIN properties p ON rsp.property_id = p.id
       WHERE rsew.tenant_id = $1
       ORDER BY rsew.requested_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching early withdrawal requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch early withdrawal requests' });
  }
};


// ════════════════════════════════════════════════════════════
// REVENUE / DASHBOARD (Tenant-facing)
// ════════════════════════════════════════════════════════════

// ── GET TENANT SAVINGS SUMMARY ───────────────────────────────
exports.getMySavingsSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const summary = await db.query(
      `SELECT
         COUNT(*)                                              AS total_plans,
         COUNT(*) FILTER (WHERE status = 'active')            AS active_plans,
         COUNT(*) FILTER (WHERE status = 'completed')         AS completed_plans,
         COUNT(*) FILTER (WHERE status = 'cancelled')         AS cancelled_plans,
         COALESCE(SUM(total_saved), 0)                        AS total_saved_across_plans,
         COALESCE(SUM(target_savings_amount), 0)              AS total_targets,
         COALESCE(SUM(monthly_savings_amount), 0)             AS total_monthly_commitments
       FROM rent_savings_plans
       WHERE tenant_id = $1`,
      [userId]
    );

    const feesCharged = await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'setup_fee'),            0) AS total_setup_fees,
         COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'monthly_1pct'),         0) AS total_monthly_fees,
         COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'maturity_2pct'),        0) AS total_maturity_fees,
         COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'early_withdrawal_5pct'),0) AS total_penalty_fees
       FROM rent_savings_revenue
       WHERE tenant_id = $1`,
      [userId]
    );

    const upcomingDue = await db.query(
      `SELECT id, rent_due_date, monthly_rent_amount, total_saved, target_savings_amount,
              property_id
       FROM rent_savings_plans
       WHERE tenant_id = $1 AND status = 'active'
       ORDER BY rent_due_date ASC
       LIMIT 3`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        ...summary.rows[0],
        fees:        feesCharged.rows[0],
        upcoming_due: upcomingDue.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching savings summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch savings summary' });
  }
};


// ════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════

// ── ADMIN: GET ALL PLANS ─────────────────────────────────────
exports.adminGetAllPlans = async (req, res) => {
  try {
    const { status, tenant_id, property_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';

    if (status)      { params.push(status);      where += ` AND rsp.status = $${params.length}`; }
    if (tenant_id)   { params.push(tenant_id);   where += ` AND rsp.tenant_id = $${params.length}`; }
    if (property_id) { params.push(property_id); where += ` AND rsp.property_id = $${params.length}`; }

    const result = await db.query(
      `SELECT rsp.*,
              u.full_name AS tenant_name, u.email AS tenant_email,
              p.title     AS property_title, p.full_address AS property_address,
              COALESCE(c.contribution_count, 0)  AS contribution_count,
              COALESCE(c.total_contributed, 0)   AS total_contributed
       FROM rent_savings_plans rsp
       JOIN users u ON rsp.tenant_id = u.id
       JOIN properties p ON rsp.property_id = p.id
       LEFT JOIN (
         SELECT plan_id, COUNT(*) AS contribution_count, SUM(net_saved) AS total_contributed
         FROM rent_savings_contributions GROUP BY plan_id
       ) c ON rsp.id = c.plan_id
       ${where}
       ORDER BY rsp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countRes = await db.query(
      `SELECT COUNT(*) FROM rent_savings_plans rsp ${where}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRes.rows[0].count / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching all plans:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plans' });
  }
};

// ── ADMIN: GET ALL CONTRIBUTIONS ─────────────────────────────
exports.adminGetAllContributions = async (req, res) => {
  try {
    const { plan_id, tenant_id, month } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (plan_id)   { params.push(plan_id);   where += ` AND rsc.plan_id = $${params.length}`; }
    if (tenant_id) { params.push(tenant_id); where += ` AND rsc.tenant_id = $${params.length}`; }
    if (month)     { params.push(month);     where += ` AND rsc.saved_for_month = $${params.length}`; }

    const result = await db.query(
      `SELECT rsc.*,
              u.full_name AS tenant_name, u.email AS tenant_email,
              p.title     AS property_title
       FROM rent_savings_contributions rsc
       JOIN rent_savings_plans rsp ON rsc.plan_id = rsp.id
       JOIN users u ON rsc.tenant_id = u.id
       JOIN properties p ON rsp.property_id = p.id
       ${where}
       ORDER BY rsc.contributed_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch contributions' });
  }
};

// ── ADMIN: GET ALL EARLY WITHDRAWAL REQUESTS ──────────────
exports.adminGetEarlyWithdrawalRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';

    if (status) {
      params.push(status);
      where = `WHERE rsew.status = $1`;
    }

    const result = await db.query(
      `SELECT rsew.*,
              u.full_name        AS tenant_name,
              u.email            AS tenant_email,
              rsp.monthly_rent_amount,
              rsp.target_savings_amount,
              rsp.rent_due_date,
              p.title            AS property_title,
              admin.full_name    AS reviewed_by
       FROM rent_savings_early_withdrawals rsew
       JOIN rent_savings_plans rsp ON rsew.plan_id = rsp.id
       JOIN users u ON rsew.tenant_id = u.id
       JOIN properties p ON rsp.property_id = p.id
       LEFT JOIN users admin ON rsew.admin_id = admin.id
       ${where}
       ORDER BY rsew.requested_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching early withdrawal requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch early withdrawal requests' });
  }
};

// ── ADMIN: APPROVE EARLY WITHDRAWAL ────────────────────────
// Populates admin_id, reviewed_at from migration columns
// Creates withdrawal_requests with withdrawal_type = 'rent_savings_early'
// and penalty_fee from extended column
exports.adminApproveEarlyWithdrawal = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { id }    = req.params;
    const adminId   = req.user.id;

    const requestResult = await client.query(
      `SELECT * FROM rent_savings_early_withdrawals WHERE id = $1 AND status = 'pending'`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Pending request not found' });
    }

    const request = requestResult.rows[0];

    // Create withdrawal_requests record using extended migration columns
    const wrResult = await client.query(
      `INSERT INTO withdrawal_requests
         (user_id, amount, status, withdrawal_type, penalty_fee, description)
       VALUES ($1, $2, 'approved', 'rent_savings_early', $3, $4)
       RETURNING *`,
      [
        request.tenant_id,
        request.net_payout,
        request.penalty_5pct,
        `Early withdrawal from rent savings plan #${request.plan_id}`,
      ]
    );

    // Credit net payout to tenant wallet
    await client.query(
      `INSERT INTO wallet_transactions (user_id, amount, type, description, reference)
       VALUES ($1, $2, 'credit', $3, $4)`,
      [
        request.tenant_id,
        request.net_payout,
        `Early withdrawal from rent savings (Plan #${request.plan_id})`,
        `EW_${id}_${Date.now()}`,
      ]
    );

    // Record platform revenue — early_withdrawal_5pct type; link withdrawal_request_id
    await client.query(
      `INSERT INTO rent_savings_revenue
         (tenant_id, plan_id, withdrawal_request_id, revenue_type, amount, description)
       VALUES ($1, $2, $3, 'early_withdrawal_5pct', $4, $5)`,
      [
        request.tenant_id,
        request.plan_id,
        wrResult.rows[0].id,
        request.penalty_5pct,
        `5.8% early withdrawal penalty on plan #${request.plan_id}`,
      ]
    );

    // Update early withdrawal request — populate admin_id, reviewed_at
    await client.query(
      `UPDATE rent_savings_early_withdrawals
       SET status = 'approved', admin_id = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [adminId, id]
    );

    // Cancel the plan
    await client.query(
      `UPDATE rent_savings_plans SET status = 'cancelled', is_active = FALSE WHERE id = $1`,
      [request.plan_id]
    );

    await client.query('COMMIT');

    await NotificationService.sendNotification(
      request.tenant_id,
      'Early Withdrawal Approved',
      `Your early withdrawal request has been approved. ` +
      `₦${Number(request.net_payout).toLocaleString()} has been credited to your wallet (5.8% penalty deducted).`,
      'rent_savings_early_withdrawal_approved',
      request.plan_id,
      'rent_savings_plan'
    );

    res.json({
      success: true,
      message: 'Early withdrawal approved and funds credited to tenant wallet.',
      data: { net_payout: request.net_payout, penalty: request.penalty_5pct },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving early withdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to approve early withdrawal' });
  } finally {
    client.release();
  }
};

// ── ADMIN: REJECT EARLY WITHDRAWAL ─────────────────────────
// Populates admin_id, admin_note, reviewed_at
exports.adminRejectEarlyWithdrawal = async (req, res) => {
  try {
    const { id }         = req.params;
    const adminId        = req.user.id;
    const { admin_note } = req.body;

    const requestResult = await db.query(
      `SELECT * FROM rent_savings_early_withdrawals WHERE id = $1 AND status = 'pending'`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending request not found' });
    }

    await db.query(
      `UPDATE rent_savings_early_withdrawals
       SET status = 'rejected', admin_id = $1, admin_note = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [adminId, admin_note || null, id]
    );

    await NotificationService.sendNotification(
      requestResult.rows[0].tenant_id,
      'Early Withdrawal Rejected',
      admin_note
        ? `Your early withdrawal request was rejected: ${admin_note}`
        : 'Your early withdrawal request has been rejected. Please contact support.',
      'rent_savings_early_withdrawal_rejected',
      requestResult.rows[0].plan_id,
      'rent_savings_plan'
    );

    res.json({ success: true, message: 'Early withdrawal request rejected' });
  } catch (error) {
    console.error('Error rejecting early withdrawal:', error);
    res.status(500).json({ success: false, message: 'Failed to reject early withdrawal' });
  }
};

// ── ADMIN: GET SETUP FEES ────────────────────────────────────
exports.adminGetSetupFees = async (req, res) => {
  try {
    await ensureSetupFeeOperationSchema();
    const result = await db.query(`
      SELECT rsf.*,
             ls.name AS state_name,
             ll.name AS lga_name,
             COALESCE(ops.operations, '[]'::json) AS operations
      FROM rent_savings_setup_fees rsf
      LEFT JOIN locations ls ON rsf.state_id = ls.id
      LEFT JOIN locations ll ON rsf.lga_id   = ll.id
      LEFT JOIN LATERAL (
        SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
        FROM (
          SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
          FROM rent_savings_setup_fee_operations
          WHERE setup_fee_id = rsf.id
          ORDER BY created_at DESC, id DESC
          LIMIT 3
        ) operation_rows
      ) ops ON TRUE
      ORDER BY rsf.state_id, rsf.lga_id NULLS FIRST
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching setup fees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch setup fees' });
  }
};

// ── ADMIN: CREATE OR UPDATE SETUP FEE ───────────────────────
exports.adminCreateSetupFee = async (req, res) => {
  try {
    await ensureSetupFeeOperationSchema();
    const { state_id, lga_id, setup_fee } = req.body;
    const governanceNote = requireSetupFeeNote(req.body, 'A setup fee governance note is required');

    if (!state_id || setup_fee === undefined) {
      return res.status(400).json({ success: false, message: 'state_id and setup_fee are required' });
    }

    // Upsert: update if exists, insert if not
    const existing = await db.query(
      `SELECT id FROM rent_savings_setup_fees
       WHERE state_id = $1 AND (lga_id = $2 OR (lga_id IS NULL AND $2 IS NULL))`,
      [state_id, lga_id || null]
    );

    if (existing.rows.length > 0) {
      const result = await db.query(
        `UPDATE rent_savings_setup_fees SET setup_fee = $1 WHERE id = $2 RETURNING *`,
        [setup_fee, existing.rows[0].id]
      );
      await recordSetupFeeOperation({
        setupFeeId: result.rows[0].id,
        actor: req.user,
        eventType: 'setup_fee_updated',
        note: governanceNote,
        metadata: {
          state_id,
          lga_id: lga_id || null,
          setup_fee: result.rows[0].setup_fee,
        },
      });
      return res.json({ success: true, message: 'Setup fee updated', data: result.rows[0] });
    }

    const result = await db.query(
      `INSERT INTO rent_savings_setup_fees (state_id, lga_id, setup_fee)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [state_id, lga_id || null, setup_fee]
    );

    await recordSetupFeeOperation({
      setupFeeId: result.rows[0].id,
      actor: req.user,
      eventType: 'setup_fee_created',
      note: governanceNote,
      metadata: {
        state_id,
        lga_id: lga_id || null,
        setup_fee: result.rows[0].setup_fee,
      },
    });

    res.status(201).json({ success: true, message: 'Setup fee created', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating/updating setup fee:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create setup fee',
    });
  }
};

// ── ADMIN: DELETE SETUP FEE ──────────────────────────────────
// (Was broken/incomplete in original — fully implemented)
exports.adminDeleteSetupFee = async (req, res) => {
  try {
    await ensureSetupFeeOperationSchema();
    const { id } = req.params;
    const governanceNote = requireSetupFeeNote(req.body, 'A deletion reason is required');

    const existing = await db.query(
      `SELECT rsf.*, ls.name AS state_name, ll.name AS lga_name
       FROM rent_savings_setup_fees rsf
       LEFT JOIN locations ls ON rsf.state_id = ls.id
       LEFT JOIN locations ll ON rsf.lga_id = ll.id
       WHERE rsf.id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Setup fee not found' });
    }

    await db.query(`DELETE FROM rent_savings_setup_fees WHERE id = $1`, [id]);

    await recordSetupFeeOperation({
      setupFeeId: Number(id),
      actor: req.user,
      eventType: 'setup_fee_deleted',
      note: governanceNote,
      metadata: {
        state_id: existing.rows[0].state_id,
        state_name: existing.rows[0].state_name,
        lga_id: existing.rows[0].lga_id,
        lga_name: existing.rows[0].lga_name,
        setup_fee: existing.rows[0].setup_fee,
      },
    });

    res.json({ success: true, message: 'Setup fee deleted' });
  } catch (error) {
    console.error('Error deleting setup fee:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete setup fee',
    });
  }
};

// ── ADMIN: GET REVENUE LEDGER ────────────────────────────────
// Covers rent_savings_revenue table fully
exports.adminGetRevenueLedger = async (req, res) => {
  try {
    const { revenue_type, tenant_id, plan_id, date_from, date_to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (revenue_type) { params.push(revenue_type); where += ` AND rsr.revenue_type = $${params.length}`; }
    if (tenant_id)    { params.push(tenant_id);    where += ` AND rsr.tenant_id = $${params.length}`; }
    if (plan_id)      { params.push(plan_id);      where += ` AND rsr.plan_id = $${params.length}`; }
    if (date_from)    { params.push(date_from);    where += ` AND rsr.created_at >= $${params.length}`; }
    if (date_to)      { params.push(date_to);      where += ` AND rsr.created_at <= $${params.length}`; }

    const result = await db.query(
      `SELECT rsr.*,
              u.full_name AS tenant_name,
              u.email     AS tenant_email
       FROM rent_savings_revenue rsr
       JOIN users u ON rsr.tenant_id = u.id
       ${where}
       ORDER BY rsr.created_at DESC`,
      params
    );

    // Revenue totals by type
    const totals = await db.query(
      `SELECT
         revenue_type,
         COUNT(*)       AS count,
         SUM(amount)    AS total_amount
       FROM rent_savings_revenue
       GROUP BY revenue_type
       ORDER BY revenue_type`
    );

    res.json({
      success: true,
      data: result.rows,
      totals: totals.rows,
    });
  } catch (error) {
    console.error('Error fetching revenue ledger:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue ledger' });
  }
};

// ── ADMIN: DASHBOARD STATS ───────────────────────────────────
exports.adminGetStats = async (req, res) => {
  try {
    const planStats = await db.query(`
      SELECT
        COUNT(*)                                        AS total_plans,
        COUNT(*) FILTER (WHERE status = 'active')      AS active_plans,
        COUNT(*) FILTER (WHERE status = 'completed')   AS completed_plans,
        COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled_plans,
        COALESCE(SUM(total_saved), 0)                  AS total_funds_in_escrow,
        COALESCE(AVG(total_saved), 0)                  AS avg_savings_per_plan
      FROM rent_savings_plans
    `);

    const revenueStats = await db.query(`
      SELECT
        COALESCE(SUM(amount), 0)                                                      AS total_revenue,
        COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'setup_fee'),            0) AS setup_fee_revenue,
        COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'monthly_1pct'),         0) AS monthly_fee_revenue,
        COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'maturity_2pct'),        0) AS maturity_revenue,
        COALESCE(SUM(amount) FILTER (WHERE revenue_type = 'early_withdrawal_5pct'),0) AS penalty_revenue
      FROM rent_savings_revenue
    `);

    const pendingWithdrawals = await db.query(`
      SELECT COUNT(*) AS pending_early_withdrawals,
             COALESCE(SUM(requested_amount), 0) AS total_pending_amount
      FROM rent_savings_early_withdrawals
      WHERE status = 'pending'
    `);

    const contributionStats = await db.query(`
      SELECT
        COUNT(*)             AS total_contributions,
        COALESCE(SUM(amount), 0)       AS total_gross_contributed,
        COALESCE(SUM(net_saved), 0)    AS total_net_saved,
        COALESCE(SUM(commission_1pct), 0) AS total_1pct_collected
      FROM rent_savings_contributions
    `);

    res.json({
      success: true,
      data: {
        plans:        planStats.rows[0],
        revenue:      revenueStats.rows[0],
        withdrawals:  pendingWithdrawals.rows[0],
        contributions: contributionStats.rows[0],
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin stats' });
  }
};

// ── ADMIN: FORCE CANCEL A PLAN ───────────────────────────────
exports.adminCancelPlan = async (req, res) => {
  try {
    const { id }   = req.params;
    const { note } = req.body;

    const plan = await db.query(
      `SELECT * FROM rent_savings_plans WHERE id = $1`,
      [id]
    );

    if (plan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    if (plan.rows[0].status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Plan is already cancelled' });
    }

    await db.query(
      `UPDATE rent_savings_plans SET status = 'cancelled', is_active = FALSE WHERE id = $1`,
      [id]
    );

    await NotificationService.sendNotification(
      plan.rows[0].tenant_id,
      'Rent Savings Plan Cancelled',
      note || 'Your rent savings plan has been cancelled by an administrator. Please contact support.',
      'rent_savings_plan_cancelled',
      id,
      'rent_savings_plan'
    );

    res.json({ success: true, message: 'Plan cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling plan:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel plan' });
  }
};
