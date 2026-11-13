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
- Full website suite: 178 tests passed, 29 files (local full run). The final saved source is also tested in the separate server stage before publication.
- Full backend suite: 192 passed, zero failed, including three maintenance access tests.
- Mobile workflow/role routing: nine passed. Private file helper: four passed.
- Existing registration checks passed.
- Tour check passed: 87 steps, eight locales, 15 actionable routes.
- Changed source parses; imported JSX component bindings checked.
- Existing case link tests still target the existing dispute route.
- No real charge, customer message or identity verification was sent by these tests.

## Release and deployment
Source commits: web 1d776818c27fac14665bea9849d3321c8db8abdc; mobile bad5984a75d8f6b69a07a98688fb6a21ba89853a.
Target release: Android v1.0.64/build75; iOS source v1.0.64/build69. A signed iOS IPA requires macOS/Xcode and Apple signing and is not produced here. Existing published iOS version metadata must not pretend a new binary has shipped.
The deployment uses an isolated server copy for tests and build, verifies existing live source hashes, backs up overwritten files/website/version metadata, and copies website assets before atomically replacing index.html. Runtime backend code is unchanged; no migration or backend restart is needed. Maintenance mode and the five paid-service switches remain as configured. The prior APK stays public until the new signed APK passes its checks.

Final build/download evidence will be appended below after the builds finish. No physical-device or visual screenshot acceptance test is claimed.

## Exact web/backend file changes
```text
M	RentalHubMobile
M	client/src/components/common/Header.jsx
A	client/src/components/common/PropertyProtectionEntry.jsx
M	client/src/i18n/propertyProtectionCopy.json
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
