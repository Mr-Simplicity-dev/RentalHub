# Geo Support Line — Design & Build Blueprint

Status: **DESIGN — approved direction, not yet built.** Owner clarifications are
final (Sept 2026) and recorded below. This is the working spec to implement
from. The append-only session log lives in `docs/voice-system-backlog.md`.

Related docs: `docs/twilio-voice-deployment.md`, `docs/voice-system-backlog.md`,
`docs/voice-system-rules.md`.

---

## 1. Goal

One toll-free number, but every call is answered by the support tier that
"owns" the caller — starting at the caller's own Local Government Area and only
climbing to higher tiers when the current one cannot resolve it.

The ladder (owner spec):

1. A call from inside an LGA area is served by that LGA's support team (e.g. a
   caller anywhere in Gwagwalada area — Zuba, Dobi, town centre — is
   Gwagwalada's call).
2. If the LGA has several support admins on duty, the NEXT AVAILABLE one picks
   up (no single pre-assigned officer).
3. Not resolvable? Escalate UP to the state/zonal tier (manages ALL LGAs under
   that state), then to the central Super Support "zone" (all 37 states / all
   774 LGAs). Still not fixable? Platform SUPER ADMIN.
4. State/zonal support manages multiple LGAs — all LGAs under that state.
5. Functional department issues are owned by their "super" admins (super
   finance, super legal/lawyer, super transport, fumigation, ...) and when they
   cannot resolve, they escalate to the platform SUPER ADMIN.

Two axes, both ending at super admin:
- Geographic: LGA team -> state/zonal team -> central super-support zone ->
  super admin.
- Functional: department super admin (finance/legal/transport/fumigation) ->
  super admin.

## 2. Routing basis (OWNER DECISION — Rule B with A-fallback)

- **Known user** (ANI/phone matched to an account, or identified): route by the
  user's HOME / PROPERTY LGA (profile address or the LGA of the property being
  called about). Call-time GPS is NOT used for known users. Example: a
  Gwagwalada resident calling from their Wuse office is served by Gwagwalada.
- **Unknown caller**: fall back to WHERE-THEY-ARE-AT-CALL-TIME (IVR
  state/LGA capture and/or device location). A walk-in calling from Wuse is
  served by the Wuse/AMAC (FCT) team.
- Build consequence: a per-user **home LGA** source (profile address / property
  listing LGA). Call-time location is only the identity fallback.

## 3. Current code truth (baseline — do not re-debug these)

- Toll-free line = ONE national queue staffed ONLY by super-support agents
  (`VOICE_AGENT_IDENTITIES`) from the Super Support Voice Desk
  (`SupportVoiceDesk.jsx` + `useTwilioVoice.js`).
- LGA/state/zonal admins have NO voice console.
- No inbound call is routed by caller LGA.
- In-call escalation = department warm consult -> transfer -> complaint-slip
  ticket (`createVoiceEscalatedTicket` in `routes/support.js`). Departments
  must be the platform names (finance/legal/technical/transportation/
  fumigation) or no slip is created.
- Super admin = read-only `VoiceSupportOverview`.
- Conference model: `rentalhub_support_<callSid>` per active call + agent
  waiting room; `/voice/outgoing` dispatch; `/voice/incoming`; `/voice/token?line=`;
  call logs/recordings/callbacks via `/voice/call-log`, `/voice/callbacks`.
- Admin role/dashboard map: `super_support_admin` ->
  `/admin/super-support-dashboard` (Voice Desk + Voice Ops);
  `state_support_admin` -> `/admin/state-support-dashboard`;
  `lga_support_admin` -> `/admin/lga-support-dashboard`. Scope fields already
  on `users`: `assigned_state`, `assigned_lga`.
- Known fixed bugs (do not re-open): Voice Desk TDZ (useTwilioVoice forward
  const, fixed via ref), appeals 500, diaspora 404, state-migration 403 for
  super_admin, property-alerts 404, lazy voice chunk crash.

## 4. Target architecture (how it should work)

Reuse today's conference/dispatch machinery; only make the room, the queue line,
and ownership jurisdiction-aware.

- **One toll-free number**, no extra numbers.
- Each tier staffs a **jurisdiction queue line** while Go Available:
  - LGA admin -> `queue:lga:<assigned_lga>` (e.g. Gwagwalada)
  - state/zonal admin -> `queue:state:<assigned_state>` (e.g. FCT)
  - super support -> `queue:super` (national overflow; same as today)
- **Inbound routing** picks the room by the caller's jurisdiction per Rule B/A:
  home/property LGA for known users, else call-time location.
