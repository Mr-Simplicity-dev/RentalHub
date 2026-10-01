-- The NIN column was VARCHAR(11) — big enough for a bare 11-digit NIN, but nowhere
-- near big enough for the AES-256-GCM envelope (iv:authTag:ciphertext ≈ 90 chars).
-- That is why every stored NIN was plaintext: encryptNIN() would have been rejected
-- by the column. Widen it so encryption can actually be used.

ALTER TABLE users
  ALTER COLUMN nin TYPE VARCHAR(255);
