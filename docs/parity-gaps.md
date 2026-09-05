# Web ↔ Mobile (APK/iOS) Parity Audit

Status of this document: **living** — updated as gaps are closed.
Last audit: 2026-09-04 (read-only; source-based + artifact inspection).

Scope: RentalHub NG — web (`client/` + Express backend) vs mobile
(`RentalHubMobile/src`, one React Native codebase for **iOS + Android**).

---

## 1. What we are comparing

- **Web** is the largest surface (tenant/landlord/agent + full admin suite).
- **APK and iOS share one source** (`RentalHubMobile`). They differ ONLY by which build
  each platform last shipped.
- So there are two independent gap types:
  - **Feature gaps** — web features missing from the mobile *source*.
  - **Build gaps** — shipped APK/iOS behind the current mobile *source*.

## 2. Build freshness (verified 2026-09-04)

| Item | Android | iOS |
|---|---|---|
| Local artifact | `uploads/app.apk` = `android/app/build/outputs/apk/release/app-release.apk` (SHA-256 `7BCD9929…C1AE`, identical) | **None on machine** (only EAS/TestFlight/App Store) |
| Build date | 2026-08-26 01:34 | unknown |
| Rent calculator inside? | **No** — extracted JS bundle has zero `RentCalculator`/`rent-calculator` markers | unknown |
| Source committed after that build | security hardening (28 Aug), auth-screen commits (28 Aug), 774-LGA canonical data (2 Sep), **rent calculator + handoff (4 Sep)** | same list |

**Close:** rebuild both from current mobile source; replace `uploads/app.apk`; cut fresh
iOS build; bump `versionCode`/`buildNumber`; produce `.aab` for Play.

## 3. Feature gaps — web present, mobile missing

### 3a. User-facing (priority to close)

| Gap | Web entry | Mobile status |
|---|---|---|
| Surveys (public + in-app + marketing-agent overview) | `client/src/pages/PublicSurvey.jsx`, `components/survey/SurveyWizard.jsx` | none (`survey` absent in `RentalHubMobile/src`) |
| Diaspora/foreign registration (USD pricing path) | `client/src/pages/Register.jsx` | none in `RegisterScreen.js` |
| Two-factor auth (TOTP) + withdrawal OTP step | `Profile.jsx`, `TwoFactorStep.jsx` | none (`2fa`/`totp` absent) |
| User appeals submit / "my appeals" | `components/common/AppealModal.jsx` | admin appeals only |
| Agent/Lawyer state-migration self-request | `pages/agent/AgentDashboard.jsx`, `pages/lawyer/LawyerDashboard.jsx` | none |
| Tenant relocation/refund request + landlord approve/reject | `pages/Dashboard.jsx` refund flows | grace only; no tenant request/landlord UI |
| Marketing-agent survey dashboard | `pages/marketing/MarketingAgentDashboard.jsx` | none; role unrouted (→ TenantRoot) |
| Zonal admin console | full web admin suite | none; role unrouted (→ TenantRoot) |

### 3b. Mobile admin present but PARTIAL

- Inspections: list only (no assign/start/complete/cancel).
- State-admin finance: no commissions/withdraw/transactions.
- Financial-admin state management: no create state-admins / funds / commission-rate.
- Agent commission/withdrawal admin ops (verify/reverse/payout) missing.
- Rent-savings admin (setup-fees/withdrawals) web-only.
- Super-admin: ratings moderation, credential-revalidation queue, verification reminders,
  create-admin/role-contract web-only.
- Messages `/flagged` moderation, damage-report publish/unpublish admin web-only.

### 3c. Likely intentional desktop/internal (only build if product decides)

Email/SMS marketing, ads CRUD, full SEO dashboard, survey analytics (Excel/PDF),
diaspora admin desk, Twilio PSTN voice desk (mobile has in-app WebRTC calls), court
bundle/seal (lawyer), NDPR export, system alerts, zonal dashboards, blog/rent-stats/
downloads/app-links/webhooks (server/SEO/infra).

## 4. Bugs found by the audit

| # | Location | Issue | Fix |
|---|---|---|---|
| 1 | `RentalHubMobile/src/screens/shared/MyDisputesScreen.js:58` | calls `/disputes/my`; backend only has `/disputes/me` → 400 | point at `/disputes/me` |
| 2 | `RentalHubMobile/src/screens/state-admin/StateAdminMigrationsScreen.js:39-45` | reads `{approvals, properties}`; `/api/state-migrations/*` returns a different shape | align with real endpoint (investigate) |
| 3 | `RentalHubMobile/src/navigation/AppNavigator.js` `RoleRouter` | `marketing_agent` and `zonal_admin` have no branch → fall into TenantRoot | explicit routing (no tenant fallthrough) |

### Status log

