# Role dashboard arrangement — 13 November 2026

The approved arrangement is implemented in web and shared Android/iOS source. Existing case messages stay in disputes/dispute_messages and existing dispute detail screens. No conversation table, chat service, payment fee, database migration or staff permission was added.

## Arrangement
| Person | Entry | Starting view |
|---|---|---|
| Tenant / landlord | Amana Property Protection | My property records |
| Agent | Assigned protection inspections | Assigned work |
| Professional | Assigned property reviews | Assigned work |
| Support Admin | Assigned property cases | Assigned work |
| State / LGA / zonal administrator | Property Protection review | Area review |
| Super Admin | Property Protection management | National oversight |

Both platforms use the same entryFor/resolveView rules. Invalid customer links fall back to the customer view; the existing backend still independently checks every permission. Staff work views do not offer personal registration by default. A staff member can deliberately select their own records without acquiring review rights over them. Customers retain free registration. The duplicate landlord web card was removed. New staff cards sit below existing dashboard headers rather than inside heading text. Agent/professional shortcuts use their assigned-work labels. The account menu and mobile More entry use the same role rules. Back links lead to the correct dashboard or work queue. The new customer My property records label was added for all eight supported languages; administrator controls stay English.

Super Admin has direct links to existing location pricing and staff conduct management. Conduct management loads staff documents and the review queue, not Super Admin personal signing/payment information. Other eligible admins retain their signing process; Recruitment retains review duties. Backend exclusion of Super Admin signing remains unchanged.

## Maintenance and authentication
No maintenance or authentication setting was changed. Tests run the actual maintenance middleware with isolated signed test sessions: web cookies and mobile bearer sessions for Super Admin can reach MFA verification and protected dashboard requests; ordinary/invalid sessions remain blocked. The existing six-digit authenticator validator and existing web/native popup remain in use. This is not a claim that a real Super Admin authenticator code or physical phone was tested. No real code, password or customer account was requested.

## Checks
- Final full website suite: 192 tests passed in 33 files, including the dashboard MFA gate. Final server run: 184.70 seconds; production build: 9.27 seconds.
- Final full backend suite: 200 passed, zero failed, including maintenance, real expiry, duplicate limiting and dashboard-entry tests.
- Mobile workflow/role routing: nine passed. Private file helper: four passed.
- Existing registration checks passed.
- Tour check passed: 87 steps, eight locales, 15 actionable routes.
- Changed source parses; imported JSX component bindings checked.
- Existing case link tests still target the existing dispute route.
- No real charge, customer message or identity verification was sent by these tests.

## Release and deployment
Initial arrangement commit: web 1d776818c27fac14665bea9849d3321c8db8abdc; mobile bad5984a75d8f6b69a07a98688fb6a21ba89853a.
Target release: Android v1.0.64/build75; iOS source v1.0.64/build69. A signed iOS IPA requires macOS/Xcode and Apple signing and is not produced here. Existing published iOS version metadata must not pretend a new binary has shipped.
The deployment uses an isolated server copy for tests and build, verifies existing live source hashes, backs up overwritten files/website/version metadata, and copies website assets before atomically replacing index.html. The UI arrangement itself needed no backend restart. Follow-up authentication corrections changed runtime code and reloaded only RentalHub. No migration was needed. Maintenance mode and the five paid-service switches remain as configured. The new signed APK passed its checks and is published.

Final release evidence follows below. No physical-device or visual screenshot acceptance test is claimed.

