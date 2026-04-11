const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const getHeaders = () => ({
  Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

const assertPaystackConfigured = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured');
  }
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
    { headers: getHeaders() }
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
    { headers: getHeaders() }
  );

  return response.data?.data || null;
};

const resolveBankCodeFromName = async (bankName) => {
  assertPaystackConfigured();

  const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
    headers: getHeaders(),
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

  const digest = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  return digest === signature;
};

module.exports = {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCodeFromName,
  isValidPaystackSignature,
};
