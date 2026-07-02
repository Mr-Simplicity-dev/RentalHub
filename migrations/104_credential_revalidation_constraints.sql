BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_credential_revalidation_fields_present'
      AND conrelid = 'credential_revalidation_requests'::regclass
  ) THEN
    ALTER TABLE credential_revalidation_requests
      ADD CONSTRAINT chk_credential_revalidation_fields_present
      CHECK (jsonb_array_length(requested_fields) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_credential_revalidation_single_identity_type'
      AND conrelid = 'credential_revalidation_requests'::regclass
  ) THEN
    ALTER TABLE credential_revalidation_requests
      ADD CONSTRAINT chk_credential_revalidation_single_identity_type
      CHECK (NOT (requested_fields @> '["nin", "international_passport"]'::jsonb));
  END IF;
END
$$;

COMMIT;
