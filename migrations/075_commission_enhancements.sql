-- Add new action types to transaction_audits check constraint
ALTER TABLE transaction_audits DROP CONSTRAINT IF EXISTS transaction_audits_action_type_check;
ALTER TABLE transaction_audits ADD CONSTRAINT transaction_audits_action_type_check
  CHECK (action_type IN (
    'payment_created', 'payment_completed', 'payment_failed',
    'commission_earned', 'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected',
    'funds_frozen', 'funds_unfrozen',
    'commission_rate_changed', 'commission_reversed', 'auto_payout'
  ));

-- Index for quick commission config lookups
CREATE INDEX IF NOT EXISTS idx_commission_config_key ON commission_config(key);

-- Index for clawback lookups
CREATE INDEX IF NOT EXISTS idx_admin_commissions_payment_status ON admin_commissions(payment_id, status);

-- Add auto_payout_day_of_week to commission_config (default Monday = 1)
INSERT INTO commission_config (key, value, description)
VALUES ('auto_payout_day_of_week', 1, 'Day of week for auto-payouts (0=Sunday, 1=Monday, ... 6=Saturday). Set to -1 to disable.')
ON CONFLICT (key) DO NOTHING;
