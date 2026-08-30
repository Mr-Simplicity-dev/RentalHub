# Voice System Backlog — Outstanding Work

Status: items 1–10 are complete (1–7 from the previous round; 8–10 — toll-free
classification, after-hours/holiday handling with DTMF callbacks, and
opt-in call recording — just landed). Only deployment remains.

## Backend gaps

- [x] **Outbound-call handler** — `POST /voice/outgoing` TwiML endpoint
  (validates E.164 destination, sets `callerId` from `OUTBOUND_CALLER_ID` /
  `NIGERIA_NUMBER`, terminal fallback on failure). TwiML App Voice URL must be
  configured to `/voice/outgoing`; misrouted `client:` legs hitting
  `/voice/incoming` are rejected with `<Reject/>`.
- [x] **`POST /voice/status` call-status webhook** — Dial status callbacks
  (initiated/ringing/answered/completed + DialCallStatus) persisted to
  `voice_call_events` (migration 126), deduplicated by `(call_sid, status)`,
  DB failures non-fatal.
- [x] **No-answer / busy fallback** — `DialCallStatus` driven recovery IVR:
  offer retry-the-agent-once or sales (`/voice/dial-fallback` →
  `/voice/fallback-choice` → bounded `/voice/dial-fallback-final`).
- [x] **Rate limiter on `GET /voice/token`** — `voiceTokenLimiter`
  (10 min / 30 tokens, env-tunable) in `config/middleware/securityRateLimiters`.
- [x] **Committed tests** — `tests/voice.test.js` (29 tests: signature gate,
  IVR TwiML, fallback flow, outbound, E.164 config, token 401, status
  tolerance, toll-free, after-hours, callbacks, recording, unit tests).
- [x] **E.164 validation at config load** — all phone-number vars must match
  `^\+[1-9][0-9]{7,14}$`; problems reported by variable NAME only, config
  treated as not-ready (503).
- [x] **Include `CallSid` in webhook logs** — every log line carries
  `callSid`/`source` correlation metadata.

## Toll-free specifics

- [x] **Dedicated `TOLL_FREE_NUMBER`** — optional E.164 env var; calls to it
  classify as `toll_free` (badge "Toll-free call · Nigeria · Toll-free"),
  logged `Incoming toll-free call`, documented (provisioning + Termii parity).
- [x] **After-hours / holiday handling** — `VOICE_SUPPORT_HOURS_START/END`
  (24h HH:MM), `VOICE_SUPPORT_TIMEZONE` (default Africa/Lagos),
  `VOICE_HOLIDAY_DAYS` (MM-DD). Outside the window: after-hours IVR with
  press-3 callback; DTMF number → `voice_callback_requests` (migration 127),
  reviewed via admin `GET /voice/callbacks`. Malformed config degrades to
  always-available with a logged warning.
- [x] **Call recording** — opt-in `VOICE_RECORD_CALLS=true`; records from
  answer (`record-from-answer`), plays consent before dialing, back-fills
  `voice_call_events.recording_url` via `/voice/recording` (migration 128).

## Deployment

- [ ] Provision Twilio account, Standard API Key, TwiML App, numbers, Termii
  SIP trunk; populate `.env` from `.env.voice.example`.
- [ ] Confirm nginx proxies `/voice/` to the backend (location block added to
  `deploy/nginx.conf`; verify on the live server).
- [ ] After the Voice Desk lands: verify end-to-end call (Termii SIP → Twilio
  → IVR → agent browser Device).

## Client

- [x] Voice Desk agent console (`voiceApi.js`, `useTwilioVoice.js`, `SupportVoiceDesk.jsx`, dashboard tab)
- [x] Call-origin awareness (`call_source`/`caller_number`/`call_sid` Client parameters + source badges)
