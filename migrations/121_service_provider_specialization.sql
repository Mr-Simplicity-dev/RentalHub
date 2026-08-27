BEGIN;

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS service_specialization VARCHAR(150);

COMMIT;
