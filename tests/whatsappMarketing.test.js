const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const {
  requireSuperAdmin,
  normalizeWhatsphone,
  validateCampaignPayload,
  createCampaign,
  sendCampaign,
} = require('../services/whatsappMarketingService');
const { sendWhatsAppTemplate } = require('../config/utils/whatsappService');
const { isRateLimitError, isTransientError } = require('../jobs/whatsappMarketingJobs');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 2, user_type: 'super_admin', full_name: 'Boss' },
  body: {},
  params: {},
  query: {},
  logger: { error() {}, warn() {}, info() {} },
  ...overrides,
});

const normalizeSql = (text) => String(text).replace(/\s+/g, ' ').trim();

const mockDb = (t, handler) => {
  const original = db.query;
  const queries = [];
  db.query = async (sql, params) => {
    const text = normalizeSql(sql);
    queries.push({ text, params });
    return handler(text, params, queries);
  };
  t.after(() => { db.query = original; });
  return queries;
};

test('requireSuperAdmin allows super admins and admins only', () => {
  let passed = false;
  const next = () => { passed = true; };

  passed = false;
  requireSuperAdmin(makeReq({ user: { user_type: 'super_admin' } }), makeRes(), next);
  assert.equal(passed, true, 'super_admin passes');

  passed = false;
  requireSuperAdmin(makeReq({ user: { user_type: 'tenant', is_admin: true } }), makeRes(), next);
  assert.equal(passed, true, 'is_admin passes');

  passed = false;
  const res = makeRes();
  requireSuperAdmin(makeReq({ user: { user_type: 'tenant' } }), res, next);
  assert.equal(passed, false, 'regular users never reach next()');
  assert.equal(res.statusCode, 403);
});

test('normalizeWhatsphone converts Nigerian formats to E.164', () => {
  assert.equal(normalizeWhatsphone('08034444444'), '2348034444444');
  assert.equal(normalizeWhatsphone('2348034444444'), '2348034444444');
  assert.equal(normalizeWhatsphone('+234 803 444 4444'), '2348034444444');
  assert.equal(normalizeWhatsphone('8034444444'), '2348034444444');
  assert.equal(normalizeWhatsphone('0803-444-4444'), '2348034444444');
  assert.equal(normalizeWhatsphone('abc'), null);
  assert.equal(normalizeWhatsphone(''), null);
  assert.equal(normalizeWhatsphone('080'), null);
  assert.equal(normalizeWhatsphone(null), null);
});

test('validateCampaignPayload enforces template and text rules', () => {
  assert.ok(validateCampaignPayload({ name: 'x', kind: 'nope' }).error);
  assert.ok(validateCampaignPayload({ name: '', kind: 'text' }).error);

  const badTemplate = validateCampaignPayload({ name: 'October blast', kind: 'template', template_name: 'bad name!' });
  assert.ok(badTemplate.error, 'template names must be Meta-safe');

  const goodTemplate = validateCampaignPayload({
    name: 'October blast', kind: 'template', template_name: 'rent_due_reminder',
    template_language: 'en_US', template_params: [' Ada ', '', 'N50,000'],
  });
  assert.ok(!goodTemplate.error);
  assert.equal(goodTemplate.value.template_name, 'rent_due_reminder');
  assert.deepEqual(goodTemplate.value.template_params, ['Ada', 'N50,000'], 'blank params dropped');

  const longText = validateCampaignPayload({ name: 'x', kind: 'text', content: 'a'.repeat(1001) });
  assert.ok(longText.error, 'text over 1000 chars rejected');

  const goodText = validateCampaignPayload({ name: 'x', kind: 'text', content: 'hello' });
  assert.ok(!goodText.error);
  assert.equal(goodText.value.content, 'hello');
});

