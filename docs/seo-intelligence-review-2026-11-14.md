# Amana RentalHub NG — SEO implementation and review report

Date: 14 November 2026. Status: **local review release; not deployed or published**.

## 1. What is ready, in simple words

The existing SEO tools have been extended. There is one web SEO dashboard and one shared mobile SEO screen, with the old mobile links kept working.

1. Search Console can supply the searches that really brought people to RentalHub.
2. Keyword Planner can supply estimated search demand. Those estimates are kept separate from real traffic.
3. SerpAPI can record real search-result snapshots. Missing positions are not invented.
4. Super Admin can review reports, saved keywords, opportunities, drafts, indexing and page checks.
5. A signed Android review APK is available. The iOS source and JavaScript bundle are ready for a Mac signing build.

**Your Google account has not been connected.** The connection code and provider-contract tests are ready, but real Google access still needs your permission and the private server settings below. No live provider integration is described here as proven before that test.

## 2. What about the earlier bugs?

The earlier fixes are retained in the source used for this release. The previous detailed record is [the UI and registration report](<D:/New folder/tenant site/docs/ui-and-registration-review-2026-11-13.md>).

| Earlier problem | What was checked in this review |
|---|---|
| Landlords missing from the verification queue | Existing queue tests passed, including incomplete landlords and the missing face-photo message. |
| Approval note required but no place to enter it | Existing approval-dialog tests passed. A failed save keeps the note and dialog open. |
| Landlord survey question 13 would not save | Backend survey/sanitizer tests and all four native survey tests passed. The existing serialized-save fix is retained. |
| Add Property hidden inside More | The existing main landlord dashboard card and route remain in the build. Tour/navigation checks passed. |
| Registration email not announced | Four native email-notice tests passed. Confirmed delivery is announced once; a failed send is not called successful. |
| Proceed to Payment and retry problems | Existing registration checks passed for consent, passwords, tenant/landlord payment selection, retry and server restrictions. No real payment was made. |
| Update notification repeats or uses stale app information | Existing native-version, resume, retry and duplicate-notification checks passed. Android reports its installed native build. |
| Notification counts and account switching | Existing badge tests passed for counts, permissions, preference, account switching, offline state and iOS count handling. The final SEO screen also retains its notification bell. |
| Language changes and tours | Eight-locale direction/round-trip checks and the tour checks passed. No customer welcome-page redesign was made here. |

These results cover the named problems and the tests listed below. They are **not** a claim that every screen has been tested on every physical phone. No real customer account, payment, NIN/passport check, email, WhatsApp message or staff signature was submitted during this QA.

## 3. Existing architecture and how it was extended

The backend uses Express/CommonJS and PostgreSQL. Existing MongoDB models hold ranking history and blog articles. The web client uses React/Vite. Android and iOS share the React Native screens, API client, authentication and navigation.

The existing web route and `SeoDashboard.jsx` remain. The new panel is a component inside that dashboard. Existing mobile SEO route aliases now use the same shared screen. Existing `Ranking` and `Blog` models were extended; a second ranking store, public blog system or authentication system was not created.

SEO API requests use the existing authentication, Super Admin permission check and administrator MFA. Existing SEO endpoints were tightened to Super Admin. The Google callback uses a separate, short-lived, one-use state created by an authenticated Super Admin; it does not create a RentalHub account or sign someone into the dashboard.

Local runtime commits:

- Web/server: `6b2c4f812d7e4b9fddc015256959d0036a075da9`.
- Mobile: `f5e8a5322bced7b143dfe8c81f1de6ec2cecbd26`.
- Branch in both repositories: `codex/seo-intelligence-review`.
- These commits were saved locally. They were **not pushed**.

## 4. Google and research status

| Source | Implemented | Real-account qualification |
|---|---|---|
| Search Console | Encrypted OAuth, verified RentalHub property selection, daily import, history, filters, comparisons, URL Inspection and optional sitemap submission | Waiting for owner configuration, consent and real-property tests |
| Keyword Planner | Official Ads request flow, seed/URL research, Nigeria targeting, dated cache, real estimates, save/group/target/track/export | Waiting for approved Ads API access, customer configuration and consent |
| Google Trends | Clearly labelled external/manual comparison link | No claim of an available unrestricted API or collected Trends numbers |
| SerpAPI | Existing real provider retained; saved keywords, locations, competitors, history, budgets and scheduled checks added | No paid search request was made during this review; validate the configured account after approval |
| PageSpeed | Official optional request, cache/history, separate lab and field results | Waiting for an API key and a real report check |

