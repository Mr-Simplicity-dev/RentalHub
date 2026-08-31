/**
 * Onboarding survey service: response lifecycle + gate status.
 */

const crypto = require('crypto');
const axios = require('axios');
const db = require('../config/middleware/database');
const survey = require('../config/survey');

const generateRespondentCode = () =>
  `RH${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const generateResumeToken = () =>
  crypto.randomBytes(24).toString('base64url');

// ── Location / VPN gate ────────────────────────────────────────────────────
// The survey only runs inside the configured area and blocks VPN/proxy IPs.

const EARTH_RADIUS_KM = 6371;
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getIpGeolocation = async (ip) => {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return null;
  }
  const providers = [
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    `https://ipwho.is/${encodeURIComponent(ip)}`,
  ];
  for (const url of providers) {
    try {
      const response = await axios.get(url, { timeout: 4000 });
      const data = response.data;
      if (data && (data.country_code || data.country)) {
        return {
          country_code: String(data.country_code || data.country).toUpperCase(),
          proxy: Boolean(data.proxy),
          hosting: Boolean(data.hosting || data.security?.is_hosting),
          vpn: Boolean(data.vpn || data.security?.is_vpn || data.security?.is_proxy),
        };
      }
    } catch {
      // try next provider
    }
  }
  return null;
};

const getClientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();

const getSurveyLocationConfig = async () => {
  const [scopeRow, locationsRow] = await Promise.all([
    db.query(`SELECT value FROM app_settings WHERE key = 'survey_allowed_scope'`),
    db.query(`SELECT value FROM app_settings WHERE key = 'survey_allowed_locations'`),
  ]);
  let scope = scopeRow.rows[0]?.value?.value || 'nigeria';
  let locations = [];
  try {
    locations = JSON.parse(locationsRow.rows[0]?.value?.value || '[]');
  } catch {
    locations = [];
  }
  if (!Array.isArray(locations)) locations = [];
  return { scope, locations };
};

exports.getSurveyLocationConfigForAdmin = async () => getSurveyLocationConfig();

// Public: gate status for the client (enabled + allowed areas only).
exports.getSurveyLocationConfig = async (req, res) => {
  try {
    const flags = require('../config/middleware/featureFlags').getFeatureFlagsMap;
    const map = await flags();
    const gateEnabled = map.survey_location_gate === true;
    const config = await getSurveyLocationConfig();

    return res.json({
      success: true,
      data: {
        gate_enabled: gateEnabled,
        scope: gateEnabled ? config.scope : null,
        allowed_locations: gateEnabled
          ? config.locations.map((l) => ({
              label: l.label || `${l.lat},${l.lng}`,
              lat: Number(l.lat),
              lng: Number(l.lng),
              radius_km: Number(l.radius_km) || 30,
            }))
          : [],
      },
    });
  } catch (error) {
    req.logger.error('Survey location config error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load survey location config' });
  }
};

// Public: verify the device is inside the allowed area and not on a VPN.
exports.checkSurveyLocation = async (req, res) => {
  try {
    const flags = require('../config/middleware/featureFlags').getFeatureFlagsMap;
    const map = await flags();
    if (map.survey_location_gate !== true) {
      return res.json({ success: true, data: { allowed: true, reason: null } });
    }

    const config = await getSurveyLocationConfig();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.json({
        success: true,
        data: { allowed: false, reason: 'location_required' },
      });
    }

    // 1) Location match against the allowed scope.
    let locationOk = false;
    if (config.scope === 'locations') {
      locationOk = config.locations.some(
        (l) =>
          haversineKm(lat, lng, Number(l.lat), Number(l.lng)) <= (Number(l.radius_km) || 30)
      );
    } else {
      // nigeria scope: the country check is done via the IP below; device
      // coords must at least be a plausible latitude/longitude.
      locationOk = lat >= 3 && lat <= 15 && lng >= 2 && lng <= 15;
    }

    if (!locationOk) {
      return res.json({
        success: true,
        data: { allowed: false, reason: 'not_in_area' },
      });
    }

    // 2) IP-based country + VPN check.
    const ip = getClientIp(req);
    const ipGeo = await getIpGeolocation(ip);

    if (ipGeo) {
      if (ipGeo.proxy || ipGeo.hosting || ipGeo.vpn) {
        return res.json({
          success: true,
          data: { allowed: false, reason: 'vpn_detected', ip_country: ipGeo.country_code },
        });
      }
      if (config.scope === 'nigeria' && ipGeo.country_code && ipGeo.country_code !== 'NG') {
        return res.json({
          success: true,
          data: { allowed: false, reason: 'outside_nigeria', ip_country: ipGeo.country_code },
        });
      }
    }

    return res.json({
      success: true,
      data: { allowed: true, reason: null, ip_country: ipGeo?.country_code || null },
    });
  } catch (error) {
    req.logger.error('Survey location check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check survey location' });
  }
};

