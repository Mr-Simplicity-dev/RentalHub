const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkTables() {
  const client = await pool.connect();
  try {
    console.log('Checking database tables...');
    
    // Check if states table exists
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'states'
      );
    `);
    
    console.log('States table exists:', result.rows[0].exists);
    
    // Check transportation_bookings table
    const result2 = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'transportation_bookings'
      );
    `);
    
    console.log('Transportation bookings table exists:', result2.rows[0].exists);
    
    // Check transportation_services table
    const result3 = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'transportation_services'
      );
    `);
    
    console.log('Transportation services table exists:', result3.rows[0].exists);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();