const db = require('../config/middleware/database');

const RATING_CONTEXTS = [
  'property_secured',
  'property_listed',
  'property_rented',
  'legal_support',
  'fumigation_cleaning',
  'transportation',
  'virtual_tour',
  'dispute_support',
  'admin_support',
  'platform',
];

const USER_ROLES = ['tenant', 'landlord', 'agent'];
const DISPLAY_NAME_MODES = ['first_name', 'initials', 'role_location'];
const ALL_OPTION = 'all';

const CONTEXT_LABELS = {
  property_secured: 'secured a property',
  property_listed: 'listed a property',
  property_rented: 'rented out a property',
  legal_support: 'used legal support',
  fumigation_cleaning: 'used fumigation/cleaning',
  transportation: 'used transportation support',
  virtual_tour: 'completed a virtual tour',
  dispute_support: 'used dispute support',
  admin_support: 'received admin support',
  platform: 'used RentalHub NG',
};

let platformRatingSchemaReady = false;

const ensurePlatformRatingSchema = async () => {
  if (platformRatingSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_rating_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      flyins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      submissions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      show_user_images BOOLEAN NOT NULL DEFAULT FALSE,
      display_name_mode VARCHAR(30) NOT NULL DEFAULT 'first_name',
      flyin_frequency_seconds INTEGER NOT NULL DEFAULT 45,
      min_stars_for_public INTEGER NOT NULL DEFAULT 4,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_rating_display_mode
        CHECK (display_name_mode IN ('first_name', 'initials', 'role_location')),
      CONSTRAINT chk_platform_rating_frequency
        CHECK (flyin_frequency_seconds BETWEEN 15 AND 600),
      CONSTRAINT chk_platform_rating_min_stars
        CHECK (min_stars_for_public BETWEEN 1 AND 5)
    );

    INSERT INTO platform_rating_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS platform_service_ratings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_role VARCHAR(40) NOT NULL,
      rating_context VARCHAR(60) NOT NULL,
      source_type VARCHAR(60) NOT NULL,
      source_ref VARCHAR(120) NOT NULL,
      source_title VARCHAR(240),
      state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
      state_name VARCHAR(120),
      lga_name VARCHAR(120),
      city VARCHAR(120),
      stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment TEXT,
      display_name_mode VARCHAR(30) NOT NULL DEFAULT 'first_name',
      allow_public_image BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_service_rating_status
        CHECK (status IN ('pending', 'approved', 'hidden', 'rejected')),
      CONSTRAINT chk_platform_service_rating_display_mode
        CHECK (display_name_mode IN ('first_name', 'initials', 'role_location'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_service_ratings_unique_source
      ON platform_service_ratings (user_id, rating_context, source_type, source_ref);

    CREATE INDEX IF NOT EXISTS idx_platform_service_ratings_public
      ON platform_service_ratings (status, stars, reviewed_at DESC, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_platform_service_ratings_location
      ON platform_service_ratings (state_id, lga_name, user_role, rating_context);

    CREATE TABLE IF NOT EXISTS platform_rating_location_rules (
      id SERIAL PRIMARY KEY,
      state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
      state_name VARCHAR(120),
      lga_name VARCHAR(120),
      user_role VARCHAR(40),
      rating_context VARCHAR(60),
      submissions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      flyins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_platform_rating_location_rules_scope
      ON platform_rating_location_rules (state_id, lga_name, user_role, rating_context);
  `);

  platformRatingSchemaReady = true;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const normalizeInteger = (value, fallback, min, max) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
};

const normalizeOptionalChoice = (value, allowed) => {
  const next = String(value || '').trim().toLowerCase();
  if (!next || next === ALL_OPTION) return null;
  return allowed.includes(next) ? next : null;
};

const normalizeContext = (value) => {
  const next = String(value || '').trim().toLowerCase();
  return RATING_CONTEXTS.includes(next) ? next : null;
};

const normalizeDisplayMode = (value, fallback = 'first_name') => {
  const next = String(value || '').trim().toLowerCase();
  return DISPLAY_NAME_MODES.includes(next) ? next : fallback;
};

const normalizeSourceRef = (value) => String(value || '').trim().slice(0, 120);

const tableExists = async (tableName) => {
  const { rows } = await db.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(rows[0]?.table_name);
};

const getSettings = async () => {
  await ensurePlatformRatingSchema();
  const { rows } = await db.query('SELECT * FROM platform_rating_settings WHERE id = 1');
  return rows[0];
};

const firstName = (name = '') => String(name || '').trim().split(/\s+/)[0] || 'Verified user';

const initials = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'RH';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

const roleLabel = (role = '') => {
  const normalized = String(role || '').replace(/_/g, ' ').trim();
  return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : 'User';
};

const locationLabel = (row = {}) =>
  [row.lga_name, row.city, row.state_name].filter(Boolean)[0] || row.state_name || 'Nigeria';

const buildPublicRating = (row, settings) => {
  const mode = normalizeDisplayMode(settings.display_name_mode, row.display_name_mode);
  const location = locationLabel(row);
  const displayName =
    mode === 'initials'
      ? initials(row.full_name)
      : mode === 'role_location'
        ? `${roleLabel(row.user_role)} in ${location}`
        : firstName(row.full_name);

  return {
    id: row.id,
    stars: Number(row.stars),
    rating_context: row.rating_context,
    context_label: CONTEXT_LABELS[row.rating_context] || 'used RentalHub NG',
    display_name: displayName,
    initials: initials(row.full_name),
    location,
    source_title: row.source_title,
    comment: row.comment,
    image_url:
      settings.show_user_images && row.allow_public_image && row.passport_photo_url
        ? row.passport_photo_url
        : null,
  };
};

const getMatchingRule = async ({ stateId, lgaName, userRole, ratingContext }) => {
  const { rows } = await db.query(
    `SELECT *
     FROM platform_rating_location_rules
     WHERE (state_id IS NULL OR state_id = $1)
       AND (lga_name IS NULL OR LOWER(TRIM(lga_name)) = LOWER(TRIM($2)))
       AND (user_role IS NULL OR user_role = $3)
       AND (rating_context IS NULL OR rating_context = $4)
     ORDER BY
       ((state_id IS NOT NULL)::int +
        (lga_name IS NOT NULL)::int +
        (user_role IS NOT NULL)::int +
        (rating_context IS NOT NULL)::int) DESC,
       updated_at DESC,
       id DESC
     LIMIT 1`,
    [stateId || null, String(lgaName || ''), userRole || null, ratingContext || null]
  );

  return rows[0] || null;
};

const isAllowedByRules = async (scope, columnName) => {
  const rule = await getMatchingRule(scope);
  if (!rule) return true;
  return rule[columnName] !== false;
};

const mapOpportunity = (row, context, sourceType, title, detail) => ({
  opportunity_id: `${context}:${sourceType}:${row.source_ref}`,
  rating_context: context,
  source_type: sourceType,
  source_ref: normalizeSourceRef(row.source_ref),
  source_title: row.source_title || title,
  title,
  detail,
  state_id: row.state_id || null,
  state_name: row.state_name || null,
  lga_name: row.lga_name || null,
  city: row.city || null,
  location_label: locationLabel(row),
});

const runOpportunityQuery = async (sql, params) => {
  try {
    const { rows } = await db.query(sql, params);
    return rows;
  } catch (error) {
    console.warn('Platform rating opportunity query skipped:', error.message);
    return [];
  }
};

const getEligibleOpportunities = async (user, { limit = 6 } = {}) => {
  await ensurePlatformRatingSchema();
  const settings = await getSettings();
  if (!settings.submissions_enabled) return [];

  const role = String(user?.user_type || '').toLowerCase();
  if (!USER_ROLES.includes(role)) return [];

  const opportunities = [];

  if (role === 'tenant' && await tableExists('applications')) {
    const rows = await runOpportunityQuery(
      `SELECT a.id::text AS source_ref, p.title AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM applications a
       JOIN properties p ON p.id = a.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE a.tenant_id = $1
         AND a.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'property_secured'
             AND r.source_type = 'application'
             AND r.source_ref = a.id::text
         )
       ORDER BY COALESCE(a.updated_at, a.created_at) DESC
       LIMIT 3`,
      [user.id]
    );

    rows.forEach((row) => {
      opportunities.push(
        mapOpportunity(
          row,
          'property_secured',
          'application',
          'Rate your RentalHub NG rental experience',
          row.source_title ? `You secured ${row.source_title}.` : 'You secured a property through RentalHub NG.'
        )
      );
    });
  }

  if (['landlord', 'agent'].includes(role) && await tableExists('properties')) {
    const ownerColumn = role === 'agent' ? 'user_id' : 'landlord_id';
    const listedRows = await runOpportunityQuery(
      `SELECT p.id::text AS source_ref, p.title AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM properties p
       LEFT JOIN states s ON s.id = p.state_id
       WHERE p.${ownerColumn} = $1
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'property_listed'
             AND r.source_type = 'property'
             AND r.source_ref = p.id::text
         )
       ORDER BY p.created_at DESC
       LIMIT 2`,
      [user.id]
    );

    listedRows.forEach((row) => {
      opportunities.push(
        mapOpportunity(
          row,
          'property_listed',
          'property',
          'Rate your property listing experience',
          row.source_title ? `You listed ${row.source_title}.` : 'You listed a property on RentalHub NG.'
        )
      );
    });

    if (await tableExists('applications')) {
      const rentedRows = await runOpportunityQuery(
        `SELECT a.id::text AS source_ref, p.title AS source_title,
                p.state_id, s.state_name, p.lga_name, p.city
         FROM applications a
         JOIN properties p ON p.id = a.property_id
         LEFT JOIN states s ON s.id = p.state_id
         WHERE p.${ownerColumn} = $1
           AND a.status = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM platform_service_ratings r
             WHERE r.user_id = $1
               AND r.rating_context = 'property_rented'
               AND r.source_type = 'application'
               AND r.source_ref = a.id::text
           )
         ORDER BY COALESCE(a.updated_at, a.created_at) DESC
         LIMIT 3`,
        [user.id]
      );

      rentedRows.forEach((row) => {
        opportunities.push(
          mapOpportunity(
            row,
            'property_rented',
            'application',
            'Rate your successful rental experience',
            row.source_title ? `${row.source_title} was rented through RentalHub NG.` : 'Your property was rented through RentalHub NG.'
          )
        );
      });
    }
  }

  if (role === 'tenant' && await tableExists('transportation_bookings')) {
    const rows = await runOpportunityQuery(
      `SELECT tb.id::text AS source_ref, ts.service_name AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM transportation_bookings tb
       LEFT JOIN transportation_services ts ON ts.id = tb.service_id
       LEFT JOIN properties p ON p.id = tb.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE tb.tenant_id = $1
         AND (tb.booking_status = 'completed' OR tb.payment_status = 'completed')
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'transportation'
             AND r.source_type = 'transportation_booking'
             AND r.source_ref = tb.id::text
         )
       ORDER BY COALESCE(tb.completed_at, tb.created_at) DESC
       LIMIT 2`,
      [user.id]
    );

    rows.forEach((row) => {
      opportunities.push(
        mapOpportunity(row, 'transportation', 'transportation_booking', 'Rate RentalHub NG transportation support', 'Tell us how your transportation support went.')
      );
    });
  }

  if (role === 'tenant' && await tableExists('fumigation_cleaning_bookings')) {
    const rows = await runOpportunityQuery(
      `SELECT fb.id::text AS source_ref, fs.service_name AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM fumigation_cleaning_bookings fb
       LEFT JOIN fumigation_cleaning_services fs ON fs.id = fb.service_id
       LEFT JOIN properties p ON p.id = fb.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE fb.tenant_id = $1
         AND (fb.booking_status = 'completed' OR fb.payment_status = 'completed')
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'fumigation_cleaning'
             AND r.source_type = 'fumigation_booking'
             AND r.source_ref = fb.id::text
         )
       ORDER BY COALESCE(fb.completed_at, fb.created_at) DESC
       LIMIT 2`,
      [user.id]
    );

    rows.forEach((row) => {
      opportunities.push(
        mapOpportunity(row, 'fumigation_cleaning', 'fumigation_booking', 'Rate RentalHub NG fumigation/cleaning support', 'Tell us how your service experience went.')
      );
    });
  }

  if (await tableExists('call_sessions')) {
    const rows = await runOpportunityQuery(
      `SELECT cs.id::text AS source_ref, p.title AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM call_sessions cs
       LEFT JOIN properties p ON p.id = cs.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE (cs.caller_id = $1 OR cs.receiver_id = $1)
         AND cs.call_type = 'virtual_tour'
         AND cs.status = 'ended'
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'virtual_tour'
             AND r.source_type = 'call_session'
             AND r.source_ref = cs.id::text
         )
       ORDER BY COALESCE(cs.ended_at, cs.created_at) DESC
       LIMIT 2`,
      [user.id]
    );

    rows.forEach((row) => {
      opportunities.push(
        mapOpportunity(row, 'virtual_tour', 'call_session', 'Rate your RentalHub NG virtual tour', 'Tell us how the virtual property tour helped you.')
      );
    });
  }

  if (await tableExists('legal_authorizations')) {
    const rows = await runOpportunityQuery(
      `SELECT la.id::text AS source_ref,
              COALESCE(p.title, 'RentalHub NG legal support') AS source_title,
              p.state_id, s.state_name, p.lga_name, p.city
       FROM legal_authorizations la
       LEFT JOIN properties p ON p.id = la.property_id
       LEFT JOIN states s ON s.id = p.state_id
       WHERE la.client_user_id = $1
         AND COALESCE(la.status, 'active') = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM platform_service_ratings r
           WHERE r.user_id = $1
             AND r.rating_context = 'legal_support'
             AND r.source_type = 'legal_authorization'
             AND r.source_ref = la.id::text
         )
       ORDER BY la.created_at DESC
       LIMIT 2`,
      [user.id]
    );

    rows.forEach((row) => {
      opportunities.push(
        mapOpportunity(row, 'legal_support', 'legal_authorization', 'Rate RentalHub NG legal support', 'Tell us how the legal support experience helped you.')
      );
    });
  }

  const allowed = [];
  for (const opportunity of opportunities) {
    if (allowed.length >= limit) break;
    const canSubmit = await isAllowedByRules(
      {
        stateId: opportunity.state_id,
        lgaName: opportunity.lga_name,
        userRole: role,
        ratingContext: opportunity.rating_context,
      },
      'submissions_enabled'
    );
    if (canSubmit) allowed.push(opportunity);
  }

  return allowed;
};

exports.ensurePlatformRatingSchema = ensurePlatformRatingSchema;

exports.getOpportunities = async (req, res) => {
  try {
    const opportunities = await getEligibleOpportunities(req.user, { limit: 6 });
    res.json({ success: true, data: opportunities });
  } catch (error) {
    console.error('Get rating opportunities error:', error);
    res.status(500).json({ success: false, message: 'Failed to load rating opportunities' });
  }
};

exports.submitRating = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const stars = normalizeInteger(req.body.stars, 0, 1, 5);
    if (!stars) {
      return res.status(400).json({ success: false, message: 'Choose a star rating from 1 to 5' });
    }

    const context = normalizeContext(req.body.rating_context);
    const sourceType = String(req.body.source_type || '').trim().slice(0, 60);
    const sourceRef = normalizeSourceRef(req.body.source_ref);

    if (!context || !sourceType || !sourceRef) {
      return res.status(400).json({ success: false, message: 'Invalid rating opportunity' });
    }

    const opportunities = await getEligibleOpportunities(req.user, { limit: 20 });
    const opportunity = opportunities.find(
      (item) =>
        item.rating_context === context &&
        item.source_type === sourceType &&
        item.source_ref === sourceRef
    );

    if (!opportunity) {
      return res.status(403).json({
        success: false,
        message: 'This rating is only available after a verified RentalHub NG service or successful action.',
      });
    }

    const comment = String(req.body.comment || '').trim().slice(0, 800) || null;
    const displayNameMode = normalizeDisplayMode(req.body.display_name_mode, 'first_name');
    const allowPublicImage = normalizeBoolean(req.body.allow_public_image, false);

    const { rows } = await db.query(
      `INSERT INTO platform_service_ratings (
         user_id, user_role, rating_context, source_type, source_ref, source_title,
         state_id, state_name, lga_name, city, stars, comment,
         display_name_mode, allow_public_image
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (user_id, rating_context, source_type, source_ref)
       DO UPDATE SET
         stars = EXCLUDED.stars,
         comment = EXCLUDED.comment,
         display_name_mode = EXCLUDED.display_name_mode,
         allow_public_image = EXCLUDED.allow_public_image,
         status = 'pending',
         admin_note = NULL,
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        req.user.id,
        req.user.user_type,
        context,
        sourceType,
        sourceRef,
        opportunity.source_title,
        opportunity.state_id,
        opportunity.state_name,
        opportunity.lga_name,
        opportunity.city,
        stars,
        comment,
        displayNameMode,
        allowPublicImage,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thank you. Your rating has been submitted for review.',
      data: rows[0],
    });
  } catch (error) {
    console.error('Submit platform rating error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
};

exports.getPublicRatings = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const settings = await getSettings();
    if (!settings.flyins_enabled) {
      return res.json({ success: true, data: [], settings });
    }

    const limit = normalizeInteger(req.query.limit, 10, 1, 30);
    const { rows } = await db.query(
      `SELECT r.*, u.full_name, u.passport_photo_url,
              COALESCE(s.state_name, r.state_name) AS resolved_state_name
       FROM platform_service_ratings r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN states s ON s.id = r.state_id
       WHERE r.status = 'approved'
         AND r.stars >= $1
       ORDER BY COALESCE(r.reviewed_at, r.created_at) DESC
       LIMIT $2`,
      [settings.min_stars_for_public, limit * 2]
    );

    const allowed = [];
    for (const row of rows) {
      if (allowed.length >= limit) break;
      const scopedRow = {
        ...row,
        state_name: row.resolved_state_name || row.state_name,
      };
      const canShow = await isAllowedByRules(
        {
          stateId: scopedRow.state_id,
          lgaName: scopedRow.lga_name,
          userRole: scopedRow.user_role,
          ratingContext: scopedRow.rating_context,
        },
        'flyins_enabled'
      );
      if (canShow) allowed.push(buildPublicRating(scopedRow, settings));
    }

    res.json({
      success: true,
      data: allowed,
      settings: {
        flyins_enabled: settings.flyins_enabled,
        flyin_frequency_seconds: settings.flyin_frequency_seconds,
      },
    });
  } catch (error) {
    console.error('Get public ratings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load public ratings' });
  }
};