// Server-side enforcement used at draft/submit time.
const enforceLocationGate = async (req, body) => {
  const flags = require('../config/middleware/featureFlags').getFeatureFlagsMap;
  const map = await flags();
  if (map.survey_location_gate !== true) return { allowed: true };

  const config = await getSurveyLocationConfig();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { allowed: false, reason: 'location_required' };
  }

  let locationOk = false;
  if (config.scope === 'locations') {
    locationOk = config.locations.some(
      (l) => haversineKm(lat, lng, Number(l.lat), Number(l.lng)) <= (Number(l.radius_km) || 30)
    );
  } else {
    locationOk = lat >= 3 && lat <= 15 && lng >= 2 && lng <= 15;
  }
  if (!locationOk) return { allowed: false, reason: 'not_in_area' };

  const ip = getClientIp(req);
  const ipGeo = await getIpGeolocation(ip);
  if (ipGeo) {
    if (ipGeo.proxy || ipGeo.hosting || ipGeo.vpn) {
      return { allowed: false, reason: 'vpn_detected' };
    }
    if (config.scope === 'nigeria' && ipGeo.country_code && ipGeo.country_code !== 'NG') {
      return { allowed: false, reason: 'outside_nigeria' };
    }
  }

  return { allowed: true };
};

const LOCATION_REASONS = {
  location_required: 'We could not confirm your location. Please enable location access and try again.',
  not_in_area: 'The survey is only available in the allowed survey area right now.',
  vpn_detected: 'VPN connections are not allowed for this survey. Please turn off your VPN and try again.',
  outside_nigeria: 'This survey is only available to respondents in Nigeria.',
};

const ensureSchema = async () => {
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS survey_part_a_completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS survey_exempt BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.query(`
    ALTER TABLE survey_responses
      ADD COLUMN IF NOT EXISTS agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS agent_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS agent_phone VARCHAR(30),
      ADD COLUMN IF NOT EXISTS agent_lga VARCHAR(120),
      ADD COLUMN IF NOT EXISTS agent_location VARCHAR(255),
      ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS resume_token VARCHAR(64)
  `);
};

exports.getMySurveyStatus = async (req, res) => {
  try {
    await ensureSchema();

    const userResult = await db.query(
      `SELECT survey_part_a_completed_at, survey_completed_at, survey_exempt, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const row = userResult.rows[0] || {};

    const existing = await db.query(
      `SELECT id, survey_type, source, part_a_completed_at, completed_at
       FROM survey_responses WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );

    const exempt = row.survey_exempt === true;
    const response = existing.rows[0] || null;

    return res.json({
      success: true,
      data: {
        required: !exempt,
        exempt,
        user_type: req.user.user_type,
        survey_type: req.user.user_type === 'landlord' ? 'landlord' : 'tenant',
        part_a_done: Boolean(
          row.survey_part_a_completed_at || (response && response.part_a_completed_at)
        ),
        completed: Boolean(row.survey_completed_at || (response && response.completed_at)),
        response_id: response ? response.id : null,
        survey_version: survey.SURVEY_VERSION,
        created_at: row.created_at,
      },
    });
  } catch (error) {
    req.logger.error('Survey status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load survey status' });
  }
};

