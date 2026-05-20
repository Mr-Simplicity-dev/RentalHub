const db = require('../config/middleware/database');
const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const AD_PLACEMENTS = [
  { value: 'home_top', label: 'Home top banner' },
  { value: 'home_featured', label: 'Home featured section' },
  { value: 'dashboard_top', label: 'Dashboard top banner' },
  { value: 'dashboard_inline', label: 'Dashboard inline banner' },
  { value: 'properties_top', label: 'Properties top banner' },
  { value: 'properties_inline', label: 'Properties inline banner' },
];

const AD_PLACEMENT_VALUES = new Set(AD_PLACEMENTS.map((placement) => placement.value));
const AD_PLACEMENT_SQL_LIST = AD_PLACEMENTS
  .map((placement) => `'${placement.value.replace(/'/g, "''")}'`)
  .join(', ');
const AD_IMAGE_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'ad-spaces');
const AD_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AD_IMAGE_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.gif']);
const AD_IMAGE_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

if (!fs.existsSync(AD_IMAGE_UPLOAD_DIR)) {
  fs.mkdirSync(AD_IMAGE_UPLOAD_DIR, { recursive: true });
}

const adImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AD_IMAGE_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const originalExtension = path.extname(file.originalname || '').toLowerCase();
    const extension = AD_IMAGE_ALLOWED_EXTENSIONS.has(originalExtension)
      ? originalExtension
      : AD_IMAGE_MIME_EXTENSIONS[file.mimetype] || '.jpg';
    cb(null, `ad_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${extension}`);
  },
});

const adImageUpload = multer({
  storage: adImageStorage,
  limits: { fileSize: AD_IMAGE_MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const isAllowedImage = Boolean(AD_IMAGE_MIME_EXTENSIONS[file.mimetype]);
    const hasAllowedExtension =
      !extension || AD_IMAGE_ALLOWED_EXTENSIONS.has(extension);

    if (!isAllowedImage || !hasAllowedExtension) {
      return cb(new Error('Upload a JPG, PNG, WEBP, or GIF image'));
    }

    return cb(null, true);
  },
}).single('image');

let adSpacesSchemaReady = false;