Search Console totals are stored separately from query rows. Query privacy and top-row limits are explained. CTR uses clicks divided by impressions; position is impression-weighted. Imported-day coverage is recorded from durable sync checkpoints. Incomplete periods are labelled. Rise/fall recommendations wait for complete imports on both comparison periods. An empty Google response remains unavailable; it is not turned into invented zero traffic.

The default daily import checks recent dates again so Google revisions can be picked up. The first default window is 28 days, ending three days behind the current date. For an immediate 28-day comparison after connecting, request a 56-day backfill, then view the latest 28 days. Manual imports accept at most 90 days per request within the supported retention window.

## 5. Keywords, recommendations and content

Saved keywords support groups, target pages, location, tracking and frequency. Existing configured keywords can be imported without enabling paid tracking automatically. A location edit updates the same saved record rather than making a second tracking job. The default SerpAPI budget is ten requests per day; zero stops requests. Batch and tracking limits are enforced on the server.

Recommendations state their rule, evidence, source, period and next action. They can flag low CTR, positions near the top results, visibility changes, visible pages with few clicks, unassigned saved keywords, overlapping search intent and recorded technical issues. Advertising competition is not called organic SEO difficulty. No conversion rate is invented.

Content plans reuse the existing article model. Saved keyword groups can supply planning outlines. Existing private article drafts can be brought into the same review flow. These outlines are templates, not falsely labelled AI writing. An appropriate long-form AI provider was not introduced or charged.

Publication requires Super Admin, MFA, explicit confirmation, fact/originality confirmation, an approval note and the exact reviewed saved-draft revision. Automatic template generation produces private drafts, not public posts. Existing articles with no status field keep their previous public treatment. Public article HTML is sanitized while useful formatting is preserved. Cross-database publication is idempotent by content-plan identifier; an unconfirmed publication may need a retry of that same plan.

## 6. Public SEO corrections

- Location figures use the selected location rather than the whole state by mistake.
- Rent statistics use positive yearly asking rents only and disclose sample size and method. They do not claim agreed market rents.
- Empty locations are noindex and excluded from the sitemap.
- Only available, verified, unexpired properties that pass the existing ownership gate are included.
- Blank city fields, slug normalization and underscore area names were reconciled across page queries and sitemap links.
- Crawler HTML gets the real page title and description. Explicit API JSON requests stay JSON even for a crawler user agent.
- Structured JSON and XML are escaped safely. Property/area titles and city text are escaped in crawler HTML.
- Property crawler metadata contains public listing facts, not owners' phone numbers or email addresses.
- Published article metadata, public HTML and real update times are included where the existing Mongo store is available.
- Sitemaps use real modification times, remove duplicates and split automatically into 45,000-URL / 45-MiB parts before Google limits are reached.
- `/sitemap.xml` remains canonical; `/sitemap-1.xml` and following parts are supported when needed.
- Ordinary home/property/blog URLs no longer invoke Google's restricted Indexing API. The old ping endpoint returns an explanation and HTTP 410.
- Search Console sitemap acceptance is not described as proof that Google indexed a page.
- Private routes have noindex headers where served by the backend; robots restrictions are an additional crawl instruction, not access security. Existing authentication still protects private data.

Technical audits check returned HTML, metadata, headings, language declarations, structured-data presence/JSON syntax, sitemap/noindex conflicts and up to five public internal links. A batch may contain ten allowed public URLs. External/private links, full JavaScript rendering, complete schema eligibility and unmeasured performance are not silently marked as passing. PageSpeed is a separate optional official check.

## 7. Database migration and schema

New migration: **`2050_seo_intelligence.sql`**. The numeric prefix was checked for uniqueness. It has not been applied to production.

It adds these eleven PostgreSQL tables:

`seo_settings`, `seo_integrations`, `seo_oauth_states`, `seo_sync_runs`, `seo_search_metrics`, `seo_keywords`, `seo_competitors`, `seo_observations`, `seo_opportunities`, `seo_content_plans`, `seo_provider_usage`.

The tables hold settings, encrypted connections, one-use authorization state, recoverable imports, measured rows, keyword management, observations, recommendations, drafts and request budgets. They start with disconnected providers and no invented metrics. Existing users, roles, recruitment, payments, disputes, property records and documents are not deleted or reclassified.

Isolated PostgreSQL-compatible PGlite tests executed the migration and real queries. They checked preserved users, constraints, budgets, real location queries, repeated imports and safe keyword updates. This is not described as a production migration run.

