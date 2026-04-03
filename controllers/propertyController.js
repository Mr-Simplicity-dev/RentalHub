// ====================== IMPORTS ======================
const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const { cloudinary } = require('../config/middleware/upload');
const { submitURL } = require("../utils/googleIndexing");
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { getPropertyDisputeParticipants } = require('../config/utils/propertyDisputeParticipants');
const { getPropertyManagerContext } = require('../config/utils/agentSystem');
let propertySchemaReady = false;

const ensurePropertySchema = async () => {
  if (propertySchemaReady) return;
  await db.query(`
    ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS full_address TEXT,
    ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);

    ALTER TABLE property_photos
    ADD COLUMN IF NOT EXISTS upload_order INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS tenant_property_unlocks (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      transaction_reference VARCHAR(120),
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, property_id)
    );
  `);
  propertySchemaReady = true;
};

const resolvePropertyManagerContext = async (
  req,
  res,
  { propertyId = null, requiredPermission = 'can_manage_properties' } = {}
) => {
  const managerContext = await getPropertyManagerContext({
    user: req.user,
    propertyId,
    requiredPermission,
  });

  if (!managerContext.authorized) {
    const statusCode =
      managerContext.message === 'Property not found or unauthorized' ? 404 : 403;

    res.status(statusCode).json({
      success: false,
      message: managerContext.message,
    });
    return null;
  }

  return managerContext;
};