const ensureAdSpacesSchema = async () => {
  if (adSpacesSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS ad_spaces (
      id SERIAL PRIMARY KEY,
      placement VARCHAR(80) NOT NULL DEFAULT 'home_top',
      title VARCHAR(160) NOT NULL,
      description TEXT,
      sponsor_name VARCHAR(160),
      image_url VARCHAR(1000),
      target_url VARCHAR(1000),
      cta_label VARCHAR(80),
      background_color VARCHAR(20) DEFAULT '#ffffff',
      text_color VARCHAR(20) DEFAULT '#111827',
      sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TIMESTAMP,
      ends_at TIMESTAMP,
      impression_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE ad_spaces
      ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE ad_spaces
      DROP CONSTRAINT IF EXISTS chk_ad_spaces_placement;

    ALTER TABLE ad_spaces
      ADD CONSTRAINT chk_ad_spaces_placement
      CHECK (placement IN (${AD_PLACEMENT_SQL_LIST}));

    CREATE INDEX IF NOT EXISTS idx_ad_spaces_public
      ON ad_spaces (placement, is_active, sort_order, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ad_spaces_schedule
      ON ad_spaces (starts_at, ends_at);
  `);

  adSpacesSchemaReady = true;
};

const throwValidation = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

const normalizeText = (value, fieldName, maxLength, { required = false } = {}) => {
  const text = String(value || '').trim();
  if (required && !text) {
    throwValidation(`${fieldName} is required`);
  }
  if (text && text.length > maxLength) {
    throwValidation(`${fieldName} must be ${maxLength} characters or less`);
  }
  return text || null;
};

const normalizePlacement = (value) => {
  const placement = String(value || '').trim();
  if (!AD_PLACEMENT_VALUES.has(placement)) {
    throwValidation('Select a valid ad placement');
  }
  return placement;
};

const normalizeOptionalUrl = (value, fieldName) => {
  const url = String(value || '').trim();
  if (!url) return null;

  if (url.startsWith('/')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return parsed.toString();
  } catch {
    throwValidation(`${fieldName} must be a valid http(s) or site-relative URL`);
  }

  return null;
};

const normalizeColor = (value, fallback) => {
  const color = String(value || '').trim();
  if (!color) return fallback;
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    throwValidation('Colors must be valid hex values like #ffffff');
  }
  return color;
};

const normalizeDate = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throwValidation(`${fieldName} must be a valid date`);
  }
  return date;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const normalizeId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throwValidation('Invalid ad space id');
  }
  return id;
};

const normalizeAdPayload = (payload) => {
  const startsAt = normalizeDate(payload.starts_at, 'Start date');
  const endsAt = normalizeDate(payload.ends_at, 'End date');

  if (startsAt && endsAt && endsAt <= startsAt) {
    throwValidation('End date must be after start date');
  }

  const sortOrder = Number(payload.sort_order || 0);
  if (!Number.isInteger(sortOrder)) {
    throwValidation('Sort order must be a whole number');
  }

  return {
    placement: normalizePlacement(payload.placement || 'home_top'),
    title: normalizeText(payload.title, 'Title', 160, { required: true }),
    description: normalizeText(payload.description, 'Description', 1200),
    sponsor_name: normalizeText(payload.sponsor_name, 'Sponsor name', 160),
    image_url: normalizeOptionalUrl(payload.image_url, 'Image URL'),
    target_url: normalizeOptionalUrl(payload.target_url, 'Target URL'),
    cta_label: normalizeText(payload.cta_label, 'CTA label', 80),
    background_color: normalizeColor(payload.background_color, '#ffffff'),
    text_color: normalizeColor(payload.text_color, '#111827'),
    sharing_enabled: normalizeBoolean(payload.sharing_enabled, false),
    is_active: normalizeBoolean(payload.is_active, true),
    sort_order: sortOrder,
    starts_at: startsAt,
    ends_at: endsAt,
  };
};

const handleControllerError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(fallbackMessage, error);
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

const listPublicAds = async (req, res) => {
  try {
    await ensureAdSpacesSchema();

    const flags = await getFeatureFlagsMap();
    if (flags.ads_enabled === false) {
      return res.json({ success: true, data: [] });
    }

    const placement = String(req.query.placement || '').trim();
    if (placement && !AD_PLACEMENT_VALUES.has(placement)) {
      return res.json({ success: true, data: [] });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 10);
    const params = [];
    const where = [
      'is_active = TRUE',
      '(starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)',
      '(ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)',
    ];

    if (placement) {
      params.push(placement);
      where.push(`placement = $${params.length}`);
    }

    params.push(limit);

    const { rows } = await db.query(
      `SELECT id, placement, title, description, sponsor_name, image_url,
              target_url, cta_label, background_color, text_color, sharing_enabled
       FROM ad_spaces
       WHERE ${where.join(' AND ')}
       ORDER BY sort_order ASC, created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    handleControllerError(res, error, 'Failed to load ads');
  }
};

const recordAdImpression = async (req, res) => {
  try {
    await ensureAdSpacesSchema();
    const adId = normalizeId(req.params.id);

    await db.query(
      `UPDATE ad_spaces
       SET impression_count = impression_count + 1
       WHERE id = $1`,
      [adId]
    );

    res.json({ success: true });
  } catch (error) {
    handleControllerError(res, error, 'Failed to record ad impression');
  }
};

const recordAdClick = async (req, res) => {
  try {
    await ensureAdSpacesSchema();
    const adId = normalizeId(req.params.id);

    await db.query(
      `UPDATE ad_spaces
       SET click_count = click_count + 1
       WHERE id = $1`,
      [adId]
    );

    res.json({ success: true });
  } catch (error) {
    handleControllerError(res, error, 'Failed to record ad click');
  }
};

const adminListAds = async (req, res) => {
  try {
    await ensureAdSpacesSchema();

    const { rows } = await db.query(
      `SELECT a.*,
              creator.full_name AS created_by_name,
              updater.full_name AS updated_by_name
       FROM ad_spaces a
       LEFT JOIN users creator ON creator.id = a.created_by
       LEFT JOIN users updater ON updater.id = a.updated_by
       ORDER BY a.placement ASC, a.sort_order ASC, a.created_at DESC`
    );

    res.json({
      success: true,
      data: {
        ads: rows,
        placements: AD_PLACEMENTS,
      },
    });
  } catch (error) {
    handleControllerError(res, error, 'Failed to load ad spaces');
  }
};

const createAd = async (req, res) => {
  try {
    await ensureAdSpacesSchema();

    const ad = normalizeAdPayload(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO ad_spaces (
         placement, title, description, sponsor_name, image_url, target_url,
         cta_label, background_color, text_color, sharing_enabled, is_active, sort_order,
         starts_at, ends_at, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
       RETURNING *`,
      [
        ad.placement,
        ad.title,
        ad.description,
        ad.sponsor_name,
        ad.image_url,
        ad.target_url,
        ad.cta_label,
        ad.background_color,
        ad.text_color,
        ad.sharing_enabled,
        ad.is_active,
        ad.sort_order,
        ad.starts_at,
        ad.ends_at,
        req.user.id,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    handleControllerError(res, error, 'Failed to create ad space');
  }
};

const updateAd = async (req, res) => {
  try {
    await ensureAdSpacesSchema();
    const adId = normalizeId(req.params.id);

    const existingResult = await db.query(
      `SELECT * FROM ad_spaces WHERE id = $1`,
      [adId]
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ad space not found' });
    }

    const ad = normalizeAdPayload({
      ...existingResult.rows[0],
      ...(req.body || {}),
    });

    const { rows } = await db.query(
      `UPDATE ad_spaces
       SET placement = $2,
           title = $3,
           description = $4,
           sponsor_name = $5,
           image_url = $6,
           target_url = $7,
           cta_label = $8,
           background_color = $9,
           text_color = $10,
           sharing_enabled = $11,
           is_active = $12,
           sort_order = $13,
           starts_at = $14,
           ends_at = $15,
           updated_by = $16,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        adId,
        ad.placement,
        ad.title,
        ad.description,
        ad.sponsor_name,
        ad.image_url,
        ad.target_url,
        ad.cta_label,
        ad.background_color,
        ad.text_color,
        ad.sharing_enabled,
        ad.is_active,
        ad.sort_order,
        ad.starts_at,
        ad.ends_at,
        req.user.id,
      ]
    );

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    handleControllerError(res, error, 'Failed to update ad space');
  }
};

const deleteAd = async (req, res) => {
  try {
    await ensureAdSpacesSchema();
    const adId = normalizeId(req.params.id);

    const result = await db.query(
      `DELETE FROM ad_spaces WHERE id = $1 RETURNING id`,
      [adId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ad space not found' });
    }

    res.json({ success: true });
  } catch (error) {
    handleControllerError(res, error, 'Failed to delete ad space');
  }
};

const uploadAdImageFile = (req, res, next) => {
  adImageUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Ad image must be 5MB or smaller'
        : error.message || 'Failed to upload ad image';

    return res.status(400).json({
      success: false,
      message,
    });
  });
};

const uploadAdImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded',
      });
    }

    const url = `/uploads/ad-spaces/${req.file.filename}`;

    return res.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to upload ad image');
  }
};

module.exports = {
  AD_PLACEMENTS,
  ensureAdSpacesSchema,
  listPublicAds,
  recordAdImpression,
  recordAdClick,
  adminListAds,
  createAd,
  updateAd,
  deleteAd,
  uploadAdImageFile,
  uploadAdImage,
};
