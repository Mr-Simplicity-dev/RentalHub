const db = require('./config/middleware/database');

async function checkData() {
  try {
    console.log('Checking fumigation/cleaning data...\n');
    
    // Check categories
    console.log('=== Service Categories ===');
    const categories = await db.query('SELECT * FROM fumigation_cleaning_categories ORDER BY id');
    console.log(`Found ${categories.rows.length} categories:`);
    categories.rows.forEach(cat => {
      console.log(`  ${cat.id}. ${cat.category_name} (${cat.category_type}) - Active: ${cat.is_active}`);
    });
    
    // Check services
    console.log('\n=== Services ===');
    const services = await db.query(`
      SELECT fcs.*, fcc.category_name 
      FROM fumigation_cleaning_services fcs
      JOIN fumigation_cleaning_categories fcc ON fcs.category_id = fcc.id
      ORDER BY fcs.id
    `);
    console.log(`Found ${services.rows.length} services:`);
    services.rows.forEach(svc => {
      console.log(`  ${svc.id}. ${svc.service_name} (${svc.category_name}) - ₦${svc.base_price}`);
    });
    
    // Check addons
    console.log('\n=== Service Addons ===');
    const addons = await db.query(`
      SELECT sa.*, fcs.service_name 
      FROM service_addons sa
      JOIN fumigation_cleaning_services fcs ON sa.service_id = fcs.id
      ORDER BY sa.id
    `);
    console.log(`Found ${addons.rows.length} addons:`);
    addons.rows.forEach(addon => {
      console.log(`  ${addon.id}. ${addon.addon_name} (${addon.service_name}) - ₦${addon.addon_price}`);
    });
    
    // Check providers
    console.log('\n=== Service Providers ===');
    const providers = await db.query('SELECT * FROM service_providers ORDER BY id');
    console.log(`Found ${providers.rows.length} providers:`);
    providers.rows.forEach(provider => {
      console.log(`  ${provider.id}. ${provider.company_name} - Rating: ${provider.rating}`);
    });
    
    // Check bookings
    console.log('\n=== Bookings ===');
    const bookings = await db.query(`
      SELECT fcb.*, fcs.service_name, u.full_name as tenant_name
      FROM fumigation_cleaning_bookings fcb
      LEFT JOIN fumigation_cleaning_services fcs ON fcb.service_id = fcs.id
      LEFT JOIN users u ON fcb.tenant_id = u.id
      ORDER BY fcb.created_at DESC
      LIMIT 10
    `);
    console.log(`Found ${bookings.rows.length} bookings:`);
    bookings.rows.forEach(booking => {
      console.log(`  Booking #${booking.id}: ${booking.service_name || 'Unknown'} - Status: ${booking.booking_status} - Tenant: ${booking.tenant_name || 'Unknown'}`);
    });
    
    // Check if any users exist to test with
    console.log('\n=== Test Users (Tenants) ===');
    const tenants = await db.query(`
      SELECT id, full_name, email, user_type 
      FROM users 
      WHERE user_type = 'tenant' 
      LIMIT 5
    `);
    console.log(`Found ${tenants.rows.length} tenant users:`);
    tenants.rows.forEach(tenant => {
      console.log(`  ${tenant.id}. ${tenant.full_name} (${tenant.email})`);
    });
    
    // Check if any properties exist to test with
    console.log('\n=== Test Properties ===');
    const properties = await db.query(`
      SELECT id, title, property_type, bedrooms 
      FROM properties 
      LIMIT 5
    `);
    console.log(`Found ${properties.rows.length} properties:`);
    properties.rows.forEach(property => {
      console.log(`  ${property.id}. ${property.title} (${property.property_type}, ${property.bedrooms} bedrooms)`);
    });
    
  } catch (error) {
    console.error('Error checking data:', error.message);
  } finally {
    process.exit();
  }
}

checkData();