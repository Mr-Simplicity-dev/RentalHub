# Runtime, Security, Parity, Smoke-Test, and UX Audit

**Date:** 2026-09-04  
**Scope:** Express backend, React web client, React Native/Expo Android and iOS client  
**Method:** Repository inspection, local executable checks, dependency audit, route smoke probes, build attempts, and static parity review

## Executive Conclusion

This project is **not runtime-proven end to end**. The backend is the strongest area, but web workflows, Android, and iOS are not fully validated. The project should not be considered ready for a full external penetration test or production security sign-off.

The most urgent items are:

1. Rotate every credential present in `.env` and verify those credentials have never been committed or copied into deployment artifacts.
2. Replace the placeholder JWT secret and reject startup when required security keys are missing or weak.
3. Fix the Android syntax error in `RentalHubMobile/src/screens/shared/ContactWidgetScreen.js`.
4. Remediate the backend dependency advisories in `qs` through Express/body-parser.
5. Enforce content/magic-byte validation on all upload paths.
6. Add authenticated end-to-end tests for web and mobile workflows.
7. Build and test iOS on macOS/Xcode or CI/EAS; this was not possible on Windows.

## Evidence Summary

### Verified

- Backend tests: **169 passed, 0 failed**.
- React client tests: **4 passed, 0 failed**.
- React production build: **successful**.
- Mobile API contract check: **410 calls, 0 unmatched**.
- Backend syntax checks for the entry point and reviewed upload routes: **passed**.
- Local smoke probes against the running backend:
  - `/api/health`: `200`
  - `/`: `200`
  - `/api/auth/me`: `401`, showing unauthenticated protection
  - `/voice/incoming`: `200`
  - Several guessed API paths returned `404`; route-map confirmation is still required.
- Android Gradle wrapper started successfully and reached Metro bundling.

### Not proven

The following were not proven against a production-like environment or real devices:

- Complete registration, login, logout, password recovery, and session-revocation journeys.
- Property search, property creation, editing, media upload, landlord, tenant, and application workflows.
- Payments, refunds, webhooks, payment replay protection, and failed-payment recovery.
- Support, escalation, voice calling, callbacks, recordings, and admin operations through the real providers.
- Push notifications, SMS, email, Cloudinary, Google Maps, CAPTCHA, Redis, and other external integrations.
- Full authorization coverage across all backend routes and every role/jurisdiction combination.
- Production HTTPS, reverse proxy behavior, cookies, CSRF, CORS, CSP, HSTS, and rate limits.
- Production database migrations and rollback behavior.
- Browser compatibility and responsive behavior.
- Accessibility, keyboard navigation, focus management, screen readers, and form error UX.
- Android installation, launch, permissions, deep links, payments, push notifications, background behavior, and release signing.
- iOS compilation, installation, launch, permissions, deep links, payments, push notifications, and release signing.

The mobile API contract check proves that client API paths match known backend routes. It does **not** prove that the screens, navigation, permissions, authentication, or workflows operate correctly.

## Security Findings

### Critical: credentials and weak JWT secret in `.env`

The repository contains provider credentials in `.env`, including database, MongoDB, Paystack, Cloudinary, email, search, CAPTCHA, AI, SMS, and Google-related credentials. The JWT secret is also a placeholder value.

Actions:

- Rotate all affected credentials immediately.
- Check git history, CI logs, deployment bundles, backups, and developer machines for copies.
- Use a secret manager in deployed environments.
- Reject production startup for placeholder or weak JWT secrets.
- Confirm `.env` is ignored and never served as a static asset.

References: `.env`, `server.js`.

### High: NIN encryption can be disabled while the server continues

The server warns when `NIN_ENCRYPTION_KEY` is missing or too short instead of failing closed. Identity data may then be stored or returned without the intended protection.

Actions:

- Fail production startup when the key is missing or invalid.
- Audit existing records for plaintext or incorrectly encrypted values.
- Ensure response serializers never expose unnecessary identity numbers.
- Add a runtime test that startup and identity operations fail safely without the key.

References: `server.js`, `config/utils/ninEncryption.js`, `routes/users.js`.

### Moderate: dependency advisories

`npm audit --audit-level=moderate` reported **3 moderate vulnerabilities** in `qs`, reached through `body-parser` and Express. A fix was reported as available through `npm audit fix`.

Actions:

- Update the dependency tree in a controlled branch.
- Review the lockfile diff.
- Run backend and client tests after the update.
- Confirm production behavior for query parsing and request-size limits.

The client audit could not complete because the npm advisory endpoint timed out during the check.

### Moderate: inconsistent upload content validation

Property media and recruitment uploads trust client-declared MIME types. This permits mislabeled or malformed files to reach downstream processing or storage. Passport and evidence paths have stronger content checks.

