BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_photo_hash VARCHAR(64), ADD COLUMN IF NOT EXISTS face_gallery_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS users_passport_photo_hash_idx ON users(passport_photo_hash) WHERE passport_photo_hash IS NOT NULL;
ALTER TABLE prembly_verification_attempts ADD COLUMN IF NOT EXISTS reference_photo_encrypted TEXT;
CREATE TABLE IF NOT EXISTS identity_photo_checks (
 id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), image_hash VARCHAR(64) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','verified','review_required','rejected')),
 reasons JSONB NOT NULL DEFAULT '[]', consent_version VARCHAR(40), consent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id,image_hash)
);
CREATE TABLE IF NOT EXISTS identity_face_comparisons (
 pair_key VARCHAR(64) PRIMARY KEY, status VARCHAR(24) NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','match','different','review_required')),
 confidence NUMERIC, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS identity_review_flags (
 id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), related_user_id INTEGER REFERENCES users(id),
 reason VARCHAR(80) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed')),
 reviewed_by INTEGER REFERENCES users(id), review_note TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS identity_review_flags_user_idx ON identity_review_flags(user_id,status);
CREATE TABLE IF NOT EXISTS identity_capture_sessions (
 token_hash VARCHAR(64) PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TIMESTAMPTZ NOT NULL
);
COMMIT;
