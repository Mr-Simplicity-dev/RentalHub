const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/middleware/database');
const { creditWallet } = require('./walletLedgerService');
const { sendReceiptForPayment } = require('../config/utils/paymentReceipt');
const { sendEmail } = require('../config/utils/mailer');
const { buildReference } = require('../config/utils/referenceGenerator');

const PROOF_DIR = path.join(__dirname, '..', 'uploads', 'bank-transfer-proofs');
fs.mkdirSync(PROOF_DIR, { recursive: true });

const MAX_PROOF_BYTES = 700 * 1024;
const MIN_WALLET_FUNDING = 100;
const MAX_WALLET_FUNDING = 5000000;

let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id SERIAL PRIMARY KEY,
      bank_name VARCHAR(100) NOT NULL,
      account_name VARCHAR(150) NOT NULL,
      account_number VARCHAR(30) NOT NULL,
      sort_code VARCHAR(10),
      instructions TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS bank_transfer_payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reference VARCHAR(120) NOT NULL UNIQUE,
      payment_type VARCHAR(30) NOT NULL
        CHECK (payment_type IN ('registration', 'wallet_funding')),
      amount NUMERIC(12, 2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
      payer_name VARCHAR(150),
      payer_bank VARCHAR(100),
      proof_path TEXT,
      proof_captured_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'awaiting_approval'
        CHECK (status IN ('awaiting_approval', 'approved', 'rejected', 'expired')),
      amount_confirmed NUMERIC(12, 2),
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      registration_reference VARCHAR(255),
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_unique
      ON bank_accounts (lower(bank_name), account_number);
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_active
      ON bank_accounts (is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_status
      ON bank_transfer_payments (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_type
      ON bank_transfer_payments (payment_type, status);
    CREATE INDEX IF NOT EXISTS idx_bank_transfer_payments_registration
      ON bank_transfer_payments (registration_reference);
  `);

  schemaReady = true;
};

const listActiveAccounts = async () => {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT id, bank_name, account_name, account_number, sort_code, instructions
     FROM bank_accounts
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
};

const getAccounts = async (req, res) => {
  try {
    const accounts = await listActiveAccounts();
    res.json({ success: true, data: accounts });
  } catch (error) {
    req.logger.error('List active bank accounts error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load bank accounts' });
  }
};

// Public: a pending registration polls this instead of Paystack. The reference
// is the only credential, so it never returns the capture, only the status.
const getRegistrationTransferStatus = async (req, res) => {
  try {
    await ensureSchema();
    const { reference } = req.params;

    const registration = await db.query(
      `SELECT amount, full_name, email, user_type, registered_user_id, payment_method
       FROM tenant_registration_payments
       WHERE transaction_reference = $1
       LIMIT 1`,
      [reference]
    );

    if (!registration.rows.length) {
      return res.status(404).json({ success: false, message: 'Registration payment not found' });
    }

    const row = registration.rows[0];
    const transfer = await db.query(
      `SELECT status, review_note, amount_confirmed, created_at, reviewed_at
       FROM bank_transfer_payments
       WHERE registration_reference = $1
       ORDER BY id DESC LIMIT 1`,
      [reference]
    );

    const latest = transfer.rows[0] || null;

    res.json({
      success: true,
      data: {
        reference,
        status: latest?.status || 'awaiting_transfer',
        payment_method: row.payment_method || 'bank_transfer',
        amount: row.amount,
        currency: 'NGN',
        user_type: row.user_type,
        full_name: row.full_name,
        email: row.email,
        registered: Boolean(row.registered_user_id),
        review_note: latest?.review_note || null,
        bank_accounts: latest ? [] : await listActiveAccounts(),
      },
    });
  } catch (error) {
    req.logger.error('Registration bank transfer status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load the transfer status' });
  }
};

// ─── Admin: bank accounts ───────────────────────────────────────────────────

const listAccounts = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT a.*, u.full_name AS created_by_name
       FROM bank_accounts a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.sort_order ASC, a.id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    req.logger.error('List bank accounts error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load bank accounts' });
  }
};

const createAccount = async (req, res) => {
  try {
    await ensureSchema();
    const { bank_name, account_name, account_number, sort_code, instructions, is_active, sort_order } = req.body;

    const result = await db.query(
      `INSERT INTO bank_accounts
         (bank_name, account_name, account_number, sort_code, instructions, is_active, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        String(bank_name).trim(),
        String(account_name).trim(),
        String(account_number).trim(),
        sort_code ? String(sort_code).trim() : null,
        instructions ? String(instructions).trim() : null,
        is_active !== false,
        Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
        req.user?.id || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'This bank account already exists' });
    }
    req.logger.error('Create bank account error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create bank account' });
  }
};

