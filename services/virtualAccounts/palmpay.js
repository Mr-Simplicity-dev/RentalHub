const crypto = require('crypto');
const axios = require('axios');

// PalmPay virtual accounts. Their VA product does not hold a balance: a credit
// settles into the merchant's main PalmPay account, and the notification tells
// us which virtual account received it. Creating a permanent VA requires the
// customer's NIN, BVN or a CAC number.
//
// The production host differs from the sandbox host and is confirmed during
// merchant onboarding, so it can be overridden with PALMPAY_BASE_URL.

const NAME = 'palmpay';

const appId = () => process.env.PALMPAY_APP_ID || '';
const privateKey = () => process.env.PALMPAY_PRIVATE_KEY || '';
const webhookSecret = () => process.env.PALMPAY_WEBHOOK_SECRET || '';

const baseUrl = () =>
  process.env.PALMPAY_BASE_URL ||
  (process.env.PALMPAY_SANDBOX === 'true'
    ? 'https://open-gw-sandbox.palmpay-inc.com'
    : 'https://open-gw-prod.palmpay-inc.com');

const isConfigured = () => Boolean(appId() && privateKey());

const sign = (payload) =>
  crypto
    .createHmac('sha512', privateKey())
    .update(payload)
    .digest('hex')
    .toUpperCase();

const buildBody = (payload, version) => {
  const body = {
    requestTime: Date.now(),
    version,
    nonceStr: crypto.randomBytes(16).toString('hex'),
    ...payload,
  };
  return { body, raw: JSON.stringify(body) };
};

const request = async (path, payload, version = 'V1.1') => {
  const { raw } = buildBody(payload, version);

  try {
    const response = await axios.post(`${baseUrl()}${path}`, raw, {
      timeout: 25000,
      headers: {
        Authorization: `Bearer ${appId()}`,
        countryCode: 'NG',
        Signature: sign(raw),
        'Content-Type': 'application/json',
      },
    });

    const body = response.data || {};
    const code = String(body.respCode || '');
    if (code && code !== '00000000') {
      const error = new Error(body.respMsg || 'PalmPay rejected the request');
      error.statusCode = 502;
      error.providerCode = code;
      throw error;
    }

    return body.data || body;
  } catch (error) {
    if (error.statusCode) throw error;
    const message =
      error.response?.data?.respMsg ||
      error.response?.data?.message ||
      error.message ||
      'PalmPay request failed';
    const wrapped = new Error(`PalmPay request failed: ${message}`);
    wrapped.statusCode = 502;
    throw wrapped;
  }
};

const createDedicatedAccount = async ({ reference, name, email, nin }) => {
  const data = await request(
    '/api/v2/virtual/account/label/create',
    {
      identityType: 'personal_nin',
      licenseNumber: String(nin),
      virtualAccountName: String(name).slice(0, 200),
      customerName: String(name).slice(0, 200),
      email: email || undefined,
      accountReference: String(reference).slice(0, 120),
    },
    process.env.PALMPAY_VA_VERSION || 'V2.0'
  );

  if (!data?.virtualAccountNo) {
    const error = new Error('PalmPay did not return an account number');
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: NAME,
    kind: 'dva',
    accountReference: String(data.accountReference || reference),
    providerReference: null,
    accountNumber: String(data.virtualAccountNo),
    accountName: data.virtualAccountName || String(name),
    bankName: process.env.PALMPAY_VA_BANK_NAME || 'PalmPay',
    bankCode: null,
    status: 'active',
    expiresAt: null,
    metadata: { providerStatus: data.status || null },
  };
};