- If the owning tier is not staffed -> roll up (LGA offline -> state/zonal ->
  super support -> after-hours/callback), identical to today when nobody is up.
- The caller stays in ONE room the whole time; "escalation up" hands room
  ownership to the higher tier (warm consult first), then the new owner
  continues with the caller.
- Functional department escalation exists only at the top of the geographic
  chain (super support), keeping the two axes clean.

### Escalation state machine (per call)

```
LGA agent (owner)                    LGA offline  -> roll up
  | warm hand-off up (type=consult-up, no complaint slip)
  v
State/zonal agent (owner)
  | warm hand-off up
  v
Super Support agent (owner)
  |-- department consult/transfer  --> complaint slip to that dept
  |-- "relate to super admin"      --> flagged ticket for super admin (no live hand-off)
  v
Super admin (review only, not on the line)
```

## 5. Build phases

### Phase 0 — data & identity prep
- Ensure LGA support & state support rows carry `assigned_lga` /
  `assigned_state` (existing columns). Back-fill where missing (admin tooling).
- Define "home LGA" source for users: prefer active tenancy/property listing
  LGA, else profile address LGA. Confirm which takes precedence per call topic.

### Phase 1 — foundation (safe, no UI change, backward compatible)
- Capture inbound jurisdiction on every call (IVR state/LGA select OR
  ANI->account home-LGA OR device location), persist on the call record
  (`voice_calls`/events) with a source tag.
- Scope `/voice/call-log` + `/voice/callbacks` reads by role+jurisdiction
  (LGA admin sees their LGA, state admin their state, super support all).

### Phase 2 — rooms by jurisdiction + roll-up routing (behind a flag)
- Name rooms/queue-lines by jurisdiction; dispatch by ownership.
- When the owning tier is not staffed, roll up deterministically.
- Behaviour with no staffing == exactly today.

### Phase 3 — scoped voice desks for state & LGA admins
- Embed a jurisdiction-scoped `SupportVoiceDesk` (or variant) into the
  state/LGA support dashboards; Go Available joins only their line.
- Keep the Twilio SDK lazy-loaded per dashboard.

### Phase 4 — hand-off + super-admin relate
- `escalation_type=consult-up` (geographic ownership transfer, structured note,
  NO complaint slip) distinct from department consult/transfer.
- Ownership enforcement: an agent may only act on rooms inside their
  jurisdiction (or super support on anything).
- "Relate to super admin": flagged `voice_superadmin` ticket surfaced in the
  super admin dashboard/history.

### Phase 5 — functional-department gating & ladder polish
- Department warm-transfer UI offered only at super support.
- Callback scoping, SLA/after-hours per jurisdiction if required.
- Full ladder tests + doc updates.

## 6. Data & config additions
- Migration: jurisdiction on the call record (state/lga, source: anr|ivr|device,
  timestamp); coverage is derived live from Go-Available duty status (not stored).
- Reuse `users.assigned_lga`/`assigned_state` as the admin roster source.
- `.env` (not committed): routing flags (geo enable), IVR state/LGA dataset
  path, department-at-super-support-only toggle.
- A state/LGA + admin-coverage lookup util shared by voice + survey geo work.

## 7. Files likely touched
- `routes/voice.js` — jurisdiction capture, room/line naming, roll-up routing,
  `consult-up`, ownership checks, scoped log/callback reads.
- `routes/support.js` (`createVoiceEscalatedTicket`) — add relate-to-super-admin
  ticket type without changing department slips.
- `client/src/components/admin/SupportVoiceDesk.jsx` + `hooks/useTwilioVoice.js`
  — jurisdiction-scoped Go Available.
- `LgaSupportAdminDashboard.jsx`, `StateSupportAdminDashboard.jsx` — scoped desk
  + callbacks panel.
- `SuperSupportAdminDashboard.jsx` / `SuperAdminDashboard.jsx` — overflow line,
  department escalation (unchanged), relate panel.

## 8. Open questions to answer before/during implementation
1. Known-user home LGA precedence: active tenancy vs owned property vs profile
   address — which wins when they differ?
2. Roll-up when the middle tier has no one online: skip straight to super
   support? (Assumed yes.)
3. Should state/zonal tiers also be allowed department (functional) escalation,
   or truly only super support? (Spec says only super support.)
4. Is "home LGA" ever manually overridable by the user at call time via IVR?
5. Offline/after-hours per jurisdiction vs one national window for v1?
6. Re-entry / callback expectations when the owning tier is offline for a long
   stretch.
