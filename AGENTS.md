# AGENTS.md — Working Rules for AI Agents

RentalHub NG: Express backend (CommonJS, `server.js`) + React client (CRA)
in `client/`. This repo is actively worked on by multiple sessions at once —
treat the git history as shared and never run destructive git commands
(`git reset --hard`, force pushes) unless explicitly asked.

## Commands

- Backend tests: `npm test` (node --test runner; do NOT break the suite)
- Syntax check a file: `node --check <file>`
- Client build: `cd client && node --max-old-space-size=1800 node_modules/react-scripts/scripts/build.js`
- Client tests: `cd client && npx react-scripts test --watchAll=false --ci`
- Migrations: `npm run migrate` / `npm run migrate:dry-run`
- Migration files must have unique numeric prefixes (others add migrations
  concurrently — re-check `migrations/` before adding one)

## Voice system — read this first

**The one rule that must never be broken** (full file: `docs/voice-system-rules.md`):

> In `VOICE_ESCALATION_DEPARTMENTS` use the **platform department names**:
> `finance`, `legal`, `technical`, `transportation`, `fumigation`. A made-up
> name will still ring, but **no complaint slip (ticket) is created** for the
> department admins or the Super Support dashboard.

Other critical constraints:
- `TWILIO_WEBHOOK_BASE_URL` must exactly match the public URL Twilio calls
  (in production the signature check never trusts the Host header).
- TwiML App Voice URL = `/voice/outgoing`; Twilio number webhook =
  `/voice/incoming`. Swapped = outbound legs replay the IVR (rejected).
- Keep CSP `script-src` free of `'unsafe-inline'`/`'unsafe-eval'` (meta CSP
  in `client/public/index.html` + helmet CSP in `server.js`).
- Run `npm run migrate` after pulling (voice tables: migrations 126, 127,
  128, 130, 131, 140).
- Voice webhook code lives in `routes/voice.js`; the department-ticket bridge
  is `createVoiceEscalatedTicket` in `routes/support.js`; the agent console
  is `client/src/components/admin/SupportVoiceDesk.jsx` (+
  `client/src/hooks/useTwilioVoice.js`, `client/src/services/voiceApi.js`,
  shared labels in `client/src/components/admin/voiceMeta.js`); the super
  admin history panel is `client/src/components/admin/VoiceOperationsPanel.jsx`
  (call log via `GET /voice/call-log`, callbacks via `GET /voice/callbacks`).

## Docs map

- `docs/twilio-voice-deployment.md` — full deploy + configuration guide
- `docs/voice-system-rules.md` — the rules above (maintain this file)
- `docs/voice-system-backlog.md` — outstanding work + known gaps

## Style

CommonJS, matching existing files. No comments unless they clarify security
or Twilio behaviour. Don't touch unrelated in-progress files. After changes,
run `node --check` + the relevant test file, then the full suite.
