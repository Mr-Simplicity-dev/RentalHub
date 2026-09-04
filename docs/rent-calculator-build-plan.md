# Rent Calculator — Build Plan

Feature: a rent calculator that helps tenants understand their **monthly payment** for a
listing, plan for the **move-in lump sum**, and (optionally) work from **monthly income**
to an affordable rent. Available on the web (public page, tenant dashboard, property
listings) and in the RentalHub NG mobile apps (single React Native codebase → iOS + Android).

> All product decisions below were confirmed with the product owner. This file is the
> source of truth; tick items off as they land.

## Confirmed product decisions

- **Headline number:** monthly rent cost first; the move-in lump sum (rent + fees) is the
  prominent second box with a Rent Savings handoff.
- **Both directions supported:** rent → monthly plan, and income → affordable rent.
- **Full NG fee breakdown** (itemised), seeded globally at agent 10%, legal 10%, caution
  1 month, agreement ₦5,000, service charge ₦0.
- **Engine lives on the backend** — one formula, one source of truth. All clients call it.
- **Affordability rule:** monthly income × user-set % (default ~33%) via a slider.
- **Placement:** (1) tenant dashboard + Rent Savings modal, (2) property listings
  (detail-page button, prefilled from the listing), (3) public `/rent-calculator` page.
- **Fee config is admin-managed in the DB, scoped by hierarchy:**
  - `lga_financial_admin` — their LGA only (LGA Finance Console).
  - `financial_admin` (state console) — their state + LGAs under it.
  - `state_admin` / `state_financial_admin` — their state (State Admin dashboard tab).
  - `super_financial_admin` — whole structure + global fallback row (Super Financial).
  - Super Admin dashboard — whole structure (global top level) too.
  - Resolution at estimate time: LGA row → state row → global row.

## Backend

- [x] Migration `migrations/145_rent_calculator_fees.sql` — `rent_calculator_fees` table
      (scope-keyed: global / state / LGA, partial-unique indexes, fee columns, audit
      operations table, updated_at trigger) seeded with the global default row.
- [x] Pure estimate function (`services/rentCalculatorMath.js`) + unit tests
      (`tests/rentCalculatorMath.test.js`, 7 tests green).
- [x] `services/rentCalculatorService.js` (re-exported by
      `controllers/rentCalculatorController.js`): public `getFees`, public `estimate`,
      scoped `adminGetFees` / `adminCreateFee` / `adminDeleteFee` enforcing the
      LGA → state → global hierarchy + audit trail.
- [x] `routes/rentCalculator.js` + mounted in `server.js` at `/api/rent-calculator`.
- [x] Backend suite green (`npm test` — 176 passed incl. the 7 new tests).

> Note: `npm run migrate:dry-run` is currently blocked by pre-existing migration-hash
> warnings on already-applied files (unrelated in-progress work). Migration 145 must be
> applied in a real env with `npm run migrate` once those are reconciled.

## Web — public page

- [x] `client/src/components/dashboard/RentCalculatorPanel.jsx` — shared calculator core
      (form, results, affordability, savings-to-goal), reused by the public page and the
      Rent Savings modal.
- [x] `client/src/pages/RentCalculatorPage.jsx` + public route `/rent-calculator`
      (registered in `App.jsx` public block).
- [x] Reads `?rent=&freq=&upfront=&income=&ratio=&months=&state=&lga=` to prefill.

## Web — property listings

- [x] "What's this per month & move-in?" button on property detail (`PropertyDetail.jsx`)
      → deep-links to `/rent-calculator` prefilled from `rent_amount` + `payment_frequency`
      (+ `state_id` when present).

## Web — tenant dashboard & Rent Savings

- [x] "Rent Calculator" StatCard on the tenant dashboard grid (`Dashboard.jsx`).
- [x] "Calculator" tab inside `components/dashboard/RentSavingsModal.jsx`.
- [x] "Start a rent savings plan for this amount" handoff pre-fills the create-plan form.

## Web — admin fee management (hierarchy)

- [x] `components/admin/RentCalculatorFeesAdmin.jsx` — scope-aware list + upsert + delete
      (reads the server-returned scope/capabilities, disables out-of-scope rows, requires
      a governance note, location pickers for global/state tiers).
- [x] Super Financial dashboard (`SuperFinancialAdminDashboard.jsx`) + nav entry.
- [x] Financial Admin console (`financial_admin`) new tab + LGA Finance Console section
      (`FinancialAdminDashboard.jsx`) + nav entries.
- [x] State Admin dashboard (`state_admin` / `state_financial_admin`) new tab
      (`StateAdminDashboard.jsx`).
- [x] Super Admin dashboard new "Calculator Fees" tab (`SuperAdminDashboard.jsx`).

## Mobile (React Native — iOS + Android, one codebase)

- [x] `RentalHubMobile/src/services/rentCalculatorService.js` — fees + estimate (+ admin).
- [x] `RentalHubMobile/src/screens/rent-savings/RentCalculatorScreen.js` — mirrors the web
      output: monthly headline, fee breakdown, move-in total, affordability, savings top-up.
- [x] Registered in `AppNavigator.js` TenantRoot + GuestStack (+ deep-link `rent-calculator`).
- [x] Dashboard entries (`DashboardScreen.js`): Rent Savings area ActionRow + StatCard.
- [x] Property detail CTA (`PropertyDetailScreen.js`) for guests/tenants, prefilled from the
      listing (`rent_amount`, `payment_frequency`, quarterly → 3-month upfront).

## Verify at the end

- [x] `node --check` on every touched server file.
- [x] `npm test` (backend suite) green.
- [x] Client production build green (`cd client && node --max-old-space-size=1800
      node_modules/react-scripts/scripts/build.js`).
- [ ] Migration dry-run / apply in a real env (`npm run migrate:dry-run` / `npm run migrate`)
      after the pre-existing hash warnings are reconciled.
- [ ] Visual QA on web public page, dashboard + savings modal, property detail, all four
      admin tiers, and the RN screens (device build).
