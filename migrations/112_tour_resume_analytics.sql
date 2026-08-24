-- Persist the active walkthrough cursor and normalize the dimensions needed by
-- the onboarding analytics dashboard. This migration deliberately follows the
-- platform-scope migration instead of editing it, so it remains safe for
-- installations where migration 111 has already been applied.

ALTER TABLE user_tour_states
  ADD COLUMN IF NOT EXISTS current_step INTEGER,
  ADD COLUMN IF NOT EXISTS current_step_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS total_steps INTEGER,
  ADD COLUMN IF NOT EXISTS progress_updated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locale VARCHAR(35),
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_event_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resume_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS active_session_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_sequence_number INTEGER,
  ADD COLUMN IF NOT EXISTS state_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_tour_events
  ADD COLUMN IF NOT EXISTS locale VARCHAR(35),
  ADD COLUMN IF NOT EXISTS route VARCHAR(255),
  ADD COLUMN IF NOT EXISTS target_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE user_tour_states
SET
  context = CASE
    WHEN jsonb_typeof(context) = 'object' THEN context
    ELSE '{}'::jsonb
  END,
  resume_count = GREATEST(COALESCE(resume_count, 0), 0),
  state_revision = GREATEST(COALESCE(state_revision, 0), 0)
WHERE context IS NULL
   OR jsonb_typeof(context) <> 'object'
   OR resume_count IS NULL
   OR resume_count < 0
   OR state_revision IS NULL
   OR state_revision < 0;

UPDATE user_tour_events
SET context = '{}'::jsonb
WHERE context IS NULL OR jsonb_typeof(context) <> 'object';

ALTER TABLE user_tour_states
  ALTER COLUMN context SET DEFAULT '{}'::jsonb,
  ALTER COLUMN context SET NOT NULL,
  ALTER COLUMN resume_count SET DEFAULT 0,
  ALTER COLUMN resume_count SET NOT NULL,
  ALTER COLUMN state_revision SET DEFAULT 0,
  ALTER COLUMN state_revision SET NOT NULL;

ALTER TABLE user_tour_events
  ALTER COLUMN context SET DEFAULT '{}'::jsonb,
  ALTER COLUMN context SET NOT NULL;

UPDATE user_tour_events
SET
  locale = LEFT(NULLIF(TRIM(COALESCE(
    locale,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'locale' END,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'language' END
  )), ''), 35),
  route = LEFT(NULLIF(TRIM(COALESCE(
    route,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'route' END,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'screen' END
  )), ''), 255),
  target_id = LEFT(NULLIF(TRIM(COALESCE(
    target_id,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'target_id' END
  )), ''), 120),
  reason_code = LEFT(NULLIF(LOWER(TRIM(COALESCE(
    reason_code,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'reason_code' END,
    CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'reason' END
  ))), ''), 80)
WHERE jsonb_typeof(metadata) = 'object';

ALTER TABLE user_tour_events
  DROP CONSTRAINT IF EXISTS user_tour_events_type_check;

ALTER TABLE user_tour_events
  ADD CONSTRAINT user_tour_events_type_check
  CHECK (event_type IN (
    'welcome_shown',
    'started',
    'resumed',
    'replayed',
    'step_viewed',
    'step_completed',
    'step_skipped',
    'action_completed',
    'target_missing',
    'step_unavailable',
    'paused',
    'completed',
    'skipped',
    'dismissed'
  ));

ALTER TABLE user_tour_states
  DROP CONSTRAINT IF EXISTS user_tour_states_status_check;

ALTER TABLE user_tour_states
  ADD CONSTRAINT user_tour_states_status_check
  CHECK (status IN (
    'not_started',
    'welcome_shown',
    'in_progress',
    'paused',
    'completed',
    'skipped',
    'dismissed'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND conname = 'user_tour_states_progress_check'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_progress_check
      CHECK (
        (current_step IS NULL OR current_step >= 0)
        AND (total_steps IS NULL OR total_steps >= 0)
        AND (
          current_step IS NULL
          OR total_steps IS NULL
          OR current_step <= total_steps
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND conname = 'user_tour_states_context_check'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_context_check
      CHECK (jsonb_typeof(context) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND conname = 'user_tour_states_sequence_check'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_sequence_check
      CHECK (
        (last_sequence_number IS NULL OR last_sequence_number >= 0)
        AND (last_sequence_number IS NULL OR active_session_id IS NOT NULL)
        AND resume_count >= 0
        AND state_revision >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_tour_events'::regclass
      AND conname = 'user_tour_events_dimensions_check'
  ) THEN
    ALTER TABLE user_tour_events
      ADD CONSTRAINT user_tour_events_dimensions_check
      CHECK (
        (current_step IS NULL OR current_step >= 0)
        AND (total_steps IS NULL OR total_steps >= 0)
        AND (current_step IS NULL OR total_steps IS NULL OR current_step <= total_steps)
        AND (sequence_number IS NULL OR sequence_number >= 0)
        AND (sequence_number IS NULL OR session_id IS NOT NULL)
        AND (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000)
        AND jsonb_typeof(metadata) = 'object'
        AND jsonb_typeof(context) = 'object'
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_tour_states_analytics
  ON user_tour_states(platform, tour_key, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_tour_events_analytics_scope
  ON user_tour_events(created_at DESC, platform, tour_key, event_type);

CREATE INDEX IF NOT EXISTS idx_user_tour_events_step_health
  ON user_tour_events(platform, tour_key, step_id, event_type, created_at DESC)
  WHERE step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tour_events_locale_created
  ON user_tour_events(locale, created_at DESC)
  WHERE locale IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tour_events_session_sequence
  ON user_tour_events(user_id, platform, tour_key, session_id, sequence_number)
  WHERE session_id IS NOT NULL AND sequence_number IS NOT NULL;
