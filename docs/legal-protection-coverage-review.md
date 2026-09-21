# Legal Protection Coverage — Compliance Review (Nigeria)

**Status:** OPEN — BLOCKED ON LEGAL COUNSEL. Do NOT change wording or code until a
Nigerian (NBA-licensed) lawyer reviews and signs off.

**Owner decision:** Keep current implementation as-is for now. Wait for lawyer before
changing wording. Document everything so this can be resumed later with an AI assistant.

> **IMPORTANT — NOT LEGAL ADVICE.** This document is an internal engineering/product
> risk review, not legal advice. It summarises concerns and options. A qualified Nigerian
> legal practitioner (called to the Nigerian Bar, NBA member) must review this and the
> platform's terms before any launch or wording change. Several items below are legal
> questions that only a lawyer can answer definitively.

---

## 1. Why this document exists

The "Legal Protection Coverage" product was flagged by the product owner as potentially
non-compliant with Nigerian legal-practice rules. Specifically, the concern is that a
platform (not a law firm) advertises legal services, automatically assigns lawyers, and
charges users a fee that may effectively pay for legal services — which touches on
Nigerian Bar Association (NBA) and Rules of Professional Conduct restrictions.

The owner's proposed direction: handle cases through an **internal legal department**
(the platform's own lawyers). This document records that proposal, the legal risks, the
compliant alternatives, and the exact questions to put to the lawyer.

**Do not proceed to implementation until Section 10 (questions) is answered in writing.**

---

## 2. What is currently implemented

### 2.1 Product

- **"Legal Protection Coverage"** — a paid add-on (₦2,000) offered at registration.
- Marketing claims a lawyer is **assigned automatically**, covering "document reviews,
  tenancy agreements, and advisory".
- Subscribers **submit legal assistance requests** from their dashboard; a lawyer is
  assigned (by area/state).
- There is also a **paid lawyers directory unlock** (`LAWYER_DIRECTORY_UNLOCK_PRICE_NGN`)
  where users pay to see full lawyer details.
- Lawyer recruitment program, dispute logging, case notes, lawyer dashboards.

### 2.2 Current wording (to be reviewed by counsel — DO NOT EDIT YET)

- `client/src/components/common/whatsappFaqData.js`
  - *"For a one-time fee of ₦2,000 at registration, you get Legal Protection Coverage.
    A lawyer is assigned to you automatically, and you can submit legal assistance
    requests from your dashboard anytime. This covers document reviews, tenancy
    agreements, and advisory."*
  - *"…You can also opt for Legal Protection Coverage (₦2,000) during signup."*
- `client/src/i18n/en.json` (mirrored across ar/ru/fr/zh/yo/ig/ha)
  - *"Legal Protection Coverage"*
  - *"As a Legal Protection Coverage subscriber, you can submit a request and a qualified
    lawyer from your area will be assigned to assist you — no directory browsing needed."*
  - *"Legal Protection Coverage gives you access to qualified lawyers in your area."*
- `client/src/config/tourConfig.js`
  - *"If you have Legal Protection Coverage, submit a legal assistance request and a
    qualified lawyer will be assigned to help you."*

### 2.3 Relevant code locations (for future work)

**Client**
- `client/src/components/common/whatsappFaqData.js` — FAQ copy
- `client/src/config/tourConfig.js` — onboarding tour copy
- `client/src/i18n/*.json` — `legal_coverage*` keys
- `client/src/pages/LawyersDirectory.jsx` — public/unlocked directory
- `client/src/pages/MyDisputes.jsx`, `DisputeDetails.jsx`, `DisputeCreationModal.jsx`,
  `DisputeQRCode.jsx` — dispute flow
- `client/src/pages/lawyer/*` — `LawyerDashboard.jsx`, `StateLawyerDashboard.jsx`,
  `SuperLawyerDashboard.jsx`, `LawyerVerification.jsx`, `LawyerLayout.jsx`
- `client/src/pages/AcceptLawyerInvite.jsx`
- `client/src/components/admin/PlatformLawyersTab.jsx`, `LawyerInvitesManager.jsx`,
  `LawyerActivityMonitor.jsx`

**Backend**
- `services/legalService.js` — directory, unlock, platform-lawyer program
- `routes/legal.js`
- `controllers/legalController.js`
- `services/disputeService.js`, `services/disputeEscalationService.js`
- `routes/disputes.js`, `routes/disputeRoutes.js`, `routes/models/Dispute.js`
- `config/utils/lawyerDirectoryAccess.js` — `LAWYER_DIRECTORY_UNLOCK_PRICE_NGN`
- `config/utils/platformLawyerProgram.js`

---

## 3. Proposed model (owner): internal legal department handles cases

Owner's idea: RentalHub runs its **own legal department**, and the lawyers in that
department handle users' cases (tenancy disputes, document reviews, etc.).

**This is the central question for the lawyer.** The analysis below explains why an
internal department is not automatically a compliant way to act for users.

---

## 4. Legal framework to consider (summarised — lawyer to verify)

> These are the instruments/areas the lawyer should address. Summaries here are for
> orientation only and may be incomplete or outdated.

1. **Legal Practitioners Act (Nigeria)** — who may practise as a legal practitioner and
   the restrictions on legal practice, including incorporated legal practices.
2. **Rules of Professional Conduct for Legal Practitioners 2007 (RPC)** — key rules:
   - Advertising/solicitation restrictions (lawyers may not advertise or solicit
     professional employment; "touting" is prohibited).
   - Prohibition on a lawyer **sharing legal fees with a non-lawyer** (division of fees).
   - A lawyer may not allow a non-lawyer to **control or influence** their professional
     work, nor practise in partnership/employment with a non-lawyer for the provision of
     legal services to the public.
   - Confidentiality and conflict-of-interest duties.
3. **NBA regulation / disciplinary jurisdiction** — sanctions for professional misconduct.
4. **NAICOM / insurance regulation** — whether "coverage" constitutes legal-expenses
   insurance, which requires licensing.
5. **Consumer protection / advertising law** — claims like "lawyer assigned", "advisory",
   "coverage" must be accurate and not misleading.

---

## 5. Risk analysis

| Risk | Description | Trigger in current product |
| --- | --- | --- |
| Unauthorized practice of law (UPL) | Platform gives/reports legal advice, reviews documents, or holds out as providing legal services | "advisory", "document reviews", "coverage" copy |
| Fee-sharing with a non-lawyer | Company (non-lawyer) takes payment for legal work done by lawyers | ₦2,000 fee that funds lawyers' work |
| Touting / solicitation | Platform markets and funnels legal work; auto-assigns lawyers | "A lawyer is assigned to you automatically" |
| Insurance-like product | "Coverage" implies regulated legal-expenses insurance | product name "Legal Protection Coverage" |
| Non-lawyer control | Company directs the lawyers' professional work | in-house lawyers acting for users |
| In-house scope | In-house counsel generally act only for their employer, not third parties | lawyers acting for users |

---

## 6. Compliant structural options

### Option A — Neutral directory only
Platform lists lawyers' public details; users contact lawyers directly. No recommendation,
no auto-assignment, no fee-sharing. Platform charges a flat technology/directory fee.
- Pros: simple, low legal risk.
- Cons: less "managed" experience.

### Option B — Separate, lawyer-owned law firm (recommended direction)
The lawyers sit in a **separate legal entity owned by lawyers** (an incorporated legal
practice / law firm), engaged **directly by the user**. The firm bills the user for legal
services. RentalHub is a **technology platform only** and charges a **separate tech fee**.
- Pros: legal services are delivered by a proper law firm; clear separation.
- Cons: must not split fees; branding ("RentalHub Legal") must not mislead; no touting.

### Option C — Dispute documentation / self-help (safest)
Reframe to **logging a dispute, building an evidence timeline, and generating a
downloadable report** the user takes to their own lawyer or authority. No legal advice,
no lawyer assignment.
- Pros: lowest risk; no legal-practice exposure.
- Cons: not "representation".

### Option D — Wording/positioning changes (applies to A/B/C)
- Drop "Coverage", "Advisory", "assigned lawyer".
- Use neutral terms: "Dispute Support", "Legal Directory", "Evidence Vault",
  "Documentation".
- Add a clear disclaimer: *"RentalHub NG is not a law firm and does not provide legal
  advice."*

### On the owner's proposal (in-house department)
- An internal legal department can lawfully handle **RentalHub's own** legal matters
  (contracts, terms, compliance, company disputes).
- It is **not** a clean substitute for acting for **users** (third parties) while the
  company charges for it. If representation of users is desired, the lawyers should
  practise through a **separate lawyer-owned firm** (Option B), not as employees of the
  tech company.
- Whether an in-house department may act for users, and whether the company may charge
  for it, are questions for the lawyer (Section 10).

---

## 7. The ₦2,000 fee

- **Compliant only if** it is genuinely a **platform/technology fee** for platform
  features: dispute logging, evidence storage/vault, document templates, tracking,
  notifications, downloadable reports.
- **Non-compliant if** any part of it pays for legal representation or advice delivered
  by lawyers. That becomes fee-sharing with a non-lawyer / payment for legal services.
- If a partner law firm is used, the firm invoices users separately for legal work.

---

## 8. Interim recommendation (pending counsel)

1. **Do not launch or expand** legal-representation features.
2. **Do not change wording yet** (owner decision) — but be aware current wording
   ("assigned lawyer", "advisory", "coverage") is the highest-risk part.
3. Prepare a **dispute documentation / evidence vault** direction (Option C) as the
   likely safest core, with Option B for representation.
4. Put Section 10 to the lawyer; record written answers; then decide.

---

## 9. Decision checklist (after lawyer review)

- [ ] Lawyer confirms whether in-house counsel may act for users, or only the company.
- [ ] Lawyer confirms fee-sharing rules for the ₦2,000 platform fee.
- [ ] Lawyer confirms whether "coverage" implies insurance (NAICOM).
- [ ] Lawyer confirms acceptable wording (Section 2.2) and required disclaimers.
- [ ] Lawyer confirms whether a separate lawyer-owned firm is required for representation.
- [ ] Lawyer confirms advertising/touting limits for the directory and auto-assignment.
- [ ] Product owner chooses Option A / B / C (+ D wording).
- [ ] Only then: implement changes across the files listed in Section 2.3.
- [ ] Update all locales (`client/src/i18n/*.json`) consistently.
- [ ] Add "not a law firm / no legal advice" disclaimer site-wide where legal content appears.

---

## 10. Questions to ask the lawyer (MUST be answered in writing)

**Practice & structure**
1. May an in-house legal department of a technology company (RentalHub NG) act for the
   company's **users** (tenants/landlords) in their disputes, or may it act only for the
   company itself?
2. If users need representation, must the lawyers practise through a **separate,
   lawyer-owned law firm / incorporated legal practice**? Can that firm be branded
   "RentalHub Legal" without misleading or amounting to touting?
3. What ownership/control rules apply (Legal Practitioners Act) to a law firm associated
   with a tech company — can the company or its shareholders own any part of it?

**Fees**
4. Is it permissible for RentalHub to charge users a fee (e.g. ₦2,000) where any portion
   funds legal work by its in-house or partner lawyers? Does that constitute
   **fee-sharing with a non-lawyer** under the RPC 2007?
5. If the fee is purely a platform/technology fee (evidence vault, dispute logging,
   templates, reports) with **no** part paying for legal services, is that permissible?
6. If a partner firm is used, must the firm invoice users directly? Can RentalHub collect
   on the firm's behalf, or is that fee-sharing?

**Advertising / solicitation / touting**
7. Does marketing "a lawyer is assigned to you automatically" or "legal protection
   coverage" amount to advertising/solicitation/touting by lawyers, and is it prohibited?
8. Is a **paid lawyers directory unlock** (users pay to see lawyer contact details)
   permissible, or does it raise touting/fee-sharing issues?
9. What wording is acceptable for a directory/referral feature without breaching
   advertising rules?

**Insurance**
10. Does "Legal Protection Coverage" (a fixed fee for access to legal assistance) constitute
    **legal-expenses insurance** requiring NAICOM licensing? What wording avoids that?

**Unauthorized practice & disclaimers**
11. Which current claims ("advisory", "document reviews", "coverage") risk unauthorized
    practice of law, and what must be removed/reworded?
12. What disclaimer(s) must appear (e.g. "RentalHub NG is not a law firm and does not
    provide legal advice"), and where?
13. Are there confidentiality/conflict rules we must design for when logging user disputes
    and evidence on the platform?

**Data / evidence**
14. Any data-protection (NDPA) considerations for storing dispute evidence and lawyer case
    notes? Retention periods?

**Partner recruitment**
15. Are there restrictions on how we recruit lawyers to the platform/program
    (the "platform lawyer program")?

---

## 11. Do NOT do until counsel approves

- Do not change the wording in Section 2.2.
- Do not launch, expand, or promote legal representation.
- Do not describe the service as "legal advice", "advisory", or "coverage".
- Do not take any fee that funds legal work.
- Do not let the platform control/direct lawyers' professional work.

---

## 12. Resume instructions for a future AI session

When resuming:
1. Read this document fully.
2. Ask the owner for the lawyer's written answers (Section 10).
3. Based on the answers, choose Option A/B/C and the wording changes (Section 6/2.2).
4. Implement across the files in Section 2.3, updating **all** locales in
   `client/src/i18n/*.json`.
5. Add the disclaimer wherever legal content is shown.
6. Run the client build and backend tests before deploying.

---

## 13. Change log

- 2026-09-12 — Document created. Captured current implementation, risks, options,
  in-house-department analysis, the ₦2,000 fee analysis, and the lawyer question list.
  No code or wording changed (owner decision: wait for lawyer).