The existing Mongo schemas gain blog status/approval/content-plan fields and ranking location/keyword/competitor/coverage fields. No replacement Mongo collection is introduced. Mongo availability is required for ranking history and article publication; absence produces an unavailable result rather than fake success.

## 8. API changes

All paths below are under `/api/admin/seo` unless stated otherwise. New administration actions require the existing Super Admin/MFA chain. Mutation and callback limits are enforced.

| Area | Methods and paths |
|---|---|
| Existing inventory/history | `GET /`, `GET /rankings` |
| Existing safe actions | `POST /rankings/check` queues managed work; `POST /regenerate-sitemap`; `GET /sitemap-xml`; `POST /ping-google` returns 410 |
| Connections | `GET /integrations`; `POST /google/:provider/connect`; `POST /google/:provider/disconnect`; one-use `GET /google/callback` |
| Search Console | `GET /search-console/sites`; `POST /search-console/property`; `GET /search-console/performance`; `GET /search-console/syncs`; `POST /search-console/sync`; `POST /search-console/inspect`; `POST /search-console/submit-sitemap` |
| Keywords | `GET /keywords`; `POST /keywords`; `DELETE /keywords/:id`; `POST /keywords/research`; `POST /keywords/import-configured`; `POST /rankings/queue` |
| Competitors/Trends | `GET/POST /competitors`; `DELETE /competitors/:domain`; `POST /trends` returns the labelled manual workflow |
| Opportunities | `GET /opportunities`; `POST /opportunities/generate`; `PATCH /opportunities/:id` |
| Content | `GET/POST /content-plans`; `GET /content-plans/suggestions`; `GET /content-plans/legacy-drafts`; `POST /content-plans/import`; `POST /content-plans/:id/publish` |
| Checks/settings/export | `POST /technical-audit`; `POST /pagespeed`; `GET /observations`; `GET/PUT /settings`; `GET /export` |

Public route work preserves `/nigeria`, location/area URLs, `/properties/:id`, `/blog/:slug` and `/sitemap.xml`, and adds sitemap-part delivery. The public Career URL and existing dispute conversation are unchanged.

CSV exports escape spreadsheet formula prefixes. Query exports cover the visible top 100 rows; saved-keyword exports are capped at 10,000 and identify truncation in response headers. Keyword listing is paged.

## 9. Background jobs

All new jobs use the existing PostgreSQL leader-election runtime. They do not depend on a PM2 process number.

| Job | Schedule | Purpose |
|---|---|---|
| `seo-search-console-daily` | 04:15 daily, existing Lagos timezone convention | Queue initial/recent-date imports |
| `seo-search-console-worker` | Every two minutes | Process bounded chunks, checkpoint and recover stale leases |
| `seo-managed-ranking-checks` | Every ten minutes | Process due keywords inside stored request limits |
| `seo-sitemap-weekly-validation` | Monday 05:30 | Validate generated XML locally; does not claim Google submission |

The existing daily HTTP sitemap availability check is retained. It checks delivery; the new weekly job checks generated XML. No new paid job was started on the live server during implementation.

## 10. Security and configuration

Google refresh tokens and PKCE state verifiers use authenticated AES-256-GCM encryption with a dedicated backend key and provider-specific purpose binding. OAuth state is hashed, short-lived and consumed once. Current user status, role and session version are checked on callback. Disconnect clears local credentials, cancels queued work and attempts Google revocation. Remote revocation uncertainty is reported.

Provider tokens, client secrets and encryption keys are not returned to React or the app. Audit logging redacts authorization code, state and token fields. Public audit/inspection targets are restricted to allowed RentalHub URLs with bounded responses and redirects. Existing JWT duration, MFA, Cloudflare, payment rules, uploads and customer permissions were not weakened.

Configure privately on the backend only:

| Setting | Needed for |
|---|---|
| `SEO_TOKEN_ENCRYPTION_KEY` | Exactly 64 hexadecimal characters; keep and back it up privately |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Web application OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The matching private client secret |
| `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` | `https://rentalhub.com.ng/api/admin/seo/google/callback` |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Appropriate approved Ads API access |
| `GOOGLE_ADS_CUSTOMER_ID` | The Ads customer account |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional manager account |
| `GOOGLE_ADS_API_VERSION` | A currently supported `vN` version; not guessed in code |
| `PAGESPEED_API_KEY` | Optional PageSpeed check |

The existing `SERP_API_KEY` remains backend-only. No new private mobile or React key is required. `.env.example` contains names and blank values only. Do not paste secrets into this chat or commit `.env`.

Owner connection steps after the reviewed backend is available:

