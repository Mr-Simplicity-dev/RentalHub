# Rent Help — "Pay Rent on Behalf" (Option 2)

Status: **IMPLEMENTED (backend + UI slices 1–3), deployed.** Pending real-world
QA (SMTP + Paystack + visual). Append-only reference for future work.

## What it is
A tenant A who can't pay rent can share a **one-time secure link**; any logged-in
user — another tenant, or a **landlord paying for a son/daughter who is a tenant**
— opens it and pays A's rent. Money rules are locked so this can't be abused.

## Money rules (locked)
- **Amount is server-computed** from the property's listed rent at link creation.
  The payer page shows the confirmed amount; no client-set partial amounts.
- **Single-use + 72h expiry.** A new link is cheap to create if one is abandoned.
- **Crediting:** the `payments` row belongs to **tenant A** (`user_id`), so A's
  rent credit, history and receipts follow A. `payer_user_id` records who paid.
- **No multiple-property bypass:** the same 402
  (`MULTIPLE_PROPERTY_SUBSCRIPTION_REQUIRED`) gate as a normal rent payment is
  enforced against the **obligor tenant**, so on-behalf can't get a second
  property past the subscription rule.
- **Eligibility for help:** tenant A may request help for a property where they
  have a **completed rent payment**, or where their **application is
  `approved`** (landlord accepted) and rent is not yet paid. Pending/submitted
  applications are **excluded**.
- **Receipts:** emails to tenant A ("your rent was paid") and payer B
  ("receipt"); idempotent via `payments.receipts_sent_at` (webhook + verify
  never double-send).

## API (backend, deployed)
- `POST /api/payments/request-rent-payment` (tenant A, `property_id`) → link/token.
- `GET  /api/payments/rent-request/:token` (any logged-in) → preview (tenant + amount).
- `POST /api/payments/pay-rent-on-behalf/:token` (`payment_method`) → Paystack
  authorize / bank-transfer details; enforces the multiple-property gate.
- `GET  /api/payments/rent-help/eligible` (tenant) → eligible properties
  (`paid` ∪ `approved`-unpaid; deduped).
- Verify: `GET /payments/verify-rent/:reference` accepts the owner **or** payer.

## Frontend (deployed)
- Tenant dashboard **Quick Action "Ask Someone to Pay Rent"** → `/rent-help`
  (`client/src/pages/RequestRentHelp.jsx`).
- Payer page `/pay-for-rent/:token` (`client/src/pages/PayRentOnBehalf.jsx`),
  lazy `ProtectedRoute`, any logged-in user.

## Schema (migrations)
- 146: `rent_payment_requests` + `payments.payer_user_id`.
- 147: `payments.receipts_sent_at`.

## Outstanding (real-world QA, not code)
- [ ] SMTP test of the tenant + payer receipt emails.
- [ ] Real Paystack card transaction end to end (needs live key + a property).
- [ ] Visual QA: dashboard quick action, `/rent-help`, `/pay-for-rent/:token`.
- [ ] Decide whether the tenant generator should also allow choosing *which*
  listed rent period/amount once a rent schedule exists (none today).
