-- 158: payment channel for professional receipts
-- Captures the Paystack channel (card / bank_transfer / ussd / qr / bank /
-- mobile_money) so receipts can show the real means of payment.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(40);
