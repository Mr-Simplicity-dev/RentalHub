// ─────────────────────────────────────────────────────────────────────────────
// Twilio dual-carrier voice support system.
//
// Carriers:
//   - Nigeria  → inbound calls arrive via Termii SIP forwarding onto a Twilio
//                number / SIP trunk (matched by NIGERIA_NUMBER / the SIP trunk
//                suffix configured through NIGERIA_SIP_TRUNK_MATCH).
//   - International → inbound calls arrive on INTL_NUMBER.
//
// Endpoints:
//   POST /voice/incoming        IVR entry point (number webhook)
//   POST /voice/outgoing        Outbound calls initiated from the agent browser
//                               (TwiML App Voice URL)
//   POST /voice/menu            DTMF routing (support agent / sales)
//   POST /voice/dial-fallback   No-answer/busy/failed handling after a Dial
//   POST /voice/fallback-choice DTMF choice after a failed Dial (retry/sales)
//   POST /voice/dial-fallback-final  Terminal no-answer handling (bounded retry)
//   POST /voice/status          Dial status callbacks (analytics persistence)
//   GET  /voice/token           Admin-only Twilio Access Token for the agent SDK
//
// Security model:
//   - Every Twilio webhook is verified with X-Twilio-Signature before any
//     TwiML is produced. In production the validation URL is derived from
//     TWILIO_WEBHOOK_BASE_URL (never the client-controlled Host header), so a
//     missing base URL hard-fails the request instead of trusting an attacker.
//   - The /voice/token endpoint is locked behind the existing
//     `authenticate` + `requireAdminOrSuperAdmin` middleware, rate-limited,
//     and never logs or returns Twilio secrets.
//   - Required phone numbers are validated as E.164 at configuration time;
//     malformed values are treated as "not configured".
//   - Missing Twilio configuration returns a 503 with a generic message (no
//     secret values are exposed).
//
// This router is mounted in server.js AFTER express.urlencoded (Twilio posts
// form-encoded webhooks) and BEFORE the global CSRF middleware (Twilio cannot
// send browser CSRF tokens).
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const twilio = require('twilio');
const logger = require('../config/utils/logger');
const db = require('../config/middleware/database');
const {
  authenticate,
  requireAdminOrSuperAdmin,
} = require('../config/middleware/auth');
const { voiceTokenLimiter } = require('../config/middleware/securityRateLimiters');

const router = express.Router();

// ── Configuration ────────────────────────────────────────────────────────────

// Variables the voice system needs before it can safely serve any request.
// (TWILIO_WEBHOOK_BASE_URL is intentionally NOT in this list: in development
// the validation URL may fall back to the request's own protocol/host, and its
// production requirement is enforced separately inside validateTwilioSignature.)
const REQUIRED_VOICE_ENV_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_TWIML_APP_SID',
  'NIGERIA_NUMBER',
  'INTL_NUMBER',
  'SALES_BACKUP_NUMBER',
];

// E.164: a "+" followed by 8–15 digits (country code + national number).
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

// Phone-number variables that must hold valid E.164 values. OUTBOUND_CALLER_ID
// is optional (falls back to NIGERIA_NUMBER) but is validated when present.
const E164_ENV_VARS = new Set([
  'NIGERIA_NUMBER',
  'INTL_NUMBER',
  'SALES_BACKUP_NUMBER',
  'OUTBOUND_CALLER_ID',
  'TOLL_FREE_NUMBER',
]);

/**
 * Report missing OR malformed configuration. Only variable NAMES are reported
 * (never values), so logs stay safe while operators can still fix the setup.
 */
const getVoiceConfigStatus = () => {
  const problems = [];
  for (const key of REQUIRED_VOICE_ENV_VARS) {
    const value = process.env[key];
    if (!value || !value.trim()) {
      problems.push(`${key} (missing)`);
    } else if (E164_ENV_VARS.has(key) && !E164_PATTERN.test(value.trim())) {
      problems.push(`${key} (not E.164)`);
    }
  }

  const outboundCallerId = (process.env.OUTBOUND_CALLER_ID || '').trim();
  if (outboundCallerId && !E164_PATTERN.test(outboundCallerId)) {
    problems.push('OUTBOUND_CALLER_ID (not E.164)');
  }

  const tollFreeNumber = (process.env.TOLL_FREE_NUMBER || '').trim();
  if (tollFreeNumber && !E164_PATTERN.test(tollFreeNumber)) {
    problems.push('TOLL_FREE_NUMBER (not E.164)');
  }

  return { ready: problems.length === 0, problems };
};

