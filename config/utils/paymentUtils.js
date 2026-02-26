const db = require('../middleware/database');
const { sendEmail } = require('./mailer');

const sendEmailsSafely = async (messages) => {
  await Promise.all(
    messages.map(async (message) => {
      try {
        await sendEmail(message);
      } catch (error) {
        console.error('Failed to send expiration email:', error.message);
      }
    })
  );
};


// Check and update expired subscriptions (run as cron job)
exports.checkExpiredSubscriptions = async () => {
  try {
    const result = await db.query(
      `UPDATE users 
       SET subscription_active = FALSE
       WHERE subscription_active = TRUE 
         AND subscription_expires_at < CURRENT_TIMESTAMP
       RETURNING id, email, full_name`
    );

    console.log(`Deactivated ${result.rows.length} expired subscriptions`);

    if (result.rows.length) {
      const messages = result.rows
        .filter((user) => user.email)
        .map((user) => ({
          to: user.email,
          subject: 'Your tenant subscription has expired',
          html: `
            <p>Hello ${user.full_name || 'there'},</p>
            <p>Your subscription has expired and premium tenant access has been paused.</p>
            <p>Renew your plan to continue contacting landlords and viewing full property details.</p>
          `,
        }));

      await sendEmailsSafely(messages);
    }

    return result.rows;

  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
    return [];
  }
};

// Check and update expired property listings
exports.checkExpiredListings = async () => {
  try {
    const result = await db.query(
      `UPDATE properties 
       SET is_available = FALSE
       WHERE is_available = TRUE 
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id, title, landlord_id`
    );

    console.log(`Deactivated ${result.rows.length} expired listings`);

    if (result.rows.length) {
      const landlordIds = [
        ...new Set(
          result.rows
            .map((property) => property.landlord_id)
            .filter(Boolean)
        ),
      ];

      if (landlordIds.length) {
        const landlords = await db.query(
          `SELECT id, email, full_name
           FROM users
           WHERE id = ANY($1::int[])`,
          [landlordIds]
        );

        const landlordById = new Map(
          landlords.rows.map((landlord) => [String(landlord.id), landlord])
        );

        const messages = result.rows
          .map((property) => {
            const landlord = landlordById.get(String(property.landlord_id));
            if (!landlord || !landlord.email) return null;

            return {
              to: landlord.email,
              subject: 'A property listing has expired',
              html: `
                <p>Hello ${landlord.full_name || 'there'},</p>
                <p>Your property listing <strong>${property.title}</strong> has expired and is now unavailable.</p>
                <p>Renew your listing plan to make the property visible again.</p>
              `,
            };
          })
          .filter(Boolean);

        await sendEmailsSafely(messages);
      }
    }

    return result.rows;

  } catch (error) {
    console.error('Error checking expired listings:', error);
    return [];
  }
};

// Calculate platform revenue
exports.calculateRevenue = async (startDate, endDate) => {
  try {
    const result = await db.query(
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
    const stats = await db.query(`
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
