# VAT, Invoicing & Payment-Splitting — Spec (Adapted to RentalHub)

**Status:** DRAFT — pending a Nigerian tax advisor and an owner decision. **No code
to be written until this is approved.**

> **NOT TAX ADVICE.** This is an engineering/product spec. A qualified Nigerian tax
> practitioner must confirm the VAT position, thresholds and FIRS remittance rules
> before implementation. Several figures below are flagged "verify".

---

## 1. Why this document

A generic prompt proposed a Paystack Split-Payments architecture with VAT handling
and automated invoicing. This document adapts that idea to **what RentalHub actually
has**, separates the **safe additive work** from the **re-architecture**, and lists
the decisions + tax questions to settle first.

---

## 2. Current state (as built)

- **Single Paystack account.** Uses `/transaction/initialize`, `/transaction/verify`,
  `/transfer`, `/transferrecipient`, `/bank`, `/bank/resolve`. **No `/subaccount`,
  no `/split`** — Paystack Split Payments is NOT implemented.
- **Fee model:** `platformFee = amount * 0.025` (2.5%), and
  `landlordAmount = amount - platformFee` (`services/paymentService.js`). The tenant
  pays the rent; the **landlord bears the fee**.
- **Landlord payout:** `creditLandlordRentPayment` credits the landlord's **internal
  wallet** (pending until clearing); payouts then go via Paystack `/transfer`
  (see `services/agentWithdrawalService.js`, `services/payoutRetry.service.js`).
- **Tables:** `payments`, wallet/commission tables. **No `transactions`, no
  `invoices`, no `subaccounts` table.**
- **Tax:** no VAT logic. No `IS_VAT_APPLICABLE`, no `vat_collected_pool`.
- **Receipts:** emails via `config/utils/paymentReceipt.js`, idempotent through
  `payments.receipts_sent_at` (migration 147).
- **Config:** `app_settings` (used for feature flags / global config).

---

## 3. Part A — VAT on the platform fee (rent stays VAT-exempt)

### 3.1 Rule
- **Residential rent is VAT-exempt** → never add VAT to the rent portion.
- **RentalHub's service fee/commission is subject to 7.5% VAT** → VAT applies **only
  to the fee line**, and only when the platform is VAT-liable.
- Global toggle `IS_VAT_APPLICABLE` (Boolean, in `app_settings`).

### 3.2 Behaviour
- `IS_VAT_APPLICABLE = false` (startup phase): fee charged is exactly the commission;
  VAT computed = ₦0.00; `vat_collected_pool` untouched.
- `IS_VAT_APPLICABLE = true`: compute `vat = serviceFee * 0.075`, add it to the fee
  line, adjust the gross checkout total, and accumulate `vat` into
  `vat_collected_pool` for FIRS remittance.

### 3.3 Two money-model variants (decide in Part C)
- **Fee on top of rent (tenant pays):** `gross = rent + serviceFee (+ VAT)`.
- **Fee out of rent (landlord pays — current behaviour):**
  `gross = rent`; `landlordNet = rent - serviceFee`; VAT is remitted out of the
  service fee. The tenant total does not change.

### 3.4 Proposed data (additive)
- `app_settings`: `is_vat_applicable` (bool), `vat_rate` (numeric, default 0.075).
- `payments` (extend, don't duplicate): `service_fee`, `vat_amount`,
  `vat_rate_applied`, `landlord_net`, `fee_bearer` (`tenant`|`landlord`).
- New ledger: `vat_collected_pool` (or a `vat_ledger` table) with
  `payment_id`, `vat_amount`, `period` (YYYY-MM), `remitted_at`, `firs_reference`.

### 3.5 Edge cases to define
- Refund: VAT on the fee must be reversed/credited in the same period.
- Partial payments (rent part-paid): VAT proportional to the fee actually charged.
- Historical rows: `vat_amount = 0`, `vat_rate_applied = null`.
- Toggle changes mid-period: never recompute past rows; report by the period applied.

---

## 4. Part B — Automated invoicing

### 4.1 When
Generate an invoice immediately after a successful payment (webhook
`charge.success` **and** the `/verify-rent` path), idempotent (one invoice per
`payment_id`), mirroring the existing `receipts_sent_at` pattern.

### 4.2 Invoice content (compliant breakdown)
- **Base Rent** — labelled "VAT Exempt (residential rent, Nigeria Finance Act)".
- **RentalHub Service Charge** — the commission line.
- **VAT (7.5%)** — only if `IS_VAT_APPLICABLE`; else ₦0.00 with a "not applicable"
  note.
- **Total Gross Paid.**
- Invoice number (sequential, per year), issue date, payer + beneficiary, property
  reference, Paystack reference.

### 4.3 Proposed data (additive)
- `invoices`: `id`, `payment_id` (unique), `invoice_number` (unique),
  `issued_at`, `base_rent`, `service_fee`, `vat_amount`, `total`,
  `fee_bearer`, `vat_applicable`, `json` (jsonb snapshot), `pdf_url` (nullable).
- Delivery: reuse `sendEmail`; store `emailed_at`.

---

## 5. Part C — Payment splitting: the real decision

### Option 1 — Keep the current model (wallet + payout)  ← lower risk
Collect into RentalHub's Paystack account → credit landlord wallet (pending) → pay
out via `/transfer`.
- Pros: no change to refunds/disputes/chargebacks; no landlord KYC; already built;
  RentalHub holds funds during the clearing window (safer for disputes).
- Cons: rent **does** sit in RentalHub's account (the "pass-through" framing is
  accounting, not routing); payout latency; the prompt's "route rent away instantly"
  is not satisfied.

