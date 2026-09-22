# RentalHub NG — Codebase Audit Report

**Date:** 2026-09-21
**Repo:** `Mr-Simplicity-dev/RentalHub`
**Branch/commit at audit time:** `master` @ `eb48b87`
**Method:** Read-only static analysis (3 parallel passes) + manual spot-checks.
**Status:** Nothing was modified. Findings are candidates, not confirmed deletions.

> **Caveat:** The backend dead-file list in particular deserves a manual pass
> before deleting — dynamic `require`s or DB/route string loading can hide
> usage. Treat Section 2 as "candidates", not "safe to delete".

---

## 1. Unused npm dependencies

### Backend — `package.json` (32 deps checked: 31 dependencies + 1 devDependency)

| package | version | category | evidence / notes |
|---|---|---|---|
| `nodemailer` | ^9.0.1 | **A — TRULY UNUSED** | Zero references in backend source. Mail is sent via `resend` (`config/utils/mailer.js`). Only appears in `package.json`/lockfiles. |
| `jwt-decode` | ^4.0.0 | C — indirect | Zero backend refs. Only imported by `client/src/services/authService.js` and the mobile app. |
| `mongodb` | ^7.1.0 | C — transitive | No direct `require('mongodb')`/`MongoClient`. Only a string in `server.js:142`. Transitive dep of `mongoose`. |
| `qrcode` | ^1.5.4 | C — dead ref only | Sole reference is `client/src/services/courtBundle.service.js:6` — itself a dead/misplaced file (see §2). |
| `nodemon` (dev) | ^3.1.14 | B — tooling | No script/JS reference. `dev` script is `node server.js`, not nodemon. |

All other 27 backend deps have genuine source/config references.

### Client — `client/package.json` (31 deps checked: 28 dependencies + 3 devDependencies)

| package | version | category | evidence / notes |
|---|---|---|---|
| `@testing-library/react` | ^16.3.1 | **A — TRULY UNUSED** | Zero imports (verified manually). Only test files are `client/src/App.test.js` and `client/src/utils/guestSupportCredentials.test.js`; neither imports it. |
| `@testing-library/user-event` | ^13.5.0 | **A — TRULY UNUSED** | Zero imports anywhere in `client/src`. |
| `@testing-library/dom` | ^10.4.1 | C — peer/transitive | No direct import; peer of `@testing-library/react`. Only `@testing-library/jest-dom` is used (`client/src/setupTests.js:5`). |
| `ajv` | ^8.20.0 | C — build tooling | No direct import in `client/src` or configs. Transitive (webpack/schema-utils/eslint). |
| `ajv-keywords` | ^5.1.0 | C — build tooling | No direct import; transitive of ajv tooling. |
| `typescript` | ^4.9.5 | B — tooling | Build tooling only. No `.ts`/`.tsx` files and no `tsconfig.json` in `client/`. |

All other 25 client deps have genuine source/config references (e.g. `@tailwindcss/forms` in `client/tailwind.config.js:131`, `tailwindcss`/`autoprefixer` in `client/postcss.config.js`, `react-scripts` in `client/scripts/build.js:39` and npm scripts).

### ⚠️ Real bug found
`client/src/services/courtBundle.service.js` calls `require('qrcode')`, but
`client/package.json` only declares `qrcode.react` (not bare `qrcode`). It works
only by npm hoisting from the backend. Moot if the dead file is deleted.

### Safe first wins
- Remove `nodemailer` (backend).
- Remove `@testing-library/react` and `@testing-library/user-event` (client).

---

## 2. Dead / unreferenced source files

### Client (high confidence)

| File | Evidence | Confidence |
|---|---|---|
| `client/src/components/admin/AdminTabs.jsx` | Stub file (`// Removed — AdminTabs was unused`); 0 refs | high |
| `client/src/components/damage/DamageReportPreview.jsx` | Stub returning `null`; not in `damage/index.js` barrel; 0 refs | high |
| `client/src/components/admin/RentSavingsSetupFees.jsx` | 0 import/require, 0 string refs | high |
| `client/src/components/admin/RentSavingsWithdrawals.jsx` | 0 import/require, 0 string refs | high |
| `client/src/components/common/ConfirmDialog.jsx` | Verified: only self-definition/export, no importer | high |
| `client/src/components/fumigation/DashboardButton.jsx` | 0 refs | high |
| `client/src/components/fumigation/FumigationCleaningWizard.jsx` | 0 refs (`App.js` lazy-loads other fumigation pages) | high |
| `client/src/pages/admin/SuperFumigationAdminDashboard.jsx` | 0 refs (State/Lga variants are routed; Super variant is not) | high |
| `client/src/utils/constants.js` | No `utils/constants` import anywhere | high |
| `client/src/utils/destructiveActions.js` | Token appears only inside itself | high |
| `client/src/services/logger.js` | Not imported by any client file | high |
| `client/src/services/fraudEngine.js` | Misplaced backend file (`require('../db/index.js')` unresolvable under `client/`) | high |
| `client/src/services/key.service.js` | Misplaced backend file (`require('../models/UserKey')`) | high |
| `client/src/services/signature.service.js` | Misplaced backend file; only hit is `controllers/disputeSignature.controller.js` (also dead) | high |
| `client/src/services/courtBundle.service.js` | Misplaced backend file; only hit is backend `services/courtBundleService.js` | high |