exports.startSurvey = async (req, res) => {
  try {
    await ensureSchema();

    const userResult = await db.query(
      `SELECT user_type, survey_completed_at, survey_exempt, preferred_state_id, preferred_lga_name
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const surveyType = user.user_type === 'landlord' ? 'landlord' : 'tenant';

    const existing = await db.query(
      `SELECT * FROM survey_responses
       WHERE user_id = $1 AND superseded_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length && existing.rows[0].completed_at) {
      return res.json({
        success: true,
        data: { response: existing.rows[0], already_completed: true },
      });
    }

    if (existing.rows.length) {
      return res.json({
        success: true,
        data: { response: existing.rows[0], already_completed: false },
      });
    }

    const insert = await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, user_id, respondent_code, source,
          state_id, lga_name)
       VALUES ($1, $2, $3, $4, 'online', $5, $6)
       RETURNING *`,
      [
        surveyType,
        survey.SURVEY_VERSION,
        req.user.id,
        generateRespondentCode(),
        user.preferred_state_id || null,
        user.preferred_lga_name || null,
      ]
    );

    return res.status(201).json({ success: true, data: { response: insert.rows[0] } });
  } catch (error) {
    req.logger.error('Survey start error:', error);
    return res.status(500).json({ success: false, message: 'Failed to start survey' });
  }
};

// Public draft: save progress anonymously with a resume token (no login).
exports.savePublicDraft = async (req, res) => {
  try {
    const { survey_type, answers, consent_flags, resume_token, contact, agent } = req.body;

    const type = String(survey_type || 'tenant').toLowerCase();
    if (!survey.getQuestionnaire(type)) {
      return res.status(400).json({ success: false, message: 'Unknown survey type' });
    }

    // Location/VPN gate — enforced on every draft save.
    const gate = await enforceLocationGate(req, req.body || {});
    if (!gate.allowed) {
      return res.status(403).json({
        success: false,
        code: 'LOCATION_BLOCKED',
        message: LOCATION_REASONS[gate.reason] || 'Survey unavailable at this location',
      });
    }

    const token = String(resume_token || '').slice(0, 64) || generateResumeToken();

    const agentUser = req.user?.user_type === 'marketing_agent' ? req.user : null;
    const agentName = String(agent?.name || agentUser?.full_name || '').trim().slice(0, 200);
    const agentPhone = String(agent?.phone || agentUser?.phone || '').replace(/\s+/g, '').slice(0, 30);
    const agentLga = String(agent?.lga || '').trim().slice(0, 120);
    const agentLocation = String(agent?.location || '').trim().slice(0, 255);

    const existing = await db.query(
      `SELECT id FROM survey_responses WHERE resume_token = $1 AND completed_at IS NULL`,
      [token]
    );

    if (existing.rows.length) {
      await db.query(
        `UPDATE survey_responses
         SET answers = answers || $2::jsonb,
             consent_flags = consent_flags || $3::jsonb,
             agent_user_id = COALESCE(agent_user_id, $4),
             agent_name = COALESCE(NULLIF($5, ''), agent_name),
             agent_phone = COALESCE(NULLIF($6, ''), agent_phone),
             agent_lga = COALESCE(NULLIF($7, ''), agent_lga),
             agent_location = COALESCE(NULLIF($8, ''), agent_location),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          existing.rows[0].id,
          JSON.stringify(answers || {}),
          JSON.stringify(consent_flags || {}),
          agentUser ? agentUser.id : null,
          agentName,
          agentPhone,
          agentLga,
          agentLocation,
        ]
      );
      return res.json({ success: true, data: { resume_token: token, draft: true } });
    }

    await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, respondent_code, source,
          resume_token, consent_flags, answers,
          agent_user_id, agent_name, agent_phone, agent_lga, agent_location)
       VALUES ($1, $2, $3, 'public_link', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        type,
        survey.SURVEY_VERSION,
        generateRespondentCode(),
        token,
        JSON.stringify(consent_flags || {}),
        JSON.stringify(answers || {}),
        agentUser ? agentUser.id : null,
        agentName,
        agentPhone,
        agentLga,
        agentLocation,
      ]
    );

    return res.status(201).json({ success: true, data: { resume_token: token, draft: true } });
  } catch (error) {
    req.logger.error('Public survey draft error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save survey draft' });
  }
};

// Resume an anonymous draft by token.
exports.resumeSurvey = async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || '').trim();

    if (!token) {
      return res.status(400).json({ success: false, message: 'resume token is required' });
    }

    const result = await db.query(
      `SELECT id, survey_type, survey_version, respondent_code, source,
              answers, consent_flags, completed_at, superseded_at
       FROM survey_responses
       WHERE resume_token = $1
       LIMIT 1`,
      [token]
    );

    if (result.rows.length === 0 || result.rows[0].superseded_at) {
      return res.status(404).json({ success: false, message: 'Draft not found or expired' });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        response_id: row.id,
        survey_type: row.survey_type,
        answers: row.answers || {},
        consent_flags: row.consent_flags || {},
        completed: Boolean(row.completed_at),
      },
    });
  } catch (error) {
    req.logger.error('Survey resume error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resume survey' });
  }
};