const updateAccount = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { bank_name, account_name, account_number, sort_code, instructions, is_active, sort_order } = req.body;

    const result = await db.query(
      `UPDATE bank_accounts
       SET bank_name = COALESCE($1, bank_name),
           account_name = COALESCE($2, account_name),
           account_number = COALESCE($3, account_number),
           sort_code = $4,
           instructions = $5,
           is_active = COALESCE($6, is_active),
           sort_order = COALESCE($7, sort_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        bank_name ? String(bank_name).trim() : null,
        account_name ? String(account_name).trim() : null,
        account_number ? String(account_number).trim() : null,
        sort_code === undefined ? null : (sort_code ? String(sort_code).trim() : null),
        instructions === undefined ? null : (instructions ? String(instructions).trim() : null),
        typeof is_active === 'boolean' ? is_active : null,
        Number.isFinite(Number(sort_order)) ? Number(sort_order) : null,
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'This bank account already exists' });
    }
    req.logger.error('Update bank account error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update bank account' });
  }
};

const deleteAccount = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const result = await db.query(`DELETE FROM bank_accounts WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }
    res.json({ success: true, data: { deleted: 1 } });
  } catch (error) {
    req.logger.error('Delete bank account error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete bank account' });
  }
};

// ─── Proof capture ──────────────────────────────────────────────────────────

// The app captures the confirmation screen itself, so the client sends a JPEG
// data URL and never a picked file. Anything that is not a real image payload
// is refused (no arbitrary writes into uploads).
const saveProofImage = (dataUrl, reference) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    const error = new Error('A screen capture of the transfer confirmation is required');
    error.statusCode = 400;
    throw error;
  }

  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    const error = new Error('The captured image is not a supported image');
    error.statusCode = 400;
    throw error;
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

  if (!buffer.length) {
    const error = new Error('The captured image is empty');
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > MAX_PROOF_BYTES) {
    const error = new Error('The captured image is too large, please capture it again');
    error.statusCode = 413;
    throw error;
  }

  const safeReference = String(reference).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  const filename = `${safeReference}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PROOF_DIR, filename), buffer);

  return path.posix.join('bank-transfer-proofs', filename);
};

// ─── Registration transfer ──────────────────────────────────────────────────

const submitRegistrationProof = async (req, res) => {
  try {
    await ensureSchema();
    const { reference, bank_account_id, payer_name, payer_bank, proof_image } = req.body;

    const registration = await db.query(
      `SELECT id, transaction_reference, user_type, email, phone, full_name, amount,
              payment_status, payment_method, registered_user_id
       FROM tenant_registration_payments
       WHERE transaction_reference = $1
       LIMIT 1`,
      [reference]
    );

    if (!registration.rows.length) {
      return res.status(404).json({ success: false, message: 'Registration payment not found' });
    }

    const row = registration.rows[0];

    if (row.registered_user_id) {
      return res.status(400).json({ success: false, message: 'This registration is already completed' });
    }

    const account = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1 AND is_active = TRUE`,
      [bank_account_id]
    );

    if (!account.rows.length) {
      return res.status(400).json({ success: false, message: 'Choose a valid bank account to pay into' });
    }

    const proofPath = saveProofImage(proof_image, reference);

    // One transfer record per registration reference: a re-submission replaces
    // the previous capture instead of stacking duplicates for the reviewer.
    const result = await db.query(
      `INSERT INTO bank_transfer_payments
         (reference, payment_type, amount, bank_account_id, payer_name, payer_bank,
          proof_path, proof_captured_at, status, registration_reference, metadata)
       VALUES ($1, 'registration', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 'awaiting_approval', $1, $7)
       ON CONFLICT (reference) DO UPDATE
         SET bank_account_id = EXCLUDED.bank_account_id,
             payer_name = EXCLUDED.payer_name,
             payer_bank = EXCLUDED.payer_bank,
             proof_path = EXCLUDED.proof_path,
             proof_captured_at = EXCLUDED.proof_captured_at,
             status = 'awaiting_approval',
             reviewed_by = NULL,
             reviewed_at = NULL,
             review_note = NULL,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id, reference, status, amount, created_at`,
      [
        reference,
        Number(row.amount),
        bank_account_id,
        payer_name ? String(payer_name).trim() : null,
        payer_bank ? String(payer_bank).trim() : null,
        proofPath,
        JSON.stringify({ user_type: row.user_type, email: row.email, phone: row.phone, full_name: row.full_name }),
      ]
    );

    await db.query(
      `UPDATE tenant_registration_payments
       SET payment_method = 'bank_transfer'
       WHERE transaction_reference = $1 AND registered_user_id IS NULL`,
      [reference]
    );

    res.status(201).json({
      success: true,
      message: 'Transfer submitted. A super admin will confirm it shortly.',
      data: result.rows[0],
    });
  } catch (error) {
    req.logger.error('Submit registration bank transfer error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to submit the transfer'
    });
  }
};

