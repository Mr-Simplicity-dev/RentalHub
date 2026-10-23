const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const monnify = require('../services/virtualAccounts/monnify');
const palmpay = require('../services/virtualAccounts/palmpay');

const normalizeSql = (text) => String(text).replace(/\s+/g, ' ').trim();

const mockDb = (t, handler) => {
  const original = db.query;
  db.query = async (sql, params) => handler(normalizeSql(sql), params);
  t.after(() => { db.query = original; });
};

const schemaStub = (text) =>
  text.startsWith('CREATE TABLE') ||
  text.startsWith('CREATE INDEX') ||
  text.startsWith('CREATE UNIQUE INDEX') ||
  text.startsWith('ALTER TABLE');

const enableProvider = () => {
  process.env.VIRTUAL_ACCOUNTS_ENABLED = 'true';
  process.env.VIRTUAL_ACCOUNT_PROVIDER = 'monnify';
  process.env.MONNIFY_API_KEY = 'test-key';
  process.env.MONNIFY_SECRET_KEY = 'test-secret';
  process.env.MONNIFY_CONTRACT_CODE = 'test-contract';
};

test('configuration stays off unless the flag and provider keys are both present', () => {
  const { getConfig } = require('../services/virtualAccountService');

  delete process.env.VIRTUAL_ACCOUNTS_ENABLED;
  process.env.MONNIFY_API_KEY = 'test-key';
  assert.equal(getConfig().enabled, false);

  process.env.VIRTUAL_ACCOUNTS_ENABLED = 'true';
  delete process.env.MONNIFY_API_KEY;
  assert.equal(getConfig().enabled, false);
});

test('the verified identity name is preferred over the typed registration name', () => {
  const { resolveAccountName } = require('../services/virtualAccountService');

  assert.equal(
    resolveAccountName({ full_name: 'H Musa', identity_verified_name: 'Haruna  Musa' }),
    'Haruna Musa'
  );
  assert.equal(resolveAccountName({ full_name: 'Haruna Musa' }), 'Haruna Musa');
});

