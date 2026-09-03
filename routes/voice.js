// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Twilio dual-carrier voice support system.
//
// Carriers:
//   - Nigeria  â†’ inbound calls arrive via Termii SIP forwarding onto a Twilio
//                number / SIP trunk (matched by NIGERIA_NUMBER / the SIP trunk
//                suffix configured through NIGERIA_SIP_TRUNK_MATCH).
//   - International â†’ inbound calls arrive on INTL_NUMBER.
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
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const express = require('express');
const twilio = require('twilio');
const logger = require('../config/utils/logger');
const db = require('../config/middleware/database');
const {
  authenticate,
  requireAdminOrSuperAdmin,
} = require('../config/middleware/auth');
const { voiceTokenLimiter } = require('../config/middleware/securityRateLimiters');
const adService = require('../services/adService');
const {
  isVoiceReadRole,
  resolveVoiceReadScope,
  buildScopeClause,
} = require('../services/voiceJurisdiction');
const { resolveCallerArea } = require('../services/callerArea');
const {
  dispatchIdentityOrder,
  parseQueueScope,
  waitingRoomForScope,
  waitingRoomsForCaller,
  pickQueuedCallerForAgent,
  canAgentHandleJurisdiction,
} = require('../services/voiceRouting');

const router = express.Router();

// â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// E.164: a "+" followed by 8â€“15 digits (country code + national number).
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

// â”€â”€ Optional operational settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// After-hours windows and recording are opt-in. When misconfigured, the
// affected feature degrades gracefully (hours â†’ always available; recording â†’
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
      logger.warn('Voice support hours misconfigured â€” treated as always available:', config.reason);
    }
    return true;
  }

  // Build "MM-DD" in the configured timezone (locale-safe â€” never rely on the
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

// â”€â”€ Queue / hold / ad-slot configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The support line routes callers through a real Twilio <Queue>: the caller is
// <Enqueue>d and hears a wait loop (announcement â†’ optional ad slot â†’ optional
// hold music) until an agent dequeues them. Agents join the line by dialing
// "queue:<name>" through the TwiML App (the Voice Desk does this
// automatically). Ad slots are config-driven for now â€” wired to the platform's
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

// â”€â”€ Escalation configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Format: "department:target,department:target" where target is an E.164
// number or a Twilio Client identity ("client:identity"). Example:
//   VOICE_ESCALATION_DEPARTMENTS=finance:+2348012345678,legal:client_legal_1

const DEPARTMENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/i;
const CLIENT_IDENTITY_PATTERN = /^client:[a-zA-Z0-9_-]{1,63}$/;

const getEscalationDepartments = () => {
  const raw = String(process.env.VOICE_ESCALATION_DEPARTMENTS || '').trim();
  if (!raw) return [];
  const departments = [];
  for (const entry of raw.split(',')) {
    const [name, ...rest] = entry.trim().split(':');
    const target = rest.join(':').trim();
    if (!DEPARTMENT_NAME_PATTERN.test(name || '') || !target) continue;
    const validTarget =
      E164_PATTERN.test(target) || CLIENT_IDENTITY_PATTERN.test(target.toLowerCase());
    if (!validTarget) continue;
    departments.push({ name, target });
  }
  return departments;
};

const findDepartment = (name) =>
  getEscalationDepartments().find(
    (department) => department.name.toLowerCase() === String(name || '').toLowerCase()
  );