Actions:

- Validate magic bytes/content signatures for every file type.
- Enforce server-side size, dimension, duration, and format limits.
- Transcode or re-encode media before public delivery where appropriate.
- Scan documents and media for malware.
- Store uploads outside executable/static paths.
- Add negative tests using mislabeled files and polyglot payloads.

References: `config/middleware/upload.js`, `routes/properties.js`, `routes/recruitment.js`.

### Low/Moderate: middleware ordering and public operational data

Some location, blog, and `.well-known` routes are mounted before the global Helmet/CORS middleware. Confirm these responses receive the intended security headers.

`/api/health` publicly reveals uptime, timestamp, database health, and Redis state. Decide whether this operational detail should be public or restricted.

### High configuration risk: insecure CORS escape hatch

`ALLOW_INSECURE_CORS_ORIGINS=true` weakens production HTTPS-origin enforcement while credentials may be enabled. This can expose authenticated requests to insecure origins.

Actions:

- Reject this setting in production.
- Allow only an explicit HTTPS origin allowlist.
- Add an integration test for origin, credentials, preflight, and cookie behavior.

### Operational risk: VAPID keys reset on restart

The server reported that VAPID keys are not configured and runtime keys are being generated. Push subscriptions can become invalid after restart.

Actions:

- Configure persistent `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` deployment secrets.
- Add startup validation and a deployment smoke test for push subscription continuity.

## Web/Mobile Parity Findings

- Mobile guest “List Property” navigates to an unregistered screen.
- Transportation and fumigation admin dashboards are mapped but unreachable for some roles.
- Marketing-agent functionality exists on web but has no mobile equivalent.
- Voice operations/support-desk functionality exists on web but has no mobile equivalent.
- iOS declares location permission; Android does not.
- Physical-device API configuration is not proven. Android uses emulator-specific addressing, while iOS development defaults to `localhost`.
- API path parity passes, but screen, permission, navigation, and workflow parity does not.

Relevant files include:

- `RentalHubMobile/src/navigation/AppNavigator.js`
- `RentalHubMobile/src/screens/shared/NativeToolsScreen.js`
- `RentalHubMobile/src/services/api.js`
- `client/src/pages/App.jsx`
- `client/src/services/voiceApi.js`

## Android Audit Result

The Windows Gradle wrapper was executed with `assembleRelease`. The build reached Metro bundling but failed because of a syntax error:

`RentalHubMobile/src/screens/shared/ContactWidgetScreen.js:68`

The reported issue is an extra closing `};`. Existing APK files on disk are not proof of a current successful release build.

Additional warning observed during bundling:

- `react-native-webrtc` imports a subpath not declared in the package exports map and falls back to file-based resolution.

Required proof after repair:

- Successful clean release APK/AAB build.
- Install on an emulator and physical Android device.
- Launch, login, logout, deep link, camera/location/notification permission, upload, payment, push, offline/retry, and background checks.
- Verify release signing, network security, certificate behavior, and sensitive-data storage.

## iOS Audit Result

The iOS build was not proven. The environment is Windows and `xcodebuild` is unavailable.

Required proof on macOS/Xcode or CI/EAS:

- Successful archive and signed IPA build.
- Simulator and physical-device installation.
- Launch, login, logout, deep links, permissions, camera/location/notifications, uploads, payments, push, offline/retry, and background checks.
- Verify ATS/network security, Keychain storage, release signing, entitlements, and privacy permission strings.

## UX and Button Audit

Only a small number of client tests exist, so the presence of a button or handler is not proof that the workflow succeeds.

Missing or unproven UX coverage includes:

- No comprehensive button-to-handler or navigation-target test.
- No proof that every role-specific navigation target is registered on both platforms.
- No systematic loading, disabled, retry, timeout, and server-error verification.
- No confirmation/undo coverage for destructive actions.
- No offline behavior or retry verification for mobile.
- No accessibility activation and focus-order verification.
- No proof that payment, upload, support, admin, notification, and account-deletion buttons complete their backend workflows.
- Mobile actions exist that point to missing screens or platform-incomplete functionality.

A suspicious explicit handler was found in `client/src/components/admin/SupportVoiceDesk.jsx` around line 729 and requires manual review.

## Penetration-Test Exposure Assessment

No destructive exploitation was performed. Based on the repository evidence, the most realistic attack paths are:

1. Obtain credentials from `.env`, logs, backups, deployment artifacts, or leaked history.
2. Forge or replay sessions if the placeholder/reused JWT secret is deployed.
3. Exploit authorization mismatches in untested role, jurisdiction, object-ID, payment, recovery, document, support, or admin workflows.
4. Submit mislabeled or malicious files through weak upload paths.
5. Abuse insecure CORS configuration if enabled in production.
6. Exploit production misconfiguration: missing encryption keys, resetting VAPID keys, incomplete security headers, weak secrets, or exposed operational endpoints.
7. Use untested integrations and failure paths to trigger inconsistent state, duplicate payments, unauthorized callbacks, or data disclosure.