const isProduction = process.env.NODE_ENV === 'production';

// ── Optional operational settings ────────────────────────────────────────────
// After-hours windows and recording are opt-in. When misconfigured, the
// affected feature degrades gracefully (hours → always available; recording →
// off) with a logged warning rather than breaking inbound calls.

const HOURS_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const getSupportHoursConfig = () => {
  const startRaw = (process.env.VOICE_SUPPORT_HOURS_START || '').trim();
  const endRaw = (process.env.VOICE_SUPPORT_HOURS_END || '').trim();
  if (!startRaw && !endRaw) return null; // feature disabled
  if (!startRaw || !endRaw) {
    return { malformed: true, reason: 'VOICE_SUPPORT_HOURS_START/END must both be set' };
  }
  const startMatch = startRaw.match(HOURS_TIME_PATTERN);
  const endMatch = endRaw.match(HOURS_TIME_PATTERN);
  if (!startMatch || !endMatch) {
    return { malformed: true, reason: 'VOICE_SUPPORT_HOURS_START/END must be HH:MM (24h)' };
  }
  return {
    start: Number(startMatch[1]) * 60 + Number(startMatch[2]),
    end: Number(endMatch[1]) * 60 + Number(endMatch[2]),
    timeZone: (process.env.VOICE_SUPPORT_TIMEZONE || 'Africa/Lagos').trim(),
    holidays: new Set(
      (process.env.VOICE_HOLIDAY_DAYS || '')
        .split(',')
        .map((d) => d.trim())
        .filter((d) => /^\d{2}-\d{2}$/.test(d))
    ),
  };
};

let hoursMisconfigWarned = false;

/**
 * True when the support line should accept calls right now.
 * Outside the configured window (or on a configured holiday) the IVR switches
 * to the after-hours branch. Returns true when the feature is not configured.
 */
const isSupportHoursActive = (now = new Date()) => {
  const config = getSupportHoursConfig();
  if (!config) return true;
  if (config.malformed) {
    if (!hoursMisconfigWarned) {
      hoursMisconfigWarned = true;
      logger.warn('Voice support hours misconfigured — treated as always available:', config.reason);
    }
    return true;
  }

  // Build "MM-DD" in the configured timezone (locale-safe — never rely on the
  // locale's date separator) and compare against the holiday list.
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const month = dateParts.find((p) => p.type === 'month')?.value;
  const day = dateParts.find((p) => p.type === 'day')?.value;
  const mmdd = `${month}-${day}`;
  if (config.holidays.has(mmdd)) return false;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const minutes = hour * 60 + minute;

  if (config.start === config.end) return false; // zero-length window
  if (config.start < config.end) return minutes >= config.start && minutes < config.end;
  return minutes >= config.start || minutes < config.end; // overnight wrap
};

const isCallRecordingEnabled = () => {
  const value = String(process.env.VOICE_RECORD_CALLS || '').trim().toLowerCase();
  return value === 'true' || value === '1';
};

// ── Queue / hold / ad-slot configuration ─────────────────────────────────────
// The support line routes callers through a real Twilio <Queue>: the caller is
// <Enqueue>d and hears a wait loop (announcement → optional ad slot → optional
// hold music) until an agent dequeues them. Agents join the line by dialing
// "queue:<name>" through the TwiML App (the Voice Desk does this
// automatically). Ad slots are config-driven for now — wired to the platform's
// ad-spaces engine later (see docs/voice-system-backlog.md).

const getQueueConfig = () => ({
  name: (process.env.VOICE_QUEUE_NAME || 'support').trim() || 'support',
  announcement: (process.env.VOICE_QUEUE_ANNOUNCEMENT || 'All agents are currently helping other callers. Please hold.').trim(),
  holdMusicUrl: (process.env.VOICE_HOLD_MUSIC_URL || '').trim(),
  adsEnabled: ['true', '1'].includes(String(process.env.VOICE_ADS_ENABLED || '').trim().toLowerCase()),
  adUrls: (process.env.VOICE_AD_AUDIO_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => /^https:\/\/.+\.(mp3|wav|ogg)(\?.*)?$/i.test(url)),
});

const QUEUE_PREFIX = 'queue:';

