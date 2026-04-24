-- Extend user_type column from VARCHAR(20) to VARCHAR(50)
-- Roles like 'state_financial_admin' (21 chars) and 'super_financial_admin' (21 chars)
-- exceeded the old VARCHAR(20) limit, causing server errors on creation.
-- The protect_super_admin rule must be dropped first, then recreated.

DROP RULE IF EXISTS protect_super_admin ON users;

ALTER TABLE users ALTER COLUMN user_type TYPE VARCHAR(50);

CREATE RULE protect_super_admin AS
  ON DELETE TO users
  WHERE (OLD.user_type = 'super_admin')
  DO INSTEAD NOTHING;