1. Enable the relevant Google APIs and use a Google account with the verified RentalHub Search Console property.
2. Add the exact callback URI above to the Web OAuth client. Configure the private settings on the backend.
3. Open Super Admin → SEO → Connections. Connect Search Console and select the verified property.
4. Use read-only permission for reporting. Grant the separate optional write permission only if you want the sitemap-submit action.
5. Connect Ads separately after the developer-token/customer access is ready.
6. Request an import and check History. Test inspection, a small keyword research request and the optional sitemap action deliberately.

Google testing-mode grants can expire or require further app verification. A saved connection is not a promise of permanent provider access. The app reports reconnect/setup needs rather than creating fake results.

## 11. Live routing finding — left untouched

The read-only VPS check found `include /etc/nginx/sites-enabled/*;` and three backup files alongside the intended RentalHub configuration:

- `/etc/nginx/sites-enabled/rentalhub.bak.1790188549`
- `/etc/nginx/sites-enabled/rentalhub.bak.1790862996`
- `/etc/nginx/sites-enabled/rentalhub.bak.1790862807`

The current `nginx -t` succeeds but warns that duplicate RentalHub and www rules on ports 80 and 443 are ignored. This should be cleaned up deliberately before a future reload. The check does not prove that every on-disk duplicate is part of the currently running master's older in-memory configuration.

The proposed repository template was tested using the VPS's nginx binary and an anonymous memory file. **Final result: syntax OK, test successful, no duplicate-host warnings.** No configuration file was written on the VPS, and nginx was not reloaded. The template preserves voice/private-upload routing and HTML frame protection, uses one canonical host, serves the SEO/sitemap routes correctly and keeps OAuth callback codes out of access logs.

## 12. Test and build evidence

| Check actually run | Result |
|---|---|
| Full backend `npm test` | **267 passed; 0 failed** |
| Existing web test files | **214 tests passed across 40 files** |
| New SEO screen tests | **4 passed**; 41 files / 218 web tests in total |
| Changed backend/test JS syntax | 34 files passed at inventory collection; later final source passed the full suite |
| Native registration checks | Passed |
| Native survey | 4 passed |
| Language/direction/layout contracts | Eight locales, both old native directions, seven screen sizes and two font scales passed |
| Tour/navigation contracts | 87 steps, 8 locales, 15 actionable routes; role/target checks passed |
| Native registration email notices | 4 passed |
| Update version/resume/retry checks | Passed |
| Notification/badge behaviour checks | Passed |
| Web production build | Passed; existing large-chunk/build-timing warnings remain |
| Final Android build | Passed; `BUILD SUCCESSFUL in 5m 21s`, after the initial complete isolated build |
| APK signature/package/version | Passed; same release certificate, `com.rentalhubng`, version 1.0.66, code 77 |
| Final iOS JavaScript bundle | Passed; 8,029,552 bytes; 10 asset files copied |
| Proposed nginx syntax on the installed server engine | Passed in memory only; not activated |
| Real Google/Ads/PageSpeed accounts | Not tested; owner setup/permission is still required |
| Physical Android/iPhone and actual browser visual review | Not completed; the local browser webview could not attach |

The normal all-at-once web test runner stalled in this environment. No tests were removed or weakened. Every existing file was run separately; a timed-out verification file passed on retry. A new test's overly strict optional-request-argument assertion was corrected, and all four SEO tests passed afterward. This report does **not** claim that the stalled bulk command completed.

Important regression tests cover migration data preservation, real LGA/area queries, noindex/sitemap eligibility, escaping, OAuth encryption/replay/session checks, authorization/MFA, zero budgets, provider-data handling, safe URLs, repeated imports, safe keyword edits, approved publication, exact draft revisions, private noindex rules, empty Google data and suppression of incomplete-period comparisons.

Security package review: compatible updates brought Mongoose to 8.24.9 and follow-redirects to 1.16.3, removing the two high-severity findings seen in this review. Nine moderate dependency advisories remain. A forced breaking downgrade or override was not applied to unrelated features. Review those separately before wider production hardening.

Evidence logs are kept locally under `RentalHubMobile/.codex-tmp/seo/`. Useful files include `backend-tests-final-verified.log`, `web-file-tests-final.log`, `web-tests-final-verified.log`, `web-build-final-verified.log`, `android-build-verified.log`, `apk-signature-final.log`, `ios-bundle-final.log`, `nginx-candidate-final.log` and the mobile check logs. The earlier web-file summary includes the corrected test failure; the later four-test log supplies the final result.

