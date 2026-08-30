BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS diaspora_review_dismissed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS diaspora_review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_users_diaspora_country ON users(diaspora_country);

COMMIT;