### Option 2 — Paystack Split Payments + Subaccounts  ← higher effort/risk
Create a Paystack **subaccount per landlord**; at checkout, `rent → landlord
subaccount`, `service fee (+VAT) → RentalHub`.
- Pros: rent never sits in RentalHub's account (matches the "transitory escrow"
  intent); instant landlord settlement.
- Cons: **landlord KYC/subaccounts** required; **refunds/chargebacks** must go
  through Paystack (harder than an internal reversal); changes to refund,
  withdrawal, commission and webhook logic; Paystack split `bearer`/charge semantics
  must be configured so VAT and fees are correct.

### Recommendation
Ship **Part A + Part B on top of Option 1 first** (they are additive and reversible),
then decide Option 2 separately as a project with a migration plan. Do not rip out
the wallet model in the same change as VAT/invoicing.

---

## 6. The fee-bearer decision (must choose)

- **Tenant pays the fee** (prompt's model): `gross = rent + fee (+VAT)`.
- **Landlord pays the fee** (current): `landlordNet = rent - fee`; VAT out of the fee.

This changes pricing, receipts and invoices — pick one and keep it consistent.

---

## 7. Questions for the tax advisor (get answers in writing)

1. Is RentalHub **VAT-registered / VAT-liable** today, or under the small-company
   exemption? **Verify the threshold** — the prompt cites "₦50M turnover", which looks
   like the **CIT small-company** threshold; the VAT small-company exemption has been
   **₦25M turnover**. Which applies to us now?
2. When we cross the threshold, is VAT charged **from the first naira** or only on
   turnover above it?
3. Confirm: **residential rent is VAT-exempt**; our **service fee is VATable**.
4. Is VAT calculated on the **fee only** (not the rent) in our model — and if the
   landlord bears the fee, how should VAT be shown on the tenant's invoice?
5. **FIRS remittance:** monthly, by the 21st? What return (VAT 002) and what records
   must we keep (invoice numbering, VAT pool ledger)?
6. **Withholding tax:** does WHT apply to our service fee (e.g., 5% services) or to
   rent (e.g., 10%) in our flows, and who remits it?
7. **Invoicing requirements:** what must appear on a compliant invoice (TIN, VAT
   number, address, invoice number format)?
8. **Split payments:** any tax/regulatory issue with routing rent directly to landlord
   subaccounts vs collecting and paying out?
9. **Startup phase:** is it acceptable to NOT charge VAT (toggle off) and later start,
   provided records are clean?

---

## 8. Implementation plan (phased, after approval)

- **Phase 1 (additive):** `app_settings` VAT keys; `payments` fee/VAT columns;
  `vat_ledger`; invoice table; invoice generation on webhook + verify; invoice email.
  Toggle off by default → no behaviour change until switched on.
- **Phase 2:** monthly VAT report + FIRS remittance workflow (admin).
- **Phase 3 (separate project):** evaluate Option 2 (subaccounts/splits) with a
  migration plan for refunds/withdrawals/commissions.

---

## 9. Open decisions

- [ ] Fee bearer: tenant or landlord?
- [ ] VAT threshold + registration status (advisor).
- [ ] Option 1 vs Option 2 (and timeline).
- [ ] Invoice format (JSON + PDF? PDF provider?).
- [ ] Invoice numbering scheme (per-year sequence).
- [ ] Whether VAT is shown to the tenant when the landlord bears the fee.

---

## 10. Resume instructions (for a future session)

1. Read this doc; confirm the advisor's answers (Section 7) and the decisions
   (Section 9).
2. Implement **Phase 1 only** (additive, toggle off) across `services/paymentService.js`,
   `app_settings`, new migrations, and `config/utils/paymentReceipt.js`.
3. Update invoices/receipts and all locales if any user-facing labels change.
4. Run backend tests + client build; deploy via the standard server flow.
5. Only then consider Phase 3.

---

## 11. Change log

- 2026-09-18 — Created. Adapted the generic prompt to RentalHub's actual payment
  model; separated additive VAT/invoicing work from the split-payments
  re-architecture; listed tax-advisor questions and open decisions. No code written.
