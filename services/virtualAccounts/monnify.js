const crypto = require('crypto');
const axios = require('axios');

// Monnify (Moniepoint group) reserved accounts. A reserved account is a real
// Moniepoint/Wema/Sterling NUBAN that belongs to one customer, which is why the
// partner bank requires the customer's NIN (or BVN) before it can be issued.

const NAME = 'monnify';

const apiKey = () => process.env.MONNIFY_API_KEY || '';
const secretKey = () => process.env.MONNIFY_SECRET_KEY || '';
const contractCode = () => process.env.MONNIFY_CONTRACT_CODE || '';
const webhookSecret = () => process.env.MONNIFY_SECRET_KEY || '';

const baseUrl = () =>
  process.env.MONNIFY_BASE_URL ||
  (process.env.MONNIFY_SANDBOX === 'true'
    ? 'https://sandbox.monnify.com'
    : 'https://api.monnify.com');

const isConfigured = () => Boolean(apiKey() && secretKey() && contractCode());
const signatureRequired = () => Boolean(secretKey());

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const authHeader = async () => {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60000) {
    return `Bearer ${cachedToken}`;
  }

  const response = await axios.post(
    `${baseUrl()}/api/v1/auth/login`,
    {},
    {
      timeout: 15000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey()}:${secretKey()}`).toString('base64')}`,
      },
    }
  );

  const body = response.data || {};
  const token = body.responseBody?.accessToken;
  if (!body.requestSuccessful || !token) {
    const error = new Error(body.responseMessage || 'Monnify authentication failed');
    error.statusCode = 502;
    throw error;
  }

  cachedToken = token;
  const expiresIn = Number(body.responseBody?.expiresIn) || 3600;
  cachedTokenExpiresAt = Date.now() + expiresIn * 1000;
  return `Bearer ${cachedToken}`;
};

const request = async (method, path, payload) => {
  const authorization = await authHeader();
  try {
    const response = await axios({
      method,
      url: `${baseUrl()}${path}`,
      data: payload,
      timeout: 25000,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
    });

    const body = response.data || {};
    if (body.requestSuccessful === false) {
      const error = new Error(body.responseMessage || 'Monnify rejected the request');
      error.statusCode = 502;
      error.providerCode = body.responseCode;
      throw error;
    }

    return body.responseBody || body;
  } catch (error) {
    if (error.statusCode) throw error;
    const message =
      error.response?.data?.responseMessage ||
      error.response?.data?.message ||
      error.message ||
      'Monnify request failed';
    const wrapped = new Error(`Monnify request failed: ${message}`);
    wrapped.statusCode = 502;
    throw wrapped;
  }
};

const pickAccount = (accounts = []) => {
  if (!Array.isArray(accounts) || !accounts.length) return null;
  return (
    accounts.find((account) => /moniepoint/i.test(String(account.bankName || ''))) ||
    accounts[0]
  );
};

// `name` must be the official name from the identity record: the partner bank
// matches it against the NIN, and a mismatch is the usual creation failure.
const createDedicatedAccount = async ({ reference, name, email, nin }) => {
  const body = await request('POST', '/api/v2/bank-transfer/reserved-accounts', {
    accountReference: String(reference).slice(0, 100),
    accountName: String(name).slice(0, 150),
    currencyCode: 'NGN',
    contractCode: contractCode(),
    customerEmail: email || undefined,
    customerName: String(name).slice(0, 150),
    getAllAvailableBanks: true,
    nin: nin ? String(nin) : undefined,
  });

  const account = pickAccount(body.accounts);
  if (!account?.accountNumber) {
    const error = new Error('Monnify did not return an account number');
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: NAME,
    kind: 'dva',
    accountReference: String(body.accountReference || reference),
    providerReference: body.reservationReference || null,
    accountNumber: String(account.accountNumber),
    accountName: account.accountName || String(name),
    bankName: account.bankName || 'Moniepoint Microfinance Bank',
    bankCode: account.bankCode || null,
    status: 'active',
    expiresAt: null,
    metadata: { bankCount: Array.isArray(body.accounts) ? body.accounts.length : 0 },
  };
};

