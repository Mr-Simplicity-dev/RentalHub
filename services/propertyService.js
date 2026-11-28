const logger=require('../config/utils/logger');
// ====================== IMPORTS ======================
const db = require('../config/middleware/database');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { cloudinary } = require('../config/middleware/upload');

const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { getPropertyDisputeParticipants } = require('../config/utils/propertyDisputeParticipants');
const { getPropertyManagerContext } = require('../config/utils/agentSystem');
const { resolveLocationSelection } = require('../config/utils/locationDirectory');
const { resolveTenantPropertyLocationAccess } = require('../config/utils/tenantLocationAccess');
const { statesMatch } = require('../config/utils/stateScope');
const { validateStructuredFeatures } = require('../config/utils/propertyFeatureSchema');
const { resolveParkingSpaces, syncStructuredParking } = require('../config/utils/parkingInfo');
const { getTenantPropertyUnlock } = require('../config/utils/propertyEntitlement');
const {
  CAPTURE_TICKET_TTL_MS,
  consumeCaptureTickets,
  getCommittedClipRetry,
  getCommittedPhotoRetry,
  hashCaptureToken,
  issueCaptureTicket,
  lockCaptureTickets,
} = require('./propertyCaptureTicketService');
let propertySchemaReady = false;

// Ownership gate: when the super admin enables require_property_ownership_verification,
// unverified listings are hidden from public browse/search/featured. Returns false
// when the gate is off, the enable timestamp when on (for grandfathering), or null
// when on but no timestamp is recorded yet (hide all unverified).
const getOwnershipGateEnabledAt = async () => {
  try {
    const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
    const flags = await getFeatureFlagsMap();
    if (!flags.require_property_ownership_verification) return false;
    const { rows } = await db.query(
      `SELECT ownership_gate_enabled_at FROM feature_flags WHERE key = 'require_property_ownership_verification'`
    );
    return rows[0]?.ownership_gate_enabled_at || null;
  } catch {
    return false;
  }
};

const applyOwnershipGate = (whereConditions, params, paramCountRef, gateEnabledAt) => {
  if (gateEnabledAt === false) return paramCountRef;
  if (gateEnabledAt) {
    whereConditions.push(`(p.ownership_verification_status = 'verified' OR p.created_at <= $${paramCountRef})`);
    params.push(gateEnabledAt);
    return paramCountRef + 1;
  }
  whereConditions.push(`p.ownership_verification_status = 'verified'`);
  return paramCountRef;
};

const parsePropertyImageCaptureTokens = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

/** Optional shot keys sent alongside clips, e.g. ["sitting_room","kitchen"]. */
const parseClipShotKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

const parseCoordinate = (value, min, max) => {
  if (value === undefined || value === null || value === '') return null;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) {
    return null;
  }

  return numericValue;
};

const createSubmissionFingerprint = (body, imageTokens, imageCount) => {
  const fields = [
    'state_id',
    'state',
    'lga_name',
    'city',
    'area',
    'full_address',
    'latitude',
    'longitude',
    'property_type',
    'bedrooms',
    'bathrooms',
    'parking_spaces',
    'rent_amount',
    'payment_frequency',
    'title',
    'description',
    'amenities',
    'is_available',
    'structured_features',
  ];
  const submission = fields.reduce((result, field) => {
    const value = body[field];
    result[field] = value === undefined || value === null ? '' : String(value).trim();
    return result;
  }, {});
  submission.image_tokens = imageTokens.map(hashCaptureToken);
  submission.image_count = imageCount;
  return crypto.createHash('sha256').update(JSON.stringify(submission)).digest('hex');
};

const sanitizeSubmittedProperty = (property) => {
  const safeProperty = { ...property };
  delete safeProperty.submission_key;
  delete safeProperty.submission_fingerprint;
  return safeProperty;
};

const cleanupUploadedPropertyMedia = async (files, context) => {
  for (const file of files) {
    const publicId = file.filename || file.public_id;
    if (!publicId) {
      logger.error('Uploaded property media could not be cleaned up because its public ID is missing.', {
        context,
        mimetype: file.mimetype,
      });
      continue;
    }

    try {
      const resourceType = String(file.mimetype || '').startsWith('video/') ? 'video' : 'image';
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      if (result?.result && !['ok', 'not found'].includes(result.result)) {
        logger.error('Uploaded property media cleanup did not complete.', {
          context,
          publicId,
          result: result.result,
        });
      }
    } catch (error) {
      logger.error('Uploaded property media cleanup failed.', {
        context,
        publicId,
        error: error.message,
      });
    }
  }
};

