/**
 * Onboarding survey service: response lifecycle + gate status.
 */

const crypto = require('crypto');
const db = require('../config/middleware/database');
const survey = require('../config/survey');

const generateRespondentCode = () =>
  `RH${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const ensureSchema = async () => {
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS survey_part_a_completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS survey_exempt BOOLEAN NOT NULL DEFAULT FALSE
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
      `SELECT * FROM survey_responses WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
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
    const { survey_type, answers, consent_flags, state_id, lga_name } = req.body;

    const type = String(survey_type || 'tenant').toLowerCase();
    if (!survey.getQuestionnaire(type)) {
      return res.status(400).json({ success: false, message: 'Unknown survey type' });
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

    const insert = await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, respondent_code, source,
          consent_flags, answers, state_id, lga_name, completed_at)
       VALUES ($1, $2, $3, 'public_link', $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING id, respondent_code`,
      [
        type,
        survey.SURVEY_VERSION,
        generateRespondentCode(),
        JSON.stringify(consent_flags || {}),
        JSON.stringify(answers || {}),
        state_id || null,
        lga_name ? String(lga_name).trim().slice(0, 120) : null,
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
