BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resume_token VARCHAR(64),
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_resume
  ON push_subscriptions(resume_token);

COMMIT;
