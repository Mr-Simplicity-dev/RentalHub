# Volunteer recruitment extension — implementation and deployment report

Date: 25 October 2026

## 1. Existing architecture audited

The Express recruitment router delegates through controllers/recruitmentController.js to services/recruitmentService.js. Careers.jsx is the canonical public /careers portal. Super Admin embeds RecruitmentAdminTab; the dedicated recruitment administrator dashboard uses RecruitmentTabs. Both share the recruitment API. Android and iOS share the React Native screens in RentalHubMobile.

The existing PostgreSQL model uses recruitment_settings, recruitment_cycles, recruitment_roles, recruitment_applications, recruitment_documents, and recruitment_application_operations. Employment starts as a draft, initializes Paystack using the stored fee, verifies payment and an access code, uploads required documents, and submits for review. The existing interview engine requires shortlisting and explicit activation. Jobs export closed-cycle applicants/documents and clean up interview recordings and stale payments.

The audit included all requested entry points, recruitment migrations 060/063/064/114/115/116, jobs, authorization, feature flag middleware and Super Admin flag operations, footer visibility, eight web locales, mobile language context, API clients, guest credentials, existing payment/security tests, the email/SMS/notification services, and the shared audit logger. A repository-wide search found 261 matching source/configuration files. The recruitment module already has persisted settings; the volunteer master setting extends those settings instead of introducing a competing feature flag.

Existing work preserved: the partial services/recruitmentService.js status changes and migrations/2027_recruitment_volunteer_support.sql were already present when this task started. Migration 2027 was not edited. The unrelated social-ads/render-html-flyers.ps1 was not changed.

## 2. Integration

Opportunity classification lives on recruitment_roles and is joined into application responses. No duplicate application type column or separate volunteer application system was introduced. Opportunity type is fixed after creation, including a database guard, so existing applications cannot be reclassified to bypass payment or rewrite history. Create a new opportunity to use a different type.

Volunteer applications use the existing /apply endpoint and application reference, submit immediately to the existing review queue, and store payment_status=not_applicable, application_fee=0, application_track=standard. The UI displays payment/track as Not Applicable. No user account, staff role, salary entitlement, automatic interview, or employment is created.

## 3. Exact existing files changed

Web/shared backend repository, relative to tenant site:

- client/src/components/admin/RecruitmentAdminTab.jsx
- client/src/components/admin/RecruitmentTabs.jsx
- client/src/components/common/Footer.jsx
- client/src/i18n.js
- client/src/pages/Careers.jsx
- client/src/pages/admin/RecruitmentAdminDashboard.jsx
- jobs/recruitmentJobs.js
- routes/recruitment.js
- services/recruitmentService.js

Mobile repository, relative to tenant site/RentalHubMobile:

- src/navigation/AppNavigator.js
- src/screens/shared/CareersScreen.js
- src/screens/shared/NativeToolsScreen.js
- src/screens/shared/RecruitmentAdminScreen.js
- src/screens/shared/RecruitmentApplicationScreen.js
- src/services/recruitmentService.js

The parent repository also records the RentalHubMobile Git submodule revision when you commit the mobile changes and update that reference.

## 4. Exact new files created

Web/shared backend repository:

- client/src/components/admin/VolunteerRecruitmentControls.jsx
- client/src/components/careers/OpportunityPicker.jsx
- client/src/components/careers/VolunteerReceipt.jsx
- client/src/i18n/volunteerTranslations.js
- client/src/pages/Careers.volunteers.test.jsx
- migrations/2028_recruitment_volunteer_workflow.sql
- tests/recruitmentVolunteers.test.js
- docs/recruitment-volunteer-implementation.md (this report)

Mobile repository:

- src/components/admin/RecruitmentOpportunityManager.js
- src/i18n/recruitmentCopy.cjs

The previously untracked migration 2027 is pre-existing work, not a new file authored by this task. Include it when deploying this feature, since it is part of the existing pending migration sequence.

## 5. Migration and database changes

New migration: 2028_recruitment_volunteer_workflow.sql. It follows, and safely accommodates the columns from, the pre-existing 2027 migration.

- recruitment_roles.opportunity_type: non-null employment/volunteer classification, default employment.
- Checks restrict opportunity type and force volunteer role application/premium fees to zero.
- recruitment_settings.volunteer_applications_enabled: non-null boolean, default false.
- recruitment_applications.volunteer_motivation and availability: optional TEXT columns, required by the volunteer application handler.
- Existing payment_status check extended with not_applicable.
- Trigger protects opportunity classification history.
- Trigger forces volunteer application fees to zero, standard track, not-applicable payment, and no payment reference/date; employment applications cannot claim not-applicable payment.

