# Amana Property Protection — implementation and release report

12 November 2026. Source: web/backend bbf2a33bd24f6593050336c65ee21f037c4ea9b5; mobile 458b66b4dff3adb5576e073378b319c0335ec29c.

## 1. Existing architecture preserved
The module extends existing disputes, evidence, restricted professional dashboards, inspection requests, Paystack records/receipts, notifications, audit logs and WebRTC calls. A protection record is private and can exist without a rental listing. Existing disputes remain the only case conversation. No second chat engine, public professional directory, automatic ownership transfer or title guarantee was introduced.

## 2. Integrated workflow
Owners can register land, rental buildings, family/joint and company interests. Reviewed representatives receive separate, revocable permissions. Seven review stages keep source, observations, review decisions and history. Official registry results are manually recorded with source/reference/date/result and limitations. Field agents submit assigned inspection observations, permitted GPS and evidence; an independent reviewer decides. Final verification has a scope and expiry. Possible duplicates, independent observations and official evidence have distinct provenance; a match is not a fraud decision.

## 3. Case responsibilities and outcomes
A scoped operations administrator can triage minimal case details and appoint a named Support Admin. The named officer manages the case and approved participants. An authorised independent professional gives recommendations/private assessments. A recommendation alone does not close the case. Outcomes, limits and outcome history are retained; reopening requires new shared evidence. A normal support complaint does not automatically notify the other party. Formal approved case participants receive case alerts. Revocation and closure end access to case meetings.

## 4. Payments and configuration
Basic private registration and case reporting are free. Five paid services (registry, survey, physical inspection, professional review and monitoring) are initially disabled. Super Admin must set the scope, enabled state and a matching state/LGA price using the existing pricing controls. No fee was invented. Server-stored prices, payer email, amount, currency and reference are checked against Paystack. Retry keys cannot be moved to another property/service. Uncertain payment retries reuse the saved transaction. Settlement is locked and idempotent. Monitoring runs only for a paid period; renewal is explicit and does not automatically debit a card.

## 5. Data and migration
New migration: migrations/2049_property_protection.sql. Adds private property records, reviewed representatives, seven-stage checks/history, service configuration/orders, private document metadata, monitoring and provenance alerts. Extends existing disputes with protection/outcome history/participants, existing inspection requests with protection references, professional notes with an explicit client audience, and call sessions with protected case metadata. Adds socket transport support for the two server workers. Existing evidence timestamps are preserved when adding a missing compatibility column. The migration is additive and was tested twice in a disposable database.

## 6. Private files and security
Every record, case, stage, inspection, payment and document operation checks its current user and scope. Privileged staff require existing MFA. Professional review requires active authorised roles and independence. UUID retry references and server-side field validation are used. New vault uploads accept validated PDF/JPEG/PNG/MP4, enforce 25 MB limits, require successful ClamAV scanning, record consent/retention and verify SHA-256 on authorised download. Files have no public vault URL. Expired retention blocks access; extensions and removal requests require review. No automatic destructive purge was added. Existing case evidence retains its smaller upload limits and protected cases require scanning. Audit projections exclude request/response secrets and private professional findings. The shared contact filter remains in relevant customer negotiations.

## 7. Calls and notifications
Existing audio/video calling is reused. Case participants are checked on every operation; no meeting recordings are made. PostgreSQL shares room metadata/revocation and Socket.IO delivery across both workers. Room state excludes media and SDP; transport attachments can temporarily hold signalling packets. New clients use WebSocket transport to avoid polling affinity problems. No new messaging provider was added. Existing WhatsApp activation/template prerequisites remain; a successful internal alert does not mean WhatsApp has been approved.

## 8. Web, Android and iOS
Shared workflow request mapping is identical on web and mobile. Owner, assigned staff and scoped operations views use the existing dashboards. Case actions remain on existing dispute details. Restricted professional work is retained while public directory acquisition and new legacy directory purchases are removed; historical payment verification stays available. Shared Android/iOS source is updated to v1.0.63 (Android 74; iOS 68). Customer copy keys exist for all eight supported locales; new admin controls stay English. Some new detailed form labels use English fallback and need human language review. A signed iOS IPA requires macOS/Xcode and was not produced on Windows.

