const db = require('./config/middleware/database');

async function checkTables() {
  try {
    console.log('Checking fumigation/cleaning database tables...\n');
    
    // Check if fumigation_cleaning_categories table exists
    const categoriesCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'fumigation_cleaning_categories'
      )`);
    
    // Check if fumigation_cleaning_services table exists
    const servicesCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'fumigation_cleaning_services'
      )`);
    
    // Check if fumigation_cleaning_bookings table exists
    const bookingsCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'fumigation_cleaning_bookings'
      )`);
    
    console.log('Fumigation/Cleaning Tables Status:');
    console.log('-----------------------------------');
    console.log('Categories table exists:', categoriesCheck.rows[0].exists);
    console.log('Services table exists:', servicesCheck.rows[0].exists);
    console.log('Bookings table exists:', bookingsCheck.rows[0].exists);
    console.log('');
    
    if (categoriesCheck.rows[0].exists) {
      const categoryCount = await db.query('SELECT COUNT(*) FROM fumigation_cleaning_categories');
      console.log('Categories count:', categoryCount.rows[0].count);
    }
    
    if (servicesCheck.rows[0].exists) {
      const serviceCount = await db.query('SELECT COUNT(*) FROM fumigation_cleaning_services');
      console.log('Services count:', serviceCount.rows[0].count);
    }
    
    if (bookingsCheck.rows[0].exists) {
      const bookingCount = await db.query('SELECT COUNT(*) FROM fumigation_cleaning_bookings');
      console.log('Bookings count:', bookingCount.rows[0].count);
    }
    
    // Check other related tables
    const tablesToCheck = [
      'service_addons',
      'service_providers',
      'booking_provider_assignments',
      'fumigation_payments',
      'service_reviews',
      'safety_compliance_records'
    ];
    
    console.log('\nRelated Tables Status:');
    console.log('----------------------');
    
    for (const table of tablesToCheck) {
      try {
        const check = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${table}'
          )`);
        console.log(`${table} exists:`, check.rows[0].exists);
      } catch (error) {
        console.log(`${table} check failed:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error checking tables:', error.message);
  } finally {
    process.exit();
  }
}

checkTables();