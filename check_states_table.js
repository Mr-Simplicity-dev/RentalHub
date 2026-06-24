const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkStatesTable() {
  const client = await pool.connect();
  try {
    console.log('Checking states table structure...');
    
    // Get column information
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'states'
      ORDER BY ordinal_position;
    `);
    
    console.log('States table columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type}) - nullable: ${row.is_nullable}`);
    });
    
    // Get sample data
    const sample = await client.query('SELECT * FROM states LIMIT 3');
    console.log('\nSample data:');
    sample.rows.forEach(row => {
      console.log(row);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkStatesTable();