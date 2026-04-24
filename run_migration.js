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

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting transportation migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '013_transportation_services.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Run the migration
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');
    
    console.log('Transportation migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();