const ensurePropertySchema = async () => {
  if (propertySchemaReady) return;
  await db.query(`
    ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS full_address TEXT,
    ADD COLUMN IF NOT EXISTS video_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS lga_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
    ADD COLUMN IF NOT EXISTS parking_spaces INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS structured_features JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS video_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS submission_key VARCHAR(80),
    ADD COLUMN IF NOT EXISTS submission_fingerprint VARCHAR(64);

    ALTER TABLE property_photos
    ADD COLUMN IF NOT EXISTS upload_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS capture_token_hash VARCHAR(64);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_landlord_submission_key
      ON properties (landlord_id, submission_key)
      WHERE submission_key IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_property_photos_capture_token
      ON property_photos (capture_token_hash)
      WHERE capture_token_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS property_capture_tickets (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      consumed_for_property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_property_capture_tickets_user_expiry
      ON property_capture_tickets (user_id, expires_at)
      WHERE consumed_at IS NULL;

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

    CREATE TABLE IF NOT EXISTS property_clips (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      clip_url VARCHAR(1000) NOT NULL,
      clip_order INTEGER NOT NULL DEFAULT 0,
      shot_key VARCHAR(60),
      duration_seconds NUMERIC(6,2),
      capture_token_hash VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE property_clips
      ADD COLUMN IF NOT EXISTS capture_token_hash VARCHAR(64);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_property_clips_capture_token
      ON property_clips (capture_token_hash)
      WHERE capture_token_hash IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_property_clips_property
      ON property_clips(property_id, clip_order ASC, id ASC);
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

const buildTenantLocationAccessResponse = (res, access) =>
  res.status(access.statusCode || 402).json({
    success: false,
    payment_required: access.payment_required === true,
    code: access.code || 'LOCATION_ACCESS_PAYMENT_REQUIRED',
    message: access.message,
    data: {
      amount: access.quote?.amount,
      base_amount: access.quote?.base_amount,
      rule_scope: access.quote?.rule_scope,
      access_days: access.quote?.access_days,
      location: access.location,
      home_location: {
        state_id: access.profile?.preferred_state_id,
        state_name: access.profile?.state_name,
        lga_name: access.profile?.preferred_lga_name,
      },
    },
  });

const resolveStateIdFromQueryState = async (state) => {
  const rawState = String(state || '').trim();
  if (!rawState) return null;

  const result = await db.query(
    `SELECT id
     FROM states
     WHERE LOWER(state_name) = LOWER($1)
        OR LOWER(state_code) = LOWER($1)
     LIMIT 1`,
    [rawState]
  );

  return result.rows[0]?.id || null;
};

const addTenantLocationScope = async ({
  req,
  res,
  whereConditions,
  params,
  paramCount,
  requestedStateId = null,
  requestedState = null,
  requestedLgaName = null,
}) => {
  if (req.user?.user_type !== 'tenant') {
    return { blocked: false, paramCount };
  }

  const stateId =
    requestedStateId ||
    (await resolveStateIdFromQueryState(requestedState));

  let access;
  try {
    access = await resolveTenantPropertyLocationAccess({
      tenantId: req.user.id,
      requestedStateId: stateId,
      requestedLgaName,
    });
  } catch (error) {
    return {
      blocked: true,
      response: () =>
        res.status(error.statusCode || 500).json({
          success: false,
          code: error.code || 'TENANT_LOCATION_ACCESS_ERROR',
          message: error.message || 'Failed to resolve tenant location access',
        }),
    };
  }

  if (!access.allowed) {
    return {
      blocked: true,
      response: () => buildTenantLocationAccessResponse(res, access),
    };
  }

  whereConditions.push(`p.state_id = $${paramCount}`);
  params.push(access.location.state_id);
  paramCount++;

  if (access.location.lga_name) {
    whereConditions.push(`(
      LOWER(COALESCE(p.lga_name, '')) = LOWER($${paramCount}) OR
      LOWER(COALESCE(p.city, '')) = LOWER($${paramCount}) OR
      LOWER(COALESCE(p.area, '')) = LOWER($${paramCount})
    )`);
    params.push(access.location.lga_name);
    paramCount++;
  }

  return { blocked: false, paramCount, access };
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
    logger.error('AI damage analysis error:', error.message);
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

    let rows = result?.rows || [];
    if (rows.length === 0) {
      const nigeriaLocations = require('../data/nigeriaLocations');
      rows = nigeriaLocations.map((entry, idx) => ({
        id: idx + 1,
        state_name: entry.displayName || entry.state,
        state_code: entry.slug || String(entry.state || '').toLowerCase(),
      }));
    }

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    const nigeriaLocations = require('../data/nigeriaLocations');
    const fallbackRows = nigeriaLocations.map((entry, idx) => ({
      id: idx + 1,
      state_name: entry.displayName || entry.state,
      state_code: entry.slug || String(entry.state || '').toLowerCase(),
    }));
    res.json({
      success: true,
      data: fallbackRows,
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
    const params = [];
    let paramCount = 1;
    const whereConditions = [
      'p.is_available = TRUE',
      'p.is_verified = TRUE',
      '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)',
    ];

    const tenantScope = await addTenantLocationScope({
      req,
      res,
      whereConditions,
      params,
      paramCount,
    });

    if (tenantScope.blocked) {
      return tenantScope.response();
    }

    paramCount = tenantScope.paramCount;

    const gateEnabledAt = await getOwnershipGateEnabledAt();
    paramCount = applyOwnershipGate(whereConditions, params, paramCount, gateEnabledAt);

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
        p.rent_amount, p.payment_frequency, p.city, p.area, p.lga_name,
        p.amenities, p.structured_features, p.featured, p.created_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT COUNT(*) FROM property_photos WHERE property_id = p.id) AS photo_count,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE property_id = p.id) AS review_count
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.featured DESC, p.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM properties p
       JOIN states s ON p.state_id = s.id
       WHERE ${whereConditions.join(' AND ')}`,
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
    req.logger.error('Browse properties error:', error);
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
    const params = [];
    let paramCount = 1;
    const whereConditions = [
      'p.is_available = TRUE',
      'p.is_verified = TRUE',
      'p.featured = TRUE',
      '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)',
    ];

    const tenantScope = await addTenantLocationScope({
      req,
      res,
      whereConditions,
      params,
      paramCount,
    });

    if (tenantScope.blocked) {
      return tenantScope.response();
    }

    paramCount = tenantScope.paramCount;

    const gateEnabledAt = await getOwnershipGateEnabledAt();
    paramCount = applyOwnershipGate(whereConditions, params, paramCount, gateEnabledAt);

    const result = await db.query(
      `SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.amenities, p.structured_features, p.featured, p.created_at,
        s.state_name, s.state_code,
        (SELECT photo_url FROM property_photos 
         WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
        (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating
      FROM properties p
      JOIN states s ON p.state_id = s.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${paramCount}`,
      [...params, limit]
    );

    let rows = result.rows || [];
    if (rows.length === 0) {
      // Fallback: If no properties are specifically flagged featured=TRUE, show latest verified available properties
      const fallbackConditions = whereConditions.filter((c) => c !== 'p.featured = TRUE');
      const fallbackResult = await db.query(
        `SELECT 
          p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
          p.rent_amount, p.payment_frequency, p.city, p.area,
          p.amenities, p.structured_features, p.featured, p.created_at,
          s.state_name, s.state_code,
          (SELECT photo_url FROM property_photos 
           WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_photo,
          (SELECT AVG(rating) FROM reviews WHERE property_id = p.id) AS avg_rating
        FROM properties p
        JOIN states s ON p.state_id = s.id
        WHERE ${fallbackConditions.join(' AND ')}
        ORDER BY p.created_at DESC
        LIMIT $${paramCount}`,
        [...params, limit]
      );
      rows = fallbackResult?.rows || [];
    }

    res.json({
      success: true,
      data: rows
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
    await ensurePropertySchema();
    const {
      search,
      featured,
      state_id,
      state,
      lga_name,
      city,
      property_type,
      min_price,
      max_price,
      bedrooms,
      bathrooms,
      amenities,
      features,
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
    const tenantScoped = req.user?.user_type === 'tenant';

    const featuredOnly =
      String(featured).toLowerCase() === 'true' ||
      String(featured) === '1';

    if (featuredOnly) {
      whereConditions.push('p.featured = TRUE');
    }

    const tenantScope = await addTenantLocationScope({
      req,
      res,
      whereConditions,
      params,
      paramCount,
      requestedStateId: state_id,
      requestedState: state,
      requestedLgaName: lga_name,
    });

    if (tenantScope.blocked) {
      return tenantScope.response();
    }

    paramCount = tenantScope.paramCount;

    // State Filter
    if (!tenantScoped && state_id) {
      whereConditions.push(`p.state_id = $${paramCount}`);
      params.push(state_id);
      paramCount++;
    }

    if (!tenantScoped && state) {
      whereConditions.push(`LOWER(s.state_name) LIKE LOWER($${paramCount})`);
      params.push(`%${state}%`);
      paramCount++;
    }

    if (!tenantScoped && state_id && String(lga_name || '').trim()) {
      const resolvedLocation = await resolveLocationSelection({
        stateId: state_id,
        lgaName: lga_name,
        requireLga: true,
      });

      whereConditions.push(`(
        LOWER(COALESCE(p.lga_name, '')) = LOWER($${paramCount}) OR
        LOWER(COALESCE(p.city, '')) = LOWER($${paramCount}) OR
        LOWER(COALESCE(p.area, '')) = LOWER($${paramCount})
      )`);
      params.push(resolvedLocation.lga_name);
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

    // Structured features filter (ALL requested features must be explicitly true)
    if (features) {
      const requested = (Array.isArray(features) ? features : String(features).split(','))
        .map((key) => String(key).trim())
        .filter((key) => /^[a-z0-9_]+$/.test(key));

      for (const key of requested) {
        whereConditions.push(
          `COALESCE((p.structured_features -> $${paramCount} -> 'available')::text, 'null') = 'true'`
        );
        params.push(key);
        paramCount++;
      }
    }

    const validSortFields = ['created_at', 'rent_amount', 'bedrooms'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const gateEnabledAt = await getOwnershipGateEnabledAt();
    paramCount = applyOwnershipGate(whereConditions, params, paramCount, gateEnabledAt);

    const query = `
      SELECT 
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
        p.rent_amount, p.payment_frequency, p.city, p.area, p.lga_name,
        p.amenities, p.structured_features, p.featured, p.created_at,
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
    req.logger.error('Search properties error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to search properties'
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
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.amenities, p.structured_features, p.featured, p.created_at,
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
      data: sanitizeSubmittedProperty(property),
      message: 'Pay to view the full address and property details. Phone and email contacts are not included.'
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

    const unlockResult = await getTenantPropertyUnlock({
      userId,
      propertyId,
      dbQuery: db.query.bind(db),
    });

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
    req.logger.error('Get full property details error:', error);
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
        p.id, p.title, p.property_type, p.bedrooms, p.bathrooms, p.parking_spaces,
        p.rent_amount, p.payment_frequency, p.city, p.area,
        p.amenities, p.structured_features, p.featured, p.created_at, sp.created_at AS saved_at,
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
// Get Tenant Application Properties
// -----------------------------------------------------
exports.getTenantProperties = async (req, res) => {
  try {
    const tenantId = req.user.id;

    const result = await db.query(
      `SELECT DISTINCT ON (p.id)
        p.id,
        p.title,
        COALESCE(NULLIF(TRIM(p.full_address), ''), CONCAT_WS(', ', p.area, p.city, s.state_name)) AS address,
        p.state_id,
        s.state_name,
        p.lga_name,
        p.city,
        p.area,
        p.rent_amount,
        p.payment_frequency,
        a.id AS application_id,
        a.status AS application_status
       FROM applications a
       JOIN properties p ON p.id = a.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE a.tenant_id = $1
         AND a.status IN ('pending', 'approved')
       ORDER BY p.id, a.created_at DESC`,
      [tenantId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    req.logger.error('Get tenant properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant properties',
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
    const isPrivileged = ['super_admin'].includes(requesterType);

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
    req.logger.error('Get property users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch property users',
    });
  }
};


// =====================================================
// =============== LANDLORD ENDPOINTS ===================
// =====================================================

exports.createPropertyImageCaptureSession = async (req, res) => {
  try {
    await ensurePropertySchema();
    const token = await issueCaptureTicket(req.user.id);

    return res.json({
      success: true,
      data: {
        token,
        expires_in_seconds: Math.floor(CAPTURE_TICKET_TTL_MS / 1000),
      },
    });
  } catch (error) {
    req.logger.error('Create property image capture session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create live capture session',
    });
  }
};


// -----------------------------------------------------
// Create New Property
// -----------------------------------------------------
exports.createProperty = async (req, res) => {
  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let persistedFiles = false;
  let submissionKey = '';
  let submissionFingerprint = '';
  let landlordUserId;
  const uploadedFiles = [
    ...(req.files?.images || []),
    ...(req.files?.video || []),
  ];
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

    landlordUserId = managerContext.landlordUserId;
    const {
      state_id,
      state,
      lga_name,
      city,
      area,
      full_address,
      latitude,
      longitude,
      property_type,
      bedrooms,
      bathrooms,
      parking_spaces,
      rent_amount,
      payment_frequency,
      title,
      description,
      amenities,
      is_available,
      structured_features,
    } = req.body;

    const images = req.files?.images || [];
    const video = req.files?.video?.[0] || null;
    const imageCaptureSource = String(req.body.image_capture_source || '').trim();
    const imageCaptureTokens = parsePropertyImageCaptureTokens(req.body.image_capture_tokens);
    submissionKey = String(req.body.submission_key || '').trim();
    const allowedTypes = [
      'apartment',
      'house',
      'duplex',
      'studio',
      'bungalow',
      'flat',
      'room',
    ];

    if (!/^[a-zA-Z0-9._:-]{16,80}$/.test(submissionKey)) {
      return res.status(400).json({
        success: false,
        message: 'A valid submission key is required. Please retry from the property form.',
      });
    }

    if (!images.length) {
      return res.status(400).json({
        success: false,
        message: 'Capture at least one live property image.',
      });
    }

    if (imageCaptureSource !== 'live_camera') {
      return res.status(400).json({
        success: false,
        message: 'Property images must be captured with the live camera.',
      });
    }

    if (imageCaptureTokens.length !== images.length) {
      return res.status(400).json({
        success: false,
        message: 'Every property image must be captured live before publishing.',
      });
    }

    const uniqueTokens = new Set(imageCaptureTokens);
    if (uniqueTokens.size !== imageCaptureTokens.length) {
      return res.status(400).json({
        success: false,
        message: 'Each live property image must have its own capture session.',
      });
    }

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

    const parsedStructuredFeatures = (() => {
      if (!structured_features) return {};
      if (typeof structured_features === 'object') {
        return validateStructuredFeatures(structured_features).features;
      }
      try {
        const parsed = JSON.parse(structured_features);
        return parsed && typeof parsed === 'object'
          ? validateStructuredFeatures(parsed).features
          : {};
      } catch {
        return {};
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

    let resolvedLgaName = null;
    if (!String(lga_name || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid local government area is required.',
      });
    }

    try {
      const resolvedLocation = await resolveLocationSelection({
        stateId: resolvedStateId,
        lgaName: lga_name,
        requireLga: true,
      });

      resolvedStateId = resolvedLocation.state_id;
      resolvedStateName = resolvedLocation.state_name;
      resolvedLgaName = resolvedLocation.lga_name;
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      throw error;
    }

    if (managerContext.isAgent) {
      const assignedState = managerContext.assigned_state;
      if (!assignedState || !statesMatch(assignedState, resolvedStateName)) {
        return res.status(403).json({
          success: false,
          message: `Agent state lock: you can only create properties in ${assignedState || 'your assigned state'}`,
        });
      }
    }

    const finalAddress =
      full_address && String(full_address).trim()
        ? String(full_address).trim()
        : [area, city, resolvedStateName].filter(Boolean).join(', ');

    const parsedLatitude = parseCoordinate(latitude, -90, 90);
    const parsedLongitude = parseCoordinate(longitude, -180, 180);

    if (parsedLatitude === null || parsedLongitude === null) {
      return res.status(400).json({
        success: false,
        message: 'Please pick a valid property location on the map.',
      });
    }

    submissionFingerprint = createSubmissionFingerprint(
      req.body,
      imageCaptureTokens,
      images.length
    );
    const priorSubmission = await db.query(
      `SELECT * FROM properties
       WHERE landlord_id = $1 AND submission_key = $2
       LIMIT 1`,
      [landlordUserId, submissionKey]
    );
    if (priorSubmission.rows.length) {
      const property = priorSubmission.rows[0];
      if (property.submission_fingerprint !== submissionFingerprint) {
        return res.status(409).json({
          success: false,
          code: 'SUBMISSION_KEY_REUSED',
          message: 'This submission key was already used for a different listing.',
        });
      }
      return res.status(200).json({
        success: true,
        message: 'This property was already submitted for review.',
        data: sanitizeSubmittedProperty(property),
        already_submitted: true,
      });
    }

    const landlordVerified = await ensureLandlordOwnerIsVerified(landlordUserId);
    if (!landlordVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please complete identity verification (NIN + Passport) first.',
      });
    }

    client = await db.connect();
    await client.query('BEGIN');
    transactionOpen = true;

    const captureTickets = await lockCaptureTickets(
      client,
      req.user.id,
      imageCaptureTokens
    );
    if (!captureTickets.valid) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      const existing = await db.query(
        `SELECT * FROM properties
         WHERE landlord_id = $1 AND submission_key = $2
         LIMIT 1`,
        [landlordUserId, submissionKey]
      );
      if (existing.rows[0]?.submission_fingerprint === submissionFingerprint) {
        return res.status(200).json({
          success: true,
          message: 'This property was already submitted for review.',
          data: sanitizeSubmittedProperty(existing.rows[0]),
          already_submitted: true,
        });
      }
      if (existing.rows.length) {
        return res.status(409).json({
          success: false,
          code: 'SUBMISSION_KEY_REUSED',
          message: 'This submission key was already used for a different listing.',
        });
      }
      return res.status(403).json({
        success: false,
        code: captureTickets.reason === 'expired'
          ? 'CAPTURE_SESSION_EXPIRED'
          : captureTickets.reason === 'used'
            ? 'CAPTURE_SESSION_USED'
            : 'CAPTURE_SESSION_INVALID',
        message: captureTickets.reason === 'expired'
          ? 'The live photo session expired. Retake the photos before submitting.'
          : 'The live photo session is no longer valid. Retake the photos before submitting.',
      });
    }

    const hasExplicitParking = parking_spaces !== undefined && parking_spaces !== null && parking_spaces !== '';
    const resolvedParkingSpaces = resolveParkingSpaces({
      parking_spaces,
      structured_features: parsedStructuredFeatures,
      amenities: parsedAmenities,
    });
    const syncedStructuredFeatures = syncStructuredParking(
      parsedStructuredFeatures,
      resolvedParkingSpaces,
      hasExplicitParking
    );

    const result = await client.query(
      `INSERT INTO properties (
         landlord_id, user_id, state, state_id, lga_name, city, area, full_address,
         latitude, longitude,
         property_type, bedrooms, bathrooms, parking_spaces,
         price, rent_amount, payment_frequency,
         title, description, amenities, structured_features, is_available, is_verified, status, video_url,
         submission_key, submission_fingerprint
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
       )
      RETURNING *`,
      [
        landlordUserId,
        landlordUserId,
        resolvedStateName,
        resolvedStateId,
        resolvedLgaName,
        city,
        area,
        finalAddress,
        parsedLatitude,
        parsedLongitude,
        property_type,
        Number(bedrooms) || 0,
        Number(bathrooms) || 0,
        resolvedParkingSpaces,
        rent_amount,
        rent_amount,
        payment_frequency || 'yearly',
        title,
        description,
        JSON.stringify(parsedAmenities),
        JSON.stringify(syncedStructuredFeatures),
        is_available === false || is_available === 'false' ? false : true,
        false,
        'pending',
        video ? video.path : null,
        submissionKey,
        submissionFingerprint,
      ]
    );

    const property = result.rows[0];

    if (images.length) {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        await client.query(
          `INSERT INTO property_photos
             (property_id, photo_url, is_primary, upload_order, capture_token_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [property.id, file.path, i === 0, i, hashCaptureToken(imageCaptureTokens[i])]
        );
      }
    }

    await consumeCaptureTickets(
      client,
      req.user.id,
      captureTickets.hashes,
      property.id
    );

    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    persistedFiles = true;

    if (images.length >= 2) {
      try {
        const { enqueuePropertyTour } = require('../jobs/propertyTourJobs');
        enqueuePropertyTour(property.id).catch((error) =>
          req.logger.error('Queue property tour after listing submission failed:', error)
        );
      } catch (error) {
        req.logger.error('Queue property tour after listing submission failed:', error);
      }
    }

    try {
      require('../config/utils/sitemapGenerator').invalidateSitemap();
    } catch (error) {
      req.logger.error('Sitemap invalidation after listing submission failed:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Property created and submitted for review.',
      data: sanitizeSubmittedProperty(property),
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        req.logger.error('Create property rollback failed:', rollbackError);
      }
    }

    if (error.code === '23505' && submissionKey) {
      try {
        const existing = await db.query(
          `SELECT * FROM properties
           WHERE landlord_id = $1 AND submission_key = $2
           LIMIT 1`,
          [landlordUserId || req.user?.id, submissionKey]
        );
        const property = existing.rows[0];
        if (property && property.submission_fingerprint === submissionFingerprint) {
          return res.status(200).json({
            success: true,
            message: 'This property was already submitted for review.',
            data: sanitizeSubmittedProperty(property),
            already_submitted: true,
          });
        }
      } catch (lookupError) {
        req.logger.error('Duplicate property submission lookup failed:', lookupError);
      }
    }

    req.logger.error('Create property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create property',
    });
  } finally {
    if (client) client.release();
    if (!persistedFiles && !commitAttempted) {
      await cleanupUploadedPropertyMedia(uploadedFiles, 'create-property');
    }
  }
};



// -----------------------------------------------------
// Upload Property Photos
// -----------------------------------------------------
exports.uploadPropertyPhotos = async (req, res) => {
  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let persistedFiles = false;
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    await ensurePropertySchema();
    const { propertyId } = req.params;
    const userId = req.user.id;
    const managerContext = await resolvePropertyManagerContext(req, res, {
      propertyId,
      requiredPermission: 'can_manage_properties',
    });
    if (!managerContext) return;

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one photo'
      });
    }

    const imageCaptureSource = String(req.body.image_capture_source || '').trim();
    const imageCaptureTokens = parsePropertyImageCaptureTokens(req.body.image_capture_tokens);

    if (imageCaptureSource !== 'live_camera') {
      return res.status(400).json({
        success: false,
        message: 'Property images must be captured with the live camera.',
      });
    }

    if (imageCaptureTokens.length !== files.length) {
      return res.status(400).json({
        success: false,
        message: 'Every property image must be captured live before upload.',
      });
    }

    const uniqueTokens = new Set(imageCaptureTokens);
    if (uniqueTokens.size !== imageCaptureTokens.length) {
      return res.status(400).json({
        success: false,
        message: 'Each live property image must have its own capture session.',
      });
    }

    client = await db.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT id FROM properties WHERE id = $1 FOR UPDATE', [propertyId]);
    const tickets = await lockCaptureTickets(client, userId, imageCaptureTokens);

    if (!tickets.valid) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      if (tickets.reason === 'used') {
        const retryRows = await getCommittedPhotoRetry(
          db,
          userId,
          imageCaptureTokens.map(hashCaptureToken),
          propertyId
        );
        if (retryRows) {
          return res.json({
            success: true,
            message: 'These photos were already uploaded.',
            data: retryRows,
            already_uploaded: true,
          });
        }
      }
      return res.status(403).json({
        success: false,
        code: tickets.reason === 'expired' ? 'CAPTURE_SESSION_EXPIRED' : 'CAPTURE_SESSION_INVALID',
        message: tickets.reason === 'expired'
          ? 'The live photo session expired. Retake the photos before uploading.'
          : 'Invalid or already-used live photo session. Retake the photos before uploading.',
      });
    }

    const countResult = await client.query(
      'SELECT COUNT(*) FROM property_photos WHERE property_id = $1',
      [propertyId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10) || 0;
    const results = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const result = await client.query(
        `INSERT INTO property_photos
           (property_id, photo_url, is_primary, upload_order, capture_token_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          propertyId,
          file.path,
          currentCount === 0 && index === 0,
          currentCount + index,
          hashCaptureToken(imageCaptureTokens[index]),
        ]
      );
      results.push(result.rows[0]);
    }

    await consumeCaptureTickets(client, userId, tickets.hashes, propertyId);
    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    persistedFiles = true;

    if (currentCount + results.length >= 2) {
      try {
        const { enqueuePropertyTour } = require('../jobs/propertyTourJobs');
        enqueuePropertyTour(propertyId).catch((error) =>
          req.logger.error('Queue property tour after photo upload failed:', error)
        );
      } catch (error) {
        req.logger.error('Queue property tour after photo upload failed:', error);
      }
    }

    return res.json({
      success: true,
      message: `${results.length} photo(s) uploaded successfully`,
      data: results,
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        req.logger.error('Upload photos rollback failed:', rollbackError);
      }
    }
    req.logger.error('Upload photos error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload photos'
    });
  } finally {
    if (client) client.release();
    if (!persistedFiles && !commitAttempted) {
      await cleanupUploadedPropertyMedia(files, 'upload-property-photos');
    }
  }
};


// -----------------------------------------------------
// Upload Property Clips
// -----------------------------------------------------
// Short live-camera clips. They are slow-motioned into the tour video, so they
// carry the same live-capture promise as the photos: the clip must come from
// the in-app camera, never the gallery.
exports.uploadPropertyClips = async (req, res) => {
  let client;
  let transactionOpen = false;
  let commitAttempted = false;
  let persistedFiles = false;
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    await ensurePropertySchema();

    const { propertyId } = req.params;
    const userId = req.user.id;
    const managerContext = await resolvePropertyManagerContext(req, res, {
      propertyId,
      requiredPermission: 'can_manage_properties',
    });
    if (!managerContext) return;

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: 'Please record at least one property clip'
      });
    }

    const captureSource = String(req.body.image_capture_source || '').trim();
    const captureTokens = parsePropertyImageCaptureTokens(req.body.image_capture_tokens);

    if (captureSource !== 'live_camera') {
      return res.status(400).json({
        success: false,
        message: 'Property clips must be recorded with the live camera.',
      });
    }

    if (captureTokens.length !== files.length) {
      return res.status(400).json({
        success: false,
        message: 'Every property clip must be recorded live before upload.',
      });
    }

    const uniqueTokens = new Set(captureTokens);
    if (uniqueTokens.size !== captureTokens.length) {
      return res.status(400).json({
        success: false,
        message: 'Each live property clip must have its own capture session.',
      });
    }

    const shotKeys = parseClipShotKeys(req.body.clip_shot_keys);
    client = await db.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT id FROM properties WHERE id = $1 FOR UPDATE', [propertyId]);
    const tickets = await lockCaptureTickets(client, userId, captureTokens);
    if (!tickets.valid) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      if (tickets.reason === 'used') {
        const retryRows = await getCommittedClipRetry(
          db,
          userId,
          captureTokens.map(hashCaptureToken),
          propertyId
        );
        if (retryRows) {
          return res.json({
            success: true,
            message: 'These clips were already uploaded.',
            data: retryRows,
            already_uploaded: true,
          });
        }
      }
      return res.status(403).json({
        success: false,
        code: tickets.reason === 'expired' ? 'CAPTURE_SESSION_EXPIRED' : 'CAPTURE_SESSION_INVALID',
        message: tickets.reason === 'expired'
          ? 'The live clip session expired. Record the clips again before uploading.'
          : 'Invalid or already-used live clip session. Record the clips again before uploading.',
      });
    }

    const countResult = await client.query(
      'SELECT COUNT(*) FROM property_clips WHERE property_id = $1',
      [propertyId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10) || 0;
    const results = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const result = await client.query(
        `INSERT INTO property_clips
           (property_id, clip_url, clip_order, shot_key, capture_token_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          propertyId,
          file.path,
          currentCount + index,
          shotKeys[index] || null,
          hashCaptureToken(captureTokens[index]),
        ]
      );
      results.push(result.rows[0]);
    }

    await consumeCaptureTickets(client, userId, tickets.hashes, propertyId);
    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    persistedFiles = true;

    try {
      const { enqueuePropertyTour } = require('../jobs/propertyTourJobs');
      enqueuePropertyTour(propertyId).catch((error) =>
        req.logger.error('Queue property tour after clip upload failed:', error)
      );
    } catch (error) {
      req.logger.error('Queue property tour after clip upload failed:', error);
    }

    return res.json({
      success: true,
      message: `${results.length} clip(s) uploaded successfully`,
      data: results
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        req.logger.error('Upload clips rollback failed:', rollbackError);
      }
    }
    req.logger.error('Upload clips error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload clips'
    });
  } finally {
    if (client) client.release();
    if (!persistedFiles && !commitAttempted) {
      await cleanupUploadedPropertyMedia(files, 'upload-property-clips');
    }
  }
};


