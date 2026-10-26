const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const axios = require('axios');
const mailer = require('../config/utils/mailer');
const audit = require('../config/utils/auditLogger');
const originalMail = mailer.sendEmail;
const originalAudit = audit.logAction;
let emails = [];
let audits = [];
mailer.sendEmail = async (payload) => { emails.push(payload); };
audit.logAction = async (payload) => { audits.push(payload); };
const service = require('../services/recruitmentService');
const { VOLUNTEER_OPPORTUNITY_TEMPLATES } = require('../services/volunteerOpportunityCatalog');

after(() => {
  mailer.sendEmail = originalMail;
  audit.logAction = originalAudit;
});

const logger = { error: () => {}, warn: () => {} };
const result = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const volunteerRole = {
  id: 9,
  cycle_id: 2,
  title: 'Volunteer Customer Support Agent',
  type: 'Administrative',
  opportunity_type: 'volunteer',
  application_fee: 0,
  premium_fee: 0,
};

const applicationPayload = {
  role_id: 9,
  full_name: 'Volunteer Applicant',
  phone_number: '08012345678',
  email_address: 'applicant@example.test',
  state_name: 'Abuja',
  lga_name: 'Gwagwalada',
  area_locality: 'Kutunku',
  residential_address: 'Local address',
  suitability_reason: 'Relevant community experience',
  volunteer_motivation: 'Support the community',
  availability: 'Saturdays, 4 hours',
};

const forbiddenVolunteerTitles = [
  'Volunteer Marketing Agent',
  'Volunteer Rental Agent',
  'Volunteer Lawyer',
  'Volunteer Financial Officer',
  'Volunteer Identity Verification Officer',
  'Volunteer Property Ownership Verification Officer',
  'Volunteer Transportation Agent',
  'Volunteer Fumigation Agent',
  'Volunteer Super Admin',
];

test('catalog contains exactly the eight approved volunteer opportunities with complete, experience-friendly content', () => {
  const titles = VOLUNTEER_OPPORTUNITY_TEMPLATES.map((template) => template.title);
  assert.equal(VOLUNTEER_OPPORTUNITY_TEMPLATES.length, 8);
  assert.deepEqual(titles, [
    'Volunteer Customer Support Agent',
    'Volunteer Field Operations Assistant',
    'Volunteer Community Outreach Representative',
    'Volunteer Campus Representative',
    'Volunteer Property Media Assistant',
    'Volunteer Business Development & Partnerships Assistant',
    'Volunteer Creative & Social Media Assistant',
    'Volunteer Operations & Administrative Assistant',
  ]);
  for (const template of VOLUNTEER_OPPORTUNITY_TEMPLATES) {
    assert.ok(['Administrative', 'Technical'].includes(template.type), template.title);
    assert.ok(template.description.includes('What you will do'), template.title);
    assert.ok(template.description.includes('What we are looking for'), template.title);
    assert.ok(template.description.includes('Role boundaries'), template.title);
    assert.ok(template.description.includes('Availability and location'), template.title);
    assert.ok(template.description.includes('Selection and contact'), template.title);
    assert.match(template.description, /No degree, HND, OND or formal certificate is required/i, template.title);
    assert.match(template.description, /does not guarantee selection, employment, salary or future employment/i, template.title);
    assert.ok(forbiddenVolunteerTitles.every((title) => !titles.includes(title)), template.title);
  }
});

test('applying templates creates the eight volunteer roles idempotently without changing the volunteer toggle', async (t) => {
  const originalQuery = db.query;
  const queries = [];
  const existing = new Set();
  let nextId = 100;
  audits = [];
  t.after(() => { db.query = originalQuery; });
  db.query = async (text, params = []) => {
    queries.push({ text, params });
    if (text.includes('SELECT user_type, is_recruitment_admin')) {
      return { rows: [{ user_type: 'super_admin', is_recruitment_admin: true }] };
    }
    if (text.includes('FROM recruitment_cycles') && text.includes('WHERE id = $1')) {
      return { rows: [{ id: 2, title: '2026 Volunteer Cycle' }] };
    }
    if (text.includes('INSERT INTO recruitment_roles')) {
      const key = params[0].toLowerCase();
      if (existing.has(key)) return { rows: [] };
      existing.add(key);
      return { rows: [{
        id: nextId++,
        title: params[0],
        type: params[1],
        description: params[2],
        opportunity_type: 'volunteer',
        application_fee: 0,
        premium_fee: 0,
      }] };
    }
    return { rows: [] };
  };

  const first = result();
  await service.applyVolunteerOpportunityTemplates({ body: { cycle_id: 2 }, user: { id: 1 }, logger }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.data.created.length, 8);
  assert.equal(first.body.data.skipped.length, 0);
  assert.deepEqual(first.body.data.created, VOLUNTEER_OPPORTUNITY_TEMPLATES.map((template) => template.title));
  assert.equal(audits.filter((entry) => entry.action === 'VOLUNTEER_OPPORTUNITY_CREATED').length, 8);
  assert.ok(audits.some((entry) => entry.action === 'VOLUNTEER_OPPORTUNITY_TEMPLATES_APPLIED'));
  assert.ok(queries.filter((query) => query.text.includes('INSERT INTO recruitment_roles'))
    .every((query) => query.params.slice(3, 4)[0] === 2));
  assert.ok(queries.filter((query) => query.text.includes('INSERT INTO recruitment_roles'))
    .every((query) => !/application_fee|premium_fee/.test(query.text) || query.text.includes('0, 0')));
  assert.ok(!queries.some((query) => /UPDATE recruitment_settings|INSERT INTO users|UPDATE users/i.test(query.text)));

  const second = result();
  await service.applyVolunteerOpportunityTemplates({ body: { cycle_id: 2 }, user: { id: 1 }, logger }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.data.created.length, 0);
  assert.equal(second.body.data.skipped.length, 8);
});