No new tables. Existing applications remain employment because their existing roles default to employment. Existing role/application join indexes are reused; the pending 2027 migration already adds the type index.

The migration has NOT been applied to a live database. Schema compatibility was reviewed against the repository migrations and tested by source/contract assertions, not by executing against a disposable PostgreSQL instance.

## 6. API endpoints

Added: PUT /api/recruitment/admin/settings/volunteers with a boolean volunteer_applications_enabled. Protected by the existing authentication/recruitment-admin middleware plus a strict Super Admin check in the handler. Changes use the existing hash-chained audit logger.

Extended existing endpoints:

- GET /api/recruitment/status: independent employment and volunteer flags.
- GET /api/recruitment/roles/active: both toggles, role activation, cycle activation and date windows enforced, including when cycle_id is supplied.
- POST /api/recruitment/apply: authoritative role classification selects the unchanged paid flow or free volunteer review flow.
- POST /api/recruitment/payments/initiate: rejects volunteers before any Paystack call or gateway-key check.
- POST/PUT /api/recruitment/admin/roles[/:id]: classification at creation, immutable type on updates, server-enforced zero volunteer fees, audit events.
- GET /api/recruitment/admin/applicants: opportunity_type filtering; application lookups/details include the joined classification and volunteer answers.
- Existing document upload/generation authorization: verified volunteers can attach optional documents without payment/access codes. Supplemental volunteer uploads are limited to submitted/under_review applications.
- GET /api/recruitment/admin/analytics: type filters, explicit employment-only revenue, volunteer totals by opportunity/status/state/LGA, existing territorial scopes.
- Existing CSV/PDF/email/closure exports distinguish opportunity type and not-applicable payment.
- Existing bulk interview trigger defaults to employment; volunteers require intentional selection of a volunteer role.

A pre-existing cycle-creation validator mismatch was corrected from name/start_date/end_date to the actual title/open_date/close_date fields already used by the controller and both web forms.

## 7. Administration

Both existing web administration interfaces now show Volunteer Applications status, ON/OFF control for Super Admin, explanatory status copy, volunteer counts and breakdowns. Recruitment administrators can manage opportunities and review applicants but cannot change the volunteer master toggle.

Both existing role creation forms offer Employment or Volunteer. Volunteer fee inputs show zero and are disabled. Existing role descriptions are reused for responsibilities, skills and location/scope. Existing active/inactive controls, cycles, review actions, documents and operation trails remain in place. Applicant lists filter by All/Employment/Volunteer and clearly badge volunteer records. Volunteer answers are available in applicant rows.

The existing mobile RecruitmentAdmin workspace now includes the same opportunity creation/editing/activation, Super Admin volunteer control, applicant type filters, volunteer count, not-applicable payment labels, motivation and availability in detail records. Guest Careers/application routes and Super Admin access through More Tools were corrected so a platform account is not needed to apply.

## 8. Public Careers and internationalization

/careers remains canonical; /careers?type=volunteer focuses volunteer opportunities. Responsive cards distinguish employment and volunteering. Selecting a volunteer hides the paid/premium track and shows zero fee, volunteer motivation/availability and unpaid/no-account information. Successful submission shows Volunteer Application Received with the existing reference and manual-review wording. Optional CV/document upload is offered afterward; it is not a submission prerequisite.

The footer is visible if either intake is enabled. Volunteer-only intake no longer renders Recruitment Closed. Failed status/role requests clear availability and fail closed with retry support. Existing applicants can still view their records after intake closes.

All new public volunteer copy is supplied for English, French, Arabic, Russian, Chinese, Hausa, Yoruba and Igbo without replacing existing locale content. Mobile uses the same added copy through the existing language context.

Responsive code review covered 320/375/390px (single-column wrapping controls), 768/1024px (responsive card/form grids), and 1440px (bounded content width). Cards use minimum-width zero, wrapping text and full-width CTAs. Actual browser/device visual inspection could not be completed because the computer/browser preview tool failed to initialize.

## 9. Server-side zero-payment enforcement and security

The server loads the role from PostgreSQL. Submitted opportunity_type, application_fee, payment_status, user_type and similar fields cannot choose a cheaper flow or assign privileges. The volunteer master toggle is checked server-side independently of employment. The database trigger is a second protection against accidental volunteer charges. Historical role classification cannot be changed.