// Link an anonymous draft to the logged-in user (no re-survey on registration).
exports.claimSurveyDraft = async (req, res) => {
  try {
    const token = String(req.body?.resume_token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'resume_token is required' });
    }

    const result = await db.query(
      `UPDATE survey_responses
       SET user_id = $1,
           source = CASE WHEN source = 'public_link' THEN 'online' ELSE source END
       WHERE resume_token = $2
         AND user_id IS NULL
         AND superseded_at IS NULL
       RETURNING id, survey_type, part_a_completed_at, completed_at, answers, consent_flags`,
      [req.user.id, token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Draft not found or already claimed' });
    }

    const row = result.rows[0];
    if (row.completed_at) {
      await db.query(
        `UPDATE users
         SET survey_part_a_completed_at = COALESCE(survey_part_a_completed_at, CURRENT_TIMESTAMP),
             survey_completed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [req.user.id]
      );
    } else if (row.part_a_completed_at) {
      await db.query(
        `UPDATE users SET survey_part_a_completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [req.user.id]
      );
    }

    return res.json({
      success: true,
      data: {
        response_id: row.id,
        survey_type: row.survey_type,
        answers: row.answers || {},
        consent_flags: row.consent_flags || {},
        completed: Boolean(row.completed_at),
      },
    });
  } catch (error) {
    req.logger.error('Survey claim error:', error);
    return res.status(500).json({ success: false, message: 'Failed to claim survey' });
  }
};

// Restart a survey: supersede the old record (never analysed again) and start fresh.
exports.restartSurvey = async (req, res) => {
  try {
    const { response_id } = req.body;

    const ownership = await db.query(
      `SELECT * FROM survey_responses WHERE id = $1 AND user_id = $2`,
      [response_id, req.user.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await db.query(
      `UPDATE survey_responses SET superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [response_id]
    );
    await db.query(
      `UPDATE users SET survey_part_a_completed_at = NULL, survey_completed_at = NULL WHERE id = $1`,
      [req.user.id]
    );

    const userResult = await db.query(
      `SELECT user_type, preferred_state_id, preferred_lga_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    const surveyType = user.user_type === 'landlord' ? 'landlord' : 'tenant';

    const insert = await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, user_id, respondent_code, source,
          state_id, lga_name)
       VALUES ($1, $2, $3, $4, 'online', $5, $6)
       RETURNING *`,
      [
        surveyType,
        survey.SURVEY_VERSION,
        req.user.id,
        generateRespondentCode(),
        user.preferred_state_id || null,
        user.preferred_lga_name || null,
      ]
    );

    return res.json({ success: true, data: { response: insert.rows[0] } });
  } catch (error) {
    req.logger.error('Survey restart error:', error);
    return res.status(500).json({ success: false, message: 'Failed to restart survey' });
  }
};

exports.saveSurvey = async (req, res) => {
  try {
    const { response_id, answers, consent_flags } = req.body;

    if (!response_id) {
      return res.status(400).json({ success: false, message: 'response_id is required' });
    }

    const ownership = await db.query(
      `SELECT id FROM survey_responses WHERE id = $1 AND user_id = $2`,
      [response_id, req.user.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const merged = await db.query(
      `UPDATE survey_responses
       SET answers = answers || $2::jsonb,
           consent_flags = consent_flags || $3::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [response_id, JSON.stringify(answers || {}), JSON.stringify(consent_flags || {})]
    );

    return res.json({ success: true, data: { response: merged.rows[0] } });
  } catch (error) {
    req.logger.error('Survey save error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save survey' });
  }
};

exports.completePartA = async (req, res) => {
  try {
    const { response_id } = req.body;

    const ownership = await db.query(
      `SELECT * FROM survey_responses WHERE id = $1 AND user_id = $2`,
      [response_id, req.user.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const response = ownership.rows[0];
    const complete = survey.isPartAComplete(
      response.survey_type,
      response.answers || {},
      response.consent_flags || {}
    );

    if (!complete) {
      return res.status(400).json({
        success: false,
        code: 'PART_A_INCOMPLETE',
        message: 'Please answer the required questions to continue',
      });
    }

    await db.query(
      `UPDATE survey_responses
       SET part_a_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [response_id]
    );
    await db.query(
      `UPDATE users SET survey_part_a_completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.user.id]
    );

    return res.json({ success: true, message: 'Survey part A completed' });
  } catch (error) {
    req.logger.error('Survey part A completion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to complete survey section' });
  }
};