// ─── Wallet funding transfer ────────────────────────────────────────────────

const submitWalletProof = async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.user.id;
    const { amount, bank_account_id, payer_name, payer_bank, proof_image } = req.body;

    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_WALLET_FUNDING) {
      return res.status(400).json({ success: false, message: `Minimum wallet funding amount is ₦${MIN_WALLET_FUNDING}` });
    }
    if (value > MAX_WALLET_FUNDING) {
      return res.status(400).json({ success: false, message: 'Amount is above the bank-transfer limit' });
    }

    const account = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1 AND is_active = TRUE`,
      [bank_account_id]
    );

    if (!account.rows.length) {
      return res.status(400).json({ success: false, message: 'Choose a valid bank account to pay into' });
    }

    const paymentResult = await db.query(
      `INSERT INTO payments
         (user_id, payment_type, amount, currency, payment_method, payment_status)
       VALUES ($1, 'wallet_funding', $2, 'NGN', 'bank_transfer', 'pending')
       RETURNING id`,
      [userId, value]
    );

    const paymentId = paymentResult.rows[0].id;
    const reference = buildReference('WALLET_BT', userId, paymentId, Date.now());
    const proofPath = saveProofImage(proof_image, reference);

    await db.query(
      'UPDATE payments SET transaction_reference = $1 WHERE id = $2',
      [reference, paymentId]
    );

    const transfer = await db.query(
      `INSERT INTO bank_transfer_payments
         (user_id, reference, payment_type, amount, bank_account_id, payer_name, payer_bank,
          proof_path, proof_captured_at, status, payment_id, metadata)
       VALUES ($1, $2, 'wallet_funding', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 'awaiting_approval', $8, $9)
       RETURNING id, reference, status, amount, created_at`,
      [
        userId,
        reference,
        value,
        bank_account_id,
        payer_name ? String(payer_name).trim() : null,
        payer_bank ? String(payer_bank).trim() : null,
        proofPath,
        paymentId,
        JSON.stringify({ payment_type: 'wallet_funding' }),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Transfer submitted. A super admin will confirm it shortly.',
      data: { ...transfer.rows[0], payment_id: paymentId },
    });
  } catch (error) {
    req.logger.error('Submit wallet bank transfer error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to submit the transfer'
    });
  }
};

// ─── Admin: review ──────────────────────────────────────────────────────────

const listTransfers = async (req, res) => {
  try {
    await ensureSchema();
    const { status, payment_type, search, page = 1, limit = 25 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const where = [];
    const params = [];
    let idx = 1;

    if (status) {
      where.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (payment_type) {
      where.push(`t.payment_type = $${idx++}`);
      params.push(payment_type);
    }
    if (search) {
      where.push(`(t.reference ILIKE $${idx} OR t.payer_name ILIKE $${idx} OR u.full_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, total] = await Promise.all([
      db.query(
        `SELECT t.*, a.bank_name, a.account_number, u.full_name AS user_name, u.email AS user_email,
                r.full_name AS reviewer_name
         FROM bank_transfer_payments t
         LEFT JOIN bank_accounts a ON a.id = t.bank_account_id
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN users r ON r.id = t.reviewed_by
         ${whereSql}
         ORDER BY t.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, safeLimit, offset]
      ),
      db.query(
        `SELECT COUNT(*)::int AS total
         FROM bank_transfer_payments t
         LEFT JOIN users u ON u.id = t.user_id
         ${whereSql}`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      pagination: { total: total.rows[0].total, page: safePage, limit: safeLimit },
    });
  } catch (error) {
    req.logger.error('List bank transfers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load bank transfers' });
  }
};

const getTransferProof = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const result = await db.query(
      `SELECT proof_path FROM bank_transfer_payments WHERE id = $1`,
      [id]
    );

    const proofPath = result.rows[0]?.proof_path;
    if (!proofPath) {
      return res.status(404).json({ success: false, message: 'No capture was attached to this transfer' });
    }

    const absolute = path.resolve(__dirname, '..', 'uploads', proofPath);
    if (!absolute.startsWith(path.resolve(PROOF_DIR))) {
      return res.status(400).json({ success: false, message: 'Invalid proof path' });
    }
    if (!fs.existsSync(absolute)) {
      return res.status(404).json({ success: false, message: 'The captured image is missing' });
    }

    res.sendFile(absolute);
  } catch (error) {
    req.logger.error('Read bank transfer proof error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load the captured image' });
  }
};

const approveTransfer = async (req, res) => {
  const { id } = req.params;
  const amountReceived = Number(req.body.amount_received);
  const note = req.body.note ? String(req.body.note).trim() : null;

  if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
    return res.status(400).json({ success: false, message: 'Enter the amount actually received' });
  }

  try {
    await ensureSchema();

    const transferResult = await db.query(
      `SELECT * FROM bank_transfer_payments WHERE id = $1`,
      [id]
    );

    if (!transferResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Transfer not found' });
    }

    const transfer = transferResult.rows[0];

    if (transfer.status !== 'awaiting_approval') {
      return res.status(400).json({ success: false, message: `This transfer is already ${transfer.status}` });
    }

    if (amountReceived + 0.01 < Number(transfer.amount)) {
      return res.status(400).json({
        success: false,
        message: `The amount received (₦${amountReceived.toLocaleString()}) is less than the expected ₦${Number(transfer.amount).toLocaleString()}`,
      });
    }

    await db.query(
      `UPDATE bank_transfer_payments
       SET status = 'approved',
           amount_confirmed = $1,
           reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           review_note = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [amountReceived, req.user?.id || null, note, id]
    );

    const approved = { ...transfer, amount_confirmed: amountReceived };

    if (transfer.payment_type === 'registration') {
      const authService = require('./authService');
      try {
        const result = await authService.finalizeBankTransferRegistration({
          reference: transfer.registration_reference,
          transfer: approved,
          reviewer: req.user,
          logger: req.logger,
        });

        return res.json({
          success: true,
          message: 'Transfer approved and the account was created',
          data: { transfer_id: Number(id), user_id: result?.data?.user?.id || result?.user_id || null },
        });
      } catch (finalizeError) {
        await db.query(
          `UPDATE bank_transfer_payments
           SET status = 'awaiting_approval', reviewed_by = NULL, reviewed_at = NULL
           WHERE id = $1`,
          [id]
        );
        throw finalizeError;
      }
    }

    // Wallet funding: mirror verifyWalletFunding exactly so the ledger,
    // commission and receipt are identical to a Paystack top-up.
    const paymentId = transfer.payment_id;
    if (!paymentId) {
      await db.query(
        `UPDATE bank_transfer_payments SET status = 'awaiting_approval', reviewed_by = NULL, reviewed_at = NULL WHERE id = $1`,
        [id]
      );
      return res.status(400).json({ success: false, message: 'The wallet payment record is missing' });
    }

    await db.query(
      `UPDATE payments
       SET payment_status = 'completed',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           gateway_response = $1,
           payment_channel = 'bank_transfer'
       WHERE id = $2`,
      [JSON.stringify({ gateway: 'bank_transfer', transfer_id: Number(id), amount_confirmed: amountReceived, approved_by: req.user?.id || null }), paymentId]
    );

    await creditWallet({
      userId: transfer.user_id,
      paymentId,
      amount: amountReceived,
      source: 'wallet_funding',
      reference: transfer.reference,
      description: `Wallet funding ${transfer.reference}`,
      metadata: { payment_type: 'wallet_funding', gateway: 'bank_transfer', transfer_id: Number(id) },
    });

    const { processPaymentCommission } = require('./commissionService');
    if (typeof processPaymentCommission === 'function') {
      processPaymentCommission(paymentId).catch(() => {});
    }

    sendReceiptForPayment(paymentId).catch(() => {});

    return res.json({
      success: true,
      message: `₦${amountReceived.toLocaleString()} was added to the user's wallet`,
      data: { transfer_id: Number(id), payment_id: paymentId, amount_funded: amountReceived },
    });
  } catch (error) {
    req.logger.error('Approve bank transfer error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode && error.statusCode < 500 ? error.message : 'Failed to approve the transfer',
    });
  }
};