test('templates are not attached to missing or closed cycles and non-admins cannot create them', async (t) => {
  const originalQuery = db.query;
  const queries = [];
  t.after(() => { db.query = originalQuery; });
  db.query = async (text, params = []) => {
    queries.push({ text, params });
    if (text.includes('SELECT user_type, is_recruitment_admin')) {
      return { rows: [{ user_type: 'recruitment_admin', is_recruitment_admin: true }] };
    }
    if (text.includes('FROM recruitment_cycles')) return { rows: [] };
    return { rows: [] };
  };

  const closed = result();
  await service.applyVolunteerOpportunityTemplates({ body: { cycle_id: 9 }, user: { id: 2 }, logger }, closed);
  assert.equal(closed.statusCode, 400);
  assert.ok(!queries.some((query) => query.text.includes('INSERT INTO recruitment_roles')));

  db.query = async (text) => {
    if (text.includes('SELECT user_type, is_recruitment_admin')) {
      return { rows: [{ user_type: 'tenant', is_recruitment_admin: false }] };
    }
    return { rows: [] };
  };
  const denied = result();
  await service.applyVolunteerOpportunityTemplates({ body: { cycle_id: 2 }, user: { id: 3 }, logger }, denied);
  assert.equal(denied.statusCode, 403);
});

test('volunteer applications do not require formal education while employment applications still do', async (t) => {
  const originalQuery = db.query;
  t.after(() => { db.query = originalQuery; });
  const queries = [];
  db.query = async (text, params = []) => {
    queries.push({ text, params });
    if (text.includes('INSERT INTO recruitment_settings')) return { rows: [] };
    if (text.includes('SELECT * FROM recruitment_settings')) {
      return { rows: [{ is_active: true, volunteer_applications_enabled: true }] };
    }
    if (text.includes('FROM recruitment_roles r') && text.includes('WHERE r.id = $1')) {
      return { rows: [volunteerRole] };
    }
    if (text.includes('FROM recruitment_location_activation')) {
      return { rows: text.includes('COUNT') ? [{ count: 0 }] : [] };
    }
    if (text.includes('INSERT INTO recruitment_applications')) {
      return { rows: [{
        id: 123,
        cycle_id: volunteerRole.cycle_id,
        role_id: volunteerRole.id,
        application_fee: params[15],
        application_track: params[16],
        reference_number: params[17],
        status: params[18],
        payment_status: params[19],
        volunteer_motivation: params[20],
        availability: params[21],
      }] };
    }
    return { rows: [] };
  };

  emails = [];
  const volunteerResponse = result();
  await service.createApplication({ body: { ...applicationPayload }, query: {}, params: {}, logger }, volunteerResponse);
  assert.equal(volunteerResponse.statusCode, 201);
  assert.equal(volunteerResponse.body.data.application_fee, 0);
  assert.equal(volunteerResponse.body.data.payment_status, 'not_applicable');
  assert.ok(!queries.some((query) => query.text.includes('INSERT INTO recruitment_applications')
    && query.params[10] !== ''));

  const employmentResponse = result();
  db.query = async (text, params = []) => {
    queries.push({ text, params });
    if (text.includes('INSERT INTO recruitment_settings')) return { rows: [] };
    if (text.includes('SELECT * FROM recruitment_settings')) return { rows: [{ is_active: true }] };
    if (text.includes('FROM recruitment_roles r') && text.includes('WHERE r.id = $1')) {
      return { rows: [{ ...volunteerRole, opportunity_type: 'employment', application_fee: '5000', premium_fee: '8000' }] };
    }
    return { rows: [] };
  };
  await service.createApplication({ body: { ...applicationPayload }, query: {}, params: {}, logger }, employmentResponse);
  assert.equal(employmentResponse.statusCode, 400);
  assert.match(employmentResponse.body.message, /highest education/i);
  assert.ok(!queries.some((query) => query.text.includes('INSERT INTO recruitment_applications')));
});

test('a volunteer row found during payment verification is rejected before any Paystack call', async (t) => {
  const originalQuery = db.query;
  const originalGet = axios.get;
  const application = {
    id: 123,
    opportunity_type: 'volunteer',
    payment_status: 'not_applicable',
    email_address: applicationPayload.email_address,
    reference_number: `ARH-APP-${'D'.repeat(32)}`,
  };
  let gatewayCalls = 0;
  t.after(() => { db.query = originalQuery; axios.get = originalGet; });
  db.query = async (text) => {
    if (text.includes('FROM recruitment_applications')) return { rows: [application] };
    return { rows: [] };
  };
  axios.get = async () => {
    gatewayCalls += 1;
    return { data: { data: { status: 'success' } } };
  };
  const oldKey = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = 'test';
  t.after(() => {
    if (oldKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = oldKey;
  });

  const res = result();
  await service.verifyPayment({
    params: { reference: application.reference_number },
    query: { email: application.email_address, reference_number: application.reference_number },
    logger,
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /free/i);
  assert.equal(gatewayCalls, 0);
});
