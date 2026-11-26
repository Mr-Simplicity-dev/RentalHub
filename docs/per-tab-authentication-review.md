# Independent browser-tab sign-in: implementation and verification report

Status: local implementation completed; final checks are recorded below. **Production deployment is not cleared.** Real PostgreSQL concurrency and Chrome's actual Duplicate menu remain unverified. No live migration, deployment, restart, provider call or APK build was performed.

## 1. What changed

Each web tab now has its own sign-in session. Signing in or signing out at one desk must not change the person using another desk.

The browser stores only a random, non-authenticating public identifier in sessionStorage. Access tokens, CSRF values and user state stay in memory. A corresponding HttpOnly cookie and a live database row are needed to restore authentication. The public identifier alone cannot sign in.

The existing Express, React, JWT, PostgreSQL and Socket.IO architecture is retained. Native Android/iOS authentication keeps its existing Bearer token, secure device storage, native header, body refresh token and Google one-time exchange. Mobile source and release versions were not changed.

## 2. Git preservation

- Initial branch: `master`.
- Initial HEAD: `3ed64bffdd0c92e56c92bb32337526ebf095c041`.
- Initial main working tree: clean, including staged and untracked files.
- Initial mobile HEAD: `f556b9b9ec23dc9c21486a38fceafaa6eb3c00f4`; mobile working tree clean.
- Initial parent submodule status: `-f556b9b9ec23dc9c21486a38fceafaa6eb3c00f4 RentalHubMobile`. The mobile repository is present, but the parent marks the submodule uninitialised. It was not initialised, checked out or switched.
- During testing, the user committed the first set of changes in VS Code as `e12460ba79154a5a48db5f6caf154e3d9849a1f8`, subject `make changes`. Editing paused until the user confirmed that commit and authorised continuing from it.
- The agent did not commit, stage, push, merge, stash, reset, restore, clean, rebase or switch branches. No pre-existing user changes were overwritten.
- Final status and the exact file inventory are appended at the end. New files are identified relative to the initial HEAD, including files already present in the user's commit.

## 3. Server sessions and migration

New migration: `migrations/2060_web_auth_sessions.sql`. Migration 2059 was the latest at the initial audit. No old migration was edited. Migration 2060 was applied only inside disposable in-memory PGlite tests, never to production.

`authentication_sessions` contains an internal UUID, a unique SHA-256 public-ID lookup hash, user foreign key, client type, token-version snapshot, hashed current/previous refresh credentials, hashed CSRF binding, session family, rotation counter, creation/use/expiry timestamps, revocation state, and optional impersonation parent/actor links.

Constraints cover valid client types, positive token versions, non-negative rotation counts and expiry ordering. Indexes cover active user sessions, absolute expiry, active idle expiry, revoked records and session families, plus primary/unique lookup indexes. `google_signin_requests.web_tab_hash` binds browser Google challenges to their initiating tab.

Database triggers notify socket workers when a session is revoked, parked or deleted. User security changes revoke that user's web sessions. Hard deletion also notifies the user room; session foreign keys cascade. Password changes/resets, suspension, deletion and role changes remain global security events.

Rollback SQL: `docs/sql/2060_web_auth_sessions_rollback.sql`. It removes only the new table, triggers/functions and Google binding column. It preserves users and native credentials. An isolated PGlite test executes the rollback and checks that users remain. Reverting code and requiring fresh web sign-in must precede any future operational rollback. Nothing was rolled back on a live database.

Cleanup: `node scripts/cleanupWebAuthSessions.js` is an explicit, bounded dry run by default. `--apply --limit=100` deletes at most the chosen batch of sessions expired/revoked over seven days ago. The maximum batch is 1,000. No scheduled job was added and the cleanup command was not run against an environment database.

## 4. Browser lifecycle and cookies