Before an external penetration test, establish an authorized staging environment with synthetic data, rotated test credentials, logging, backups, and explicit testing boundaries. Do not test these attack paths against production without written authorization.

## Recommended Remediation Order

1. Rotate secrets and remove all sensitive values from repository/deployment artifacts.
2. Enforce strong JWT, NIN encryption, webhook, VAPID, and production configuration requirements at startup.
3. Fix the Android syntax error and establish repeatable Android/iOS CI builds.
4. Patch dependency advisories and rerun all tests.
5. Harden every upload path with content validation and scanning.
6. Add web authenticated end-to-end tests for critical workflows.
7. Add Android and iOS smoke suites on real devices or device farms.
8. Resolve navigation and role parity defects.
9. Add authorization/property-based tests for object IDs, roles, jurisdictions, and destructive actions.
10. Add browser/mobile accessibility and UX regression coverage.
11. At the end of all remediation work, perform a complete A-to-Z dashboard tour investigation covering every dashboard, role, and navigation path, from tenant through landlord, operational and departmental administrators, territorial administrators, support, finance, legal, service, and super admin. Capture every route, menu, tab, deep link, redirect, back-navigation path, role-based destination, button, permission boundary, data state, empty/loading/error state, workflow transition, and web/mobile parity result.
12. Repeat dependency, dynamic application, mobile, and penetration testing after remediation.

## Admin Dashboard Sharing and Parity Audit

### Conclusion

There is **not one universal admin dashboard**, but multiple admin roles share dashboard implementations. Some sharing is intentional; other overlap and routing behavior are inconsistent and require repair. Complete runtime proof of admin separation does not yet exist.

### Web dashboard sharing

| Roles | Dashboard | Assessment |
|---|---|---|
| `admin`, `lga_admin` | `AdminDashboard` | Intentional legacy/LGA sharing |
| `financial_admin`, `lga_financial_admin` | `FinancialAdminDashboard` | Intentional finance sharing |
| `state_admin`, `state_financial_admin` | `StateAdminDashboard` | Intentional state sharing |
| `fumigation_admin`, `lga_fumigation_admin` | `LgaFumigationAdminDashboard` | Intentional LGA service sharing |
| `transportation_admin`, `lga_transportation_admin` | `TransportationAdminDashboard` | Intentional LGA service sharing |
| `lawyer`, `state_lawyer`, `super_lawyer` | Shared lawyer implementation with separate routes | Partial separation |

`super_admin` normally enters `/super-admin` and receives the dedicated super-admin dashboard, but `/admin` also admits the role and can fall through to the ordinary `AdminDashboard`. This is accidental dashboard overlap unless explicitly required.

### Confirmed web routing defects

- `zonal_admin` is redirected to `/admin` but is missing from `ADMIN_SHELL_ROLES`, creating a potential `/dashboard` to `/admin` redirect loop.
- The header maps `super_fumigation_admin` to `/admin/fumigation-cleaning/super` and `super_transportation_admin` to `/admin/transportation/super`, while the registered destinations are under `/super-admin/...`.
- `support_admin` appears in client storage handling but is absent from the canonical client role hierarchy, admin shell, and login routing. It is stale or unsupported and may fall through to the tenant dashboard.

### Mobile dashboard sharing

- `admin` and `lga_admin` share `AdminRoot` and `AdminDashboard`.
- `state_admin` and `state_financial_admin` share `StateAdminRoot` and `StateAdminDashboard`.
- Support, transportation, and fumigation admin families share `ServiceAdminRoot` and the adaptive `ServiceOperationsDashboard`.
- `super_admin` has a distinct `SuperAdminRoot`, but that root also registers `AdminDashboard` as a secondary screen.
- Super transportation/fumigation screens are registered in the super-admin root while those roles are routed to the service-admin root, so their specialized dashboards are not naturally reachable.

### Backend and test evidence

Authorization, territorial hierarchy, and tour checks passed **28/28**. The native tour verifier reported **66 steps, 5 locales, and 16 actionable routes**. These are useful contract checks, not proof that every role can log in, reach the correct dashboard, use every allowed action, or be denied every forbidden action on web and real devices.

The dominant security risk is authorization drift: duplicated role lists, exact-match legacy guards, broad cross-department service-admin access, dashboard mappings that differ between web and mobile, and deep links that do not exist in every role root.

## Formal Target Authority Model

