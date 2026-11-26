BEGIN;
CREATE TABLE authentication_sessions (
  id UUID PRIMARY KEY,
  public_id_hash CHAR(64) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_type VARCHAR(10) NOT NULL CHECK (client_type IN ('web','native')),
  token_version INTEGER NOT NULL CHECK (token_version > 0),
  refresh_hash CHAR(64) NOT NULL,
  previous_refresh_hash CHAR(64),
  csrf_hash CHAR(64) NOT NULL,
  family_id UUID NOT NULL,
  rotation_count INTEGER NOT NULL DEFAULT 0 CHECK (rotation_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  parked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(80),
  impersonation_parent_id UUID REFERENCES authentication_sessions(id) ON DELETE SET NULL,
  impersonated_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  CHECK (expires_at > created_at),
  CHECK (idle_expires_at <= expires_at)
);
CREATE INDEX authentication_sessions_user_active ON authentication_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX authentication_sessions_expiry ON authentication_sessions(expires_at);
CREATE INDEX authentication_sessions_idle_active ON authentication_sessions(idle_expires_at) WHERE revoked_at IS NULL;
CREATE INDEX authentication_sessions_revoked ON authentication_sessions(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX authentication_sessions_family ON authentication_sessions(family_id);
ALTER TABLE google_signin_requests ADD COLUMN web_tab_hash CHAR(64);
CREATE FUNCTION rentalhub_notify_auth_session_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('rentalhub_auth_session_revoked', OLD.id::text);
    RETURN OLD;
  END IF;
  IF (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) OR (NEW.parked_at IS NOT NULL AND OLD.parked_at IS NULL) THEN
    PERFORM pg_notify('rentalhub_auth_session_revoked', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER authentication_session_revoked AFTER UPDATE OF revoked_at,parked_at OR DELETE ON authentication_sessions FOR EACH ROW EXECUTE FUNCTION rentalhub_notify_auth_session_change();
CREATE FUNCTION rentalhub_revoke_user_auth_sessions() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('rentalhub_auth_user_revoked', OLD.id::text);
    RETURN OLD;
  END IF;
  IF NEW.token_version IS DISTINCT FROM OLD.token_version OR NEW.user_type IS DISTINCT FROM OLD.user_type OR NEW.is_active IS FALSE OR NEW.deleted_at IS NOT NULL THEN
    UPDATE authentication_sessions SET revoked_at=COALESCE(revoked_at,NOW()), revocation_reason=COALESCE(revocation_reason,'account_security_change') WHERE user_id=NEW.id AND revoked_at IS NULL;
    PERFORM pg_notify('rentalhub_auth_user_revoked', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_auth_security_change AFTER UPDATE OF token_version,user_type,is_active,deleted_at ON users FOR EACH ROW WHEN (OLD.token_version IS DISTINCT FROM NEW.token_version OR OLD.user_type IS DISTINCT FROM NEW.user_type OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) EXECUTE FUNCTION rentalhub_revoke_user_auth_sessions();
CREATE TRIGGER user_auth_security_delete AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION rentalhub_revoke_user_auth_sessions();
COMMIT;