/**
 * Pick an ad deterministically for a given call (same caller hears the same ad
 * across wait-loop iterations). Returns null when ads are disabled or no audio
 * ad URLs are configured.
 */
const pickAdUrl = (adUrls, callSid) => {
  if (!adUrls.length) return null;
  let hash = 0;
  const input = String(callSid || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return adUrls[hash % adUrls.length];
};

/**
 * Reject with a generic 503 when the Twilio configuration is incomplete.
 * The response deliberately does not reveal which variable is broken.
 */
const requireVoiceConfig = (req, res, next) => {
  const status = getVoiceConfigStatus();
  if (!status.ready) {
    logger.error('Voice service request blocked: incomplete Twilio configuration', {
      problems: status.problems,
    });
    return res.status(503).json({
      success: false,
      message: 'Voice service is not configured. Please contact the administrator.',
    });
  }
  next();
};

/**
 * Verify the X-Twilio-Signature header on webhook requests.
 *
 * Twilio computes its signature over the full public URL plus the POST body,
 * so the URL used here must match the public HTTPS URL Twilio called. In
 * production that URL is built from TWILIO_WEBHOOK_BASE_URL only — the
 * request's Host header is attacker-controlled and never trusted.
 */
const validateTwilioSignature = (req) => {
  const signature = req.headers['x-twilio-signature'];
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;

  const webhookBaseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (isProduction && !webhookBaseUrl) {
    logger.error('Voice webhook rejected: TWILIO_WEBHOOK_BASE_URL missing in production');
    return false;
  }

  const url = `${webhookBaseUrl || `${req.protocol}://${req.get('host')}`}${req.originalUrl}`;
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body || {}
  );
};

/** Shared middleware for Twilio webhook endpoints. */
const twilioWebhookGuard = [requireVoiceConfig, (req, res, next) => {
  if (!validateTwilioSignature(req)) {
    logger.warn('Voice webhook rejected: invalid X-Twilio-Signature');
    return res.status(403).json({ success: false, message: 'Invalid Twilio signature' });
  }
  next();
}];

// ── Call context helpers ─────────────────────────────────────────────────────
// `source` is threaded through webhook URLs as a query parameter so every leg
// (Dial status callbacks, Dial action webhooks) keeps the ORIGINAL call's
// origin even though `To` changes per leg.

const classifyCallSource = (to) => {
  const value = String(to || '');
  const nigeriaNumber = process.env.NIGERIA_NUMBER || '';
  const sipTrunkMatch = process.env.NIGERIA_SIP_TRUNK_MATCH || '';
  const intlNumber = process.env.INTL_NUMBER || '';
  const tollFreeNumber = process.env.TOLL_FREE_NUMBER || '';

  // includes('') is always true — guard against empty match strings so an
  // unset variable can never misclassify every call.
  if (
    (nigeriaNumber && value.includes(nigeriaNumber)) ||
    (sipTrunkMatch && value.includes(sipTrunkMatch))
  ) {
    return 'local_termii';
  }
  if (tollFreeNumber && value.includes(tollFreeNumber)) return 'toll_free';
  if (intlNumber && value.includes(intlNumber)) return 'international_twilio';
  return 'unknown';
};

const getCallSource = (req) => {
  const fromQuery = String(req.query?.source || '').trim();
  if (['local_termii', 'international_twilio', 'toll_free', 'unknown'].includes(fromQuery)) {
    return fromQuery;
  }
  return classifyCallSource(req.body.To);
};

/**
 * Extract a display-safe E.164-ish caller number.
 * SIP trunks may report From as "sip:+2348…@trunk.example" or even as an
 * email-like identity — never forward raw SIP URIs or usernames to agents.
 */
const sanitizeCallerNumber = (rawFrom) => {
  if (!rawFrom) return null;
  const match = String(rawFrom).match(/\+?[0-9]{7,15}/);
  return match ? match[0] : null;
};

/** Correlation metadata for every log line emitted by this router. */
const webhookLogContext = (req, extra = {}) => ({
  callSid: String(req.body.CallSid || req.body.ParentCallSid || '').slice(0, 64) || undefined,
  source: getCallSource(req),
  ...extra,
});

