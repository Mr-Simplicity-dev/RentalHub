-- Apply only after reverting the web-session implementation and requiring a fresh web sign-in.
-- This destroys only the new authentication session records; it does not alter users or native tokens.
BEGIN;
DROP TRIGGER IF EXISTS user_auth_security_change ON users;
DROP TRIGGER IF EXISTS user_auth_security_delete ON users;
DROP TRIGGER IF EXISTS authentication_session_revoked ON authentication_sessions;
DROP FUNCTION IF EXISTS rentalhub_revoke_user_auth_sessions();
DROP FUNCTION IF EXISTS rentalhub_notify_auth_session_change();
ALTER TABLE google_signin_requests DROP COLUMN IF EXISTS web_tab_hash;
DROP TABLE IF EXISTS authentication_sessions;
COMMIT;
