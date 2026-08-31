# Twilio Dual-Carrier Voice Support — Deployment Guide

This document explains how to deploy the voice support system implemented in
`routes/voice.js`. Two inbound carriers are supported:

- **Nigeria** — inbound calls are forwarded from **Termii SIP** into Twilio.
- **International** — inbound calls arrive directly on a Twilio number.

## 1. Environment variables

Copy `.env.voice.example` values into the production `.env` (on the server):

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
TWILIO_TWIML_APP_SID=AP...
NIGERIA_NUMBER=+2348012345678
INTL_NUMBER=+12025550123
SALES_BACKUP_NUMBER=+2348098765432
TWILIO_WEBHOOK_BASE_URL=https://api.rentalhub.com.ng
NIGERIA_SIP_TRUNK_MATCH=sip:
OUTBOUND_CALLER_ID=           # optional; defaults to NIGERIA_NUMBER
```

All phone numbers must be **E.164**. The voice router refuses to serve
requests (HTTP 503) until the required variables are present **and** every
phone-number variable is a valid E.164 value, so a misconfigured deploy fails
loudly instead of dropping calls silently.

## 2. Twilio Console setup

1. **Standard API Key** — Twilio Console → *Account → API keys & tokens →
   Create API key* (type: Standard). Use its SID as `TWILIO_API_KEY` and the
   secret as `TWILIO_API_SECRET`. This key is only used to mint short-lived
   Access Tokens, so grant it the narrowest role available.
2. **TwiML App** — Console → *Voice → TwiML Apps → Create new TwiML App*.
   - **Voice URL**: `https://YOUR_PUBLIC_API_DOMAIN/voice/outgoing` — **POST**.
     This URL serves outbound calls placed from the agent browser.
   - Copy the app SID (starts `AP...`) into `TWILIO_TWIML_APP_SID`.
3. **Twilio number webhook** (for the international number) — *Phone Numbers →
   Manage → Active Numbers* → select the number → **Voice & Fax → A call comes
   in** = Webhook, `https://YOUR_PUBLIC_API_DOMAIN/voice/incoming`, **POST**.

> `TWILIO_WEBHOOK_BASE_URL` must **exactly match** the public HTTPS URL above
> (same host, scheme and path). Twilio signs requests over the full URL, and in
> production the router builds the signature-verification URL exclusively from
> `TWILIO_WEBHOOK_BASE_URL` — it never trusts the request's `Host` header, so a
> mismatch makes signature validation fail and requests are rejected with 403.

> If the TwiML App Voice URL is misconfigured to `/voice/incoming`, outbound
> legs (From=`client:…`) are rejected with `<Reject/>` instead of replaying
> the inbound IVR — check the router logs for
> "outbound leg hit /voice/incoming".

## 3. Termii SIP forwarding (Nigeria carrier)

1. In the Termii dashboard, configure the Nigeria number's SIP forwarding to
   the **Twilio SIP destination** (the SIP trunk/domain Twilio provisions for
   the account; Termii sends the SIP `To` header to that destination).
2. The router classifies an inbound leg as Nigerian when `req.body.To` contains
   `NIGERIA_NUMBER` **or** the `NIGERIA_SIP_TRUNK_MATCH` substring (`sip:` for a
   standard SIP trunk). Adjust the match string if your trunk uses a different
   URI shape, and keep the log lines accurate:
   - `Incoming call from Nigeria via Termii`
   - `Incoming toll-free call` (when `TOLL_FREE_NUMBER` is set and matched)
   - `Incoming International call`

### Toll-free number

If you use a Nigerian toll-free number, set `TOLL_FREE_NUMBER` (E.164). Calls
to it are classified as `toll_free`, shown to agents as "Toll-free call", and
logged with `Incoming toll-free call`. Provisioning is done in the Twilio
console (buy/port the toll-free number and point its webhook at
`/voice/incoming`); Termii parity means the number must be reachable through
the same SIP destination your other Nigeria numbers use.

### Support queue & hold experience

Callers who press **1** are placed in a real Twilio `<Queue>` and hear a
repeating hold loop served by `/voice/wait`:

1. busy announcement (`VOICE_QUEUE_ANNOUNCEMENT`)
2. a 5-second DTMF window — press **1** to leave a callback request
3. an optional audio ad slot (`VOICE_ADS_ENABLED=true` +
   `VOICE_AD_AUDIO_URLS`, comma-separated HTTPS audio URLs; one ad is picked
   deterministically per caller)
4. optional hold music (`VOICE_HOLD_MUSIC_URL`)

Agents join the line from the Voice Desk: after "Go Available" the desk
registers the Device and automatically dials `queue:support` through the
TwiML App (served by `/voice/outgoing` as a `<Dial><Queue>` leg). Queued
callers are bridged automatically; the desk re-joins the line after each
call while the agent stays available. The queue name is configurable via
`VOICE_QUEUE_NAME`.

> The agent-side queue call and the platform's ad-spaces engine are the two
> known integration points for the next iteration: caller identity for
> queue-bridged calls is not exposed to the browser SDK (use
> `voice_call_events` for that), and audio ad slots are config-driven until
> they are wired to the ad engine.

### Ad slots on hold (DB-backed)

