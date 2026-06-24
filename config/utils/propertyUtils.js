const db = require('../middleware/database');

const clampLimit = (limit, fallback = 10) => {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

// Get popular locations (states with most active verified properties)
const getPopularLocations = async (limit = 10) => {
  try {
    const safeLimit = clampLimit(limit, 10);
    const result = await db.query(
      `SELECT
         s.state_name,
         s.state_code,
         s.id AS state_id,
         COUNT(p.id) AS property_count
       FROM states s
       LEFT JOIN properties p ON s.id = p.state_id
         AND p.is_available = TRUE
         AND p.is_verified = TRUE
       GROUP BY s.id, s.state_name, s.state_code
       HAVING COUNT(p.id) > 0
       ORDER BY property_count DESC
       LIMIT $1`,
      [safeLimit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting popular locations:', error);
    return [];
  }
};

// Get price statistics by state
const getPriceStatsByState = async (stateId) => {
  try {
    const result = await db.query(
      `SELECT
         MIN(rent_amount) AS min_price,
         MAX(rent_amount) AS max_price,
         AVG(rent_amount) AS avg_price,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rent_amount) AS median_price
       FROM properties
       WHERE state_id = $1
         AND is_available = TRUE
         AND is_verified = TRUE`,
      [stateId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting price stats:', error);
    return null;
  }
};

// Get similar properties
const getSimilarProperties = async (propertyId, limit = 5) => {
  try {
    const safeLimit = clampLimit(limit, 5);
    const refProperty = await db.query(
      `SELECT state_id, property_type, rent_amount, bedrooms
       FROM properties
       WHERE id = $1`,
      [propertyId]
    );

    if (!refProperty.rows.length) return [];

    const ref = refProperty.rows[0];
    const priceRange = Number(ref.rent_amount) * 0.2;

    const result = await db.query(
      `SELECT
         p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
         p.rent_amount, p.payment_frequency, p.city, p.area,
         s.state_name,
         (SELECT photo_url
          FROM property_photos
          WHERE property_id = p.id AND is_primary = TRUE
          LIMIT 1) AS primary_photo
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE p.id != $1
         AND p.state_id = $2
         AND p.property_type = $3
         AND p.rent_amount BETWEEN $4 AND $5
         AND p.is_available = TRUE
         AND p.is_verified = TRUE
       ORDER BY
         ABS(p.bedrooms - $6) ASC,
         ABS(p.rent_amount - $7) ASC
       LIMIT $8`,
      [
        propertyId,
        ref.state_id,
        ref.property_type,
        Number(ref.rent_amount) - priceRange,
        Number(ref.rent_amount) + priceRange,
        Number(ref.bedrooms) || 0,
        Number(ref.rent_amount) || 0,
        safeLimit,
      ]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting similar properties:', error);
    return [];
  }
};

// Auto-expire properties (run as cron job)
const expireProperties = async () => {
  try {
    const result = await db.query(
      `UPDATE properties
       SET is_available = FALSE
       WHERE is_available = TRUE
         AND expires_at IS NOT NULL
         AND expires_at < CURRENT_TIMESTAMP
       RETURNING id, title, landlord_id`
    );

    console.log(`Expired ${result.rows.length} properties`);
    return result.rows;
  } catch (error) {
    console.error('Error expiring properties:', error);
    return [];
  }
};

// Get recommended properties for a tenant
const getRecommendations = async (userId, limit = 10) => {
  try {
    const safeLimit = clampLimit(limit, 10);
    const savedProperties = await db.query(
      `SELECT p.state_id, p.property_type, p.rent_amount, p.bedrooms
       FROM saved_properties sp
       JOIN properties p ON sp.property_id = p.id
       WHERE sp.tenant_id = $1
       LIMIT 10`,
      [userId]
    );

    if (!savedProperties.rows.length) {
      const fallback = await db.query(
        `SELECT
           p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
           p.rent_amount, p.payment_frequency, p.city, p.area,
           s.state_name,
           (SELECT photo_url
            FROM property_photos
            WHERE property_id = p.id AND is_primary = TRUE
            LIMIT 1) AS primary_photo,
           (SELECT AVG(rating)
            FROM reviews
            WHERE property_id = p.id) AS avg_rating
         FROM properties p
         JOIN states s ON p.state_id = s.id
         WHERE p.is_available = TRUE
           AND p.is_verified = TRUE
         ORDER BY p.featured DESC, p.created_at DESC
         LIMIT $1`,
        [safeLimit]
      );

      return fallback.rows;
    }

    const prices = savedProperties.rows
      .map((row) => Number(row.rent_amount))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!prices.length) return [];

    const avgPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const priceRange = avgPrice * 0.3;
    const stateIds = [...new Set(savedProperties.rows.map((row) => row.state_id).filter(Boolean))];
    const propertyTypes = [
      ...new Set(savedProperties.rows.map((row) => row.property_type).filter(Boolean)),
    ];

    const result = await db.query(
      `SELECT
         p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
         p.rent_amount, p.payment_frequency, p.city, p.area,
         s.state_name,
         (SELECT photo_url
          FROM property_photos
          WHERE property_id = p.id AND is_primary = TRUE
          LIMIT 1) AS primary_photo,
         (SELECT AVG(rating)
          FROM reviews
          WHERE property_id = p.id) AS avg_rating
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE p.is_available = TRUE
         AND p.is_verified = TRUE
         AND p.id NOT IN (SELECT property_id FROM saved_properties WHERE tenant_id = $1)
         AND (p.state_id = ANY($2::int[]) OR p.property_type = ANY($3::text[]))
         AND p.rent_amount BETWEEN $4 AND $5
       ORDER BY
         CASE WHEN p.state_id = ANY($2::int[]) THEN 1 ELSE 2 END,
         CASE WHEN p.property_type = ANY($3::text[]) THEN 1 ELSE 2 END,
         p.featured DESC,
         p.created_at DESC
       LIMIT $6`,
      [userId, stateIds, propertyTypes, avgPrice - priceRange, avgPrice + priceRange, safeLimit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
};

module.exports = {
  getPopularLocations,
  getPriceStatsByState,
  getSimilarProperties,
  expireProperties,
  getRecommendations,
};
