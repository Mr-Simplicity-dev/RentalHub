CREATE TABLE IF NOT EXISTS user_tour_states (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dashboard_type VARCHAR(80),
  tour_version VARCHAR(40) NOT NULL DEFAULT '1',
  status VARCHAR(30) NOT NULL DEFAULT 'not_started',
  last_welcome_shown_at TIMESTAMP,
  last_started_at TIMESTAMP,
  last_completed_at TIMESTAMP,
  last_dismissed_at TIMESTAMP,
  started_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  dismissed_count INTEGER NOT NULL DEFAULT 0,
  replay_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_tour_states_status_check
    CHECK (status IN ('not_started', 'welcome_shown', 'in_progress', 'completed', 'skipped', 'dismissed'))
);

CREATE TABLE IF NOT EXISTS user_tour_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  dashboard_type VARCHAR(80),
  tour_version VARCHAR(40) NOT NULL DEFAULT '1',
  step_id VARCHAR(120),
  current_step INTEGER,
  total_steps INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_tour_events_type_check
    CHECK (event_type IN ('welcome_shown', 'started', 'replayed', 'completed', 'skipped', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_user_tour_events_user_created
  ON user_tour_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_tour_events_type_created
  ON user_tour_events(event_type, created_at DESC);
