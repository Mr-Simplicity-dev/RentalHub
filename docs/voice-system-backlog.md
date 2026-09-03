# Voice System Backlog — Outstanding Work

Status: warm transfers + Voice Ops + department-ticket bridge + super-admin
access + known-limitation fixes are done. What remains is deployment and the
two documented integration points below.

## Deployment (to do — you)

- [ ] **Add Twilio env vars to the server `.env`** (`/var/www/rentalhub/.env`):
      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET,
      TWILIO_TWIML_APP_SID, NIGERIA_NUMBER, INTL_NUMBER, SALES_BACKUP_NUMBER,
      TWILIO_WEBHOOK_BASE_URL=https://rentalhub.com.ng, plus optional
      TOLL_FREE_NUMBER, VOICE_QUEUE_NAME, VOICE_ADS_ENABLED,
      VOICE_ESCALATION_DEPARTMENTS (platform dept names only), VOICE_HOLD_MUSIC_URL,
      VOICE_SUPPORT_HOURS_*, VOICE_RECORD_CALLS, VOICE_AGENT_IDENTITIES.
      Then `pm2 restart rentalhub`.
- [ ] **Provision Twilio**: Standard API Key + Secret; TwiML App (Voice URL =
      https://rentalhub.com.ng/voice/outgoing); buy/point numbers (webhook =
      /voice/incoming); configure the Termii SIP trunk.
- [ ] **Verify live end-to-end**: Termii -> Twilio -> IVR -> conference room ->
      agent dispatch -> consult -> transfer -> department ticket.
- [ ] Redeploy latest code when ready: `git pull`, `npm run migrate`,
      `cd client && npm run build`, `pm2 restart rentalhub`.

## Integration points (known gaps)

- [ ] **Multi-agent hardening** — dispatch now moves the longest-parked agent
      and the desk supports per-line tokens; still missing ring-all/skills
      routing and agent idle/status dashboards.
- [ ] **Consult edge cases** — department no-answer keeps "Transfer now"
      disabled until they join (Cancel consultation is provided); no automatic
      retry loop.


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
- [x] **Complaint -> department -> super-admin loop** — every completed
  transfer raises a support ticket already escalated to the department
  (`routes/support.js` `createVoiceEscalatedTicket`; migration 140 links
  `voice_call_escalations.ticket_id`): caller number/source, call SID,
  recording URL and the agent's problem note ride along; department admin
  roles get notified and act in their dashboards; the Super Support dashboard
  lists every escalation for supervision/rectification. Voice department
  names must be platform departments (finance/legal/technical/transportation/
  fumigation).
- [x] **Voice Operations panel (super admin)** — new "Voice Ops" tab
  (`VoiceOperationsPanel.jsx`): call log (per-leg history with inline audio
  player for recordings via `GET /voice/call-log`) and callback requests with
  tap-to-call links. Shared source-badge labels live in `voiceMeta.js`.
- [x] Tests: 37 voice tests; full suite 153/153.

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

---

# 2026-09 REFERENCE — geographic (geo) toll-free escalation — OWNER SPEC v2

Append-only reference so a future session can resume. Re-read this whole block
before touching voice. Code map: `routes/voice.js`, `routes/support.js`
(`createVoiceEscalatedTicket`), `SupportVoiceDesk.jsx`, `useTwilioVoice.js`,
`voiceApi.js`, the Support/SuperAdmin dashboards, `docs/twilio-voice-deployment.md`.

## The ladder the owner wants (their numbered clarifications, Sept 2026)

1. A call made from inside an LGA area is served by that LGA's support team —
   "anyone in Gwagwalada (incl. Zuba, Dobi...) is Gwagwalada's call".
2. If that LGA has several support admins on duty, the NEXT AVAILABLE one picks
   up — there is no single pre-assigned officer per call.
