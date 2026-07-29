-- Keep web and native walkthrough progress independent for every dashboard.
-- Historical state rows are retained under the "legacy" platform because the
-- original table did not record which client created them. Historical events
-- can be attributed when their JSON metadata already contains a platform.

ALTER TABLE user_tour_states
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tour_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS last_skipped_at TIMESTAMP;

ALTER TABLE user_tour_events
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tour_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS event_id VARCHAR(100);

UPDATE user_tour_states
SET
  platform = CASE
    WHEN LOWER(TRIM(COALESCE(platform, ''))) IN ('mobile', 'native', 'android', 'ios') THEN 'mobile'
    WHEN LOWER(TRIM(COALESCE(platform, ''))) IN ('web', 'browser', 'pwa') THEN 'web'
    ELSE 'legacy'
  END,
  tour_key = LOWER(COALESCE(
    NULLIF(TRIM(tour_key), ''),
    NULLIF(TRIM(dashboard_type), ''),
    'default'
  ))
WHERE platform IS NULL
   OR LOWER(TRIM(platform)) NOT IN ('legacy', 'web', 'mobile')
   OR platform <> LOWER(TRIM(platform))
   OR tour_key IS NULL
   OR TRIM(tour_key) = ''
   OR tour_key <> LOWER(TRIM(tour_key));

UPDATE user_tour_events
SET
  platform = CASE
    WHEN LOWER(TRIM(COALESCE(
      platform,
      CASE
        WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'platform'
        ELSE NULL
      END,
      ''
    ))) IN ('mobile', 'native', 'android', 'ios') THEN 'mobile'
    WHEN LOWER(TRIM(COALESCE(
      platform,
      CASE
        WHEN jsonb_typeof(metadata) = 'object' THEN metadata ->> 'platform'
        ELSE NULL
      END,
      ''
    ))) IN ('web', 'browser', 'pwa') THEN 'web'
    ELSE 'legacy'
  END,
  tour_key = LOWER(COALESCE(
    NULLIF(TRIM(tour_key), ''),
    NULLIF(TRIM(dashboard_type), ''),
    'default'
  ))
WHERE platform IS NULL
   OR LOWER(TRIM(platform)) NOT IN ('legacy', 'web', 'mobile')
   OR platform <> LOWER(TRIM(platform))
   OR tour_key IS NULL
   OR TRIM(tour_key) = ''
   OR tour_key <> LOWER(TRIM(tour_key));

ALTER TABLE user_tour_states
  ALTER COLUMN platform SET DEFAULT 'legacy',
  ALTER COLUMN platform SET NOT NULL,
  ALTER COLUMN tour_key SET DEFAULT 'default',
  ALTER COLUMN tour_key SET NOT NULL,
  ALTER COLUMN tour_version SET DEFAULT '3';

ALTER TABLE user_tour_events
  ALTER COLUMN platform SET DEFAULT 'legacy',
  ALTER COLUMN platform SET NOT NULL,
  ALTER COLUMN tour_key SET DEFAULT 'default',
  ALTER COLUMN tour_key SET NOT NULL,
  ALTER COLUMN tour_version SET DEFAULT '3';

DO $$
DECLARE
  primary_key_name TEXT;
  primary_key_columns TEXT[];
BEGIN
  SELECT
    constraint_row.conname,
    ARRAY_AGG(attribute_row.attname::TEXT ORDER BY key_column.ordinality)
  INTO primary_key_name, primary_key_columns
  FROM pg_constraint constraint_row
  CROSS JOIN LATERAL UNNEST(constraint_row.conkey)
    WITH ORDINALITY AS key_column(attnum, ordinality)
  JOIN pg_attribute attribute_row
    ON attribute_row.attrelid = constraint_row.conrelid
   AND attribute_row.attnum = key_column.attnum
  WHERE constraint_row.conrelid = 'user_tour_states'::regclass
    AND constraint_row.contype = 'p'
  GROUP BY constraint_row.conname;

  IF primary_key_name IS NOT NULL
     AND primary_key_columns IS DISTINCT FROM ARRAY['user_id', 'platform', 'tour_key']::TEXT[] THEN
    EXECUTE FORMAT(
      'ALTER TABLE user_tour_states DROP CONSTRAINT %I',
      primary_key_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_pkey
      PRIMARY KEY (user_id, platform, tour_key);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND conname = 'user_tour_states_platform_check'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_platform_check
      CHECK (platform IN ('legacy', 'web', 'mobile'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_tour_states'::regclass
      AND conname = 'user_tour_states_tour_key_check'
  ) THEN
    ALTER TABLE user_tour_states
      ADD CONSTRAINT user_tour_states_tour_key_check
      CHECK (TRIM(tour_key) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_tour_events'::regclass
      AND conname = 'user_tour_events_platform_check'
  ) THEN
    ALTER TABLE user_tour_events
      ADD CONSTRAINT user_tour_events_platform_check
      CHECK (platform IN ('legacy', 'web', 'mobile'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_tour_events'::regclass
      AND conname = 'user_tour_events_tour_key_check'
  ) THEN
    ALTER TABLE user_tour_events
      ADD CONSTRAINT user_tour_events_tour_key_check
      CHECK (TRIM(tour_key) <> '');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_tour_states_user_updated
  ON user_tour_states(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_tour_events_user_scope_created
  ON user_tour_events(user_id, platform, tour_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tour_events_client_event
  ON user_tour_events(user_id, platform, event_id)
  WHERE event_id IS NOT NULL;