exports.adminListRatings = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const settings = await getSettings();

    const [ratingsResult, rulesResult, statesResult] = await Promise.all([
      db.query(
        `SELECT r.*, u.full_name, u.email, u.passport_photo_url,
                reviewer.full_name AS reviewed_by_name
         FROM platform_service_ratings r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
         ORDER BY
           CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
           r.created_at DESC
         LIMIT 200`
      ),
      db.query(
        `SELECT *
         FROM platform_rating_location_rules
         ORDER BY created_at DESC, id DESC`
      ),
      db.query('SELECT id, state_name FROM states ORDER BY state_name ASC'),
    ]);

    res.json({
      success: true,
      data: {
        settings,
        ratings: ratingsResult.rows,
        rules: rulesResult.rows,
        states: statesResult.rows,
        contexts: RATING_CONTEXTS.map((value) => ({ value, label: CONTEXT_LABELS[value] || value })),
        roles: USER_ROLES,
        display_modes: DISPLAY_NAME_MODES,
      },
    });
  } catch (error) {
    console.error('Admin list platform ratings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load platform ratings' });
  }
};

exports.adminUpdateSettings = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const current = await getSettings();

    const settings = {
      flyins_enabled: normalizeBoolean(req.body.flyins_enabled, current.flyins_enabled),
      submissions_enabled: normalizeBoolean(req.body.submissions_enabled, current.submissions_enabled),
      show_user_images: normalizeBoolean(req.body.show_user_images, current.show_user_images),
      display_name_mode: normalizeDisplayMode(req.body.display_name_mode, current.display_name_mode),
      flyin_frequency_seconds: normalizeInteger(
        req.body.flyin_frequency_seconds,
        current.flyin_frequency_seconds,
        15,
        600
      ),
      min_stars_for_public: normalizeInteger(
        req.body.min_stars_for_public,
        current.min_stars_for_public,
        1,
        5
      ),
    };

    const { rows } = await db.query(
      `UPDATE platform_rating_settings
       SET flyins_enabled = $1,
           submissions_enabled = $2,
           show_user_images = $3,
           display_name_mode = $4,
           flyin_frequency_seconds = $5,
           min_stars_for_public = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [
        settings.flyins_enabled,
        settings.submissions_enabled,
        settings.show_user_images,
        settings.display_name_mode,
        settings.flyin_frequency_seconds,
        settings.min_stars_for_public,
      ]
    );

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Update platform rating settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update rating settings' });
  }
};

exports.adminModerateRating = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const ratingId = Number(req.params.ratingId);
    const status = String(req.body.status || '').trim().toLowerCase();
    if (!Number.isInteger(ratingId) || ratingId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid rating id' });
    }
    if (!['approved', 'hidden', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid rating status' });
    }

    const { rows } = await db.query(
      `UPDATE platform_service_ratings
       SET status = $2,
           admin_note = $3,
           reviewed_by = $4,
           reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [ratingId, status, String(req.body.admin_note || '').trim() || null, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Rating not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Moderate platform rating error:', error);
    res.status(500).json({ success: false, message: 'Failed to moderate rating' });
  }
};