## 13. Review artifacts

Final APK:

[RentalHub v1.0.66, build 77 — review only](<D:/New folder/tenant site/RentalHubMobile/.release-seo-review/RentalHub-v1.0.66-build77-seo-review-final.apk>)

- Bytes: **109,249,379**.
- SHA-256: `da7c03c0aab9b5f3454e6930580c9894c01261cbde26d17239173d3c768943e1`.
- Release certificate SHA-256: `be593ddf8cc4bc731d682390be4d92b9e763441725da368c37c0ca6443a6dd9d`.
- Android version/code: **1.0.66 / 77**.
- iOS source version/build: **1.0.66 / 71**.
- The old local v1.0.65 APK is unchanged: SHA-256 `61aa4b2a331001c41664eada99a7f4ed9014d67a8494cd7e6af33711f05427e4`.

[iOS JavaScript bundle and assets](<D:/New folder/tenant site/RentalHubMobile/.release-seo-review/ios-js>) are a review artifact, **not an installable IPA**. A Mac/Xcode signing build is still needed.

[Changed-source review archive](<D:/New folder/tenant site/RentalHubMobile/.release-seo-review/RentalHub-v1.0.66-build77-source-changes-review.zip>) contains the changed code and report, not a full clone or installed dependencies. It excludes `.env`, private keys, signing files, private uploads and audio. Use it with the existing repositories. [The manifest](<D:/New folder/tenant site/RentalHubMobile/.release-seo-review/manifest.json>) records the artifact details.

A preliminary review APK was retained for safety. Use only the file whose name ends in **`seo-review-final.apk`**.

## 14. Commands for a later approved deployment — NOT RUN

First review this report, source changes and artifacts. Complete the Google setup privately. Publish the reviewed local commits only after approval. The VPS cannot fetch these new commits until that separate source-publishing step happens.

Use a staging/test environment for tests. Do not point the test suite at real customer data. Keep your usual database and current APK backups before the approved migration/release.

### Server code, migration and frontend

After the reviewed commits are available remotely and the production checkout is confirmed clean:

```bash
cd /var/www/rentalhub
git status --short
git fetch origin
git checkout --detach 6b2c4f812d7e4b9fddc015256959d0036a075da9
git submodule update --init --recursive
npm ci
npm ci --prefix client
npm run migrate:dry-run
# Review every pending migration. Do not force past a hash error.
npm run migrate
npm run build --prefix client
```

The new migration is additive. Do not drop the new tables to roll back application code. Keep the encryption key if saved connections are retained.

### Routing cleanup and candidate installation

These are future approved actions, not actions performed in this implementation. Do not keep backup configs inside `sites-enabled`.

```bash
sudo mkdir -p /etc/nginx/rentalhub-review-backups
sudo cp -Lpn /etc/nginx/sites-enabled/rentalhub /etc/nginx/rentalhub-review-backups/rentalhub.before-seo.conf
sudo mv -n -- /etc/nginx/sites-enabled/rentalhub.bak.1790188549 /etc/nginx/rentalhub-review-backups/
sudo mv -n -- /etc/nginx/sites-enabled/rentalhub.bak.1790862996 /etc/nginx/rentalhub-review-backups/
sudo mv -n -- /etc/nginx/sites-enabled/rentalhub.bak.1790862807 /etc/nginx/rentalhub-review-backups/
# Check the main config, certificate paths, existing upload limits and other included rules first.
sudo cp deploy/nginx.conf /etc/nginx/sites-available/rentalhub
if [ -L /etc/nginx/sites-enabled/rentalhub ]; then
  test "$(readlink -f /etc/nginx/sites-enabled/rentalhub)" = /etc/nginx/sites-available/rentalhub || { echo 'Review the existing symlink target first'; exit 1; }
else
  sudo mv -n -- /etc/nginx/sites-enabled/rentalhub /etc/nginx/rentalhub-review-backups/rentalhub.enabled.previous
  test ! -e /etc/nginx/sites-enabled/rentalhub || { echo 'The old enabled file was not moved safely'; exit 1; }
  sudo ln -s /etc/nginx/sites-available/rentalhub /etc/nginx/sites-enabled/rentalhub
fi
sudo nginx -t
# Continue only with a clean test and the intended single enabled RentalHub link/file.
pm2 reload rentalhub --update-env
sudo systemctl reload nginx
```

If the enabled `rentalhub` path is a regular file instead of a symlink to `sites-available/rentalhub`, do not leave two copies active. Deliberately replace/link that single intended path as part of the reviewed server change. Do not restart unrelated hosted applications with `pm2 restart all`.

