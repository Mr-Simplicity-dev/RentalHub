const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';

const axios = require('axios');
const db = require('../config/middleware/database');
const recruitmentService = require('../services/recruitmentService');

const application = {
  id: 41,
  application_fee: '5000.00',
  payment_reference: 'RH_CR_41_1785300000000',
  email_address: 'applicant@example.test',
  reference_number: 'RH-APP-0123456789ABCDEF0123456789ABCDEF',
  payment_status: 'pending',
};

const transaction = {
  status: 'success',
  reference: application.payment_reference,
  amount: 500000,
  currency: 'NGN',
  metadata: {
    type: 'recruitment_application_access_fee',
    application_id: application.id,
  },
};

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

test('recruitment payment validation accepts only the exact expected transaction', () => {
  const validation = recruitmentService.__test.validateRecruitmentGatewayTransaction(
    application,
    transaction
  );

  assert.deepEqual(validation, { valid: true });
  assert.equal(recruitmentService.__test.getApplicationFeeKobo(application), 500000);
  assert.equal(
    recruitmentService.__test.validateRecruitmentGatewayTransaction(application, {
      ...transaction,
      metadata: JSON.stringify(transaction.metadata),
    }).valid,
    true
  );
});

test('recruitment payment validation rejects mismatched integrity fields', async (t) => {
  const cases = [
    ['status', { status: 'pending' }, /not successful/i],
    ['reference', { reference: 'RH_CR_OTHER' }, /reference/i],
    ['amount', { amount: 100 }, /amount/i],
    ['currency', { currency: 'USD' }, /currency/i],
    ['purpose', { metadata: { ...transaction.metadata, type: 'property_payment' } }, /purpose/i],
    ['application ID', { metadata: { ...transaction.metadata, application_id: 99 } }, /application ID/i],
  ];

  for (const [name, override, expectedReason] of cases) {
    await t.test(name, () => {
      const validation = recruitmentService.__test.validateRecruitmentGatewayTransaction(
        application,
        { ...transaction, ...override }
      );
      assert.equal(validation.valid, false);
      assert.match(validation.reason, expectedReason);
    });
  }
});

test('manual verification cannot fulfill an underpaid recruitment transaction', async (t) => {
  const originalQuery = db.query;
  const originalGet = axios.get;
  let queryCount = 0;

  t.after(() => {
    db.query = originalQuery;
    axios.get = originalGet;
  });

  db.query = async () => {
    queryCount += 1;
    return { rows: [application] };
  };
  axios.get = async () => ({
    data: {
      data: {
        ...transaction,
        amount: 100,
      },
    },
  });

  const req = {
    params: { reference: application.payment_reference },
    body: {
      applicant_email: application.email_address,
      reference_number: application.reference_number,
    },
    logger: { error: () => {}, warn: () => {} },
  };
  const res = makeRes();

  await recruitmentService.verifyPayment(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /do not match/i);
  assert.equal(queryCount, 1);
});

test('signed webhook looks up the exact reference and rejects a mismatched application ID', async (t) => {
  const originalQuery = db.query;
  const originalSecret = process.env.PAYSTACK_SECRET_KEY;
  const queries = [];
  const secret = 'paystack-test-secret';

  t.after(() => {
    db.query = originalQuery;
    if (originalSecret === undefined) {
      delete process.env.PAYSTACK_SECRET_KEY;
    } else {
      process.env.PAYSTACK_SECRET_KEY = originalSecret;
    }
  });

  process.env.PAYSTACK_SECRET_KEY = secret;
  db.query = async (text, params) => {
    queries.push({ text, params });
    return { rows: [application] };
  };

  const event = {
    event: 'charge.success',
    data: {
      ...transaction,
      metadata: {
        ...transaction.metadata,
        application_id: 99,
      },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const req = {
    headers: { 'x-paystack-signature': signature },
    rawBody,
    body: event,
    ip: '127.0.0.1',
    socket: {},
    logger: { error: () => {}, warn: () => {} },
  };
  const res = makeRes();

  await recruitmentService.paystackWebhook(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /WHERE payment_reference = \$1/);
  assert.match(queries[0].text, /AND id = \$2/);
  assert.doesNotMatch(queries[0].text, /\sOR\s/i);
  assert.deepEqual(queries[0].params, [application.payment_reference, 99]);
});
