# Assisted registration: release notes and deployment

Support staff can create Nigerian tenant and landlord accounts directly, using the existing registration, NIN checks, location pricing, lawyer selection, bank transfer and virtual-account infrastructure. Ordinary self-registration continues to require email. Assisted customers may omit email. In the mobile app they can sign in with a code sent to their own phone; the website keeps one sign-in field that accepts email or a verified phone number plus the customer's password.

## Customer and staff workflow

1. Authorized support staff open **Assisted account registration & receipts** on the website, or **Assisted registration** in the mobile support workspace. Super Admin and Zonal Admin have entries too.
2. Staff enter the customer's details, select a state/LGA, explain the account and fee, obtain consent and review the server-calculated quote. A changed quote must be reviewed again.
3. The account is created unpaid unless the authoritative fee is zero. Retrying the same creation request does not create another account.
4. The customer signs in with the mobile phone-code flow, or with the website's single email/verified-phone field and their password. Unpaid accounts open the registration-payment screen. Private APIs and realtime connections also enforce payment status.
5. The customer can use the existing generated receiving account or manual bank-transfer review. Card payments require the customer's actual email address. After an external card checkout on mobile, return to the app and select **Check card payment**.
6. Staff may record actual cash collected. This produces a paid payment record and downloadable PDF receipt, identifies the collector and creates an outstanding remittance obligation. A different Super Admin/Super Support Admin acknowledges cash remittance. Commission distribution waits for remittance; paid provider assignments are retried when necessary.
7. The customer can set a personal password from Profile or the registration-payment screen after a fresh phone code. Older sessions are revoked. Staff never receive a customer password or login session.

A captured transfer screenshot is evidence for review, not payment confirmation. Zero-fee accounts complete within the account transaction without invoking Paystack. Existing verified customers can also use phone codes; privileged staff accounts cannot sign in through this customer phone-code flow.

## Fingerprint status

The U.are.U 4500 and currently installed software provide capture. This release does **not** implement fingerprint enrollment, matching, account lookup or recovery. The staff workspace and protected status endpoint explicitly show matching as unavailable. There is no environment switch that activates it, and no fingerprint images or templates are stored by this feature. A validated matching engine and secure enrollment/recovery integration are still required. A scan must not become a customer-session or privileged-action bypass.

## Database migration

`2030_assisted_registration_office_verification.sql` is new and has not been run against the hosting server in this task.

- Adds `users.assisted_registration` (default false) and normalized `phone_login_key` with an active-user unique index and trigger.
- Makes email nullable only for assisted tenant/landlord accounts through a database constraint. Registration-payment rows may omit email only when their server-created payload identifies assisted registration.
- Adds `assisted_registration_requests` for creation idempotency, `assisted_registrations` for fees, consent, cash accountability and benefit retries, and `assisted_phone_challenges` for expiring hashed codes.
- Existing duplicate normalized phone numbers are not automatically merged or assigned to an arbitrary account. Ambiguous phone sign-in is rejected; resolve such accounts through the existing reviewed correction process.
- Existing users keep `assisted_registration=false`. No recruitment records, roles, accounts or payment history are deleted.

## Endpoints

All paths below start with `/api/assisted-registration`.

- Public, rate-limited: `POST /phone/request` (Turnstile), `POST /phone/verify`.
- Customer authentication: `GET /me`, `POST /payment`, `POST /payment/verify`, `POST /password` (fresh recovery code for the same customer).
- Authorized support role plus existing privileged MFA: `GET /staff`, `POST /staff`, `POST /staff/quote`, `GET /staff/config`, `GET /staff/request-id`, `GET /staff/biometric-status`, `GET /staff/:reference`, `POST /staff/:reference/cash`, `POST /staff/:reference/remittance`, `GET /staff/:reference/receipt`.

Staff access is restricted to `super_admin`, `super_support_admin`, `zonal_admin`, `state_support_admin`, and `lga_support_admin`, with jurisdiction enforced in the service. The existing marketing-agent registration architecture is not replaced. Responses use `Cache-Control: no-store`.

The existing login accepts email or a verified normalized phone number. The existing registration finalizers settle an assisted invoice instead of creating a second account. Reminder reconciliation and abandonment exclude assisted invoices. Existing hourly registration jobs retry paid benefit assignments and remove expired phone challenges after one day.

Email delivery skips absent recipients and rejects malformed recipients before contacting the email provider. Existing card initialization paths reject missing email rather than inventing an address. Verification status treats absent email as optional only for assisted accounts; phone and identity requirements remain.

## Files added