test('a wallet account is refused when there is no NIN to give the partner bank', async (t) => {
  enableProvider();
  const { getWalletAccountForUser } = require('../services/virtualAccountService');

  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM users WHERE id')) {
      return { rows: [{ id: 9, full_name: 'Haruna Musa', email: 'h@example.com', nin: null, identity_verified_name: 'Haruna Musa' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await getWalletAccountForUser({ userId: 9, logger: { error() {} } });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'identity_required');
});

test('a wallet account is created in the verified name and reuses an existing one', async (t) => {
  enableProvider();
  const { getWalletAccountForUser } = require('../services/virtualAccountService');

  const originalCreate = monnify.createDedicatedAccount;
  let createdWith = null;
  monnify.createDedicatedAccount = async (payload) => {
    createdWith = payload;
    return {
      provider: 'monnify',
      kind: 'dva',
      accountReference: payload.reference,
      providerReference: 'RES_1',
      accountNumber: '9012345678',
      accountName: payload.name,
      bankName: 'Moniepoint Microfinance Bank',
      bankCode: '50515',
      status: 'active',
    };
  };
  t.after(() => { monnify.createDedicatedAccount = originalCreate; });

  let stored = null;
  mockDb(t, (text, params) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM users WHERE id')) {
      return {
        rows: [{
          id: 9,
          full_name: 'H. Musa',
          email: 'h@example.com',
          nin: '12345678901',
          identity_verified_name: 'Haruna Musa',
          nin_verified: true,
        }],
      };
    }
    if (text.includes('FROM virtual_accounts')) return { rows: [] };
    if (text.includes('INSERT INTO virtual_accounts')) {
      stored = {
        id: 1,
        provider: 'monnify',
        kind: 'dva',
        user_id: 9,
        account_reference: params[2],
        account_number: params[4],
        account_name: params[5],
        bank_name: params[6],
        bank_code: params[7],
        amount_expected: null,
        status: 'active',
        expires_at: null,
        registration_reference: null,
      };
      return { rows: [stored] };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await getWalletAccountForUser({ userId: 9, logger: { error() {} } });

  assert.equal(result.available, true);
  assert.equal(createdWith.name, 'Haruna Musa');
  assert.equal(createdWith.nin, '12345678901');
  assert.equal(result.account.account_number, '9012345678');
});

test('a registration transfer account carries the expected amount and an expiry', async (t) => {
  enableProvider();
  const { createRegistrationAccount } = require('../services/virtualAccountService');

  const originalCreate = monnify.createOneTimeAccount;
  let createdWith = null;
  monnify.createOneTimeAccount = async (payload) => {
    createdWith = payload;
    return {
      provider: 'monnify',
      kind: 'one_time',
      accountReference: payload.reference,
      providerReference: 'TRX_1',
      accountNumber: '8098765432',
      accountName: payload.name,
      bankName: 'Moniepoint Microfinance Bank',
      bankCode: '50515',
      status: 'active',
      expiresAt: new Date(Date.now() + 40 * 60 * 1000),
    };
  };
  t.after(() => { monnify.createOneTimeAccount = originalCreate; });

  mockDb(t, (text, params) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('FROM virtual_accounts')) return { rows: [] };
    if (text.includes('INSERT INTO virtual_accounts')) {
      return {
        rows: [{
          id: 2,
          provider: 'monnify',
          kind: 'one_time',
          registration_reference: params[1],
          account_reference: params[2],
          account_number: params[4],
          account_name: params[5],
          bank_name: params[6],
          bank_code: params[7],
          amount_expected: params[8],
          status: 'active',
          expires_at: params[9],
        }],
      };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await createRegistrationAccount({
    registration: {
      transaction_reference: 'ARH_REG_1',
      amount: '3000.00',
      email: 'h@example.com',
      full_name: 'H. Musa',
      registration_payload: { verified_identity_name: 'Haruna Musa' },
    },
    logger: { error() {} },
  });

  assert.equal(result.available, true);
  assert.equal(createdWith.amount, 3000);
  assert.equal(createdWith.name, 'Haruna Musa');
  assert.equal(result.account.amount_expected, 3000);
  assert.ok(result.account.expires_at);
});

test('a successful registration transfer finalises the registration once', async (t) => {
  enableProvider();
  const { applyEvent } = require('../services/virtualAccountService');
  const authService = require('../services/authService');

  const originalFinalize = authService.finalizeVirtualAccountRegistration;
  let calls = 0;
  authService.finalizeVirtualAccountRegistration = async () => {
    calls += 1;
    return { data: { user: { id: 42 } } };
  };
  t.after(() => { authService.finalizeVirtualAccountRegistration = originalFinalize; });

  const account = {
    id: 3,
    provider: 'monnify',
    kind: 'one_time',
    registration_reference: 'ARH_REG_1',
    account_number: '8098765432',
    account_reference: 'RENTALHUB-OT-abc',
    amount_expected: '3000.00',
    status: 'active',
  };

  mockDb(t, (text, params) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO virtual_account_events')) {
      return { rows: [{ id: 11, processed: false }] };
    }
    if (text.includes('FROM virtual_accounts WHERE account_number')) {
      return { rows: [account] };
    }
    if (text.includes('UPDATE virtual_account_events')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE virtual_accounts') && text.includes("status = 'paid'")) {
      return { rows: [{ id: 3 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await applyEvent({
    providerName: 'monnify',
    event: {
      eventId: 'evt-1',
      eventType: 'SUCCESSFUL_TRANSACTION',
      status: 'success',
      amount: 3000,
      accountNumber: '8098765432',
      accountReference: null,
      paymentReference: 'ARH_REG_1',
      providerReference: 'TRX_1',
      senderName: 'Haruna Musa',
      senderBank: 'GTBank',
      paidAt: '2026-10-23T10:00:00Z',
    },
    rawPayload: {},
    logger: { error() {}, warn() {} },
  });

  assert.equal(result.status, 'registration_completed');
  assert.equal(calls, 1);
});

test('a short registration transfer is never auto-approved', async (t) => {
  enableProvider();
  const { applyEvent } = require('../services/virtualAccountService');
  const authService = require('../services/authService');

  const originalFinalize = authService.finalizeVirtualAccountRegistration;
  let calls = 0;
  authService.finalizeVirtualAccountRegistration = async () => {
    calls += 1;
    return { data: { user: { id: 42 } } };
  };
  t.after(() => { authService.finalizeVirtualAccountRegistration = originalFinalize; });

  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO virtual_account_events')) return { rows: [{ id: 12, processed: false }] };
    if (text.includes('FROM virtual_accounts WHERE account_number')) {
      return {
        rows: [{
          id: 4,
          kind: 'one_time',
          registration_reference: 'ARH_REG_1',
          account_number: '8098765432',
          amount_expected: '3000.00',
          status: 'active',
        }],
      };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await applyEvent({
    providerName: 'monnify',
    event: {
      eventId: 'evt-2',
      eventType: 'SUCCESSFUL_TRANSACTION',
      status: 'success',
      amount: 1500,
      accountNumber: '8098765432',
      providerReference: 'TRX_2',
    },
    rawPayload: {},
    logger: { error() {}, warn() {} },
  });

  assert.equal(result.status, 'underpaid');
  assert.equal(calls, 0);
});

test('a repeat of an already processed event is a no-op', async (t) => {
  enableProvider();
  const { applyEvent } = require('../services/virtualAccountService');

  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO virtual_account_events')) return { rows: [{ id: 13, processed: true }] };
    return { rows: [], rowCount: 0 };
  });

  const result = await applyEvent({
    providerName: 'monnify',
    event: { eventId: 'evt-1', status: 'success', amount: 3000, accountNumber: '8098765432' },
    rawPayload: {},
    logger: { error() {}, warn() {} },
  });

  assert.equal(result.status, 'duplicate');
});

test('a webhook for an unknown account is recorded but not credited', async (t) => {
  enableProvider();
  const { applyEvent } = require('../services/virtualAccountService');

  mockDb(t, (text) => {
    if (schemaStub(text)) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO virtual_account_events')) return { rows: [{ id: 14, processed: false }] };
    if (text.includes('FROM virtual_accounts')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });

  const result = await applyEvent({
    providerName: 'monnify',
    event: {
      eventId: 'evt-3',
      status: 'success',
      amount: 5000,
      accountNumber: '0000000000',
    },
    rawPayload: {},
    logger: { error() {}, warn() {} },
  });

  assert.equal(result.status, 'unknown_account');
});

test('Monnify webhook signatures are verified against the raw body', () => {
  process.env.MONNIFY_SECRET_KEY = 'test-secret';
  const rawBody = Buffer.from(JSON.stringify({ eventType: 'SUCCESSFUL_TRANSACTION' }));
  const signature = crypto.createHmac('sha512', 'test-secret').update(rawBody).digest('hex');

  assert.equal(
    monnify.verifyWebhook({ rawBody, headers: { 'monnify-signature': signature } }),
    true
  );
  assert.equal(
    monnify.verifyWebhook({ rawBody, headers: { 'monnify-signature': 'deadbeef' } }),
    false
  );
  assert.equal(monnify.verifyWebhook({ rawBody, headers: {} }), false);
});

test('PalmPay amounts are converted from kobo and only successful orders count', () => {
  const body = {
    orderNo: 'PP_1',
    orderStatus: 2,
    orderAmount: 250000,
    virtualAccountNo: '7012345678',
    payerAccountName: 'Haruna Musa',
    payerBankName: 'GTBank',
    accountReference: 'RENTALHUB-DVA-9',
  };

  const parsed = palmpay.parseWebhook({ rawBody: JSON.stringify(body), body });
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.amount, 2500);
  assert.equal(parsed.accountNumber, '7012345678');

  const pending = palmpay.parseWebhook({
    rawBody: JSON.stringify({ ...body, orderStatus: 0 }),
    body: { ...body, orderStatus: 0 },
  });
  assert.equal(pending.status, 'ignored');
});

test('the webhook fails closed when no signature scheme is configured', async (t) => {
  enableProvider();
  const { handleWebhook } = require('../services/virtualAccountService');

  const originalSignatureRequired = palmpay.signatureRequired;
  palmpay.signatureRequired = () => false;
  process.env.VIRTUAL_ACCOUNT_PROVIDER = 'palmpay';
  t.after(() => { palmpay.signatureRequired = originalSignatureRequired; });

  await assert.rejects(
    () => handleWebhook({
      providerName: 'palmpay',
      rawBody: Buffer.from('{}'),
      body: {},
      headers: {},
      query: {},
    }),
    /authentication is not configured/i
  );
});