### Backend (high confidence)

| File | Evidence | Confidence |
|---|---|---|
| `config/middleware/requireLgaAdmin.js` | Verified: token only in own definition | high |
| `config/models/Blog.js` | Shim `require('../../models/Blog')`; nothing imports `config/models/Blog` | high |
| `config/models/Location.js` | Shim `require('../../models/Location')`; nothing imports it | high |
| `config/utils/backlinkOutreach.js` | 0 import/require, 0 string refs | high |
| `config/utils/constants.js` | 0 import/require | high |
| `config/utils/gsc.js` | 0 refs anywhere | high |
| `config/utils/internalLinks.js` | 0 import/require, 0 string refs | high |
| `config/utils/ledger.js` | No `utils/ledger` path reference anywhere | high |
| `config/utils/ninValidator.js` | 0 refs anywhere | high |
| `controllers/disputeSignature.controller.js` | Only a self path comment; not mounted/required | high |
| `controllers/locationPropertyController.js` | 0 refs anywhere | high |
| `models/Property.js` | No `models/Property` reference; orphan loose-schema model | high |
| `routes/controllers/locationController.js` | Dead shim; real one is `controllers/locationController.js` | high |
| `services/locationFilterService.js` | 0 refs anywhere | high |
| `services/superAdminService.js` | Legacy duplicate; live one is `services/superAdmin/index.js` (required by `controllers/superAdmin.controller.js:1`) | high |
| `utils/blogGenerator.js` | Dead shim; nothing requires it | high |
| `utils/seoContent.js` | Dead shim; nothing requires it | high |
| `utils/seoHelper.js` | Dead shim; nothing requires it | high |
| `utils/pingGoogle.js` | Dead shim; only `config/utils/pingGoogle.js` (its target) matched | high |

### Dead-by-association (only referenced by a dead shim above)

| File | Evidence | Confidence |
|---|---|---|
| `config/utils/blogGenerator.js` | Only referenced by dead `utils/blogGenerator.js` | medium |
| `config/utils/seoContent.js` | Only referenced by dead `utils/seoContent.js` | medium |
| `config/utils/seoHelper.js` | Only referenced by dead `utils/seoHelper.js` | medium |
| `config/utils/pingGoogle.js` | Only referenced by dead `utils/pingGoogle.js` | medium |

### Uncertain — one-off scripts (may be run manually)

| File | Reason |
|---|---|
| `check_migrations.js` | Top-level one-off script; not in `package.json` scripts, not required anywhere |
| `createAdmin.js` | One-off admin-seeding script; token hits elsewhere are an unrelated function name |
| `createAdminsuper.js` | One-off super-admin-seeding script; 0 refs |

### Explicitly NOT dead (checked)
- Entry points: `server.js`, `client/src/index.js`, `client/src/App.js`, `client/src/setupTests.js`, `client/src/reportWebVitals.js`.
- `ecosystem.config.js` — invoked by `deploy/setup-server.sh` (`pm2 start ecosystem.config.js`).
- `config/utils/migrate.js` — required by `scripts/runMigrations.js` and `scripts/reconcileMigrationHashes.js`.

---

## 3. Stray `console.*` calls (server-side)

**Scope:** 343 backend `.js` files (excludes `node_modules`, `client`, `RentalHubMobile`, `geo`, `social-ads`, `video-ads`, `migrations`, `docs`, `scripts`).
**Total real calls:** 53 (20 `log`, 15 `warn`, 18 `error`).

### (A) Should be logger — 32