const ensureLandlordOwnerIsVerified = async (landlordUserId) => {
  const result = await db.query(
    `SELECT identity_verified
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [landlordUserId]
  );

  return result.rows[0]?.identity_verified === true;
};

const buildDamageAiPrompt = () => `You are a property damage assessment expert. Analyze this damage photo and provide a JSON response with these fields:
{
  "damage_type": "type of damage (scratch/crack/hole/dent/stain/water_damage/mold/other)",
  "severity": "minor/moderate/severe",
  "estimated_width_cm": number or null,
  "estimated_height_cm": number or null,
  "depth_level": "surface/shallow/deep/structural",
  "description": "clear description of the damage in 1-2 sentences",
  "repair_recommendation": "brief repair suggestion",
  "urgency": "low/medium/high"
}
Return only valid JSON, no extra text.`;

const analyzeDamagePhotoUrls = async (photoUrls = []) => {
  if (!photoUrls.length) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error: 'AI analysis unavailable',
      raw: 'ANTHROPIC_API_KEY is not configured',
    };
  }

  try {
    const axios = require('axios');
    const photoResponse = await axios.get(photoUrls[0], {
      responseType: 'arraybuffer',
    });
    const base64Image = Buffer.from(photoResponse.data).toString('base64');

    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: buildDamageAiPrompt(),
              },
            ],
          },
        ],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const rawText = claudeResponse.data?.content?.[0]?.text || '{}';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error('AI damage analysis error:', error.message);
    return {
      error: 'AI analysis unavailable',
      raw: error.message,
    };
  }
};


// =====================================================
// =============== PUBLIC ENDPOINTS =====================
// =====================================================


// -----------------------------------------------------
// Get All Nigerian States
// -----------------------------------------------------
exports.getAllStates = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM states ORDER BY state_name ASC'
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch states'
    });
  }
};


// -----------------------------------------------------
// Browse Properties (Limited Info)
// -----------------------------------------------------
exports.browseProperties = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.featured, p.created_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) AS photo_count,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE p.is_available = TRUE 
        AND p.is_verified = TRUE
        AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
      ORDER BY p.featured DESC, p.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM properties 
       WHERE is_available = TRUE 
         AND is_verified = TRUE
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Browse properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
};


// -----------------------------------------------------
// Get Featured Properties
// -----------------------------------------------------
exports.getFeaturedProperties = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.created_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE p.is_available = TRUE 
        AND p.is_verified = TRUE
        AND p.featured = TRUE
        AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
      ORDER BY p.created_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured properties'
    });
  }
};


// -----------------------------------------------------
// Search Properties With Filters
// -----------------------------------------------------
exports.searchProperties = async (req, res) => {
  try {
    const {
      search,
      featured,
      state_id,
      state,
      city,
      property_type,
      min_price,
      max_price,
      bedrooms,
      bathrooms,
      amenities,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 1;

    const whereConditions = [
      'p.is_available = TRUE',
      'p.is_verified = TRUE',
      '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)'
    ];

    const featuredOnly =
      String(featured).toLowerCase() === 'true' ||
      String(featured) === '1';

    if (featuredOnly) {
      whereConditions.push('p.featured = TRUE');
    }

    // State Filter
    if (state_id) {
      whereConditions.push(`p.state_id = $${paramCount}`);
      params.push(state_id);
      paramCount++;
    }

    if (state) {
      whereConditions.push(`LOWER(s.state_name) LIKE LOWER($${paramCount})`);
      params.push(`%${state}%`);
      paramCount++;
    }

    if (search) {
      whereConditions.push(`(
        LOWER(p.title) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.description, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.city, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.area, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(s.state_name, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(s.state_code, '')) LIKE LOWER($${paramCount})
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // City / Area Filter
    if (city) {
      whereConditions.push(`(
        LOWER(COALESCE(p.city, '')) LIKE LOWER($${paramCount}) OR
        LOWER(COALESCE(p.area, '')) LIKE LOWER($${paramCount})
      )`);
      params.push(`%${city}%`);
      paramCount++;
    }

    // Property Type
    if (property_type) {
      whereConditions.push(`p.property_type = $${paramCount}`);
      params.push(property_type);
      paramCount++;
    }

    // Price Filters
    if (min_price) {
      whereConditions.push(`p.rent_amount >= $${paramCount}`);
      params.push(min_price);
      paramCount++;
    }

    if (max_price) {
      whereConditions.push(`p.rent_amount <= $${paramCount}`);
      params.push(max_price);
      paramCount++;
    }

    // Bedrooms
    if (bedrooms) {
      whereConditions.push(`p.bedrooms >= $${paramCount}`);
      params.push(bedrooms);
      paramCount++;
    }

    // Bathrooms
    if (bathrooms) {
      whereConditions.push(`p.bathrooms >= $${paramCount}`);
      params.push(bathrooms);
      paramCount++;
    }

    // Amenities filter
    if (amenities) {
      const arr = Array.isArray(amenities) ? amenities : [amenities];
      whereConditions.push(`p.amenities @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(arr));
      paramCount++;
    }

    const validSortFields = ['created_at', 'rent_amount', 'bedrooms'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.amenities, p.featured, p.created_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) AS photo_count,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.featured DESC, p.${sortField} ${sortDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Total count
    const countQuery = `
      SELECT COUNT(*)
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await db.query(countQuery, params.slice(0, -2));

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Search properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search properties'
    });
  }
};


// -----------------------------------------------------
// Get Property By ID (Public Limited Version)
// -----------------------------------------------------
exports.getPropertyById = async (req, res) => {
  try {
    await ensurePropertySchema();

    const { propertyId } = req.params;

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.featured, p.created_at,
        s.state_name, s.state_code,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE p.id = $1 AND p.is_available = TRUE AND p.is_verified = TRUE`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or not available'
      });
    }

    const photosResult = await db.query(
      `SELECT id, photo_url, is_primary, upload_order
       FROM property_photos
       WHERE property_id = $1
       ORDER BY is_primary DESC, upload_order ASC`,
      [propertyId]
    );

    const property = result.rows[0];
    property.photos = photosResult.rows.map((photo) => photo.photo_url);
    property.requires_payment = true;

    res.json({
      success: true,
      data: property,
      message: 'Pay to view landlord contact and full address for this property'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property'
    });
  }
};


// =====================================================
// =============== TENANT ENDPOINTS =====================
// =====================================================


// -----------------------------------------------------
// Get Full Property Details (Requires Subscription)
// -----------------------------------------------------
exports.getFullPropertyDetails = async (req, res) => {
  try {
    await ensurePropertySchema();

    const { propertyId } = req.params;
    const userId = req.user.id;

    const unlockResult = await db.query(
      `SELECT id, unlocked_at
       FROM tenant_property_unlocks
       WHERE tenant_id = $1 AND property_id = $2`,
      [userId, propertyId]
    );

    if (!unlockResult.rows.length) {
      return res.status(402).json({
        success: false,
        code: 'PROPERTY_UNLOCK_REQUIRED',
        message: 'Payment is required to unlock full details for this property',
      });
    }

    const result = await db.query(
      `SELECT 
        p.*,
        s.state_name, s.state_code,
        u.id AS landlord_id, u.full_name AS landlord_name,
        u.email AS landlord_email, u.phone AS landlord_phone,
        u.identity_verified AS landlord_verified,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      JOIN users u ON p.landlord_id = u.id
      WHERE p.id = $1 
        AND p.is_available = TRUE 
        AND p.is_verified = TRUE`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or not available'
      });
    }

    const photosResult = await db.query(
      `SELECT id, photo_url, is_primary, upload_order
       FROM property_photos
       WHERE property_id = $1
       ORDER BY is_primary DESC, upload_order ASC`,
      [propertyId]
    );

    const property = result.rows[0];
    property.photos = photosResult.rows.map((photo) => photo.photo_url);

    await db.query(
      `INSERT INTO property_views (property_id, viewer_id, viewed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING`,
      [propertyId, userId]
    ).catch(() => {});

    res.json({
      success: true,
      data: property
    });
  } catch (error) {
    console.error('Get full property details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property details'
    });
  }
};


// -----------------------------------------------------
// Save/Favorite Property
// -----------------------------------------------------
exports.saveProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    await db.query(
      `INSERT INTO saved_properties (tenant_id, property_id)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, property_id) DO NOTHING`,
      [userId, propertyId]
    );

    res.json({
      success: true,
      message: 'Property saved to favorites'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to save property'
    });
  }
};


// -----------------------------------------------------
// Unsave Property
// -----------------------------------------------------
exports.unsaveProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    await db.query(
      'DELETE FROM saved_properties WHERE tenant_id = $1 AND property_id = $2',
      [userId, propertyId]
    );

    res.json({
      success: true,
      message: 'Property removed from favorites'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unsave property'
    });
  }
};


// -----------------------------------------------------
// Get Saved Properties
// -----------------------------------------------------
exports.getSavedProperties = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.featured, p.created_at, sp.created_at AS saved_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating
      FROM saved_properties sp
      JOIN properties p ON sp.property_id = p.id
      JOIN states s ON p.state_id = s.id
      WHERE sp.tenant_id = $1
        AND p.is_available = TRUE
        AND p.is_verified = TRUE
      ORDER BY sp.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM saved_properties sp
       JOIN properties p ON sp.property_id = p.id
       WHERE sp.tenant_id = $1
         AND p.is_available = TRUE
         AND p.is_verified = TRUE`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved properties'
    });
  }
};