- The public identifier has 256 random bits and a strict 64-character lowercase hexadecimal format. It rotates on authentication.
- A browser Navigation API history-entry key, kept in `history.state`, distinguishes ordinary reloads from copied sessionStorage. Existing router state is preserved.
- A lifetime exclusive Web Lock proves current ownership. Its name contains a SHA-256 hash, not the public identifier. Concurrent initialisation is single-flight. Identifier replacement is queued and cancelled when the sign-in generation changes, so a late sign-in response cannot undo logout.
- Resume requires reload/history restoration, matching history metadata and an available ownership lock. New, copied, unsupported or ambiguous contexts start fresh and signed out. Missing storage is handled in memory without reusing stored credentials.
- Cookie names are `rh_refresh_<strictly-validated-public-id>`. Values are random refresh credentials. Cookies are HttpOnly, production-Secure, SameSite=Lax, host-only and scoped to `/api/auth`. Their values are never returned to JavaScript.
- The old shared `auth_token` cookie is no longer an identity selector or fallback. Existing web users must sign in again once after an eventual coordinated release. Old browser-stored tokens/users/impersonation copies/registration completion proofs are removed rather than trusted. Native clients retain their old protocol.
- A browser profile is bounded to 24 relevant refresh cookies to keep authentication headers bounded. Unused sessions should be signed out; cookies also expire at their absolute deadline. Closing a tab alone does not immediately remove an HttpOnly cookie.
- Unknown full-document navigations deliberately start signed out. Existing same-tab app routes use the SPA router. Outbound registration checkout may lose an in-memory completion proof and must use the existing phone-verification fallback; no bearer credential was put in a URL to avoid this.

## 5. Authentication flows and API changes

- Login, registration/payment completion, email verification, assisted phone verification, agent/lawyer invitation acceptance, Google customer sign-in and administrator impersonation use the shared session writer for web requests.
- `GET /api/auth/session` is new: a no-store bootstrap resolves only the header's matching cookie and live session, then supplies memory-only access/CSRF values.
- `GET /api/auth/me` uses the access token, tab header, live session and existing user/security checks. A stored user object is never proof of sign-in.
- `POST /api/auth/refresh-token` locks the row, checks its own cookie and CSRF binding, rotates the refresh hash, and returns a short-lived access token. Reuse revokes only that session. Native body refresh is retained.
- `POST /api/auth/logout` revokes/clears only the selected web session. It accepts the matching cookie and CSRF so an expired access JWT need not prevent logout. It does not increment global token_version. Native logout keeps the existing behaviour.
- `POST /api/auth/impersonation/return` is new. An original Super Admin session is parked server-side. A short-lived linked child session views the selected account. Returning requires the child and original HttpOnly proof, consumes that return once and stays within the original deadline. The browser no longer keeps an original admin bearer-token copy. The return button uses the current session's impersonation flag and survives a valid reload.
- Google web challenges store/check the initiating tab hash before creating a session. Mobile Google deep links/verifier/one-time-code exchange stay unchanged. Google identity, mailbox proof, role restrictions and MFA checks remain in place; no live Google authentication call was made.
- Maintenance, MFA, Turnstile, account lockout, abuse limits and existing role guards remain. Read-only bootstrap is excluded from the sensitive sign-in-attempt counter, like `/me`; creation and security mutations remain rate limited.
- Private evidence downloads, survey exports and case-verification requests now use the tab-aware API instead of direct protected links/shared-cookie Axios calls. Voice keeps its existing `/voice` paths with an empty API base override while reusing session headers, CSRF, refresh, MFA and stale-response checks.

## 6. Security review

Access JWTs last at most ten minutes and carry the internal session UUID and token version. Web sessions have a fixed 24-hour absolute deadline and a one-hour idle deadline, touched at most once per minute. Refresh cannot extend the absolute deadline. Queries check the row, public binding, ownership, account activity/deletion and version; JWT validity alone is insufficient.

Refresh uses a row-locking transaction. Two uses of one old credential must not both succeed. A reuse/mismatch revokes that session, not unrelated tabs. The browser uses one in-flight refresh for waiting API calls. A reused/racing credential can require that tab to sign in again; it is not silently accepted.

CSRF values are derived with the existing signing secret and session-specific identifiers, held in memory and stored hashed. Mutating web requests require the correct session binding and an allowed Origin/Referer. Web refresh/logout are not CSRF exemptions. Combining A's identifier with B's cookie/CSRF fails. Native requests retain their explicit non-ambient credential handling.

Session fixation is prevented by rotating the public identifier and refresh credential at authentication. SQL is parameterised. Missing/malformed/unknown IDs fail closed. Database errors are generic and no session/cookie/token/CSRF values are printed by the new code or tests. Downloads create credential-free blob links and reject cross-origin path tricks.

