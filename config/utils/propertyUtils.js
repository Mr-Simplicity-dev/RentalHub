const logger = require('./logger');
const db = require('../middleware/database');

const clampLimit = (limit, fallback = 10) => {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

// Top Nigerian hub priority for ordering when property counts are equal or zero
const PRIORITY_STATES_ORDER = `
  CASE
    WHEN LOWER(s.state_name) LIKE '%lagos%' THEN 1
    WHEN LOWER(s.state_name) LIKE '%abuja%' OR LOWER(s.state_code) LIKE '%fct%' THEN 2
    WHEN LOWER(s.state_name) LIKE '%rivers%' THEN 3
    WHEN LOWER(s.state_name) LIKE '%oyo%' THEN 4
    WHEN LOWER(s.state_name) LIKE '%kano%' THEN 5
    WHEN LOWER(s.state_name) LIKE '%enugu%' THEN 6
    WHEN LOWER(s.state_name) LIKE '%ogun%' THEN 7
    WHEN LOWER(s.state_name) LIKE '%anambra%' THEN 8
    WHEN LOWER(s.state_name) LIKE '%delta%' THEN 9
    ELSE 20
  END
`;

// Get popular locations (states with most active verified properties, defaulting to top Nigerian hubs)
const getPopularLocations = async (limit = 10) => {
  const safeLimit = clampLimit(limit, 10);
  try {
    const result = await db.query(
      `SELECT
         s.state_name,
         s.state_code,
         s.id AS state_id,
         s.id,
         COALESCE(COUNT(p.id), 0)::int AS property_count
       FROM states s
       LEFT JOIN properties p ON s.id = p.state_id
         AND p.is_available = TRUE
         AND p.is_verified = TRUE
       GROUP BY s.id, s.state_name, s.state_code
       ORDER BY property_count DESC, ${PRIORITY_STATES_ORDER} ASC, s.state_name ASC
       LIMIT $1`,
      [safeLimit]
    );

    let rows = (result?.rows || []).map((row) => ({
      ...row,
      id: row.state_id || row.id,
      state_id: row.state_id || row.id,
      property_count: Number(row.property_count || 0),
    }));

    if (rows.length === 0) {
      const defaultStateNames = ['Lagos', 'Abuja', 'Rivers', 'Oyo', 'Kano', 'Enugu'];
      rows = defaultStateNames.slice(0, safeLimit).map((name, i) => ({
        id: i + 1,
        state_id: i + 1,
        state_name: name,
        state_code: name.toLowerCase(),
        property_count: 0,
      }));
    }

    return rows.slice(0, safeLimit);
  } catch (error) {
    logger.error('Error getting popular locations:', error);
    const defaultStateNames = ['Lagos', 'Abuja', 'Rivers', 'Oyo', 'Kano', 'Enugu'];
    return defaultStateNames.slice(0, safeLimit).map((name, i) => ({
      id: i + 1,
      state_id: i + 1,
      state_name: name,
      state_code: name.toLowerCase(),
      property_count: 0,
    }));
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
    logger.error('Error getting price stats:', error);
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

    if (result.rows.length === 0) {
      const fallbackResult = await db.query(
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
           AND p.is_available = TRUE
           AND p.is_verified = TRUE
         ORDER BY ABS(p.rent_amount - $3) ASC
         LIMIT $4`,
        [propertyId, ref.state_id, Number(ref.rent_amount) || 0, safeLimit]
      );
      return fallbackResult.rows || [];
    }

    return result.rows;
  } catch (error) {
    logger.error('Error getting similar properties:', error);
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

    logger.info(`Expired ${result.rows.length} properties`);
    return result.rows;
  } catch (error) {
    logger.error('Error expiring properties:', error);
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

    if (!result.rows.length) {
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
           AND p.id NOT IN (SELECT property_id FROM saved_properties WHERE tenant_id = $1)
         ORDER BY p.featured DESC, p.created_at DESC
         LIMIT $2`,
        [userId, safeLimit]
      );
      return fallback.rows || [];
    }

    return result.rows;
  } catch (error) {
    logger.error('Error getting recommendations:', error);
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
