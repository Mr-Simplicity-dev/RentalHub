BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_zone VARCHAR(50);

UPDATE users
SET user_type = 'lga_admin', updated_at = CURRENT_TIMESTAMP
WHERE user_type = 'admin';

CREATE INDEX IF NOT EXISTS idx_users_assigned_zone ON users (assigned_zone)
WHERE assigned_zone IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_territories (
  id BIGSERIAL PRIMARY KEY,
  territory_type VARCHAR(10) NOT NULL CHECK (territory_type IN ('zone', 'state', 'lga')),
  territory_name VARCHAR(100) NOT NULL,
  parent_name VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMP,
  activated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (territory_type, territory_name, parent_name)
);

COMMENT ON TABLE operational_territories IS 'Geographic records are not active by default. Set ENFORCE_TERRITORY_ACTIVATION=true only after explicitly activating intended territories.';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_territorial_scope_check;
ALTER TABLE users ADD CONSTRAINT users_territorial_scope_check CHECK (
  (user_type NOT IN ('admin', 'lga_admin') OR (assigned_state IS NOT NULL AND assigned_city IS NOT NULL))
  AND (user_type <> 'state_admin' OR assigned_state IS NOT NULL)
  AND (user_type <> 'zonal_admin' OR assigned_zone IN ('North Central', 'North East', 'North West', 'South East', 'South South', 'South West'))
) NOT VALID;

COMMIT;
