-- Fix payments table schema issues
-- 1. Add completed_at column if it doesn't exist
-- 2. Add wallet_funding to payment_type check constraint
-- FIXED: Include ALL existing payment types to prevent data loss in production.
--        The old constraint may have had 'general_platform_fee' and other values
--        that existing rows in the payments table use.

DO $$
DECLARE
  existing_check_name TEXT;
BEGIN
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%payment_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

-- Now add the new constraint with ALL allowed payment types (including legacy ones)
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check 
CHECK (payment_type IN (
    'tenant_subscription', 
    'tenant_multiple_property_subscription',
    'landlord_subscription',
    'landlord_listing', 
    'rent_payment',
    'wallet_funding',
    'property_unlock',
    'general_platform_fee',
    'registration_fee',
    'tenant_property_alert',
    'tenant_location_access',
    'evidence_verification',
    'lawyer_directory_unlock',
    'lawyer_access_fee',
    'agent_access_fee',
    'transportation_booking'
));

-- Ensure completed_at column exists
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add index for completed_at for better performance
CREATE INDEX IF NOT EXISTS idx_payments_completed_at ON payments(completed_at);

-- Update any existing wallet_funding payments that might have failed
UPDATE payments 
SET payment_status = 'pending' 
WHERE payment_type = 'wallet_funding' 
  AND payment_status IS NULL;

-- Add comment to document the change
COMMENT ON CONSTRAINT payments_payment_type_check ON payments IS 
'Allowed payment types: tenant_subscription, landlord_listing, rent_payment, wallet_funding, property_unlock, general_platform_fee, and more';