// -----------------------------------------------------
// Update Property
// -----------------------------------------------------
exports.updateProperty = require('./propertyUpdateService').handler(req => require('./propertyUpdateService').submit(req.user, req.params.propertyId, req.body));


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
        req.logger.error('Error deleting photo from cloudinary:', err);
      }
    }

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });
  } catch (error) {
    req.logger.error('Delete property error:', error);
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
        (SELECT status FROM property_update_requests WHERE property_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) AS update_request_status,
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
    req.logger.error('Get my properties error:', error);
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
    req.logger.error('Unlist property error:', error);
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
      req.logger.error('Error deleting photo from cloudinary:', err);
    }

    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    req.logger.error('Delete photo error:', error);
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
    req.logger.error('Analyze damage photo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze condition photo',
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
        req.logger.error('Failed to parse submitted AI analysis:', error.message);
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
      message: 'Property report saved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    req.logger.error('Save damage report error:', error);
    res.status(500).json({ success: false, message: 'Failed to save property report' });
  }
};


// =====================================================
//     DAMAGE REPORTS — Get All for a Property
// =====================================================
exports.getDamageReports = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user.id;
    const userRole = String(req.user.user_type || '').toLowerCase();

    // Ownership gate: only the property landlord, an authorized agent, or an
    // admin tier may read damage reports. Without this, any authenticated
    // user can enumerate property IDs and read every landlord's reports.
    if (userRole !== 'admin' && userRole !== 'lga_admin' && userRole !== 'super_admin') {
      const propertyResult = await db.query(
        `SELECT landlord_id FROM properties WHERE id = $1`,
        [propertyId]
      );

      if (propertyResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }

      const landlordId = propertyResult.rows[0].landlord_id;
      let authorized = landlordId === userId;

      if (!authorized && userRole === 'agent') {
        const assignment = await db.query(
          `SELECT 1
           FROM landlord_agents
           WHERE landlord_user_id = $1
             AND agent_user_id = $2
             AND status = 'active'
             AND can_manage_damage_reports = TRUE
           LIMIT 1`,
          [landlordId, userId]
        );
        authorized = assignment.rows.length > 0;
      }

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to access these reports',
        });
      }
    }

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
    req.logger.error('Get damage reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch property reports' });
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
    req.logger.error('Error verifying bank account:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify account. Please try again later.'
    });
  }
};

// Export All Handlers
module.exports = exports;