Account changes clear tab-local query state. Request generations reject old responses and retries. Token adoption checks the generation both around asynchronous ownership changes and before publishing credentials; page callbacks cannot restore a cleared session.

Web Socket.IO handshakes send access JWT plus tab identifier and validate the live session. Packets are rechecked, sockets expire with the token/session deadline, and database revocation notices disconnect the relevant session/user rooms across workers. Loss of the revocation feed disconnects web sockets and blocks web reconnects until checks resume. Cookie-only socket authentication was removed. Existing native token handshakes remain supported.

Limits: tab isolation does not cure same-origin XSS. Existing CSP and other protections were not weakened. Actual multi-connection PostgreSQL locking/LISTEN behaviour and all browser duplication/recovery mechanisms still need their own release checks; mocks cannot prove them.

## 7. Core browser results

The local Chrome harness uses an isolated temporary profile, a localhost-only fixture, two fake users, the actual tab-identity module and server-session service, and a disposable PGlite database. Tabs share one real browser cookie jar. It is not a full end-to-end run of the deployed React login screens or live Google sign-in.

| Requirement | Result in local Chrome fixture |
| --- | --- |
| 1. A receives Tenant A | PASS |
| 2. B receives Landlord B | PASS |
| 3. Reload A preserves Tenant A | PASS |
| 4. Reload B preserves Landlord B | PASS |
| 5. A accesses a protected endpoint as A | PASS |
| 6. B accesses a protected endpoint as B | PASS |
| 7. Logout A leaves B signed in | PASS |
| 8. Logout B leaves A signed in | PASS |
| 9. Account switch A leaves B unchanged | PASS |
| 10. A new tab starts signed out | PASS |

Additional Chrome checks cover window.open, normal target-blank links, copied sessionStorage/history, trying to reuse an owned ID, SPA history followed by reload, distinct IDs, hashed lock names, HttpOnly visibility and absence of browser-stored bearer credentials. Actual Chrome tab-menu Duplicate is **NOT TESTED**. Its handling is fail-closed by design but is not claimed universally proven.

## 8. Test evidence

Final commands, totals and warning details are appended below. The backend suite includes SQL/session tests, global revocation, maintenance/MFA, Google, registration, native compatibility and ordinary business regressions. The web suite includes bootstrap/recovery, expiry/outage behaviour, stale responses/retries, delayed sign-in after logout, credential storage, email/Google components, voice and protected downloads.

PGlite is a real embedded PostgreSQL SQL engine running in WebAssembly, but these fixtures serialise one connection. Its concurrent-call tests prove application outcomes on that fixture; they do **not** prove races between independent PostgreSQL connections.

Native coverage includes the unchanged native authService executed with API/device-storage mocks; actual shared backend writer contract; body refresh; logout; native header/Google source contract; native socket handshake compatibility; and the mobile Keychain migration/clear tests. These are automated tests, not a new APK/iOS build or a live-device certification.

An earlier combined web run had a survey timeout and a following fake-timer cleanup error. The survey passed alone and then in the full suite without changing survey code. A later build caught stale impersonation imports; those were fixed, and the final build result below supersedes that failed attempt. No legitimate application error was suppressed.

## 9. Remaining gates and exact next steps

1. Run the real PostgreSQL test on a separately authorised test database. No local PostgreSQL server/container was available. The new `scripts/testWebAuthPostgres.cjs` refuses to connect without both an explicit flag and `RENTALHUB_AUTH_TEST_DATABASE_URL`. It also checks the actual database name for a test marker. It creates a unique private schema, applies 2060 only there, checks distinct backend connections, refresh/reuse/logout races, CSRF/cookie isolation, global revocation and rollback, then removes only its own schema. It never loads production `.env`. Example, only after privately setting that test URL: `node scripts/testWebAuthPostgres.cjs --allow-isolated-test-database`. **NOT RUN against PostgreSQL in this task.** Its unconfigured refusal was tested.
2. In an isolated full-app Chrome test, use two disposable accounts in one profile. Repeat the ten checks above. Use the actual tab-menu Duplicate command on a signed-in tab. Also test closing the original while the duplicate opens, browser restart/session restore and back/forward cache. A duplicated/new context must remain signed out; unrelated tabs must stay intact. Unsupported/ambiguous resume is allowed to fail closed. **Actual menu/restart tests NOT RUN.**
3. Exercise real multi-worker PostgreSQL LISTEN/NOTIFY socket revocation and feed failure. Unit simulations pass, but the real worker/feed path is **NOT TESTED**.
4. Registration and Google/session entry points pass mocked/automated checks. Actual provider/device end-to-end confirmation remains **NOT TESTED** because live authentication-provider calls and APK builds were prohibited.
5. Review the exact diff and migration. Only after all critical gates pass should a separate deployment approval be requested. Any eventual release must coordinate database, backend and frontend; do not publish just one part. Existing web users need one fresh sign-in. No production command is authorised by this report.