Existing Turnstile action, rate limiters, request validation, SQL parameters, authenticated admin middleware, email-plus-unguessable-reference applicant verification, MIME/extension/file-size checks, magic-byte checks and public-field redaction remain in use. New form text is length bounded. Existing paid recruitment gateway-integrity regressions still pass.

No registration, employee provisioning, staff invitation or privilege-assignment APIs are called by volunteer submission. Selected applicants are contacted manually. Email acknowledgement uses the existing mailer; recruitment administrators receive existing in-app notifications. Delivery failures are logged and do not convert a saved application into a failed submission. No new messaging provider or environment variables.

Administrative events use the existing audit logger: VOLUNTEER_APPLICATIONS_ENABLED, VOLUNTEER_APPLICATIONS_DISABLED, VOLUNTEER_OPPORTUNITY_CREATED, VOLUNTEER_OPPORTUNITY_UPDATED. The existing application operation trail receives volunteer_submitted.

## 10. Tests and verification evidence

New backend tests: tests/recruitmentVolunteers.test.js — 16 tests passed. Coverage includes disabled volunteer intake, all four toggle combinations, zero fees/no Paystack, role/payload tampering, employment payment preservation, active/date-gated opportunities, location restrictions, required volunteer answers, Super Admin-only setting changes, audit events, free role creation, immutable type, applicant filtering, employment-only revenue, optional upload credential protection, and migration contracts.

Existing payment/guest/interview focused suite: 26 tests passed.

Full backend suite: tests 409; pass 409; fail 0.

Web suite: 3 files passed; tests 13 passed. New tests cover independent availability, both OFF, volunteer deep links, hidden premium track, safe status API failure, optional-CV receipt, complete locale keys, and an actual volunteer form submission whose only POST is /recruitment/apply.

Website production build: passed; final Vite build completed in 1m 1s after admin layout verification. Existing large-chunk warning remains; it is not a build error and was not suppressed.

Mobile typography/component checks: passed, including 199 parsed screen/component files, valid typography imports, all three platform font mappings, and shared input behavior.

Android production JavaScript/Hermes bundle: passed, exported to the task scratch directory. This is a bundle check, not a newly signed APK/AAB.

iOS production JavaScript/Hermes bundle: passed; index-a3603721b27eb3fba6aa28eb1018333b.hbc (5.9 MB), exported successfully. A signed iOS archive requires the existing macOS/Xcode or EAS release workflow; it cannot be produced as an IPA by this Windows bundle check.

No new dependencies or environment variables were introduced.

## 11. Deployment and activation

1. Commit and push the mobile repository first. Commit/push the web/backend repository including its updated RentalHubMobile submodule revision, the pre-existing pending 2027 migration and new migration 2028.
2. Deploy both repositories with the submodule checked out at the recorded revision. Back up the production database before schema changes.
3. From tenant site, run:

~~~sh
npm run migrate:dry-run
npm run migrate
npm --prefix client run build
pm2 reload rentalhub --update-env
~~~

Run the migrations before exposing the new server code to traffic. Both pending recruitment migrations must be present; do not mark them applied manually or edit historical applied migrations.

4. In Super Admin > Recruitment, create/select an active cycle with valid dates. Create an opportunity with type Volunteer, a title/description and the appropriate category. Keep it active. Confirm existing state/LGA activation rules allow the intended applicants.
5. Turn Volunteer Applications ON. Normal recruitment can remain OFF. Use /careers?type=volunteer in campaigns.
6. Produce and distribute new mobile releases using the existing Android and iOS signing/versioning workflows. The shared source changes do not appear in already-installed binaries until a new release/update is distributed.
7. Submit one controlled volunteer application after deployment, confirm zero payment/received reference/admin queue/acknowledgement, then verify a paid employment application still opens the normal payment flow. Confirm email and push delivery under the existing production configuration.

## 12. Remaining limitations and recommendations

- Live database migration and a production payment-provider smoke test were not run.
- Browser/device visual QA is still needed at the requested widths; automated render tests and responsive code review passed.
- SMTP/push delivery depends on the existing server configuration. No real campaign applicant messages were sent during tests.
- Opportunity type is deliberately immutable after creation. Create a new opportunity when changing between volunteering and employment.
- CV upload uses the existing web document and mobile media-selection capabilities. Volunteer applicants are not forced to provide the employment document bundle or enter the interview flow.
- No opportunities were hard-coded or seeded, and neither intake was enabled on a live system by this task.
