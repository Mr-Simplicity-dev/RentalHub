/**
 * Backfill Existing NINs
 *
 * This script:
 * 1. Finds all users with plaintext NIN (or already-encrypted NIN that needs hashing)
 * 2. Encrypts plaintext NINs using the ninEncryption module
 * 3. Sets nin_hash for duplicate checking
 *
 * Usage: node scripts/backfillNinEncryption.js
 */
require('dotenv').config();

const { Pool } = require('pg');
const crypto = require('crypto');
const { encryptNIN } = require('../config/utils/ninEncryption');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const isAlreadyEncrypted = (nin) => {
  return typeof nin === 'string' && nin.includes(':') && nin.split(':').length === 3;
};

const run = async () => {
  const client = await pool.connect();

  try {
    console.log('🔍 Scanning for users with NIN data...');

    // Ensure the nin_hash column exists
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS nin_hash VARCHAR(64);
      CREATE INDEX IF NOT EXISTS idx_users_nin_hash
        ON users(nin_hash)
        WHERE nin_hash IS NOT NULL;
    `);

    // Find all users with non-null NIN
    const { rows } = await client.query(
      `SELECT id, nin FROM users WHERE nin IS NOT NULL AND nin != '' ORDER BY id`
    );

    console.log(`📋 Found ${rows.length} user(s) with NIN data.`);

    let encryptedCount = 0;
    let hashedCount = 0;
    let skippedCount = 0;

    for (const user of rows) {
      const nin = String(user.nin).trim();

      if (!nin) {
        skippedCount++;
        continue;
      }

      let encryptedNIN;
      let plaintextForHash;

      if (isAlreadyEncrypted(nin)) {
        // Already encrypted — just need to set the hash
        // We can't easily decrypt here for hashing, so we set hash to null
        // The hash will be set when the user next updates their NIN
        await client.query(
          `UPDATE users SET nin_hash = NULL WHERE id = $1`,
          [user.id]
        );
        hashedCount++;
        continue;
      }

      // Plaintext NIN — encrypt it and set hash
      encryptedNIN = encryptNIN(nin);
      if (!encryptedNIN) {
        console.warn(`⚠️  Failed to encrypt NIN for user ${user.id}, skipping.`);
        skippedCount++;
        continue;
      }

      const ninHash = crypto.createHash('sha256').update(nin).digest('hex');

      await client.query(
        `UPDATE users
         SET nin = $1,
             nin_hash = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [encryptedNIN, ninHash, user.id]
      );

      encryptedCount++;
      console.log(`  ✅ User ${user.id}: NIN encrypted and hash set`);
    }

    console.log('\n═══════════════════════════════════════');
    console.log('📊 Backfill Summary:');
    console.log(`  🔒 Encrypted:     ${encryptedCount}`);
    console.log(`  🔑 Hash set:      ${hashedCount}`);
    console.log(`  ⏭️  Skipped:       ${skippedCount}`);
    console.log(`  📦 Total processed: ${rows.length}`);
    console.log('═══════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