test('createCampaign resolves, normalizes and dedupes the audience', async (t) => {
  const users = [
    { id: 1, phone: '08034444444', full_name: 'Ada' },
    { id: 2, phone: 'not-a-phone', full_name: 'Bad' },
    { id: 3, phone: '2348034444444', full_name: 'Ada again' },
    { id: 4, phone: '09099999999', full_name: 'Bola' },
  ];

  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM users')) return { rows: users };
    if (text.includes('INSERT INTO whatsapp_campaigns')) {
      return { rows: [{ id: 77, name: 'October blast', kind: 'text', status: 'draft' }] };
    }
    if (text.includes('INSERT INTO whatsapp_campaign_recipients')) return { rows: [], rowCount: 2 };
    if (text.includes('INSERT INTO whatsapp_marketing_operations')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await createCampaign(makeReq({ body: { name: 'October blast', kind: 'text', content: 'hello' } }), response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.recipients, 2, 'valid unique phones become recipients');
  assert.equal(response.body.data.skipped, 2, 'invalid + duplicate phones skipped');

  const userSelect = queries.find((q) => q.text.includes('FROM users'));
  assert.ok(userSelect, 'audience was resolved from users');

  const insert = queries.find((q) => q.text.includes('INSERT INTO whatsapp_campaign_recipients'));
  assert.ok(insert, 'recipients inserted');
  assert.ok(insert.text.includes('($1, $2, $3, $4)'), 'batch insert uses positional params');
  assert.equal(insert.params[1], '2348034444444', 'phone normalized before insert');
  assert.equal(insert.params[5], '2349099999999', 'second phone normalized too');
});

test('createCampaign rejects payloads the service validator refuses', async (t) => {
  mockDb(t, () => ({ rows: [], rowCount: 0 }));

  const response = makeRes();
  await createCampaign(makeReq({ body: { name: '', kind: 'text', content: 'hi' } }), response);
  assert.equal(response.statusCode, 400);
});

test('sendCampaign requires an approval note and respects campaign status', async (t) => {
  const queries = mockDb(t, (text) => {
    if (text.startsWith('UPDATE whatsapp_campaigns')) {
      return { rows: [{ id: 5, status: 'queued' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const noNote = makeRes();
  await sendCampaign(makeReq({ params: { id: '5' }, body: {} }), noNote);
  assert.equal(noNote.statusCode, 400);
  assert.match(noNote.body.message, /approval note/i);

  const ok = makeRes();
  await sendCampaign(makeReq({ params: { id: '5' }, body: { note: 'Approved by CEO for October rent push' } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.ok(queries.some((q) => q.text.includes("status IN ('draft', 'paused')")),
    'only draft or paused campaigns can be queued');
});

test('sendCampaign explains why a campaign cannot be queued', async (t) => {
  mockDb(t, (text) => {
    if (text.startsWith('UPDATE whatsapp_campaigns')) return { rows: [], rowCount: 0 };
    if (text.includes('SELECT status FROM whatsapp_campaigns')) return { rows: [{ status: 'sending' }] };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await sendCampaign(makeReq({ params: { id: '5' }, body: { note: 'note' } }), response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /sending/);
});

test('sendWhatsAppTemplate builds the exact Meta Graph payload', async (t) => {
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_META_TOKEN = 'test-eb-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1122334455667788';

  const axios = require('axios');
  const originalPost = axios.post;
  const captured = {};
  axios.post = async (url, payload, config) => {
    captured.url = url;
    captured.payload = payload;
    captured.auth = config?.headers?.Authorization;
    return { data: { messages: [{ id: 'wamid.TEST123' }] } };
  };
  t.after(() => {
    axios.post = originalPost;
    delete process.env.WHATSAPP_META_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  const result = await sendWhatsAppTemplate({
    to: '2348034444444',
    templateName: 'rent_due_reminder',
    language: 'en',
    params: ['Ada', 'N50,000'],
  });

  assert.equal(result.success, true);
  assert.equal(result.messageId, 'wamid.TEST123');
  assert.equal(captured.url, 'https://graph.facebook.com/v20.0/1122334455667788/messages');
  assert.equal(captured.auth, 'Bearer test-eb-token');
  assert.equal(captured.payload.type, 'template');
  assert.equal(captured.payload.to, '2348034444444', 'recipient reaches Meta in E.164');
  assert.equal(captured.payload.template.name, 'rent_due_reminder');
  assert.deepEqual(captured.payload.template.language, { code: 'en' });
  assert.deepEqual(captured.payload.template.components, [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: 'Ada' },
        { type: 'text', text: 'N50,000' },
      ],
    },
  ]);
});

test('queue processor classifies Meta errors so campaigns pause on rate limits', () => {
  assert.equal(isRateLimitError('Rate limit exceeded, please slow down'), true);
  assert.equal(isRateLimitError('(#130429) Too many messages'), true);
  assert.equal(isRateLimitError('Recipient phone number is not in allowed list'), false);

  assert.equal(isTransientError('gateway timeout'), true);
  assert.equal(isTransientError('connect ECONNRESET'), true);
  assert.equal(isTransientError('Template name does not exist'), false);
});
