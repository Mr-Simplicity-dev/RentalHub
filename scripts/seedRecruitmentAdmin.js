require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/middleware/database');

const email = process.env.RECRUITMENT_ADMIN_EMAIL || 'recruitment.admin@rentalhub.com.ng';
const phone = process.env.RECRUITMENT_ADMIN_PHONE || '+2348000000630';
const fullName = process.env.RECRUITMENT_ADMIN_NAME || 'Recruitment Admin';
const password = process.env.RECRUITMENT_ADMIN_PASSWORD;

const main = async () => {
  if (!password || password.length < 12) {
    throw new Error('Set RECRUITMENT_ADMIN_PASSWORD to a strong password with at least 12 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_recruitment_admin BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE;
  `);

  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [email]
  );

  if (existing.rows.length) {
    await db.query(
      `UPDATE users
       SET full_name = $1,
           phone = $2,
           password_hash = $3,
           user_type = 'recruitment_admin',
           is_recruitment_admin = TRUE,
           email_verified = TRUE,
           phone_verified = TRUE,
           identity_verified = TRUE,
           updated_at = NOW()
       WHERE id = $4`,
      [fullName, phone, passwordHash, existing.rows[0].id]
    );
    console.log(`Updated recruitment admin: ${email}`);
    return;
  }

  await db.query(
    `INSERT INTO users (
      full_name,
      email,
      phone,
      password_hash,
      user_type,
      is_recruitment_admin,
      email_verified,
      phone_verified,
      identity_verified
    )
    VALUES ($1, $2, $3, $4, 'recruitment_admin', TRUE, TRUE, TRUE, TRUE)`,
    [fullName, email, phone, passwordHash]
  );

  console.log(`Created recruitment admin: ${email}`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    if (typeof db.end === 'function') {
      db.end();
    }
  });
