const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const recruitmentService = require('../services/recruitmentService');

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
  };
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

const makeReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  logger: { error: () => {} },
  ...overrides,
});

test('new recruitment references use 128 bits of cryptographic randomness', () => {
  const references = Array.from(
    { length: 100 },
    () => recruitmentService.__test.generateReferenceNumber()
  );

  references.forEach((reference) => {
    assert.match(reference, /^RH-APP-[A-F0-9]{32}$/);
  });
  assert.equal(new Set(references).size, references.length);
});

test('applicant lookup requires both email and application reference', async (t) => {
  const originalQuery = db.query;
  let queryCount = 0;
  t.after(() => {
    db.query = originalQuery;
  });
  db.query = async () => {
    queryCount += 1;
    return { rows: [] };
  };

  const req = makeReq({ query: { email: 'applicant@example.test' } });
  const res = makeRes();

  await recruitmentService.getMyApplication(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /email and application reference/i);
  assert.equal(queryCount, 0);
});

test('verified applicant lookup filters by reference and strips internal secrets', async (t) => {
  const originalQuery = db.query;
  const queries = [];
  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (text, params) => {
    queries.push({ text, params });
    if (text.includes('FROM recruitment_applications a')) {
      return {
        rows: [{
          id: 41,
          cycle_id: 2,
          role_id: 7,
          full_name: 'Secure Applicant',
          email_address: 'applicant@example.test',
          phone_number: '+2348000000000',
          reference_number: 'RH-APP-0123456789ABCDEF0123456789ABCDEF',
          status: 'draft',
          payment_status: 'paid',
          access_code: 'RH-CR-ABCDE',
          access_code_used: false,
          payment_reference: 'RH_CR_41_123456',
          payment_gateway_payload: { authorization: { last4: '4081' } },
          interview_challenge_token: 'a'.repeat(64),
          interview_fingerprint: 'browser-fingerprint',
          interview_user_agent: 'private-user-agent',
          interview_security_log: 'internal log',
          admin_notes: 'internal note',
          role_title: 'Operations',
          role_type: 'standard',
          cycle_title: '2026 intake',
        }],
      };
    }
    if (text.includes('FROM recruitment_documents')) {
      return {
        rows: [{
          id: 91,
          application_id: 41,
          document_type: 'cv',
          file_name: 'resume.pdf',
          file_path: 'D:\\private\\uploads\\resume.pdf',
          file_size: 1200,
          mime_type: 'application/pdf',
        }],
      };
    }
    throw new Error(`Unexpected query: ${text}`);
  };

  const req = makeReq({
    query: {
      email: 'applicant@example.test',
      reference_number: 'RH-APP-0123456789ABCDEF0123456789ABCDEF',
    },
  });
  const res = makeRes();

  await recruitmentService.getMyApplication(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(queries[0].text, /UPPER\(a\.reference_number\) = \$2/);
  assert.deepEqual(queries[0].params, [
    'applicant@example.test',
    'RH-APP-0123456789ABCDEF0123456789ABCDEF',
  ]);
  assert.equal(res.body.data.full_name, 'Secure Applicant');
  assert.equal(res.body.data.documents[0].file_name, 'resume.pdf');

  for (const field of [
    'access_code',
    'payment_reference',
    'payment_gateway_payload',
    'interview_challenge_token',
    'interview_fingerprint',
    'interview_user_agent',
    'interview_security_log',
    'admin_notes',
  ]) {
    assert.equal(Object.hasOwn(res.body.data, field), false, `${field} must not be returned`);
  }
  assert.equal(Object.hasOwn(res.body.data.documents[0], 'file_path'), false);
  assert.doesNotMatch(
    JSON.stringify(res.body),
    /RH-CR-ABCDE|RH_CR_41_123456|browser-fingerprint|private-user-agent|private\\\\uploads/
  );
});

test('plural applicant lookup is scoped to the supplied reference', async (t) => {
  const originalQuery = db.query;
  let observedQuery;
  let observedParams;
  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (text, params) => {
    observedQuery = text;
    observedParams = params;
    return {
      rows: [{
        id: 12,
        email_address: 'applicant@example.test',
        reference_number: 'RH-APP-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        status: 'submitted',
        access_code: 'RH-CR-XXXXX',
      }],
    };
  };

  const req = makeReq({
    query: {
      email: 'applicant@example.test',
      reference_number: 'RH-APP-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
  });
  const res = makeRes();

  await recruitmentService.getMyApplications(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(observedQuery, /UPPER\(a\.reference_number\) = \$2/);
  assert.deepEqual(observedParams, [
    'applicant@example.test',
    'RH-APP-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ]);
  assert.equal(res.body.data.length, 1);
  assert.equal(Object.hasOwn(res.body.data[0], 'access_code'), false);
});

test('application mutation rejects an ID with the wrong applicant reference', async (t) => {
  const originalQuery = db.query;
  let queryCount = 0;
  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async () => {
    queryCount += 1;
    return {
      rows: [{
        id: 51,
        email_address: 'applicant@example.test',
        reference_number: 'RH-APP-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        status: 'draft',
      }],
    };
  };

  const req = makeReq({
    params: { id: '51' },
    body: {
      applicant_email: 'applicant@example.test',
      reference_number: 'RH-APP-WRONGREFERENCE0000000000000000000',
      full_name: 'Unauthorized change',
    },
  });
  const res = makeRes();

  await recruitmentService.updateApplication(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(queryCount, 1);
  assert.match(res.body.message, /verification failed/i);
});

test('an interview action requires the issued high-entropy challenge', async (t) => {
  const originalQuery = db.query;
  let queryCount = 0;
  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async () => {
    queryCount += 1;
    return {
      rows: [{
        id: 61,
        interview_started_at: new Date().toISOString(),
        interview_challenge_token: 'c'.repeat(64),
        interview_fingerprint: null,
        interview_security_log: null,
      }],
    };
  };

  const req = makeReq({
    body: {
      application_id: 61,
      question_id: 4,
      answer: 'A',
    },
  });
  const res = makeRes();

  await recruitmentService.submitAnswer(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(queryCount, 1);
  assert.match(res.body.message, /challenge failed/i);
});
