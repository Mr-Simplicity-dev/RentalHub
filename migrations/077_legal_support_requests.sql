CREATE TABLE IF NOT EXISTS legal_support_requests (
  id SERIAL PRIMARY KEY,
  client_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_lawyer_id INT REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  urgency VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legal_support_client
ON legal_support_requests(client_user_id);

CREATE INDEX IF NOT EXISTS idx_legal_support_lawyer
ON legal_support_requests(assigned_lawyer_id);
