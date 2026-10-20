const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const {
  requireSuperAdmin,
  normalizeWhatsphone,
  validateCampaignPayload,
  isSafeMediaFilename,
  createCampaign,
  sendCampaign,
  importContacts,
  addContact,
  checkContacts,
  deleteInvalidContacts,
  resolveAudience,
  normalizeAudienceScope,
} = require('../services/whatsappMarketingService');
const { sendWhatsAppTemplate, sendWhatsAppMedia } = require('../config/utils/whatsappService');
const { isRateLimitError, isTransientError, processWhatsappQueue, dailySendLimit } = require('../jobs/whatsappMarketingJobs');

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
  assert.ok(insert.text.includes('($1, $2, $3, $4, $5)'), 'batch insert uses positional params');
  assert.equal(insert.params[1], '2348034444444', 'phone normalized before insert');
  assert.equal(insert.params[6], '2349099999999', 'second phone normalized too');
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

test('validateCampaignPayload accepts media with an optional caption and rejects bad links', () => {
  const mediaOnly = validateCampaignPayload({
    name: 'Photos blast',
    kind: 'text',
    media_type: 'image',
    media_url: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_1.jpg',
  });
  assert.ok(!mediaOnly.error, 'media without text is allowed');
  assert.equal(mediaOnly.value.media_type, 'image');
  assert.equal(mediaOnly.value.content, null);

  const mediaWithCaption = validateCampaignPayload({
    name: 'Photos blast',
    kind: 'text',
    content: 'New listings this week',
    media_type: 'video',
    media_url: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_2.mp4',
  });
  assert.ok(!mediaWithCaption.error);
  assert.equal(mediaWithCaption.value.content, 'New listings this week');

  assert.ok(
    validateCampaignPayload({
      name: 'bad', kind: 'text', media_type: 'image', media_url: 'http://insecure.example.com/a.jpg',
    }).error,
    'non-https media links rejected'
  );
  assert.ok(
    validateCampaignPayload({ name: 'bad', kind: 'text', media_type: 'image' }).error,
    'media type without a link rejected'
  );
  assert.ok(
    validateCampaignPayload({ name: 'bad', kind: 'text', media_url: 'https://x.test/a.jpg' }).error,
    'media link without a type rejected'
  );
  assert.ok(
    validateCampaignPayload({ name: 'bad', kind: 'text', media_type: 'audio', media_url: 'https://x.test/a.mp3' }).error,
    'unsupported media type rejected'
  );

  const templateWithHeader = validateCampaignPayload({
    name: 'Template blast',
    kind: 'template',
    template_name: 'listing_alert',
    header_media_type: 'image',
    header_media_url: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_3.jpg',
  });
  assert.ok(!templateWithHeader.error);
  assert.equal(templateWithHeader.value.header_media_type, 'image');
  assert.equal(templateWithHeader.value.header_media_url, 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_3.jpg');
  assert.equal(templateWithHeader.value.media_url, null, 'free-form media is not used for template campaigns');
});

test('createCampaign persists media columns for free-form media campaigns', async (t) => {
  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM users')) return { rows: [{ id: 1, phone: '08034444444', full_name: 'Ada' }] };
    if (text.includes('INSERT INTO whatsapp_campaigns')) {
      return { rows: [{ id: 88, name: 'Photos blast', kind: 'text', status: 'draft' }] };
    }
    if (text.includes('INSERT INTO whatsapp_campaign_recipients')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO whatsapp_marketing_operations')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await createCampaign(makeReq({
    body: {
      name: 'Photos blast',
      kind: 'text',
      media_type: 'image',
      media_url: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_9.jpg',
    },
  }), response);

  assert.equal(response.statusCode, 201);
  const insert = queries.find((q) => q.text.includes('INSERT INTO whatsapp_campaigns'));
  assert.ok(insert.text.includes('media_type, media_url, header_media_type, header_media_url'));
  assert.equal(insert.params[6], 'image');
  assert.equal(insert.params[7], 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_9.jpg');
});

