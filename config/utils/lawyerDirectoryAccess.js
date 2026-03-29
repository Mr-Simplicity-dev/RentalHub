const db = require('../middleware/database');

const LAWYER_DIRECTORY_UNLOCK_PRICE_NGN = Number(
  process.env.LAWYER_DIRECTORY_UNLOCK_PRICE_NGN || 10000
);

let lawyerDirectorySchemaReady = false;

const ensureLawyerDirectoryUnlockSchema = async () => {
  if (lawyerDirectorySchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS lawyer_directory_unlocks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120) UNIQUE,
      unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_lawyer_directory_unlocks_user
      ON lawyer_directory_unlocks(user_id);

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

    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_type_check
      CHECK (
        payment_type IN (
          'tenant_subscription',
          'landlord_listing',
          'rent_payment',
          'property_unlock',
          'general_platform_fee',
          'registration_fee',
          'wallet_funding',
          'tenant_property_alert',
          'evidence_verification',
          'lawyer_directory_unlock'
        )
      );
  `);

  lawyerDirectorySchemaReady = true;
};

const getLawyerDirectoryUnlockStatus = async (userId) => {
  await ensureLawyerDirectoryUnlockSchema();

  const result = await db.query(
    `SELECT id, payment_id, transaction_reference, unlocked_at
     FROM lawyer_directory_unlocks
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];

  return {
    unlocked: Boolean(row),
    unlock: row || null,
  };
};

module.exports = {
  LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
  ensureLawyerDirectoryUnlockSchema,
  getLawyerDirectoryUnlockStatus,
};