With `VOICE_ADS_ENABLED=true`, the hold loop plays audio ads straight from
your **ad-spaces database**: create an ad in the Super Admin → Ad Spaces tab
with media type **Audio** and placement **Voice hold ad (audio)** (upload
MP3/WAV/OGG/OPUS up to 15MB or paste an https URL). Ads respect the
`ads_enabled` feature flag and their start/end schedules; one ad is picked
deterministically per caller and an impression is counted **once per
(ad, call)** via the `voice_ad_impressions` dedupe table (migration 130).
`VOICE_AD_AUDIO_URLS` remains only as a fallback when the DB has no audio ads
or is unreachable.

### Department escalation (agent-initiated)

Configure `VOICE_ESCALATION_DEPARTMENTS` as comma-separated
`name:target` pairs where the target is an **E.164 number** or a **Twilio
Client identity** (`client:legal_1`):

```bash
VOICE_ESCALATION_DEPARTMENTS=finance:+2348012345678,legal:client:legal_1
```

While on a call, the agent picks a department in the Voice Desk and clicks
**Escalate call**. The backend verifies the agent's leg is live, locates the
bridged caller, and cold-transfers the caller to the department target via the
Twilio REST API. Each escalation is audited in `voice_call_escalations`
(migration 131). The agent's leg ends and the desk re-joins the queue line
automatically.

### After-hours & holidays (optional)

Set `VOICE_SUPPORT_HOURS_START` / `VOICE_SUPPORT_HOURS_END` (24h `HH:MM`) and
optionally `VOICE_SUPPORT_TIMEZONE` (default `Africa/Lagos`) and
`VOICE_HOLIDAY_DAYS` (comma-separated `MM-DD`). Outside the window the caller
gets an after-hours message and may press **3** to leave a callback number
(DTMF); requests land in `voice_callback_requests` and are reviewable by
admins at `GET /voice/callbacks`.

### Recording (optional, default off)

Set `VOICE_RECORD_CALLS=true` to record every connected call from answer. A
consent message ("This call may be recorded…") is played before dialing.
Recording URLs are back-filled into `voice_call_events.recording_url` via the
`/voice/recording` webhook. Keep recordings' retention/access policy in line
with your privacy policy before enabling.

## 4. Deploy

```bash
git pull
npm install          # installs the twilio SDK
npm run migrate      # applies ALL pending migrations (126 voice events, 127 callbacks, 128 recording)
pm2 restart rentalhub
```

The `voice_call_events` table (migration 126) stores Dial status-callback
events (initiated/ringing/answered/completed, plus no-answer/busy/failed) for
call analytics. Twilio retries are deduplicated by `(call_sid, status)`; a
database outage never breaks the phone flow (statuses are still logged).

Verify the webhooks respond correctly from the public internet (signature
validation requires a real signed Twilio request, so test with an actual call
or `twilio.cli`):

```bash
curl -s https://YOUR_PUBLIC_API_DOMAIN/voice/incoming -X POST -d "To=+2348012345678" -d "From=+2348000000000"
# Expect: HTTP 403 {"success":false,"message":"Invalid Twilio signature"} (unsigned)
```

## 5. Agent browser client

- The browser fetches `GET /voice/token` with an **authenticated admin or
  super-admin session** (the endpoint is protected by `authenticate` +
  `requireAdminOrSuperAdmin`).
- The response is `{ "token": "..." }` — a Twilio Access Token (TTL **3600s**,
  identity `support_agent_1`) carrying a **VoiceGrant** with
  `incomingAllow: true` and the TwiML App SID for outgoing calls.
- The Voice JS SDK then registers a `Device` with that token:
  `Device = new Twilio.Device(token)` → `device.register()`.
- Callers who press **1** are dialed as `<Client>support_agent_1</Client>` and
  the browser Device receives the call. Callers who press **2** are dialed to
  `SALES_BACKUP_NUMBER` directly.
- If a dial is not answered (no-answer/busy/failed), the caller is offered a
  bounded recovery: press **1** to retry the agent once, or **2** for sales.
  No path can loop indefinitely.
- Agents can also place **outbound calls** from the Voice Desk; those hit the
  TwiML App Voice URL `/voice/outgoing` and show `OUTBOUND_CALLER_ID`
  (default `NIGERIA_NUMBER`) as the caller ID.

> **Only one browser should normally register `support_agent_1`.** If two
> browsers register the same identity at the same time, an incoming
> `<Client>` call is delivered to only one of them (Twilio picks a single
> registered endpoint); the other never rings. Coordinate agent availability,
> or mint per-agent identities and extend the IVR to route accordingly.

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| 503 on `/voice/*` | Required env vars missing or a phone-number var is not E.164 (`TWILIO_*`, `NIGERIA_NUMBER`, `INTL_NUMBER`, `SALES_BACKUP_NUMBER`) |
| 403 "Invalid Twilio signature" | `TWILIO_WEBHOOK_BASE_URL` ≠ the public URL Twilio actually called (or auth token mismatch) |
| Call answered but silence | `<Dial>` is waiting on the other leg — check the browser Device is registered with a fresh token and the agent is online |
| No `Incoming call from Nigeria via Termii` log | `To` header doesn't match `NIGERIA_NUMBER` or `NIGERIA_SIP_TRUNK_MATCH` — check the Termii forwarding destination |
| Outbound call plays the IVR / is rejected | TwiML App Voice URL points at `/voice/incoming` instead of `/voice/outgoing` |
| Status rows missing in `voice_call_events` | Migration 126 not applied — run `npm run migrate` |