### Publish the Android artifact after approval

Copy the final reviewed APK to a new incoming name first. Check its hash before replacing the approved download target. These are Linux commands on the VPS after that upload:

```bash
cd /var/www/rentalhub
sha256sum uploads/app-v1.0.66-build77.apk
# Must match da7c03c0aab9b5f3454e6930580c9894c01261cbde26d17239173d3c768943e1
mkdir -p /var/backups/rentalhub-seo-review
cp -n uploads/app.apk /var/backups/rentalhub-seo-review/app.before-seo.apk
cp uploads/app-v1.0.66-build77.apk uploads/.app.apk.next
mv uploads/.app.apk.next uploads/app.apk
node <<'NODE'
const fs = require('fs');
const previous = JSON.parse(fs.readFileSync('uploads/version.json', 'utf8'));
const next = {...previous, version: '1.0.66', buildNumber: '77',
  lastUpdated: new Date().toISOString(),
  sha256: 'da7c03c0aab9b5f3454e6930580c9894c01261cbde26d17239173d3c768943e1',
  bytes: 109249379};
fs.writeFileSync('uploads/version.json.next', JSON.stringify(next, null, 2) + '\n');
fs.renameSync('uploads/version.json.next', 'uploads/version.json');
NODE
curl -fsS https://rentalhub.com.ng/api/downloads/version.json
curl -fL 'https://rentalhub.com.ng/api/downloads/app?v=1.0.66' -o /tmp/rentalhub-v1.0.66-download-check.apk
sha256sum /tmp/rentalhub-v1.0.66-download-check.apk
```

Set the reviewed Android release message/latest-version environment values consistently if your deployment uses them. Do **not** announce iOS build 71 or change the independent iOS release track before a signed IPA is shipped. Check a device already on build 77: it must not be told to install build 77 again.

The local runtime `uploads/version.json` was deliberately left untouched. The download service uses the server's shipped artifact metadata, not a promise that new source has already been published.

### Rebuild Android locally

The installed Windows environment used Java 17 and the existing Android SDK/signing setup. The normal project command after approval is:

```powershell
cd 'D:\New folder\tenant site\RentalHubMobile'
$env:JAVA_HOME='C:\Java\jdk-17.0.20.1+1'
$env:ANDROID_HOME='C:\Android'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\android\gradlew.bat -p android :app:assembleRelease --console=plain --max-workers=1
```

The review builds used a separate app output directory through a local initialization script so the existing APK was not overwritten. The signed review file linked above has already been produced and verified; you do not need to rebuild just to read this report.

### Produce a signed iOS app on a Mac

Install the project's supported Node/Xcode/CocoaPods tools and use the Apple team/signing profiles for RentalHub. Then:

```bash
cd RentalHubMobile
npm ci
cd ios
pod install
xcodebuild -workspace RentalHubMobile.xcworkspace -scheme RentalHubMobile \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath ../.release-seo-review/RentalHub-v1.0.66.xcarchive archive
# Use the team's reviewed ExportOptions.plist with the correct distribution method/team.
xcodebuild -exportArchive \
  -archivePath ../.release-seo-review/RentalHub-v1.0.66.xcarchive \
  -exportPath ../.release-seo-review/ios-export \
  -exportOptionsPlist /path/to/your/approved/ExportOptions.plist
```

No IPA is claimed to exist in this Windows review environment.

## 15. Remaining review and release gates

1. Authorize and test the actual Google/Ads accounts and optional PageSpeed key. Contract tests alone are not real-account proof.
2. Review and clean the duplicate nginx backup rules before an approved reload. The new candidate is syntax-tested but not active.
3. Test the final APK on a physical Android device and the native iOS build on a Mac/iPhone. The attempted local browser visual review could not complete.
4. Review the nine remaining moderate dependency advisories and existing large frontend chunks separately.
5. For large datasets, respect the visible top-row, export and history limits. Recommendations are rules with evidence, not promises of rankings, traffic or revenue.

No live deployment, production migration, PM2/nginx reload, APK upload or public version-file update was performed. Local commits and review artifacts are ready for your decision.

## 16. Official references

