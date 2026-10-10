-- 160: MFA grace period for privileged roles
-- Newly-enforced MFA gives existing admins a window to enroll TOTP before
-- they are locked out of administrative routes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_grace_until TIMESTAMP;