## 9. API routes
```text
GET /api/property-protection/forms
GET /api/property-protection/key
GET /api/property-protection/configuration
PUT /api/property-protection/configuration/:code
GET /api/property-protection/tasks/assigned
POST /api/property-protection/tasks/:taskId/action
POST /api/property-protection/payments/verify
POST /api/property-protection/requests/:requestId/resume
POST /api/property-protection/requests/:requestId/verify
GET /api/property-protection/requests/:requestId
POST /api/property-protection/cases/:caseId/participants
PATCH /api/property-protection/cases/:caseId/outcome
GET /api/property-protection/cases/:caseId/meeting-participants
GET /api/property-protection/cases/:caseId/meetings
GET /api/property-protection/documents/:documentId
PATCH /api/property-protection/documents/:documentId/retention
GET /api/property-protection/
POST /api/property-protection/
GET /api/property-protection/:id
POST /api/property-protection/:id/corrections
PATCH /api/property-protection/:id/corrections
GET /api/property-protection/:id/staff
POST /api/property-protection/:id/assign-officer
POST /api/property-protection/:id/representatives
PATCH /api/property-protection/:id/representatives
POST /api/property-protection/:id/checks/:stage/assign
POST /api/property-protection/:id/checks/:stage/submit
PATCH /api/property-protection/:id/checks/:stage/review
GET /api/property-protection/:id/services
POST /api/property-protection/:id/services
POST /api/property-protection/:id/cases
POST /api/property-protection/:id/alerts
PATCH /api/property-protection/:id/alerts/:alertId
PATCH /api/property-protection/:id/monitoring
POST /api/property-protection/:id/documents
```
Also updates existing dispute/evidence/payment-webhook/calling authorisation rather than adding a separate conversation.

## 10. Tests and build evidence
- Backend latest: 188 passed, 0 failed (backend-latest.log).
- Disposable PostgreSQL: additive migration/retry, private findings, representatives, authoritative payments, inspection review, seven stages, case duties/outcome history, later listing matches and two-worker calls/alerts passed (postgres-latest.log). No real payment, message or identity request was sent.
- Mobile workflow: 7 passed; private file helper: 4 passed. Registration and tour checks passed (87 steps, eight locales).
- Earlier full web run: 169 passed. Final rerun and build results are recorded in the release evidence addendum below; an interrupted resource-heavy run is not counted as a pass.
- Local browser preview remained blank because an existing development-only CommonJS MFA import failed. No screenshot or real-device visual pass is claimed. Actual Android/iOS camera/call/payment journeys still need device acceptance testing.
- Existing unrelated mobile baseline check failures are described in docs/unified-human-support.md and were not hidden or weakened.

## 11. Environment and deployment
No new environment variable or paid provider is required. Existing PostgreSQL, Paystack, identity services, notification channels, virus scanner and calling configuration are reused. The release installer backs up the database and application, compares server files against the prior release manifest, installs dependencies without removing existing media tools, applies only migration 2049, builds the website and reloads only RentalHub. Other server applications are untouched. Manual equivalents: npm install --omit=dev; npm run migrate:dry-run; npm run migrate; npm run build --prefix client; pm2 reload rentalhub --update-env; pm2 save. Do not rerun a migration by editing an applied SQL file.

## 12. Files changed and created
This comparison includes changes saved by the user while this work was in progress. A = new; M = modified. Audio/binaries/secrets are excluded from the release archive.

