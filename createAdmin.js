require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/middleware/database');

async function createAdmin() {
  const email = 'admin@yourapp.com';
  const phone = '08000000000';
  const fullName = 'System Administrator';
  const nin = '00000000000';
  const password = 'Admin@12345'; // change after first login

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
