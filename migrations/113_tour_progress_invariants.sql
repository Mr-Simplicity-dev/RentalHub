-- Tour cursors are zero-based indexes. A cursor equal to total_steps points
-- beyond the final step and cannot be resumed safely.

UPDATE user_tour_states
SET
  current_step = CASE
    WHEN total_steps <= 0 THEN NULL
    ELSE LEAST(current_step, total_steps - 1)
  END,
  current_step_id = CASE
    WHEN total_steps <= 0 THEN NULL
    ELSE current_step_id
  END
WHERE current_step IS NOT NULL
  AND total_steps IS NOT NULL
  AND (total_steps <= 0 OR current_step >= total_steps);

UPDATE user_tour_events
SET current_step = NULL,
    step_id = NULL
WHERE current_step IS NOT NULL
  AND total_steps IS NOT NULL
  AND (total_steps <= 0 OR current_step >= total_steps);

ALTER TABLE user_tour_states
  DROP CONSTRAINT IF EXISTS user_tour_states_progress_check;

ALTER TABLE user_tour_states
  ADD CONSTRAINT user_tour_states_progress_check
  CHECK (
    (current_step IS NULL OR current_step >= 0)
    AND (total_steps IS NULL OR total_steps >= 0)
    AND (
      current_step IS NULL
      OR total_steps IS NULL
      OR current_step < total_steps
    )
  );

ALTER TABLE user_tour_events
  DROP CONSTRAINT IF EXISTS user_tour_events_dimensions_check;

ALTER TABLE user_tour_events
  ADD CONSTRAINT user_tour_events_dimensions_check
  CHECK (
    (current_step IS NULL OR current_step >= 0)
    AND (total_steps IS NULL OR total_steps >= 0)
    AND (current_step IS NULL OR total_steps IS NULL OR current_step < total_steps)
    AND (sequence_number IS NULL OR sequence_number >= 0)
    AND (sequence_number IS NULL OR session_id IS NOT NULL)
    AND (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000)
    AND jsonb_typeof(metadata) = 'object'
    AND jsonb_typeof(context) = 'object'
  );
