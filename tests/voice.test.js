// ─────────────────────────────────────────────────────────────────────────────
// Voice system tests: signature validation, IVR TwiML, fallback flow, outbound
// handling, E.164 config validation, token auth, and status webhook tolerance.
//
// Runs with the repo's node --test runner. The router is exercised over a real
// HTTP server with forged-but-correct Twilio HMAC signatures (same algorithm
// the Twilio Node SDK verifies with).
// ─────────────────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const http = require('http');

// Fast-fail DB so the status-webhook persistence path never hangs the suite.
process.env.DB_PORT = '1';
process.env.DB_CONNECTION_TIMEOUT_MS = '1000';
process.env.DB_QUERY_TIMEOUT_MS = '1000';
process.env.NODE_ENV = 'development';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_abc123';
process.env.TWILIO_API_KEY = 'SK_test';
process.env.TWILIO_API_SECRET = 'test_secret';
process.env.TWILIO_TWIML_APP_SID = 'AP_test';
process.env.NIGERIA_NUMBER = '+2348012345678';
process.env.INTL_NUMBER = '+12025550123';
process.env.SALES_BACKUP_NUMBER = '+2348098765432';
process.env.NIGERIA_SIP_TRUNK_MATCH = 'sip:';
process.env.TWILIO_WEBHOOK_BASE_URL = 'http://example.com';

const voiceRoutes = require('../routes/voice');
const { _voiceScopeForTest } = voiceRoutes;

const BASE = 'http://example.com';
const AUTH_TOKEN = 'test_auth_token_abc123';

/** Forge the exact HMAC-SHA1 signature Twilio produces (url + sorted params). */
const sign = (path, body) => {
  const msg =
    BASE + path + Object.keys(body || {}).sort().map((k) => k + body[k]).join('');
  return crypto.createHmac('sha1', AUTH_TOKEN).update(Buffer.from(msg, 'utf-8')).digest('base64');
};

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/voice', voiceRoutes);
const server = http.createServer(app);

const post = (path, body = {}, { signature = true } = {}) => new Promise((resolve) => {
  const payload = new URLSearchParams(body).toString();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(payload)) };
  if (signature) headers['X-Twilio-Signature'] = sign(path, body);
  const req = http.request({ port: server.address().port, path, method: 'POST', headers }, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.end(payload);
});

