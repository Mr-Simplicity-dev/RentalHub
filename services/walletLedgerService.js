const db = require('../config/middleware/database');

const RENT_CLEARING_DAYS = Number(process.env.RENT_WALLET_CLEARING_DAYS || 20);
const RENT_PLATFORM_FEE_RATE = Number(process.env.RENT_PLATFORM_FEE_RATE || 0.025);

let walletLedgerSchemaReady = false;

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const ensureWalletLedgerSchema = async (executor = db) => {
  if (walletLedgerSchemaReady) return;

  await executor.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit')),
      status VARCHAR(30) NOT NULL DEFAULT 'cleared'
        CHECK (status IN ('pending', 'cleared', 'reversed', 'withdrawn')),
      source VARCHAR(60) NOT NULL DEFAULT 'general',
      description TEXT,
      reference VARCHAR(255),
      available_at TIMESTAMP,
      cleared_at TIMESTAMP,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE wallet_transactions
      ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'cleared',
      ADD COLUMN IF NOT EXISTS source VARCHAR(60) NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS available_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    DROP INDEX IF EXISTS idx_wallet_transactions_payment_source_once;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_payment_source_once
      ON wallet_transactions (payment_id, user_id, type, source)
      WHERE payment_id IS NOT NULL
        AND source IN ('rent_payment', 'wallet_funding');

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_once
      ON wallet_transactions (reference, user_id, type, source)
      WHERE reference IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_status
      ON wallet_transactions (user_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_pending_available
      ON wallet_transactions (status, available_at)
      WHERE status = 'pending';
  `);

  walletLedgerSchemaReady = true;
};

const getWalletBalance = async (userId, executor = db) => {
  await ensureWalletLedgerSchema(executor);
  const result = await executor.query(
    `SELECT COALESCE(balance, 0)::NUMERIC AS balance
     FROM wallets
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return Number(result.rows[0]?.balance || 0);
};

const getLandlordRentDeductionTotal = async (landlordId, executor = db) => {
  const result = await executor.query(
    `SELECT COALESCE(SUM(amount), 0)::NUMERIC AS deducted_amount
     FROM landlord_rent_deductions
     WHERE landlord_id = $1`,
    [landlordId]
  );
  return Number(result.rows[0]?.deducted_amount || 0);
};

const createWalletTransaction = async ({
  userId,
  paymentId = null,
  amount,
  type,
  status = 'cleared',
  source = 'general',
  description = '',
  reference = null,
  availableAt = null,
  metadata = {},
  executor = db,
}) => {
  await ensureWalletLedgerSchema(executor);

  const normalizedAmount = money(amount);
  if (!userId || normalizedAmount <= 0 || !['credit', 'debit'].includes(type)) {
    return null;
  }

  const insert = await executor.query(
    `INSERT INTO wallet_transactions (
       user_id, payment_id, amount, type, status, source, description,
       reference, available_at, cleared_at, metadata
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, CASE WHEN $5 = 'cleared' THEN CURRENT_TIMESTAMP ELSE NULL END, $10::jsonb
     )
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      userId,
      paymentId,
      normalizedAmount,
      type,
      status,
      source,
      description,
      reference,
      availableAt,
      JSON.stringify(metadata || {}),
    ]
  );

  if (!insert.rows.length) {
    const existing = await executor.query(
      `SELECT *
       FROM wallet_transactions
       WHERE user_id = $1
         AND type = $2
         AND source = $3
         AND (
           ($4::INTEGER IS NOT NULL AND payment_id = $4)
           OR ($5::TEXT IS NOT NULL AND reference = $5)
         )
       ORDER BY id DESC
       LIMIT 1`,
      [userId, type, source, paymentId, reference]
    );
    return existing.rows[0] || null;
  }

  const transaction = insert.rows[0];

  if (status === 'cleared') {
    const delta = type === 'credit' ? normalizedAmount : -normalizedAmount;
    await executor.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET balance = wallets.balance + $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, delta]
    );
  }

  return transaction;
};

const creditWallet = (payload) =>
  createWalletTransaction({ ...payload, type: 'credit' });

const debitWallet = (payload) =>
  createWalletTransaction({ ...payload, type: 'debit', status: 'cleared' });

const calculateRentCredit = (grossAmount) => {
  const gross = money(grossAmount);
  const platformFee = money(gross * RENT_PLATFORM_FEE_RATE);
  return {
    gross,
    platformFee,
    net: money(gross - platformFee),
    rate: RENT_PLATFORM_FEE_RATE,
  };
};

const creditLandlordRentPayment = async ({ paymentId, reference = null, executor = db }) => {
  await ensureWalletLedgerSchema(executor);

  const result = await executor.query(
    `SELECT p.*,
            prop.landlord_id,
            prop.title AS property_title
     FROM payments p
     JOIN properties prop ON prop.id = p.property_id
     WHERE p.id = $1
       AND p.payment_type = 'rent_payment'
     LIMIT 1`,
    [paymentId]
  );

  if (!result.rows.length) return null;

  const payment = result.rows[0];
  if (payment.payment_status !== 'completed' || !payment.landlord_id) return null;

  const amounts = calculateRentCredit(payment.amount);
  if (amounts.net <= 0) return null;

  const completedAt = payment.completed_at ? new Date(payment.completed_at) : new Date();
  const availableAt = new Date(completedAt.getTime() + RENT_CLEARING_DAYS * 24 * 60 * 60 * 1000);

  return creditWallet({
    userId: payment.landlord_id,
    paymentId: payment.id,
    amount: amounts.net,
    status: 'pending',
    source: 'rent_payment',
    reference: reference || payment.transaction_reference || `RENT_${payment.id}`,
    availableAt,
    description: `Pending rent credit for ${payment.property_title || 'property'} (Payment #${payment.id})`,
    metadata: {
      gross_amount: amounts.gross,
      platform_fee: amounts.platformFee,
      platform_fee_rate: amounts.rate,
      clearing_days: RENT_CLEARING_DAYS,
      property_id: payment.property_id,
      tenant_id: payment.user_id,
    },
    executor,
  });
};

const clearMaturedLandlordRentCredits = async ({ landlordId = null, limit = 500 } = {}) => {
  await ensureWalletLedgerSchema();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const params = [limit];
    let landlordFilter = '';
    if (landlordId) {
      params.push(landlordId);
      landlordFilter = `AND wt.user_id = $2`;
    }

    const creditsResult = await client.query(
      `SELECT wt.id, wt.user_id, wt.amount
       FROM wallet_transactions wt
       JOIN payments p ON p.id = wt.payment_id
       WHERE wt.type = 'credit'
         AND wt.source = 'rent_payment'
         AND wt.status = 'pending'
         AND wt.available_at <= CURRENT_TIMESTAMP
         AND p.payment_status = 'completed'
         ${landlordFilter}
         AND NOT EXISTS (
           SELECT 1
           FROM refund_requests rr
           WHERE rr.payment_id = wt.payment_id
             AND rr.status IN ('pending', 'approved')
         )
       ORDER BY wt.available_at ASC
       LIMIT $1
       FOR UPDATE OF wt SKIP LOCKED`,
      params
    );

    for (const credit of creditsResult.rows) {
      await client.query(
        `UPDATE wallet_transactions
         SET status = 'cleared',
             cleared_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status = 'pending'`,
        [credit.id]
      );

      await client.query(
        `INSERT INTO wallets (user_id, balance)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET balance = wallets.balance + $2, updated_at = CURRENT_TIMESTAMP`,
        [credit.user_id, Number(credit.amount)]
      );
    }

    await client.query('COMMIT');

    return {
      cleared_count: creditsResult.rows.length,
      cleared_amount: creditsResult.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const reverseLandlordRentCreditForPayment = async ({
  paymentId,
  amount,
  reason = 'Rent refund approved',
  executor = db,
}) => {
  await ensureWalletLedgerSchema(executor);

  const credits = await executor.query(
    `SELECT *
     FROM wallet_transactions
     WHERE payment_id = $1
       AND source = 'rent_payment'
       AND type = 'credit'
       AND status IN ('pending', 'cleared')
     ORDER BY id DESC`,
    [paymentId]
  );

  let remaining = money(amount);
  for (const credit of credits.rows) {
    if (remaining <= 0) break;

    const creditAmount = Number(credit.amount || 0);
    const reversalAmount = Math.min(creditAmount, remaining);
    const nextAmount = money(creditAmount - reversalAmount);

    await executor.query(
      `UPDATE wallet_transactions
       SET amount = $1,
           status = CASE WHEN $1 <= 0 THEN 'reversed' ELSE status END,
           metadata = metadata || $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        nextAmount,
        JSON.stringify({
          refund_reversed_amount: reversalAmount,
          refund_reversed_at: new Date().toISOString(),
          refund_reversal_reason: reason,
        }),
        credit.id,
      ]
    );

    if (credit.status === 'cleared') {
      await debitWallet({
        userId: credit.user_id,
        paymentId,
        amount: reversalAmount,
        source: 'rent_refund',
        reference: `REFUND_REVERSAL_${paymentId}_${credit.id}`,
        description: reason,
        metadata: { original_credit_id: credit.id },
        executor,
      });
    }

    remaining = money(remaining - reversalAmount);
  }
};

const getWalletCreditSummaryForUser = async (userId, executor = db) => {
  await ensureWalletLedgerSchema(executor);
  const [walletResult, rentResult] = await Promise.all([
    executor.query(
      `SELECT COALESCE(balance, 0)::NUMERIC AS balance
       FROM wallets
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    ),
    executor.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE source = 'rent_payment' AND status = 'pending'), 0)::NUMERIC AS pending_rent,
         COALESCE(SUM(amount) FILTER (WHERE source = 'rent_payment' AND status = 'cleared'), 0)::NUMERIC AS cleared_rent,
         COALESCE(SUM(amount) FILTER (WHERE source = 'rent_refund'), 0)::NUMERIC AS rent_refund_reversals
       FROM wallet_transactions
       WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    wallet_balance: Number(walletResult.rows[0]?.balance || 0),
    pending_rent: Number(rentResult.rows[0]?.pending_rent || 0),
    cleared_rent: Number(rentResult.rows[0]?.cleared_rent || 0),
    rent_refund_reversals: Number(rentResult.rows[0]?.rent_refund_reversals || 0),
  };
};

module.exports = {
  ensureWalletLedgerSchema,
  creditWallet,
  debitWallet,
  creditLandlordRentPayment,
  clearMaturedLandlordRentCredits,
  reverseLandlordRentCreditForPayment,
  getWalletBalance,
  getWalletCreditSummaryForUser,
  getLandlordRentDeductionTotal,
  calculateRentCredit,
  RENT_CLEARING_DAYS,
};
