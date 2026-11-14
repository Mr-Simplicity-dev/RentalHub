# Production release — 14 November 2026

The owner authorised deployment, Git reconciliation and publication of the APK in this chat. The earlier deployment hold was lifted.

## Published release

- Android: **1.0.66, build 77**, package `com.rentalhubng`.
- Download: https://rentalhub.com.ng/api/downloads/app?v=1.0.66
- Bytes: **109249379**.
- SHA-256: `da7c03c0aab9b5f3454e6930580c9894c01261cbde26d17239173d3c768943e1`.
- A complete download through the public HTTPS address returned HTTP 200 and matched both the size and SHA-256 above.
- Download filename: `Amana RentalHub NG-1.0.66.apk`. Response disables browser and CDN caching.
- Android build 77 returns `update_available: false`; previous build 76 returns `true`.
- iOS source is committed and pushed. No new signed IPA was produced. The published iOS track remains 1.0.3/build 13 and does not receive a false Android update prompt.

## Git and server reconciliation

Both repositories were pushed to their GitHub `master` branches. The website repository points to mobile commit `f5e8a5322bced7b143dfe8c81f1de6ec2cecbd26`.

The server's genuine edits were first preserved in commit `cce8b40467322e0cbc183f933bf5259132a65f36` on `codex/server-reconciliation-20261114`, then merged into the release. The flyer wording change was retained. Reviewed dependency metadata, the WhatsApp public configuration example, and privacy/audio exclusions were restored. Another 599 files differed only in line endings; their previous bytes and full patch were backed up before restoring the equivalent Git content.

Old installation folders, generated face-engine vendor files, private environment backups, release folders, Python caches, uploads and audio remain outside Git. A final server check found no tracked modifications or untracked files outside the ignore rules. No force push or hard reset was used.

The server pulled the merged release. Dependencies, tests and the web build ran in a separate worktree before promotion. The dependency folders and web build were exchanged atomically; old web assets were retained for already-open browser sessions. Only the two `rentalhub` PM2 workers were reloaded. The unrelated TagTheMall services were left running.

## Database and rollback copies

Private backup folder: `/var/backups/rentalhub/deploy-1.0.66-20261114T073330Z` (root-only).

It contains the database dump (15,959,404 bytes), old environment settings, published APK/version file, changed server files, source patch and original Nginx configurations. Old dependency/build folders remain in the ignored `.release66-stage` worktree for rollback. Do not run the promotion script again: its folder exchanges are not a second deployment action.

Migration `2050_seo_intelligence.sql` was the only pending migration. It was applied with the existing advisory-lock key, a transaction and the standard tracking table. Its canonical SHA-256 is `1865a7680293cc4621b07809f284df298ce3d03a07b74ef33b3ef3a4c6f5154c`. The deployment check rejected any different pending set. All 11 SEO tables were verified; 198 migrations are now recorded.

**Existing history issue remains:** a strict migration dry run found 23 historical checksum mismatches. The old two-file reconciliation helper also rejected its obsolete reviewed hash for migration 062. Neither old migration contents nor stored hashes were rewritten, and the failed check was not reported as successful. Only the explicitly reviewed new migration was applied. Details are saved privately in `migration-integrity-audit.json`. The previous global hash-skip environment setting was not changed. Before relying on the general migration runner for a later release, recover and review those historical versions and update the allowlisted reconciliation with schema/data evidence. Do not blindly replace the old hashes.

## Nginx and live checks

Three old backup virtual-host files were moved outside `sites-enabled`, after backup. The active file is now a symlink to the reviewed configuration. Final `nginx -t` passed without duplicate-host warnings, followed by a successful reload.

The configuration preserves the 50 MB upload limit, public APK aliases, private-upload block, source-map block, voice and socket routes, and Certbot TLS settings. Private SPA routes retain `noindex, nofollow` and `no-store` through their fallback; public SPA responses retain security headers. Malformed area and sitemap-part URLs return 404. Sitemap requests reach the backend XML generator.

Verified:

- Public `/api/health`: HTTP 200, `status: OK`.
- Both RentalHub PM2 workers online.
- Nginx configuration test successful.
- Published version API reports Android 1.0.66/build 77 and APK available.
- Anonymous SEO administration request returns HTTP 401.
- Login/admin pages: HTTP 200 with `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` and CSP.
- Private upload probe: HTTP 403; source-map probe: HTTP 404.
- Sitemap: HTTP 200 XML.
- Direct-origin Nigeria JSON and crawler HTML: HTTP 200 with correct response types and canonical URL. Automated requests through Cloudflare without an accepted user agent can be blocked; this was distinguished from origin failures.
- One fresh database job leader; all four SEO schedules registered. Search worker safely skipped because no import was queued. Future schedules were not claimed as already executed.

## Test and build evidence

Fresh Linux server checks, isolated from the production database:

- Backend: **267 passed, 0 failed**, across all 36 test files. The first shell-glob run selected only 248 tests; a full recursive run verified all 267.
- Web: **41 test files, 218 tests passed** in the ordinary Vitest run (209.92 seconds).
- Web production build: **passed**, 5.25 seconds.
- Existing React test warnings and large-bundle build warnings remain visible; they were not suppressed.
- The APK was already release-built and signature/version checked locally, then its complete public download was verified again after deployment.

Evidence logs in the private backup folder: `stage-checks.log`, `backend-recursive.log`, `web-tests.log`, `migration-integrity-audit.json`.

## Configuration still required

A dedicated SEO token encryption key was generated privately on the server. Its value was not printed or committed.

Google Search Console OAuth client ID/secret/callback configuration, account-owner consent and Google Ads developer access are still missing. The deployed module reports these as unavailable and does not invent data. This is separate from the existing customer Google sign-in client. No paid provider checks, registration payments, identity checks or customer messages were sent during deployment.

Nine previously reported moderate dependency advisories remain for separately planned maintenance. No new signed iOS IPA is available from this Windows build environment.