const get = (path, headers = {}) => new Promise((resolve) => {
  const req = http.request({ port: server.address().port, path, method: 'GET', headers }, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.end();
});

test.before(() => new Promise((r) => server.listen(0, r)));
test.after(() => new Promise((r) => server.close(r)));

// ── Unit: classification & sanitization ──────────────────────────────────────

test('classifyCallSource detects Nigeria, international, and unknown legs', () => {
  const { classifyCallSource } = _voiceScopeForTest;
  assert.equal(classifyCallSource('+2348012345678'), 'local_termii');
  assert.equal(classifyCallSource('sip:+2348012345678@termii-trunk.example.com'), 'local_termii');
  assert.equal(classifyCallSource('+12025550123'), 'international_twilio');
  assert.equal(classifyCallSource('+12223334444'), 'unknown');
  assert.equal(classifyCallSource(''), 'unknown');
  assert.equal(classifyCallSource(undefined), 'unknown');
});

test('sanitizeCallerNumber never leaks SIP URIs or usernames', () => {
  const { sanitizeCallerNumber } = _voiceScopeForTest;
  assert.equal(sanitizeCallerNumber('+2348031234567'), '+2348031234567');
  assert.equal(sanitizeCallerNumber('sip:+2348031234567@trunk.example'), '+2348031234567');
  assert.equal(sanitizeCallerNumber('anonymous'), null);
  assert.equal(sanitizeCallerNumber('user@example.com'), null);
  assert.equal(sanitizeCallerNumber(undefined), null);
  assert.equal(sanitizeCallerNumber(''), null);
});

test('config validation rejects missing and non-E.164 numbers', () => {
  const { getVoiceConfigStatus } = _voiceScopeForTest;
  const original = {
    NIGERIA_NUMBER: process.env.NIGERIA_NUMBER,
    SALES_BACKUP_NUMBER: process.env.SALES_BACKUP_NUMBER,
    OUTBOUND_CALLER_ID: process.env.OUTBOUND_CALLER_ID,
    TOLL_FREE_NUMBER: process.env.TOLL_FREE_NUMBER,
  };
  const restoreEnv = (key, value) => {
    // NOTE: assigning `undefined` to process.env coerces to the string
    // "undefined" — delete instead when the variable was originally absent.
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    process.env.NIGERIA_NUMBER = '2348012345678'; // no leading + → invalid E.164
    process.env.SALES_BACKUP_NUMBER = '+2348098765432';
    process.env.OUTBOUND_CALLER_ID = '';
    process.env.TOLL_FREE_NUMBER = '';
    const status = getVoiceConfigStatus();
    assert.equal(status.ready, false);
    assert.ok(status.problems.some((p) => p.startsWith('NIGERIA_NUMBER')));

    process.env.NIGERIA_NUMBER = '+2348012345678';
    process.env.OUTBOUND_CALLER_ID = 'not-a-number';
    assert.equal(getVoiceConfigStatus().ready, false);

    process.env.OUTBOUND_CALLER_ID = '';
    process.env.TOLL_FREE_NUMBER = '0800-123-4567'; // non-E.164 toll-free
    assert.equal(getVoiceConfigStatus().ready, false);

    process.env.TOLL_FREE_NUMBER = '';
    assert.equal(getVoiceConfigStatus().ready, true);
  } finally {
    restoreEnv('NIGERIA_NUMBER', original.NIGERIA_NUMBER);
    restoreEnv('SALES_BACKUP_NUMBER', original.SALES_BACKUP_NUMBER);
    restoreEnv('OUTBOUND_CALLER_ID', original.OUTBOUND_CALLER_ID);
    restoreEnv('TOLL_FREE_NUMBER', original.TOLL_FREE_NUMBER);
  }
});

test('toll-free calls classify as toll_free when configured', () => {
  const { classifyCallSource } = _voiceScopeForTest;
  const original = process.env.TOLL_FREE_NUMBER;
  try {
    process.env.TOLL_FREE_NUMBER = '+2348000000000';
    assert.equal(classifyCallSource('+2348000000000'), 'toll_free');
    assert.equal(classifyCallSource('+2348012345678'), 'local_termii'); // Nigeria still wins
    assert.equal(classifyCallSource('+12025550123'), 'international_twilio');
  } finally {
    if (original === undefined) delete process.env.TOLL_FREE_NUMBER;
    else process.env.TOLL_FREE_NUMBER = original;
  }
});

test('support hours respect window, timezone, holidays and malformed config', () => {
  const { isSupportHoursActive } = _voiceScopeForTest;
  const originals = {
    start: process.env.VOICE_SUPPORT_HOURS_START,
    end: process.env.VOICE_SUPPORT_HOURS_END,
    tz: process.env.VOICE_SUPPORT_TIMEZONE,
    holidays: process.env.VOICE_HOLIDAY_DAYS,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    // Not configured → always available.
    delete process.env.VOICE_SUPPORT_HOURS_START;
    delete process.env.VOICE_SUPPORT_HOURS_END;
    assert.equal(isSupportHoursActive(new Date('2026-08-29T23:00:00Z')), true);

    process.env.VOICE_SUPPORT_HOURS_START = '09:00';
    process.env.VOICE_SUPPORT_HOURS_END = '18:00';
    process.env.VOICE_SUPPORT_TIMEZONE = 'Africa/Lagos';
    delete process.env.VOICE_HOLIDAY_DAYS;
    // 12:00 UTC = 13:00 Lagos → inside window.
    assert.equal(isSupportHoursActive(new Date('2026-08-29T12:00:00Z')), true);
    // 20:00 UTC = 21:00 Lagos → outside window.
    assert.equal(isSupportHoursActive(new Date('2026-08-29T20:00:00Z')), false);
    // Edge: exactly at end (18:00 Lagos = 17:00 UTC) → outside [start, end).
    assert.equal(isSupportHoursActive(new Date('2026-08-29T17:00:00Z')), false);
    // Edge: exactly at start (09:00 Lagos = 08:00 UTC) → inside.
    assert.equal(isSupportHoursActive(new Date('2026-08-29T08:00:00Z')), true);

    // Holiday beats the window.
    process.env.VOICE_HOLIDAY_DAYS = '12-25';
    assert.equal(isSupportHoursActive(new Date('2026-12-25T12:00:00Z')), false);
    assert.equal(isSupportHoursActive(new Date('2026-12-24T12:00:00Z')), true);

    // Zero-length window is never active.
    process.env.VOICE_SUPPORT_HOURS_START = '00:00';
    process.env.VOICE_SUPPORT_HOURS_END = '00:00';
    delete process.env.VOICE_HOLIDAY_DAYS;
    assert.equal(isSupportHoursActive(new Date('2026-08-29T12:00:00Z')), false);

    // Malformed (only one bound set) degrades to always available.
    delete process.env.VOICE_SUPPORT_HOURS_START;
    assert.equal(isSupportHoursActive(new Date('2026-08-29T12:00:00Z')), true);
  } finally {
    restore();
  }
});

test('callback numbers are normalized to E.164-ish form', () => {
  const { normalizeCallbackNumber } = _voiceScopeForTest;
  assert.equal(normalizeCallbackNumber('08031234567'), '+2348031234567'); // local 0-prefix
  assert.equal(normalizeCallbackNumber('2348031234567'), '+2348031234567'); // intl format
  assert.equal(normalizeCallbackNumber('+14155551234'), '+14155551234');
  assert.equal(normalizeCallbackNumber('123'), null); // too short
  assert.equal(normalizeCallbackNumber(undefined), null);
});

test('escalation departments parse only valid name:target pairs', () => {
  const { getEscalationDepartments, findDepartment } = _voiceScopeForTest;
  const original = process.env.VOICE_ESCALATION_DEPARTMENTS;
  try {
    delete process.env.VOICE_ESCALATION_DEPARTMENTS;
    assert.deepEqual(getEscalationDepartments(), []);

    process.env.VOICE_ESCALATION_DEPARTMENTS =
      'finance:+2348012345678,legal:client:legal_1,broken,empty:,,bad_target:12345';
    const departments = getEscalationDepartments();
    assert.deepEqual(departments, [
      { name: 'finance', target: '+2348012345678' },
      { name: 'legal', target: 'client:legal_1' },
    ]);
    assert.deepEqual(findDepartment('FINANCE'), { name: 'finance', target: '+2348012345678' });
    assert.equal(findDepartment('sales'), undefined);
  } finally {
    if (original === undefined) delete process.env.VOICE_ESCALATION_DEPARTMENTS;
    else process.env.VOICE_ESCALATION_DEPARTMENTS = original;
  }
});

test('voice departments map into the platform ticket-escalation loop', () => {
  const supportRoutes = require('../routes/support');
  const { getVoiceTicketDepartment } = supportRoutes._supportScopeForTest;

  assert.equal(getVoiceTicketDepartment('finance'), 'finance');
  assert.equal(getVoiceTicketDepartment('legal'), 'legal');
  assert.equal(getVoiceTicketDepartment('technical'), 'technical');
  assert.equal(getVoiceTicketDepartment('transportation'), 'transportation');
  assert.equal(getVoiceTicketDepartment('fumigation'), 'fumigation');
  // Support/unknown departments never raise a ticket (no escalation loop).
  assert.equal(getVoiceTicketDepartment('support'), null);
  assert.equal(getVoiceTicketDepartment('made_up'), null);

  assert.equal(typeof supportRoutes.createVoiceEscalatedTicket, 'function');
});

// ── Webhook signature gate ───────────────────────────────────────────────────

test('incoming webhook requires a valid Twilio signature', async () => {
  const body = { To: '+2348012345678', From: '+2348000000000', CallSid: 'CA1' };
  let res = await post('/voice/incoming', body);
  assert.equal(res.status, 200);
  assert.match(res.body, /<Gather/);
  assert.match(res.body, /numDigits="1"/);
  assert.match(res.body, /timeout="8"/);
  assert.match(res.body, /action="\/voice\/menu"/);
  assert.match(res.body, /Goodbye/);

  res = await post('/voice/incoming', body, { signature: false });
  assert.equal(res.status, 403);

  res = await post('/voice/incoming', body, { signature: false });
  assert.equal(res.status, 403);
});

test('outbound legs misrouted to /voice/incoming are rejected, not IVR-ed', async () => {
  const res = await post('/voice/incoming', {
    To: '+2348099999999',
    From: 'client:support_agent_1',
    CallSid: 'CA2',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Reject\/>/);
  assert.doesNotMatch(res.body, /<Gather/);
});

// ── IVR menu ─────────────────────────────────────────────────────────────────

test('menu 1 sends the caller into their conference room', async () => {
  const res = await post('/voice/menu', {
    Digits: '1', CallSid: 'CA3', To: '+2348012345678',
    From: 'sip:+2348031234567@termii-trunk.example.com',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Dial/);
  assert.match(res.body, /<Conference/);
  assert.match(res.body, /rentalhub_support_CA3/);
  assert.match(res.body, /waitUrl="\/voice\/wait/);
  assert.match(res.body, /conference-events/);
  assert.doesNotMatch(res.body, /<Client>/);
  assert.doesNotMatch(res.body, /<Enqueue/);
});

test('menu 3 collects a callback number', async () => {
  const res = await post('/voice/menu', {
    Digits: '3', CallSid: 'CA3b', To: '+2348012345678', From: '+2348000000000',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /phone number/);
  assert.match(res.body, /callback-number/);
  assert.match(res.body, /finishOnKey="#"/);
});

test('menu 2 dials the sales backup number', async () => {
  const res = await post('/voice/menu', { Digits: '2', CallSid: 'CA4', To: '+12025550123', From: '+14155551234' });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Dial/);
  assert.match(res.body, /\+2348098765432/);
  assert.doesNotMatch(res.body, /<Client>/);
});

test('invalid menu input re-presents the menu then says goodbye', async () => {
  const res = await post('/voice/menu', { Digits: '9', CallSid: 'CA5', To: '+2348012345678', From: '+2348111111111' });
  assert.equal(res.status, 200);
  assert.match(res.body, /That selection is invalid/);
  assert.match(res.body, /<Gather/);
  assert.match(res.body, /Goodbye/);
});

// ── Outbound ─────────────────────────────────────────────────────────────────

test('outgoing dials a valid E.164 destination with caller ID', async () => {
  const res = await post('/voice/outgoing', {
    To: '+2348099999999', From: 'client:support_agent_1', CallSid: 'CA6',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Dial/);
  assert.match(res.body, /\+2348099999999/);
  assert.match(res.body, /callerId="\+2348012345678"/);
  assert.match(res.body, /dial-fallback-final/);
});

test('outgoing rejects non-E.164 destinations without dialing', async () => {
  const res = await post('/voice/outgoing', {
    To: '08099999999', From: 'client:support_agent_1', CallSid: 'CA7',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /not valid/);
  assert.doesNotMatch(res.body, /<Dial/);
});

// ── No-answer / busy fallback ────────────────────────────────────────────────

test('dial-fallback with completed status just says goodbye', async () => {
  const res = await post('/voice/dial-fallback', { DialCallStatus: 'completed', CallSid: 'CA8', To: 'client:support_agent_1', From: '+2348000000000' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Thank you for calling RentalHub/);
  assert.doesNotMatch(res.body, /<Gather/);
});

test('dial-fallback with no-answer offers the recovery gather', async () => {
  const res = await post('/voice/dial-fallback', { DialCallStatus: 'no-answer', CallSid: 'CA9', To: 'client:support_agent_1', From: '+2348000000000' });
  assert.equal(res.status, 200);
  assert.match(res.body, /could not connect you/);
  assert.match(res.body, /<Gather/);
  assert.match(res.body, /fallback-choice/);
  assert.match(res.body, /Goodbye/);
});

test('fallback-choice 1 re-sends the caller into their conference room', async () => {
  const res = await post('/voice/fallback-choice', { Digits: '1', CallSid: 'CA10', To: '+2348012345678', From: '+2348000000000' });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Conference/);
  assert.match(res.body, /rentalhub_support_CA10/);
});

test('fallback-choice 2 routes to sales with the terminal fallback', async () => {
  const res = await post('/voice/fallback-choice', { Digits: '2', CallSid: 'CA11', To: '+2348012345678', From: '+2348000000000' });
  assert.equal(res.status, 200);
  assert.match(res.body, /\+2348098765432/);
  assert.match(res.body, /dial-fallback-final/);
});

test('fallback-choice invalid input ends the call', async () => {
  const res = await post('/voice/fallback-choice', { Digits: '5', CallSid: 'CA12', To: '+2348012345678', From: '+2348000000000' });
  assert.equal(res.status, 200);
  assert.match(res.body, /invalid/);
  assert.match(res.body, /<Hangup\/>/);
  assert.doesNotMatch(res.body, /<Dial/);
});

test('dial-fallback-final is terminal for both outcomes', async () => {
  let res = await post('/voice/dial-fallback-final', { DialCallStatus: 'completed', CallSid: 'CA13' });
  assert.match(res.body, /Thank you for calling RentalHub/);
  res = await post('/voice/dial-fallback-final', { DialCallStatus: 'busy', CallSid: 'CA14' });
  assert.match(res.body, /unable to complete your call/);
  assert.match(res.body, /<Hangup\/>/);
  assert.doesNotMatch(res.body, /<Gather/);
});

// ── Status webhook ───────────────────────────────────────────────────────────

test('status webhook accepts valid statuses even when persistence fails', async () => {
  const res = await post('/voice/status', {
    CallSid: 'CA15', ParentCallSid: 'CA0', CallStatus: 'in-progress',
    From: '+2348031234567', To: 'client:support_agent_1', Direction: 'inbound',
  });
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.success, true);
});

test('status webhook ignores unexpected statuses gracefully', async () => {
  const res = await post('/voice/status', {
    CallSid: 'CA16', CallStatus: 'super-weird', From: '+2348031234567', To: 'client:support_agent_1',
  });
  assert.equal(res.status, 200);
});

// ── Token endpoint ───────────────────────────────────────────────────────────

test('token endpoint rejects unauthenticated requests', async () => {
  const res = await get('/voice/token');
  assert.equal(res.status, 401);
});

test('callbacks endpoint rejects unauthenticated requests', async () => {
  const res = await get('/voice/callbacks');
  assert.equal(res.status, 401);
});

test('departments, call-log and escalate endpoints reject unauthenticated requests', async () => {
  let res = await get('/voice/departments');
  assert.equal(res.status, 401);

  res = await post('/voice/escalate', { callSid: 'CA1', department: 'finance' });
  assert.equal(res.status, 401);

  res = await get('/voice/call-log');
  assert.equal(res.status, 401);

  res = await get('/voice/summary');
  assert.equal(res.status, 401);

  res = await get('/voice/agent-lines');
  assert.equal(res.status, 401);

  res = await get('/voice/call-context?callSid=CA1');
  assert.equal(res.status, 401);

  res = await get('/voice/token?line=anything');
  assert.equal(res.status, 401);

  res = await get('/voice/duty-status');
  assert.equal(res.status, 401);

  res = await get('/voice/consult-status?callSid=CA1');
  assert.equal(res.status, 401);
});

test('agent identities parse from VOICE_AGENT_IDENTITIES', () => {
  const { getAgentIdentities, isValidAgentLine } = _voiceScopeForTest;
  const original = process.env.VOICE_AGENT_IDENTITIES;
  try {
    delete process.env.VOICE_AGENT_IDENTITIES;
    assert.deepEqual(getAgentIdentities(), ['support_agent_1']);
    assert.equal(isValidAgentLine('support_agent_1'), true);
    assert.equal(isValidAgentLine('support_agent_2'), false);

    process.env.VOICE_AGENT_IDENTITIES = 'support_agent_1,support_agent_2, bad!name';
    assert.deepEqual(getAgentIdentities(), ['support_agent_1', 'support_agent_2']);
    assert.equal(isValidAgentLine('support_agent_2'), true);
    assert.equal(isValidAgentLine('nope'), false);
  } finally {
    if (original === undefined) delete process.env.VOICE_AGENT_IDENTITIES;
    else process.env.VOICE_AGENT_IDENTITIES = original;
  }
});

// ── After-hours branch ───────────────────────────────────────────────────────

test('after-hours config switches the IVR to the callback branch', async () => {
  const originals = {
    start: process.env.VOICE_SUPPORT_HOURS_START,
    end: process.env.VOICE_SUPPORT_HOURS_END,
  };
  try {
    // Zero-length window → always after hours (deterministic regardless of clock).
    process.env.VOICE_SUPPORT_HOURS_START = '00:00';
    process.env.VOICE_SUPPORT_HOURS_END = '00:00';
    const res = await post('/voice/incoming', {
      To: '+2348012345678', From: '+2348000000000', CallSid: 'CA20',
    });
    assert.equal(res.status, 200);
    assert.match(res.body, /currently offline/);
    assert.match(res.body, /after-hours/);
    assert.match(res.body, /press 3/);
    assert.doesNotMatch(res.body, /For support, press 1/);
  } finally {
    if (originals.start === undefined) delete process.env.VOICE_SUPPORT_HOURS_START;
    else process.env.VOICE_SUPPORT_HOURS_START = originals.start;
    if (originals.end === undefined) delete process.env.VOICE_SUPPORT_HOURS_END;
    else process.env.VOICE_SUPPORT_HOURS_END = originals.end;
  }
});

test('after-hours 3 gathers a callback number; anything else says goodbye', async () => {
  let res = await post('/voice/after-hours', {
    Digits: '3', CallSid: 'CA21', To: '+2348012345678', From: '+2348000000000',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /phone number/);
  assert.match(res.body, /callback-number/);
  assert.match(res.body, /finishOnKey="#"/);
  assert.match(res.body, /numDigits="14"/);

  res = await post('/voice/after-hours', {
    Digits: '9', CallSid: 'CA22', To: '+2348012345678', From: '+2348000000000',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /invalid/);
  assert.match(res.body, /<Hangup\/>/);
});

test('callback-number accepts a valid number and rejects nonsense', async () => {
  let res = await post('/voice/callback-number', {
    Digits: '08031234567', CallSid: 'CA23', To: '+2348012345678', From: '+2348000000000',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /call you back/);
  assert.match(res.body, /<Hangup\/>/);

  res = await post('/voice/callback-number', {
    Digits: '12', CallSid: 'CA24', To: '+2348012345678', From: '+2348000000000',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /does not look valid/);
});

// ── Queue, hold experience and ad slots ──────────────────────────────────────

test('wait loop plays announcement and optional music/ad without DTMF', async () => {
  const originals = {
    music: process.env.VOICE_HOLD_MUSIC_URL,
    ads: process.env.VOICE_ADS_ENABLED,
    urls: process.env.VOICE_AD_AUDIO_URLS,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    delete process.env.VOICE_HOLD_MUSIC_URL;
    delete process.env.VOICE_ADS_ENABLED;
    let res = await post('/voice/wait', { CallSid: 'CA30', To: '+2348012345678', From: '+2348000000000' });
    assert.equal(res.status, 200);
    assert.match(res.body, /All agents are currently helping other callers/);
    // Conference waitUrl context: no DTMF gather, only media.
    assert.doesNotMatch(res.body, /<Gather/);
    assert.doesNotMatch(res.body, /<Play/);

    process.env.VOICE_HOLD_MUSIC_URL = 'https://cdn.example.com/hold.mp3';
    process.env.VOICE_ADS_ENABLED = 'true';
    process.env.VOICE_AD_AUDIO_URLS = 'https://cdn.example.com/ad1.mp3,https://cdn.example.com/ad2.mp3';
    res = await post('/voice/wait', { CallSid: 'CA31', To: '+2348012345678', From: '+2348000000000' });
    assert.equal(res.status, 200);
    assert.match(res.body, /hold\.mp3/);
    assert.match(res.body, /<Play/);
    // Deterministic ad pick: same CallSid → same ad.
    assert.match(res.body, /https:\/\/cdn\.example\.com\/ad[12]\.mp3/);
    const first = res.body.match(/https:\/\/cdn\.example\.com\/(ad\d\.mp3)/)[1];
    res = await post('/voice/wait', { CallSid: 'CA31', To: '+2348012345678', From: '+2348000000000' });
    assert.match(res.body, new RegExp(first));
  } finally {
    restore();
  }
});

test('conference-events webhook accepts lifecycle events', async () => {
  const res = await post('/voice/conference-events', {
    ConferenceSid: 'CF1234',
    FriendlyName: 'rentalhub_support_CA40',
    StatusCallbackEvent: 'conference-start',
    CallSid: 'CA40',
  });
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.success, true);
});

test('outgoing queue: parks the agent in the waiting room and rejects unknown queues', async () => {
  let res = await post('/voice/outgoing', {
    To: 'queue:support', From: 'client:support_agent_1', CallSid: 'CA36',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /<Dial timeout="7200"/);
  assert.match(res.body, /<Conference/);
  assert.match(res.body, /rentalhub_agents_waiting/);
  assert.match(res.body, /agent-wait/);
  assert.match(res.body, /statusCallback/);

  res = await post('/voice/outgoing', {
    To: 'queue:unknown', From: 'client:support_agent_1', CallSid: 'CA37',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /not available/);
  assert.doesNotMatch(res.body, /<Conference/);
});

test('agent-wait keeps the agent informed while on the line', async () => {
  const original = process.env.VOICE_HOLD_MUSIC_URL;
  try {
    delete process.env.VOICE_HOLD_MUSIC_URL;
    let res = await post('/voice/agent-wait', { CallSid: 'CA38', To: 'queue:support', From: 'client:support_agent_1' });
    assert.equal(res.status, 200);
    assert.match(res.body, /Waiting for incoming calls/);
    assert.doesNotMatch(res.body, /<Play/);

    process.env.VOICE_HOLD_MUSIC_URL = 'https://cdn.example.com/hold.mp3';
    res = await post('/voice/agent-wait', { CallSid: 'CA39', To: 'queue:support', From: 'client:support_agent_1' });
    assert.match(res.body, /hold\.mp3/);
  } finally {
    if (original === undefined) delete process.env.VOICE_HOLD_MUSIC_URL;
    else process.env.VOICE_HOLD_MUSIC_URL = original;
  }
});

// ── Recording (opt-in) ───────────────────────────────────────────────────────

test('recording is off by default and enabled via VOICE_RECORD_CALLS', async () => {
  const original = process.env.VOICE_RECORD_CALLS;
  try {
    delete process.env.VOICE_RECORD_CALLS;
    let res = await post('/voice/menu', {
      Digits: '1', CallSid: 'CA25', To: '+2348012345678', From: '+2348000000000',
    });
    assert.doesNotMatch(res.body, /may be recorded/);

    process.env.VOICE_RECORD_CALLS = 'true';
    res = await post('/voice/menu', {
      Digits: '1', CallSid: 'CA26', To: '+2348012345678', From: '+2348000000000',
    });
    assert.equal(res.status, 200);
    // Consent is announced to the caller; recording is applied on the
    // agent-side queue leg (the bridged leg Twilio records).
    assert.match(res.body, /may be recorded for quality and training/);

    res = await post('/voice/outgoing', {
      To: 'queue:support', From: 'client:support_agent_1', CallSid: 'CA26b',
    });
    assert.match(res.body, /record="record-from-answer"/);
    assert.match(res.body, /recordingStatusCallback/);
  } finally {
    if (original === undefined) delete process.env.VOICE_RECORD_CALLS;
    else process.env.VOICE_RECORD_CALLS = original;
  }
});

test('recording webhook accepts statuses even when persistence fails', async () => {
  const res = await post('/voice/recording', {
    CallSid: 'CA27', RecordingSid: 'RE1234', RecordingStatus: 'completed',
    RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC_test/Recordings/RE1234',
  });
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.success, true);
});

// ── Config guard ─────────────────────────────────────────────────────────────

test('webhooks return a generic 503 when configuration is incomplete', async () => {
  const original = process.env.TWILIO_AUTH_TOKEN;
  try {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = await post('/voice/incoming', { To: '+2348012345678', CallSid: 'CA17' });
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.body, /TWILIO|AUTH|token/i);
  } finally {
    process.env.TWILIO_AUTH_TOKEN = original;
  }
});