const normalizeRulePayload = async (body) => {
  const stateId = body.state_id ? Number(body.state_id) : null;
  let stateName = String(body.state_name || '').trim() || null;

  if (stateId) {
    const stateResult = await db.query('SELECT state_name FROM states WHERE id = $1', [stateId]);
    if (!stateResult.rows.length) {
      const error = new Error('Select a valid state');
      error.statusCode = 400;
      throw error;
    }
    stateName = stateResult.rows[0].state_name;
  }

  return {
    state_id: stateId || null,
    state_name: stateName,
    lga_name: String(body.lga_name || '').trim() || null,
    user_role: normalizeOptionalChoice(body.user_role, USER_ROLES),
    rating_context: normalizeOptionalChoice(body.rating_context, RATING_CONTEXTS),
    submissions_enabled: normalizeBoolean(body.submissions_enabled, true),
    flyins_enabled: normalizeBoolean(body.flyins_enabled, true),
    notes: String(body.notes || '').trim() || null,
  };
};

exports.adminCreateRule = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const rule = await normalizeRulePayload(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO platform_rating_location_rules (
         state_id, state_name, lga_name, user_role, rating_context,
         submissions_enabled, flyins_enabled, notes, created_by, updated_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
       RETURNING *`,
      [
        rule.state_id,
        rule.state_name,
        rule.lga_name,
        rule.user_role,
        rule.rating_context,
        rule.submissions_enabled,
        rule.flyins_enabled,
        rule.notes,
        req.user.id,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create platform rating rule error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create rating rule',
    });
  }
};

exports.adminUpdateRule = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const ruleId = Number(req.params.ruleId);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid rule id' });
    }

    const rule = await normalizeRulePayload(req.body || {});
    const { rows } = await db.query(
      `UPDATE platform_rating_location_rules
       SET state_id = $2,
           state_name = $3,
           lga_name = $4,
           user_role = $5,
           rating_context = $6,
           submissions_enabled = $7,
           flyins_enabled = $8,
           notes = $9,
           updated_by = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        ruleId,
        rule.state_id,
        rule.state_name,
        rule.lga_name,
        rule.user_role,
        rule.rating_context,
        rule.submissions_enabled,
        rule.flyins_enabled,
        rule.notes,
        req.user.id,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Update platform rating rule error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update rating rule',
    });
  }
};

exports.adminDeleteRule = async (req, res) => {
  try {
    await ensurePlatformRatingSchema();
    const ruleId = Number(req.params.ruleId);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid rule id' });
    }

    const result = await db.query('DELETE FROM platform_rating_location_rules WHERE id = $1 RETURNING id', [ruleId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete platform rating rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete rating rule' });
  }
};