Backend:
- `migrations/2030_assisted_registration_office_verification.sql`
- `config/middleware/assistedAccessGate.js`
- `config/utils/paymentEmail.js`
- `services/assistedRegistrationPolicy.js`
- `services/assistedRegistrationService.js`
- `routes/assistedRegistration.js`
- `tests/assistedRegistration.test.js`

Web:
- `client/src/components/common/PhoneAccountAccess.jsx`
- `client/src/components/common/AssistedPasswordForm.jsx`
- `client/src/pages/RegistrationPayment.jsx`
- `client/src/pages/admin/AssistedRegistration.jsx`
- `client/src/i18n/assistedRegistration.json`
- `client/src/pages/AssistedRegistration.test.jsx`

Mobile (Android and iOS share these sources):
- `RentalHubMobile/src/components/common/PhoneAccountAccess.js`
- `RentalHubMobile/src/components/common/AssistedPasswordForm.js`
- `RentalHubMobile/src/screens/auth/RegistrationPaymentScreen.js`
- `RentalHubMobile/src/screens/admin/AssistedRegistrationScreen.js`
- `RentalHubMobile/src/i18n/assistedRegistration.json`

Documentation: this file.

## Files updated

Backend: `server.js`, `config/middleware/auth.js`, `config/utils/realtimeSocket.js`, `config/utils/mailer.js`, `services/authService.js`, `jobs/registrationReminderJobs.js`, `routes/users.js`, `routes/zonalAdmin.js`, `services/paymentService.js`, `services/transportationService.js`, `services/fumigationCleaningService.js`, `services/evidenceVerificationService.js`, `services/recruitmentService.js`, `routes/propertyAlerts.js`.

Web: `client/src/context/AuthContext.jsx`, `client/src/pages/App.jsx`, `client/src/pages/Login.jsx`, `client/src/pages/Profile.jsx`.

Mobile: `src/navigation/AppNavigator.js`, `src/screens/auth/LoginScreen.js`, `src/screens/dashboard/ProfileScreen.js`, `src/screens/shared/VerificationStatusScreen.js`, `src/screens/service-admin/ServiceOperationsDashboardScreen.js`, `src/screens/admin/SuperAdminDashboardScreen.js`, `src/screens/shared/ZonalAdminScreen.js`.

## Deployment

No new environment variables or dependencies were added. Existing SMS, Turnstile, identity verification, payment-provider, JWT and database configuration must be working. Migration 2030 is confirmed applied on the hosting server (178/178 migrations). No live account, charge or SMS was run for verification.

Deploy the migration before running the new backend code, using the existing maintenance/release procedure:

```sh
cd /var/www/rentalhub
npm run migrate:dry-run
npm run migrate
npm run build --prefix client
pm2 restart rentalhub
```

Commit and publish both repositories using the existing workflow: `RentalHubMobile` is a Git submodule, so the parent repository must reference the intended mobile commit. Build and distribute new Android/iOS releases to expose the new mobile screens. A JavaScript export is not an APK or signed iOS archive; iOS native release building requires the project's Mac/Xcode build environment.

Before rollout, exercise one scoped support registration on staging, SMS delivery, a real sandbox-provider payment, cash receipt generation and independent remittance acknowledgement. No live database/provider end-to-end transaction was run here. Phone-only customers should use transfer/wallet methods where supported; card checkout requires a real email. Test the configured virtual-account provider's phone-only customer behavior; the existing manual bank-transfer fallback remains available.

## Verification results

- Backend: 529 tests passed, 0 failed (full suite).
- Web: 119 tests passed, 0 failed across 12 files (full suite).
- Web production build: passed. Existing large-bundle warnings remain; they are not hidden.
- Focused assisted-registration tests cover scoped authorization, fee integrity, cash remittance, OTP rejection, password re-verification, revoked sessions, email guards, zero-fee completion and mobile routing.
- Three earlier existing frontend tests hit timeouts during concurrent builds. Their isolated rerun passed, and the final full web suite also passed.
- Android JavaScript/Hermes bundle: passed (final export).
- Android release APK 1.0.44 (versionCode 55) built, signed, zipaligned and deployed to `/api/downloads/app` on 2026-10-26. Live `/api/downloads/version` reports `apkAvailable: true`.
- iOS JavaScript/Hermes bundle: passed (final export).
- Mobile language round-trip checks: passed for all 8 languages and both old native direction states.
- Mobile tour checks: passed for 87 steps, 21 administrative roles and 32 role-navigation audits.
- Mobile typography checks: passed for Android, iOS and web; 204 screen/component files parsed.
- Existing WebRTC package-export fallback warnings remain in mobile bundling. The Android APK above is the release artifact; no signed IPA was built or installed.
- Validation logs are retained locally under RentalHubMobile/.codex-tmp/assisted-*.log. Generated bundle directories were removed after successful verification.
