# Unified customer and WhatsApp human support

Date: 12 November 2026. Implementation is in the local project. These changes have not been deployed or published over the current Android download.

## Audit findings and plan

The web FloatingContactWidget and shared mobile ContactWidgetScreen already embed an assistant, collect a reviewable support request, list tickets and read/reply to ticket conversations. WhatsAppBotWidget/WhatsAppBotScreen are in-app assistants despite their names. They were not WhatsApp webhook conversations. Account-specific assistant answers come from the signed-in user's records; guests have public guidance. Existing consent, guest ticket secrets, rate limits, contact privacy rules, notifications and department handover are preserved.

Before this work, routes/whatsappWebhook.js verified the raw-body HMAC and passed events to propertyAlertDeliveryService. That service tracked property-alert delivery and STOP/START consent, checked the configured phone-number ID and reconciled delivery receipts. It did not provide a human-agent inbox. whatsappMarketingService and its campaigns remain separate. Existing support_tickets and support_ticket_replies are now extended instead of creating another ticket/conversation system.

Inspected: server.js; routes/support.js, supportLanguages.js, whatsappWebhook.js, whatsappMarketing.js; services/supportAssistantService.js, accountAssistantService.js, supportCustomerService.js, supportContactService.js, supportLanguageService.js, supportResponseMonitor.js, supportReassignService.js, propertyAlertDeliveryService.js, whatsappMarketingService.js, activityLogger.js; config/utils/whatsappService.js, whatsappPolicy.js, notificationService.js, pushNotificationService.js, unreadActivityService.js, auditLogger.js; authentication/MFA/rate-limit patterns; migrations 2030 and 2043–2047; web Support, support widgets, support workspace, admin layout and Super Support dashboard; mobile SupportScreen, ContactWidgetScreen, WhatsAppBotScreen, support service, ticket screens, navigation and notification links; existing backend/web/mobile tests.

Plan followed: extend stored tickets, add protected manual inbox APIs, connect shared web/mobile screens, enforce channel/policy boundaries, then test signatures, ownership, concurrent events, retries and builds.

## What was implemented

- Web /admin/whatsapp-support and shared Android/iOS WhatsAppSupport screen: assigned conversations, history, older-message paging, search, status/assigned-to-me filters, senior assignment and manual replies.
- Existing protected customer card is reused. A uniquely verified phone match is labelled as a phone match, not a signed-in session. Staff must verify ownership before account changes. Unknown or ambiguous phones stay unidentified. A later changed/ambiguous phone match clears an old account link; it never links another account to the old conversation's history.
- Customer WhatsApp entry uses server-configured channel metadata. The fixed number was removed from the assistant/support-centre navigation. In-app messages do not open a WhatsApp messaging window or transfer authentication.
- Human requests still open the existing reviewable form. Opening the widget or selecting human help does not submit a ticket. Relevant question context is retained for the customer to review before submission.
- AI/automated guidance is labelled separately. WhatsApp support is manual-only: the webhook does not call the AI or automatically send a reply. Open/in-progress allow human replies; pending/resolved/closed pause them. A new customer WhatsApp message reopens the conversation. No competing AI sender exists on that channel.
- Drafts stay in memory on failed manual sends. Retries reuse a server-generated UUID. Uncertain sends are recorded and never automatically sent again. History and delivery receipts help staff decide what happened. Memory drafts are not promised to survive an app kill.
- Mobile foreground/reconnection polling reloads history. Customer chat history is retained on a failed reload. Notification links open the native WhatsApp inbox for authorised staff.
- New inbound alerts, assignments, status changes and successful human replies reuse the existing notification/push/badge infrastructure. Stable notification keys prevent duplicate stored alerts and repeated push dispatch for the same event. Physical push delivery was not tested.
- Failed/uncertain/sending WhatsApp drafts are not presented as delivered replies in ordinary customer ticket history. Staff email addresses are not returned as reply-author emails there.
- The existing response monitor recognises completed WhatsApp replies; failed sends do not clear the customer's waiting state. Pending WhatsApp conversations are excluded from missed-response reassignment until reopened.

## WhatsApp policy decision