No new production environment variable is required. The optional database URL above belongs only to the guarded test command. No hosting environment, database account, provider subscription or dependency was created.

## 10. Readiness verdict

| Area | Verdict |
| --- | --- |
| Local code implementation | Implemented; reviewable |
| Local automated tests | See exact final results below |
| Real Chrome fixture | Main isolation checks pass; full app/menu duplication incomplete |
| Real PostgreSQL concurrency and worker notifications | NOT TESTED |
| Migration | PGlite apply/rollback verified; real PostgreSQL gate outstanding |
| Android/iOS protocol | Preserved in automated checks; device run not performed |
| Production deployment | **NOT CLEARED — do not deploy yet** |
| Overall task acceptance | **Incomplete until the remaining critical real-database/browser gates pass** |


## 11. Exact final results

| Command | Result | Test kind |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/**/*.test.js` | 597 passed; 0 failed; 0 skipped; 0 cancelled | Backend unit/regression tests plus disposable PGlite SQL; includes native and security tests |
| `npm --prefix client test` | 345 passed across 63 files; 0 failed | React/jsdom and mocked API tests |
| `npm --prefix client run build` | PASS; Vite built in 11.13 seconds | Actual local production website build, not deployment |
| `node scripts/testWebTabBrowser.cjs` | 19 boolean checks passed | Real isolated Chrome and cookies; localhost fixture + PGlite, not full deployed React/provider UI |
| `node --test src/services/__tests__/storageService.test.cjs scripts/verify-registration-auth-retry.cjs` (inside RentalHubMobile) | 9 passed; 0 failed; 0 skipped | Native secure-storage/registration retry mocks; mobile source unchanged |
| `node --test tests/services/webTabIdentity.test.js` | 6 passed; included in the backend total | Ownership and delayed-replacement unit races |
| `node scripts/testWebAuthPostgres.cjs` without setup/approval flag | Expected refusal: ISOLATED_TEST_DATABASE_REQUIRED; exit 1 | Guard test only; zero real PostgreSQL race tests executed |
| `node --check` for changed backend JS/CJS files | PASS | Syntax checks |
| `git diff --check 3ed64bf` | PASS | Whitespace/diff check |

Do not add the focused counts to the full-suite counts; they overlap. No skipped test is being presented as a pass.

Build warnings: Vite still reports large chunks and an undefined `FaceMesh` export in a TensorFlow/MediaPipe dependency. These dependencies and the photo/liveness feature were not changed or certified by this authentication task. These warnings were not silenced.

Evidence saved locally under `RentalHubMobile/.codex-tmp/`: `tab-auth-backend-verified.log`, `tab-auth-web-final-acceptance.log`, `tab-auth-build-final-acceptance.log`, `tab-browser-verified.log`, `tab-browser-acceptance/results.json`, `tab-auth-mobile-storage.log`, `tab-auth-postgres-guard.log`, `tab-auth-initial-state.json` and `tab-auth-final-state.json`. These generated test files are ignored by Git.

## 12. Exact final Git state and files

Final branch: `master`. Final HEAD: `e12460ba79154a5a48db5f6caf154e3d9849a1f8`. The change of HEAD was the user's confirmed VS Code commit, not an agent commit. No staged files. The mobile HEAD/status/submodule marker remain exactly as recorded above.

Final working-tree status relative to the user's commit:

```text
 M client/src/components/admin/AdminListTab.jsx
 M client/src/components/admin/SurveyAdminPanel.jsx
 M client/src/components/common/Header.jsx
 M client/src/context/AuthContext.jsx
 M client/src/context/AuthContext.session.test.jsx
 M client/src/pages/DisputeDetails.jsx
 M client/src/pages/VerifyCase.jsx
 M client/src/services/api.js
 M client/src/services/api.session.test.js
 M client/src/services/authService.js
 M client/src/services/authStorage.js
 M client/src/services/tabIdentity.cjs
 M client/src/services/voiceApi.js
 M client/src/services/webSessionClient.js
 M config/middleware/csrfProtection.js
 M docs/per-tab-authentication-review.md
 M docs/sql/2060_web_auth_sessions_rollback.sql
 M migrations/2060_web_auth_sessions.sql
 M routes/auth.js
 M scripts/testWebTabBrowser.cjs
 M services/authService.js
 M services/webSessionSockets.js
 M tests/services/webAuthSecurity.test.js
 M tests/services/webAuthSessions.test.js
