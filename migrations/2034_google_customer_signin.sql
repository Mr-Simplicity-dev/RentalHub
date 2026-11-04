BEGIN;
ALTER TABLE users ADD COLUMN google_subject TEXT;
CREATE UNIQUE INDEX users_google_subject_unique ON users(google_subject) WHERE google_subject IS NOT NULL;
CREATE TABLE google_signin_requests (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('web','mobile')),
  nonce TEXT NOT NULL,
  verifier_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_version INTEGER,
  had_totp BOOLEAN,
  mailbox_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mailbox_subject TEXT,
  mailbox_hash TEXT,
  mailbox_attempts INTEGER NOT NULL DEFAULT 0,
  mailbox_verified BOOLEAN NOT NULL DEFAULT FALSE,
  code_hash TEXT
);
CREATE INDEX google_signin_expiry ON google_signin_requests(expires_at);
COMMIT;
