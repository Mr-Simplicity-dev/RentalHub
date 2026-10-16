const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_TIMEOUT_MS = Math.max(Number(process.env.PAYSTACK_TRANSFER_TIMEOUT_MS) || 30000, 5000);

const getHeaders = () => ({
  Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

const assertPaystackConfigured = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured');
  }
};

// A timeout/network failure means the transfer may still have been created on
// Paystack's side (we sent the request but never read the response). Callers use
// this to mark the payout "outcome uncertain" instead of "failed".
const isOutcomeUncertainError = (error) => {
  if (!error) return false;
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') return true;
  if (error.code === 'ERR_NETWORK' || error.code === 'EAI_AGAIN') return true;
  // No HTTP response at all => request may have reached Paystack.
  if (!error.response) return true;
  // A 5xx gateway response is also ambiguous.
  return Number(error.response?.status) >= 500;
};

const createTransferRecipient = async ({ name, accountNumber, bankCode }) => {
  assertPaystackConfigured();

  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transferrecipient`,
    {
      type: 'nuban',
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    },
    { headers: getHeaders(), timeout: PAYSTACK_TIMEOUT_MS }
  );

  const recipient = response.data?.data;
  if (!recipient?.recipient_code) {
    throw new Error('Failed to create transfer recipient');
  }

  return recipient;
};

const initiateTransfer = async ({ amount, recipientCode, reason, reference }) => {
  assertPaystackConfigured();

  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transfer`,
    {
      source: 'balance',
      reason,
      amount: Math.round(Number(amount) * 100),
      recipient: recipientCode,
      reference,
      currency: 'NGN',
    },
    { headers: getHeaders(), timeout: PAYSTACK_TIMEOUT_MS }
  );

  return response.data?.data || null;
};

const resolveBankCodeFromName = async (bankName) => {
  assertPaystackConfigured();

  const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
    headers: getHeaders(),
    timeout: PAYSTACK_TIMEOUT_MS,
  });

  const list = response.data?.data || [];
  const normalized = String(bankName || '').trim().toLowerCase();

  const exact = list.find((item) => String(item.name || '').trim().toLowerCase() === normalized);
  if (exact?.code) return exact.code;

  const fuzzy = list.find((item) => String(item.name || '').toLowerCase().includes(normalized));
  if (fuzzy?.code) return fuzzy.code;

  throw new Error(`Unable to resolve bank code for bank name: ${bankName}`);
};

const isValidPaystackSignature = (rawBody, signature) => {
  if (!PAYSTACK_SECRET_KEY || !rawBody || !signature) {
    return false;
  }

  // Signature must be a 128-char lowercase hex SHA-512 digest before any
  // comparison — guards against timing attacks on malformed signatures.
  if (!/^[a-f0-9]{128}$/i.test(String(signature))) {
    return false;
  }

  const digest = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  const expected = Buffer.from(digest, 'hex');
  const supplied = Buffer.from(String(signature).toLowerCase(), 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

module.exports = {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
  isValidPaystackSignature,
  isOutcomeUncertainError,
};
