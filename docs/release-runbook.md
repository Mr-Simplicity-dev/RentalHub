# Release Runbook — Web + Mobile (Android/iOS)

Who: maintainer with DB access, EAS/CI, and store credentials.
Reference: `docs/parity-gaps.md` §5 (NOT-implemented list) and this file.
Status: **not yet executed**. Do these in order.

## 0. Prereqs / branch state
- Parent `RentalHub` `master` at ≥ `21f57be`; mobile `RentalHubApp` `master` at ≥ `72b8653`.
- `.env` present with DB + Paystack + Twilio + EAS (`EXPO_TOKEN`) secrets on the build machine/CI.
- Working tree clean of our changes (other-session files left as-is are fine).

## 1. Backend migrate + deploy
1. Reconcile pre-existing migration-hash drift first (documented review with the other session),
   or run with a reviewed `MIGRATIONS_SKIP_HASH_CHECK` — do not silently skip.
2. Apply migrations: `npm run migrate`  (adds `rent_calculator_fees` + seed global row).
3. Smoke-test the new backend surfaces:
   - `POST /api/rent-calculator/estimate`, `GET /api/rent-calculator/fees`,
     `GET/POST/DELETE /api/rent-calculator/admin/fees` (each role tier).
   - `GET /api/commissions/admin` (admin/super_admin).
4. Deploy (pm2/EAS/CI) and verify health + the above endpoints against the live env.

## 2. Version bump (mobile)
- `RentalHubMobile/package.json` `version` → next (currently `1.0.2`).
- `app.json`: `android.versionCode` + `ios.buildNumber` → next (currently `3`).
  (CI `eas build` uses remote appVersionSource; confirm after a run.)

## 3. Build & publish
Android:
- Local: `cd RentalHubMobile/android && ./gradlew assembleRelease` then `bundleRelease` (`.aab`).
- Or CI/EAS: `npx eas build -p android --profile preview` (APK) / production (store).
iOS:
- `npx eas build -p ios` (or Xcode on a Mac). **No local iOS artifact exists** — iOS must be built via EAS/CI.
- Replace the download artifact: copy the new Android APK over `uploads/app.apk` (repo root) and commit/push it, or point downloads at the EAS/CI artifact URL.
- Submit store builds (`eas submit` / App Store Connect + Play Console).

## 4. QA checklist (device + live env)
Security / auth:
- [ ] 2FA: TOTP enable/confirm/disable in Profile (recovery codes shown); wallet-withdrawal
      triggers the 428 → TOTP/SMS step; SMS code resend works.
- [ ] Diaspora registration: Foreigner flow, diaspora fee shown, and (live Paystack foreign card)
      the 402 `FOREIGN_CARD_ADJUSTMENT` second-payment modal completes registration.
Surveys / tenant flows:
- [ ] Dashboard shows required (Part A) / continue (Part B) survey card; wizard answers/saves/
      completes; Part A screen-out ends early.
- [ ] Rent calculator (public page + property detail + dashboard + savings modal handoff) returns
      numbers and the "start savings plan" prefill works.
- [ ] New tenant flows: appeals, refunds/relocation (+ landlord approve/reject), grace.
Admin (super / finance / state):
- [ ] Rent-savings admin approvals; agent-commission list/verify/reverse (`/commissions/admin`);
      inspections assign/start/complete/cancel; ModerationHub ratings + credential revalidation.
- [ ] State-admin finance tabs (commissions/transactions/withdrawals/request w/ 2FA);
      FinanceStateAdmins (rate/freeze/create); Marketing (email/sms), Diaspora desk, SEO tools,
      Survey analytics, Admin accounts, Privacy data.
Regression:
- [ ] Existing tenant/landlord/agent dashboards, messages, property browse, payments unaffected.
- [ ] Guest/public home + public rent-calculator page work with no login.

## 5. Post-release
- Update `docs/parity-gaps.md` §5 statuses + this runbook's checked boxes.
- Close out device QA findings as new issues; nothing is committed on their behalf.
