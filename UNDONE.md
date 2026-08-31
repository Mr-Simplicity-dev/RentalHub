# Undone Items (tracked list)

> Ask the AI: "bring the undone items" to see this list.

## Active

### Blocked on you (no code change needed)

- [ ] **Verify Resend domain `rentalhub.com.ng` on Resend (DNS records)** — domain status is "failed"; ALL emails from the app (welcome, receipts, payouts, failed-payment + registration reminders) are rejected with 403. Action: add Resend SPF/DKIM/return-path DNS records in Cloudflare for rentalhub.com.ng, then click Verify in the Resend dashboard.

- [x] **DONE — `diaspora_registration_payment` enabled (2026-08-28)** — diaspora registrations now charge (base $12.85 + optional add-ons at live FX). Client gating added, server bypass guard added, flag UI labelled in super admin dashboard.

- [ ] **Decide: state-admin withdrawal accounting** — the state-admin request path now snapshots commissions for the receipt but does NOT mark them `paid`. Only the admin-approved path marks commissions paid. Confirm which behavior is correct (mark-paid-on-request vs on-transfer).

### Code work agreed, not done

- [x] **DONE — Language pack (user-facing) complete (2026-08-29)** — 29 files converted: AppLanding, QrCodePage, Terms, Privacy, RentSavingsModal, WalletFundModal, WalletWithdrawModal, damage/*, PropertyCard, PropertyFilters, FumigationCleaningCatalog/Admin/Wizard, common×12 (ConfirmDialog, InputDialog, SupportReplyActionModal, InternalNotesPanel, ShareMenu, TicketConversationModal, BookingCancelModal, AppealModal, Modal, Button, ErrorBoundary, BackToDashboard), MapPicker, DisputeCreationModal, DisputeQRCode, LivePropertyPhotoCapture, LivePassportCaptureModal, PropertyList, PropertyShareButton, calls×3, RoleBadge. 2 dead files removed (DamageReportPreview, Fumigation DashboardButton). **Decision: admin suite stays English-only** — Batch 2 (admin dashboards + components/admin/*) intentionally NOT translated.

- [x] **DONE — Withdrawal 2FA (2026-08-29)** — TOTP (Google Authenticator) primary + SMS OTP fallback; recovery codes (10, single-use, hashed); 5-attempt lockout (15 min); enrollment UI in Profile; gate on ALL withdrawal requests (wallet, admin/state commission, agent, super-admin direct) AND admin approvals (financial-admin approve, agent approve, wallet approve). Migration 125. Unit-tested live (9/9). Note: consider setting NIN_ENCRYPTION_KEY on VPS so TOTP secrets are encrypted at rest (currently plaintext fallback, same as NIN).

- [x] **DONE — Diaspora Phases 3–5 (2026-08-31)** — Phase 3: Super Admin → Diaspora tab (review queue: country, target state, card country/brand, Nigerian-funded review flags + dismiss with notes; migration 126). Phase 4: USD quote + FX rate + markup on registration receipts (email + PDF). Phase 5: diaspora dashboard banner + diaspora_country/billing_country/card_brand in /auth/me. Note: 0 diaspora users in DB yet — queue fills as diaspora registrations happen. Note: user's WIP voice system (routes/voice.js + migrations 130/131 + adService changes) is uncommitted/unapplied locally and NOT deployed — twilio dep already in package.json; VPS restored.

- [ ] **Translate new keys into other languages** — pages newly converted to i18n (AppLanding, QrCodePage, Terms, Privacy + OTP strings) have English defaults; ha/yo/ig/ru/fr/ar/zh currently fall back to English for them.

### Technical debt / known issues

- [ ] **tagthemall-server crash-looping** (~1000+ restarts; separate service, likely Mongo issue) — investigate and stabilise.

- [ ] **Stray nginx config `/etc/nginx/sites-enabled/rentalhub.bak- ` (trailing space)** — causes duplicate/conflicting server_name warnings; remove it.

- [ ] **Local dev environment broken** — wrong Atlas Mongo credentials + no local Postgres; must be fixed before any local development/testing.

- [ ] **Review the 12 abandoned registrations** in `tenant_registration_payments` (pending, >12h old) — they will get reminder emails once Resend is verified; check they are legitimate.

- [x] **DONE — Key translations (2026-08-31)** — all new sections (wallet_fund, wallet_withdraw, damage, damage_card, damage_capture, property_card, property_filters, fumigation_*, common dialogs, calls, map_picker, dispute_*, property_list/share, modal, error_boundary, back_to_dashboard, button, role_badge, booking_cancel, appeal, live_*_capture, audio/call/online_status, two_factor + profile.totp_* + register.otp_*) translated into ha/yo/ig/ru/fr/ar/zh (~850 keys per language). All 8 JSON files validated.

- [x] **DONE — Voice system WIP handled (2026-08-31)** — committed + deployed the user's voice work: routes/voice.js, tests/voice.test.js, SupportVoiceDesk.jsx, voiceApi.js, docs, migrations 130 (audio ads) + 131 (call escalations), adService audio support. twilio module restored on VPS. Voice routes live at /voice.

- [x] **DONE — Onboarding survey system (2026-08-31, +contacts/sync follow-up)** — tenant (T0–T9) + landlord (L0–L10) questionnaires (107q each); non-skippable Part A (T0+T1 / L0+L1) gate on new-user dashboard before tour; autosave + resume; Part B finished from dashboard reminder; Super Admin → Survey & Analysis tab (frequencies, likert means, NPS, feature priority, fraud signals, open answers, projections machine for revenue/cost/staffing/funding duration); PDF + CSV export; paper entry (admin keys paper responses, R2/R3 fields); public page at /survey (Turnstile). **Contacts follow-up**: public + paper respondents give name/phone/email ("no email" flag)/current location/state of origin — viewable in responses table + CSV; survey contacts sync into Email Marketing ("Sync contacts from users & leads", source='survey') and SMS Marketing ("Sync contacts from users", source='survey'). Existing users (pre-2026-08-31) marked survey_exempt. Migrations 132 + 133. Live unit-tested (gate, analysis pipeline, projections, contacts, email+SMS sync).

- [ ] **Survey follow-ups (next session)** — (1) ha/yo/ig translations for the 214 survey questions (wizard chrome already translated; prompts are English-only today); (2) link to /survey from the public site (Home/Footer) once the user wants lead capture visible.

---

## SURVEY SYSTEM — MASTER RECORD (self-contained; read this if memory is wiped)

### What exists (all live on VPS as of 2026-08-31)
- **Questionnaires**: `config/survey/tenantQuestionnaire.js` (T0–T9, 107 q) + `config/survey/landlordQuestionnaire.js` (L0–L10, 107 q), merged via `config/survey/index.js` (SURVEY_VERSION=1, Part A = T0+T1 / L0+L1 consent+profile). Prompt format `{en, ha, yo, ig}` (only `en` filled so far); options `{v, en}`; `required` defaults true; `analysis` tag drives the analyser (pain/nps/fee/feature/fraud/cost/adoption/consent/open); `endsOn` = screened-out value.
- **Storage**: `survey_responses` (migration 132): survey_type, survey_version, user_id (NULL for public/paper), respondent_code (unique, RH-prefixed), source ('online'|'paper_entry'|'public_link'), admin_mode/admin_date/state_id/lga_name (R2/R3), consent_flags JSONB, answers JSONB, part_a_completed_at, completed_at, time_spent_seconds. Migration 133 added contact columns: respondent_name, respondent_phone, respondent_email, respondent_location, respondent_state_of_origin, has_email (FALSE = explicit "no email").
- **Gate**: users.survey_part_a_completed_at / survey_completed_at / survey_exempt (existing users backfilled exempt). Client: Dashboard.jsx fetches `/survey/my-status`; full-screen non-skippable Part A overlay (`SurveyWizard mode="partA"`) before tour; Part B reminder banner opens `mode="full"` wizard. Wizard: `client/src/components/survey/SurveyWizard.jsx` (modes partA/full, publicMode, paperMode, collectContacts), autosaves via `/survey/save`.
- **API**: `routes/survey.js` → `/api/survey/*` (definition, my-status, start, save, complete-part-a, complete, public/submit w/ Turnstile `rentalhub_survey`); `routes/adminSurvey.js` → `/api/admin/survey/*` (analysis, projections, responses, paper-entry, delete, export.pdf, export.csv) — admin roles via `requireDiasporaAdmin` list in `services/diasporaAdminService.js`. Services: `services/surveyService.js`, `services/surveyAnalysisService.js` (computeAnalysis: frequencies, likert means, NPS, feature ranking, open answers + keyword themes; getProjections: revenue/cost/staffing/funding machine).
- **Admin UI**: Super Admin → "Survey & Analysis" tab (`client/src/components/admin/SurveyAdminPanel.jsx`; recharts; tabs Overview/Analysis/Projections/Responses+PaperEntry; PDF/CSV; paper wizard reuses SurveyWizard paperMode+collectContacts).
- **Public page**: `/survey` (`client/src/pages/PublicSurvey.jsx`, route in App.jsx, Turnstile, collectContacts).
- **Marketing sync**: `services/emailMarketingService.js` + `services/smsMarketingService.js` sync blocks now include survey contacts with source='survey' (verified live).

### Tagged follow-ups (do in order)
- **[SURVEY-FU-1] Agent-assisted mode on the public page** — when a RentalHub agent administers the survey via `/survey` (face-to-face/telephone), capture the agent's name, the LGA where the survey is carried out, and the agent's location; attribute the response to the agent; set admin_mode. DESIGN PENDING USER CONFIRMATION — see discussion below; do not build until user answers the agent-mode questions.
- **[SURVEY-FU-2] Public resume (busy respondent)** — anonymous respondents must be able to close and return later. Design: on first answer, server creates draft (completed_at NULL) + returns `resume_token`; client stores it in localStorage AND optional URL param; `GET /survey/resume?token=` returns saved answers + position so the wizard pre-fills; autosave keeps updating. Also: when a draft exists, the public landing page shows "Continue where you left off".
- **[SURVEY-FU-3] Account continuation (no double survey)** — when a public respondent (draft or completed) later registers: DO NOT force a new survey. On registration/login, link the anonymous `survey_responses` row to the new user_id (claim by resume_token from localStorage at `/survey/start` time or a `POST /survey/claim` endpoint). The onboarding gate then shows only the REMAINING unanswered questions (pre-fill from saved answers). If the anonymous record was already COMPLETED → mark users.survey_completed_at so no gate shows.
- **[SURVEY-FU-4] Rent/location change check on continuation** — when continuing an old draft after account creation, first ask 2 questions: (a) "Is your rent situation the same as when you started this survey?" (b) "Have you moved to a different state/LGA since?" If changed → start a NEW survey row (survey_version bumped if questionnaire changed), mark the OLD row `superseded_at = NOW()` (needs migration: add superseded_at TIMESTAMP to survey_responses), and EXCLUDE superseded rows from all analysis/export queries (add `AND superseded_at IS NULL` in loadResponses). Old record is never used again.
- **[SURVEY-FU-5] Browser notification reminders** — on the public page, ask permission (Notification API) with a "Remind me to finish" button; store consent; show a notification when the user returns with an unfinished draft ("You have an unfinished survey — continue?") and after abandonment. NOTE (honest scope): true background push while the tab is closed requires Web Push + service worker + VAPID keys — treat as a separate later item; the localStorage-based nudge + notification-on-return is the shippable first step.
- **[SURVEY-FU-6] ha/yo/ig translations** of all 214 question prompts + option labels (structure already supports `{en, ha, yo, ig}`; wizard chrome is translated; add `survey.contact_*` keys too).
- **[SURVEY-FU-7] /survey link on public site** — add link to rentalhub.com.ng/survey (Home/Footer) once lead capture is wanted.

### Agent-mode discussion (start here with the user)
Proposed design: `/survey` landing gains a "Who is filling this survey?" toggle → [Respondent themself] | [Agent on the respondent's behalf]. If agent: an Agent Details step (agent full name, LGA where survey is carried out, location) + admin_mode set (face_to_face/telephone/other). Respondent contact step stays (agent keys it in). New columns (migration): survey_responses.agent_name VARCHAR(200), agent_lga VARCHAR(120), agent_location VARCHAR(255). Analysis/CSV/responses table include agent fields. Paper entry already collects admin_mode/date/state/lga — agent mode mirrors that on the public URL. OPEN QUESTIONS FOR USER: (1) free-text agent name vs. dropdown of registered platform agents? (2) should agent be identifiable by phone? (3) should agent mode also appear in the online onboarding gate or public page only? (4) separate "agent code" for attribution/reporting?