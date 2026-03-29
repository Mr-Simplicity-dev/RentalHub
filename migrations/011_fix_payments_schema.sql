-- Fix payments table schema issues
-- 1. Add completed_at column if it doesn't exist
-- 2. Add wallet_funding to payment_type check constraint

-- First, drop the existing check constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;

-- Now add the new constraint with all allowed payment types
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check 
CHECK (payment_type IN (
    'tenant_subscription', 
    'landlord_listing', 
    'rent_payment',
    'wallet_funding',
    'property_unlock'
));

-- Ensure completed_at column exists
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add index for completed_at for better performance
CREATE INDEX IF NOT EXISTS idx_payments_completed_at ON payments(completed_at);

-- Also add property_unlock to the constraint if it's not already there
-- (it's already included in the new constraint above)

-- Update any existing wallet_funding payments that might have failed
UPDATE payments 
SET payment_status = 'pending' 
WHERE payment_type = 'wallet_funding' 
  AND payment_status IS NULL;

-- Add comment to document the change
COMMENT ON CONSTRAINT payments_payment_type_check ON payments IS 
'Allowed payment types: tenant_subscription, landlord_listing, rent_payment, wallet_funding, property_unlock';