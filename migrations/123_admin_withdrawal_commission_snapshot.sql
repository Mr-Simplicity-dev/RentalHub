BEGIN;

ALTER TABLE admin_withdrawals
  ADD COLUMN IF NOT EXISTS commissions_snapshot JSONB;

COMMIT;
