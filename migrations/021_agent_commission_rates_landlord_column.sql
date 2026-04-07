-- Align commission rates schema with landlord-based assignment semantics
-- Keeps backward compatibility with older tenant_user_id column

ALTER TABLE agent_commission_rates
ADD COLUMN IF NOT EXISTS landlord_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE agent_commission_rates
SET landlord_user_id = tenant_user_id
WHERE landlord_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_commission_rates_landlord
  ON agent_commission_rates(landlord_user_id);
