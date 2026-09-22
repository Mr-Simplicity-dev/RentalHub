# RentalHub NG — Landlord/Tenant Tenancy Agreement & Electronic Execution System

**Status:** Specification captured for future implementation. NOT yet built.
**Captured:** 2026-09-21
**Repository:** `Mr-Simplicity-dev/RentalHub`

> This is a major product/legal-document workflow, not a PDF download button.
> It must span Web, Android APK and iOS with one synchronized agreement model.

---

## 1. Current state — verify first

Before coding, inspect the existing repository for:
tenancy agreements, lease agreements, rental agreements, contract generation,
signatures / electronic signatures / document signing, PDF generation, tenant
applications, landlord acceptance, application approval, property booking,
payment confirmation, tenancy start/end dates, document storage, audit logs,
disputes, notifications, lawyer workflows.

The existing Terms state that submitting an application does not itself create a
tenancy and that a tenancy arises through the applicable agreement and required
confirmations. **Do not duplicate existing functionality.** Determine exactly
where the landlord/tenant application currently becomes approved and integrate
the agreement workflow at that point.

## 2. Core product rule

A RentalHub property application is NOT automatically a tenancy.

```
PROPERTY LISTING → TENANT APPLICATION → LANDLORD REVIEW → LANDLORD ACCEPTANCE
→ TENANCY TERMS GENERATED → LANDLORD REVIEWS AGREEMENT → LANDLORD EXECUTES/SIGNS
→ TENANT REVIEWS AGREEMENT → TENANT EXECUTES/SIGNS → BOTH PARTIES EXECUTED
→ FINAL AGREEMENT LOCKED → TENANCY "EXECUTED" IN RENTALHUB
→ PAYMENT / MOVE-IN / TENANCY MANAGEMENT
```

Do not mark an agreement fully executed until required parties complete their
required execution steps.

## 3. Agreement generation

Do NOT make an uploaded Word document the source of truth. Generate from
structured data. Minimum fields: agreement ID, property ID, landlord ID, tenant
ID, agent ID (where applicable), state, LGA, property address, tenancy type,
commencement date, expiry date, rent amount, payment frequency, deposit,
disclosed fees, service charge, utilities, occupants, permitted use, special
terms, notice configuration, attachments, version number, status, created
timestamp, updated timestamp.

## 4. Agreement status machine

`DRAFT`, `PENDING_LANDLORD_REVIEW`, `PENDING_LANDLORD_SIGNATURE`,
`PENDING_TENANT_REVIEW`, `PENDING_TENANT_SIGNATURE`, `PARTIALLY_EXECUTED`,
`FULLY_EXECUTED`, `DECLINED`, `CANCELLED`, `EXPIRED`, `AMENDED`, `SUPERSEDED`.

One canonical definition — no arbitrary strings scattered in code.

## 5. Landlord experience

After accepting a tenant application, the landlord sees **"Create Tenancy
Agreement"**. The landlord reviews property, tenant, rent, tenancy period,
deposit, fees, utilities, special terms, occupants, notice configuration,
attachments, then explicitly confirms, then **"Sign Agreement"** (not accidental).
After landlord execution → `PENDING_TENANT_SIGNATURE`, notify tenant.

## 6. Tenant experience

Tenant dashboard shows **"Tenancy Agreement Awaiting Your Review"**. Tenant can
view, download/view PDF, inspect rent, tenancy dates, fees, deposit, utilities,
special terms, attachments, accept/sign, and decline/request correction where
permitted. Tenant must explicitly confirm review before signing. After tenant
execution → `FULLY_EXECUTED` (provided all required conditions are met).

## 7. Electronic signature

Capture at minimum: authenticated RentalHub user ID, signatory name, signatory
role, agreement ID, agreement version, exact document version signed, signature
event ID, authentication event, timestamp, IP address (where legally appropriate
and permitted), device/platform metadata (where appropriate), document
integrity/hash reference, audit-log reference.

The platform must be able to establish: **WHO** signed, **WHAT** they signed,
**WHICH VERSION** they signed, **WHEN** they signed, **HOW** the signing event
was authenticated.

Do not claim the signature system is legally sufficient for every Nigerian
tenancy. UI and legal docs must state execution is subject to applicable Nigerian
law and any required formalities.

## 8. Signing method

Support: authenticated account, OTP or equivalent step-up authentication,
explicit consent, signature confirmation, timestamp, final document locking,
audit trail. Do not implement insecure "click once and you're legally signed".
If an external e-signature provider is required for a particular assurance
level, design for later integration; do not hard-code a provider unless already
part of the project.

## 9. Final document

After all required parties sign, generate the final executed document. It must
be immutable. Store/reference: `agreement_id`, `version`, `final_document_id`,
`document_hash`, `signed_at`, `landlord_signature_event`, `tenant_signature_event`,
`audit_log_reference`. Any amendment after execution creates a NEW VERSION.
Never silently edit an executed agreement.

## 10. Amendment system

**"Request Agreement Amendment"** — an executed agreement cannot simply be
edited:

