BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_photo_hash VARCHAR(64), ADD COLUMN IF NOT EXISTS face_gallery_enrolled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS face_gallery_enrollment_pending BOOLEAN NOT NULL DEFAULT FALSE;
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
CREATE OR REPLACE FUNCTION rentalhub_guard_identity_uniqueness() RETURNS trigger LANGUAGE plpgsql AS $identity_guard$
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 IF NULLIF(TRIM(NEW.nin_hash),'') IS NOT NULL AND (TG_OP='INSERT' OR NEW.nin_hash IS DISTINCT FROM OLD.nin_hash) THEN
  PERFORM pg_advisory_xact_lock(hashtext('nin:'||NEW.nin_hash));
  IF EXISTS(SELECT 1 FROM users WHERE nin_hash=NEW.nin_hash AND id<>NEW.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Identity is already registered' USING ERRCODE='23505'; END IF;
 END IF;
 IF NULLIF(TRIM(NEW.international_passport_number),'') IS NOT NULL AND (TG_OP='INSERT' OR NEW.international_passport_number IS DISTINCT FROM OLD.international_passport_number) THEN
  PERFORM pg_advisory_xact_lock(hashtext('passport:'||UPPER(TRIM(NEW.international_passport_number))));
  IF EXISTS(SELECT 1 FROM users WHERE UPPER(TRIM(international_passport_number))=UPPER(TRIM(NEW.international_passport_number)) AND id<>NEW.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Identity is already registered' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $identity_guard$;
DROP TRIGGER IF EXISTS rentalhub_identity_uniqueness ON users;
CREATE TRIGGER rentalhub_identity_uniqueness BEFORE INSERT OR UPDATE OF nin_hash,international_passport_number ON users FOR EACH ROW EXECUTE FUNCTION rentalhub_guard_identity_uniqueness();
COMMIT;