Meta's current official policy states that free-form WhatsApp replies are allowed within 24 hours of the customer's last WhatsApp message; outside it an approved template is required. The seven-day HUMAN_AGENT extension used by other Meta messaging products is not assumed applicable to WhatsApp. This implementation rejects message-tag, automation and campaign payloads on the manual reply endpoint. It does not invent a WhatsApp HUMAN_AGENT permission or seven-day extension.

Official source, checked 12 November 2026: https://business.whatsapp.com/policy (policy page dated 23 September 2026). Developer documentation URLs were also checked but returned access/rate-limit errors. The accessible official policy is the authority for the enforced 24-hour rule.

Manual replies require authenticated support staff, privileged MFA, no impersonation, assignment/senior permission, an open conversation, a real inbound WhatsApp timestamp, no opt-out and explicit human/support confirmation. Obvious promotional wording is rejected. Human confirmation and audit records provide accountability; they do not prove how an employee composed every word.

Outside the window the server blocks free-form replies and asks for customer recontact. Existing approved-template marketing/property-alert workflows remain separate; this task does not create or approve templates or send campaign messages.

## Database and API

Migration: migrations/2048_whatsapp_support.sql. It adds WhatsApp phone/window/mode fields to support_tickets, external-message/retry/delivery fields to support_ticket_replies and a deduplication key/index to notifications. It adds only necessary indexes and missing existing response-monitor timestamp columns. No existing records are deleted; no duplicate conversation tables are added.

New endpoints:
- GET /api/support-channels — public channel URL/configured status only, no credentials.
- GET /api/whatsapp-support — protected inbox filters.
- GET /api/whatsapp-support/agents — senior support agent picker.
- GET /api/whatsapp-support/send-key — protected retry UUID.
- GET /api/whatsapp-support/:id?before= — protected history.
- PATCH /api/whatsapp-support/:id — senior assignment / authorised status change.
- POST /api/whatsapp-support/:id/reply — manual human reply with request_id, message, human_confirmed=true and purpose=support.

Changed existing endpoints: POST /api/whatsapp/webhook now also persists support messages and receipts after the existing alert/opt-out processor; ordinary support ticket mutation paths reject WhatsApp conversations and direct them to the correct channel. Existing customer history remains owner-scoped. Staff-only APIs return 403/404 for unauthorised or unassigned readers.

## Configuration and deployment

New public setting: WHATSAPP_SUPPORT_PHONE. Set it to the actual business WhatsApp chat number, including country code. It is not WHATSAPP_PHONE_NUMBER_ID. No real value or credential was invented or changed. Existing WHATSAPP_META_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and optional WHATSAPP_GRAPH_API_VERSION remain in use.

1. Back up the database and deploy the reviewed source through the normal release process.
2. Run npm run migrate:dry-run and confirm migration 2048, then npm run migrate before starting the changed backend.
3. Configure the real public support number privately on the server. Confirm token permissions and number ownership in Meta. Keep the webhook URL https://rentalhub.com.ng/api/whatsapp/webhook, subscribe the messages field, and complete the verification challenge using the real configured secret/token.
4. Run npm --prefix client run build and restart RentalHub through the normal controlled process.
5. Use a test customer/number permitted by Meta to verify inbound message, manual reply, receipt, STOP/START, expired-window block, and notifications on real devices. No real WhatsApp message was sent by this task.
6. Publish a separately versioned Android release after these checks. The validation APK uses the existing version metadata and has not replaced the live 1.0.61 download. iOS requires a Mac/Xcode, Apple signing, real-device checks and the normal distribution process.
7. To roll back the application, restore the previous source/build while retaining the added database columns and stored support records. Do not delete conversations as a rollback shortcut.

Meta approval/configuration remains the owner's responsibility. Existing property-match template approval is still pending. The WhatsApp inbox supports text; media messages are recorded as safe notices and customers should use the existing secure support form for files. No new AI provider or package dependency was introduced.

## Tests and actual limits