```
EXECUTED VERSION 1 → AMENDMENT REQUEST → NEW VERSION → LANDLORD REVIEW
→ TENANT REVIEW → REQUIRED SIGNATURES → EXECUTED VERSION 2
```

Maintain full version history.

## 11. PDF / document presentation

Professional document. Header: **RENTALHUB NG** / **RESIDENTIAL TENANCY
AGREEMENT**. Include Agreement ID, Property, Landlord, Tenant, Jurisdiction,
Tenancy period, then all applicable clauses. At the end: LANDLORD (Signed, Name,
Date/time, Signature event reference), TENANT (same), and WITNESS if required.
Do not fabricate a legal seal, court stamp or government authentication.

## 12. Jurisdiction-aware design

Nigeria must NOT be treated as one uniform tenancy-law jurisdiction. The engine
must support state, FCT, LGA, property jurisdiction, tenancy type. Create a
jurisdiction configuration layer. Do NOT hard-code one generic notice period or
one deposit rule everywhere. Do NOT assume electronic execution removes every
other legal formality. Approved legal counsel must be able to configure
jurisdiction-specific clauses.

## 13. Legal review workflow

RentalHub legal administrators/lawyers manage approved templates:

```
Agreement Template → Jurisdiction → Version → Status → Approved by
→ Approval date → Effective date
```

Statuses: `DRAFT`, `UNDER_REVIEW`, `APPROVED`, `ACTIVE`, `RETIRED`. Only
`APPROVED`/`ACTIVE` templates may be used for production execution. Ordinary
landlords must not freely edit core legal clauses; controlled special terms only.

## 14. Lawyer review

Where existing lawyer functionality applies, offer optional **"Request Legal
Review"**. Lawyer can review agreement, property info, parties, special terms,
attachments, relevant evidence. Do not represent a lawyer as having approved
unless they actually perform the approval action. Record: lawyer ID, review
status, review date, comments, agreement version.

## 15. Landlord/tenant dashboards

Landlord — MY TENANCY AGREEMENTS: Draft, Awaiting My Signature, Awaiting Tenant,
Fully Executed, Amendment Requested, Expired.
Tenant — MY TENANCY AGREEMENTS: Awaiting Review, Awaiting My Signature, Fully
Executed, Amendment Requested, Expired.
Clear status badges. Premium motion, but legal documents stay visually serious.

## 16. Notifications

Landlord executes → notify tenant. Tenant executes → notify landlord. Amended →
notify affected parties. Approaching expiry → reminder. Declined → notify the
other party. No duplicate notifications for the same event. Reuse existing
notification infrastructure where possible.

## 17. Mobile / APK / iOS

MUST work consistently across Web, Android APK and iOS. Do NOT build three
agreement systems — use the same backend APIs and agreement model. Mobile must
support: agreement list, detail, PDF/document viewing, review, signature,
OTP/step-up auth, execution confirmation, download/share where permitted,
amendment review, notifications. Signing must be comfortable on mobile. Backend
stays authoritative.

## 18. Offline / network failure

Do not mark an agreement signed merely because a button was pressed offline. A
signature event must be confirmed by the server. On failure show: **"Your
signature was not confirmed. Please reconnect and try again."** Do not create
duplicate signature events on retry — use idempotency keys for execution requests.

## 19. Security

Treat executed agreements as sensitive legal records. Implement authorization
checks, ownership checks, tenant/landlord relationship checks, agreement access
controls, audit logs, rate limiting, secure document access, signed URL/controlled
document access where appropriate, anti-tampering, idempotency, server-side
validation. Never trust agreement IDs, user IDs, property IDs, role claims or
signature status supplied by the frontend — the backend must verify everything.

## 20. Document access

Landlord must not view unrelated tenants' agreements. Tenant must not view
unrelated landlords' agreements. Agents only for legitimately associated
agreements. Lawyers only within authorized scope. Admins follow existing
RentalHub authorization hierarchy. Do not weaken existing RBAC.

## 21. Payment relationship

Do not assume `PAYMENT = SIGNED TENANCY` or `SIGNED TENANCY = PAYMENT COMPLETED`.
Keep these states separate. Where business rules require payment before execution
or execution before payment, make the sequence configurable and explicitly
documented.

## 22. Move-in workflow

After `FULLY_EXECUTED`, provide **"Start Move-In"** connecting to condition
report, inventory, meter readings, keys/access records, property photographs,
move-in date. The move-in record references the executed agreement.

## 23. Dispute system

If a dispute occurs, the agreement must be available as evidence. Display:
Agreement ID, Version, Execution status, Signatories, Execution timestamps,
Document hash, Relevant audit records, Attachments, Amendment history. Neither
party may alter the executed record.

## 24. Existing Terms / FAQ

Review the current Terms and FAQ. The FAQ discusses tenancy agreements; the Terms
state that an application does not itself create a tenancy. Update only where
necessary so they accurately describe the new workflow. Do not claim "RentalHub
guarantees legal validity" or "Every RentalHub agreement is automatically legally
enforceable". Explain accurately that agreements are generated/executed subject
to applicable law and required formalities.

