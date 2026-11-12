# Property Protection — repository audit before implementation

12 November 2026. No feature code or production records changed during this audit.

## 1. Working capabilities to keep

- Existing rental properties, owner-document review and ownership visibility gate.
- Existing disputes, messages, private evidence download/integrity checks, audit timeline, support handover and notifications.
- Existing restricted professional dashboards and lawyer_case_notes; territorial authorisations already exist.
- Existing inspection requests/operations, assignment/start/completion states.
- Existing Paystack/payment records, receipts, configurable location pricing and subscription accounting.
- Web and shared Android/iOS calling, with call_sessions, five-person rooms and event history. Ordinary property/virtual-tour calling must remain unchanged.
- Web/shared-mobile customer, agent, professional and operational dashboards, navigation and notification links.

## 2. Existing but incomplete for this request

- The production properties table requires rental amounts, bedrooms/bathrooms and a landlord; its type check excludes undeveloped land. It cannot safely be used as an unlisted land registry without making fake rental listings.
- Production inspection requests require both a rental property and tenancy application. They need an optional protection-record link and assigned-agent access.
- Disputes permit NULL property_id, but participant discovery and professional authorisation assume a rental listing. A private protection-record link and explicit case participant checks are needed.
- The current case-details service allows ordinary admin to see all professional notes. Client-visible notes may reach both dispute sides. Confidential notes and private evidence-review findings need a stricter audience boundary.
- Current ownership uploads use /uploads/ownership paths. New protection documents must instead use private storage and authorised downloads.
- Existing ClamAV helper fails open when scanning is unavailable. Protection uploads must require a completed clean scan.
- The public resolved-cases pages are already separate from the internal directory. Legacy directory-unlock/payment/program routes and promotion wording remain and must not sell customer acquisition.
- Calls currently admit tenant/landlord/agent roles and property-linked participants. Case meetings require a separate case-authorisation branch in that same engine, not a new call/chat implementation.

## 3. Web and mobile availability

Web has fuller professional case notes/evidence review, administrative inspections and room controls. Android/iOS share native dispute, evidence, messaging, inspection/admin and professional screens, plus the existing native call overlay and realtime context. No complete independent-property registration, private owner vault, protection verification stages or monitoring workflow exists on either platform. These are genuine additions, not renamed existing features.

## 4. Implementation decisions

1. Add a private protection property record with an optional link to an existing rental listing. This avoids fake rent/bedroom values and keeps unlisted family/company land out of public searches. Do not replace properties.
2. Keep disputes/dispute_messages/dispute_evidence as the only case conversation and evidence engine. Link protection cases to that existing system. Unknown competing claimants need not have a platform account.
3. Extend property_inspection_requests/operations for protection tasks; retain tenancy inspection semantics for existing rows.
4. Reuse existing payments and Paystack verification, location-pricing rules, notification/audit helpers and job leadership. Paid products start unavailable until staff define scope, location and price. No invented fees. Monitoring is optional and time-bound; no unapproved automatic debit.
5. Add only registration/authority grants, private vault metadata, stage/service-request and monitoring-alert records that have no equivalent today. Representative access cannot transfer ownership.
6. Keep the professional dashboard. Permit only assigned professionals to perform confidential assessments. Keep customer-visible updates in dispute messages; never copy confidential notes into shared chat.
7. Connect authorised case meetings to the current call sessions/rooms. Keep ordinary calls and virtual tours unchanged. Store metadata only; no recording is added.
8. Add entry points inside existing owner, agent, professional and admin dashboards, using one backend contract for React and shared Android/iOS screens.
9. Remove public promotion and new directory-unlock purchases, preserving historical payments and internal identifiers. Review display wording in context; retain necessary privacy/terms disclosures and internal department key legal.

## 5. Deployment plan

Deploy the already-tested support work and the completed protection extension only after migrations, automated checks and builds. Back up production first. Publish a new numbered Android release with matching update metadata; do not overwrite the existing release with an unchanged version number. Build shared iOS code here; a signed native iOS release still requires a Mac/Apple signing. Keep paid protection services unavailable until an authorised administrator configures them.

## 6. Files and systems inspected

routes/properties.js, disputes.js, disputeRoutes.js, legal.js, adminInspections.js, payments.js; services/propertyService.js, disputeService.js, legalService.js, disputeNotificationService.js, disputeEscalationService.js, supportDisputeHandoverService.js, adminInspectionService.js, paymentService.js, conductPaymentService.js, callRoomHistory.js; config/utils/propertyDisputeParticipants.js, legalSchema.js, locationPricing.js, realtimeSocket.js, clamav.js; property/dispute/professional access and upload middleware; migrations 057,061,164,165,167,2043–2048 and production table/constraint metadata. Web Dashboard/AgentDashboard/professional pages, dispute details/creation, public cases, support and directory routes. Shared mobile screens, services, native calls and navigation. Existing security/test/report conventions. The live schema audit read table definitions only, not customers' documents or personal records.