Web/backend since the audited support release:
```text
M	RentalHubMobile
A	client/.codex-tmp/protection-preview/forms.json
A	client/.codex-tmp/protection-preview/index.html
M	client/src/components/admin/PricingRulesTab.jsx
M	client/src/components/common/Header.jsx
A	client/src/components/common/PropertyCaseTools.jsx
M	client/src/components/common/WhatsAppBotWidget.jsx
M	client/src/config/tourConfig.js
M	client/src/context/SocketContext.jsx
M	client/src/i18n/ar.json
M	client/src/i18n/en.json
M	client/src/i18n/fr.json
M	client/src/i18n/ha.json
M	client/src/i18n/ig.json
A	client/src/i18n/propertyProtectionCopy.json
M	client/src/i18n/ru.json
M	client/src/i18n/tourTranslations.js
A	client/src/i18n/useProtectionText.js
M	client/src/i18n/yo.json
M	client/src/i18n/zh.json
M	client/src/pages/AboutUs.jsx
M	client/src/pages/App.jsx
M	client/src/pages/Dashboard.jsx
M	client/src/pages/DisputeDetails.jsx
M	client/src/pages/ListProperty.jsx
A	client/src/pages/PropertyProtection.jsx
A	client/src/pages/PropertyProtection.test.jsx
M	client/src/pages/SuperAdminDashboard.jsx
M	client/src/pages/agent/AgentDashboard.jsx
M	client/src/pages/lawyer/LawyerDashboard.jsx
A	client/src/propertyProtection/workflow.cjs
M	config/middleware/auth.js
M	config/middleware/disputeAccessMiddleware.js
M	config/middleware/propertyAccessMiddleware.js
M	config/middleware/uploadEvidence.js
M	config/survey/landlordQuestionnaire.js
M	config/utils/clamav.js
M	config/utils/locationPricing.js
M	config/utils/propertyDisputeParticipants.js
M	config/utils/realtimeSocket.js
A	docs/property-protection-audit.md
A	jobs/propertyProtectionJobs.js
A	migrations/2049_property_protection.sql
A	package-lock.json
M	package.json
M	routes/disputes.js
A	routes/propertyProtection.js
A	scripts/testPropertyProtectionPostgres.js
A	scripts/testProtectionCallWorkers.js
M	server.js
M	services/accountAssistantService.js
A	services/callStateBridge.js
M	services/disputeNotificationService.js
M	services/disputeService.js
M	services/legalService.js
M	services/paymentService.js
M	services/platformRatingService.js
A	services/propertyProtectionForms.js
A	services/propertyProtectionInspections.js
A	services/propertyProtectionMaintenance.js
A	services/propertyProtectionPayments.js
A	services/propertyProtectionPolicy.js
A	services/propertyProtectionService.js
A	services/propertyProtectionVault.js
M	services/supportAssistantService.js
A	tests/services/propertyProtection.test.js
A	tests/services/propertyProtectionCasePrivacy.test.js
A	tests/services/propertyProtectionSecurity.test.js
```
Mobile since the audited support release:
```text
M	android/app/build.gradle
M	app.json
M	ios/RentalHubMobile.xcodeproj/project.pbxproj
M	package-lock.json
M	package.json
A	scripts/test-property-protection.cjs
A	src/components/common/PropertyCaseTools.js
M	src/context/RealtimeContext.js
M	src/i18n/interfaceCopy.json
M	src/i18n/interfaceRuntime.cjs
A	src/i18n/propertyProtectionAliases.json
A	src/i18n/propertyProtectionCopy.json
M	src/navigation/AppNavigator.js
M	src/navigation/navigationRef.js
A	src/propertyProtection/workflow.cjs
M	src/screens/admin/SuperAdminDashboardScreen.js
M	src/screens/dashboard/DashboardScreen.js
M	src/screens/lawyer/DisputeDetailsScreen.js
M	src/screens/shared/NativeToolsScreen.js
A	src/screens/shared/PropertyProtectionScreen.js
M	src/screens/shared/WhatsAppBotScreen.js
A	src/services/__tests__/privatePropertyFileService.test.cjs
M	src/services/paymentRecoveryService.js
A	src/services/privatePropertyFileService.js
```

## 13. Remaining setup and limits
Choose service scopes, prices and monitoring periods before enabling paid services. Staff must record real registry sources and professional credentials; the platform does not query or freeze a government title registry automatically. Review retention/erasure policy and translated form wording. Complete real-device testing, especially video calls and weak-network payment return. iOS distribution still needs a signed Apple build. WhatsApp business/template approval is separate. These limits are not represented as completed checks.

## 14. Release evidence addendum
Pending final release checks and publication. This section will be updated with actual output, APK hash and download proof before completion.
