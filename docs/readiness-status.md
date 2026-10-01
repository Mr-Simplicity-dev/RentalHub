# Readiness Status — verified state

> This file is the **single source of truth** for what is done and what is open.
> The older audit docs are dated; where they disagree with this file, this file wins.
> Last verified: 2026-09-29 (Phase 1 of the readiness pass).

## Phase 1 — Compile & build integrity ✅ PASSED

| Check | Result |
|---|---|
| Backend files parse (`node --check`) | **338/338** ✅ |
| Client + mobile files parse (Babel) | **510/510** ✅ |
| Backend test suite | **187/187 pass** ✅ |
| API contract check | 787 routes · 509 mobile calls · **0 unmatched** ✅ |
| Mobile tour contract | 66 steps · 5 locales · 16 routes ✅ |

**One real defect found and fixed:** `routes/models/Dispute.js` was a truncated Mongoose
schema fragment (a syntax error) with no wrapper, required only by its own re-export shim
`models/Dispute.js`. Nothing else imported it. Both files deleted.

### Notable finding (not a defect)
`models/*.js` are re-export shims pointing at `routes/models/*.js`, which are **live
Mongoose schemas**. The blog / ranking / user-key features still run on MongoDB — which is
why "MongoDB disconnected — cron jobs paused" appears in the logs. If MongoDB is meant to
be retired, that is a migration project, not a cleanup.

---

## Done — confirmed (the old docs don't know)

These are listed as outstanding in the older audit docs but are **built and deployed**:

- **Tenancy agreement system** — `docs/tenancy-agreement-system-spec.md` says *"NOT yet built"*.
  Built: migrations 152/153, PDF generation, jurisdiction layer, templates, web UI + mobile.
- **Pay Rent On Behalf + Rent Help on mobile** — built.
- **Rent calculator** — built, deployed, fees admin on mobile.
- **Damage-report + `messages/flagged` moderation** — the `pickList` double-unwrap bug that
  made those lists always empty is fixed (6 screens).
- **Codebase cleanup** — unused deps removed, dead files deleted, `console.*` → logger.
- **Marketing agent commissions** — schema, engine, invite link, survey gate, wallet payout,
  leaderboard (web + mobile).
- **Multi-bank account sweep** — fixes the NUBAN collision (one number, several fintechs).
- **Super-admin workspace board** — 6 groups, More/Show less, on every admin dashboard.
- **Amana branding** — mobile (launch screen, flash, brand mark), **web (header + footer)**,
  **flyers (11 templates)**.

---

## Open — genuinely outstanding

### Security (highest priority)
1. **Rotate every credential in `.env`** and reject placeholder/weak JWT at startup.
2. **`NIN_ENCRYPTION_KEY` must fail closed** — today a missing key only warns.
3. **Dependency advisories** — backend `qs`; mobile ~22 (18 moderate, 4 high).
4. **Upload hardening** — magic-byte validation, size limits.
5. **Reject `ALLOW_INSECURE_CORS_ORIGINS=true` in production.**
6. **Persistent VAPID keys** (currently reset on restart).
7. **Middleware ordering** + stop `/api/health` leaking uptime/DB/Redis.
8. **Review `SupportVoiceDesk.jsx` ~line 729.**
9. **Android APK self-updater vs Google Play policy** — Play forbids outside-Play APK installs.

### Mobile
10. **Nigerian languages missing on mobile** (Hausa/Yoruba/Igbo) — the web has them.
11. **No Twilio voice desk on mobile** (read-only monitor only).
12. **iOS build never proven** (needs macOS / EAS + Apple signing).
13. **Mobile has no `test` script**; EAS CI needs `EXPO_TOKEN`.

### Features not built
14. **VAT / invoicing / payment splitting** — spec only; blocked on a tax advisor.
15. **Geo support escalation ladder** (phases 3 & 5) — needs a live Twilio env to verify.
16. **Voice gaps** — ring-all/skills routing, idle dashboards, consult retry.
17. **Tour optional extras** — content admin, video steps, skip-survey, A/B testing.

### Ops
18. **Migration hash drift** — `migrate:dry-run` blocked; `MIGRATIONS_SKIP_HASH_CHECK` in use.
19. **Voice deployment** — Twilio env vars, TwiML App, numbers, Termii SIP trunk, live call test.
20. **`tagthemall-server` crash-looping** and **local dev environment broken** (the only two
    open items in `UNDONE.md`).

### Blocked on you / third parties
21. **Legal protection coverage** — blocked on Nigerian legal counsel.
22. **VAT position** — blocked on a tax advisor.
23. **`EXPO_TOKEN`**, **Apple signing**, **Play Store submission** decisions.

---

## Remaining readiness phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Compile & build integrity | ✅ **done** |
| 2 | Web ↔ APK parity (definitive table) | pending |
| 3 | Security audit (code + nginx + deps + secrets) | pending |
| 4 | Button & navigation guards (every action role-gated server-side) | pending |
| 5 | Live smoke test (auth, payments, survey, commission, downloads) | pending |
| 6 | Broken-code sweep (response shapes, stale closures, dead endpoints) | pending |

**Honest limits:** this pass hardens and verifies configuration. It is **not** a substitute
for a professional penetration test, and it cannot prove iOS without a macOS/EAS build.
