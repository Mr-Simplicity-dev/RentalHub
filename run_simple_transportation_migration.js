const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runSimpleTransportationMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting transportation admin monitoring migration...');

    const migrationPath = path.join(
      __dirname,
      'migrations',
      '032_transportation_admin_monitoring.sql'
    );
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('Transportation admin monitoring migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSimpleTransportationMigration();