/** Attach sanitized call-origin context to the <Client> TwiML element. */
const attachClientCallContext = (clientElement, req) => {
  const callSource = getCallSource(req);
  clientElement.parameter({ name: 'call_source', value: callSource });

  const callerNumber = sanitizeCallerNumber(req.body.From);
  if (callerNumber) {
    clientElement.parameter({ name: 'caller_number', value: callerNumber });
  }

  const callSid = String(req.body.CallSid || '').slice(0, 64);
  if (callSid) {
    clientElement.parameter({ name: 'call_sid', value: callSid });
  }
};

// Dial status callbacks fire for every leg transition (initiated/ringing/
// answered/completed). The 'completed' event carries DialCallStatus, which is
// how we detect no-answer/busy/failed/cancel for the fallback flow.
const DIAL_STATUS_CALLBACK = (req) => ({
  statusCallback: `/voice/status?source=${getCallSource(req)}`,
  statusCallbackMethod: 'POST',
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
});

// QA/compliance recording (opt-in via VOICE_RECORD_CALLS=true). Recording is
// enabled from answer onwards; the recording URL is delivered to
// /voice/recording and back-filled onto the matching status row.
const DIAL_RECORDING_OPTIONS = (req) => ({
  record: 'record-from-answer',
  recordingStatusCallback: `/voice/recording?source=${getCallSource(req)}`,
  recordingStatusCallbackMethod: 'POST',
});

const sayRecordingConsent = (twiml) => {
  if (isCallRecordingEnabled()) {
    twiml.say('This call may be recorded for quality and training purposes.');
  }
};

// ── IVR helpers ──────────────────────────────────────────────────────────────

const IVR_GATHER_OPTIONS = {
  action: '/voice/menu',
  method: 'POST',
  numDigits: 1,
  input: 'dtmf',
  timeout: 8,
};

const MENU_PROMPT = 'For support, press 1. For sales, press 2.';

const buildMenuGather = (twiml) => {
  const gather = twiml.gather(IVR_GATHER_OPTIONS);
  gather.say(MENU_PROMPT);
  return gather;
};

const buildFallbackGather = (twiml, req) => {
  const gather = twiml.gather({
    action: `/voice/fallback-choice?source=${getCallSource(req)}`,
    method: 'POST',
    numDigits: 1,
    input: 'dtmf',
    timeout: 6,
  });
  gather.say('Press 1 to try the support line again, or press 2 to speak with sales.');
  return gather;
};

/** <Dial> to the browser agent, carrying call-origin <Parameter>s. */
const dialAgent = (twiml, req, { action }) => {
  const dial = twiml.dial({
    answerOnBridge: true,
    timeout: 25,
    action,
    method: 'POST',
    ...DIAL_STATUS_CALLBACK(req),
    ...(isCallRecordingEnabled() ? DIAL_RECORDING_OPTIONS(req) : {}),
  });
  const clientElement = dial.client('support_agent_1');
  attachClientCallContext(clientElement, req);
  return dial;
};

/** <Dial> to a phone number (sales backup or outbound destination). */
const dialNumber = (twiml, number, { action, callerId, req }) => {
  const options = {
    answerOnBridge: true,
    timeout: 25,
    ...(callerId ? { callerId } : {}),
    ...(action ? { action, method: 'POST' } : {}),
    ...DIAL_STATUS_CALLBACK(req),
    ...(isCallRecordingEnabled() ? DIAL_RECORDING_OPTIONS(req) : {}),
  };
  return twiml.dial(options, number);
};

// ── POST /voice/incoming ─────────────────────────────────────────────────────
// Entry point for every inbound call (Nigeria via Termii SIP, or
// international). Plays the greeting, collects a single DTMF digit and hands
// control to /voice/menu. If the caller never presses a digit, the Gather
// times out and we say goodbye + hang up.