// -----------------------------------------------------
// Add Review
// -----------------------------------------------------
exports.addReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { propertyId } = req.params;
    const userId = req.user.id;
    const { rating, review_text } = req.body;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1',
      [propertyId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    const result = await db.query(
      `INSERT INTO reviews (property_id, tenant_id, rating, review_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, tenant_id)
       DO UPDATE SET rating = $3, review_text = $4, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [propertyId, userId, rating, review_text]
    );

    res.json({
      success: true,
      message: 'Review added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add review'
    });
  }
};


// -----------------------------------------------------
// Get Property Reviews
// -----------------------------------------------------
exports.getPropertyReviews = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT 
        r.id, r.rating, r.review_text, r.created_at,
        u.full_name AS reviewer_name
      FROM reviews r
      JOIN users u ON r.tenant_id = u.id
      WHERE r.property_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
      [propertyId, limit, offset]
    );

    const avgResult = await db.query(
      `SELECT 
        AVG(rating) AS avg_rating,
        COUNT(*) AS total_reviews
      FROM reviews
      WHERE property_id = $1`,
      [propertyId]
    );

    res.json({
      success: true,
      data: {
        reviews: result.rows,
        avg_rating: parseFloat(avgResult.rows[0].avg_rating) || 0,
        total_reviews: parseInt(avgResult.rows[0].total_reviews)
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// -----------------------------------------------------
// Get users related to a property for dispute creation
// -----------------------------------------------------
exports.getPropertyUsers = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const requesterId = req.user?.id;
    const requesterType = req.user?.user_type;

    const propertyData = await getPropertyDisputeParticipants(propertyId);

    if (!propertyData) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    const participants = propertyData.participants || [];
    const participantIds = new Set(participants.map((item) => Number(item.id)));
    const isPrivileged = ['admin', 'super_admin'].includes(requesterType);

    if (!isPrivileged && !participantIds.has(Number(requesterId))) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to open disputes for this property',
      });
    }

    return res.json({
      success: true,
      data: participants,
    });
  } catch (error) {
    console.error('Get property users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch property users',
    });
  }
};


// =====================================================
// =============== LANDLORD ENDPOINTS ===================
// =====================================================


// -----------------------------------------------------
// Create New Property
// -----------------------------------------------------
exports.createProperty = async (req, res) => {
  let client;
  try {
    await ensurePropertySchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const managerContext = await resolvePropertyManagerContext(req, res, {
      requiredPermission: 'can_manage_properties',
    });
    if (!managerContext) return;

    const landlordUserId = managerContext.landlordUserId;
    const landlordVerified = await ensureLandlordOwnerIsVerified(landlordUserId);

    if (!landlordVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please complete identity verification (NIN + Passport) first.',
      });
    }

    const {
      state_id,
      state,
      city,
      area,
      full_address,
      property_type,
      bedrooms,
      bathrooms,
      rent_amount,
      payment_frequency,
      title,
      description,
      amenities,
      is_available,
    } = req.body;

    const images = req.files?.images || [];
    const video = req.files?.video?.[0] || null;
    const allowedTypes = [
      'apartment',
      'house',
      'duplex',
      'studio',
      'bungalow',
      'flat',
      'room',
    ];

    if (!allowedTypes.includes(property_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid property type',
      });
    }

    const parsedAmenities = (() => {
      if (!amenities) return [];
      if (Array.isArray(amenities)) return amenities;
      try {
        const parsed = JSON.parse(amenities);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return String(amenities)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    })();

    let resolvedStateId = state_id ? Number(state_id) : null;
    let resolvedStateName = state ? String(state).trim() : null;

    if (resolvedStateId && !resolvedStateName) {
      const stateLookup = await db.query(
        'SELECT state_name FROM states WHERE id = $1 LIMIT 1',
        [resolvedStateId]
      );
      resolvedStateName = stateLookup.rows[0]?.state_name || null;
    }

    if (!resolvedStateId && resolvedStateName) {
      const stateLookup = await db.query(
        'SELECT id, state_name FROM states WHERE LOWER(state_name) = LOWER($1) LIMIT 1',
        [resolvedStateName]
      );
      resolvedStateId = stateLookup.rows[0]?.id || null;
      resolvedStateName = stateLookup.rows[0]?.state_name || resolvedStateName;
    }

    if (!resolvedStateId || !resolvedStateName) {
      return res.status(400).json({
        success: false,
        message: 'State is required and must match a valid state',
      });
    }

    const finalAddress =
      full_address && String(full_address).trim()
        ? String(full_address).trim()
        : [area, city, resolvedStateName].filter(Boolean).join(', ');

    client = await db.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO properties (
         landlord_id, user_id, state, state_id, city, area, full_address,
         property_type, bedrooms, bathrooms,
         price, rent_amount, payment_frequency,
         title, description, amenities, is_available, is_verified, status, video_url
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
       )
      RETURNING *`,
      [
        landlordUserId,
        landlordUserId,
        resolvedStateName,
        resolvedStateId,
        city,
        area,
        finalAddress,
        property_type,
        Number(bedrooms) || 0,
        Number(bathrooms) || 0,
        rent_amount,
        rent_amount,
        payment_frequency || 'yearly',
        title,
        description,
        JSON.stringify(parsedAmenities),
        is_available === false || is_available === 'false' ? false : true,
        false,
        'pending',
        video ? video.path : null,
      ]
    );

    const property = result.rows[0];

    if (images.length) {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        await client.query(
          `INSERT INTO property_photos (property_id, photo_url, is_primary, upload_order)
           VALUES ($1, $2, $3, $4)`,
          [property.id, file.path, i === 0, i]
        );
      }
    }

    await client.query('COMMIT');

    // 🔥 Submit property URL to Google (non-blocking)
