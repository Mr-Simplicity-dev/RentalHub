-- Keep the appeal that is already under review (or otherwise the newest
-- appeal) active, and close any historical duplicate before enforcing the
-- database invariant. This makes the migration safe on existing databases.
WITH ranked_property_appeals AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, appellant_id
      ORDER BY
        CASE WHEN status = 'under_review' THEN 0 ELSE 1 END,
        created_at DESC,
        id DESC
    ) AS duplicate_rank
  FROM admin_appeals
  WHERE appeal_type = 'property'
    AND property_id IS NOT NULL
    AND status IN ('pending', 'under_review')
)
UPDATE admin_appeals appeal
SET status = 'dismissed',
    review_note = COALESCE(
      appeal.review_note,
      'Automatically closed because a newer active appeal exists for the same decision.'
    ),
    reviewed_at = COALESCE(appeal.reviewed_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
FROM ranked_property_appeals ranked
WHERE appeal.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked_verification_appeals AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY target_user_id, appellant_id
      ORDER BY
        CASE WHEN status = 'under_review' THEN 0 ELSE 1 END,
        created_at DESC,
        id DESC
    ) AS duplicate_rank
  FROM admin_appeals
  WHERE appeal_type = 'verification'
    AND target_user_id IS NOT NULL
    AND status IN ('pending', 'under_review')
)
UPDATE admin_appeals appeal
SET status = 'dismissed',
    review_note = COALESCE(
      appeal.review_note,
      'Automatically closed because a newer active appeal exists for the same decision.'
    ),
    reviewed_at = COALESCE(appeal.reviewed_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
FROM ranked_verification_appeals ranked
WHERE appeal.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_appeals_active_property
  ON admin_appeals(property_id, appellant_id)
  WHERE appeal_type = 'property'
    AND property_id IS NOT NULL
    AND status IN ('pending', 'under_review');

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_appeals_active_verification
  ON admin_appeals(target_user_id, appellant_id)
  WHERE appeal_type = 'verification'
    AND target_user_id IS NOT NULL
    AND status IN ('pending', 'under_review');
