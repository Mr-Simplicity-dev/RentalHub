require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/middleware/database');

async function createAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const phone = String(process.env.ADMIN_PHONE || '').trim();
  const fullName = String(process.env.ADMIN_NAME || 'System Administrator').trim();
  const nin = String(process.env.ADMIN_NIN || '').trim();
  const password = process.env.ADMIN_PASSWORD;
  const bootstrapSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || '');

  if (!email || !phone || !password || password.length < 14) {
    console.error('FATAL: Set ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD env vars (password min 14 chars)');
    process.exit(1);
  }

  if (!bootstrapSecret || bootstrapSecret.length < 16) {
    console.error('FATAL: ADMIN_BOOTSTRAP_SECRET (min 16 chars) is required to create an admin');
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const result = await db.query(
    `INSERT INTO users (
      user_type, email, phone, password_hash,
      full_name, nin,
      email_verified, phone_verified, identity_verified
    )
    VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,TRUE)
    RETURNING id, email, user_type`,
    ['admin', email, phone, passwordHash, fullName, nin]
  );

  console.log('Admin created:', result.rows[0]);
  process.exit(0);
}

createAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