const propertyUrl = `${getFrontendUrl()}/properties/${property.id}`;

// Don't break your API if indexing fails
submitURL(propertyUrl).catch((err) =>
  console.error('Google indexing failed:', err.message)
);

    res.status(201).json({
      success: true,
      message: 'Property created and submitted for admin verification.',
      data: property,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create property',
    });
  } finally {
    if (client) client.release();
  }
};



// -----------------------------------------------------
// Upload Property Photos
// -----------------------------------------------------
exports.uploadPropertyPhotos = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one photo'
      });
    }

    const countResult = await db.query(
      'SELECT COUNT(*) FROM property_photos WHERE property_id = $1',
      [propertyId]
    );

    let currentCount = parseInt(countResult.rows[0].count);

    const photoPromises = req.files.map(async (file, index) => {
      const isPrimary = currentCount === 0 && index === 0;
      const uploadOrder = currentCount + index;

      return db.query(
        `INSERT INTO property_photos (property_id, photo_url, is_primary, upload_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [propertyId, file.path, isPrimary, uploadOrder]
      );
    });

    const results = await Promise.all(photoPromises);

    res.json({
      success: true,
      message: `${results.length} photo(s) uploaded successfully`,
      data: results.map(r => r.rows[0])
    });
  } catch (error) {
    console.error('Upload photos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload photos'
    });
  }
};


// -----------------------------------------------------
// Update Property
// -----------------------------------------------------
exports.updateProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    const updates = [];
    const params = [];
    let paramCount = 1;

    const allowedFields = [
      'state_id', 'city', 'area', 'full_address', 'property_type',
      'bedrooms', 'bathrooms', 'rent_amount', 'payment_frequency',
      'caution_deposit', 'title', 'description', 'amenities'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        params.push(
          field === 'amenities'
            ? JSON.stringify(req.body[field])
            : req.body[field]
        );
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(propertyId);

    const query = `
      UPDATE properties
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      message: 'Property updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property'
    });
  }
};