exports.completeSurvey = async (req, res) => {
  try {
    const { response_id, time_spent_seconds } = req.body;

    const ownership = await db.query(
      `SELECT * FROM survey_responses WHERE id = $1 AND user_id = $2`,
      [response_id, req.user.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const response = ownership.rows[0];

    // Consent-screened-out respondents count as completed (no forced answers).
    const consentQuestions = survey
      .getPartAQuestions(response.survey_type)
      .filter((q) => q.analysis === 'consent');
    const screenedOut = consentQuestions.some(
      (q) => response.answers?.[q.key] && q.endsOn && response.answers[q.key] === q.endsOn
    );

    if (!screenedOut && !survey.isPartAComplete(response.survey_type, response.answers || {}, {})) {
      return res.status(400).json({
        success: false,
        code: 'PART_A_INCOMPLETE',
        message: 'Please answer the required questions to continue',
      });
    }

    await db.query(
      `UPDATE survey_responses
       SET completed_at = CURRENT_TIMESTAMP,
           part_a_completed_at = COALESCE(part_a_completed_at, CURRENT_TIMESTAMP),
           time_spent_seconds = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [response_id, Math.max(0, Number(time_spent_seconds) || 0)]
    );
    await db.query(
      `UPDATE users
       SET survey_part_a_completed_at = COALESCE(survey_part_a_completed_at, CURRENT_TIMESTAMP),
           survey_completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.user.id]
    );

    return res.json({ success: true, message: 'Survey completed. Thank you!' });
  } catch (error) {
    req.logger.error('Survey completion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to complete survey' });
  }
};

exports.getSurveyDefinition = async (req, res) => {
  try {
    const type = String(req.query.type || 'tenant').toLowerCase();
    const lang = String(req.query.lang || 'en').toLowerCase();

    const questionnaire = survey.getQuestionnaire(type);
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Unknown survey type' });
    }

    const localize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      return obj[lang] || obj.en || '';
    };

    const questions = questionnaire.questions.map((question) => ({
      key: question.key,
      section: question.section,
      part: question.part,
      type: question.type,
      required: question.required !== false,
      minSeconds: question.minSeconds || 0,
      endsOn: question.endsOn || null,
      maxPicks: question.maxPicks || null,
      rankSource: question.rankSource || null,
      analysis: question.analysis || null,
      prompt: localize(question.prompt),
      options: question.options
        ? question.options.map((option) => ({
            v: option.v,
            label: localize(option),
          }))
        : null,
      labels: question.labels
        ? Object.fromEntries(
            Object.entries(question.labels).map(([value, labelObj]) => [
              value,
              localize(labelObj),
            ])
          )
        : null,
    }));

    return res.json({
      success: true,
      data: {
        type,
        survey_type_label: type === 'landlord' ? 'Landlord' : 'Tenant',
        version: survey.SURVEY_VERSION,
        part_a_sections: survey.PART_A_KEYS[type],
        sections: questionnaire.sections,
        questions,
      },
    });
  } catch (error) {
    req.logger.error('Survey definition error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load survey' });
  }
};

