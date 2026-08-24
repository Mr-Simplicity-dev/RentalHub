-- Video support for ad spaces

ALTER TABLE ad_spaces
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS video_thumbnail VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS video_duration INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ad_spaces'::regclass AND conname = 'chk_ad_spaces_media_type'
  ) THEN
    ALTER TABLE ad_spaces
      ADD CONSTRAINT chk_ad_spaces_media_type
      CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_spaces_media_type
  ON ad_spaces (media_type);
