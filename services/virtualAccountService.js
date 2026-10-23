const crypto = require('crypto');
const db = require('../config/middleware/database');
const { creditWallet } = require('./walletLedgerService');
const { sendReceiptForPayment } = require('../config/utils/paymentReceipt');
const { decryptNIN } = require('../config/utils/ninEncryption');
const { getProvider, getProviderByName, resolveProviderName } = require('./virtualAccounts');

const MIN_WALLET_FUNDING = 100;
const RECONCILE_INTERVAL_MS = Number(process.env.VIRTUAL_ACCOUNT_RECONCILE_INTERVAL_MS) || 30000;
const lastReconciledAt = new Map();
let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;

  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified_name VARCHAR(200)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS virtual_accounts (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL,
      kind VARCHAR(20) NOT NULL CHECK (kind IN ('dva', 'one_time')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      registration_reference VARCHAR(255),
      account_reference VARCHAR(160) NOT NULL,
      provider_reference VARCHAR(160),
      account_number VARCHAR(30) NOT NULL,
      account_name VARCHAR(200),
      bank_name VARCHAR(120),
      bank_code VARCHAR(20),
      amount_expected NUMERIC(12, 2),
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'closed', 'paid')),
      expires_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS virtual_account_events (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL,
      event_id VARCHAR(200) NOT NULL,
      event_type VARCHAR(60),
      virtual_account_id INTEGER REFERENCES virtual_accounts(id) ON DELETE SET NULL,
      account_number VARCHAR(30),
      account_reference VARCHAR(160),
      payment_reference VARCHAR(160),
      amount NUMERIC(12, 2),
      sender_name VARCHAR(200),
      sender_bank VARCHAR(120),
      status VARCHAR(30),
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      processed_at TIMESTAMPTZ,
      failure_reason TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, event_id)
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_reference
      ON virtual_accounts (provider, account_reference);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_number
      ON virtual_accounts (provider, account_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_virtual_accounts_one_dva_per_user
      ON virtual_accounts (user_id)
      WHERE kind = 'dva' AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user
      ON virtual_accounts (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_virtual_accounts_registration
      ON virtual_accounts (registration_reference, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_virtual_accounts_status
      ON virtual_accounts (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_virtual_account_events_account
      ON virtual_account_events (virtual_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_virtual_account_events_unprocessed
      ON virtual_account_events (provider, processed, created_at ASC);
  `);

  schemaReady = true;
};

const isEnabled = () => Boolean(getProvider());

const getConfig = () => {
  const provider = getProvider();
  return {
    enabled: Boolean(provider),
    provider: provider ? provider.name : resolveProviderName(),
    manual_fallback: true,
  };
};

// NIN may be stored as the iv:authTag:ciphertext envelope or, on old rows, as
// plaintext. It is only ever decrypted here, immediately before being handed to
// the identity-checked partner bank.
const readNIN = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.split(':').length === 3) return decryptNIN(raw);
  return raw;
};

const sanitizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 150);

// The partner bank only opens an account in a name that matches the identity
// record, so the verified name wins over whatever was typed at sign-up.
const resolveAccountName = (user = {}) => {
  const verified = sanitizeName(user.identity_verified_name);
  if (verified.length >= 3) return verified;
  return sanitizeName(user.full_name);
};

const accountReferenceForUser = (userId) => `RENTALHUB-DVA-${Number(userId)}`;

const oneTimeReferenceFor = (registrationReference) =>
  `RENTALHUB-OT-${crypto
    .createHash('sha256')
    .update(String(registrationReference))
    .digest('hex')
    .slice(0, 32)}`;

const serializeAccount = (row) => ({
  id: row.id,
  provider: row.provider,
  kind: row.kind,
  account_number: row.account_number,
  account_name: row.account_name,
  bank_name: row.bank_name,
  bank_code: row.bank_code,
  amount_expected: row.amount_expected === null ? null : Number(row.amount_expected),
  status: row.status,
  expires_at: row.expires_at,
  reference: row.registration_reference || row.account_reference,
});

const findActiveAccount = async ({ userId, registrationReference, kind }) => {
  const conditions = ['status = $1'];
  const params = ['active'];

  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (registrationReference) {
    params.push(registrationReference);
    conditions.push(`registration_reference = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    conditions.push(`kind = $${params.length}`);
  }

  const result = await db.query(
    `SELECT * FROM virtual_accounts
     WHERE ${conditions.join(' AND ')}
     ORDER BY id DESC
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
};

// ─── Permanent account (wallet funding) ─────────────────────────────────────

const getWalletAccountForUser = async ({ userId, logger = console }) => {
  if (!isEnabled()) {
    return { available: false, reason: 'disabled' };
  }

  await ensureSchema();

  const userResult = await db.query(
    `SELECT id, full_name, email, nin, identity_verified_name, nin_verified
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    return { available: false, reason: 'user_not_found' };
  }

  const existing = await findActiveAccount({ userId, kind: 'dva' });
  if (existing) {
    return { available: true, account: serializeAccount(existing), instant: true };
  }

  const nin = readNIN(user.nin);
  if (!nin) {
    return {
      available: false,
      reason: 'identity_required',
      message: 'Automatic wallet accounts need a verified NIN. You can still fund your wallet by bank transfer.',
    };
  }

  const accountName = resolveAccountName(user);
  if (!accountName) {
    return {
      available: false,
      reason: 'identity_required',
      message: 'Your identity record has no usable name yet. Use the manual transfer option instead.',
    };
  }

  const provider = getProvider();
  const accountReference = accountReferenceForUser(user.id);

  try {
    const created = await provider.createDedicatedAccount({
      reference: accountReference,
      name: accountName,
      email: user.email,
      nin,
    });

    const result = await db.query(
      `INSERT INTO virtual_accounts
         (provider, kind, user_id, account_reference, provider_reference, account_number,
          account_name, bank_name, bank_code, status, metadata)
       VALUES ($1, 'dva', $2, $3, $4, $5, $6, $7, $8, 'active', $9)
       ON CONFLICT (provider, account_reference) DO UPDATE
         SET account_number = EXCLUDED.account_number,
             account_name = EXCLUDED.account_name,
             bank_name = EXCLUDED.bank_name,
             bank_code = EXCLUDED.bank_code,
             provider_reference = EXCLUDED.provider_reference,
             status = 'active',
             updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        created.provider,
        user.id,
        created.accountReference || accountReference,
        created.providerReference,
        created.accountNumber,
        created.accountName,
        created.bankName,
        created.bankCode,
        JSON.stringify(created.metadata || {}),
      ]
    );

    return { available: true, account: serializeAccount(result.rows[0]), instant: false };
  } catch (error) {
    if (error.code === '23505') {
      const raced = await findActiveAccount({ userId, kind: 'dva' });
      if (raced) return { available: true, account: serializeAccount(raced), instant: true };
    }
    logger.error('Virtual account creation failed:', error.message);
    return {
      available: false,
      reason: 'provider_error',
      message: 'The automatic account could not be created right now. Please use the manual transfer option.',
    };
  }
};

// ─── One-time account (registration fee) ────────────────────────────────────

const createRegistrationAccount = async ({ registration, logger = console }) => {
  if (!isEnabled()) {
    return { available: false, reason: 'disabled' };
  }

  await ensureSchema();

  const reference = registration.transaction_reference;
  const existing = await findActiveAccount({ registrationReference: reference, kind: 'one_time' });

  if (existing) {
    const expired = existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now();
    if (!expired) {
      return { available: true, account: serializeAccount(existing), instant: true };
    }

    await db.query(
      `UPDATE virtual_accounts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [existing.id]
    );
  }

  const amount = Number(registration.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { available: false, reason: 'invalid_amount' };
  }

  const name = sanitizeName(
    registration.registration_payload?.verified_identity_name ||
    registration.registration_payload?.full_name ||
    registration.full_name
  );

  const provider = getProvider();
  // A fresh suffix per attempt: providers reject a repeated payment/order
  // reference, and an expired one-time account may need replacing.
  const accountReference = `${oneTimeReferenceFor(reference)}-${Date.now().toString(36).slice(-6)}`;

  try {
    const created = await provider.createOneTimeAccount({
      reference: accountReference,
      amount,
      name,
      email: registration.email,
      description: `RentalHub registration ${reference}`,
      redirectUrl: `${process.env.FRONTEND_URL || 'https://rentalhub.com.ng'}/register`,
    });

    const result = await db.query(
      `INSERT INTO virtual_accounts
         (provider, kind, registration_reference, account_reference, provider_reference,
          account_number, account_name, bank_name, bank_code, amount_expected,
          status, expires_at, metadata)
       VALUES ($1, 'one_time', $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11)
       ON CONFLICT (provider, account_reference) DO UPDATE
         SET account_number = EXCLUDED.account_number,
             account_name = EXCLUDED.account_name,
             bank_name = EXCLUDED.bank_name,
             bank_code = EXCLUDED.bank_code,
             provider_reference = EXCLUDED.provider_reference,
             amount_expected = EXCLUDED.amount_expected,
             status = 'active',
             expires_at = EXCLUDED.expires_at,
             updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        created.provider,
        reference,
        created.accountReference || accountReference,
        created.providerReference,
        created.accountNumber,
        created.accountName,
        created.bankName,
        created.bankCode,
        amount,
        created.expiresAt,
        JSON.stringify(created.metadata || {}),
      ]
    );

    return { available: true, account: serializeAccount(result.rows[0]), instant: false };
  } catch (error) {
    logger.error('Registration transfer account creation failed:', error.message);
    return {
      available: false,
      reason: 'provider_error',
      message: 'The automatic transfer account could not be created. The manual transfer option is still available.',
    };
  }
};

const getRegistrationAccountStatus = async ({ reference }) => {
  if (!isEnabled()) return { available: false, reason: 'disabled' };

  await ensureSchema();

  const result = await db.query(
    `SELECT va.*, trp.registered_user_id, trp.payment_status
     FROM virtual_accounts va
     LEFT JOIN tenant_registration_payments trp
       ON trp.transaction_reference = va.registration_reference
     WHERE va.registration_reference = $1 AND va.kind = 'one_time'
     ORDER BY va.id DESC
     LIMIT 1`,
    [reference]
  );

  const row = result.rows[0];
  if (!row) return { available: false, reason: 'not_found' };

  const paid = row.status === 'paid' || Boolean(row.registered_user_id) || row.payment_status === 'completed';

  return {
    available: true,
    paid,
    registered: Boolean(row.registered_user_id),
    account: serializeAccount(row),
  };
};

// ─── Webhook processing ─────────────────────────────────────────────────────

const markEvent = async (eventRowId, { success, failureReason = null, accountId = null }) => {
  await db.query(
    `UPDATE virtual_account_events
     SET processed = $1,
         processed_at = CURRENT_TIMESTAMP,
         failure_reason = $2,
         virtual_account_id = COALESCE(virtual_account_id, $3)
     WHERE id = $4`,
    [success, failureReason, accountId, eventRowId]
  );
};

const applyWalletCredit = async ({ account, event, providerName, logger }) => {
  const reference = event.providerReference
    ? `VA-${providerName}-${event.providerReference}`.slice(0, 200)
    : `VA-${providerName}-${event.eventId}`.slice(0, 200);

  const paymentResult = await db.query(
    `INSERT INTO payments
       (user_id, payment_type, amount, currency, payment_method, transaction_reference,
        payment_status, gateway_response, completed_at, payment_channel)
     VALUES ($1, 'wallet_funding', $2, 'NGN', 'virtual_account', $3,
             'completed', $4, CURRENT_TIMESTAMP, 'virtual_account')
     ON CONFLICT (transaction_reference) DO NOTHING
     RETURNING id`,
    [
      account.user_id,
      event.amount,
      reference,
      JSON.stringify({
        gateway: providerName,
        virtual_account_id: account.id,
        account_number: account.account_number,
        sender_name: event.senderName,
        sender_bank: event.senderBank,
        paid_at: event.paidAt,
      }),
    ]
  );

  if (!paymentResult.rows.length) {
    return { status: 'duplicate', message: 'This transfer was already credited' };
  }

  const paymentId = paymentResult.rows[0].id;

  await creditWallet({
    userId: account.user_id,
    paymentId,
    amount: event.amount,
    source: 'wallet_funding',
    reference,
    description: `Wallet funding ${reference}`,
    metadata: {
      payment_type: 'wallet_funding',
      gateway: providerName,
      virtual_account_id: account.id,
    },
  });

  try {
    const { processPaymentCommission } = require('./commissionService');
    if (typeof processPaymentCommission === 'function') {
      processPaymentCommission(paymentId).catch(() => {});
    }
  } catch (error) {
    logger.error('Virtual account commission failed (non-fatal):', error.message);
  }

  sendReceiptForPayment(paymentId).catch(() => {});

  return {
    status: 'credited',
    payment_id: paymentId,
    user_id: account.user_id,
    amount: event.amount,
  };
};

const applyRegistrationCredit = async ({ account, event, providerName, logger }) => {
  const authService = require('./authService');

  // Only one caller may settle this transfer. A webhook and a status-poll
  // reconciliation can arrive at the same time, and both would otherwise try to
  // create the same account. An expired account still accepts a late credit.
  const claim = await db.query(
    `UPDATE virtual_accounts
     SET status = 'paid', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('active', 'expired')
     RETURNING id`,
    [account.id]
  );

  if (!claim.rows.length) {
    return { status: 'duplicate', message: 'This transfer was already applied' };
  }

  try {
    const result = await authService.finalizeVirtualAccountRegistration({
      reference: account.registration_reference,
      payment: {
        provider: providerName,
        virtual_account_id: account.id,
        account_number: account.account_number,
        transaction_reference: event.providerReference,
        amount_confirmed: event.amount,
        sender_name: event.senderName,
        sender_bank: event.senderBank,
        paid_at: event.paidAt,
      },
      logger,
    });

    return {
      status: 'registration_completed',
      user_id: result?.data?.user?.id || result?.user_id || null,
    };
  } catch (error) {
    await db.query(
      `UPDATE virtual_accounts
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'paid'`,
      [account.id]
    );
    throw error;
  }
};

const findAccountForEvent = async (event) => {
  if (event.accountNumber) {
    const result = await db.query(
      `SELECT * FROM virtual_accounts WHERE account_number = $1 ORDER BY id DESC LIMIT 1`,
      [event.accountNumber]
    );
    if (result.rows.length) return result.rows[0];
  }

  if (event.accountReference) {
    const result = await db.query(
      `SELECT * FROM virtual_accounts WHERE account_reference = $1 ORDER BY id DESC LIMIT 1`,
      [event.accountReference]
    );
    if (result.rows.length) return result.rows[0];
  }

  if (event.paymentReference) {
    const byProviderReference = await db.query(
      `SELECT * FROM virtual_accounts WHERE account_reference = $1 ORDER BY id DESC LIMIT 1`,
      [event.paymentReference]
    );
    if (byProviderReference.rows.length) return byProviderReference.rows[0];

    const result = await db.query(
      `SELECT * FROM virtual_accounts
       WHERE registration_reference = $1 AND kind = 'one_time'
       ORDER BY id DESC LIMIT 1`,
      [event.paymentReference]
    );
    if (result.rows.length) return result.rows[0];
  }

  return null;
};

// Applies one parsed provider event. Safe to call twice: the event row is
// claimed once and the ledger insert is guarded by a unique reference.
const applyEvent = async ({ providerName, event, rawPayload, logger = console }) => {
  await ensureSchema();

  const claimed = await db.query(
    `INSERT INTO virtual_account_events
       (provider, event_id, event_type, account_number, account_reference, payment_reference,
        amount, sender_name, sender_bank, status, processed, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)
     ON CONFLICT (provider, event_id) DO UPDATE
       SET processed = virtual_account_events.processed
     RETURNING id, processed`,
    [
      providerName,
      event.eventId,
      event.eventType,
      event.accountNumber,
      event.accountReference,
      event.paymentReference,
      event.amount,
      event.senderName,
      event.senderBank,
      event.status,
      JSON.stringify(rawPayload || {}),
    ]
  );

  const eventRow = claimed.rows[0];

  if (eventRow.processed) {
    return { status: 'duplicate' };
  }

  if (event.status !== 'success') {
    await markEvent(eventRow.id, { success: true, failureReason: 'ignored_event' });
    return { status: 'ignored' };
  }

  const account = await findAccountForEvent(event);

  if (!account) {
    await markEvent(eventRow.id, { success: true, failureReason: 'unknown_account' });
    logger.warn('Virtual account webhook for an unknown account:', event.accountNumber || event.accountReference);
    return { status: 'unknown_account' };
  }

  const amount = Number(event.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    await markEvent(eventRow.id, {
      success: true,
      failureReason: 'missing_amount',
      accountId: account.id,
    });
    return { status: 'invalid_amount' };
  }

  if (account.kind === 'dva' && amount < MIN_WALLET_FUNDING) {
    await markEvent(eventRow.id, {
      success: true,
      failureReason: `below_minimum:${MIN_WALLET_FUNDING}`,
      accountId: account.id,
    });
    return { status: 'below_minimum' };
  }

  const expected = account.amount_expected === null ? null : Number(account.amount_expected);
  if (account.kind === 'one_time' && Number.isFinite(expected) && amount + 0.01 < expected) {
    // The money is real but short. It is left uncredited and surfaced for a
    // human, exactly like a manual underpayment — never auto-approved.
    await markEvent(eventRow.id, {
      success: false,
      failureReason: `underpaid: expected ${expected}, received ${amount}`,
      accountId: account.id,
    });
    return { status: 'underpaid', expected, received: amount };
  }

  try {
    const result =
      account.kind === 'one_time' && account.registration_reference
        ? await applyRegistrationCredit({ account, event, providerName, logger })
        : await applyWalletCredit({ account, event, providerName, logger });

    await markEvent(eventRow.id, { success: true, accountId: account.id });
    return result;
  } catch (error) {
    await markEvent(eventRow.id, {
      success: false,
      failureReason: error.message.slice(0, 500),
      accountId: account.id,
    });
    throw error;
  }
};

const handleWebhook = async ({ providerName, rawBody, body, headers = {}, query = {} }) => {
  const provider = getProviderByName(providerName);
  if (!provider) {
    const error = new Error('Unknown payment provider');
    error.statusCode = 404;
    throw error;
  }

  const signatureConfigured = typeof provider.signatureRequired === 'function'
    ? provider.signatureRequired()
    : true;

  if (signatureConfigured) {
    if (!provider.verifyWebhook({ rawBody, headers })) {
      const error = new Error('Invalid webhook signature');
      error.statusCode = 401;
      throw error;
    }
  } else {
    // Fail closed: without a provider signature the shared token is mandatory.
    const expected = process.env.VIRTUAL_ACCOUNT_WEBHOOK_TOKEN || '';
    const supplied = String(query.token || headers['x-webhook-token'] || '');
    const matches =
      expected.length >= 16 &&
      supplied.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));

    if (!matches) {
      const error = new Error('Webhook authentication is not configured');
      error.statusCode = 401;
      throw error;
    }
  }

  const event = provider.parseWebhook({ rawBody, body });
  return applyEvent({ providerName: provider.name, event, rawPayload: body, logger: console });
};

// ─── Reconciliation ─────────────────────────────────────────────────────────

const reconcileRegistration = async ({ reference, logger = console }) => {
  if (!isEnabled()) return { status: 'disabled' };

  // Status polling is frequent; the provider transaction query is not. One
  // direct check per interval per reference is enough to cover a missed webhook.
  const last = lastReconciledAt.get(reference) || 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) {
    return { status: 'throttled' };
  }
  lastReconciledAt.set(reference, Date.now());
  if (lastReconciledAt.size > 5000) {
    lastReconciledAt.clear();
    lastReconciledAt.set(reference, Date.now());
  }

  await ensureSchema();

  const result = await db.query(
    `SELECT * FROM virtual_accounts
     WHERE registration_reference = $1 AND kind = 'one_time'
     ORDER BY id DESC LIMIT 1`,
    [reference]
  );

  const account = result.rows[0];
  if (!account || account.status !== 'active' || !account.provider_reference) {
    return { status: 'nothing_to_reconcile' };
  }

  const provider = getProviderByName(account.provider);
  if (!provider || typeof provider.queryPayment !== 'function') {
    return { status: 'unsupported' };
  }

  let payment;
  try {
    payment = await provider.queryPayment({ providerReference: account.provider_reference });
  } catch (error) {
    logger.error('Virtual account reconciliation failed:', error.message);
    return { status: 'query_failed' };
  }

  if (!payment?.paid || !payment.amount) {
    return { status: 'unpaid' };
  }

  const event = {
    eventId: `reconcile_${account.provider}_${account.provider_reference}`,
    eventType: 'RECONCILED',
    status: 'success',
    amount: payment.amount,
    accountNumber: account.account_number,
    accountReference: account.account_reference,
    paymentReference: reference,
    providerReference: account.provider_reference,
    senderName: payment.senderName,
    senderBank: payment.senderBank,
    paidAt: payment.paidAt,
  };

  try {
    return await applyEvent({
      providerName: account.provider,
      event,
      rawPayload: { reconciled: true },
      logger,
    });
  } catch (error) {
    logger.error('Virtual account reconciliation credit failed:', error.message);
    return { status: 'credit_failed' };
  }
};

// ─── Reads ──────────────────────────────────────────────────────────────────

const getWalletCredits = async ({ userId, limit = 10 }) => {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const result = await db.query(
    `SELECT id, amount, transaction_reference, gateway_response, completed_at
     FROM payments
     WHERE user_id = $1 AND payment_method = 'virtual_account' AND payment_status = 'completed'
     ORDER BY completed_at DESC NULLS LAST, id DESC
     LIMIT $2`,
    [userId, safeLimit]
  );

  return result.rows.map((row) => ({
    payment_id: row.id,
    amount: Number(row.amount),
    reference: row.transaction_reference,
    sender_name: row.gateway_response?.sender_name || null,
    credited_at: row.completed_at,
  }));
};

const listVirtualAccounts = async ({ status, kind, search, page = 1, limit = 25 }) => {
  await ensureSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  let index = 1;

  if (status) {
    where.push(`va.status = $${index++}`);
    params.push(status);
  }
  if (kind) {
    where.push(`va.kind = $${index++}`);
    params.push(kind);
  }
  if (search) {
    where.push(
      `(va.account_number ILIKE $${index} OR va.account_name ILIKE $${index} OR u.email ILIKE $${index} OR va.registration_reference ILIKE $${index})`
    );
    params.push(`%${search}%`);
    index += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await db.query(
    `SELECT va.*, u.full_name AS user_name, u.email AS user_email
     FROM virtual_accounts va
     LEFT JOIN users u ON u.id = va.user_id
     ${whereSql}
     ORDER BY va.created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    [...params, safeLimit, offset]
  );

  const total = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM virtual_accounts va
     LEFT JOIN users u ON u.id = va.user_id
     ${whereSql}`,
    params
  );

  return {
    data: rows.rows,
    pagination: { total: total.rows[0]?.total || 0, page: safePage, limit: safeLimit },
  };
};

const listEvents = async ({ processed, page = 1, limit = 25 }) => {
  await ensureSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (processed === 'true' || processed === 'false') {
    params.push(processed === 'true');
    where.push(`processed = $1`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await db.query(
    `SELECT id, provider, event_id, event_type, account_number, account_reference,
            payment_reference, amount, sender_name, sender_bank, status, processed,
            processed_at, failure_reason, created_at
     FROM virtual_account_events
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, safeLimit, offset]
  );

  return { data: rows.rows, pagination: { page: safePage, limit: safeLimit } };
};

module.exports = {
  ensureSchema,
  isEnabled,
  getConfig,
  resolveAccountName,
  getWalletAccountForUser,
  createRegistrationAccount,
  getRegistrationAccountStatus,
  handleWebhook,
  applyEvent,
  reconcileRegistration,
  getWalletCredits,
  listVirtualAccounts,
  listEvents,
};