exports.submitPublicSurvey = async (req, res) => {
  try {
    const { survey_type, answers, consent_flags, state_id, lga_name, contact, resume_token, agent } = req.body;

    const type = String(survey_type || 'tenant').toLowerCase();
    if (!survey.getQuestionnaire(type)) {
      return res.status(400).json({ success: false, message: 'Unknown survey type' });
    }

    // Agent attribution (marketing agents conduct surveys via the public page)
    const agentUser = req.user?.user_type === 'marketing_agent' ? req.user : null;
    const agentName = String(agent?.name || agentUser?.full_name || '').trim().slice(0, 200);
    const agentPhone = String(agent?.phone || agentUser?.phone || '').replace(/\s+/g, '').slice(0, 30);
    const agentLga = String(agent?.lga || '').trim().slice(0, 120);
    const agentLocation = String(agent?.location || '').trim().slice(0, 255);
    const agentMode = String(agent?.admin_mode || (agentUser ? 'face_to_face' : '') || '').trim().slice(0, 20) || null;

    // Contact capture: name + phone required for public/paper respondents;
    // email optional with an explicit "no email" choice.
    const contactName = String(contact?.name || '').trim().slice(0, 200);
    const contactPhone = String(contact?.phone || '').replace(/\s+/g, '').slice(0, 30);
    const contactEmail = String(contact?.email || '').trim().toLowerCase().slice(0, 255);
    const noEmail = contact?.no_email === true || !contactEmail;
    const contactLocation = String(contact?.location || '').trim().slice(0, 255);
    const contactStateOfOrigin = String(contact?.state_of_origin || '').trim().slice(0, 120);

    if (!contactName || !contactPhone) {
      return res.status(400).json({
        success: false,
        code: 'CONTACT_REQUIRED',
        message: 'Respondent name and phone number are required',
      });
    }

    // Location/VPN gate — enforced on final submission too.
    const gate = await enforceLocationGate(req, req.body || {});
    if (!gate.allowed) {
      return res.status(403).json({
        success: false,
        code: 'LOCATION_BLOCKED',
        message: LOCATION_REASONS[gate.reason] || 'Survey unavailable at this location',
      });
    }

    const screenedOut = survey
      .getPartAQuestions(type)
      .filter((q) => q.analysis === 'consent')
      .some((q) => answers?.[q.key] && q.endsOn && answers[q.key] === q.endsOn);

    if (!screenedOut && !survey.isPartAComplete(type, answers || {}, {})) {
      return res.status(400).json({
        success: false,
        code: 'PART_A_INCOMPLETE',
        message: 'Please answer the required questions',
      });
    }

    // Resume-token submission completes the existing draft instead of duplicating.
    const token = String(resume_token || '').trim();
    if (token) {
      const draft = await db.query(
        `SELECT id FROM survey_responses WHERE resume_token = $1 AND completed_at IS NULL`,
        [token]
      );
      if (draft.rows.length) {
        await db.query(
          `UPDATE survey_responses
           SET consent_flags = consent_flags || $2::jsonb,
               answers = answers || $3::jsonb,
               completed_at = CURRENT_TIMESTAMP,
               part_a_completed_at = COALESCE(part_a_completed_at, CURRENT_TIMESTAMP),
               time_spent_seconds = $4,
               respondent_name = COALESCE(NULLIF($5, ''), respondent_name),
               respondent_phone = COALESCE(NULLIF($6, ''), respondent_phone),
               respondent_email = COALESCE($7, respondent_email),
               has_email = COALESCE($8, has_email),
               respondent_location = COALESCE(NULLIF($9, ''), respondent_location),
               respondent_state_of_origin = COALESCE(NULLIF($10, ''), respondent_state_of_origin),
               agent_user_id = COALESCE(agent_user_id, $11),
               agent_name = COALESCE(NULLIF($12, ''), agent_name),
               agent_phone = COALESCE(NULLIF($13, ''), agent_phone),
               agent_lga = COALESCE(NULLIF($14, ''), agent_lga),
               agent_location = COALESCE(NULLIF($15, ''), agent_location),
               admin_mode = COALESCE(NULLIF($16, ''), admin_mode),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, respondent_code`,
          [
            draft.rows[0].id,
            JSON.stringify(consent_flags || {}),
            JSON.stringify(answers || {}),
            Math.max(0, Number(req.body.time_spent_seconds) || 0),
            contactName,
            contactPhone,
            noEmail ? null : contactEmail,
            !noEmail,
            contactLocation || null,
            contactStateOfOrigin || null,
            agentUser ? agentUser.id : null,
            agentName,
            agentPhone,
            agentLga,
            agentLocation,
            agentMode,
          ]
        );
        return res.status(200).json({
          success: true,
          message: 'Survey submitted. Thank you for your time!',
          data: { respondent_code: draft.rows[0].respondent_code },
        });
      }
    }

    const insert = await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, respondent_code, source,
          consent_flags, answers, state_id, lga_name, completed_at,
          respondent_name, respondent_phone, respondent_email,
          respondent_location, respondent_state_of_origin, has_email,
          agent_user_id, agent_name, agent_phone, agent_lga, agent_location, admin_mode)
       VALUES ($1, $2, $3, 'public_link', $4, $5, $6, $7, CURRENT_TIMESTAMP,
               $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id, respondent_code`,
      [
        type,
        survey.SURVEY_VERSION,
        generateRespondentCode(),
        JSON.stringify(consent_flags || {}),
        JSON.stringify(answers || {}),
        state_id || null,
        lga_name ? String(lga_name).trim().slice(0, 120) : null,
        contactName,
        contactPhone,
        noEmail ? null : contactEmail,
        contactLocation || null,
        contactStateOfOrigin || null,
        !noEmail,
        agentUser ? agentUser.id : null,
        agentName || null,
        agentPhone || null,
        agentLga || null,
        agentLocation || null,
        agentMode,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Survey submitted. Thank you for your time!',
      data: { respondent_code: insert.rows[0].respondent_code },
    });
  } catch (error) {
    req.logger.error('Public survey submit error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit survey' });
  }
};
