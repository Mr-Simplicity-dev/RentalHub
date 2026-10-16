ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS ownership_gate_enabled_at TIMESTAMP;
