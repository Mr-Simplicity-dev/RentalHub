# Office fingerprint verification (SourceAFIS)

This is a permanent, non-expiring open-source integration, not a paid SDK trial. It supports **one-to-one verification of a selected assisted-registration customer**. It does not implement global fingerprint account search, password reset, NIN verification, liveness detection or customer impersonation. A match is advisory and never supplies a login token, marks KYC complete or authorizes an account change.

## Architecture and workflow

- Office Windows PC: existing HID Authentication Device Client and U.are.U 4500. Capture uses the official HID browser packages, vendored locally with their licences: `@digitalpersona/websdk` 1.1.0 and `@digitalpersona/fingerprint` 1.0.0 (MIT). The reader returns PNG samples; no file-upload fallback is offered.
- Authorized support agent: opens Assisted account registration & receipts on the website and selects a customer from the existing jurisdiction-filtered list.
- Enrollment: explain voluntary storage and removal, obtain agreement, send an enrollment-specific code to the verified customer phone, take two separate scans of the same finger, then submit the code and scans. Codes expire after five minutes, allow five attempts and are bound to customer and staff. Three sends per customer per ten minutes; existing sensitive-action limits apply too. Codes are not stored in staff-visible SMS delivery logs. Fingerprint approval does not reuse sign-in or recovery codes.
- Matching: Node invokes a bounded Java process with JSON over private stdin/stdout. No public matching-service port or shell command interpolation. SourceAFIS 3.18.1 is pinned; server chooses 500 DPI and a threshold of 60 by default. Browser-submitted thresholds, match results and templates are ignored.
- Storage: only an AES-256-GCM encrypted template, engine version and consent/enrollment metadata are saved. Ciphertext is bound to customer ID and engine version. Raw images are transient and never written by this integration. SourceAFIS templates are version-specific: upgrading the engine may require customer re-enrollment because raw images are deliberately not retained.
- Verification: fresh scan compared with the selected customer's server-held template. Staff see match/non-match, not similarity scores or templates. Existing permissions, payment and identity checks remain authoritative.
- Removal: scoped Super Admin or Super Support Admin can delete the template and outstanding enrollment approvals. An in-flight enrollment cannot restore a template after removal. Database backups need the normal retention/deletion policy too.
- Roles and geographical scope reuse assisted-registration policy. All staff routes require authentication, authorized role and existing privileged MFA. Match/enrollment/removal events use the existing activity logger without biometric payloads.

## Build and deployment

Requires Java 17+ on the **backend host**, Maven 3.9+ to build, and the existing PostgreSQL/application stack. The office PC only needs its installed HID client. Java need not be installed on every staff PC. The Android/iOS app cannot use this Windows USB reader integration directly; perform scans on the office website.

1. Build the redistributable engine from the repository:

   ```sh
   cd /var/www/rentalhub
   mvn -B -f tools/fingerprint-matcher/pom.xml clean verify
   ```

   Output: `tools/fingerprint-matcher/target/fingerprint-matcher.jar`. Build output is ignored by Git; it must be built or shipped with the deployment. Maven resolves SourceAFIS and its dependencies from Maven Central. Keep dependency licence notices with distributions.

2. Set in the existing backend environment/secret manager:

   - `FINGERPRINT_ENCRYPTION_KEY`: a dedicated random 32-byte key represented by **64 hexadecimal characters**. Generate securely once, keep it out of source control and logs, and back it up separately from the database. Losing/replacing it makes existing templates unreadable; rotating requires a controlled re-encryption procedure.
   - `FINGERPRINT_JAVA_PATH`: optional Java executable path; defaults to `java` on PATH. On this workstation the installed executable is `C:\Java\jdk-17.0.20.1+1\bin\java.exe`.
   - `FINGERPRINT_MATCH_THRESHOLD`: optional, default `60`, must be finite and between `40` and `1000`. The default is not a measured guarantee of accuracy for the actual office deployment.

3. Apply new migration `2031_office_fingerprint_verification.sql` using the normal migration process, rebuild the web client, then restart the backend:

   ```sh
   npm run migrate:dry-run
   npm run migrate
   npm run build --prefix client
   pm2 restart rentalhub --update-env
   ```

   Two new tables only: `office_fingerprint_enrollments` and `office_fingerprint_challenges`. Existing users, passwords and payment tables are unchanged. Missing configuration or Java fails closed; it does not affect ordinary sign-in.

4. The web content-security policy permits only HTTPS/WSS loopback connections to `127.0.0.1` for HID's dynamically assigned local endpoint. No `unsafe-eval` or additional inline-script permission was added. If Nginx adds its own CSP, it also needs these exact connect sources. Browser local-network/device permission and a trusted HID local certificate may be required. Do not disable TLS checks or broaden the policy to arbitrary hosts.

## Endpoints

Under `/api/assisted-registration`:

- `GET /staff/biometric-status`: real engine/configuration health.
- `GET /staff/:reference/fingerprint`: enrollment status, never template bytes.
- `POST /staff/:reference/fingerprint/consent`: customer enrollment approval code.
- `POST /staff/:reference/fingerprint/enroll`: consent/code plus two PNG samples.
- `POST /staff/:reference/fingerprint/verify`: one PNG sample, advisory result.
- `DELETE /staff/:reference/fingerprint`: scoped supervisor removal.

## Verification and limits

Engine unit tests reject malformed images, oversized dimensions and unsafe thresholds. Backend tests cover encryption/tamper detection, identity binding, staff scope, privileged/deleted accounts, consent, approval replay, no session issuance and route guards. Browser tests cover capture format handling and existing assisted-registration flows. Real engine checks use public upstream SourceAFIS `probe.png`, `matching.png` and `nonmatching.png`, not RentalHub customer data.

The local build successfully enrolled the upstream same-finger pair, matched it, rejected a different finger and rejected identical duplicate enrollment scans at the configured default threshold. This does not establish field accuracy, liveness, spoof resistance or compatibility of every reader/browser. Actual repeated scans from the office reader and end-to-end SMS/database enrollment still need to be exercised before operational reliance. No live database migration, real customer enrollment or production deployment was performed during implementation.

References: https://sourceafis.machinezoo.com/java and https://hidglobal.github.io/digitalpersona-devices/how-to.html

## Local check results (29 October 2026)

- Java/Maven package build: passed; four engine unit tests passed.
- Real SourceAFIS process: same-finger enrollment and verification, different-finger rejection and duplicate-scan rejection all passed with public upstream fixtures.
- Dedicated backend fingerprint tests: 14 passed. Existing assisted-registration tests: 29 passed.
- Full web suite: 122 tests passed across 13 files. Production Vite build passed; existing large-chunk warnings remain.
- Full backend run: 540 of 542 passed. The two failures were outside this change: the mobile language-layout subprocess exceeded its existing 30-second timeout, and the currency test expects an old literal source expression although the current registration screen still renders `₦` through its translated expression. The language timeout repeated on isolated rerun. These failures were not suppressed or fixed as part of fingerprint integration.
- No signed Android/iOS release was built. Mobile changes are limited to replacing the obsolete paid-engine notice with office-website instructions.
