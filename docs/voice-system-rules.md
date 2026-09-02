# Voice System — Rules to Remember

Short rules so future you (or any AI agent working on this repo) never breaks
the voice support system.

---

## RULE 1 — Department names must be REAL platform departments

> In `VOICE_ESCALATION_DEPARTMENTS` use the **platform department names**:
> `finance`, `legal`, `technical`, `transportation`, `fumigation` — those are
> the trays that raise tickets.
>
> **A made-up name will still ring, but no complaint slip will be written for
> the super admin to see.**

Example (correct):
```bash
VOICE_ESCALATION_DEPARTMENTS=finance:+2348012345678,legal:client:legal_1
```

Example (WRONG — "sales" and "fraud" ring, but create NO ticket):
```bash
VOICE_ESCALATION_DEPARTMENTS=sales:+2348099999999,fraud:+2348055555555
```

Why: after a warm transfer, the backend raises a support ticket so the
department's admins act on it and the Super Support dashboard shows it for
rectification. Tickets are only created for the five platform departments
above (see `getVoiceTicketDepartment` in `routes/support.js`).

---

## Other rules that matter (don't break these)

**RULE 2 — `TWILIO_WEBHOOK_BASE_URL` must exactly match the public HTTPS URL
Twilio calls.** In production the signature check trusts ONLY this variable,
never the request's Host header. A mismatch = every webhook rejected with 403.

**RULE 3 — TwiML App Voice URL = `/voice/outgoing`; Twilio numbers = 
`/voice/incoming`.** Swap them and outbound legs replay the inbound IVR
(they are rejected with `<Reject/>` and logged).

**RULE 4 — Never put `'unsafe-inline'` or `'unsafe-eval'` into the CSP
script-src.** The meta CSP in `client/public/index.html` and the helmet CSP
in `server.js` must stay strict; no first-party inline scripts exist on
purpose (GA loads from `/gtag-init.js`).

**RULE 5 — `npm run migrate` after pulling** — voice tables live in
migrations: 126 (call events), 127 (callback requests), 128 (recording URL),
130 (audio ads), 131 (escalations), 140 (escalation→ticket link). Skip it and
the phone flow logs errors silently (webhooks never fail the call).

**RULE 6 — Keep departments in the ticket loop honest:** every log line for
voice webhooks carries `callSid` — search the logs by call SID, not by phone
number, when investigating a call.

Full details live in `docs/twilio-voice-deployment.md`; outstanding work in
`docs/voice-system-backlog.md`.