router.post('/incoming', twilioWebhookGuard, (req, res) => {
  const callSource = getCallSource(req);

  // Outbound legs initiated from the agent browser carry From=client:…
  // (the TwiML App Voice URL is /voice/outgoing). If such a leg is
  // mis-routed here, never play the inbound IVR to the dialed party.
  if (String(req.body.From || '').toLowerCase().startsWith('client:')) {
    logger.warn('Voice webhook: outbound leg hit /voice/incoming — check the TwiML App Voice URL', webhookLogContext(req));
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.reject();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Operational logs — keep these exact strings; the frontend derives its
  // badge from the `call_source` Client parameter, not from logs.
  if (callSource === 'local_termii') {
    logger.info('Incoming call from Nigeria via Termii', webhookLogContext(req));
  } else if (callSource === 'toll_free') {
    logger.info('Incoming toll-free call', webhookLogContext(req));
  } else if (callSource === 'international_twilio') {
    logger.info('Incoming International call', webhookLogContext(req));
  } else {
    logger.info('Incoming call (unknown source)', webhookLogContext(req));
  }

  const twiml = new twilio.twiml.VoiceResponse();

  // After-hours branch: no agent is expected to be online, so instead of the
  // live menu the caller gets a short message and one callback request option.
  if (!isSupportHoursActive()) {
    twiml.say('Thank you for calling RentalHub. Our support team is currently offline.');
    const afterHoursGather = twiml.gather({
      action: `/voice/after-hours?source=${callSource}`,
      method: 'POST',
      numDigits: 1,
      input: 'dtmf',
      timeout: 6,
    });
    afterHoursGather.say('To request a callback during business hours, press 3.');
    twiml.say('Goodbye.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  twiml.say('Welcome to RentalHub. ' + MENU_PROMPT);
  buildMenuGather(twiml);
  // Reached only when the caller provides no digit before the timeout.
  twiml.say('We did not receive a selection. Goodbye.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/outgoing ─────────────────────────────────────────────────────
// TwiML App Voice URL: invoked when an agent browser Device places an
// outbound call. The destination is dialed with the platform number as the
// caller ID; a failed attempt gets the bounded terminal fallback.

router.post('/outgoing', twilioWebhookGuard, (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const destination = String(req.body.To || '').trim();
  const config = getQueueConfig();

  // Agent-side queue line: the Voice Desk dials "queue:<name>" to join the
  // support queue. The agent stays on this leg (hearing /voice/agent-wait)
  // until a queued caller is bridged to them.
  if (destination.toLowerCase().startsWith(QUEUE_PREFIX)) {
    const queueName = destination.slice(QUEUE_PREFIX.length).trim();
    if (queueName !== config.name) {
      logger.warn('Outgoing voice call rejected: unknown queue name', webhookLogContext(req, { queueName }));
      twiml.say('That queue is not available. Please try again.');
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    logger.info('Agent joined the support queue', webhookLogContext(req, { queueName }));
    twiml.say('Connecting you to the support queue.');
    const dial = twiml.dial({
      answerOnBridge: true,
      timeout: 7200,
      ...DIAL_STATUS_CALLBACK(req),
      ...(isCallRecordingEnabled() ? DIAL_RECORDING_OPTIONS(req) : {}),
    });
    dial.queue({ url: `/voice/agent-wait?source=${getCallSource(req)}` }, config.name);

    res.type('text/xml');
    return res.send(twiml.toString());
  }

  if (!E164_PATTERN.test(destination)) {
    logger.warn('Outbound voice call rejected: destination is not a valid E.164 number', webhookLogContext(req, { destination }));
    twiml.say('The number you are trying to reach is not valid. Please hang up and try again.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const callerId = (process.env.OUTBOUND_CALLER_ID || process.env.NIGERIA_NUMBER || '').trim();

  logger.info('Outgoing voice call', webhookLogContext(req, { to: destination }));

  twiml.say('Please wait while we connect your call.');
  sayRecordingConsent(twiml);
  dialNumber(twiml, destination, {
    action: `/voice/dial-fallback-final?source=${getCallSource(req)}`,
    callerId: E164_PATTERN.test(callerId) ? callerId : undefined,
    req,
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/menu ─────────────────────────────────────────────────────────
// DTMF routing:
//   1 → connect to the Voice JS SDK agent registered as "support_agent_1"
//       (answerOnBridge makes the caller hear the agent only after the
//        browser Device accepts the call).
//   2 → dial the sales backup number (E.164).
//   anything else → say invalid, re-present the menu once, then goodbye.
// Both Dial legs report status to /voice/status and hand failures to
// /voice/dial-fallback.

router.post('/menu', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '1') {
    twiml.say('Connecting you to RentalHub support.');
    sayRecordingConsent(twiml);
    // Callers are queued (with hold music/announcements served by
    // /voice/wait) until an agent on the queue line picks them up. The queue
    // name is also exposed to the agent browser through the queue call.
    const config = getQueueConfig();
    twiml.enqueue(
      {
        waitUrl: `/voice/wait?source=${getCallSource(req)}`,
        waitUrlMethod: 'POST',
        action: `/voice/enqueue-done?source=${getCallSource(req)}`,
        method: 'POST',
        friendlyName: config.name,
      },
      config.name
    );
  } else if (digits === '2') {
    twiml.say('Connecting you to our sales team.');
    sayRecordingConsent(twiml);
    dialNumber(twiml, process.env.SALES_BACKUP_NUMBER, {
      action: `/voice/dial-fallback?source=${getCallSource(req)}`,
      req,
    });
  } else {
    twiml.say('That selection is invalid.');
    buildMenuGather(twiml);
    // Reached when the retry Gather also times out without input.
    twiml.say('Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/dial-fallback ────────────────────────────────────────────────
// Action webhook fired when a Dial completes. `completed` means the call was
// actually answered; every other DialCallStatus (no-answer, busy, failed,
// cancel, timeout) triggers the recovery IVR once.

router.post('/dial-fallback', twilioWebhookGuard, (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const dialStatus = String(req.body.DialCallStatus || '').trim();

  if (dialStatus === 'completed') {
    twiml.say('Thank you for calling RentalHub. Goodbye.');
    twiml.hangup();
  } else {
    logger.info('Support dial not answered, offering fallback', webhookLogContext(req, { dialStatus }));
    twiml.say('We could not connect you to a support agent right now.');
    buildFallbackGather(twiml, req);
    // Reached when the fallback Gather times out without input.
    twiml.say('Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/fallback-choice ──────────────────────────────────────────────
// Recovery choice after a failed Dial:
//   1 → retry the browser agent once (bounded: terminal fallback on failure)
//   2 → connect to sales
//   anything else → goodbye

router.post('/fallback-choice', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '1') {
    twiml.say('Trying the support line again.');
    sayRecordingConsent(twiml);
    // Re-enter the queue (the retry path is queue-based, matching /voice/menu).
    const config = getQueueConfig();
    twiml.enqueue(
      {
        waitUrl: `/voice/wait?source=${getCallSource(req)}`,
        waitUrlMethod: 'POST',
        action: `/voice/enqueue-done?source=${getCallSource(req)}`,
        method: 'POST',
        friendlyName: config.name,
      },
      config.name
    );
  } else if (digits === '2') {
    twiml.say('Connecting you to our sales team.');
    sayRecordingConsent(twiml);
    dialNumber(twiml, process.env.SALES_BACKUP_NUMBER, {
      action: `/voice/dial-fallback-final?source=${getCallSource(req)}`,
      req,
    });
  } else {
    twiml.say('That selection is invalid. Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/dial-fallback-final ──────────────────────────────────────────
// Terminal recovery step: no further retries are offered, so the call can
// never loop.

router.post('/dial-fallback-final', twilioWebhookGuard, (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const dialStatus = String(req.body.DialCallStatus || '').trim();

  if (dialStatus === 'completed') {
    twiml.say('Thank you for calling RentalHub. Goodbye.');
  } else {
    twiml.say('We were unable to complete your call. Please try again later. Goodbye.');
  }
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/wait ─────────────────────────────────────────────────────────
// Caller-side hold loop, served while a caller is enqueued. Twilio re-fetches
// this URL after each loop completes, so the sequence below repeats:
//   1. busy announcement
//   2. 5-second DTMF window — press 1 to leave a callback request
//   3. ad slot (opt-in, deterministic per caller)
//   4. hold music (opt-in)

router.post('/wait', twilioWebhookGuard, (req, res) => {
  const config = getQueueConfig();
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(config.announcement);

  const callbackGather = twiml.gather({
    action: `/voice/wait-options?source=${getCallSource(req)}`,
    method: 'POST',
    numDigits: 1,
    input: 'dtmf',
    timeout: 5,
  });
  callbackGather.say('Press 1 to leave a callback request instead.');

  // Ad slot: deterministic per caller so the same ad repeats on each loop.
  if (config.adsEnabled) {
    const adUrl = pickAdUrl(config.adUrls, req.body.CallSid);
    if (adUrl) twiml.play({}, adUrl);
  }
  if (config.holdMusicUrl) twiml.play({}, config.holdMusicUrl);

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/wait-options ─────────────────────────────────────────────────
// DTMF captured during the wait loop. "1" leaves the queue to request a
// callback (number entered via the shared /voice/callback-number flow).

router.post('/wait-options', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '1') {
    twiml.say('Please enter the phone number where we can reach you, then press the hash key.');
    twiml.gather({
      action: `/voice/callback-number?source=${getCallSource(req)}`,
      method: 'POST',
      numDigits: 14,
      input: 'dtmf',
      timeout: 10,
      finishOnKey: '#',
    });
    twiml.say('We did not receive a phone number. Goodbye.');
    twiml.hangup();
  } else {
    twiml.say('That selection is invalid. Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/enqueue-done ─────────────────────────────────────────────────
// Enqueue action: fires when the caller leaves the queue. "bridged" means an
// agent took the call; anything else means they left before that.

router.post('/enqueue-done', twilioWebhookGuard, (req, res) => {
  const queueResult = String(req.body.QueueResult || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  logger.info('Caller left the support queue', webhookLogContext(req, { queueResult }));

  if (queueResult === 'bridged') {
    twiml.hangup();
  } else {
    twiml.say('Thank you for calling RentalHub. Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/agent-wait ───────────────────────────────────────────────────
// Agent-side hold loop: what the agent hears while connected to the queue
// line and waiting for a caller to be bridged.

router.post('/agent-wait', twilioWebhookGuard, (req, res) => {
  const config = getQueueConfig();
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Waiting for incoming calls.');
  if (config.holdMusicUrl) twiml.play({}, config.holdMusicUrl);

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── POST /voice/after-hours ──────────────────────────────────────────────────
// DTMF entry of the after-hours branch: only "3" (request a callback) is
// meaningful; anything else ends the call.

router.post('/after-hours', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '3') {
    twiml.say('Please enter the phone number where we can reach you, then press the hash key.');
    const callbackGather = twiml.gather({
      action: `/voice/callback-number?source=${getCallSource(req)}`,
      method: 'POST',
      numDigits: 14,
      input: 'dtmf',
      timeout: 10,
      finishOnKey: '#',
    });
    // Reached when the caller never enters a number.
    twiml.say('We did not receive a phone number. Goodbye.');
    twiml.hangup();
  } else {
    twiml.say('That selection is invalid. Goodbye.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Normalize a DTMF-entered callback number to E.164-ish form.
 * Nigerian callers typically dial "0803…" (local) or "234803…" (intl format).
 */
const normalizeCallbackNumber = (digits) => {
  const cleaned = String(digits || '').replace(/\D/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) return null;
  if (cleaned.startsWith('234')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
};

// ── POST /voice/callback-number ──────────────────────────────────────────────
// Persists the DTMF-entered callback number (after-hours flow). Persistence is
// best-effort: a DB outage must not fail the call.

router.post('/callback-number', twilioWebhookGuard, async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const phoneNumber = normalizeCallbackNumber(req.body.Digits);
  const callSid = String(req.body.CallSid || '').slice(0, 64);

  if (!phoneNumber) {
    logger.warn('Voice callback number rejected: not a valid phone number', webhookLogContext(req));
    twiml.say('That phone number does not look valid. Goodbye.');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  logger.info('Voice callback requested', webhookLogContext(req, { phoneNumber }));

  try {
    await db.query(
      `INSERT INTO voice_callback_requests (call_sid, phone_number, source)
       VALUES ($1, $2, $3)`,
      [callSid || null, phoneNumber, getCallSource(req)]
    );
  } catch (error) {
    logger.warn('Voice callback persistence failed:', error.message, { callSid });
  }

  twiml.say('Thank you. Our team will call you back during business hours. Goodbye.');
  twiml.hangup();
  res.type('text/xml');
  res.send(twiml.toString());
});

// ── GET /voice/callbacks ─────────────────────────────────────────────────────
// Admin-only review of after-hours callback requests.

router.get('/callbacks', voiceTokenLimiter, authenticate, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, call_sid, phone_number, source, created_at
       FROM voice_callback_requests
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Voice callback list failed:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load callback requests.' });
  }
});

// ── POST /voice/recording ────────────────────────────────────────────────────
// Recording status callbacks (VOICE_RECORD_CALLS=true). Back-fills the
// recording URL onto the matching status row; never fails the webhook.

router.post('/recording', twilioWebhookGuard, async (req, res) => {
  const recordingStatus = String(req.body.RecordingStatus || '').trim();
  const recordingSid = String(req.body.RecordingSid || '').slice(0, 64);
  const recordingUrl = String(req.body.RecordingUrl || '').slice(0, 512) || null;
  const callSid = String(req.body.CallSid || '').slice(0, 64);

  logger.info('Voice recording status', {
    callSid,
    recordingSid: recordingSid || undefined,
    recordingStatus: recordingStatus || undefined,
    source: getCallSource(req),
  });

  if (callSid && recordingUrl) {
    try {
      await db.query(
        `UPDATE voice_call_events
         SET recording_url = $1
         WHERE call_sid = $2`,
        [recordingUrl, callSid]
      );
    } catch (error) {
      logger.warn('Voice recording persistence failed:', error.message, { callSid });
    }
  }

  res.status(200).json({ success: true });
});



const VOICE_STATUSES = new Set([
  'initiated', 'ringing', 'answered', 'in-progress',
  'completed', 'busy', 'failed', 'no-answer', 'cancel',
]);

router.post('/status', twilioWebhookGuard, async (req, res) => {
  const callStatus = String(req.body.CallStatus || '').trim();
  const dialStatus = String(req.body.DialCallStatus || '').trim();
  const status = dialStatus || callStatus;

  if (!VOICE_STATUSES.has(status)) {
    logger.warn('Voice status webhook ignored: unexpected status', webhookLogContext(req, { status }));
    return res.status(200).json({ success: true });
  }

  const direction = String(req.body.From || '').toLowerCase().startsWith('client:')
    ? 'outbound'
    : 'inbound';

  const payload = {
    callSid: String(req.body.CallSid || '').slice(0, 64),
    parentCallSid: String(req.body.ParentCallSid || '').slice(0, 64) || null,
    direction,
    source: getCallSource(req),
    status,
    fromNumber: sanitizeCallerNumber(req.body.From) || null,
    toNumber: String(req.body.To || '').slice(0, 64) || null,
    durationSec: Number.isFinite(Number(req.body.DialCallDuration))
      ? Math.max(0, Math.floor(Number(req.body.DialCallDuration)))
      : null,
  };

  logger.info('Voice call status', { callSid: payload.callSid, status, source: payload.source, direction });

  try {
    await db.query(
      `INSERT INTO voice_call_events
         (call_sid, parent_call_sid, direction, source, status, from_number, to_number, duration_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (call_sid, status) DO UPDATE SET
         parent_call_sid = EXCLUDED.parent_call_sid,
         duration_sec = EXCLUDED.duration_sec,
         from_number = EXCLUDED.from_number,
         to_number = EXCLUDED.to_number,
         source = EXCLUDED.source`,
      [
        payload.callSid,
        payload.parentCallSid,
        payload.direction,
        payload.source,
        payload.status,
        payload.fromNumber,
        payload.toNumber,
        payload.durationSec,
      ]
    );
  } catch (error) {
    // Non-fatal: keep the webhook flow alive; the event is still logged.
    logger.warn('Voice status persistence failed:', error.message, { callSid: payload.callSid });
  }

  res.status(200).json({ success: true });
});

// ── GET /voice/token ─────────────────────────────────────────────────────────
// Issues a short-lived Twilio Access Token (TTL 3600s) for the shared agent
// identity "support_agent_1". The browser Voice SDK uses it to register a
// Device that can receive calls dialed as <Client>support_agent_1</Client>.
// Only admins/super-admins may mint tokens; only one browser should normally
// hold the identity registered at a time.

router.get('/token', voiceTokenLimiter, authenticate, requireAdminOrSuperAdmin, (req, res) => {
  const status = getVoiceConfigStatus();
  if (!status.ready) {
    logger.error('Voice token request blocked: incomplete Twilio configuration');
    return res.status(503).json({
      success: false,
      message: 'Voice service is not configured. Please contact the administrator.',
    });
  }

  try {
    const accessToken = new twilio.jwt.AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { ttl: 3600, identity: 'support_agent_1' }
    );

    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      incomingAllow: true,
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    });
    accessToken.addGrant(voiceGrant);

    res.json({ token: accessToken.toJwt() });
  } catch (error) {
    // Never log or echo the SID/keys; log only the error message.
    logger.error('Twilio voice token generation failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate voice access token.',
    });
  }
});

module.exports = router;

// Test-only exports — same convention as routes/support.js (_supportScopeForTest).
module.exports._voiceScopeForTest = {
  classifyCallSource,
  sanitizeCallerNumber,
  getVoiceConfigStatus,
  isSupportHoursActive,
  normalizeCallbackNumber,
  E164_PATTERN,
  VOICE_STATUSES,
};