// One-time account for a checkout: a fresh NUBAN valid for a short window, so a
// registration fee can be matched without storing identity data for a stranger.
const createOneTimeAccount = async ({ reference, amount, name, email, description, redirectUrl }) => {
  const initialized = await request('POST', '/api/v1/merchant/transactions/init-transaction', {
    amount: Number(amount),
    customerName: String(name).slice(0, 150),
    customerEmail: email || undefined,
    paymentReference: String(reference).slice(0, 100),
    paymentDescription: String(description || 'RentalHub payment').slice(0, 200),
    currencyCode: 'NGN',
    contractCode: contractCode(),
    redirectUrl: redirectUrl || undefined,
    paymentMethods: ['ACCOUNT_TRANSFER'],
  });

  const transactionReference = initialized.transactionReference || initialized.paymentReference;
  if (!transactionReference) {
    const error = new Error('Monnify did not return a transaction reference');
    error.statusCode = 502;
    throw error;
  }

  const payment = await request('POST', '/api/v1/merchant/bank-transfer/init-payment', {
    transactionReference,
  });

  if (!payment?.accountNumber) {
    const error = new Error('Monnify did not return a transfer account number');
    error.statusCode = 502;
    throw error;
  }

  const expiresIn = Number(process.env.MONNIFY_TRANSFER_ACCOUNT_TTL_SECONDS) || 2400;

  return {
    provider: NAME,
    kind: 'one_time',
    accountReference: String(reference),
    providerReference: String(transactionReference),
    accountNumber: String(payment.accountNumber),
    accountName: payment.accountName || String(name),
    bankName: payment.bankName || 'Moniepoint Microfinance Bank',
    bankCode: payment.bankCode || null,
    status: 'active',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    metadata: { note: payment.note || null },
  };
};

const verifyWebhook = ({ rawBody, headers = {} }) => {
  const signature = headers['monnify-signature'] || headers['Monnify-Signature'];
  if (!signature || !webhookSecret()) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const expected = crypto
    .createHmac('sha512', webhookSecret())
    .update(payload)
    .digest('hex');

  const actualBuffer = Buffer.from(String(signature).toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const parseAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
};

const parseWebhook = ({ rawBody, body }) => {
  const event = body || {};
  const eventType = String(event.eventType || '').toUpperCase();
  const data = event.eventData || event.data || {};
  const product = data.product || {};

  const failureStatuses = ['FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'];
  const paymentStatus = String(data.paymentStatus || data.status || '').toUpperCase();
  const isCredit =
    ['SUCCESSFUL_TRANSACTION', 'SUCCESSFUL_PAYMENT'].includes(eventType) &&
    !failureStatuses.includes(paymentStatus);

  const amount = parseAmount(
    data.amountPaid ?? data.totalPayable ?? data.amount ?? data.settlementAmount
  );

  return {
    eventId: crypto
      .createHash('sha256')
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || JSON.stringify(body || {}))))
      .digest('hex'),
    eventType: eventType || null,
    status: isCredit ? 'success' : 'ignored',
    amount,
    accountNumber: data.accountNumber || data.destinationAccountNumber || product.accountNumber || null,
    accountReference: product.reference || data.accountReference || null,
    paymentReference: data.paymentReference || data.paymentReferenceCode || null,
    providerReference: data.transactionReference || data.transactionReferenceCode || null,
    senderName: data.customer?.name || data.customerName || data.payerName || null,
    senderBank: data.customer?.bankName || data.bankName || data.payerBankName || null,
    paidAt: data.paidOn || data.completedOn || data.createdOn || null,
  };
};

// Reconciliation path for a webhook that was missed or delayed.
const queryPayment = async ({ transactionReference }) => {
  const body = await request(
    'GET',
    `/api/v2/transactions/${encodeURIComponent(String(transactionReference))}`
  );

  const status = String(body?.paymentStatus || body?.status || '').toUpperCase();
  const paid = status === 'PAID' || status === 'SUCCESS' || status === 'SUCCESSFUL';

  return {
    paid,
    amount: parseAmount(body?.amountPaid ?? body?.amount ?? body?.totalPayable),
    senderName: body?.customer?.name || body?.customerName || null,
    senderBank: body?.customer?.bankName || null,
    paidAt: body?.paidOn || body?.completedOn || null,
  };
};

module.exports = {
  name: NAME,
  isConfigured,
  signatureRequired,
  createDedicatedAccount,
  createOneTimeAccount,
  verifyWebhook,
  parseWebhook,
  queryPayment,
};
