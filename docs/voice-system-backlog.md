# Voice System Backlog — Outstanding Work

Status: warm transfers (consult -> transfer on conference rooms) are live.
Only deployment (below) and the caller-identity limitation remain.

## Queue / hold / ads / escalation — complete

- [x] **Conference-room call path** — support calls run inside Twilio
  conferences: callers park in their own room (hold loop = announcement ->
  ad -> music via `/voice/wait`); agents are dispatched into rooms (direct
  join when dialing the queue with a caller waiting, or auto-dispatch via
  REST participants.create when a caller arrives while the agent is parked in
  the waiting room); `/voice/conference-events` drives lifecycle +
  queued->in-progress marking; `/voice/status` + recording attach to the
  agent dial legs.
- [x] **Hold experience** — conference waitUrl loop with DB-backed audio ads
  (ad-spaces DB, placement voice_hold, impression dedupe) and
  `VOICE_HOLD_MUSIC_URL`. Callback requests moved to the main IVR (press 3)
  because DTMF is not available in conference hold music.
- [x] **Warm transfer (consult -> transfer)** — the department is called INTO
  the caller's room (REST calls.create), held + coached so only the agent
  hears them while the caller is parked; `transfer` unholds both (three-way)
  and the agent hangs up. Audited in `voice_call_escalations`. Cold-transfer
  code removed.
- [x] Tests: 36 voice tests; full suite 143/143.

## Integration points (known gaps)

- [ ] **Caller identity on conference legs** — the browser SDK does not expose
  caller parameters on conference legs; the desk shows "Support call". Use
  `voice_call_events` for caller-level reporting.
- [ ] **Multi-agent dispatch** — dispatch assumes the single
  `support_agent_1` identity; per-agent identities need a skills/assignment
  layer.

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
  offer retry-the-agent-once or sales (`/voice/dial-fallback` ->
  `/voice/fallback-choice` -> bounded `/voice/dial-fallback-final`).
- [x] **Rate limiter on `GET /voice/token`** — `voiceTokenLimiter`
  (10 min / 30 tokens, env-tunable) in `config/middleware/securityRateLimiters`.
- [x] **Committed tests** — `tests/voice.test.js` (36 tests: signature gate,
  IVR TwiML, conference flow, fallback flow, outbound, E.164 config, token
  401, status tolerance, toll-free, after-hours, callbacks, recording,
  escalation parsing, unit tests).
- [x] **E.164 validation at config load** — all phone-number vars must match
  `^\+[1-9][0-9]{7,14}$`; problems reported by variable NAME only, config
  treated as not-ready (503).
- [x] **Include `CallSid` in webhook logs** — every log line carries
  `callSid`/`source` correlation metadata.

## Toll-free specifics (complete)

- [x] **Dedicated `TOLL_FREE_NUMBER`** — optional E.164 env var; calls to it
  classify as `toll_free`, logged `Incoming toll-free call`, documented.
- [x] **After-hours / holiday handling** — `VOICE_SUPPORT_HOURS_START/END`
  (24h HH:MM), `VOICE_SUPPORT_TIMEZONE` (default Africa/Lagos),
  `VOICE_HOLIDAY_DAYS` (MM-DD). Outside the window: after-hours IVR with
  press-3 callback; DTMF number -> `voice_callback_requests` (migration 127),
  reviewed via admin `GET /voice/callbacks`.
- [x] **Call recording** — opt-in `VOICE_RECORD_CALLS=true`; records from
  answer (`record-from-answer`), plays consent before dialing, back-fills
  `voice_call_events.recording_url` via `/voice/recording` (migration 128).

## Deployment (manual — you)

- [ ] Provision Twilio account, Standard API Key, TwiML App, numbers, Termii
  SIP trunk; populate `.env` from `.env.voice.example`.
- [ ] Confirm nginx proxies `/voice/` to the backend (location block added to
  `deploy/nginx.conf`; verify on the live server).
- [ ] End-to-end call test: Termii SIP -> Twilio -> IVR -> conference room ->
  agent dispatch -> consult -> transfer.

## Client (complete)

- [x] Voice Desk agent console (`voiceApi.js`, `useTwilioVoice.js`, `SupportVoiceDesk.jsx`, dashboard tab)
- [x] Call-origin awareness + toll-free badge (direct client dials)
- [x] Warm-transfer UI: Consult department -> Transfer now
- [x] Auto-answer dispatch calls; auto re-join the line after each call
