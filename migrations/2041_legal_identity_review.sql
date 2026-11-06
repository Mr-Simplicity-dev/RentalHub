BEGIN;
ALTER TABLE identity_review_flags ADD COLUMN IF NOT EXISTS photo_pair_key VARCHAR(64);
CREATE INDEX IF NOT EXISTS identity_review_flags_pair_idx ON identity_review_flags(user_id,related_user_id,photo_pair_key,status) WHERE photo_pair_key IS NOT NULL;
COMMIT;