const rejectTransfer = async (req, res) => {
  const { id } = req.params;
  const note = req.body.note ? String(req.body.note).trim() : '';

  if (!note) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  }

  try {
    await ensureSchema();

    const transferResult = await db.query(`SELECT * FROM bank_transfer_payments WHERE id = $1`, [id]);
    if (!transferResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Transfer not found' });
    }

    const transfer = transferResult.rows[0];
    if (transfer.status !== 'awaiting_approval') {
      return res.status(400).json({ success: false, message: `This transfer is already ${transfer.status}` });
    }

    await db.query(
      `UPDATE bank_transfer_payments
       SET status = 'rejected',
           reviewed_by = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           review_note = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [req.user?.id || null, note, id]
    );

    // Tell the payer why, using their real address (wallet = user, registration
    // = the email captured on the pending registration).
    let to = null;
    if (transfer.user_id) {
      const user = await db.query('SELECT email FROM users WHERE id = $1', [transfer.user_id]);
      to = user.rows[0]?.email || null;
    } else if (transfer.registration_reference) {
      const registration = await db.query(
        'SELECT email FROM tenant_registration_payments WHERE transaction_reference = $1',
        [transfer.registration_reference]
      );
      to = registration.rows[0]?.email || null;
    }

    if (to) {
      sendEmail({
        to,
        subject: 'Bank transfer could not be confirmed',
        html: `
          <p>Hello,</p>
          <p>We could not confirm your bank transfer with reference <strong>${transfer.reference}</strong>.</p>
          <p><strong>Reason:</strong> ${note.replace(/[<>&]/g, '')}</p>
          <p>Please reply to this email or contact support@rentalhub.com.ng if you believe this is a mistake.</p>
          <p>— Amana RentalHub NG</p>
        `,
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Transfer rejected', data: { transfer_id: Number(id) } });
  } catch (error) {
    req.logger.error('Reject bank transfer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reject the transfer' });
  }
};

module.exports = {
  ensureSchema,
  listActiveAccounts,
  getAccounts,
  getRegistrationTransferStatus,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  submitRegistrationProof,
  submitWalletProof,
  listTransfers,
  getTransferProof,
  approveTransfer,
  rejectTransfer,
};