const createOneTimeAccount = async ({ reference, amount, name, email, description, redirectUrl }) => {
  const data = await request('/api/v2/payment/merchant/createorder', {
    amount: Math.round(Number(amount) * 100),
    currency: 'NGN',
    orderId: String(reference).slice(0, 32),
    notifyUrl: process.env.PALMPAY_NOTIFY_URL || undefined,
    callBackUrl: redirectUrl || undefined,
    title: 'RentalHub payment',
    description: String(description || 'RentalHub payment').slice(0, 200),
    userId: String(reference).slice(0, 32),
    productType: 'bank_transfer',
  });

  if (!data?.payerVirtualAccNo) {
    const error = new Error('PalmPay did not return a transfer account number');
    error.statusCode = 502;
    throw error;
  }

  const expiresIn = Number(process.env.PALMPAY_TRANSFER_ACCOUNT_TTL_SECONDS) || 2400;

  return {
    provider: NAME,
    kind: 'one_time',
    accountReference: String(reference),
    providerReference: data.orderNo ? String(data.orderNo) : null,
    accountNumber: String(data.payerVirtualAccNo),
    accountName: data.payerAccountName || String(name),
    bankName: data.payerBankName || 'PalmPay',
    bankCode: null,
    status: 'active',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    metadata: { orderNo: data.orderNo || null },
  };
};

// PalmPay's callback signing scheme depends on the merchant agreement; when a
// shared secret is configured we verify it, otherwise the route's shared token
// is the only guard and must be present.
const signatureRequired = () => Boolean(webhookSecret());

const verifyWebhook = ({ rawBody, headers = {} }) => {
  if (!webhookSecret()) return false;

  const signature =
    headers['x-palmpay-signature'] ||
    headers['X-PalmPay-Signature'] ||
    headers.signature ||
    headers.Signature;
  if (!signature) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const expected = crypto.createHmac('sha512', webhookSecret()).update(payload).digest('hex');

  const actualBuffer = Buffer.from(String(signature).toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const successStatus = (value) =>
  value === 2 ||
  ['2', 'SUCCESS', 'SUCCESSFUL', 'PAID', 'COMPLETED'].includes(String(value || '').toUpperCase());

const parseWebhook = ({ rawBody, body }) => {
  const event = body || {};
  const data = event.data && typeof event.data === 'object' ? event.data : event;

  const orderStatus = data.orderStatus ?? data.status;
  const rejected = event.respCode && String(event.respCode) !== '00000000';
  const isCredit = !rejected && successStatus(orderStatus);

  const rawAmount = data.orderAmount ?? data.amount ?? data.payAmount;
  const amountNumber = Number(rawAmount);
  const amount = Number.isFinite(amountNumber) && amountNumber > 0
    ? Math.round(amountNumber) / 100
    : null;

  return {
    eventId: crypto
      .createHash('sha256')
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || JSON.stringify(body || {}))))
      .digest('hex'),
    eventType: data.productType || event.eventType || null,
    status: isCredit ? 'success' : 'ignored',
    amount,
    accountNumber: data.virtualAccountNo || data.payerVirtualAccNo || null,
    accountReference: data.accountReference || null,
    paymentReference: data.orderId || null,
    providerReference: data.orderNo ? String(data.orderNo) : null,
    senderName: data.payerAccountName || null,
    senderBank: data.payerBankName || null,
    paidAt: data.updateTime ? new Date(Number(data.updateTime)).toISOString() : null,
  };
};

const queryPayment = async ({ providerReference }) => {
  if (!providerReference) return { paid: false };

  const data = await request('/api/v2/payment/merchant/order/queryStatus', {
    orderNo: String(providerReference),
  });

  return {
    paid: successStatus(data?.orderStatus ?? data?.status),
    amount:
      Number.isFinite(Number(data?.orderAmount)) && Number(data.orderAmount) > 0
        ? Math.round(Number(data.orderAmount)) / 100
        : null,
    senderName: data?.payer?.accountName || data?.payerAccountName || null,
    senderBank: data?.payer?.bankName || data?.payerBankName || null,
    paidAt: data?.completedTime ? new Date(Number(data.completedTime)).toISOString() : null,
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