- [Search Console performance query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Search Console sitemap submission](https://developers.google.com/webmaster-tools/v1/sitemaps/submit)
- [URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
- [Google Indexing API eligibility](https://developers.google.com/search/apis/indexing-api/v3/using-api)
- [Google Ads keyword ideas](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas)
- [Official Trends API availability](https://developers.google.com/search/apis/trends)
- [Google OAuth web flow](https://developers.google.com/identity/protocols/oauth2/web-server)

## 17. Exact changed files

### Web/server repository

- Modified: [.env.example](<D:/New folder/tenant site/.env.example>)
- New: [client/.codex-tmp/seo-preview/api.js](<D:/New folder/tenant site/client/.codex-tmp/seo-preview/api.js>)
- New: [client/.codex-tmp/seo-preview/index.html](<D:/New folder/tenant site/client/.codex-tmp/seo-preview/index.html>)
- New: [client/.codex-tmp/seo-preview/main.jsx](<D:/New folder/tenant site/client/.codex-tmp/seo-preview/main.jsx>)
- New: [client/.codex-tmp/seo-preview/vite.config.mjs](<D:/New folder/tenant site/client/.codex-tmp/seo-preview/vite.config.mjs>)
- Modified: [client/public/robots.txt](<D:/New folder/tenant site/client/public/robots.txt>)
- New: [client/src/components/admin/SeoIntelligencePanel.jsx](<D:/New folder/tenant site/client/src/components/admin/SeoIntelligencePanel.jsx>)
- New: [client/src/components/admin/SeoIntelligencePanel.test.jsx](<D:/New folder/tenant site/client/src/components/admin/SeoIntelligencePanel.test.jsx>)
- Modified: [client/src/i18n/ar.json](<D:/New folder/tenant site/client/src/i18n/ar.json>)
- Modified: [client/src/i18n/en.json](<D:/New folder/tenant site/client/src/i18n/en.json>)
- Modified: [client/src/i18n/fr.json](<D:/New folder/tenant site/client/src/i18n/fr.json>)
- Modified: [client/src/i18n/ha.json](<D:/New folder/tenant site/client/src/i18n/ha.json>)
- Modified: [client/src/i18n/ig.json](<D:/New folder/tenant site/client/src/i18n/ig.json>)
- Modified: [client/src/i18n/ru.json](<D:/New folder/tenant site/client/src/i18n/ru.json>)
- Modified: [client/src/i18n/yo.json](<D:/New folder/tenant site/client/src/i18n/yo.json>)
- Modified: [client/src/i18n/zh.json](<D:/New folder/tenant site/client/src/i18n/zh.json>)
- Modified: [client/src/pages/AreaPage.jsx](<D:/New folder/tenant site/client/src/pages/AreaPage.jsx>)
- Modified: [client/src/pages/LocationPage.jsx](<D:/New folder/tenant site/client/src/pages/LocationPage.jsx>)
- Modified: [client/src/pages/NigeriaPage.jsx](<D:/New folder/tenant site/client/src/pages/NigeriaPage.jsx>)
- Modified: [client/src/pages/PropertyDetail.jsx](<D:/New folder/tenant site/client/src/pages/PropertyDetail.jsx>)
- Modified: [client/src/pages/SeoDashboard.jsx](<D:/New folder/tenant site/client/src/pages/SeoDashboard.jsx>)
- New: [client/src/utils/seoJson.js](<D:/New folder/tenant site/client/src/utils/seoJson.js>)
- Modified: [config/middleware/auditMiddleware.js](<D:/New folder/tenant site/config/middleware/auditMiddleware.js>)
- Modified: [config/middleware/featureFlags.js](<D:/New folder/tenant site/config/middleware/featureFlags.js>)
- New: [config/middleware/seoRobots.js](<D:/New folder/tenant site/config/middleware/seoRobots.js>)
- New: [config/utils/blogHtml.js](<D:/New folder/tenant site/config/utils/blogHtml.js>)
- Modified: [config/utils/googleIndexing.js](<D:/New folder/tenant site/config/utils/googleIndexing.js>)
- Modified: [config/utils/rankChecker.js](<D:/New folder/tenant site/config/utils/rankChecker.js>)
- Modified: [config/utils/seoHtmlRenderer.js](<D:/New folder/tenant site/config/utils/seoHtmlRenderer.js>)
- Modified: [config/utils/seoPageService.js](<D:/New folder/tenant site/config/utils/seoPageService.js>)
- New: [config/utils/seoPolicy.js](<D:/New folder/tenant site/config/utils/seoPolicy.js>)
- Modified: [config/utils/serpTracker.js](<D:/New folder/tenant site/config/utils/serpTracker.js>)
- Modified: [config/utils/sitemapGenerator.js](<D:/New folder/tenant site/config/utils/sitemapGenerator.js>)
- Modified: [controllers/blogController.js](<D:/New folder/tenant site/controllers/blogController.js>)
- Modified: [deploy/nginx.conf](<D:/New folder/tenant site/deploy/nginx.conf>)
- New: [docs/seo-intelligence-audit.md](<D:/New folder/tenant site/docs/seo-intelligence-audit.md>)
- New: [docs/seo-intelligence-review-2026-11-14.md](<D:/New folder/tenant site/docs/seo-intelligence-review-2026-11-14.md>)
- New: [jobs/seoJobs.js](<D:/New folder/tenant site/jobs/seoJobs.js>)
- New: [migrations/2050_seo_intelligence.sql](<D:/New folder/tenant site/migrations/2050_seo_intelligence.sql>)
- Modified: [package-lock.json](<D:/New folder/tenant site/package-lock.json>)
- Modified: [package.json](<D:/New folder/tenant site/package.json>)
- Modified: [routes/adminSeoRoutes.js](<D:/New folder/tenant site/routes/adminSeoRoutes.js>)
- Modified: [routes/models/Blog.js](<D:/New folder/tenant site/routes/models/Blog.js>)
- Modified: [routes/models/Ranking.js](<D:/New folder/tenant site/routes/models/Ranking.js>)
- New: [routes/publicPropertySeoRoutes.js](<D:/New folder/tenant site/routes/publicPropertySeoRoutes.js>)
- New: [routes/seoIntelligenceRoutes.js](<D:/New folder/tenant site/routes/seoIntelligenceRoutes.js>)
- Modified: [scripts/generateBlogs.js](<D:/New folder/tenant site/scripts/generateBlogs.js>)
- Modified: [server.js](<D:/New folder/tenant site/server.js>)
- Modified: [services/locationService.js](<D:/New folder/tenant site/services/locationService.js>)
- Modified: [services/propertyService.js](<D:/New folder/tenant site/services/propertyService.js>)
- New: [services/seo/contentPlannerService.js](<D:/New folder/tenant site/services/seo/contentPlannerService.js>)
- New: [services/seo/core.js](<D:/New folder/tenant site/services/seo/core.js>)
- New: [services/seo/googleConnectionService.js](<D:/New folder/tenant site/services/seo/googleConnectionService.js>)
- New: [services/seo/index.js](<D:/New folder/tenant site/services/seo/index.js>)
- New: [services/seo/intelligenceService.js](<D:/New folder/tenant site/services/seo/intelligenceService.js>)
- New: [services/seo/keywordService.js](<D:/New folder/tenant site/services/seo/keywordService.js>)
- New: [services/seo/searchConsoleService.js](<D:/New folder/tenant site/services/seo/searchConsoleService.js>)
- New: [services/seo/technicalAuditService.js](<D:/New folder/tenant site/services/seo/technicalAuditService.js>)
- New: [tests/services/seoAuthorization.test.js](<D:/New folder/tenant site/tests/services/seoAuthorization.test.js>)
- New: [tests/services/seoCorrectness.test.js](<D:/New folder/tenant site/tests/services/seoCorrectness.test.js>)
- New: [tests/services/seoIntelligence.test.js](<D:/New folder/tenant site/tests/services/seoIntelligence.test.js>)
- New: [tests/services/seoSafety.test.js](<D:/New folder/tenant site/tests/services/seoSafety.test.js>)

### Mobile repository

- Modified: [android/app/build.gradle](<D:/New folder/tenant site/RentalHubMobile/android/app/build.gradle>)
- Modified: [app.json](<D:/New folder/tenant site/RentalHubMobile/app.json>)
- Modified: [ios/RentalHubMobile.xcodeproj/project.pbxproj](<D:/New folder/tenant site/RentalHubMobile/ios/RentalHubMobile.xcodeproj/project.pbxproj>)
- Modified: [metro.config.js](<D:/New folder/tenant site/RentalHubMobile/metro.config.js>)
- Modified: [package-lock.json](<D:/New folder/tenant site/RentalHubMobile/package-lock.json>)
- Modified: [package.json](<D:/New folder/tenant site/RentalHubMobile/package.json>)
- Modified: [react-native.config.js](<D:/New folder/tenant site/RentalHubMobile/react-native.config.js>)
- Modified: [src/screens/admin/SuperAdminSeoDashboardScreen.js](<D:/New folder/tenant site/RentalHubMobile/src/screens/admin/SuperAdminSeoDashboardScreen.js>)
- Modified: [src/screens/shared/SeoToolsScreen.js](<D:/New folder/tenant site/RentalHubMobile/src/screens/shared/SeoToolsScreen.js>)

