const db = require('../middleware/database');

let verificationAuditSchemaReady = false;
let userSuspensionSchemaReady = false;
let adminAccountOperationSchemaReady = false;
let identityVerificationOperationSchemaReady = false;
let propertyOperationSchemaReady = false;
let reportOperationSchemaReady = false;
let broadcastOperationSchemaReady = false;

const USER_VERIFICATION_STATUS_EXPR = `

  COALESCE(

    u.identity_verification_status,

    CASE

      WHEN u.identity_verified = TRUE THEN 'verified'

      WHEN u.passport_photo_url IS NOT NULL

        AND (u.nin IS NOT NULL OR u.international_passport_number IS NOT NULL)

      THEN 'pending'

      ELSE 'not_submitted'

    END

  )

`;

const ensureVerificationAuditSchema = async () => {
  if (verificationAuditSchemaReady) return;
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_users_identity_verified_by
      ON users(identity_verified_by);
    CREATE INDEX IF NOT EXISTS idx_users_identity_verification_status
      ON users(identity_verification_status);
  `);
  verificationAuditSchemaReady = true;
};

const ensureUserSuspensionSchema = async () => {
  if (userSuspensionSchemaReady) return;
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `);
  userSuspensionSchemaReady = true;
};

const ensureAdminAccountOperationSchema = async () => {
  if (adminAccountOperationSchemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_account_operations (
      id SERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      admin_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_account_operations_admin
      ON admin_account_operations(admin_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_account_operations_created
      ON admin_account_operations(created_at DESC);
  `);
  adminAccountOperationSchemaReady = true;
};

const ensureIdentityVerificationOperationSchema = async () => {
  if (identityVerificationOperationSchemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS identity_verification_operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      user_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_identity_verification_operations_user
      ON identity_verification_operations(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_identity_verification_operations_created
      ON identity_verification_operations(created_at DESC);
  `);
  identityVerificationOperationSchemaReady = true;
};

// ensureIdentitySchema intentionally omitted - authService.js has the canonical version

const ensurePropertyOperationSchema = async () => {
  if (propertyOperationSchemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS property_operations (
      id SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_property
      ON property_operations(property_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_operations_created
      ON property_operations(created_at DESC)
  `);
  propertyOperationSchemaReady = true;
};

const ensureReportOperationSchema = async () => {
  if (reportOperationSchemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_operations (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      previous_status VARCHAR(50),
      new_status VARCHAR(50),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_report
      ON report_operations(report_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_report_operations_created
      ON report_operations(created_at DESC)
  `);
  reportOperationSchemaReady = true;
};

const ensureBroadcastOperationSchema = async () => {
  if (broadcastOperationSchemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS broadcast_operations (
      id SERIAL PRIMARY KEY,
      broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_operations_broadcast
      ON broadcast_operations(broadcast_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_operations_created
      ON broadcast_operations(created_at DESC)
  `);
  broadcastOperationSchemaReady = true;
};

module.exports = {
  ensureVerificationAuditSchema,
  ensureUserSuspensionSchema,
  ensureAdminAccountOperationSchema,
  ensureIdentityVerificationOperationSchema,
  ensurePropertyOperationSchema,
  ensureReportOperationSchema,
  ensureBroadcastOperationSchema,
  USER_VERIFICATION_STATUS_EXPR,
};
