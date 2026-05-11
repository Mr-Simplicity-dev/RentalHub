const db = require('../config/middleware/database');

let subscriptionCreditSchemaReady = false;

const ensureSubscriptionCreditSchema = async (executor = db) => {
  if (subscriptionCreditSchemaReady) return;

  await executor.query(`
    CREATE TABLE IF NOT EXISTS subscription_credit_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscription_credit_ledger (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('credit','debit')),
      source VARCHAR(80) NOT NULL,
      reference VARCHAR(160),
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_subscription_credit_accounts_user
      ON subscription_credit_accounts(user_id);

    CREATE INDEX IF NOT EXISTS idx_subscription_credit_ledger_user
      ON subscription_credit_ledger(user_id, created_at DESC);
  `);

  subscriptionCreditSchemaReady = true;
};

const getSubscriptionCreditBalance = async (userId, executor = db) => {
  await ensureSubscriptionCreditSchema(executor);

  const result = await executor.query(
    `SELECT balance
     FROM subscription_credit_accounts
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows.length ? Number(result.rows[0].balance || 0) : 0;
};

const creditSubscriptionBalance = async ({
  userId,
  amount,
  source,
  reference = null,
  paymentId = null,
  metadata = null,
  executor = db,
}) => {
  const creditAmount = Number(amount || 0);

  if (!userId || !Number.isFinite(creditAmount) || creditAmount <= 0) {
    return null;
  }

  await ensureSubscriptionCreditSchema(executor);

  const accountResult = await executor.query(
    `INSERT INTO subscription_credit_accounts (user_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET
       balance = subscription_credit_accounts.balance + EXCLUDED.balance,
       updated_at = CURRENT_TIMESTAMP
     RETURNING balance`,
    [userId, creditAmount]
  );

  await executor.query(
    `INSERT INTO subscription_credit_ledger (
       user_id, amount, entry_type, source, reference, payment_id, metadata
     )
     VALUES ($1, $2, 'credit', $3, $4, $5, $6)`,
    [
      userId,
      creditAmount,
      source || 'subscription_credit',
      reference,
      paymentId,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return {
    balance: Number(accountResult.rows[0]?.balance || 0),
    credited: creditAmount,
  };
};

const debitSubscriptionBalance = async ({
  userId,
  amount,
  source,
  reference = null,
  paymentId = null,
  metadata = null,
  executor = db,
}) => {
  const debitAmount = Number(amount || 0);

  if (!userId || !Number.isFinite(debitAmount) || debitAmount <= 0) {
    return { debited: 0, balance: await getSubscriptionCreditBalance(userId, executor) };
  }

  await ensureSubscriptionCreditSchema(executor);

  await executor.query(
    `INSERT INTO subscription_credit_accounts (user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const accountResult = await executor.query(
    `SELECT balance
     FROM subscription_credit_accounts
     WHERE user_id = $1
     FOR UPDATE`,
    [userId]
  );

  const balance = Number(accountResult.rows[0]?.balance || 0);
  const debited = Math.min(balance, debitAmount);

  if (debited <= 0) {
    return { debited: 0, balance };
  }

  const updatedResult = await executor.query(
    `UPDATE subscription_credit_accounts
     SET balance = balance - $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
     RETURNING balance`,
    [userId, debited]
  );

  await executor.query(
    `INSERT INTO subscription_credit_ledger (
       user_id, amount, entry_type, source, reference, payment_id, metadata
     )
     VALUES ($1, $2, 'debit', $3, $4, $5, $6)`,
    [
      userId,
      debited,
      source || 'subscription_payment',
      reference,
      paymentId,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return {
    debited,
    balance: Number(updatedResult.rows[0]?.balance || 0),
  };
};

module.exports = {
  ensureSubscriptionCreditSchema,
  getSubscriptionCreditBalance,
  creditSubscriptionBalance,
  debitSubscriptionBalance,
};
