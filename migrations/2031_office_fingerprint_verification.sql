BEGIN;
CREATE TABLE office_fingerprint_enrollments (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 encrypted_template TEXT NOT NULL,
 engine_version VARCHAR(40) NOT NULL,
 enrolled_by INTEGER NOT NULL REFERENCES users(id),
 consent_version VARCHAR(40) NOT NULL DEFAULT 'office-fingerprint-v1',
 consent_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE office_fingerprint_challenges (
 id UUID PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 staff_id INTEGER NOT NULL REFERENCES users(id),
 phone_key TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
CREATE INDEX office_fingerprint_challenge_user_time ON office_fingerprint_challenges(user_id, created_at DESC);
COMMIT;