?? client/src/services/authStorage.session.test.js
?? client/src/services/authenticatedDownload.js
?? client/src/services/authenticatedDownload.test.js
?? client/src/services/voiceApi.session.test.js
?? scripts/testWebAuthPostgres.cjs
?? tests/services/nativeAuthCompatibility.test.js
?? tests/services/webTabIdentity.test.js
```

### Existing files changed (36)

- `client/src/components/admin/AdminListTab.jsx`
- `client/src/components/admin/SurveyAdminPanel.jsx`
- `client/src/components/common/Header.jsx`
- `client/src/context/AuthContext.jsx`
- `client/src/context/AuthContext.session.test.jsx`
- `client/src/context/SocketContext.jsx`
- `client/src/pages/AcceptAgentInvite.jsx`
- `client/src/pages/AcceptLawyerInvite.jsx`
- `client/src/pages/App.jsx`
- `client/src/pages/DisputeDetails.jsx`
- `client/src/pages/Register.jsx`
- `client/src/pages/VerifyCase.jsx`
- `client/src/pages/VerifyEmail.jsx`
- `client/src/pages/VerifyEmail.test.jsx`
- `client/src/services/api.js`
- `client/src/services/api.session.test.js`
- `client/src/services/authService.js`
- `client/src/services/authStorage.js`
- `client/src/services/voiceApi.js`
- `config/middleware/auth.js`
- `config/middleware/csrfProtection.js`
- `config/middleware/featureFlags.js`
- `config/middleware/securityRateLimiters.js`
- `config/utils/authCookies.js`
- `config/utils/realtimeSocket.js`
- `routes/assistedRegistration.js`
- `routes/auth.js`
- `routes/voice.js`
- `server.js`
- `services/authService.js`
- `services/googleCustomerSignin.js`
- `services/superAdmin/userService.js`
- `tests/googleCustomerSignin.test.js`
- `tests/services/authenticationSchema.test.js`
- `tests/services/maintenanceSuperAdmin.test.js`
- `tests/spokenNotificationRoutes.test.js`

### New files created (19)

- `client/src/services/authenticatedDownload.js`
- `client/src/services/authenticatedDownload.test.js`
- `client/src/services/authStorage.session.test.js`
- `client/src/services/tabIdentity.cjs`
- `client/src/services/voiceApi.session.test.js`
- `client/src/services/webSessionClient.js`
- `docs/per-tab-authentication-review.md`
- `docs/sql/2060_web_auth_sessions_rollback.sql`
- `migrations/2060_web_auth_sessions.sql`
- `routes/webSessions.js`
- `scripts/cleanupWebAuthSessions.js`
- `scripts/testWebAuthPostgres.cjs`
- `scripts/testWebTabBrowser.cjs`
- `services/webAuthSessions.js`
- `services/webSessionSockets.js`
- `tests/services/nativeAuthCompatibility.test.js`
- `tests/services/webAuthSecurity.test.js`
- `tests/services/webAuthSessions.test.js`
- `tests/services/webTabIdentity.test.js`

The inventory is relative to the clean initial HEAD, so it includes files already committed by the user and the later local fixes. Total: 55 files. Source changes are left reviewable. No APK, IPA, hosting configuration or production data is part of this change.
