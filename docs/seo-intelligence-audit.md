# SEO audit and staged implementation

Status: local review branch only. Production and the published APK must remain unchanged until the owner reviews the report and artifacts.

## Existing architecture

- Express/CommonJS backend and PostgreSQL for core records; existing MongoDB Blog and Ranking collections.
- Existing /api/admin/seo router, web SeoDashboard and two shared native SEO entry screens. Preserve routes; consolidate mobile views rather than create another dashboard.
- Location page service and crawler HTML renderer, React metadata, dynamic sitemap, SerpAPI adapter, and Google Indexing helper already exist.
- Existing backgroundJobRuntime owns scheduled jobs using a PostgreSQL leader lock. Extend this scheduler.
- AES-256-GCM is already used for sensitive fields. OAuth credentials require a dedicated server-side encryption key, with no plaintext fallback.
- The Google APIs SDK is installed. Local Search Console/Ads OAuth and encryption configuration are absent. A SerpAPI key is present; no provider credits will be consumed during unapproved testing.

## Confirmed defects

1. /regenerate-sitemap counts URLs without regenerating XML. Generated lastmod is the current time, not a content update.
2. /ping-google submits the homepage to Google's restricted Indexing API. Property creation and bulk blog scripts do the same for ineligible content.
3. Location sitemap includes every dataset state/LGA even without inventory. The dashboard labels these indexable.
4. LGA statistics come from the entire state. SQL slug handling differs from the JavaScript slug utility, and expired inventory is not excluded from SEO.
5. Generated location copy contains “Surveyin”, unsupported local claims, keyword-stuffing and internal SEO instructions shown to customers.
6. Crawler renderer is passed a nested seo object but expects top-level title/description. Some property location text and JSON-LD are not safely escaped.
7. Location React error/loading states can retain stale metadata or stale data after route changes; no explicit noindex for empty pages.
8. New generated blogs are publicly readable with no draft/approval workflow.
9. Backend SEO uses broad admin access instead of Super Admin. Mobile has duplicate tools views and reports “Google notified” based on the outer HTTP success, even when the integration skipped the action.
10. SerpAPI tracking has an environment-only 10-keyword cap, no durable keyword settings, incomplete error handling, no spend reservation and no daily scheduler.
11. No Search Console performance, OAuth, URL Inspection, Keyword Planner, opportunities, planner or technical-audit integration exists.
12. Nginx repository template contains placeholders, invalid proxy/header directives inside if blocks, and rate-zone declarations inside server. Actual production routing must be assessed read-only; no live edits are authorised.
13. Database demo fallback can return fabricated empty data. SEO integration services must refuse to present this as collected intelligence.

## Stages

1. Fix existing SEO correctness, eligibility, rendering, indexing-policy and authorisation defects. Add regression tests.
2. Add non-destructive migrations, encrypted Google OAuth, durable sync jobs, real-data reports and provider status. Keep Search Console, Keyword Planner and SerpAPI metrics separate.
3. Add keyword management, cost-controlled ranking, explainable opportunities, content drafts/explicit approval, technical audit and optional PageSpeed checks.
4. Extend the existing web dashboard and shared Android/iOS screens; test roles and missing-config states.
5. Run isolated migration/query checks and full tests. Build review artifacts without changing the published APK or live metadata. Document external tests that still require the owner's Google authorisation.

## Official references checked

- [Search Console query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query): returns available top rows; query-level data is not a complete traffic total.
- [Sitemap submission](https://developers.google.com/webmaster-tools/v1/sitemaps/submit): optional extra webmasters scope; an accepted submission does not prove indexing.
- [URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect): reports Google's stored view rather than a live crawl.
- [Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/using-api): restricted to eligible job and livestream pages.
- [Keyword ideas](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas): estimated demand, requiring Ads API access.
- [Trends API](https://developers.google.com/search/apis/trends): limited alpha access. Use a labelled external research workflow until access exists.
- [OAuth web flow](https://developers.google.com/identity/protocols/oauth2/web-server): backend exchange, offline access, state and incremental permissions.

No live API integration has been proven merely by reading these documents. OAuth connection and provider acceptance require valid configuration and owner authorisation.

## Read-only production routing check — 14 November 2026

The VPS includes `/etc/nginx/sites-enabled/*`. Alongside the intended `rentalhub` file, that directory contains three RentalHub backup files: `rentalhub.bak.1790188549`, `rentalhub.bak.1790862996` and `rentalhub.bak.1790862807`. The current configuration test succeeds but reports duplicate RentalHub and www host rules on ports 80 and 443. Review and move those backups outside the included directory before an approved deployment; do not treat a duplicate-rule warning as a clean check.

The proposed repository template was checked with the server's installed nginx using an anonymous memory file. Its final check passed without those warnings. This did not write a server configuration file, reload nginx, restart PM2, apply a database migration or change the public APK. The candidate keeps the existing frame protection on HTML pages and the voice/private-upload proxy rules.