// Lazy Twilio REST client â€” only created when an escalation is requested.
let twilioRestClient = null;
const getTwilioRestClient = () => {
  if (!twilioRestClient) {
    twilioRestClient = new twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioRestClient;
};

/**
 * Pick an ad deterministically for a given call (same caller hears the same ad
 * across wait-loop iterations). Returns null when no candidates exist.
 */
const pickAd = (candidates, callSid) => {
  if (!candidates.length) return null;
  let hash = 0;
  const input = String(callSid || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return candidates[hash % candidates.length];
};

/** Resolve site-relative URLs to the public base Twilio can reach. */
const absoluteUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = (process.env.TWILIO_WEBHOOK_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
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
 * production that URL is built from TWILIO_WEBHOOK_BASE_URL only â€” the
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

// â”€â”€ Call context helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// `source` is threaded through webhook URLs as a query parameter so every leg
// (Dial status callbacks, Dial action webhooks) keeps the ORIGINAL call's
// origin even though `To` changes per leg.

const classifyCallSource = (to) => {
  const value = String(to || '');
  const nigeriaNumber = process.env.NIGERIA_NUMBER || '';
  const sipTrunkMatch = process.env.NIGERIA_SIP_TRUNK_MATCH || '';
  const intlNumber = process.env.INTL_NUMBER || '';
  const tollFreeNumber = process.env.TOLL_FREE_NUMBER || '';

  // includes('') is always true â€” guard against empty match strings so an
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
 * SIP trunks may report From as "sip:+2348â€¦@trunk.example" or even as an
 * email-like identity â€” never forward raw SIP URIs or usernames to agents.
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
// Accepts either a request (derives the source) or a source string directly.
const DIAL_STATUS_CALLBACK = (reqOrSource) => {
  const source = typeof reqOrSource === 'string'
    ? reqOrSource
    : getCallSource(reqOrSource);
  return {
    statusCallback: `/voice/status?source=${source}`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  };
};

// QA/compliance recording (opt-in via VOICE_RECORD_CALLS=true). Recording is
// enabled from answer onwards; the recording URL is delivered to
// /voice/recording and back-filled onto the matching status row.
const DIAL_RECORDING_OPTIONS = (reqOrSource) => {
  const source = typeof reqOrSource === 'string'
    ? reqOrSource
    : getCallSource(reqOrSource);
  return {
    record: 'record-from-answer',
    recordingStatusCallback: `/voice/recording?source=${source}`,
    recordingStatusCallbackMethod: 'POST',
  };
};

const sayRecordingConsent = (twiml) => {
  if (isCallRecordingEnabled()) {
    twiml.say('This call may be recorded for quality and training purposes.');
  }
};

// â”€â”€ IVR helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const IVR_GATHER_OPTIONS = {
  action: '/voice/menu',
  method: 'POST',
  numDigits: 1,
  input: 'dtmf',
  timeout: 8,
};

const MENU_PROMPT = 'For support, press 1. For sales, press 2. To request a callback, press 3.';

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

// â”€â”€ Conference helpers (warm-transfer call path) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every support call now runs inside a Twilio <Conference> "room":
//   - the caller parks in their own room (rentalhub_support_<callerCallSid>)
//     with the hold loop (announcement â†’ ad â†’ music) as the waitUrl;
//   - the agent is dispatched into the caller's room (directly when they dial
//     the queue and a caller is waiting, or via a REST-created participant
//     call when a caller arrives while the agent is parked);
//   - escalation becomes a WARM transfer: the department is called into the
//     SAME room, held+coached so only the agent hears them, then unheld to
//     bridge the caller, after which the agent leaves.
//
// This room model is what makes hold/consult/merge/leave possible at all â€”
// a direct queue bridge cannot do it.

const SUPPORT_ROOM_PREFIX = 'rentalhub_support_';
const AGENTS_WAITING_ROOM = 'rentalhub_agents_waiting';

const getCallerRoomName = (callerCallSid) =>
  `${SUPPORT_ROOM_PREFIX}${String(callerCallSid || '').slice(0, 64)}`;

const isSupportRoom = (roomName) =>
  String(roomName || '').startsWith(SUPPORT_ROOM_PREFIX);

const CONFERENCE_EVENTS = ['start', 'end', 'join', 'leave', 'hold', 'kick', 'mute'];

const CONFERENCE_STATUS_CALLBACK = (reqOrSource) => {
  const source = typeof reqOrSource === 'string'
    ? reqOrSource
    : getCallSource(reqOrSource);
  return {
    statusCallback: `/voice/conference-events?source=${source}`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: CONFERENCE_EVENTS,
  };
};

/** Caller leg: joins their own room and waits (hold loop) for an agent. */
const dialCallerIntoConference = (twiml, req) => {
  const roomName = getCallerRoomName(req.body.CallSid);
  const dial = twiml.dial({
    timeout: 1800,
    ...CONFERENCE_STATUS_CALLBACK(req),
  });
  dial.conference(
    {
      waitUrl: `/voice/wait?source=${getCallSource(req)}`,
      waitUrlMethod: 'POST',
      endConferenceOnExit: true,
      startConferenceOnEnter: true,
      ...(isCallRecordingEnabled() ? { record: 'record-from-answer' } : {}),
    },
    roomName
  );
  return roomName;
};

/**
 * Agent leg into a room: used for both immediate dispatch (caller waiting)
 * and the agents' waiting room (no callers yet).
 */
const dialAgentIntoConference = (twiml, req, roomName, { waiting = false } = {}) => {
  const dial = twiml.dial({
    timeout: 7200,
    ...DIAL_STATUS_CALLBACK(req),
    ...(isCallRecordingEnabled() ? DIAL_RECORDING_OPTIONS(req) : {}),
  });
  dial.conference(
    {
      ...(waiting
        ? { waitUrl: `/voice/agent-wait?source=${getCallSource(req)}`, waitUrlMethod: 'POST' }
        : {}),
      endConferenceOnExit: false,
      startConferenceOnEnter: true,
    },
    roomName
  );
  return dial;
};

// â”€â”€ POST /voice/incoming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Entry point for every inbound call (Nigeria via Termii SIP, or
// international). Plays the greeting, collects a single DTMF digit and hands
// control to /voice/menu. If the caller never presses a digit, the Gather
// times out and we say goodbye + hang up.

router.post('/incoming', twilioWebhookGuard, (req, res) => {
  const callSource = getCallSource(req);

  // Outbound legs initiated from the agent browser carry From=client:â€¦
  // (the TwiML App Voice URL is /voice/outgoing). If such a leg is
  // mis-routed here, never play the inbound IVR to the dialed party.
  if (String(req.body.From || '').toLowerCase().startsWith('client:')) {
    logger.warn('Voice webhook: outbound leg hit /voice/incoming â€” check the TwiML App Voice URL', webhookLogContext(req));
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.reject();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Operational logs â€” keep these exact strings; the frontend derives its
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

// â”€â”€ POST /voice/outgoing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TwiML App Voice URL: invoked when an agent browser Device places an
// outbound call. The destination is dialed with the platform number as the
// caller ID; a failed attempt gets the bounded terminal fallback.

router.post('/outgoing', twilioWebhookGuard, async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const destination = String(req.body.To || '').trim();
  const config = getQueueConfig();

  // Agent-side queue line: the Voice Desk dials "queue:<name>" to join duty.
  // When geo routing is OFF only the single national queue (config.name) is
  // accepted (today's behaviour). When ON the tier lines are also accepted:
  //   queue:super / queue:state:<state> / queue:lga:<state>:<lga>.
  // If a caller who belongs to that line is waiting, the agent joins their
  // room directly; otherwise the agent parks in that line's waiting room and
  // dispatch pulls them into an owned caller's room when one arrives.
  if (destination.toLowerCase().startsWith(QUEUE_PREFIX)) {
    const queueName = destination.slice(QUEUE_PREFIX.length).trim();
    const geoOn = await isVoiceGeoRoutingEnabled();
    const legacy = queueName === config.name;
    const scope = legacy
      ? { tier: 'super', state: null, lga: null }
      : geoOn
        ? parseQueueScope(destination)
        : null;
    if (!scope) {
      logger.warn('Outgoing voice call rejected: unknown queue name', webhookLogContext(req, { queueName }));
      twiml.say('That queue is not available. Please try again.');
      twiml.hangup();
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const waitingRoom = waitingRoomForScope(scope, AGENTS_WAITING_ROOM);

    let waitingCaller = null;
    try {
      const result = await db.query(
        `SELECT call_sid, to_number, jurisdiction_state, jurisdiction_lga
         FROM voice_call_events
         WHERE status = 'queued'
           AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
         ORDER BY created_at DESC
         LIMIT 50`
      );
      waitingCaller = geoOn
        ? pickQueuedCallerForAgent(result.rows || [], scope, true)
        : (result.rows && result.rows[0]) || null;
    } catch {
      waitingCaller = null;
    }

    if (waitingCaller && isSupportRoom(waitingCaller.to_number)) {
      logger.info('Agent dispatched directly to waiting caller room', webhookLogContext(req, {
        roomName: waitingCaller.to_number,
      }));
      twiml.say('Connecting you to a waiting caller.');
      await markCallerStatus(waitingCaller.call_sid, 'in-progress', {
        agentCallSid: String(req.body.CallSid || '').slice(0, 64) || null,
        roomName: waitingCaller.to_number,
      });
      dialAgentIntoConference(twiml, req, waitingCaller.to_number);
    } else {
      logger.info('Agent parked in the waiting room', webhookLogContext(req, { roomName: waitingRoom }));
      twiml.say('You are on the line. Waiting for incoming calls.');
      dialAgentIntoConference(twiml, req, waitingRoom, { waiting: true });
    }

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

// â”€â”€ POST /voice/menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DTMF routing:
//   1 â†’ connect to the Voice JS SDK agent registered as "support_agent_1"
//       (answerOnBridge makes the caller hear the agent only after the
//        browser Device accepts the call).
//   2 â†’ dial the sales backup number (E.164).
//   anything else â†’ say invalid, re-present the menu once, then goodbye.
// Both Dial legs report status to /voice/status and hand failures to
// /voice/dial-fallback.

router.post('/menu', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '1') {
    twiml.say('Connecting you to RentalHub support.');
    sayRecordingConsent(twiml);
    // The caller parks in their own conference room; the hold loop plays the
    // announcement/ad/music until the agent is dispatched into the room.
    dialCallerIntoConference(twiml, req);
  } else if (digits === '3') {
    // Callback request â€” same DTMF flow as the after-hours branch.
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

// â”€â”€ POST /voice/dial-fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ POST /voice/fallback-choice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Recovery choice after a failed Dial:
//   1 â†’ retry the browser agent once (bounded: terminal fallback on failure)
//   2 â†’ connect to sales
//   anything else â†’ goodbye

router.post('/fallback-choice', twilioWebhookGuard, (req, res) => {
  const digits = String(req.body.Digits || '').trim();
  const twiml = new twilio.twiml.VoiceResponse();

  if (digits === '1') {
    twiml.say('Trying the support line again.');
    sayRecordingConsent(twiml);
    // Re-enter the caller's conference room (retry path mirrors /voice/menu).
    dialCallerIntoConference(twiml, req);
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

// â”€â”€ POST /voice/dial-fallback-final â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ POST /voice/wait â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Caller-side hold loop, used as the conference room's waitUrl. Twilio
// re-fetches it after each loop completes: announcement â†’ ad slot â†’ hold
// music. (DTMF is NOT available in a conference waitUrl, so callback requests
// live in the main IVR â€” press 3 â€” and the after-hours branch instead.)

router.post('/wait', twilioWebhookGuard, async (req, res) => {
  const config = getQueueConfig();
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(config.announcement);

  // Ad slot: DB-backed audio ads (placement "voice_hold") take priority; the
  // config-provided URL list is the fallback when the DB has none or is down.
  // One ad is picked deterministically per caller; impressions are recorded
  // once per (ad, call) via the voice_ad_impressions dedupe table.
  if (config.adsEnabled) {
    let adUrl = null;
    let adId = null;
    try {
      const dbAds = await adService.listAudioAdsForVoice();
      const picked = pickAd(dbAds, req.body.CallSid);
      if (picked) {
        adUrl = absoluteUrl(picked.audio_url);
        adId = picked.id;
      }
    } catch {
      // DB unreachable â€” fall through to the config-provided list.
    }
    if (!adUrl) {
      const configUrls = config.adUrls.filter((url) => /^https:\/\//i.test(url));
      const picked = pickAd(configUrls, req.body.CallSid);
      if (picked) adUrl = picked;
    }
    if (adUrl) {
      twiml.play({}, adUrl);
      if (adId) {
        adService.recordVoiceAdImpression(adId, req.body.CallSid);
      }
    }
  }
  if (config.holdMusicUrl) twiml.play({}, config.holdMusicUrl);

  // Persist the caller's leg (best-effort) so dispatch and escalation can
  // correlate the waiting caller. Idempotent via the (call_sid, status) key.
  const callerCallSid = String(req.body.CallSid || '').slice(0, 64);
  if (callerCallSid) {
    try {
      const callerNumber = sanitizeCallerNumber(req.body.From);
      // Phase 1 jurisdiction capture: Rule B home area for known callers.
      const area = callerNumber ? await resolveCallerArea(callerNumber) : null;
      await db.query(
        `INSERT INTO voice_call_events
           (call_sid, parent_call_sid, direction, source, status, from_number, to_number,
            jurisdiction_state, jurisdiction_lga, jurisdiction_source)
         VALUES ($1, $2, 'inbound', $3, 'queued', $4, $5, $6, $7, $8)
         ON CONFLICT (call_sid, status) DO UPDATE SET
           from_number = EXCLUDED.from_number,
           source = EXCLUDED.source,
           jurisdiction_state = COALESCE(EXCLUDED.jurisdiction_state, voice_call_events.jurisdiction_state),
           jurisdiction_lga = COALESCE(EXCLUDED.jurisdiction_lga, voice_call_events.jurisdiction_lga),
           jurisdiction_source = COALESCE(EXCLUDED.jurisdiction_source, voice_call_events.jurisdiction_source)`,
        [
          callerCallSid,
          String(req.body.ParentCallSid || '').slice(0, 64) || null,
          getCallSource(req),
          callerNumber,
          getCallerRoomName(callerCallSid),
          area ? area.state : null,
          area ? area.lga : null,
          area ? area.source : 'unknown',
        ]
      );
    } catch {
      // Non-fatal â€” dispatch correlation is best-effort.
    }
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// â”€â”€ POST /voice/conference-events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Status callbacks from every support conference. Drives:
//   - caller lifecycle (clear 'queued' when their room ends);
//   - agent dispatch (move a parked agent into a new caller's room);
//   - call-state marking (queued â†’ in-progress once the agent joins).

// â”€â”€ Agent identities (multi-agent) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Agents are identified by Twilio Client identities. Configure the allowed
// lines via VOICE_AGENT_IDENTITIES (comma-separated); the first entry is the
// default identity used by legacy paths and when only one agent exists.

const getAgentIdentities = () => {
  const parsed = String(process.env.VOICE_AGENT_IDENTITIES || 'support_agent_1')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[a-zA-Z0-9_-]{1,63}$/.test(value));
  return parsed.length ? parsed : ['support_agent_1'];
};

const isValidAgentLine = (line) =>
  getAgentIdentities().includes(String(line || '').trim());

const AGENT_IDENTITY = getAgentIdentities()[0];

// Phase 2 geo routing: identities are grouped per tier. Super = the existing
// national line. LGA/state pools read optional env lists (VOICE_LGA_IDENTITIES,
// VOICE_STATE_IDENTITIES, comma-separated) that the Phase 3 desks will staff;
// empty pools just mean that tier rolls up to the next one.
const parseTierIdentities = (envValue) =>
  String(envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[a-zA-Z0-9_-]{1,63}$/.test(value));

const getTierIdentityPools = () => ({
  lga: parseTierIdentities(process.env.VOICE_LGA_IDENTITIES),
  state: parseTierIdentities(process.env.VOICE_STATE_IDENTITIES),
  super: getAgentIdentities(),
});

const isVoiceGeoRoutingEnabled = async () => {
  try {
    const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
    const flags = await getFeatureFlagsMap();
    return flags.voice_geo_routing === true;
  } catch {
    return false;
  }
};

/** Resolve the client identity behind a call (its To is "client:<identity>"). */
const resolveClientIdentityFromCall = async (callSid) => {
  try {
    const call = await getTwilioRestClient().calls(callSid).fetch();
    const to = String(call.to || '');
    if (to.toLowerCase().startsWith('client:')) {
      const identity = to.slice('client:'.length);
      return /^[a-zA-Z0-9_-]{1,63}$/.test(identity) ? identity : null;
    }
  } catch {
    // Call not found / no longer live.
  }
  return null;
};

const existingJurisdictionFor = async (callSid) => {
  if (!callSid) return null;
  try {
    const result = await db.query(
      `SELECT jurisdiction_state AS state, jurisdiction_lga AS lga, jurisdiction_source AS source
       FROM voice_call_events
       WHERE call_sid = $1 AND jurisdiction_state IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 1`,
      [callSid]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
};

const markCallerStatus = async (callerCallSid, status, { agentCallSid = null, roomName = null } = {}) => {
  if (!callerCallSid) return;
  try {
    if (status === 'left') {
      await db.query(
        `DELETE FROM voice_call_events
         WHERE call_sid = $1 AND status IN ('queued', 'in-progress')`,
        [callerCallSid]
      );
      return;
    }
    const jurisdiction = await existingJurisdictionFor(callerCallSid);
    await db.query(
      `INSERT INTO voice_call_events
         (call_sid, parent_call_sid, direction, source, status, to_number,
          jurisdiction_state, jurisdiction_lga, jurisdiction_source)
       VALUES ($1, $2, 'inbound', 'unknown', $3, $4, $5, $6, $7)
       ON CONFLICT (call_sid, status) DO UPDATE SET
         parent_call_sid = EXCLUDED.parent_call_sid,
         to_number = EXCLUDED.to_number,
         jurisdiction_state = COALESCE(EXCLUDED.jurisdiction_state, voice_call_events.jurisdiction_state),
         jurisdiction_lga = COALESCE(EXCLUDED.jurisdiction_lga, voice_call_events.jurisdiction_lga),
         jurisdiction_source = COALESCE(EXCLUDED.jurisdiction_source, voice_call_events.jurisdiction_source)`,
      [
        callerCallSid,
        agentCallSid,
        status,
        roomName,
        jurisdiction ? jurisdiction.state : null,
        jurisdiction ? jurisdiction.lga : null,
        jurisdiction ? jurisdiction.source : null,
      ]
    );
  } catch {
    // Best-effort.
  }
};

/**
 * Send an agent into a caller's room (multi-agent aware):
 *   1. If agents are parked in the shared waiting room, move the LONGEST-
 *      waiting parked agent into the caller's room (REST rings their browser).
 *   2. Otherwise no-one is on duty â€” the caller keeps waiting (the next agent
 *      to dial the queue line joins them directly).
 */
const dispatchAgentToRoom = async (roomName, callerCallSid) => {
  const rest = getTwilioRestClient();
  try {
    const conference = (await rest.conferences.list({ friendlyName: roomName, status: 'in-progress' }))[0];
    if (!conference) return false;

    const geoOn = await isVoiceGeoRoutingEnabled();
    let targetIdentity = null;
    try {
      // Pull a parked agent from the caller's OWNING tier first, then roll up
      // (LGA room -> state room -> super). Geo OFF = today's single super room.
      const rooms = geoOn
        ? waitingRoomsForCaller(await existingJurisdictionFor(callerCallSid), AGENTS_WAITING_ROOM)
        : [AGENTS_WAITING_ROOM];
      for (const waitingRoom of rooms) {
        if (targetIdentity) break;
        try {
          const waiting = (await rest.conferences.list({ friendlyName: waitingRoom, status: 'in-progress' }))[0];
          if (!waiting) continue;
          const participants = await rest.conferences(waiting.sid).participants.list();
          const parked = participants
            .filter((p) => String(p.callSid || '').startsWith('CA'))
            .sort((a, b) => new Date(a.dateCreated || 0) - new Date(b.dateCreated || 0));
          for (const participant of parked) {
            const identity = await resolveClientIdentityFromCall(participant.callSid);
            if (!identity) continue;
            targetIdentity = identity;
            await rest.conferences(waiting.sid).participants(participant.sid).remove();
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Fall back to the default identity below.
    }

    const identity = targetIdentity || AGENT_IDENTITY;
    let ringIdentity = identity;
    try {
      // Phase 2: when geo routing is on, prefer the owning tier's configured
      // pool (used when no tier agent is physically parked). Flag OFF keeps
      // today's behaviour.
      if (geoOn) {
        const jurisdiction = await existingJurisdictionFor(callerCallSid);
        const order = dispatchIdentityOrder(jurisdiction, getTierIdentityPools());
        if (order.length) ringIdentity = order[0];
      }
    } catch {
      // Fall back to the default identity below.
    }
    await rest.conferences(conference.sid).participants.create({
      to: `client:${ringIdentity}`,
      from: `client:${ringIdentity}`,
    });

    await markCallerStatus(callerCallSid, 'in-progress', { agentCallSid: null, roomName });
    logger.info('Agent dispatched to caller room', { roomName, callerCallSid, identity: ringIdentity });
    return true;
  } catch (dispatchError) {
    logger.warn('Agent dispatch failed', { roomName, message: dispatchError.message });
    return false;
  }
};

router.post('/conference-events', twilioWebhookGuard, async (req, res) => {
  const event = String(req.body.StatusCallbackEvent || '').trim();
  const roomName = String(req.body.FriendlyName || '').trim();
  const participantCallSid = String(req.body.CallSid || '').slice(0, 64);

  // Agent waiting room: nothing to do beyond logging (parking state is read
  // live from the Twilio API when dispatch is needed).
  if (roomName === AGENTS_WAITING_ROOM) {
    logger.info('Voice conference event (agents waiting)', { event, callSid: participantCallSid || undefined });
    return res.status(200).json({ success: true });
  }

  if (!isSupportRoom(roomName)) {
    return res.status(200).json({ success: true });
  }

  const callerCallSid = roomName.slice(SUPPORT_ROOM_PREFIX.length);

  logger.info('Voice conference event (support room)', {
    event,
    roomName,
    callerCallSid,
  });

  if (event === 'conference-start') {
    // The caller just joined their room and is waiting â€” try to dispatch the
    // agent immediately (no-op if the agent is offline; they will join via
    // the queue line when they dial in).
    await dispatchAgentToRoom(roomName, callerCallSid);
  } else if (event === 'participant-join') {
    // If the joining leg is the agent's (someone other than the caller), the
    // call is now in progress.
    if (participantCallSid !== callerCallSid) {
      await markCallerStatus(callerCallSid, 'in-progress', {
        agentCallSid: participantCallSid,
        roomName,
      });
    }
  } else if (event === 'conference-end') {
    await markCallerStatus(callerCallSid, 'left');
  }

  res.status(200).json({ success: true });
});

// â”€â”€ POST /voice/after-hours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ POST /voice/agent-wait â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ POST /voice/after-hours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
 * Nigerian callers typically dial "0803â€¦" (local) or "234803â€¦" (intl format).
 */
const normalizeCallbackNumber = (digits) => {
  const cleaned = String(digits || '').replace(/\D/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) return null;
  if (cleaned.startsWith('234')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
};

// â”€â”€ POST /voice/callback-number â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const area = await resolveCallerArea(phoneNumber);
    await db.query(
      `INSERT INTO voice_callback_requests
         (call_sid, phone_number, source, jurisdiction_state, jurisdiction_lga, jurisdiction_source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        callSid || null,
        phoneNumber,
        getCallSource(req),
        area ? area.state : null,
        area ? area.lga : null,
        area ? area.source : 'unknown',
      ]
    );
  } catch (error) {
    logger.warn('Voice callback persistence failed:', error.message, { callSid });
  }

  twiml.say('Thank you. Our team will call you back during business hours. Goodbye.');
  twiml.hangup();
  res.type('text/xml');
  res.send(twiml.toString());
});

// â”€â”€ GET /voice/callbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Review of after-hours callback requests, scoped to the reader's tier
// (super/state/LGA â€” docs/geo-support-escalation-design.md Phase 1).

// Voice record readers: super/state/LGA tiers. Attaches req.voiceScope.
const requireVoiceRead = (req, res, next) => {
  try {
    if (!req.user || !isVoiceReadRole(req.user.user_type)) {
      return res.status(403).json({ success: false, message: 'Your role cannot view voice records.' });
    }
    req.voiceScope = resolveVoiceReadScope(req.user);
    next();
  } catch (error) {
    return res.status(error.statusCode || 403).json({ success: false, message: error.message });
  }
};

// Agent console access (Phase 3): the support tiers (super/state/LGA) plus the
// general area admins may staff the line and use the desk. Same role set as
// voice records. Ownership/enforcement of actions is Phase 4's job.
const requireVoiceAgent = (req, res, next) => {
  if (!req.user || !isVoiceReadRole(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Your role cannot use the voice console.' });
  }
  next();
};

router.get('/callbacks', voiceTokenLimiter, authenticate, requireVoiceRead, async (req, res) => {
  try {
    const scopeClause = buildScopeClause(req.voiceScope, '');
    const where = scopeClause.clause ? `WHERE TRUE ${scopeClause.clause}` : '';
    const result = await db.query(
      `SELECT id, call_sid, phone_number, source,
              jurisdiction_state, jurisdiction_lga, jurisdiction_source, created_at
       FROM voice_callback_requests
       ${where}
       ORDER BY created_at DESC
       LIMIT 50`,
      scopeClause.params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Voice callback list failed:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load callback requests.' });
  }
});

// â”€â”€ GET /voice/summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lightweight counters for the super-admin overview widget. Each metric is
// fetched independently so a missing table never fails the whole summary.

router.get('/summary', voiceTokenLimiter, authenticate, requireAdminOrSuperAdmin, async (req, res) => {
  const safeCount = async (sql, params) => {
    try {
      const result = await db.query(sql, params);
      return Number(result.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  };

  const data = {
    callsToday: await safeCount(
      `SELECT COUNT(DISTINCT call_sid) AS count
       FROM voice_call_events
       WHERE created_at >= CURRENT_DATE`
    ),
    openEscalations: await safeCount(
      `SELECT COUNT(*) AS count
       FROM support_tickets
       WHERE escalation_status IN ('escalated', 'acknowledged', 'action_required')`
    ),
    callbackRequests: await safeCount(
      `SELECT COUNT(*) AS count FROM voice_callback_requests`
    ),
  };

  res.json({ success: true, data });
});
// â”€â”€ GET /voice/call-log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only call history for the Voice Operations panel. One row per call leg
// (the LATEST recorded state), newest first, with duration and the recording
// URL when available.

router.get('/call-log', voiceTokenLimiter, authenticate, requireVoiceRead, async (req, res) => {
  try {
    const scopeClause = buildScopeClause(req.voiceScope, 'latest');
    const where = scopeClause.clause ? `WHERE TRUE ${scopeClause.clause}` : '';
    const result = await db.query(
      `SELECT call_sid, direction, source, status,
              from_number, to_number, duration_sec, recording_url,
              jurisdiction_state, jurisdiction_lga, jurisdiction_source, created_at
       FROM (
         SELECT DISTINCT ON (call_sid)
                call_sid, direction, source, status,
                from_number, to_number, duration_sec, recording_url,
                jurisdiction_state, jurisdiction_lga, jurisdiction_source, created_at
         FROM voice_call_events
         ORDER BY call_sid, created_at DESC
       ) latest
       ${where}
       ORDER BY created_at DESC
       LIMIT 100`,
      scopeClause.params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Voice call log failed:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load the call log.' });
  }
});

// â”€â”€ POST /voice/recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const jurisdiction = await existingJurisdictionFor(payload.callSid);
    await db.query(
      `INSERT INTO voice_call_events
         (call_sid, parent_call_sid, direction, source, status, from_number, to_number, duration_sec,
          jurisdiction_state, jurisdiction_lga, jurisdiction_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (call_sid, status) DO UPDATE SET
         parent_call_sid = EXCLUDED.parent_call_sid,
         duration_sec = EXCLUDED.duration_sec,
         from_number = EXCLUDED.from_number,
         to_number = EXCLUDED.to_number,
         source = EXCLUDED.source,
         jurisdiction_state = COALESCE(EXCLUDED.jurisdiction_state, voice_call_events.jurisdiction_state),
         jurisdiction_lga = COALESCE(EXCLUDED.jurisdiction_lga, voice_call_events.jurisdiction_lga),
         jurisdiction_source = COALESCE(EXCLUDED.jurisdiction_source, voice_call_events.jurisdiction_source)`,
      [
        payload.callSid,
        payload.parentCallSid,
        payload.direction,
        payload.source,
        payload.status,
        payload.fromNumber,
        payload.toNumber,
        payload.durationSec,
        jurisdiction ? jurisdiction.state : null,
        jurisdiction ? jurisdiction.lga : null,
        jurisdiction ? jurisdiction.source : null,
      ]
    );
  } catch (error) {
    // Non-fatal: keep the webhook flow alive; the event is still logged.
    logger.warn('Voice status persistence failed:', error.message, { callSid: payload.callSid });
  }

  res.status(200).json({ success: true });
});

// â”€â”€ GET /voice/departments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only list of escalation departments configured via
// VOICE_ESCALATION_DEPARTMENTS. Targets are deliberately NOT exposed â€” the
// desk only needs names; the backend resolves targets at escalate time.

router.get('/departments', voiceTokenLimiter, authenticate, requireVoiceAgent, (req, res) => {
  res.json({
    success: true,
    data: getEscalationDepartments().map((department) => department.name),
  });
});

// â”€â”€ GET /voice/agent-lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only list of agent identities the desk may register as
// (VOICE_AGENT_IDENTITIES). The desk picks one line before going available.

router.get('/agent-lines', voiceTokenLimiter, authenticate, requireVoiceAgent, (req, res) => {
  res.json({ success: true, data: getAgentIdentities() });
});

// â”€â”€ GET /voice/call-context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only: resolve the caller (number + source) behind the agent's current
// call. Conference legs do not expose caller info to the browser SDK, so the
// desk fetches it here from the 'in-progress'/'queued' rows keyed by the
// agent's call SID.

router.get('/call-context', voiceTokenLimiter, authenticate, requireVoiceAgent, async (req, res) => {
  const agentCallSid = String(req.query.callSid || '').trim();
  if (!agentCallSid) {
    return res.status(400).json({ success: false, message: 'Missing agent call SID.' });
  }

  const context = await getActiveCallContext(agentCallSid);
  if (!context) {
    return res.status(404).json({
      success: false,
      message: 'No active caller is associated with this agent call.',
    });
  }

  res.json({
    success: true,
    data: {
      callerNumber: context.callerNumber,
      source: context.source,
      roomName: context.roomName,
    },
  });
});

// â”€â”€ POST /voice/escalate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Agent-initiated WARM transfer with consultation:
//   action = 'consult'  â†’ the department target is called INTO the caller's
//                         conference room, then held + coached so only the
//                         agent hears them while the caller is parked (hold).
//                         The agent tells the department the story privately.
//   action = 'transfer' â†’ the department and caller are unheld (bridged
//                         three-way); the agent then hangs up on their side.
//
// Lookup: the agent's current room is found via the caller's 'in-progress'
// row (parent_call_sid = agent's conference-leg call SID).

const getActiveCallContext = async (agentCallSid) => {
  let callerLeg = null;
  try {
    const result = await db.query(
      `SELECT call_sid, source, from_number, to_number, created_at
       FROM voice_call_events
       WHERE status = 'in-progress'
         AND parent_call_sid = $1
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(agentCallSid || '').slice(0, 64)]
    );
    callerLeg = result.rows[0] || null;
  } catch {
    callerLeg = null;
  }
  if (!callerLeg) return null;

  // The in-progress row does not carry the caller number (it is stored on the
  // 'queued' row, which survives until the room ends).
  let fromNumber = callerLeg.from_number || null;
  if (!fromNumber) {
    try {
      const queued = await db.query(
        `SELECT from_number
         FROM voice_call_events
         WHERE call_sid = $1 AND status = 'queued'
         LIMIT 1`,
        [callerLeg.call_sid]
      );
      fromNumber = queued.rows[0]?.from_number || null;
    } catch {
      fromNumber = null;
    }
  }

  return {
    callerCallSid: callerLeg.call_sid,
    roomName: callerLeg.to_number,
    callerNumber: fromNumber,
    source: ['local_termii', 'international_twilio', 'toll_free', 'unknown'].includes(callerLeg.source)
      ? callerLeg.source
      : 'unknown',
  };
};

const findConferenceForRoom = async (roomName) => {
  const conferences = await getTwilioRestClient().conferences.list({
    friendlyName: roomName,
    status: 'in-progress',
  });
  return conferences[0] || null;
};

const getConferenceParticipantByCallSid = async (conferenceSid, callSid) => {
  if (!callSid) return null;
  const participants = await getTwilioRestClient()
    .conferences(conferenceSid)
    .participants.list();
  return participants.find((p) => p.callSid === callSid) || null;
};

router.post('/escalate', voiceTokenLimiter, authenticate, requireVoiceAgent, async (req, res) => {
  const action = String(req.body?.action || '').trim();
  if (!['consult', 'transfer', 'cancel-consult', 'relate'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Escalation action must be "consult", "transfer", "cancel-consult" or "relate".',
    });
  }

  const agentCallSid = String(req.body?.callSid || '').trim();
  if (!agentCallSid) {
    return res.status(400).json({ success: false, message: 'Missing agent call SID.' });
  }

  // The caller's in-progress row links the agent's leg to the conference room.
  const context = await getActiveCallContext(agentCallSid);
  if (!context) {
    return res.status(404).json({
      success: false,
      message: 'No active caller is associated with this agent call.',
    });
  }

  // Phase 4 ownership enforcement: lower tiers may only escalate callers
  // inside their own tier/area.
  if (!(await agentMayActOnCall(req, context.callerCallSid))) {
    return res.status(403).json({
      success: false,
      message: 'This call is outside your support area.',
    });
  }

  // Phase 4 relate-to-Super-Admin: top of the ladder — super support flags an
  // unresolved call for the platform Super Admin. No conference action needed.
  if (action === 'relate') {
    const role = req.user.user_type;
    if (role !== 'super_support_admin' && role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Support can relate a call to the Super Admin.',
      });
    }
    const note = String(req.body?.note || req.body?.handoff_note || '').trim().slice(0, 2000);
    try {
      const result = await db.query(
        `INSERT INTO voice_relate_requests
           (call_sid, caller_number, source, note, related_by)
         VALUES ($1, $2, $3, NULLIF($4, ''), $5)
         RETURNING id`,
        [
          context.callerCallSid || null,
          context.callerNumber ? String(context.callerNumber).slice(0, 32) : null,
          String(context.source || 'unknown').slice(0, 24),
          note || null,
          req.user.id,
        ]
      );
      logger.info('Voice call related to Super Admin', { relateId: result.rows[0]?.id, callSid: context.callerCallSid });
      return res.json({ success: true, data: { relateId: result.rows[0].id } });
    } catch (error) {
      logger.error('Voice relate persistence failed:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to save the relate request.' });
    }
  }


  let conference;
  try {
    conference = await findConferenceForRoom(context.roomName);
  } catch (restError) {
    logger.warn('Voice escalation: conference lookup failed', { roomName: context.roomName, message: restError.message });
    return res.status(502).json({ success: false, message: 'The call conference could not be found.' });
  }
  if (!conference) {
    return res.status(409).json({ success: false, message: 'This call is no longer active.' });
  }

  let callerParticipant = null;
  let agentParticipant = null;
  try {
    [callerParticipant, agentParticipant] = await Promise.all([
      getConferenceParticipantByCallSid(conference.sid, context.callerCallSid),
      getConferenceParticipantByCallSid(conference.sid, agentCallSid),
    ]);
  } catch {
    callerParticipant = null;
    agentParticipant = null;
  }

  if (!callerParticipant || !agentParticipant) {
    return res.status(409).json({
      success: false,
      message: 'The caller or agent is no longer on this call.',
    });
  }

  const rest = getTwilioRestClient();
  const conferenceResource = rest.conferences(conference.sid);

  if (action === 'cancel-consult') {
    // End a ringing/consulting department leg and un-park the caller so the
    // agent and caller are simply reconnected.
    try {
      const participants = await conferenceResource.participants.list();
      const departmentParticipant = participants.find(
        (p) => p.callSid !== agentCallSid && p.callSid !== context.callerCallSid && p.callSid
      );
      if (departmentParticipant) {
        await conferenceResource.participants(departmentParticipant.sid).remove();
      }
    } catch (cancelError) {
      logger.warn('Voice cancel-consult: removing department leg failed', { message: cancelError.message });
    }
    try {
      await conferenceResource.participants(callerParticipant.sid).update({ hold: false });
    } catch (unholdError) {
      logger.warn('Voice cancel-consult: un-holding caller failed', { message: unholdError.message });
    }

    logger.info('Consultation cancelled', {
      callerCallSid: context.callerCallSid,
      agentCallSid,
    });
    return res.json({ success: true });
  }

  if (action === 'consult') {
    const department = findDepartment(req.body?.department);
    if (!department) {
      return res.status(400).json({ success: false, message: 'Unknown escalation department.' });
    }

    // Park the caller (hold music from the conference waitUrl) so the
    // consultation is private.
    try {
      await conferenceResource.participants(callerParticipant.sid).update({ hold: true });
    } catch (holdError) {
      logger.warn('Voice consult: could not hold caller', { message: holdError.message });
    }

    // Call the department INTO the same room.
    const consultTwiml = new twilio.twiml.VoiceResponse();
    const consultDial = consultTwiml.dial({ timeout: 30, ...DIAL_STATUS_CALLBACK(context.source) });
    consultDial.conference(
      { startConferenceOnEnter: true, endConferenceOnExit: false },
      context.roomName
    );
    const departmentIsClient = department.target.startsWith('client:');
    const consultCall = await rest.calls.create({
      to: departmentIsClient ? `client:${department.target.slice('client:'.length)}` : department.target,
      from: departmentIsClient
        ? `client:${AGENT_IDENTITY}`
        : (process.env.OUTBOUND_CALLER_ID || process.env.NIGERIA_NUMBER || '').trim(),
      twiml: consultTwiml.toString(),
    });

    // Wait (briefly) for the department to answer and join, then coach them
    // to the agent only.
    let departmentParticipant = null;
    for (let attempt = 0; attempt < 15 && !departmentParticipant; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const participants = await conferenceResource.participants.list();
        departmentParticipant = participants.find(
          (p) => p.callSid === consultCall.sid
        ) || null;
      } catch {
        break;
      }
    }
    if (departmentParticipant) {
      try {
        await conferenceResource.participants(departmentParticipant.sid).update({
          coach: agentParticipant.sid,
          hold: true,
        });
      } catch (coachError) {
        logger.warn('Voice consult: could not coach department participant', { message: coachError.message });
      }
    }

    logger.info('Call consultation started', {
      callerCallSid: context.callerCallSid,
      agentCallSid,
      department: department.name,
      departmentJoined: Boolean(departmentParticipant),
    });

    try {
      await db.query(
        `INSERT INTO voice_call_escalations (call_sid, agent_call_sid, department, escalated_by)
         VALUES ($1, $2, $3, $4)`,
        [context.callerCallSid, agentCallSid, department.name, req.user?.id || null]
      );
    } catch {
      // Audit write is best-effort.
    }

    return res.json({
      success: true,
      data: { connected: Boolean(departmentParticipant) },
    });
  }

  // action === 'transfer': bridge the department with the caller (unhold
  // both, drop the coaching) â€” the agent then leaves on their side.
  const participants = await conferenceResource.participants.list();
  const departmentParticipant = participants.find(
    (p) => p.callSid !== agentCallSid && p.callSid !== context.callerCallSid && p.callSid
  );
  if (!departmentParticipant) {
    return res.status(409).json({
      success: false,
      message: 'The department is not on the call yet. Start a consultation first.',
    });
  }

  try {
    await conferenceResource.participants(departmentParticipant.sid).update({
      coach: null,
      hold: false,
    });
    await conferenceResource.participants(callerParticipant.sid).update({ hold: false });
  } catch (bridgeError) {
    logger.warn('Voice transfer: bridging participants failed', { message: bridgeError.message });
    return res.status(502).json({
      success: false,
      message: 'The call could not be transferred right now. Please try again.',
    });
  }

  logger.info('Call transferred to department (warm)', {
    callerCallSid: context.callerCallSid,
    agentCallSid,
    department: departmentParticipant ? 'department participant' : 'unknown',
  });

  // Raise the complaint through the platform's department-escalation loop:
  // a ticket lands with the department's admin roles and on the Super Support
  // dashboard (with the call recording attached) for rectification.
  // Best-effort â€” never fails the transfer.
  try {
    const supportRoutes = require('./support');

    let ticketDepartment = null;
    try {
      const escalationRow = await db.query(
        `SELECT department
         FROM voice_call_escalations
         WHERE call_sid = $1 AND agent_call_sid = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [context.callerCallSid, agentCallSid]
      );
      ticketDepartment = escalationRow.rows[0]?.department || null;
    } catch {
      ticketDepartment = null;
    }

    let recordingUrl = null;
    try {
      const recordingRow = await db.query(
        `SELECT recording_url
         FROM voice_call_events
         WHERE call_sid = $1 AND recording_url IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [context.callerCallSid]
      );
      recordingUrl = recordingRow.rows[0]?.recording_url || null;
    } catch {
      recordingUrl = null;
    }

    const ticket = ticketDepartment
      ? await supportRoutes.createVoiceEscalatedTicket({
          department: ticketDepartment,
          callerNumber: context.callerNumber || '',
          source: context.source,
          note: String(req.body?.note || ''),
          callSid: context.callerCallSid,
          recordingUrl: recordingUrl || '',
          actor: req.user,
        })
      : null;

    if (ticket?.id) {
      try {
        await db.query(
          `UPDATE voice_call_escalations
           SET ticket_id = $1
           WHERE call_sid = $2 AND agent_call_sid = $3
             AND ticket_id IS NULL`,
          [ticket.id, context.callerCallSid, agentCallSid]
        );
      } catch {
        // Link update is best-effort.
      }
    }
  } catch (ticketError) {
    logger.warn('Voice transfer ticket creation failed (non-fatal):', ticketError.message, {
      callerCallSid: context.callerCallSid,
    });
  }

  return res.json({ success: true });
});

// â”€â”€ GET /voice/consult-status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only: has the consulted department actually joined the caller's room?
// The Voice Desk polls this while a consult is "ringing" so it can enable
// "Transfer now" the moment the department answers (even after the initial
// consult request has returned).

router.get('/consult-status', voiceTokenLimiter, authenticate, requireVoiceAgent, async (req, res) => {
  const agentCallSid = String(req.query.callSid || '').trim();
  if (!agentCallSid) {
    return res.status(400).json({ success: false, message: 'Missing agent call SID.' });
  }
  const context = await getActiveCallContext(agentCallSid);
  if (!context) {
    return res.json({ success: true, data: { connected: false } });
  }
  let connected = false;
  try {
    const conference = await findConferenceForRoom(context.roomName);
    if (conference) {
      const participants = await getTwilioRestClient().conferences(conference.sid).participants.list();
      connected = participants.some(
        (p) => p.callSid && p.callSid !== agentCallSid && p.callSid !== context.callerCallSid
      );
    }
  } catch {
    connected = false;
  }
  return res.json({ success: true, data: { connected } });
});

// â”€â”€ GET /voice/duty-status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin-only: per-agent on-duty indicator. An agent is:
//   offline â€” not in any conference,
//   on_duty â€” parked in the shared waiting room,
//   on_call â€” inside a caller's support room.
// Used by the Voice Ops panel to show who is covering the line.

router.get('/duty-status', voiceTokenLimiter, authenticate, requireVoiceAgent, async (req, res) => {
  const lines = getAgentIdentities();
  const states = Object.fromEntries(lines.map((identity) => [identity, 'offline']));
  try {
    const rest = getTwilioRestClient();
    const conferences = await rest.conferences.list({ status: 'in-progress' });
    for (const conference of conferences) {
      const participants = await rest.conferences(conference.sid).participants.list();
      for (const participant of participants) {
        const identity = await resolveClientIdentityFromCall(participant.callSid);
        if (!identity || !(identity in states)) continue;
        if (isSupportRoom(conference.friendlyName)) {
          states[identity] = 'on_call';
        } else if (conference.friendlyName === AGENTS_WAITING_ROOM && states[identity] !== 'on_call') {
          states[identity] = 'on_duty';
        }
      }
    }
  } catch {
    // Best-effort â€” treat everyone as offline on API failure.
  }
  res.json({
    success: true,
    data: lines.map((identity) => ({ identity, state: states[identity] })),
  });
});

// â”€â”€ GET /voice/token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Issues a short-lived Twilio Access Token (TTL 3600s) for the chosen agent
// identity. `?line=<identity>` selects the agent line (validated against
// VOICE_AGENT_IDENTITIES; defaults to the first). The browser Voice SDK uses
// it to register a Device. Only admins/super-admins may mint tokens; only one
// browser should normally hold a given identity registered at a time.

// ── GET /voice/desk-scope ────────────────────────────────────────────────────
// Phase 3: tells the logged-in agent's Voice Desk which queue line to staff.
// Geo OFF => everyone staffs the legacy national line. Geo ON => state/LGA
// support staff their assigned tier line (falls back to super when their area
// is unassigned).

// Super-tier only read/action guard (relates are internal to super admin/support).
const requireSuperVoiceRead = (req, res, next) => {
  if (!req.user || !['super_admin', 'super_support_admin'].includes(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Your role cannot view super-support relates.' });
  }
  next();
};

// ── GET /voice/relates ───────────────────────────────────────────────────────
// Phase 4: relate requests flagged by Super Support for the platform Super
// Admin (open first, newest first).

router.get('/relates', voiceTokenLimiter, authenticate, requireSuperVoiceRead, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, call_sid, caller_number, source, note, status, related_by,
              handled_by, created_at, handled_at
       FROM voice_relate_requests
       ORDER BY (status = 'open') DESC, created_at DESC
       LIMIT 50`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Voice relates list failed:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load relate requests.' });
  }
});

// ── PATCH /voice/relates/:id/handle ──────────────────────────────────────────
// Phase 4: the Super Admin marks a relate handled.

router.patch('/relates/:id/handle', voiceTokenLimiter, authenticate, requireSuperVoiceRead, async (req, res) => {
  const relateId = Number(req.params.id);
  if (!Number.isInteger(relateId) || relateId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid relate id.' });
  }
  try {
    const result = await db.query(
      `UPDATE voice_relate_requests
       SET status = 'handled', handled_by = $2, handled_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'open'
       RETURNING id`,
      [relateId, req.user.id]
    );
    if (!result.rowCount) {
      return res.status(409).json({ success: false, message: 'Relate not found or already handled.' });
    }
    return res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    logger.error('Voice relate handle failed:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update the relate request.' });
  }
});

// Agent scope from the logged-in user (Phase 4 ownership). Mirror of the LGA/
// state tiers; general admins and support tiers map onto super/state/lga.
const resolveAgentScopeForUser = (user) => {
  const role = user && user.user_type;
  const state = String(user?.assigned_state || '').trim();
  const lga = String(user?.assigned_lga || user?.assigned_city || '').trim();
  if (role === 'state_support_admin' || role === 'state_admin') {
    if (state) return { level: 'state', state, lga: null };
  } else if (role === 'lga_support_admin' || role === 'lga_admin') {
    if (state && lga) return { level: 'lga', state, lga };
  }
  return { level: 'super', state: null, lga: null };
};

// Ownership enforcement: with geo routing ON a lower-tier agent may only act
// on callers inside their own tier/area. Geo OFF keeps today's single-queue
// behaviour (everyone staffs super).
const agentMayActOnCall = async (req, callerCallSid) => {
  const geoOn = await isVoiceGeoRoutingEnabled();
  if (!geoOn) return true;
  const scope = resolveAgentScopeForUser(req.user);
  if (scope.level === 'super') return true;
  const jurisdiction = await existingJurisdictionFor(callerCallSid);
  return canAgentHandleJurisdiction(scope, jurisdiction);
};

router.get('/desk-scope', voiceTokenLimiter, authenticate, requireVoiceAgent, async (req, res) => {
  try {
    const geoOn = await isVoiceGeoRoutingEnabled();
    const scope = geoOn ? resolveAgentScopeForUser(req.user) : { level: 'super', state: null, lga: null };
    const queue =
      scope.level === 'lga'
        ? `queue:lga:${scope.state}:${scope.lga}`
        : scope.level === 'state'
          ? `queue:state:${scope.state}`
          : `queue:${getQueueConfig().name}`;
    const waitingRoom = waitingRoomForScope(scope, AGENTS_WAITING_ROOM);
    return res.json({ success: true, data: { geo_enabled: geoOn, scope, queue, waiting_room: waitingRoom } });
  } catch (error) {
    logger.error('Voice desk-scope failed:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve your voice desk scope.' });
  }
});

// ── GET /voice/token ─────────────────────────────────────────────────────────

router.get('/token', voiceTokenLimiter, authenticate, requireVoiceAgent, (req, res) => {
  const status = getVoiceConfigStatus();
  if (!status.ready) {
    logger.error('Voice token request blocked: incomplete Twilio configuration');
    return res.status(503).json({
      success: false,
      message: 'Voice service is not configured. Please contact the administrator.',
    });
  }

  const requestedLine = String(req.query.line || req.query.agent || '').trim();
  if (requestedLine && !isValidAgentLine(requestedLine)) {
    return res.status(400).json({
      success: false,
      message: 'Unknown agent line. Check VOICE_AGENT_IDENTITIES.',
    });
  }
  const identity = requestedLine || AGENT_IDENTITY;

  try {
    const accessToken = new twilio.jwt.AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { ttl: 3600, identity }
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

// Test-only exports â€” same convention as routes/support.js (_supportScopeForTest).
module.exports._voiceScopeForTest = {
  classifyCallSource,
  sanitizeCallerNumber,
  getVoiceConfigStatus,
  isSupportHoursActive,
  normalizeCallbackNumber,
  getEscalationDepartments,
  findDepartment,
  pickAd,
  getAgentIdentities,
  isValidAgentLine,
  E164_PATTERN,
  VOICE_STATUSES,
};