test('sendWhatsAppMedia builds the exact Meta Graph payload', async (t) => {
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
    return { data: { messages: [{ id: 'wamid.MEDIA1' }] } };
  };
  t.after(() => {
    axios.post = originalPost;
    delete process.env.WHATSAPP_META_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  const image = await sendWhatsAppMedia({
    to: '2348034444444',
    mediaType: 'image',
    link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_1.jpg',
    caption: 'New listings',
  });
  assert.equal(image.success, true);
  assert.equal(image.messageId, 'wamid.MEDIA1');
  assert.equal(captured.payload.type, 'image');
  assert.deepEqual(captured.payload.image, {
    link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_1.jpg',
    caption: 'New listings',
  });

  const video = await sendWhatsAppMedia({
    to: '2348034444444',
    mediaType: 'video',
    link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_2.mp4',
  });
  assert.equal(video.success, true);
  assert.equal(captured.payload.type, 'video');
  assert.deepEqual(captured.payload.video, {
    link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_2.mp4',
  });

  const badType = await sendWhatsAppMedia({ to: '2348034444444', mediaType: 'audio', link: 'https://x.test/a.mp3' });
  assert.equal(badType.success, false);
});

test('sendWhatsAppTemplate prepends a header media component when supplied', async (t) => {  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_META_TOKEN = 'test-eb-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1122334455667788';

  const axios = require('axios');
  const originalPost = axios.post;
  const captured = {};
  axios.post = async (url, payload) => {
    captured.payload = payload;
    return { data: { messages: [{ id: 'wamid.HDR1' }] } };
  };
  t.after(() => {
    axios.post = originalPost;
    delete process.env.WHATSAPP_META_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  const result = await sendWhatsAppTemplate({
    to: '2348034444444',
    templateName: 'listing_alert',
    language: 'en',
    params: ['Ada'],
    headerMedia: { type: 'image', link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_3.jpg' },
  });

  assert.equal(result.success, true);
  assert.deepEqual(captured.payload.template.components, [
    { type: 'header', parameters: [{ type: 'image', image: { link: 'https://rentalhub.com.ng/uploads/whatsapp-campaigns/wa_3.jpg' } }] },
    { type: 'body', parameters: [{ type: 'text', text: 'Ada' }] },
  ]);
});

test('isSafeMediaFilename only resolves server-generated media names', () => {
  assert.equal(isSafeMediaFilename('wa_1699999999999_0123456789abcdef01234567.jpg'), true);
  assert.equal(isSafeMediaFilename('wa_1699999999999_0123456789abcdef01234567.mp4'), true);
  assert.equal(isSafeMediaFilename('wa_1699999999999_0123456789abcdef01234567.3gp'), true);

  assert.equal(isSafeMediaFilename('../../etc/passwd'), false);
  assert.equal(isSafeMediaFilename('wa_1_zzz.jpg'), false);
  assert.equal(isSafeMediaFilename('wa_1_0123456789abcdef01234567.svg'), false);
  assert.equal(isSafeMediaFilename('wa_1_0123456789abcdef01234567.jpg.exe'), false);
  assert.equal(isSafeMediaFilename('wa_1_0123456789ABCDEF01234567.jpg'), false);
  assert.equal(isSafeMediaFilename(''), false);
  assert.equal(isSafeMediaFilename(null), false);
});

test('dailySendLimit reads WHATSAPP_DAILY_SEND_LIMIT and defaults to 250', () => {
  const original = process.env.WHATSAPP_DAILY_SEND_LIMIT;
  try {
    delete process.env.WHATSAPP_DAILY_SEND_LIMIT;
    assert.equal(dailySendLimit(), 250, 'defaults to the Meta unverified-tier ceiling');

    process.env.WHATSAPP_DAILY_SEND_LIMIT = '200';
    assert.equal(dailySendLimit(), 200, 'the operator can pin a smaller daily chunk');

    process.env.WHATSAPP_DAILY_SEND_LIMIT = '0';
    assert.equal(dailySendLimit(), 250, 'zero falls back to the default');

    process.env.WHATSAPP_DAILY_SEND_LIMIT = 'not-a-number';
    assert.equal(dailySendLimit(), 250, 'garbage falls back to the default');
  } finally {
    if (original === undefined) delete process.env.WHATSAPP_DAILY_SEND_LIMIT;
    else process.env.WHATSAPP_DAILY_SEND_LIMIT = original;
  }
});

test('queue processor stops spending once the daily budget is used up', async (t) => {
  const original = process.env.WHATSAPP_DAILY_SEND_LIMIT;
  process.env.WHATSAPP_DAILY_SEND_LIMIT = '200';
  t.after(() => {
    if (original === undefined) delete process.env.WHATSAPP_DAILY_SEND_LIMIT;
    else process.env.WHATSAPP_DAILY_SEND_LIMIT = original;
  });

  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    // 200 already sent today for this UTC day.
    if (text.includes('FROM whatsapp_campaign_recipients') && text.includes('sent_today')
      || text.includes('COUNT(*)::int AS sent FROM whatsapp_campaign_recipients')) {
      return { rows: [{ sent: 200 }] };
    }
    if (text.includes("WHERE status IN ('queued', 'sending')")) {
      return { rows: [{ id: 1, kind: 'text', content: 'hi' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  await processWhatsappQueue();

  assert.ok(
    !queries.some((q) => q.text.includes("WHERE status IN ('queued', 'sending')")),
    'a spent budget means no campaign is even activated for sending'
  );
});

test('queue processor re-picks campaigns already marked sending so the queue drains across days', async (t) => {
  const original = process.env.WHATSAPP_DAILY_SEND_LIMIT;
  process.env.WHATSAPP_DAILY_SEND_LIMIT = '200';
  t.after(() => {
    if (original === undefined) delete process.env.WHATSAPP_DAILY_SEND_LIMIT;
    else process.env.WHATSAPP_DAILY_SEND_LIMIT = original;
  });

  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('COUNT(*)::int AS sent FROM whatsapp_campaign_recipients')) {
      return { rows: [{ sent: 20 }] };
    }
    if (text.includes("WHERE status IN ('queued', 'sending')")) {
      return { rows: [{ id: 9, kind: 'text', content: 'rent due' }] };
    }
    if (text.includes('FROM whatsapp_campaign_recipients') && text.includes("status = 'pending'")) {
      return { rows: [{ id: 1001, phone: '2348034444444' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  await processWhatsappQueue();

  assert.ok(
    queries.some((q) => q.text.includes("WHERE status IN ('queued', 'sending')")),
    'a campaign left in "sending" is activated again instead of stalling'
  );
  assert.ok(
    queries.some((q) => q.text.includes('WHERE id = $1') && q.text.includes('whatsapp_campaign_recipients') && q.params?.[0] === 1001),
    'the resumed recipient is processed and its outcome written back'
  );
});

test('importContacts refuses numbers already in the system and never revives them', async (t) => {
  // 2348034444444 (=08034444444) is a registered user, 2348099999999 already
  // sits in the WhatsApp list. Both must be refused, not upserted.
  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM users WHERE phone')) return { rows: [{ phone: '2348034444444' }] };
    if (text.includes('FROM sms_subscribers WHERE phone')) return { rows: [] };
    if (text.includes('FROM whatsapp_contacts WHERE phone')) return { rows: [{ phone: '2348099999999' }] };
    if (text.includes('FROM survey_responses')) return { rows: [] };
    if (text.includes('INSERT INTO whatsapp_contacts')) return { rows: [], rowCount: 1 };
    if (text.includes('COUNT(*)::int AS total FROM whatsapp_contacts')) return { rows: [{ total: 4 }] };
    if (text.includes('INSERT INTO whatsapp_marketing_operations')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await importContacts(
    makeReq({
      body: {
        phones: [
          '08034444444',      // registered user -> refused
          '2348034444444',    // same user, other shape -> also refused, not a duplicate
          '+234 809 999 9999', // already in the WhatsApp list -> refused
          '08076543210',      // genuinely new -> imported
          '08076543210',      // same as above -> duplicate within the upload
          'nonsense',         // invalid
        ],
      },
    }),
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.invalid, 1, 'junk entry counted as invalid');
  assert.equal(
    response.body.data.duplicates,
    2,
    'the same number appearing twice in the upload (including as 0803… and 234803…) is counted once'
  );
  assert.equal(
    response.body.data.alreadyKnown,
    2,
    'the registered user and the existing WhatsApp contact are both refused'
  );

  const insert = queries.find((q) => q.text.includes('INSERT INTO whatsapp_contacts'));
  assert.equal(
    insert.text.includes('DO UPDATE'),
    false,
    'an existing contact is never upserted back to subscribed'
  );
  assert.ok(insert.text.includes('DO NOTHING'), 'conflicting rows are left untouched');
  assert.ok(insert.params.includes('2348076543210'), 'the one new number is stored in E.164 form');
  assert.ok(!insert.params.includes('2348034444444'), 'the registered user is never written');
  assert.ok(!insert.params.includes('2348099999999'), 'the existing WhatsApp contact is never rewritten');
});

test('importContacts refuses the whole upload when every number is already known', async (t) => {
  mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM users WHERE phone')) return { rows: [{ phone: '2348034444444' }] };
    if (text.includes('FROM sms_subscribers WHERE phone')) return { rows: [] };
    if (text.includes('FROM whatsapp_contacts WHERE phone')) return { rows: [] };
    if (text.includes('FROM survey_responses')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await importContacts(makeReq({ body: { phones: ['08034444444'] } }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /already exist in the system/i);
});

test('addContact rejects numbers Meta could never reach', async (t) => {
  mockDb(t, () => ({ rows: [], rowCount: 0 }));
  const response = makeRes();
  await addContact(makeReq({ body: { phone: '123' } }), response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /valid Nigerian phone/i);
});

test('checkContacts fails loudly when the provider cannot be reached', async (t) => {
  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM whatsapp_contacts WHERE wa_status')) {
      return { rows: [{ id: 1, phone: '2348034444444' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  // No Meta credentials in the test env, so the first batch fails.
  delete process.env.WHATSAPP_META_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  const response = makeRes();
  await checkContacts(makeReq({ body: { all: true } }), response);

  assert.equal(response.statusCode, 502, 'a provider failure surfaces instead of silently passing');
  assert.equal(queries.filter((q) => q.text.includes('UPDATE whatsapp_contacts SET wa_status')).length, 0);
});

test('resolveAudience excludes contacts Meta flagged as invalid', async (t) => {
  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM whatsapp_contacts')) {
      return { rows: [{ id: 5, phone: '2348034444444', full_name: 'Ada' }] };
    }
    return { rows: [], rowCount: 0 };
  });

  const { byPhone, source } = await resolveAudience({ source: 'contacts' });
  assert.equal(source, 'contacts');
  assert.equal(byPhone.size, 1);
  assert.equal(byPhone.get('2348034444444').contactId, 5, 'imported contact carries its id');

  const contactSelect = queries.find((q) => q.text.includes('FROM whatsapp_contacts'));
  assert.ok(
    contactSelect.text.includes("wa_status <> 'invalid'"),
    'contacts Meta marked invalid are never queued'
  );
  assert.ok(contactSelect.text.includes('subscribed = TRUE'), 'unsubscribed contacts are excluded');
});

test('normalizeAudienceScope falls back to platform users for unknown values', () => {
  assert.equal(normalizeAudienceScope('contacts'), 'contacts');
  assert.equal(normalizeAudienceScope('both'), 'both');
  assert.equal(normalizeAudienceScope('whatever'), 'users');
  assert.equal(normalizeAudienceScope(undefined), 'users');
});

test('deleteInvalidContacts removes only numbers Meta rejected', async (t) => {
  const queries = mockDb(t, (text) => {
    if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX') || text.startsWith('ALTER TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("DELETE FROM whatsapp_contacts WHERE wa_status = 'invalid'")) {
      return { rows: [{ id: 4 }, { id: 7 }], rowCount: 2 };
    }
    if (text.includes('INSERT INTO whatsapp_marketing_operations')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const response = makeRes();
  await deleteInvalidContacts(makeReq(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.deleted, 2);

  const del = queries.find((q) => q.text.includes('DELETE FROM whatsapp_contacts'));
  assert.ok(del.text.includes("wa_status = 'invalid'"), 'only invalid contacts are swept');
  assert.ok(
    !del.text.includes("wa_status = 'unknown'"),
    'unchecked contacts are kept so the list can still be checked later'
  );
});

test('phoneKey treats 0803… and 234803… as the same person', () => {
  const { phoneKey, isUsableNigerianNumber } = require('../services/contactIdentityService');
  assert.equal(phoneKey('08034444444'), phoneKey('2348034444444'));
  assert.equal(phoneKey('+234 803 444 4444'), phoneKey('08034444444'));
  assert.equal(isUsableNigerianNumber('08034444444'), true);
  assert.equal(isUsableNigerianNumber('12345'), false, 'too short');
  assert.equal(isUsableNigerianNumber('080344444'), false, 'nine digits is not a Nigerian number');
});
