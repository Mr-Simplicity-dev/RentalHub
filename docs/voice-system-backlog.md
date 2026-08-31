# Voice System Backlog — Outstanding Work

Status: items 1–10 plus the queue/hold/ad-slot experience are complete. Only
deployment (11–13) and the two documented integration points below remain.

## Queue / hold / ads — just landed

- [x] **Real call queue** — support callers are `<Enqueue>`d into
  `VOICE_QUEUE_NAME` (default `support`); agents join the line by dialing
  `queue:<name>` through the TwiML App (`/voice/outgoing` serves the
  `<Dial><Queue>` leg); the Voice Desk auto-joins on "Go Available" and
  re-joins after each call.
- [x] **Hold experience** — `/voice/wait` loop: busy announcement →
  5s "press 1 for callback" DTMF window → optional ad slot → optional hold
  music (`VOICE_HOLD_MUSIC_URL`); `/voice/agent-wait` for the agent side;
  `/voice/enqueue-done` action closes the caller leg politely.
- [x] **Ad slots on hold** — `VOICE_ADS_ENABLED=true` + `VOICE_AD_AUDIO_URLS`
  (HTTPS audio); one ad per loop, picked deterministically per caller.
- [x] Tests: 34 voice tests; full suite 141/141.

## Integration points (known gaps)

- [ ] **Audio ads via the platform ad-spaces engine** — the current ad slot is
  config-driven (`VOICE_AD_AUDIO_URLS`); wire it to the ads DB (audio asset
  type + impression/click attribution) with a TODO marker in `/voice/wait`.
- [ ] **Caller identity for queue-bridged calls** — the browser SDK does not
  expose caller parameters on the queue leg; the desk shows "Support queue
  line". Use `voice_call_events` (status webhook) for caller-level reporting,
  or persist queue-join time to correlate.

## Backend (complete)

- [x] **Outbound-call handler** — `POST /voice/outgoing` TwiML endpoint
  (validates E.164 destination, sets `callerId` from `OUTBOUND_CALLER_ID` /
  `NIGERIA_NUMBER`, terminal fallback on failure; `queue:<name>` joins the
  support queue line). TwiML App Voice URL must be configured to
  `/voice/outgoing`; misrouted `client:` legs hitting `/voice/incoming` are
  rejected with `<Reject/>`.
- [x] **`POST /voice/status` call-status webhook** — Dial status callbacks
  (initiated/ringing/answered/completed + DialCallStatus) persisted to
  `voice_call_events` (migration 126), deduplicated by `(call_sid, status)`,
  DB failures non-fatal.
- [x] **No-answer / busy fallback** — `DialCallStatus` driven recovery IVR:
  offer retry-the-agent-once or sales (`/voice/dial-fallback` →
  `/voice/fallback-choice` → bounded `/voice/dial-fallback-final`).
- [x] **Rate limiter on `GET /voice/token`** — `voiceTokenLimiter`
  (10 min / 30 tokens, env-tunable) in `config/middleware/securityRateLimiters`.
- [x] **Committed tests** — `tests/voice.test.js` (34 tests: signature gate,
  IVR TwiML, queue/wait/ads, fallback flow, outbound, E.164 config, token 401,
  status tolerance, toll-free, after-hours, callbacks, recording, unit tests).
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

## Deployment (manual — you)

- [ ] Provision Twilio account, Standard API Key, TwiML App, numbers, Termii
  SIP trunk; populate `.env` from `.env.voice.example`.
- [ ] Confirm nginx proxies `/voice/` to the backend (location block added to
  `deploy/nginx.conf`; verify on the live server).
- [ ] After the Voice Desk lands: verify end-to-end call (Termii SIP → Twilio
  → IVR → queue → agent browser Device).

## Client

- [x] Voice Desk agent console (`voiceApi.js`, `useTwilioVoice.js`, `SupportVoiceDesk.jsx`, dashboard tab)
- [x] Call-origin awareness (`call_source`/`caller_number`/`call_sid` Client parameters + source badges)