| file:line | method | snippet |
|---|---|---|
| `server.js:189` | warn | Evidence integrity monitor finished with `${summary.errors}` issues |
| `server.js:191` | log | Evidence integrity monitor completed (disputes: …) |
| `server.js:194` | error | Evidence integrity monitor failed |
| `server.js:200` | log | Evidence integrity monitor scheduled |
| `server.js:211` | warn | Payout retry cycle completed with issues |
| `server.js:213` | log | Payout retry cycle completed |
| `server.js:216` | error | Payout retry cycle failed |
| `server.js:222` | log | Payout retry scheduler started |
| `server.js:229` | log | MongoDB connected for cron jobs |
| `server.js:234` | error | MongoDB connection error |
| `server.js:238` | warn | MongoDB disconnected — cron jobs paused |
| `config/middleware/turnstileVerify.js:14` | warn | Turnstile verification explicitly SKIPPED |
| `config/middleware/turnstileVerify.js:21` | error | `TURNSTILE_SECRET_KEY` not set — rejecting (fail closed) |
| `config/utils/fxRates.js:84` | warn | FX auto-refresh failed |
| `config/utils/paymentReceipt.js:130` | error | `sendReceiptForPayment` error |
| `config/utils/paymentReceipt.js:212` | error | `sendPayoutReceiptEmail` error |
| `config/utils/paymentReceipt.js:264` | error | `sendAdminPayoutReceipt` error |
| `config/utils/paymentReceipt.js:300` | error | `sendAgentPayoutReceipt` error |
| `config/utils/paymentReceipt.js:332` | error | `sendUserPayoutReceipt` error |
| `jobs/registrationReminderJobs.js:54` | log | Reconciled N pending registrations |
| `jobs/registrationReminderJobs.js:58` | warn | Registration reconciliation error |
| `jobs/registrationReminderJobs.js:82` | log | Marked N stale registrations as abandoned |
| `jobs/registrationReminderJobs.js:86` | warn | Registration expiry error |
| `jobs/registrationReminderJobs.js:183` | log | Registration reminders: sent/due |
| `jobs/registrationReminderJobs.js:186` | error | Registration reminder job error |
| `jobs/registrationReminderJobs.js:204` | error | `getAbandonedRegistrationsSummary` error |
| `jobs/registrationReminderJobs.js:213` | log | Registration reminder job started |
| `routes/admin.js:263` | error | `req.logger ? … : console.error` (fallback only) |
| `routes/admin.js:280` | error | `req.logger ? … : console.error` (fallback only) |
| `services/paymentService.js:4616` | error | Failed to mark admin_commissions as paid |
| `services/pushService.js:26` | warn | `[push]` VAPID keys not configured |
| `services/recruitmentService.js:103` | warn | `RECRUITMENT_ACCESS_CODE_KEY` not set |

**Notes:**
- `server.js:189–238` run after `const logger = require(...)` at `server.js:566`, so the logger is available.
- `routes/admin.js:263,280` already prefer `req.logger`; `console.error` is a defensive fallback.
- `jobs/registrationReminderJobs.js` is the **only** job file not using the logger (all six siblings import it).
- `services/recruitmentService.js` already imports `logger` at line 10; `services/pushService.js` does not.

### (B) Intentional / console-OK — 21
Early bootstrap before the logger is wired (`server.js:36–45`, `server.js:143–154`) and standalone CLI scripts (`check_migrations.js`, `createAdmin.js`, `createAdminsuper.js`).

### (C) Test / test-helper — 0
No `console.*` calls in `tests/**` (28 test files) or test helpers.

**Highest-value cleanup targets:** `jobs/registrationReminderJobs.js` (8), `config/utils/paymentReceipt.js` (5), and the cron/Mongo logging in `server.js` (11).

---

## Summary of actionable items

| # | Item | Risk | Suggested action |
|---|---|---|---|
| 1 | Remove `nodemailer` (backend) | low | `npm uninstall nodemailer` |
| 2 | Remove `@testing-library/react`, `@testing-library/user-event` (client) | low | `npm uninstall` in `client/` |
| 3 | Delete 2 explicit stub components (`AdminTabs.jsx`, `DamageReportPreview.jsx`) | low | delete files |
| 4 | Convert 32 `console.*` calls to logger | medium | start with `jobs/registrationReminderJobs.js` |
| 5 | Delete dead backend files/shims | medium-high | manual verification pass first |
| 6 | Delete 4 misplaced backend files under `client/src/services/` | medium | verify no client imports first |
| 7 | Resolve `qrcode` vs `qrcode.react` mismatch | low | moot if #6 deletes the file |