- [x] 2026-09-04 Audit written.
- [x] Bug 1 fixed — `MyDisputesScreen.js` now calls `/disputes/me`.
- [x] Bug 2 fixed — `StateAdminMigrationsScreen` relabelled "Property approvals"; Approved/Rejected tabs now actually filter by `approval_status` (previously returned the full unfiltered list). Nav title updated in `AppNavigator.js`.
- [x] Bug 3 fixed — new `DesktopOnlyScreen` + `DesktopOnlyRoot`; `marketing_agent` and `zonal_admin` no longer fall into `TenantRoot` (they get a "web console" screen).
- [x] §3a-4 User appeals (mobile): `appealsService.myAppeals/submitAppeal`, `MyAppealsScreen`, `AppealCreateScreen` (property via landlord rejected-properties picker, verification self-appeal), registered across all role roots; entries from Profile menu + Verification-status "Appeal this decision".
- [x] §3a-5 Agent/Lawyer state migration (mobile): `stateMigrationService`, `StateMigrationScreen` (request + my requests), registered in Agent + Lawyer stacks; entries on agent dashboard (Account section) and lawyer dashboard hero.
- [x] §3a-6 Tenant refund/relocation + landlord review (mobile): `tenancyAdjustmentService` extended (eligible/my-requests/submit/landlord list/approve/reject), `RefundRequestScreen` (standard + early-exit relocation), `RefundRequestsScreen` (tenant history + landlord approve/reject with required note), registered via `commonTenancyScreens()`; dashboard "Money" entry for tenants and landlords.
- [x] §3a-3 Two-factor auth (mobile, COMPLETE): `authService` 2FA methods; Profile "Security" card supports TOTP enable (secret shown for authenticator entry), confirm (recovery codes surfaced) and disable; **wallet-withdrawal OTP step wired** — `WithdrawalFactorModal` mirrors web `TwoFactorStep` (428 `OTP_REQUIRED` → TOTP code or auto-sent SMS code → resubmit with `totp_code`/`otp`), integrated into `DashboardScreen.handleWithdrawSubmit`/`verifyWithdrawFactor`.
- [x] §3a-2 Diaspora registration (mobile, mostly existed): **audit correction** — mobile `RegisterScreen` already supported the Foreigner/Nigerian toggle, passport + nationality fields, and sent `is_foreigner`/`identity_document_type` in the register payload. Closed the remaining gaps in `RegisterScreen.js`: diaspora flags now mapped from `/auth/registration-flags` (gate + payment flag + USD/NGN fee), selecting "Foreigner" is blocked with a notice when diaspora registration is disabled, diaspora fee is included in the amount-due summary with USD and NGN-estimate shown.
- [x] Diaspora `FOREIGN_CARD_ADJUSTMENT` (mobile): when paid-registration completion returns HTTP 402 `FOREIGN_CARD_ADJUSTMENT`, `RegisterScreen` now shows a modal (amount + FX explanation) with "Pay foreign-card adjustment" → `authService.payForeignCardAdjustment` → opens Paystack `authorization_url` via `Linking`, then "I have finished paying — finish registration" re-runs completion. ⚠️ Needs real-Paystack QA (device + live/foreign test card) to verify end-to-end.
- [x] §3a-1 Survey participation (mobile, authenticated): `surveyService` (my-status/definition/start/save/complete-part-a/complete), `SurveyScreen` wizard rendering the definition-driven questionnaire (single/consent screen-out, multi, likert, text, rank via `rankSource` when options empty, `maxPicks`), sequential Part A gate → Part B resume → final `complete` with `time_spent_seconds`; debounced autosave; registered in Tenant + Landlord stacks; Dashboard shows a required/continue survey card (`my-status` on focus). Known deviations: mobile uses a dashboard CTA (not the web's forced full-screen Part A overlay), and anonymous/public survey + location gate remain web-only (mobile is authenticated-only).
  - §3a user-facing gap set is now CLOSED.
  - Remaining open from the wider audit: §3b admin-action gaps (inspections actions, state/finance admin screens, super-admin ratings/credential-revalidation queues), build/deploy (migration 145 apply, fresh APK/iOS + `uploads/app.apk`), and no commits made.
- [x] §3b inspections actions (mobile): `AdminInspectionsScreen` rewritten — per-item Assign-to-me (from paid/pending), Start (optional note), Complete (required summary + optional note) and Cancel (required reason) with a prompt modal, calling `/admin/inspections/:id/{assign,start,complete,cancel}`; ownership-scoped button visibility; reloads on focus.
- [x] §3b ratings moderation + credential-revalidation queue (mobile): `superModerationService` + `ModerationHubScreen` (two tabs) — ratings list (`/super/platform-ratings`) with Approve/Hide/Reject (+ optional note) via `/super/platform-ratings/:id/moderate`; credential-revalidation submissions (`/super/credential-revalidations`) with Approve / Return(reject, required note) via `/super/credential-revalidations/:id/review`. Registered in SuperAdminRoot; entry on Profile (super admin only).
- [x] §3b state-admin finance (mobile): `stateAdminService` finance methods + `StateAdminFinanceScreen` — tabs for commission summary (`/state-admin/commissions/summary`), state transactions (`/state-admin/transactions`), withdrawal history (`/state-admin/withdrawals`), and a payout request form (`/state-admin/withdraw`) with the two-factor (428 → TOTP/SMS) step reusing `WithdrawalFactorModal`. Registered in StateAdminRoot; entry on Profile for state admins.
- [x] §3b financial-admin state management + commission-rate (mobile): `financialAdminService` methods (list/create/manage-funds/commission-rate) + `FinanceStateAdminScreen` — state-admin list with wallet/rate/commissions, per-admin Set rate (1–20%) and Freeze/Unfreeze (reason required), and (super-admin only) a Create state-admin form. Registered in SuperAdminRoot + FinancialAdminRoot; Profile entries for `super_admin`/`super_financial_admin`. Note: create is guarded to `super_admin` per backend `requireSuperAdmin`; manage/rate are `super_admin`/`super_financial_admin`.
- [x] §3b damage-report + messages-flagged moderation (mobile) — ASSESSED, NOT BUILT: `/messages/flagged` is a view-only admin list (`lga_admin`/`super_admin`) with **no admin resolution endpoint** (the only delete is sender-only), and damage-report publish/unpublish/update/delete has **no all-reports admin list** (property-scoped only, owner/super-admin/agent permission model). No clean mobile workflow exists to mirror → left as a product decision rather than speculative UI.
  - §3b is now otherwise complete. Remaining open: build/deploy (migration 145 apply, fresh APK/iOS + `uploads/app.apk`), device/live QA notes, and no commits made.