// -----------------------------------------------------
// Delete Property
// -----------------------------------------------------
exports.deleteProperty = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    const photosResult = await db.query(
      'SELECT photo_url FROM property_photos WHERE property_id = $1',
      [propertyId]
    );

    await db.query('DELETE FROM properties WHERE id = $1', [propertyId]);

    for (const photo of photosResult.rows) {
      try {
        const publicId = photo.photo_url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(
          `rental_platform/properties/${publicId}`
        );
      } catch (err) {
        console.error('Error deleting photo from cloudinary:', err);
      }
    }

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete property'
    });
  }
};


// -----------------------------------------------------
// Get Landlord Properties
// -----------------------------------------------------
exports.getMyProperties = async (req, res) => {
  try {
    const managerContext = await resolvePropertyManagerContext(req, res, {
      requiredPermission: 'can_manage_properties',
    });
    if (!managerContext) return;

    const landlordUserId = managerContext.landlordUserId;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.landlord_id = $1';
    const params = [landlordUserId];
    let paramCount = 2;

    if (status === 'available') {
      whereClause += ` AND p.is_available = TRUE`;
    } else if (status === 'unavailable') {
      whereClause += ` AND p.is_available = FALSE`;
    }

    const result = await db.query(
      `SELECT 
        p.*, s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) AS photo_count,
        (SELECT COUNT(*) FROM applications WHERE property_id = p.id) AS application_count,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM properties p ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get my properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
};


// -----------------------------------------------------
// Toggle Property Availability
// -----------------------------------------------------
exports.toggleAvailability = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE properties
       SET is_available = NOT is_available,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND landlord_id = $2
       RETURNING is_available`,
      [propertyId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: `Property ${
        result.rows[0].is_available ? 'activated' : 'deactivated'
      }`,
      data: { is_available: result.rows[0].is_available }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle availability'
    });
  }
};

