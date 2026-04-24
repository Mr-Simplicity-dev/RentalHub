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

async function runFixedTransportationMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting fixed transportation admin monitoring migration...');
    
    // Read the fixed migration file
    const migrationPath = path.join(__dirname, 'migrations', '032_transportation_admin_monitoring_fixed.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Run the migration
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');
    
    console.log('Fixed transportation admin monitoring migration completed successfully!');
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

runFixedTransportationMigration();