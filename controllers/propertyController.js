// ====================== IMPORTS ======================
const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const { cloudinary } = require('../config/middleware/upload');
let propertySchemaReady = false;

const ensurePropertySchema = async () => {
  if (propertySchemaReady) return;
  await db.query(`
    ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS video_url VARCHAR(500);
  `);
  propertySchemaReady = true;
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
      state_id,
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

    // State Filter
    if (state_id) {
      whereConditions.push(`p.state_id = $${paramCount}`);
      params.push(state_id);
      paramCount++;
    }

    // City Filter
    if (city) {
      whereConditions.push(`LOWER(p.city) LIKE LOWER($${paramCount})`);
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
    property.requires_subscription = true;

    res.json({
      success: true,
      data: property,
      message: 'Subscribe to view landlord contact and full address'
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
      [propertyId, req.user.id]
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
      ORDER BY sp.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM saved_properties WHERE tenant_id = $1',
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

    const userId = req.user.id;

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
    if (!resolvedStateId && state) {
      const stateLookup = await db.query(
        'SELECT id FROM states WHERE LOWER(state_name) = LOWER($1) LIMIT 1',
        [String(state).trim()]
      );
      resolvedStateId = stateLookup.rows[0]?.id || null;
    }

    if (!resolvedStateId) {
      return res.status(400).json({
        success: false,
        message: 'State is required and must match a valid state',
      });
    }

    const finalAddress =
      full_address && String(full_address).trim()
        ? String(full_address).trim()
        : [area, city, state].filter(Boolean).join(', ');

    client = await db.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO properties (
         landlord_id, state_id, city, area, full_address,
         property_type, bedrooms, bathrooms,
         rent_amount, payment_frequency,
         title, description, amenities, is_available, video_url
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       )
       RETURNING *`,
      [
        userId,
        resolvedStateId,
        city,
        area,
        finalAddress,
        property_type,
        Number(bedrooms) || 0,
        Number(bathrooms) || 0,
        rent_amount,
        payment_frequency || 'yearly',
        title,
        description,
        JSON.stringify(parsedAmenities),
        is_available === false || is_available === 'false' ? false : true,
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
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.landlord_id = $1';
    const params = [userId];
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


// Export All Handlers
module.exports = exports;