// -----------------------------------------------------
// Unlist Property (Landlord)
// -----------------------------------------------------
exports.unlistProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND landlord_id = $2
       RETURNING id, is_available`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized',
      });
    }

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Property unlisted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Unlist property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlist property',
    });
  }
};


// -----------------------------------------------------
// Delete Property Photo
// -----------------------------------------------------
exports.deletePropertyPhoto = async (req, res) => {
  try {
    const { propertyId, photoId } = req.params;
    const userId = req.user.id;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    const photoResult = await db.query(
      'SELECT photo_url, is_primary FROM property_photos WHERE id = $1 AND property_id = $2',
      [photoId, propertyId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found'
      });
    }

    const photo = photoResult.rows[0];

    await db.query('DELETE FROM property_photos WHERE id = $1', [photoId]);

    if (photo.is_primary) {
      await db.query(
        `UPDATE property_photos
         SET is_primary = TRUE
         WHERE property_id = $1
         ORDER BY upload_order ASC
         LIMIT 1`,
        [propertyId]
      );
    }

    try {
      const publicId = photo.photo_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(
        `rental_platform/properties/${publicId}`
      );
    } catch (err) {
      console.error('Error deleting photo from cloudinary:', err);
    }

    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete photo'
    });
  }
};


// -----------------------------------------------------
// Property Statistics
// -----------------------------------------------------
exports.getPropertyStats = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    const stats = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM applications WHERE property_id = $1) AS total_applications,
        (SELECT COUNT(*) FROM applications WHERE property_id = $1 AND status = 'pending') AS pending_applications,
        (SELECT COUNT(*) FROM saved_properties WHERE property_id = $1) AS times_saved,
        (SELECT COUNT(*) FROM property_views WHERE property_id = $1) AS total_views,
        (SELECT AVG(rating) FROM reviews WHERE property_id = $1) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = $1) AS total_reviews,
        (SELECT COUNT(*) FROM messages WHERE property_id = $1) AS total_inquiries`,
      [propertyId]
    );

    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property statistics'
    });
  }
};


// =====================================================
//     DAMAGE REPORT — Save (Landlord)
// =====================================================
exports.analyzeDamagePhoto = async (req, res) => {
  try {
    const managerContext = await resolvePropertyManagerContext(req, res, {
      requiredPermission: 'can_manage_damage_reports',
    });
    if (!managerContext) return;

    const photoUrls = (req.files || [])
      .map((file) => file.path || file.secure_url || file.url)
      .filter(Boolean);

    if (!photoUrls.length) {
      return res.status(400).json({
        success: false,
        message: 'Please capture or upload at least one photo',
      });
    }

    const aiAnalysis = await analyzeDamagePhotoUrls(photoUrls);

    return res.json({
      success: true,
      data: {
        ai_analysis: aiAnalysis,
        photo_urls: photoUrls,
      },
    });
  } catch (error) {
    console.error('Analyze damage photo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze damage photo',
    });
  }
};

exports.saveDamageReport = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const managerContext = await resolvePropertyManagerContext(req, res, {
      propertyId,
      requiredPermission: 'can_manage_damage_reports',
    });
    if (!managerContext) return;

    const landlordId = managerContext.landlordUserId;
    const {
      room_location,   // e.g. "Living Room", "Master Bedroom"
      damage_type,     // scratch | crack | hole | dent | stain | other
      description,
      width_cm,
      height_cm,
      depth_level,     // surface | shallow | deep | structural
      severity,        // minor | moderate | severe
      ai_analysis,
    } = req.body;

    // Ensure damage_reports table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS property_damage_reports (
        id              SERIAL PRIMARY KEY,
        property_id     INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        landlord_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_location   VARCHAR(100),
        damage_type     VARCHAR(50),
        description     TEXT,
        width_cm        NUMERIC(8,2),
        height_cm       NUMERIC(8,2),
        depth_level     VARCHAR(20),
        severity        VARCHAR(20),
        photo_urls      JSONB DEFAULT '[]',
        ai_analysis     JSONB,
        reported_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_depth CHECK (depth_level IN ('surface','shallow','deep','structural')),
        CONSTRAINT chk_severity CHECK (severity IN ('minor','moderate','severe'))
      );
      CREATE INDEX IF NOT EXISTS idx_damage_reports_property ON property_damage_reports(property_id);
    `);

    // Collect uploaded photo URLs (via cloudinary)
    const photoUrls = (req.files || []).map(f => f.path || f.secure_url || f.url).filter(Boolean);

    // Call Claude Vision API for AI analysis if photos were uploaded
    let aiAnalysis = null;

    if (ai_analysis) {
      try {
        aiAnalysis =
          typeof ai_analysis === 'string' ? JSON.parse(ai_analysis) : ai_analysis;
      } catch (error) {
        console.error('Failed to parse submitted AI analysis:', error.message);
      }
    }

    if (!aiAnalysis) {
      aiAnalysis = await analyzeDamagePhotoUrls(photoUrls);
    }

    // Save damage report
    const result = await db.query(
      `INSERT INTO property_damage_reports
         (property_id, landlord_id, room_location, damage_type, description,
          width_cm, height_cm, depth_level, severity, photo_urls, ai_analysis)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        propertyId,
        landlordId,
        room_location || null,
        aiAnalysis?.damage_type || damage_type || null,
        aiAnalysis?.description || description || null,
        aiAnalysis?.estimated_width_cm || width_cm || null,
        aiAnalysis?.estimated_height_cm || height_cm || null,
        aiAnalysis?.depth_level || depth_level || null,
        aiAnalysis?.severity || severity || null,
        JSON.stringify(photoUrls),
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Damage report saved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Save damage report error:', error);
    res.status(500).json({ success: false, message: 'Failed to save damage report' });
  }
};


