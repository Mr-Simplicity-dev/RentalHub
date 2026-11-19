# Verification, photo capture and OTP release — 19 November 2026

## What is live

Android **1.0.67, build 78** is available at:
https://rentalhub.com.ng/api/downloads/app?v=1.0.67

The website and shared backend were updated. Both RentalHub workers were reloaded and are healthy. Other hosted applications were left running.

## Photo capture

- The customer Profile screen now opens a permission-aware live camera on Android and iOS source.
- The mobile flow checks one centred face and the open-eyes / closed-eyes / open-eyes sequence, then captures and saves automatically.
- The separate **Upload Passport** button is removed from the customer Profile flow. The web Profile and shared live-photo modal also save after successful capture.
- Existing consent, secure capture sessions, server photo screening and review rules are preserved. A saved photo does not automatically mean identity approval.
- A failed save offers a retry. A rejected photo must be retaken. No gallery-photo bypass was introduced.

The original web face library was incompatible with the existing Content Security Policy. The replacement uses the TensorFlow.js runtime and locally served, Apache-2.0-licensed Google/MediaPipe models. The model files and their checksums are versioned under `client/public/models/live-face/v1/`. The existing face movements and form remain in place.

**Security policy was kept unchanged.** Automatic approval review rejected a proposed CSP expansion; that action was not applied. The completed implementation was tested under the original policy. JavaScript eval remained blocked. An optional WebAssembly capability probe from the legacy peer package was also blocked and handled; actual face inference completed through the selected TFJS runtime.

The real browser test used Google's public sample portrait, not a customer photo. It detected one face. The sample image was not uploaded to RentalHub or committed. During landmark analysis, customer image pixels stay in the browser. The normal save step sends the captured photo to RentalHub's existing protected upload API.

## Verification labels and refresh

- Email and phone results refresh from the server when users return to the app/site and after successful verification.
- A successful phone/email confirmation updates the app's saved user details.
- Confirmed identity flags take precedence over an old `not_submitted` label.
- `provider_pending` displays as verification in progress.
- Revalidation requests remain action-required, including when an older verified flag exists.
- Unknown or contradictory results display status unavailable rather than a false not-submitted or verified label.
- Failed status requests are shown as unavailable; they are not treated as proof that verification is pending.
- Identity review, email confirmation and phone confirmation remain separate checks. No customer verification flags were manually approved during deployment.
- Existing recent fixes that preserve `phone_verified` when an unchanged/equivalent phone is saved were included in the release.

## OTP and foreign numbers

The configured order remains **Termii first, then Twilio**.

- An immediate Termii failure can use Twilio. The existing delivery-failure/timeout worker can also attempt the remaining configured provider.
- Fallback reuses the same OTP text and recipient. It does not generate a second conflicting code or extend the original expiry.
- A successfully used registration/phone OTP now clears its delivery-code field, expires its pending delivery attempts and stops later backup claims.
- Explicit international `+` / `00` country codes are preserved. Nigerian local numbers continue to normalize to `234`.
- Placeholder Twilio Messaging Service values are rejected as send routes. A valid owned sender can be used instead.

The Twilio account already owned one SMS-capable number ending **4743**. It was configured privately as `TWILIO_FROM`. No number was purchased. No test SMS or voice call was sent. The running RentalHub workers were checked for the active sender and `termii,twilio` order.

**Remaining account step:** international delivery requires the destination countries to be permitted in Twilio. Country-specific sender requirements may also apply. Those Console settings were not changed during this work, and real overseas delivery was not claimed as tested.

Official guide: https://www.twilio.com/docs/messaging/guides/sms-geo-permissions
International sender guide: https://www.twilio.com/docs/messaging/guides/sending-international-sms-guide

## Test and build evidence

- Full backend suite on the final backend code: **283 passed, 0 failed**.
- Full web suite: **43 files, 226 tests passed**.
- Web production build: **passed**, 3.69 seconds on the VPS.
- Android signed release build: **passed**, 22 minutes 42 seconds; 630 tasks.
- Native live-photo sequence tests: **4 passed**.
- Native registration-email tests: **4 passed**.
- Native update-version, resume/retry and notification-badge checks passed.
- Browser inference with the real locally served model and public sample face passed while JavaScript eval stayed blocked.
- All four public model JSON/weight files matched the pinned SHA-256 manifest after deployment.

Build warnings remain visible: large frontend chunks and a missing export in the unused legacy MediaPipe runtime branch. The application explicitly selects `runtime: 'tfjs'`; the real browser test exercised that selected runtime successfully. The warnings were not suppressed.

No physical Infinix or iPhone camera test was performed. Please install the new APK and try the capture flow on the actual phone. No signed iOS IPA was produced on Windows.

## APK integrity and update behaviour

- Package: `com.rentalhubng`.
- Version: **1.0.67**, Android build **78**.
- Bytes: **109269335**.
- SHA-256: `1499740f318e9a6093b7d1bb2a4448687d83aaa8917824382c8e930b01dce28b`.
- Signing certificate SHA-256: `be593ddf8cc4bc731d682390be4d92b9e763441725da368c37c0ca6443a6dd9d`, matching the previous release.
- Complete public HTTPS download: HTTP 200, correct branded filename, no-store cache headers, exact matching size and hash.
- Android 1.0.67/build 78: `update_available: false`, `update_required: false`.
- Android 1.0.66/build 77: `update_available: true`.

The iOS source is 1.0.67/build 72. Its JavaScript bundle passed and is 8,052,269 bytes, SHA-256 `67e80fb62781652a2f69c0f56d4950dc9723d5f58f889e7f8cda6c76ccda16ad`. The published iOS track stays at 1.0.3/build 13 until an actual signed iOS release exists; its update check was verified to remain false for the current published build.

## Deployment and Git

- Tested runtime source: `e2b3f9f86a87a77d6ceab586b5f8a6a1bb259dc5`.
- Mobile source: `20f903f690c297ec59ac5d4fb0b32dc6a38a7ffa`.
- Both repositories were pushed to GitHub master. Existing concurrent edits were preserved.
- A separate worktree was used for installs, tests and frontend builds before promotion.
- Dependency/build folders were exchanged atomically. Old hashed web assets were kept for already-open browser pages.
- The APK was uploaded to a temporary file, checked, then published atomically. Version metadata was updated after the APK, with matching `bytes` and `size`.
- Only RentalHub PM2 workers 2 and 3 were reloaded. The PM2 state was saved.
- Nginx configuration validation passed. Its configuration was not changed.
- No new migration was needed. Historical migration tracking was not rewritten.
- Actual environment credentials, generated release files, private backups, customer uploads and audio were kept out of Git.

Private rollback/evidence folder:
`/var/backups/rentalhub/verification-1.0.67-2026-11-19T04-32-13-413Z`

It contains the prior environment and APK/version files, source state and test/public-verification logs. Prior dependency/build folders remain in `.release67-verification-stage` after the atomic exchanges. Do not rerun the promotion script: its exchanges are not an idempotent redeploy command.

Evidence files include `backend-final.log`, `final-web-checks.log` and `public-verification.json`. Local release artifacts are in `RentalHubMobile/.release-verification-fixes/`, including the signed APK, iOS JavaScript bundle, browser proof and manifest.

Public health returned HTTP 200 and status OK. Anonymous access to verification status returned HTTP 401. The final public checks used IPv4 after an outbound IPv6 connection from the VPS reset; local internet and public IPv4 checks both passed without disabling certificate verification.
