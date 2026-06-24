CREATE TABLE IF NOT EXISTS legal_authorizations (
  id SERIAL PRIMARY KEY,
  property_id INT REFERENCES properties(id) ON DELETE CASCADE,
  client_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  lawyer_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  granted_by INT REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legal_property
ON legal_authorizations(property_id);

CREATE INDEX IF NOT EXISTS idx_legal_lawyer
ON legal_authorizations(lawyer_user_id);