- Backend full suite: 168 passed, 0 failed (includes 15 WhatsApp service/notification checks and real HTTP signature checks).
- Web full suite: 164 passed, 0 failed, including five new inbox tests and existing widget handoff/privacy tests.
- Web production build passed; existing large-chunk warning remains.
- Shared Android/iOS support component: five executable tests passed (consent, opening without auto-send, offline retry, foreground reload and customer exclusion). Support-centre navigation check passed. Guest support credential tests passed.
- Isolated real PostgreSQL migration/integration checks passed: concurrent duplicate webhook events, notification uniqueness, verified phone association, assignment, scoped reads, concurrent send retries, receipt ordering, uncertain delivery, opt-out, expired window and changed phone ownership. A separately created rentalhub_support_review_* database was used and removed; live records were not touched.
- Android release builds passed (initial 13m54s, final 9m21s). APK signature verification passed. The final iOS JavaScript bundle compiled successfully (1455 modules); its final customer-card wording was checked in the generated bundle. No native or signed iOS build is claimed.
- Wider mobile checks are not all green: language-layout test expects old padding 8 while the unchanged control uses 6; typography check flags the unchanged FumigationLiveTrackingScreen input; localisation reports existing missing catalogue entries; one storage test expects identity data in plaintext fallback although unchanged storage code deliberately forbids it. These files/expectations were compared with Git HEAD. They were not changed merely to make a check pass. Tour and registration checks passed. Newly added WhatsApp entry copy covers all eight supported languages; existing web language copy was also reused in the mobile language field.

Logs: RentalHubMobile/.codex-tmp/unified-support/ (backend-release-final.log, web-release-final.log, web-production.log, whatsapp-tests.log, mobile-support-tests.log, mobile-checks.log, mobile-localization.log, baseline-checks.log, postgres-confirmed.log, android-build.log, android-final.log and ios-final.log).

No physical Android/iPhone notification delivery, paid transaction, real Meta send or signed iOS installation was tested. In-memory AI chat is not a promise of permanent chat storage; submitted tickets and WhatsApp conversation history are persisted securely behind the existing access controls.

## Exact files changed or created

Web/backend repository:

- .env.example
- client/src/components/admin/SupportCustomerCard.jsx
- client/src/components/admin/SupportTicketWorkspace.jsx
- client/src/components/common/FloatingContactWidget.jsx
- client/src/components/common/WhatsAppBotWidget.jsx
- client/src/i18n/ar.json
- client/src/i18n/en.json
- client/src/i18n/fr.json
- client/src/i18n/ha.json
- client/src/i18n/ig.json
- client/src/i18n/ru.json
- client/src/i18n/yo.json
- client/src/i18n/zh.json
- client/src/pages/App.jsx
- client/src/pages/Support.jsx
- client/src/pages/admin/AdminLayout.jsx
- config/utils/notificationService.js
- config/utils/whatsappService.js
- routes/support.js
- routes/whatsappWebhook.js
- server.js
- services/supportResponseMonitor.js
- client/src/components/common/WhatsAppSupportEntry.jsx
- client/src/pages/admin/WhatsAppSupport.jsx
- client/src/pages/admin/WhatsAppSupport.test.jsx
- docs/unified-human-support.md
- migrations/2048_whatsapp_support.sql
- routes/whatsappSupport.js
- scripts/testWhatsappSupportPostgres.js
- services/whatsappSupportService.js
- tests/services/whatsappSupport.test.js
- tests/services/whatsappWebhook.test.js

Shared Android/iOS repository:

- package.json
- scripts/verify-support-centre.cjs
- src/components/common/LanguageSkillsField.js
- src/components/common/SupportCustomerCard.js
- src/i18n/interfaceCopy.json
- src/navigation/AppNavigator.js
- src/navigation/navigationRef.js
- src/screens/service-admin/SupportTicketsScreen.js
- src/screens/shared/ContactWidgetScreen.js
- src/screens/shared/NativeToolsScreen.js
- src/screens/shared/SupportScreen.js
- src/screens/shared/WhatsAppBotScreen.js
- scripts/test-whatsapp-support.cjs
- src/components/common/WhatsAppSupportEntry.js
- src/i18n/supportChannelCopy.cjs
- src/screens/shared/WhatsAppSupportScreen.js

## Saved source and build evidence

Mobile commit: ed8365fec81a4a5e37aa3733c4d0d4b5c6d97204. Audio, credentials and APK binaries are excluded from source commits.

Validation APK SHA-256: 88ec199b9739c3f4fa47541a36edd6a6b5e934d29f169b93484b864285bbaa4e. This is a local validation build with existing 1.0.61 metadata, not a newly published update. The final Android and iOS bundles both contain the account-privacy warning.