## 25. Database

Inspect existing schema before creating tables. Do not duplicate an existing
tenancy/application/property table. If necessary create dedicated tables such as
`tenancy_agreements`, `tenancy_agreement_versions`, `tenancy_agreement_signatures`,
`tenancy_agreement_events`, `tenancy_agreement_templates`. Use existing naming
conventions. Add foreign keys, indexes, unique constraints where necessary. Do
not rewrite old migrations — create new ones only.

## 26. API design

Design REST APIs around the existing RentalHub API architecture. Potential
operations (adapt to actual conventions after inspection):

```
POST   /api/tenancy-agreements
GET    /api/tenancy-agreements
GET    /api/tenancy-agreements/:id
POST   /api/tenancy-agreements/:id/review
POST   /api/tenancy-agreements/:id/sign
POST   /api/tenancy-agreements/:id/decline
POST   /api/tenancy-agreements/:id/amend
GET    /api/tenancy-agreements/:id/document
GET    /api/tenancy-agreements/:id/audit
```

Do not blindly create these exact routes if an equivalent architecture exists.

## 27. Web

Implement: Landlord Agreement Center, Tenant Agreement Center, Agreement Detail,
Agreement Review, Agreement Signing, Agreement History, Agreement Document
Viewer, Agreement Amendment workflow. Use the existing design system. Use Framer
Motion where appropriate. The signing screen must not be flashy — legal documents
should feel secure, serious, clear, professional, trustworthy.

## 28. Android / iOS

Inspect RentalHubMobile before modifying. Do not restructure or remove the
existing mobile project. Reuse the same backend agreement APIs. Implement
native-appropriate agreement list, viewer, review confirmation, signature flow,
OTP, execution result, document download/view, notifications. Do not duplicate
business rules in the mobile clients — backend remains authoritative.

## 29. Audit trail

Record: `AGREEMENT_CREATED`, `AGREEMENT_SENT_TO_LANDLORD`, `LANDLORD_VIEWED`,
`LANDLORD_ACCEPTED_TERMS`, `LANDLORD_SIGNED`, `AGREEMENT_SENT_TO_TENANT`,
`TENANT_VIEWED`, `TENANT_ACCEPTED_TERMS`, `TENANT_SIGNED`,
`AGREEMENT_FULLY_EXECUTED`, `AGREEMENT_DECLINED`, `AMENDMENT_REQUESTED`,
`NEW_VERSION_CREATED`, `AGREEMENT_EXPIRED`, `AGREEMENT_CANCELLED`. Do not record
sensitive information unnecessarily in logs.

## 30. Testing

Test: landlord creates agreement; tenant receives agreement; landlord reviews;
landlord signs; tenant receives notification; tenant reviews; tenant signs;
agreement becomes `FULLY_EXECUTED`; both parties can access the final document;
unrelated users cannot access it; landlord cannot sign on behalf of tenant;
tenant cannot sign on behalf of landlord; old executed version cannot be edited;
amendment creates a new version; duplicate signature request is idempotent;
network failure does not falsely mark signing complete; expired/cancelled
agreements cannot be signed; unauthorized API requests return appropriate errors;
mobile and web produce the same agreement state.

## 31. Do not do these things

Do NOT: create a fake handwritten signature; allow one user to sign for both
parties; let frontend determine that an agreement is executed; allow executed
agreements to be edited; hard-code one Nigerian tenancy law for every state;
claim universal legal enforceability; bypass RentalHub RBAC; bypass existing
audit controls; make payment automatically equal tenancy; make application
approval automatically equal tenancy; create duplicate agreement systems for
web/APK/iOS; destroy existing application functionality.

## 32. Final deliverable

Before declaring completion, provide: (1) existing agreement-related
functionality found; (2) database changes; (3) backend APIs created/modified;
(4) web pages/components created/modified; (5) Android changes; (6) iOS changes;
(7) agreement status machine; (8) signature/security mechanism; (9) audit-trail
implementation; (10) document-generation implementation; (11) jurisdiction
configuration; (12) lawyer-review workflow; (13) notification workflow;
(14) amendment/versioning system; (15) tests performed; (16) web build results;
(17) mobile build/test results where available; (18) unresolved legal/product/
technical limitations.

Most importantly: do not claim the feature is legally production-ready merely
because the software works. Separate **TECHNICALLY IMPLEMENTED** from
**LEGALLY REVIEWED** from **LEGALLY APPROVED FOR A PARTICULAR JURISDICTION**.

---

## Appendix — Terms of Service clause inserted 2026-09-21

Section **06.1 · Exclusivity of In-App Payments and Anti-Circumvention** was
added to `client/src/pages/Terms.jsx` under section 06 (*Prices, payments,
wallets and payouts*). It covers: mandatory payment routing via Paystack,
prohibition of offline transactions, definition of circumvention, and penalties
for violation. The Terms effective date was updated to 21 September 2026.