## Exact web/backend file changes
```text
M	RentalHubMobile
A	client/src/components/admin/AdminDashboardGate.jsx
A	client/src/components/admin/AdminDashboardGate.test.jsx
M	client/src/components/common/Header.jsx
M	client/src/components/common/MfaCodeModal.jsx
A	client/src/components/common/PropertyProtectionEntry.jsx
M	client/src/components/common/TurnstileWidget.jsx
A	client/src/components/common/TurnstileWidget.test.jsx
M	client/src/i18n/ar.json
M	client/src/i18n/en.json
M	client/src/i18n/fr.json
M	client/src/i18n/ha.json
M	client/src/i18n/ig.json
M	client/src/i18n/propertyProtectionCopy.json
M	client/src/i18n/ru.json
M	client/src/i18n/yo.json
M	client/src/i18n/zh.json
M	client/src/pages/CustomerGoogleSignIn.jsx
A	client/src/pages/CustomerGoogleSignIn.test.jsx
M	client/src/pages/Dashboard.jsx
M	client/src/pages/PropertyProtection.jsx
A	client/src/pages/PropertyProtection.roles.test.jsx
M	client/src/pages/SuperAdminDashboard.jsx
M	client/src/pages/admin/AdminConduct.jsx
A	client/src/pages/admin/AdminConduct.roles.test.jsx
M	client/src/pages/admin/AdminDashboard.jsx
M	client/src/pages/admin/LgaSupportAdminDashboard.jsx
M	client/src/pages/admin/StateAdminDashboard.jsx
M	client/src/pages/admin/StateSupportAdminDashboard.jsx
M	client/src/pages/admin/SuperSupportAdminDashboard.jsx
M	client/src/pages/admin/ZonalSupportAdminDashboard.jsx
M	client/src/pages/agent/AgentDashboard.jsx
M	client/src/pages/lawyer/LawyerDashboard.jsx
M	client/src/propertyProtection/workflow.cjs
A	client/src/services/turnstileScript.js
A	client/src/services/turnstileScript.test.js
M	config/middleware/securityRateLimiters.js
M	config/utils/redis.js
A	docs/property-protection-dashboard-arrangement.md
M	routes/auth.js
A	services/dashboardMfaCheck.js
A	tests/services/authRateExpiry.test.js
A	tests/services/dashboardMfaCheck.test.js
A	tests/services/maintenanceSuperAdmin.test.js
```
## Exact mobile file changes
```text
M	android/app/build.gradle
M	app.json
M	ios/RentalHubMobile.xcodeproj/project.pbxproj
M	package-lock.json
M	package.json
M	scripts/test-property-protection.cjs
A	src/components/dashboard/PropertyProtectionEntry.js
M	src/i18n/propertyProtectionCopy.json
M	src/propertyProtection/workflow.cjs
M	src/screens/admin/AdminDashboardScreen.js
M	src/screens/admin/AdminSupportDashboardScreen.js
M	src/screens/admin/SuperAdminDashboardScreen.js
M	src/screens/agent/AgentDashboardScreen.js
M	src/screens/lawyer/LawyerDashboardScreen.js
M	src/screens/lawyer/StateLawyerDashboardScreen.js
M	src/screens/lawyer/SuperLawyerDashboardScreen.js
M	src/screens/lawyer/ZonalLawyerDashboardScreen.js
M	src/screens/shared/AdminConductScreen.js
M	src/screens/shared/NativeToolsScreen.js
M	src/screens/shared/PropertyProtectionScreen.js
M	src/screens/shared/ZonalAdminScreen.js
M	src/screens/state-admin/StateAdminDashboardScreen.js
```


## Final release evidence

Web dashboards deployed and checked: health, Property Protection and Super Admin pages return HTTP 200. The final isolated server suite passed 192 tests across 33 files in 184.70 seconds; the production web build passed in 9.27 seconds. No database migration, dependency change, environment variable or backend restart was needed for this UI release.

Android: **v1.0.64, build 75**. BUILD SUCCESSFUL in 39m 7s. The APK identifies as com.rentalhubng; its signing certificate matches the prior release. All 13 checked bundled source files are current, and all 344 frozen mobile files remained unchanged during the build.

- Public download: https://rentalhub.com.ng/api/downloads/app?v=1.0.64
- Local archive: RentalHubMobile/build/releases/Amana-RentalHub-NG-v1.0.64.apk
- Size: 109268663 bytes
- SHA-256: 6f14c0f909b9031e7110f9f0c5272f2cf0edbff42520ef15165a4a8a038ddd50
- Signing certificate SHA-256: be593ddf8cc4bc731d682390be4d92b9e763441725da368c37c0ca6443a6dd9d

The full public download matched the archived APK by size and SHA-256. The deployed version handler reports update_available=false for 1.0.64/build75 and true for 1.0.63/build74. These handler checks do not change or bypass the maintenance setting for real customers. The existing public download/version metadata routes remain available during maintenance.

iOS JavaScript bundle: iOS Bundled 1335314ms index.js (1465 modules). Bundle and source map written successfully. iOS shared source is v1.0.64/build69; a signed IPA was not produced or published on Windows. A Mac and Apple signing remain required.

Server stage: /var/www/rentalhub/.release64-DarPbC. Backup: /var/backups/rentalhub/release-1.0.64-20261113T053132086Z, including prior website/source/version metadata and APK v1.0.63. Existing release warnings about web chunk sizes and deprecated native APIs remain; no errors were hidden. Source changes were committed without audio files. This report is the additional created file docs/property-protection-dashboard-arrangement.md.

