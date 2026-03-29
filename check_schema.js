const db = require('./config/middleware/database');

async function checkSchema() {
  try {
    console.log('Checking database schema...\n');
    
    // Check users table structure
    const usersResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    console.log('Users table columns:');
    usersResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Check properties table structure
    const propsResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      ORDER BY ordinal_position
    `);
    console.log('\nProperties table columns:');
    propsResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Check payments table structure
    const paymentsResult = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position
    `);
    console.log('\nPayments table columns:');
    paymentsResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Check if referred_by column exists
    const referredByResult = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'referred_by'
    `);
    console.log('\nHas referred_by column:', referredByResult.rows.length > 0);
    
    // Check user types
    const userTypesResult = await db.query(`
      SELECT DISTINCT user_type FROM users
    `);
    console.log('\nExisting user types:');
    userTypesResult.rows.forEach(row => {
      console.log(`  ${row.user_type}`);
    });
    
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    process.exit();
  }
}

checkSchema();