const pool = require('../config/middleware/database');

// Check and update expired subscriptions (run as cron job)
exports.checkExpiredSubscriptions = async () => {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET subscription_active = FALSE
       WHERE subscription_active = TRUE 
         AND subscription_expires_at < CURRENT_TIMESTAMP
       RETURNING id, email, full_name`
    );

    console.log(`Deactivated ${result.rows.length} expired subscriptions`);
    
    // TODO: Send email notifications to users
    return result.rows;

  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
  }
};

// Check and update expired property listings
exports.checkExpiredListings = async () => {
  try {
    const result = await pool.query(
      `UPDATE properties 
       SET is_available = FALSE
       WHERE is_available = TRUE 
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id, title, landlord_id`
    );

    console.log(`Deactivated ${result.rows.length} expired listings`);
    
    // TODO: Send email notifications to landlords
    return result.rows;

  } catch (error) {
    console.error('Error checking expired listings:', error);
  }
};

// Calculate platform revenue
exports.calculateRevenue = async (startDate, endDate) => {
  try {
    const result = await pool.query(
      `SELECT 
         payment_type,
         COUNT(*) as transaction_count,
         SUM(amount) as total_amount
       FROM payments
       WHERE payment_status = 'completed'
         AND completed_at BETWEEN $1 AND $2
       GROUP BY payment_type`,
      [startDate, endDate]
    );

    return result.rows;

  } catch (error) {
    console.error('Error calculating revenue:', error);
    return [];
  }
};

// Get payment statistics for admin dashboard
exports.getPaymentStats = async () => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE payment_type = 'tenant_subscription' AND payment_status = 'completed') as total_subscriptions,
        COUNT(*) FILTER (WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') as total_listings_paid,
        COUNT(*) FILTER (WHERE payment_type = 'rent_payment' AND payment_status = 'completed') as total_rent_payments,
        SUM(amount) FILTER (WHERE payment_status = 'completed') as total_revenue,
        SUM(amount) FILTER (WHERE payment_type = 'tenant_subscription' AND payment_status = 'completed') as subscription_revenue,
        SUM(amount) FILTER (WHERE payment_type = 'landlord_listing' AND payment_status = 'completed') as listing_revenue,
        SUM(amount) FILTER (WHERE payment_type = 'rent_payment' AND payment_status = 'completed') as rent_revenue
      FROM payments
    `);

    return stats.rows[0];

  } catch (error) {
    console.error('Error getting payment stats:', error);
    return null;
  }
};