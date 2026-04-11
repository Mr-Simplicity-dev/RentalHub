const db = require('../config/middleware/database');
const {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
} = require('./paystackTransfer.service');

let payoutSchemaReady = false;

const ensurePayoutSchema = async () => {
  if (payoutSchemaReady) return;
  await db.query(`
    ALTER TABLE agent_withdrawal_requests
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS account_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
      ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT,
      ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

    ALTER TABLE withdrawal_requests
      ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(30),
      ADD COLUMN IF NOT EXISTS account_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
      ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT,
      ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

    ALTER TABLE admin_withdrawals
      ADD COLUMN IF NOT EXISTS bank_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(30),
      ADD COLUMN IF NOT EXISTS account_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_reference VARCHAR(120),
      ADD COLUMN IF NOT EXISTS paystack_transfer_status VARCHAR(40),
      ADD COLUMN IF NOT EXISTS paystack_last_response JSONB,
      ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT,
      ADD COLUMN IF NOT EXISTS payout_retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
  `);
  payoutSchemaReady = true;
};

const RETRY_MAX_ATTEMPTS = Math.max(Number(process.env.PAYOUT_RETRY_MAX_ATTEMPTS) || 3, 1);
const RETRY_COOLDOWN_MINUTES = Math.max(Number(process.env.PAYOUT_RETRY_COOLDOWN_MINUTES) || 15, 1);

const canRetry = (item) => {
  const attempts = Number(item.payout_retry_count || 0);
  if (attempts >= RETRY_MAX_ATTEMPTS) return false;

  if (!item.last_retry_at) return true;
  const elapsedMs = Date.now() - new Date(item.last_retry_at).getTime();
  return elapsedMs >= RETRY_COOLDOWN_MINUTES * 60 * 1000;
};

