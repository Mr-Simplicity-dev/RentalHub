-- Track tenancy expiry reminder emails so expired-rent notices are not repeated.

CREATE TABLE IF NOT EXISTS tenancy_expiry_reminders (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE UNIQUE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenancy_expires_at TIMESTAMP NOT NULL,
  tenant_email_sent_at TIMESTAMP,
  landlord_email_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_tenant
  ON tenancy_expiry_reminders(tenant_id, tenancy_expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_landlord
  ON tenancy_expiry_reminders(landlord_id, tenancy_expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_expiry_reminders_property
  ON tenancy_expiry_reminders(property_id, tenancy_expires_at DESC);
