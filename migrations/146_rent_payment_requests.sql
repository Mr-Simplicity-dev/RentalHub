-- 146_rent_payment_requests.sql
-- Option 2 "pay rent on behalf": tenant A generates a one-time secure link;
-- any logged-in user (tenant B, or a landlord paying for his child who is a
-- tenant) pays A's rent. The payment row belongs to tenant A (so crediting,
-- history and receipts follow A); payer_user_id records who actually paid.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_payer_user_id
  ON payments (payer_user_id);

CREATE TABLE IF NOT EXISTS rent_payment_requests (
  id BIGSERIAL PRIMARY KEY,
  tenant_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  token VARCHAR(80) NOT NULL UNIQUE,
  payer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rent_payment_requests_tenant
  ON rent_payment_requests (tenant_user_id, status, created_at DESC);
