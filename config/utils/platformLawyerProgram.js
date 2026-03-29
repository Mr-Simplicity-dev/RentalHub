const crypto = require('crypto');
const db = require('../middleware/database');
const { getFrontendUrl } = require('./frontendUrl');

const PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE = 'platform_lawyer_recruitment';
const PLATFORM_LAWYER_INVITE_EXPIRY_HOURS = 72;
const PLATFORM_LAWYER_INVITE_EXPIRY_MS =
  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS * 60 * 60 * 1000;

let platformLawyerSchemaReady = false;

const hashPlatformLawyerInviteToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const ensurePlatformLawyerSchema = async () => {
  if (platformLawyerSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_role VARCHAR(50),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      broadcast_type VARCHAR(50) NOT NULL DEFAULT 'general',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE broadcasts
      ADD COLUMN IF NOT EXISTS broadcast_type VARCHAR(50) NOT NULL DEFAULT 'general';

    CREATE INDEX IF NOT EXISTS idx_broadcasts_target_role
      ON broadcasts(target_role);

    CREATE INDEX IF NOT EXISTS idx_broadcasts_type_created_at
      ON broadcasts(broadcast_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS platform_lawyer_applications (
      id SERIAL PRIMARY KEY,
      lawyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      review_note TEXT,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_lawyer_application_status
        CHECK (status IN ('pending', 'approved', 'rejected'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_lawyer_applications_user_unique
      ON platform_lawyer_applications(lawyer_user_id);

    CREATE INDEX IF NOT EXISTS idx_platform_lawyer_applications_status
      ON platform_lawyer_applications(status, applied_at DESC);

    CREATE TABLE IF NOT EXISTS platform_lawyers (
      id SERIAL PRIMARY KEY,
      source_type VARCHAR(20) NOT NULL,
      lawyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      application_id INTEGER REFERENCES platform_lawyer_applications(id) ON DELETE SET NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      nationality VARCHAR(80),
      chamber_name VARCHAR(255),
      chamber_phone VARCHAR(20),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_lawyer_source
        CHECK (source_type IN ('manual', 'application'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_lawyers_user_unique
      ON platform_lawyers(lawyer_user_id)
      WHERE lawyer_user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_platform_lawyers_active
      ON platform_lawyers(is_active, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_platform_lawyers_email
      ON platform_lawyers(email);

    CREATE TABLE IF NOT EXISTS platform_lawyer_invites (
      id SERIAL PRIMARY KEY,
      platform_lawyer_id INTEGER NOT NULL REFERENCES platform_lawyers(id) ON DELETE CASCADE,
      lawyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      lawyer_email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      accepted_at TIMESTAMP,
      last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resent_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_lawyer_invite_status
        CHECK (status IN ('pending', 'accepted', 'expired'))
    );

    CREATE INDEX IF NOT EXISTS idx_platform_lawyer_invites_entry
      ON platform_lawyer_invites(platform_lawyer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_platform_lawyer_invites_email
      ON platform_lawyer_invites(lawyer_email);
  `);

  platformLawyerSchemaReady = true;
};

const createPlatformLawyerInvite = async ({
  platformLawyerId,
  lawyerEmail,
  createdBy,
}) => {
  await ensurePlatformLawyerSchema();

  await db.query(
    `UPDATE platform_lawyer_invites
     SET status = 'expired',
         updated_at = CURRENT_TIMESTAMP
     WHERE platform_lawyer_id = $1
       AND status = 'pending'`,
    [platformLawyerId]
  );

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashPlatformLawyerInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + PLATFORM_LAWYER_INVITE_EXPIRY_MS);

  const result = await db.query(
    `INSERT INTO platform_lawyer_invites (
       platform_lawyer_id,
       lawyer_email,
       token_hash,
       expires_at,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, lawyer_email, expires_at, created_at, last_sent_at, resent_count`,
    [platformLawyerId, lawyerEmail, tokenHash, expiresAt, createdBy || null]
  );

  return {
    ...result.rows[0],
    invite_url: `${getFrontendUrl()}/lawyer/accept-invite?token=${rawToken}&mode=platform`,
    expires_in_hours: PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
  };
};

const getLatestPlatformLawyerRecruitmentBroadcast = async () => {
  await ensurePlatformLawyerSchema();

  const result = await db.query(
    `SELECT b.*, u.full_name AS sender_name
     FROM broadcasts b
     LEFT JOIN users u ON u.id = b.sender_id
     WHERE b.broadcast_type = $1
       AND (b.target_role = 'lawyer' OR b.target_role IS NULL)
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE]
  );

  return result.rows[0] || null;
};

const fetchPublicPlatformLawyers = async () => {
  await ensurePlatformLawyerSchema();

  const result = await db.query(
    `SELECT
       pl.id,
       pl.source_type,
       pl.lawyer_user_id,
       COALESCE(NULLIF(u.full_name, ''), pl.full_name) AS full_name,
       COALESCE(NULLIF(u.email, ''), pl.email) AS email,
       COALESCE(NULLIF(u.phone, ''), pl.phone) AS phone,
       COALESCE(NULLIF(u.nationality, ''), pl.nationality, 'Nigeria') AS nationality,
       COALESCE(NULLIF(u.chamber_name, ''), pl.chamber_name) AS chamber_name,
       COALESCE(NULLIF(u.chamber_phone, ''), pl.chamber_phone) AS chamber_phone,
       COALESCE(u.identity_verified, FALSE) AS identity_verified,
       li.status AS invite_status,
       li.accepted_at AS invite_accepted_at
     FROM platform_lawyers pl
     LEFT JOIN users u
       ON u.id = pl.lawyer_user_id
     LEFT JOIN LATERAL (
       SELECT pli.status, pli.accepted_at
       FROM platform_lawyer_invites pli
       WHERE pli.platform_lawyer_id = pl.id
       ORDER BY pli.created_at DESC
       LIMIT 1
     ) li ON TRUE
     WHERE pl.is_active = TRUE
     ORDER BY
       COALESCE(u.identity_verified, FALSE) DESC,
       COALESCE(NULLIF(u.full_name, ''), pl.full_name) ASC`
  );

  return result.rows;
};

const syncPlatformLawyerRecordFromUser = async ({
  platformLawyerId,
  lawyerUserId,
  updatedBy = null,
}) => {
  await ensurePlatformLawyerSchema();

  const result = await db.query(
    `UPDATE platform_lawyers pl
     SET lawyer_user_id = $2,
         full_name = COALESCE(NULLIF(u.full_name, ''), pl.full_name),
         email = COALESCE(NULLIF(u.email, ''), pl.email),
         phone = COALESCE(NULLIF(u.phone, ''), pl.phone),
         nationality = COALESCE(NULLIF(u.nationality, ''), pl.nationality),
         chamber_name = COALESCE(NULLIF(u.chamber_name, ''), pl.chamber_name),
         chamber_phone = COALESCE(NULLIF(u.chamber_phone, ''), pl.chamber_phone),
         updated_by = $3,
         updated_at = CURRENT_TIMESTAMP
     FROM users u
     WHERE pl.id = $1
       AND u.id = $2
     RETURNING pl.*`,
    [platformLawyerId, lawyerUserId, updatedBy]
  );

  return result.rows[0] || null;
};

module.exports = {
  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
  ensurePlatformLawyerSchema,
  hashPlatformLawyerInviteToken,
  createPlatformLawyerInvite,
  getLatestPlatformLawyerRecruitmentBroadcast,
  fetchPublicPlatformLawyers,
  syncPlatformLawyerRecordFromUser,
};
