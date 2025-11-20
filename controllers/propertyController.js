const pool = require('../config/database'); const { validationResult } = require('express-validator'); const { cloudinary } = require('../middleware/upload');

// ============ PUBLIC ENDPOINTS ============

// Get all Nigerian states exports.getAllStates = async (req, res) => { try { const result = await pool.query( 'SELECT * FROM states ORDER BY state_name ASC' );

res.json({
  success: true,
  data: result.rows
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch states' }); } };

// Browse properties (limited info) exports.browseProperties = async (req, res) => { try { const { page = 1, limit = 20 } = req.query; const offset = (page - 1) * limit;

const result = await pool.query(
  `SELECT 
     p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
     p.rent_amount, p.payment_frequency, p.city, p.area,
     p.featured, p.created_at,
     s.state_name, s.state_code,
     (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
     (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) as photo_count,
     (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating,
     (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) as review_count
   FROM properties p
   JOIN states s ON p.state_id = s.id
   WHERE p.is_available = TRUE 
     AND p.is_verified = TRUE
     AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)
   ORDER BY p.featured DESC, p.created_at DESC
   LIMIT $1 OFFSET $2`,
  [limit, offset]
);

// Get total count
const countResult = await pool.query(
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

} catch (error) { console.error('Browse properties error:', error); res.status(500).json({ success: false, message: 'Failed to fetch properties' }); } };

// Get featured properties exports.getFeaturedProperties = async (req, res) => { try { const { limit = 10 } = req.query;

const result = await pool.query(
  `SELECT 
     p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
     p.rent_amount, p.payment_frequency, p.city, p.area,
     p.created_at,
     s.state_name, s.state_code,
     (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
     (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating
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
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch featured properties' }); } };

// Search properties with filters exports.searchProperties = async (req, res) => { try { const { state_id, city, property_type, min_price, max_price, bedrooms, bathrooms, amenities, page = 1, limit = 20, sort_by = 'created_at', sort_order = 'DESC' } = req.query;

const offset = (page - 1) * limit;
const params = [];
let paramCount = 1;
let whereConditions = [
  'p.is_available = TRUE',
  'p.is_verified = TRUE',
  '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)'
];

// State filter
if (state_id) {
  whereConditions.push(`p.state_id = $${paramCount}`);
  params.push(state_id);
  paramCount++;
}

// City filter
if (city) {
  whereConditions.push(`LOWER(p.city) LIKE LOWER($${paramCount})`);
  params.push(`%${city}%`);
  paramCount++;
}

// Property type filter
if (property_type) {
  whereConditions.push(`p.property_type = $${paramCount}`);
  params.push(property_type);
  paramCount++;
}

// Price range filter
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

// Bedrooms filter
if (bedrooms) {
  whereConditions.push(`p.bedrooms >= $${paramCount}`);
  params.push(bedrooms);
  paramCount++;
}

// Bathrooms filter
if (bathrooms) {
  whereConditions.push(`p.bathrooms >= $${paramCount}`);
  params.push(bathrooms);
  paramCount++;
}

// Amenities filter (JSON array contains)
if (amenities) {
  const amenitiesArray = Array.isArray(amenities) ? amenities : [amenities];
  whereConditions.push(`p.amenities @> $${paramCount}::jsonb`);
  params.push(JSON.stringify(amenitiesArray));
  paramCount++;
}

// Validate sort_by to prevent SQL injection
const validSortFields = ['created_at', 'rent_amount', 'bedrooms'];
const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

const query = `
  SELECT 
    p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
    p.rent_amount, p.payment_frequency, p.city, p.area,
    p.amenities, p.featured, p.created_at,
    s.state_name, s.state_code,
    (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
    (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) as photo_count,
    (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating,
    (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) as review_count
  FROM properties p
  JOIN states s ON p.state_id = s.id
  WHERE ${whereConditions.join(' AND ')}
  ORDER BY p.featured DESC, p.${sortField} ${sortDirection}
  LIMIT $${paramCount} OFFSET $${paramCount + 1}
`;

params.push(limit, offset);

const result = await pool.query(query, params);

// Get total count with same filters
const countQuery = `
  SELECT COUNT(*) 
  FROM properties p
  WHERE ${whereConditions.join(' AND ')}
`;
const countResult = await pool.query(countQuery, params.slice(0, -2));

res.json({
  success: true,
  data: result.rows,
  pagination: {
    page: parseInt(page),
    limit: parseInt(limit),
    total: parseInt(countResult.rows[0].count)
  },
  filters_applied: {
    state_id,
    city,
    property_type,
    min_price,
    max_price,
    bedrooms,
    bathrooms,
    amenities
  }
});

} catch (error) { console.error('Search properties error:', error); res.status(500).json({ success: false, message: 'Failed to search properties' }); } };

// Get property by ID (limited info) exports.getPropertyById = async (req, res) => { try { const { propertyId } = req.params;

const result = await pool.query(
  `SELECT 
     p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
     p.rent_amount, p.payment_frequency, p.city, p.area,
     p.description, p.amenities, p.featured, p.created_at,
     s.state_name, s.state_code,
     (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating,
     (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) as review_count
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

// Get photos
const photosResult = await pool.query(
  `SELECT id, photo_url, is_primary, upload_order 
   FROM property_photos 
   WHERE property_id = $1 
   ORDER BY is_primary DESC, upload_order ASC`,
  [propertyId]
);

const property = result.rows[0];
property.photos = photosResult.rows;
property.requires_subscription = true; // Flag that full details need subscription

res.json({
  success: true,
  data: property,
  message: 'Subscribe to view landlord contact and full address'
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch property' }); } };

// ============ TENANT ENDPOINTS ============

// Get full property details (requires subscription) exports.getFullPropertyDetails = async (req, res) => { try { const { propertyId } = req.params;

const result = await pool.query(
  `SELECT 
     p.*,
     s.state_name, s.state_code,
     u.id as landlord_id, u.full_name as landlord_name, 
     u.email as landlord_email, u.phone as landlord_phone,
     u.identity_verified as landlord_verified,
     (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating,
     (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) as review_count
   FROM properties p
   JOIN states s ON p.state_id = s.id
   JOIN users u ON p.landlord_id = u.id
   WHERE p.id = $1 AND p.is_available = TRUE AND p.is_verified = TRUE`,
  [propertyId]
);

if (result.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found or not available'
  });
}

// Get photos
const photosResult = await pool.query(
  `SELECT id, photo_url, is_primary, upload_order 
   FROM property_photos 
   WHERE property_id = $1 
   ORDER BY is_primary DESC, upload_order ASC`,
  [propertyId]
);

const property = result.rows[0];
property.photos = photosResult.rows;

// Track view (for analytics)
await pool.query(
  `INSERT INTO property_views (property_id, viewer_id, viewed_at)
   VALUES ($1, $2, CURRENT_TIMESTAMP)
   ON CONFLICT DO NOTHING`,
  [propertyId, req.user.id]
).catch(() => {}); // Ignore if table doesn't exist yet

res.json({
  success: true,
  data: property
});
} catch (error) { console.error('Get full property details error:', error); res.status(500).json({ success: false, message: 'Failed to fetch property details' }); } };

// Save/favorite property exports.saveProperty = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

await pool.query(
  `INSERT INTO saved_properties (tenant_id, property_id)
   VALUES ($1, $2)
   ON CONFLICT (tenant_id, property_id) DO NOTHING`,
  [userId, propertyId]
);

res.json({
  success: true,
  message: 'Property saved to favorites'
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to save property' }); } };

// Unsave property exports.unsaveProperty = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

await pool.query(
  'DELETE FROM saved_properties WHERE tenant_id = $1 AND property_id = $2',
  [userId, propertyId]
);

res.json({
  success: true,
  message: 'Property removed from favorites'
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to unsave property' }); } };

// Get saved properties exports.getSavedProperties = async (req, res) => { try { const userId = req.user.id; const { page = 1, limit = 20 } = req.query; const offset = (page - 1) * limit;

const result = await pool.query(
  `SELECT 
     p.id, p.title, p.property_type, p.bedrooms, p.bathrooms,
     p.rent_amount, p.payment_frequency, p.city, p.area, p.featured, p.created_at, sp.created_at as saved_at, s.state_name, s.state_code, (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo, (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating FROM saved_properties sp JOIN properties p ON sp.property_id = p.id JOIN states s ON p.state_id = s.id WHERE sp.tenant_id = $1 ORDER BY sp.created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset] );

// Get total count
const countResult = await pool.query(
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
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch saved properties' }); } };

// Add review exports.addReview = async (req, res) => { try { const errors = validationResult(req); if (!errors.isEmpty()) { return res.status(400).json({ success: false, errors: errors.array() }); }

const { propertyId } = req.params;
const userId = req.user.id;
const { rating, review_text } = req.body;

// Check if property exists
const propertyCheck = await pool.query(
  'SELECT id FROM properties WHERE id = $1',
  [propertyId]
);

if (propertyCheck.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found'
  });
}

// Insert or update review
const result = await pool.query(
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
} catch (error) { res.status(500).json({ success: false, message: 'Failed to add review' }); } };

// Get property reviews exports.getPropertyReviews = async (req, res) => { try { const { propertyId } = req.params; const { page = 1, limit = 10 } = req.query; const offset = (page - 1) * limit;

const result = await pool.query(
  `SELECT 
     r.id, r.rating, r.review_text, r.created_at,
     u.full_name as reviewer_name
   FROM reviews r
   JOIN users u ON r.tenant_id = u.id
   WHERE r.property_id = $1
   ORDER BY r.created_at DESC
   LIMIT $2 OFFSET $3`,
  [propertyId, limit, offset]
);

// Get average rating
const avgResult = await pool.query(
  `SELECT 
     AVG(rating) as avg_rating,
     COUNT(*) as total_reviews
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
} catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch reviews' }); } };

// ============ LANDLORD ENDPOINTS ============

// Create new property exports.createProperty = async (req, res) => { try { const errors = validationResult(req); if (!errors.isEmpty()) { return res.status(400).json({ success: false, errors: errors.array() }); }

const userId = req.user.id;
const {
  state_id,
  city,
  area,
  full_address,
  property_type,
  bedrooms,
  bathrooms,
  rent_amount,
  payment_frequency,
  caution_deposit,
  title,
  description,
  amenities
} = req.body;

// Verify state exists
const stateCheck = await pool.query(
  'SELECT id FROM states WHERE id = $1',
  [state_id]
);

if (stateCheck.rows.length === 0) {
  return res.status(400).json({
    success: false,
    message: 'Invalid state ID'
  });
}

// Create property
const result = await pool.query(
  `INSERT INTO properties (
     landlord_id, state_id, city, area, full_address,
     property_type, bedrooms, bathrooms, rent_amount,
     payment_frequency, caution_deposit, title, description, amenities
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
   RETURNING *`,
  [
    userId, state_id, city, area, full_address,
    property_type, bedrooms, bathrooms, rent_amount,
    payment_frequency, caution_deposit || null, title, description,
    JSON.stringify(amenities || [])
  ]
);

const property = result.rows[0];

res.status(201).json({
  success: true,
  message: 'Property created successfully. Please upload photos and make payment to activate listing.',
  data: property
});
} catch (error) { console.error('Create property error:', error); res.status(500).json({ success: false, message: 'Failed to create property', error: error.message }); } };

// Upload property photos exports.uploadPropertyPhotos = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

// Verify property belongs to landlord
const propertyCheck = await pool.query(
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

// Get current photo count
const countResult = await pool.query(
  'SELECT COUNT(*) FROM property_photos WHERE property_id = $1',
  [propertyId]
);
let currentCount = parseInt(countResult.rows[0].count);

// Insert photos
const photoPromises = req.files.map(async (file, index) => {
  const isPrimary = currentCount === 0 && index === 0; // First photo is primary
  const uploadOrder = currentCount + index;

  return pool.query(
    `INSERT INTO property_photos (property_id, photo_url, is_primary, upload_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [propertyId, file.path, isPrimary, uploadOrder]
  );
});

const results = await Promise.all(photoPromises);
const uploadedPhotos = results.map(r => r.rows[0]);

res.json({
  success: true,
  message: `${uploadedPhotos.length} photo(s) uploaded successfully`,
  data: uploadedPhotos
});
} catch (error) { console.error('Upload photos error:', error); res.status(500).json({ success: false, message: 'Failed to upload photos' }); } };

// Update property exports.updateProperty = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

// Verify property belongs to landlord
const propertyCheck = await pool.query(
  'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
  [propertyId, userId]
);

if (propertyCheck.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found or unauthorized'
  });
}

const {
  state_id,
  city,
  area,
  full_address,
  property_type,
  bedrooms,
  bathrooms,
  rent_amount,
  payment_frequency,
  caution_deposit,
  title,
  description,
  amenities
} = req.body;

const updates = [];
const params = [];
let paramCount = 1;

if (state_id !== undefined) {
  updates.push(`state_id = $${paramCount}`);
  params.push(state_id);
  paramCount++;
}
if (city !== undefined) {
  updates.push(`city = $${paramCount}`);
  params.push(city);
  paramCount++;
}
if (area !== undefined) {
  updates.push(`area = $${paramCount}`);
  params.push(area);
  paramCount++;
}
if (full_address !== undefined) {
  updates.push(`full_address = $${paramCount}`);
  params.push(full_address);
  paramCount++;
}
if (property_type !== undefined) {
  updates.push(`property_type = $${paramCount}`);
  params.push(property_type);
  paramCount++;
}
if (bedrooms !== undefined) {
  updates.push(`bedrooms = $${paramCount}`);
  params.push(bedrooms);
  paramCount++;
}
if (bathrooms !== undefined) {
  updates.push(`bathrooms = $${paramCount}`);
  params.push(bathrooms);
  paramCount++;
}
if (rent_amount !== undefined) {
  updates.push(`rent_amount = $${paramCount}`);
  params.push(rent_amount);
  paramCount++;
}
if (payment_frequency !== undefined) {
  updates.push(`payment_frequency = $${paramCount}`);
  params.push(payment_frequency);
  paramCount++;
}
if (caution_deposit !== undefined) {
  updates.push(`caution_deposit = $${paramCount}`);
  params.push(caution_deposit);
  paramCount++;
}
if (title !== undefined) {
  updates.push(`title = $${paramCount}`);
  params.push(title);
  paramCount++;
}
if (description !== undefined) {
  updates.push(`description = $${paramCount}`);
  params.push(description);
  paramCount++;
}
if (amenities !== undefined) {
  updates.push(`amenities = $${paramCount}`);
  params.push(JSON.stringify(amenities));
  paramCount++;
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

const result = await pool.query(query, params);

res.json({
  success: true,
  message: 'Property updated successfully',
  data: result.rows[0]
});
} catch (error) { console.error('Update property error:', error); res.status(500).json({ success: false, message: 'Failed to update property' }); } };

// Delete property exports.deleteProperty = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

// Verify property belongs to landlord
const propertyCheck = await pool.query(
  'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
  [propertyId, userId]
);

if (propertyCheck.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found or unauthorized'
  });
}

// Get photos to delete from cloudinary
const photosResult = await pool.query(
  'SELECT photo_url FROM property_photos WHERE property_id = $1',
  [propertyId]
);

// Delete from database (cascade will delete photos and related records)
await pool.query('DELETE FROM properties WHERE id = $1', [propertyId]);

// Delete photos from Cloudinary
for (const photo of photosResult.rows) {
  try {
    const publicId = photo.photo_url.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`rental_platform/properties/${publicId}`);
  } catch (err) {
    console.error('Error deleting photo from cloudinary:', err);
  }
}

res.json({
  success: true,
  message: 'Property deleted successfully'
});
} catch (error) { console.error('Delete property error:', error); res.status(500).json({ success: false, message: 'Failed to delete property' }); } };

// Get landlord's properties exports.getMyProperties = async (req, res) => { try { const userId = req.user.id; const { page = 1, limit = 20, status } = req.query; const offset = (page - 1) * limit;

let whereClause = 'WHERE p.landlord_id = $1';
const params = [userId];
let paramCount = 2;

if (status === 'available') {
  whereClause += ` AND p.is_available = TRUE`;
} else if (status === 'unavailable') {
  whereClause += ` AND p.is_available = FALSE`;
}

const result = await pool.query(
  `SELECT 
     p.*, s.state_name, s.state_code,
     (SELECT photo_url FROM property_photos WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) as primary_photo,
     (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) as photo_count,
     (SELECT COUNT(*) FROM applications WHERE property_id = p.id) as application_count,
     (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) as avg_rating,
     (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) as review_count
   FROM properties p
   JOIN states s ON p.state_id = s.id
   ${whereClause}
   ORDER BY p.created_at DESC
   LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
  [...params, limit, offset]
);

// Get total count
const countResult = await pool.query(
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
} catch (error) { console.error('Get my properties error:', error); res.status(500).json({ success: false, message: 'Failed to fetch properties' }); } };

// Toggle property availability exports.toggleAvailability = async (req, res) => { try { const { propertyId } = req.params; const userId = req.user.id;

const result = await pool.query(
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
  message: `Property ${result.rows[0].is_available ? 'activated' : 'deactivated'}`,
  data: { is_available: result.rows[0].is_available }
});
} catch (error) { res.status(500).json({ success: false, message: 'Failed to toggle availability' }); } };

// Delete property photo exports.deletePropertyPhoto = async (req, res) => { try { const { propertyId, photoId } = req.params; const userId = req.user.id;

// Verify property belongs to landlord
const propertyCheck = await pool.query(
  'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
  [propertyId, userId]
);

if (propertyCheck.rows.length === 0) {
  return res.status(404).json({
    success: false,
    message: 'Property not found or unauthorized'
  });
}

// Get photo info
const photoResult = await pool.query(
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

// Delete from database
await pool.query('DELETE FROM property_photos WHERE id = $1', [photoId]);

// If it was primary, set another photo as primary
if (photo.is_primary) {
  await pool.query(
    `UPDATE property_photos 
     SET is_primary = TRUE 
     WHERE property_id = $1 
     ORDER BY upload_order ASC 
     LIMIT 1`,
    [propertyId]
  );
}

// Delete from Cloudinary
try {
  const publicId = photo.photo_url.split('/').pop().split('.')[0];
  await cloudinary.uploader.destroy(`rental_platform/properties/${publicId}`);
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

// Get property statistics (for landlord)
exports.getPropertyStats = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;

    // Verify property belongs to landlord
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or unauthorized'
      });
    }

    // Get various statistics
    const stats = await pool.query(
      `SELECT 
         (SELECT COUNT(*) FROM applications WHERE property_id = $1) as total_applications,
         (SELECT COUNT(*) FROM applications WHERE property_id = $1 AND status = 'pending') as pending_applications,
         (SELECT COUNT(*) FROM saved_properties WHERE property_id = $1) as times_saved,
         (SELECT COUNT(*) FROM property_views WHERE property_id = $1) as total_views,
         (SELECT AVG(rating) FROM reviews WHERE property_id = $1) as avg_rating,
         (SELECT COUNT(*) FROM reviews WHERE property_id = $1) as total_reviews,
         (SELECT COUNT(*) FROM messages WHERE property_id = $1) as total_inquiries`,
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

module.exports = exports;