This is the agreed target structure for the dashboard cleanup. It is documentation and acceptance criteria only; no implementation changes are implied by this section.

### Central authority

#### Central Super Admin

Canonical role: `super_admin`

The central super admin is the platform authority and boss of the administration hierarchy. It has national scope across all zones, states, LGAs, departments, users, dashboards, configuration, audit records, approvals, and escalations.

The central super admin must have a distinct central dashboard. Any lower-level dashboard access must be an explicit, audited “view as” or delegated operational view, never an accidental route fall-through.

### Four departmental super admins

These roles have national scope only within their own department and must not automatically receive unrelated platform-wide powers.

| Role | Departmental scope |
|---|---|
| `super_financial_admin` | Transactions, wallets, withdrawals, commissions, frozen funds, financial reports, and financial escalations |
| `super_support_admin` | Support tickets, admin pool, escalations, SLAs, voice support, and cross-state support coordination |
| `super_transportation_admin` | Transportation bookings, providers, drivers, routes, pricing, revenue, reports, and transportation escalations |
| `super_fumigation_admin` | Fumigation and cleaning bookings, providers, pricing, coverage, compliance, reports, and service escalations |

Legal is a separate authority chain, not one of these four departmental super-admin roles:

- `super_lawyer`
- `state_lawyer`
- `lawyer`

### Territorial administration

#### Zonal Admin

Canonical role: `zonal_admin`

Scope is limited to the assigned zone and its states. It oversees state-admin performance, zone reports, zone escalations, and cross-state coordination within that zone. It must not receive national or departmental-super-admin authority.

#### State Admin

Canonical role: `state_admin`

Scope is limited to one assigned state and its LGAs. It manages state operations, approvals, migrations, reports, and state escalations, but must not manage another state.

#### LGA Admin

Canonical role: `lga_admin`

Scope is limited to one assigned LGA. It manages local users, properties, requests, tenancy operations, and permitted local services. The legacy `admin` role should be migrated toward `lga_admin` rather than remaining a separate authority.

### Target dashboard structure

The expected dashboard structure is:

```text
Central Super Admin
|
|-- Super Financial Admin
|-- Super Support Admin
|-- Super Transportation Admin
|-- Super Fumigation Admin
|
|-- Zonal Admin
|   |-- State Admin
|       |-- LGA Admin
|
|-- Legal Authority Chain
  |-- Super Lawyer
  |-- State Lawyer
  |-- Lawyer
```

### Acceptance criteria for implementation

- One central super-admin dashboard.
- Four distinct departmental super-admin dashboards or department-specific dashboard experiences.
- Distinct zonal, state, and LGA dashboard experiences with enforced scope boundaries.
- Separate legal authority dashboards and permissions.
- No accidental fallback from a higher authority into a lower dashboard.
- No departmental super admin receives unrelated department controls by default.
- Legacy `admin` behavior is explicitly documented and migrated to `lga_admin`.
- Web, Android, iOS, backend authorization, deep links, dashboard tours, and analytics use the same role-to-scope-to-dashboard policy.
- Central super-admin lower-level access is explicit, auditable, and test-covered.

### Priority repair list

1. Fix the `zonal_admin` shell admission and add a redirect-loop regression test.
2. Decide whether `super_admin` should be barred from ordinary `AdminDashboard`; enforce the decision consistently on web and mobile.
3. Correct super transportation/fumigation header destinations and native root routing.
4. Remove or fully implement `support_admin`.
5. Centralize role-to-dashboard policy and derive client navigation from it.
6. Add an authenticated dashboard matrix test for every admin role, every deep link, and every role-specific action.
7. Repeat the matrix on Android and iOS real devices or a device farm.

### Remediation started

- Web admin shell now admits `zonal_admin` and direct `/admin` entry redirects `super_admin` to `/super-admin`, removing the identified overlap and redirect-loop paths.
- Web header destinations for super transportation and fumigation admins now point to the registered `/super-admin/...` routes.
- Native super transportation and super fumigation roles now enter `SuperAdminRoot` with their specialist dashboard as the initial screen.
- The native Android JavaScript bundle now succeeds after removing an extra closing brace from `ContactWidgetScreen.js`.
- Web validation after the first repair: client tests **4/4** and production build successful.
- Native validation after the first repair: tour contract **66 steps, 5 locales, 16 actionable routes** and Android bundle successful.

Still open after this first repair slice: centralized role policy, `support_admin` cleanup, service-admin least-privilege review, complete authenticated dashboard matrix tests, native deep-link parity, and real-device Android/iOS validation.

## Audit Boundary

This document records repository inspection and local executable checks. It is not a substitute for an external penetration test, production configuration review, mobile reverse-engineering assessment, or provider-side security review. Findings marked “not proven” require explicit runtime evidence before being treated as complete.
