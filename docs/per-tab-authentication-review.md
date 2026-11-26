# Per-tab authentication: local implementation review

Status: implementation in progress. Do not deploy, commit, push, run production migrations or restart production.

Baseline: master at 3ed64bffdd0c92e56c92bb32337526ebf095c041, clean main tree and clean mobile source at f556b9b9ec23dc9c21486a38fceafaa6eb3c00f4. The parent reports the mobile submodule as uninitialised, although the mobile working repository is present; do not initialise or checkout it as part of this task. Initial evidence is in RentalHubMobile/.codex-tmp/tab-auth-initial-state.json.

## Architecture

- Only a random 256-bit public session identifier is stored in sessionStorage for web auth. It has no authentication value without the corresponding HttpOnly credential and a live server row.
- A browser-generated Navigation API history-entry key is kept as non-secret metadata in history.state, preserving Router state. It distinguishes normal reloads from copied storage. Ownership uses a lifetime Web Lock whose name is a one-way SHA-256 hash, never the raw session identifier. No credentials are copied through BroadcastChannel or shared localStorage.
- Only a matching history marker, a reload/history restoration and an available ownership lock may resume a stored identifier. Unknown/unsupported/ambiguous contexts start with a fresh identifier and remain signed out. New full-document navigations may therefore require sign-in; same-origin post-login transitions must use the existing SPA router. This is an explicit fail-closed tradeoff, not a claim of universal Chrome Duplicate detection.
- On authentication the server rotates the public identifier, generates a random HttpOnly refresh credential and stores its hash. Cookie names are derived strictly from the validated identifier. Cookies are host-only, production-Secure, SameSite=Lax and scoped to /api/auth.
- Access JWTs are memory-only, short-lived and carry the internal session id. Each API/socket validation checks the server row, identifier binding, account status, token version, idle expiry and absolute expiry.
- CSRF values are derived with the existing server signing secret, bound to the internal session and public-id hash, held in JS memory and stored hashed in the session row. No refresh-cookie value is returned to JavaScript. Web refresh/logout are not CSRF exemptions.
- Refresh locks the row. Exactly one use of the current credential rotates it. Reusing a previous credential revokes only that session. Frontend single-flight refresh prevents normal duplicate requests. Concurrent duplicate refresh is intentionally fail-closed and requires that tab to sign in again.
- A tab logout revokes that row only. Existing global account security changes continue to increment token_version and a database trigger revokes web sessions and notifies socket workers. No uncontrolled cleanup job is introduced; bounded manual cleanup will be documented.
- Native authentication remains Bearer + secure device session token in the body, without tab identifiers or browser-cookie selection. Old native Socket.IO handshakes remain supported.
- Staff impersonation requires a parked original server session and a linked short-lived child session; returning to the original account must use the server rather than a sessionStorage copy of the original access token.
- Existing registration completion bearer proofs must be removed from browser storage. Outbound checkout reloads must use the existing phone-verification fallback if no in-memory proof remains. Do not change gateway/payment business rules or put a credential in a URL to compensate.

## Browser evidence so far

An isolated local Chrome profile tested against localhost only confirms: reload preserves the Navigation API key and sessionStorage; window.open copies sessionStorage but has a different navigation key and navigation type navigate; a separate tab starts with empty sessionStorage; copied storage in another tab fails the history-key comparison. No live account or external provider was used. Evidence: RentalHubMobile/.codex-tmp/tab-browser-probe-results.json.

The actual Chrome tab-menu Duplicate action has NOT yet been tested. A manual procedure and any remaining browser limitations must be reported. Browser-level and real PostgreSQL race verification remain acceptance gates; mocked tests alone are insufficient for production readiness.

## Database

New local migration: 2060_web_auth_sessions.sql. It has not been applied. Rollback SQL is in docs/sql/2060_web_auth_sessions_rollback.sql. Sessions have independent hashes, family metadata, expiry/revocation indexes and optional impersonation-parent linkage. Google web challenges gain a tab binding; mobile challenges remain unchanged.
