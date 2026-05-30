require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./config/middleware/database');

const DEFAULT_EMAIL = 'admin@usayddomain.com';
const DEFAULT_PHONE = '07067012884';
const DEFAULT_PASSWORD = 'Admin@12345';

const ensureSuperAdminColumns = async () => {
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS nin VARCHAR(11),
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS passport_photo_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
      ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);
};

async function createOrRepairSuperAdmin() {
  const email = String(process.env.SUPER_ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const phone = String(process.env.SUPER_ADMIN_PHONE || DEFAULT_PHONE).trim();
  const fullName = String(process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();
  const nin = String(process.env.SUPER_ADMIN_NIN || '00000000000').trim();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD);

  if (!email || !phone || !password) {
    throw new Error('SUPER_ADMIN_EMAIL, SUPER_ADMIN_PHONE, and SUPER_ADMIN_PASSWORD are required');
  }

  await ensureSuperAdminColumns();

  const passwordHash = await bcrypt.hash(password, 10);
  const dbName = await db.query('SELECT current_database() AS current_database');
  console.log('Connected to database:', dbName.rows[0].current_database);

  const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);

  let result;
  if (existing.rows.length) {
    result = await db.query(
      `UPDATE users
       SET user_type = 'super_admin',
           phone = $2,
           password_hash = $3,
           full_name = $4,
           nin = $5,
           email_verified = TRUE,
           phone_verified = TRUE,
           identity_verified = TRUE,
           nin_verified = TRUE,
           is_active = TRUE,
           deleted_at = NULL,
           approval_status = 'approved',
           account_suspended_reason = NULL,
           account_suspended_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, email, phone, user_type, is_active, approval_status`,
      [existing.rows[0].id, phone, passwordHash, fullName, nin]
    );
  } else {
    result = await db.query(
      `INSERT INTO users (
         user_type, email, phone, password_hash, full_name, nin,
         email_verified, phone_verified, identity_verified, nin_verified,
         is_active, approval_status
       )
       VALUES (
         'super_admin', $1, $2, $3, $4, $5,
         TRUE, TRUE, TRUE, TRUE,
         TRUE, 'approved'
       )
       RETURNING id, email, phone, user_type, is_active, approval_status`,
      [email, phone, passwordHash, fullName, nin]
    );
  }

  console.log('Super admin ready:', result.rows[0]);
  console.log('Login email:', email);
  console.log('Password source:', process.env.SUPER_ADMIN_PASSWORD ? 'SUPER_ADMIN_PASSWORD env' : 'default development password');
}

createOrRepairSuperAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to create or repair super admin:', err);
    process.exit(1);
  });
