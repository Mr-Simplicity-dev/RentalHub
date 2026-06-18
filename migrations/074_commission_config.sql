CREATE TABLE IF NOT EXISTS commission_config (
  key VARCHAR(100) PRIMARY KEY,
  value NUMERIC(12, 2) NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed all current hardcoded values from commissionService.js
INSERT INTO commission_config (key, value, description) VALUES
  -- Payment type platform fee rates
  ('rent_payment_platform_fee_rate', 0.05, 'Platform fee rate for rent payments (5%)'),
  ('tenant_subscription_platform_fee_rate', 0.10, 'Platform fee rate for tenant subscriptions (10%)'),
  ('tenant_multiple_property_subscription_platform_fee_rate', 0.10, 'Platform fee rate for multiple property subscription (10%)'),
  ('landlord_subscription_platform_fee_rate', 0.10, 'Platform fee rate for landlord subscriptions (10%)'),
  ('landlord_listing_platform_fee_rate', 0.10, 'Platform fee rate for landlord listings (10%)'),
  ('wallet_funding_platform_fee_rate', 0.015, 'Platform fee rate for wallet funding (1.5%)'),
  ('property_unlock_platform_fee_rate', 0.10, 'Platform fee rate for property unlocks (10%)'),

  -- Admin commission shares (of platform fee)
  ('rent_payment_admin_share', 0.09, 'Admin share of platform fee for rent payments (9%)'),
  ('tenant_subscription_admin_share', 0.15, 'Admin share of platform fee for tenant subscriptions (15%)'),
  ('tenant_multiple_property_subscription_admin_share', 0.15, 'Admin share for multiple property subscription (15%)'),
  ('landlord_subscription_admin_share', 0.15, 'Admin share for landlord subscriptions (15%)'),
  ('landlord_listing_admin_share', 0.15, 'Admin share for landlord listings (15%)'),
  ('wallet_funding_admin_share', 0.20, 'Admin share for wallet funding (20%)'),
  ('property_unlock_admin_share', 0.15, 'Admin share for property unlocks (15%)'),

  -- Super admin commission shares (of platform fee)
  ('rent_payment_super_admin_share', 0.06, 'Super admin share for rent payments (6%)'),
  ('tenant_subscription_super_admin_share', 0.10, 'Super admin share for tenant subscriptions (10%)'),
  ('tenant_multiple_property_subscription_super_admin_share', 0.10, 'Super admin share for multiple property subscription (10%)'),
  ('landlord_subscription_super_admin_share', 0.10, 'Super admin share for landlord subscriptions (10%)'),
  ('landlord_listing_super_admin_share', 0.10, 'Super admin share for landlord listings (10%)'),
  ('wallet_funding_super_admin_share', 0.10, 'Super admin share for wallet funding (10%)'),
  ('property_unlock_super_admin_share', 0.10, 'Super admin share for property unlocks (10%)'),

  -- Rent wallet settings
  ('rent_wallet_platform_fee_rate', 0.025, 'Platform fee deducted from landlord rent credit (2.5%)'),
  ('rent_wallet_clearing_days', 20, 'Days before rent credit clears to landlord wallet'),

  -- Withdrawal limits
  ('min_admin_withdrawal', 1000, 'Minimum admin withdrawal amount'),
  ('min_wallet_funding', 100, 'Minimum wallet funding amount'),
  ('property_unlock_price', 1000, 'Price per property unlock'),
  ('monthly_subscription_base', 200, 'Base monthly subscription price'),
  ('multiple_property_subscription', 5000, 'Multiple property subscription price'),
  ('property_inspection_fee', 10000, 'Property inspection fee'),

  -- Lawyer access fee distribution (flat N2,000)
  ('lawyer_access_fee_total', 2000, 'Total lawyer access fee'),
  ('lawyer_access_fee_assigned_lawyer', 100, 'Share for assigned lawyer'),
  ('lawyer_access_fee_assigned_agent', 80, 'Share for assigned agent'),
  ('lawyer_access_fee_super_admin_base', 120, 'Base share for super admin'),
  ('lawyer_access_fee_state_admin', 140, 'Share for state admin'),
  ('lawyer_access_fee_state_financial_admin', 140, 'Share for state financial admin'),
  ('lawyer_access_fee_state_support_admin', 140, 'Share for state support admin'),
  ('lawyer_access_fee_state_lawyer_admin', 140, 'Share for state lawyer admin'),
  ('lawyer_access_fee_super_financial_admin', 200, 'Share for super financial admin'),
  ('lawyer_access_fee_super_support_admin', 200, 'Share for super support admin'),
  ('lawyer_access_fee_super_lawyer_admin', 200, 'Share for super lawyer admin'),
  ('lawyer_access_fee_fumigation_admin', 120, 'Share for fumigation admin'),
  ('lawyer_access_fee_transportation_admin', 120, 'Share for transportation admin'),

  -- Agent access fee distribution (flat N5,000)
  ('agent_access_fee_total', 5000, 'Total agent access fee'),
  ('agent_access_fee_assigned_agent', 2800, 'Share for assigned agent'),
  ('agent_access_fee_assigned_lawyer', 500, 'Share for assigned lawyer'),
  ('agent_access_fee_super_admin', 800, 'Share for super admin'),
  ('agent_access_fee_state_admin', 100, 'Share for state admin'),

  -- Suspended admin redistribution
  ('suspended_admin_redistribution_pct', 0.60, 'Percentage of commission redistributed to active state admins when an admin is suspended (60%)'),

  -- Performance bonus thresholds
  ('perf_bonus_volume_1m', 50000, 'Bonus for N1M monthly volume'),
  ('perf_bonus_volume_5m', 250000, 'Bonus for N5M monthly volume'),
  ('perf_bonus_volume_10m', 600000, 'Bonus for N10M monthly volume'),
  ('perf_bonus_growth_50', 10000, 'Bonus for 50 new users'),
  ('perf_bonus_growth_100', 25000, 'Bonus for 100 new users'),
  ('perf_bonus_growth_200', 60000, 'Bonus for 200 new users')
ON CONFLICT (key) DO NOTHING;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_commission_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_config_updated_at ON commission_config;
CREATE TRIGGER trg_commission_config_updated_at
  BEFORE UPDATE ON commission_config
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_config_timestamp();
