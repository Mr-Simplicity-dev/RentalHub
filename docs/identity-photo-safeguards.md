# Identity face photos and conflict safeguards

Migrations: `2040_identity_photo_safeguards.sql` and `2041_legal_identity_review.sql`. Apply with the normal migration runner before restarting the backend. No new environment variables or packages.

The live face photo is the account avatar, served only through the authenticated `/users/passport-photo/:filename` route. The passport document page is never an avatar. Both existing photo-upload URLs use the protected upload handler. Capture tokens are one-use records shared between server workers and expire in ten minutes.

Automatic verification requires a verified identity number, a matching trusted identity portrait, an accepted liveness check, explicit recorded biometric consent, a confirmed gallery search, and confirmed enrolment. Missing or ambiguous checks stay pending for the existing admin review workflow. Assisted captures always require review. The applicant can decline biometric processing and use manual review. The acknowledgement does not grant privileged access.

The service uses Prembly's documented liveness, face-comparison and face-gallery endpoints. The provider charges for biometric operations in live use. Tests mock those operations. Enrolment is never attempted for historical users without their consent. Gallery coverage therefore grows with consenting users; it is not a claim that every historical account has been face-matched. Provider/API entitlement and score calibration require controlled production validation before relying on biometric automation. Scores are conservatively routed to review when unclear.

Reference portraits from successful identity responses are encrypted using the existing NIN encryption key and never returned to clients. Raw portraits, passport images and verification tokens are redacted from audit metadata. Canonical local photo hashes identify repeated files; they do not substitute for face recognition.

Registration and identity changes preserve phone/email/NIN/passport checks. A transaction-locked database trigger prevents concurrent reuse of NIN/passport identities while leaving historical duplicates intact for investigation. Matching names flag review and are not proof of fraud. Existing verified accounts are not automatically revoked by this migration.

Legal assignments and case actions check the lawyer against the client, dispute parties and property owner. Case-specific private face comparisons require recorded consent for both current photos. Without consent, Super Admin must record a manual conflict review bound to the current photo pair. A new photo invalidates that review. No historical face is sent to the provider silently. Positive matches, missing photos and uncertain provider results block the action for review. Evidence uploaders cannot independently verify their own evidence. Definitive comparisons are cached by immutable photo hashes; failures are not interpreted as no match or automatically retried as paid checks.

Super Admin can record a reasoned investigation in the existing verification queue. This resolves a review flag but does not approve an account. Approval is separate, requires a note, cannot be self-approval and cannot override an actual duplicate identifier. Existing administrator authorization and territorial restrictions remain. The flag-review endpoint additionally requires privileged MFA.

Gallery enrolment has an uncertainty marker for lost provider replies. Account deletion erases confirmed or possibly stored gallery entries first; outages preserve the account for retry rather than claiming erasure. These hooks cover customer deletion and existing admin deletion services. Keep the existing verification-photo retention policy under review; this change does not silently delete historical files or audit evidence.

Read-only audit: `node scripts/auditIdentitySafeguards.js`. It prints aggregate duplicate counts and photo/enrolment totals, without names, identifiers, photos or provider calls.

Android release source: 1.0.58 / 69. iOS source: 1.0.58 / 63; building and distribution require macOS/Xcode and signing. Web/native code share server rules. Manually validate a consenting test user, an outage, two different people with a shared name, a matching legal-party identity, avatar load/error and token refresh on devices before broader rollout.

## Verification results

VPS backend: 60 tests passed. Web: 140 tests in 20 files passed. React production build passed. Temporary PostgreSQL probes passed for concurrent-identity protection and one-use capture tokens. Registration and embedded-payment regression scripts passed. Unauthenticated private-photo access returns 401; the public uploads path returns 403; unauthenticated flag review returns 401. Read-only Prembly gallery lookup returned the expected missing-subject result, confirming route access without enrolling a face or billing a verification. No real-person biometric check was performed.

The read-only live-record audit found zero duplicate NIN, passport or normalized-phone groups. Historical gallery enrolment remains zero; existing photos were not enrolled without consent. Existing build-size and React Native deprecation warnings were not suppressed. Android and iOS device acceptance testing remains distinct from these automated tests.

## Exact implementation files

Web/backend paths are relative to the main project root:

- `client/src/components/admin/UsersTab.identity.test.jsx`
- `client/src/components/admin/UsersTab.jsx`
- `client/src/components/admin/VerificationsTab.jsx`
- `client/src/components/common/Header.jsx`
- `client/src/components/common/UserAvatar.jsx`
- `client/src/components/common/UserAvatar.test.jsx`
- `client/src/i18n/ar.json`
- `client/src/i18n/en.json`
- `client/src/i18n/fr.json`
- `client/src/i18n/ha.json`
- `client/src/i18n/ig.json`
- `client/src/i18n/ru.json`
- `client/src/i18n/yo.json`
- `client/src/i18n/zh.json`
- `client/src/pages/Profile.jsx`
- `client/src/pages/SuperAdminDashboard.jsx`
- `config/middleware/auditMiddleware.js`
- `config/middleware/upload.js`
- `config/utils/premblyResponse.js`
- `docs/identity-photo-safeguards.md`
- `migrations/2040_identity_photo_safeguards.sql`
- `migrations/2041_legal_identity_review.sql`
- `routes/admin.js`
- `routes/auth.js`
- `routes/users.js`
- `scripts/auditIdentitySafeguards.js`
- `services/adminService.js`
- `services/authService.js`
- `services/credentialRevalidationService.js`
- `services/identityPhotoService.js`
- `services/legalService.js`
- `services/premblyRecoveryService.js`
- `services/superAdmin/bulkActionService.js`
- `services/superAdmin/schemaHelpers.js`
- `services/superAdmin/userService.js`
- `services/superAdmin/verificationService.js`
- `tests/services/identityApproval.test.js`
- `tests/services/identityPhoto.test.js`

Android/iOS paths are relative to RentalHubMobile:

- `src/components/common/UserAvatar.js`
- `src/i18n/identityPhotoCopy.cjs`
- `src/screens/dashboard/ProfileScreen.js`
- `src/screens/dashboard/DashboardScreen.js`
- `src/screens/admin/SuperAdminDashboardScreen.js`
- `src/services/authService.js`
- `src/services/superAdminService.js`
- `src/navigation/AppNavigator.js`
- `android/app/build.gradle`
- `ios/RentalHubMobile.xcodeproj/project.pbxproj`
- `app.json`
- `package.json`
- `package-lock.json`