3. If the LGA team cannot fix it, the call goes UP to the ZONE (state/zonal)
   that manages ALL the LGAs in that state; then to the central SUPER-SUPPORT
   "zone" that manages all 37 states / all 774 LGAs; only if even that cannot
   fix it does it reach the platform SUPER ADMIN.
4. A state/zonal support admin manages MULTIPLE LGAs — effectively all LGAs
   under that one state.
5. The functional "super" admins (super finance, super transport, super
   legal/lawyer, fumigation, etc.) own their own department issues, and when
   THEY cannot resolve something they escalate to the platform SUPER ADMIN.

Two escalation axes, both terminating at the platform super admin:
- Geographic: caller's LGA team -> state/zonal team -> central super-support
  zone -> super admin.
- Functional/department: issue handled by the matching department's super admin
  -> super admin.

## Truth in the code TODAY (do not re-litigate these as new bugs)

- The toll-free line is ONE national queue staffed ONLY by super-support agents
  (`VOICE_AGENT_IDENTITIES`) from the Super Support Voice Desk.
- LGA/state(zonal) admins have NO voice console; nothing routes a call by the
  caller's LGA; department warm-transfer (consult -> transfer) + complaint-slip
  ticket is the only in-call escalation; the platform super admin only sees a
  read-only Voice summary (`VoiceSupportOverview`).
- Therefore ladder 1-5 is the TARGET and is NOT yet built. The chat-draft plan
  (rooms per jurisdiction, roll-up routing when a tier is not staffed, scoped
  desks for LGA/state, a `consult-up` ownership handoff that does NOT create a
  department complaint slip, a "relate to super admin" ticket, jurisdiction
  scoping of `/voice/call-log` + `/voice/callbacks`, department escalation
  gated to super support) is the agreed direction. Phases + open questions from
  that draft are the starting point.

## Bugs already fixed in this session (so don't treat them as open)

- Voice Desk TDZ on open: `useTwilioVoice.js` had a forward `const`
  (`scheduleQueueReconnect` referenced `connectToQueue` before its declaration).
  Fixed with a ref (`connectToQueueRef`) + effect.
- Voice tab "chunk 1072/3764 TDZ" = stale cached bundle + the above; SupportVoiceDesk
  / VoiceOperationsPanel are lazy-loaded.
- `/api/admin/appeals` 500 — `properties` has no `status` column; derived from
  `is_verified`/`is_available`.
- `/api/admin/diaspora/overview` 404 — router double-prefixed `/diaspora`.
- state-migration `/support/queue` + `/support/audit` 403 for `super_admin` —
  super_admin is now treated as top-tier super support there.
- `/api/property-alerts` 404 in the Super Support overview — now calls
  `/property-alerts/admin/requests`.

## Related (survey, implemented 2026-09) — for future survey work

- Gate semantics final: the "Public Survey Switch & Location/VPN Gate" is now
  ON = survey OPEN but geo-gated; OFF = public survey CLOSED (only marketing
  agents keep field entry). Server enforces at draft/submit too.
- Geo engine: server-side point-in-polygon against `geo/nigeria_lgas.json`
  (774 LGAs, GADM-derived; generated by `scripts/fetchNigeriaLgaBoundaries.js`;
  git-ignored). `POST /api/survey/location-verify`; `/survey/location-config`
  returns `boundary_available`. Google name-check is only a fallback.
- Admin Location Rules: search across all 774 LGAs, paginated list (25/page),
  per-LGA Enable/Disable (rows kept) + Remove, "Enable all 774" /
  "Disable all (list kept)" that persist immediately. Legacy rows = enabled.
- Public page: fail-closed when the gate errors; block/closed screens out-rank
  the wizard/draft view; in-tab `watchPosition` auto-admits a blocked
  respondent who moves back into an enabled area.
- Web-push canNOT geofence in the background (browser limitation). Re-entry
  push is only possible while the tab is open, or by "remind me to finish
  later" -> reopen inside the area. Do not promise background geofencing.