Evidence files in RentalHubMobile/.codex-tmp/protection/: arrangement64-backend-final.log, web64-results.log, arrangement64-mobile.log, arrangement64-private-files.log, arrangement64-maintenance.log, arrangement64-tour.log, arrangement64-registration.log, android64-build.log, android64-source-proof.log, android64-signature.log, ios64-build.log, public64-proof.log and production-final64.log.


## Follow-up sign-in and missing-popup corrections

During acceptance checking, the user reported that Cloudflare did not finish, and that the page showed a security request limit. The public Cloudflare key was present in the published bundle. The code audit found two definite counter defects: the existing in-memory Redis-compatible adapter did not expire entries, and the same middleware could count one request twice. Expiry now works for milliseconds/seconds and EX/PX cache writes; each limiter instance counts a request once, with separate namespaces and accurate remaining-window timing. Session/MFA status reads, including the new read-only entry check, do not consume the credential-attempt budget. Configured maximums and windows were not increased. Existing database-backed account/TOTP lockouts remain in place. The current fallback remains process-local rather than shared/durable Redis; that limitation is not presented as solved.

Web Google sign-in now waits until the visitor chooses it. The explicit mobile browser handover remains eager because the user already selected Google in the app. This prevents an unused customer Google request from showing errors or consuming security budget during Super Admin password sign-in. Cloudflare now has load/error/timeout feedback, manual retry, proper widget cleanup and a safe CF-prefixed diagnostic when a numeric provider error is returned. No token is manufactured on retry/error. Server Turnstile verification remains mandatory. Messages were added in all eight supported locales.

The user then confirmed password sign-in worked but reported no authenticator popup. A read-only metadata check confirmed Super Admin TOTP was enabled, with no enrollment grace and the last verification more than 18 hours old. The welcome menu had not called a protected tool, so its existing API-driven popup was not triggered yet. This was not caused by maintenance mode.

The web Super Admin entrance now uses GET /api/auth/2fa/check before mounting its dashboard controls. This endpoint requires authentication, a current privileged role and the existing requirePrivilegedMfa guard; it returns no business data. Cancelling or failing verification leaves the dashboard closed, with an explicit retry. The global MFA modal now reads the pending challenge immediately when subscribing, preventing a first-event race. Android/iOS already request protected dashboard data on entry and reuse the same guard; these follow-up server/web changes required no new native rebuild. The existing 15-minute remembered-verification window and enrollment policy were preserved. No per-device/per-login MFA redesign is claimed.

Additional acceptance tests passed: counter expiry/OTP expiry, once-per-request counting and quota enforcement; Cloudflare load/error/timeout/cleanup/retry; deliberate Google start and preserved mobile handover; unauthenticated/customer/stale-MFA rejection; success only after the existing guard; hidden controls while pending; cancellation staying locked; first-popup subscription race; malformed verification responses failing closed. Totals after these fixes are **200 backend, 192 web and 13 mobile checks passed**, plus registration/tour checks.

Auth correction backup: /var/backups/rentalhub/release-1.0.64-auth-20261113T063638851Z. Dashboard-entry backup: /var/backups/rentalhub/release-1.0.64-mfa-20261113T072210727Z. Runtime source commits include cf16193061faf8075843c7f12b82583405db11fc, 71907de1969705c3274778d9f9902b00c4220e39 and 260b3fa. The final read-budget patch was separately tested on the server. No credentials, authenticator secret or real code were requested. The user confirmed Cloudflare/password login; the latest authenticator-entry re-test is awaiting user confirmation. This report does not claim a completed physical-device or real-code acceptance test.

Official reference used for provider error/retry behaviour: [Cloudflare Turnstile client-side errors](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/). Implementation keeps the existing server verification and provider challenge. Live read-only browser checking verified the retry control appears when the security check remains pending; no CAPTCHA was solved by the agent.

Latest evidence: final64-backend.log, mfa-entry64-web-all.log, final64-server-tests.log, auth64-deploy.log, mfa64-deploy.log, status64-deploy.log, mfa64-read-budget-test.log and the previously listed APK proof logs.


Final public smoke checks: health 200; downloadable Android metadata 1.0.64/build75 with APK available; anonymous MFA-check requests remain blocked by the existing maintenance response; a blank login request without a Cloudflare token is rejected with HTTP 400 (Security check required). Maintenance mode was not turned off. The final status-read correction passed its server test and reloaded only RentalHub. I did not run git push or alter VPS Git history; runtime deployment is recorded by the release manifests and source commits.