const insertRetryAudit = async ({
  sourceTable,
  sourceId,
  retryAttempt,
  oldStatus,
  newStatus,
  transferReference,
  transferCode,
  outcome,
  message,
  payload,
}) => {
  await db.query(
    `INSERT INTO payout_retry_audit
       (source_table, source_id, retry_attempt, old_status, new_status,
        transfer_reference, transfer_code, outcome, message, response_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      sourceTable,
      sourceId,
      retryAttempt,
      oldStatus || null,
      newStatus || null,
      transferReference || null,
      transferCode || null,
      outcome,
      message || null,
      JSON.stringify(payload || {}),
    ]
  );
};

const logSecurityAudit = async ({ action, targetType, targetId, metadata }) => {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [null, action, targetType, targetId, JSON.stringify(metadata || {})]
  );
};

const retryAgentWithdrawals = async (limit) => {
  const result = await db.query(
    `SELECT *
     FROM agent_withdrawal_requests
     WHERE paystack_transfer_status IN ('failed', 'reversed')
       AND status IN ('approved', 'processing')
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  const summary = { scanned: result.rows.length, retried: 0, skipped: 0, errors: 0 };

  for (const item of result.rows) {
    if (!canRetry(item)) {
      summary.skipped += 1;
      continue;
    }

    const attempt = Number(item.payout_retry_count || 0) + 1;

    try {
      let recipientCode = item.paystack_recipient_code;
      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: item.account_name,
          accountNumber: item.account_number,
          bankCode: item.bank_code,
        });
        recipientCode = recipient.recipient_code;
      }

      const reference = `AGW_${item.id}_R${attempt}_${Date.now()}`;
      const transfer = await initiateTransfer({
        amount: item.amount,
        recipientCode,
        reason: `Agent withdrawal retry #${item.id}`,
        reference,
      });

      await db.query(
        `UPDATE agent_withdrawal_requests
         SET status = 'processing',
             paystack_recipient_code = $1,
             paystack_transfer_code = $2,
             paystack_transfer_reference = $3,
             paystack_transfer_status = $4,
             paystack_last_response = $5,
             payout_attempted_at = CURRENT_TIMESTAMP,
             payout_retry_count = $6,
             last_retry_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          recipientCode,
          transfer?.transfer_code || null,
          transfer?.reference || reference,
          transfer?.status || 'pending',
          JSON.stringify(transfer || {}),
          attempt,
          item.id,
        ]
      );

      await db.query(
        `INSERT INTO agent_withdrawal_audit
           (withdrawal_request_id, action_type, old_status, new_status, performed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, 'withdrawal_retry_initiated', item.status, 'processing', null, `Auto retry attempt ${attempt}`]
      );

      await insertRetryAudit({
        sourceTable: 'agent_withdrawal_requests',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: 'processing',
        transferReference: transfer?.reference || reference,
        transferCode: transfer?.transfer_code,
        outcome: 'initiated',
        message: 'Retry transfer initiated',
        payload: transfer,
      });

      summary.retried += 1;
    } catch (error) {
      await db.query(
        `UPDATE agent_withdrawal_requests
         SET payout_retry_count = $1,
             last_retry_at = CURRENT_TIMESTAMP,
             payout_failed_reason = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [attempt, error.message, item.id]
      );

      await insertRetryAudit({
        sourceTable: 'agent_withdrawal_requests',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: item.status,
        outcome: 'failed_to_initiate',
        message: error.message,
      });

      summary.errors += 1;
    }
  }

  return summary;
};

const retryWalletWithdrawals = async (limit) => {
  const result = await db.query(
    `SELECT *
     FROM withdrawal_requests
     WHERE paystack_transfer_status IN ('failed', 'reversed')
       AND status IN ('pending', 'approved')
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  const summary = { scanned: result.rows.length, retried: 0, skipped: 0, errors: 0 };

  for (const item of result.rows) {
    if (!canRetry(item)) {
      summary.skipped += 1;
      continue;
    }

    const attempt = Number(item.payout_retry_count || 0) + 1;

    try {
      const bankCode = item.bank_code || await resolveBankCodeFromName(item.bank_name);
      let recipientCode = item.paystack_recipient_code;

      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: item.account_name,
          accountNumber: item.account_number,
          bankCode,
        });
        recipientCode = recipient.recipient_code;
      }

      const reference = `WLW_${item.id}_R${attempt}_${Date.now()}`;
      const transfer = await initiateTransfer({
        amount: item.amount,
        recipientCode,
        reason: `Wallet withdrawal retry #${item.id}`,
        reference,
      });

      await db.query(
        `UPDATE withdrawal_requests
         SET status = 'approved',
             bank_code = $1,
             paystack_recipient_code = $2,
             paystack_transfer_code = $3,
             paystack_transfer_reference = $4,
             paystack_transfer_status = $5,
             paystack_last_response = $6,
             payout_attempted_at = CURRENT_TIMESTAMP,
             payout_retry_count = $7,
             last_retry_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          bankCode,
          recipientCode,
          transfer?.transfer_code || null,
          transfer?.reference || reference,
          transfer?.status || 'pending',
          JSON.stringify(transfer || {}),
          attempt,
          item.id,
        ]
      );

      await logSecurityAudit({
        action: 'wallet_withdrawal_retry_initiated',
        targetType: 'wallet_withdrawal',
        targetId: item.id,
        metadata: { retry_attempt: attempt, reference: transfer?.reference || reference },
      });

      await insertRetryAudit({
        sourceTable: 'withdrawal_requests',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: 'approved',
        transferReference: transfer?.reference || reference,
        transferCode: transfer?.transfer_code,
        outcome: 'initiated',
        message: 'Retry transfer initiated',
        payload: transfer,
      });

      summary.retried += 1;
    } catch (error) {
      await db.query(
        `UPDATE withdrawal_requests
         SET payout_retry_count = $1,
             last_retry_at = CURRENT_TIMESTAMP,
             payout_failed_reason = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [attempt, error.message, item.id]
      );

      await insertRetryAudit({
        sourceTable: 'withdrawal_requests',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: item.status,
        outcome: 'failed_to_initiate',
        message: error.message,
      });

      summary.errors += 1;
    }
  }

  return summary;
};