// =====================================================
//     DAMAGE REPORTS — Get All for a Property
// =====================================================
exports.getDamageReports = async (req, res) => {
  try {
    const { propertyId } = req.params;

    const result = await db.query(
      `SELECT dr.*, u.full_name AS landlord_name
       FROM property_damage_reports dr
       JOIN users u ON dr.landlord_id = u.id
       WHERE dr.property_id = $1
       ORDER BY dr.reported_at DESC`,
      [propertyId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get damage reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch damage reports' });
  }
};


// Helper function to map bank name to Paystack bank code
const getBankCode = (bankName) => {
  const bankMap = {
    'Access Bank': '044',
    'Citibank Nigeria': '023',
    'Ecobank Nigeria': '050',
    'Fidelity Bank': '070',
    'First Bank of Nigeria': '011',
    'First City Monument Bank (FCMB)': '214',
    'Globus Bank': '00103',
    'Guaranty Trust Bank (GTBank)': '058',
    'Heritage Bank': '030',
    'Keystone Bank': '082',
    'Kuda Bank': '50211',
    'Moniepoint Microfinance Bank': '50515',
    'OPay': '999992',
    'PalmPay': '999991',
    'Parallex Bank': '104',
    'Polaris Bank': '076',
    'Providus Bank': '101',
    'Stanbic IBTC Bank': '221',
    'Standard Chartered Bank': '068',
    'Sterling Bank': '232',
    'SunTrust Bank': '100',
    'Taj Bank': '302',
    'Titan Trust Bank': '102',
    'Union Bank of Nigeria': '032',
    'United Bank for Africa (UBA)': '033',
    'Unity Bank': '215',
    'VFD Microfinance Bank': '566',
    'Wema Bank': '035',
    'Zenith Bank': '057'
  };
  
  return bankMap[bankName];
};

// Verify bank account for withdrawals
exports.verifyBankAccount = async (req, res) => {
  try {
    const { bank_name, account_number } = req.body;
    
    if (!bank_name || !account_number) {
      return res.status(400).json({
        success: false,
        message: 'Bank name and account number are required'
      });
    }

    // Validate account number format
    if (!/^\d{10}$/.test(account_number)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be 10 digits'
      });
    }

    // Map Nigerian bank name to bank code
    const bankCode = getBankCode(bank_name);
    
    if (!bankCode) {
      return res.status(400).json({
        success: false,
        message: 'Selected bank is not supported for verification'
      });
    }

    
    // Call Paystack API to verify account
    const response = await fetch('https://api.paystack.co/bank/resolve', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        account_number: account_number,
        bank_code: bankCode
      })
    });

    const data = await response.json();
    
    if (data.status && data.data) {
      return res.json({
        success: true,
        data: {
          account_name: data.data.account_name,
          account_number: account_number,
          bank_name: bank_name
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: data.message || 'Unable to verify account number'
      });
    }
  } catch (error) {
    console.error('Error verifying bank account:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify account. Please try again later.'
    });
  }
};

// Export All Handlers
module.exports = exports;