const retryStateAdminWithdrawals = async (limit) => {
  const result = await db.query(
    `SELECT *
     FROM admin_withdrawals
     WHERE paystack_transfer_status IN ('failed', 'reversed')
       AND status IN ('pending', 'approved')
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  const summary = { scanned: result.rows.length, retried: 0, skipped: 0, errors: 0 };

  for (const item of result.rows) {
    if (!canRetry(item)) {
      summary.skipped += 1;
      continue;
    }

    const attempt = Number(item.payout_retry_count || 0) + 1;

    try {
      const bankCode = item.bank_code || await resolveBankCodeFromName(item.bank_name);
      let recipientCode = item.paystack_recipient_code;

      if (!recipientCode) {
        const recipient = await createTransferRecipient({
          name: item.account_name,
          accountNumber: item.account_number,
          bankCode,
        });
        recipientCode = recipient.recipient_code;
      }

      const reference = `SAW_${item.id}_R${attempt}_${Date.now()}`;
      const transfer = await initiateTransfer({
        amount: item.amount,
        recipientCode,
        reason: `State admin withdrawal retry #${item.id}`,
        reference,
      });

      await db.query(
        `UPDATE admin_withdrawals
         SET status = 'approved',
             bank_code = $1,
             paystack_recipient_code = $2,
             paystack_transfer_code = $3,
             paystack_transfer_reference = $4,
             paystack_transfer_status = $5,
             paystack_last_response = $6,
             payout_attempted_at = CURRENT_TIMESTAMP,
             payout_retry_count = $7,
             last_retry_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          bankCode,
          recipientCode,
          transfer?.transfer_code || null,
          transfer?.reference || reference,
          transfer?.status || 'pending',
          JSON.stringify(transfer || {}),
          attempt,
          item.id,
        ]
      );

      await logSecurityAudit({
        action: 'state_admin_withdrawal_retry_initiated',
        targetType: 'admin_withdrawal',
        targetId: item.id,
        metadata: { retry_attempt: attempt, reference: transfer?.reference || reference },
      });

      await insertRetryAudit({
        sourceTable: 'admin_withdrawals',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: 'approved',
        transferReference: transfer?.reference || reference,
        transferCode: transfer?.transfer_code,
        outcome: 'initiated',
        message: 'Retry transfer initiated',
        payload: transfer,
      });

      summary.retried += 1;
    } catch (error) {
      await db.query(
        `UPDATE admin_withdrawals
         SET payout_retry_count = $1,
             last_retry_at = CURRENT_TIMESTAMP,
             payout_failed_reason = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [attempt, error.message, item.id]
      );

      await insertRetryAudit({
        sourceTable: 'admin_withdrawals',
        sourceId: item.id,
        retryAttempt: attempt,
        oldStatus: item.status,
        newStatus: item.status,
        outcome: 'failed_to_initiate',
        message: error.message,
      });

      summary.errors += 1;
    }
  }

  return summary;
};

const runPayoutRetryCycle = async () => {
  await ensurePayoutSchema();
  const limitPerTable = Math.max(Number(process.env.PAYOUT_RETRY_BATCH_SIZE) || 20, 1);

  const [agent, wallet, stateAdmin] = await Promise.all([
    retryAgentWithdrawals(limitPerTable),
    retryWalletWithdrawals(limitPerTable),
    retryStateAdminWithdrawals(limitPerTable),
  ]);

  return {
    config: {
      maxAttempts: RETRY_MAX_ATTEMPTS,
      cooldownMinutes: RETRY_COOLDOWN_MINUTES,
      limitPerTable,
    },
    agent,
    wallet,
    stateAdmin,
  };
};

module.exports = {
  runPayoutRetryCycle,
};
