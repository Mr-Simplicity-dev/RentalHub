/**
 * Survey analysis engine: turns raw survey_responses into business-ready
 * analysis: frequencies, likert rankings, NPS, feature priority, fee
 * preferences, fraud stats, state breakdowns, open answers, and the
 * projections machine (revenue / expenses / staffing / funding duration).
 */

const db = require('../config/middleware/database');
const survey = require('../config/survey');

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ── Raw loading ────────────────────────────────────────────────────────────

const loadResponses = async ({ type, from, to, source, completedOnly = true }) => {
  const params = [];
  const clauses = [];

  if (type) {
    params.push(type);
    clauses.push(`survey_type = $${params.length}`);
  }
  if (completedOnly) {
    clauses.push('completed_at IS NOT NULL');
  }
  clauses.push('superseded_at IS NULL');
  if (from) {
    params.push(from);
    clauses.push(`completed_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`completed_at <= $${params.length}`);
  }
  if (source) {
    params.push(source);
    clauses.push(`source = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT sr.*, u.user_type,
            s.state_name AS state_name,
            u.email AS user_email, u.full_name AS user_full_name
     FROM survey_responses sr
     LEFT JOIN users u ON u.id = sr.user_id
     LEFT JOIN states s ON s.id = sr.state_id
     ${where}
     ORDER BY sr.completed_at DESC`,
    params
  );
  return result.rows;
};

// ── Per-question frequencies ───────────────────────────────────────────────

const buildFrequencies = (type, rows) => {
  const questions = survey.getQuestions(type);
  const out = [];

  for (const question of questions) {
    const counts = {};
    let answered = 0;
    let likertSum = 0;
    let likertCount = 0;

    for (const row of rows) {
      const value = row.answers?.[question.key];
      if (value === undefined || value === null || value === '') continue;
      answered++;

      if (question.type === 'multi' && Array.isArray(value)) {
        for (const v of value) counts[v] = (counts[v] || 0) + 1;
      } else if (question.type === 'likert') {
        const num = Number(value);
        if (Number.isFinite(num)) {
          counts[String(num)] = (counts[String(num)] || 0) + 1;
          likertSum += num;
          likertCount++;
        }
      } else if (question.type === 'rank' && Array.isArray(value)) {
        for (const v of value) counts[v] = (counts[v] || 0) + 1;
      } else {
        counts[String(value)] = (counts[String(value)] || 0) + 1;
      }
    }

    const optionLabels = {};
    for (const option of question.options || []) {
      optionLabels[option.v] = option.en;
    }
    if (question.labels) {
      for (const [v, label] of Object.entries(question.labels)) {
        optionLabels[v] = label.en;
      }
    }

    out.push({
      key: question.key,
      section: question.section,
      type: question.type,
      analysis: question.analysis,
      part: question.part,
      prompt: question.prompt.en,
      answered,
      counts,
      labels: optionLabels,
      mean: likertCount ? Math.round((likertSum / likertCount) * 100) / 100 : null,
      likertCount,
    });
  }

  return out;
};

// ── Derived reports ────────────────────────────────────────────────────────

const buildNPS = (rows, npsKey) => {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let total = 0;

  for (const row of rows) {
    const value = Number(row.answers?.[npsKey]);
    if (!Number.isFinite(value)) continue;
    total++;
    if (value >= 9) promoters++;
    else if (value >= 7) passives++;
    else detractors++;
  }

  const score = total
    ? Math.round(((promoters - detractors) / total) * 1000) / 10
    : null;

  return {
    score,
    promoters,
    passives,
    detractors,
    total,
  };
};

const buildFeatureRanking = (type, rows, frequencies) => {
  // Importance means from the feature likert questions
  const featureQuestions = survey
    .getQuestions(type)
    .filter((q) => q.analysis === 'feature' && q.type === 'likert');

  const importance = featureQuestions
    .map((q) => {
      const freq = frequencies.find((f) => f.key === q.key);
      return {
        key: q.key,
        prompt: q.prompt.en,
        mean: freq?.mean || null,
      };
    })
    .sort((a, b) => (b.mean || 0) - (a.mean || 0));

  // Top-3 picks
  const pickCounts = {};
  const pickQuestions = survey
    .getQuestions(type)
    .filter((q) => q.type === 'rank');
  for (const row of rows) {
    for (const pickQuestion of pickQuestions) {
      const picks = row.answers?.[pickQuestion.key];
      if (!Array.isArray(picks)) continue;
      for (const p of picks) pickCounts[p] = (pickCounts[p] || 0) + 1;
    }
  }

  const rankSourceLabels = {};
  for (const q of featureQuestions) rankSourceLabels[q.key] = q.prompt.en;

  const picks = Object.entries(pickCounts)
    .map(([key, count]) => ({
      key,
      label: rankSourceLabels[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { importance, picks };
};

const buildOpenAnswers = (type, rows) => {
  const openQuestions = survey
    .getQuestions(type)
    .filter((q) => q.type === 'text');

  const sections = openQuestions.map((q) => {
    const answers = rows
      .map((row) => ({
        respondent: row.respondent_code,
        state: row.state_name || null,
        source: row.source,
        text: String(row.answers?.[q.key] || '').trim(),
      }))
      .filter((a) => a.text.length > 0);

    // Simple keyword frequency for themes (Nigerian rental vocabulary)
    const stop = new Set([
      'the', 'and', 'that', 'have', 'with', 'from', 'they', 'there', 'this',
      'what', 'when', 'were', 'been', 'will', 'would', 'should', 'about',
      'into', 'them', 'their', 'then', 'some', 'very', 'just', 'also', 'rent',
      'rental', 'property', 'house', 'home', 'nigeria', 'really', 'often',
      'much', 'because', 'being', 'than', 'which', 'your', 'youre', 'have',
      'landlord', 'landlords', 'agent', 'agents', 'things', 'thing', 'make',
      'made', 'people', 'find', 'found', 'getting', 'get', 'got', 'pay',
      'paid', 'paying', 'money', 'one', 'two', 'first', 'time', 'year',
      'years', 'never', 'always', 'sometimes', 'could', 'would', 'should',
    ]);

    const keywordCounts = {};
    for (const a of answers) {
      const words = a.text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stop.has(w));
      for (const w of words) keywordCounts[w] = (keywordCounts[w] || 0) + 1;
    }

    const keywords = Object.entries(keywordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      key: q.key,
      prompt: q.prompt.en,
      answerCount: answers.length,
      keywords,
      answers: answers.slice(0, 100),
    };
  });

  return sections;
};

// ── Full analysis bundle ───────────────────────────────────────────────────

const computeAnalysis = async ({ type, from, to, source }) => {
  const rows = await loadResponses({
    type,
    from: from || null,
    to: to || null,
    source: source || null,
  });

  const frequencies = buildFrequencies(type, rows);
  const nps = buildNPS(rows, type === 'landlord' ? 'L9.8' : 'T8.9');
  const feature = buildFeatureRanking(type, rows, frequencies);
  const open = buildOpenAnswers(type, rows);

  const total = rows.length;
  const completed = rows.filter((r) => r.completed_at).length;
  const byState = {};
  for (const row of rows) {
    const key = row.state_name || 'Unknown';
    byState[key] = (byState[key] || 0) + 1;
  }
  const stateBreakdown = Object.entries(byState)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  const bySource = {};
  for (const row of rows) {
    bySource[row.source] = (bySource[row.source] || 0) + 1;
  }

  const avgTime = rows.length
    ? Math.round(
        rows.reduce((s, r) => s + Number(r.time_spent_seconds || 0), 0) / rows.length
      )
    : 0;

  return {
    type,
    version: survey.SURVEY_VERSION,
    meta: {
      total,
      completed,
      avg_time_seconds: avgTime,
      by_state: stateBreakdown,
      by_source: bySource,
    },
    nps,
    frequencies,
    feature,
    open_answers: open,
    generated_at: new Date().toISOString(),
  };
};

exports.getAnalysis = async (req, res) => {
  try {
    const type = String(req.query.type || 'tenant').toLowerCase();
    if (!survey.getQuestionnaire(type)) {
      return res.status(404).json({ success: false, message: 'Unknown survey type' });
    }

    const data = await computeAnalysis({
      type,
      from: req.query.from || null,
      to: req.query.to || null,
      source: req.query.source || null,
    });

    return res.json({ success: true, data });
  } catch (error) {
    req.logger.error('Survey analysis error:', error);
    return res.status(500).json({ success: false, message: 'Failed to run survey analysis' });
  }
};

exports.computeAnalysis = computeAnalysis;

// ── Projections machine ────────────────────────────────────────────────────
// Converts survey signals into revenue/expense/staffing/funding scenarios.

const DEPARTMENTS = [
  { key: 'development', label: 'App development & maintenance' },
  { key: 'marketing', label: 'Marketing & growth' },
  { key: 'support', label: 'Customer support' },
  { key: 'legal', label: 'Legal, verification & compliance' },
  { key: 'staff', label: 'Staff salaries & welfare' },
  { key: 'infrastructure', label: 'Servers, hosting & tooling' },
];

const DEFAULT_COST_MODEL = {
  cost_per_user_per_year: 2500, // support+infra per active user
  dev_monthly: 450000,
  marketing_monthly: 400000,
  support_per_1000_users: 1.2, // FTE per 1000 active users
  staff_annual_per_fte: 2400000,
};

exports.getProjections = async (req, res) => {
  try {
    const type = String(req.query.type || 'tenant').toLowerCase();
    const users = clamp(Number(req.query.users) || 10000, 0, 10000000);
    const avgTransaction = clamp(Number(req.query.avg_transaction) || 500000, 0, 100000000);

    // Survey willingness-to-pay signals
    const rows = await loadResponses({ type });
    const feeFreq = {};
    for (const row of rows) {
      const v = row.answers?.[type === 'landlord' ? 'L9.6' : 'T8.7'];
      if (v) feeFreq[v] = (feeFreq[v] || 0) + 1;
    }
    const feeTotal = Object.values(feeFreq).reduce((a, b) => a + b, 0);
    const willPayPct = feeTotal
      ? Math.round(
          ((feeFreq['lt2k'] || 0) + (feeFreq['2_4_9'] || 0) + (feeFreq['5_9_9'] || 0) +
            (feeFreq['10_24_9'] || 0) + (feeFreq['25k_plus'] || 0) + (feeFreq['lt5k'] || 0) +
            (feeFreq['5_19'] || 0) + (feeFreq['20_49'] || 0) + (feeFreq['50k_plus'] || 0) +
            (feeFreq['pct'] || 0)) / feeTotal) * 100
        : 45;

    // Suggested platform fee per successful transaction from survey bands
    const suggestFee = (() => {
      if (type === 'landlord') {
        const weighted =
          (feeFreq['lt5k'] || 0) * 2500 +
          (feeFreq['5_19'] || 0) * 12500 +
          (feeFreq['20_49'] || 0) * 35000 +
          (feeFreq['50k_plus'] || 0) * 60000 +
          (feeFreq['pct'] || 0) * (avgTransaction * 0.05);
        return feeTotal ? Math.round(weighted / feeTotal) : 15000;
      }
      const weighted =
        (feeFreq['lt2k'] || 0) * 1000 +
        (feeFreq['2_4_9'] || 0) * 3500 +
        (feeFreq['5_9_9'] || 0) * 7500 +
        (feeFreq['10_24_9'] || 0) * 17500 +
        (feeFreq['25k_plus'] || 0) * 30000 +
        (feeFreq['replaces'] || 0) * 5000;
      return feeTotal ? Math.round(weighted / feeTotal) : 3500;
    })();

    // Revenue scenarios: low / medium / high adoption × conversion
    const scenarios = ['low', 'medium', 'high'].map((name) => {
      const adoption = name === 'low' ? 0.1 : name === 'medium' ? 0.25 : 0.4;
      const activeUsers = Math.round(users * adoption);
      const payingPct = willPayPct / 100;
      const annualTransactionsPerUser = name === 'low' ? 0.8 : name === 'medium' ? 1.2 : 1.6;

      const feeRevenue = Math.round(
        activeUsers * payingPct * annualTransactionsPerUser * suggestFee
      );
      const premiumRevenue = Math.round(
        activeUsers * 0.03 * (name === 'low' ? 10000 : name === 'medium' ? 15000 : 20000)
      );

      const model = { ...DEFAULT_COST_MODEL };
      const supportFte = Math.max(1, Math.round((activeUsers / 1000) * model.support_per_1000_users));
      const annualCosts = {
        development: model.dev_monthly * 12,
        marketing: model.marketing_monthly * 12,
        support: Math.round(supportFte * model.staff_annual_per_fte * 0.4),
        legal: Math.round(activeUsers * 500),
        staff: supportFte * model.staff_annual_per_fte,
        infrastructure: Math.round(activeUsers * 1200),
      };
      const totalCost = Object.values(annualCosts).reduce((a, b) => a + b, 0);
      const revenue = feeRevenue + premiumRevenue;
      const profit = revenue - totalCost;

      // Department needing the most money (share of costs)
      const departments = DEPARTMENTS.map((d) => ({
        key: d.key,
        label: d.label,
        annual: annualCosts[d.key],
        share_pct: totalCost ? Math.round((annualCosts[d.key] / totalCost) * 100) : 0,
      })).sort((a, b) => b.annual - a.annual);

      // Funding duration: months before profit covers the requested budget
      const requestedBudget = clamp(Number(req.query.budget) || 5000000, 0, 500000000);
      const monthlyBurn = totalCost / 12;
      const durationMonths = monthlyBurn > 0 ? Math.round(requestedBudget / monthlyBurn) : 0;

      return {
        scenario: name,
        adoption,
        active_users: activeUsers,
        paying_pct: Math.round(payingPct * 100),
        fee_revenue: feeRevenue,
        premium_revenue: premiumRevenue,
        revenue,
        total_cost: totalCost,
        profit,
        support_fte: supportFte,
        top_department: departments[0],
        departments,
        funding: {
          requested_budget: requestedBudget,
          duration_months: durationMonths,
          recommendation:
            durationMonths >= 12
              ? `A ₦${requestedBudget.toLocaleString()} budget covers ~${durationMonths} months of operations in the ${name} scenario.`
              : `In the ${name} scenario the budget lasts only ~${durationMonths} months — consider a higher budget or faster monetisation.`,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        type,
        users_assumed: users,
        avg_transaction: avgTransaction,
        will_pay_pct: willPayPct,
        suggested_fee: suggestFee,
        suggested_fee_label: `₦${suggestFee.toLocaleString()}`,
        scenarios,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    req.logger.error('Survey projections error:', error);
    return res.status(500).json({ success: false, message: 'Failed to run projections' });
  }
};

// ── Response list for the admin tab (paper entry + review) ─────────────────

exports.listResponses = async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));

    const params = [];
    const clauses = ['1=1'];
    if (type !== 'all') {
      params.push(type);
      clauses.push(`sr.survey_type = $${params.length}`);
    }
    if (req.query.source) {
      params.push(req.query.source);
      clauses.push(`sr.source = $${params.length}`);
    }

    const where = clauses.join(' AND ');
    const countResult = await db.query(
      `SELECT COUNT(*) FROM survey_responses sr WHERE ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    const result = await db.query(
      `SELECT sr.id, sr.survey_type, sr.survey_version, sr.respondent_code, sr.source,
              sr.admin_mode, sr.admin_date, sr.state_id, sr.lga_name,
              sr.respondent_name, sr.respondent_phone, sr.respondent_email,
              sr.respondent_location, sr.respondent_state_of_origin, sr.has_email,
              sr.agent_user_id, sr.agent_name, sr.agent_phone,
              sr.agent_lga, sr.agent_location,
              sr.part_a_completed_at, sr.completed_at, sr.time_spent_seconds,
              sr.created_at,
              s.state_name, u.full_name AS user_full_name, u.email AS user_email
       FROM survey_responses sr
       LEFT JOIN states s ON s.id = sr.state_id
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE ${where} AND sr.superseded_at IS NULL
       ORDER BY sr.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    return res.json({
      success: true,
      data: { total, page, limit, responses: result.rows },
    });
  } catch (error) {
    req.logger.error('Survey responses list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list survey responses' });
  }
};

exports.paperEntry = async (req, res) => {
  try {
    const {
      survey_type,
      answers,
      consent_flags,
      admin_mode,
      admin_date,
      state_id,
      state_name,
      lga_name,
      contact,
    } = req.body;

    const type = String(survey_type || 'tenant').toLowerCase();
    if (!survey.getQuestionnaire(type)) {
      return res.status(400).json({ success: false, message: 'Unknown survey type' });
    }

    const contactName = String(contact?.name || '').trim().slice(0, 200);
    const contactPhone = String(contact?.phone || '').replace(/\s+/g, '').slice(0, 30);
    const contactEmail = String(contact?.email || '').trim().toLowerCase().slice(0, 255);
    const noEmail = contact?.no_email === true || !contactEmail;
    const contactLocation = String(contact?.location || '').trim().slice(0, 255);
    const contactStateOfOrigin = String(contact?.state_of_origin || '').trim().slice(0, 120);

    // Resolve the typed state name to a state id when it matches; otherwise
    // store only the LGA text (paper forms often carry handwritten names).
    let resolvedStateId = state_id ? Number(state_id) || null : null;
    if (!resolvedStateId && req.body.state_name) {
      const stateMatch = await db.query(
        `SELECT id FROM states WHERE state_name ILIKE $1 LIMIT 1`,
        [String(req.body.state_name).trim()]
      );
      if (stateMatch.rows.length) resolvedStateId = stateMatch.rows[0].id;
    }

    const insert = await db.query(
      `INSERT INTO survey_responses
         (survey_type, survey_version, respondent_code, source,
          admin_mode, admin_date, state_id, lga_name,
          consent_flags, answers, part_a_completed_at, completed_at,
          respondent_name, respondent_phone, respondent_email,
          respondent_location, respondent_state_of_origin, has_email)
       VALUES ($1, $2, $3, 'paper_entry', $4, $5, $6, $7, $8, $9,
               CASE WHEN $10 THEN CURRENT_TIMESTAMP ELSE NULL END,
               CASE WHEN $10 THEN CURRENT_TIMESTAMP ELSE NULL END,
               $11, $12, $13, $14, $15, $16)
       RETURNING id, respondent_code`,
      [
        type,
        survey.SURVEY_VERSION,
        generateRespondentCode(),
        admin_mode || 'face_to_face',
        admin_date || null,
        resolvedStateId,
        lga_name ? String(lga_name).trim().slice(0, 120) : null,
        JSON.stringify(consent_flags || {}),
        JSON.stringify(answers || {}),
        Boolean(req.body.mark_complete),
        contactName,
        contactPhone,
        noEmail ? null : contactEmail,
        contactLocation || null,
        contactStateOfOrigin || null,
        !noEmail,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Paper response recorded',
      data: { respondent_code: insert.rows[0].respondent_code },
    });
  } catch (error) {
    req.logger.error('Survey paper entry error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record paper response' });
  }
};

exports.deleteResponse = async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM survey_responses WHERE id = $1 RETURNING id`,
      [req.params.responseId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Response not found' });
    }
    return res.json({ success: true, message: 'Response deleted' });
  } catch (error) {
    req.logger.error('Survey response delete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete response' });
  }
};

// ── Marketing agent dashboard ──────────────────────────────────────────────

// ── Survey location gate config (admin) ────────────────────────────────────
exports.saveLocationConfig = async (req, res) => {
  try {
    const { scope, locations } = req.body;

    const validScope = String(scope || 'nigeria') === 'locations' ? 'locations' : 'nigeria';
    let cleanLocations = [];
    if (Array.isArray(locations)) {
      cleanLocations = locations
        .filter(
          (l) =>
            l &&
            Number.isFinite(Number(l.lat)) &&
            Number.isFinite(Number(l.lng)) &&
            Number.isFinite(Number(l.radius_km))
        )
        .slice(0, 50)
        .map((l) => ({
          label: String(l.label || '').trim().slice(0, 120) || `${l.lat},${l.lng}`,
          lat: Number(l.lat),
          lng: Number(l.lng),
          radius_km: Number(l.radius_km),
        }));
    }

    await db.query(
      `INSERT INTO app_settings (key, value, description)
       VALUES ('survey_allowed_scope', $1, 'survey location gate scope'),
              ('survey_allowed_locations', $2, 'allowed survey locations')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [validScope, JSON.stringify(cleanLocations)]
    );

    return res.json({
      success: true,
      message: 'Survey location rules saved',
      data: { scope: validScope, locations: cleanLocations },
    });
  } catch (error) {
    req.logger.error('Survey location config save error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save location rules' });
  }
};

exports.getLocationConfigForAdmin = async (req, res) => {
  try {
    const svc = require('./surveyService');
    const flags = require('../config/middleware/featureFlags').getFeatureFlagsMap;
    const map = await flags();
    const config = await svc.getSurveyLocationConfigForAdmin();
    return res.json({
      success: true,
      data: {
        gate_enabled: map.survey_location_gate === true,
        scope: config.scope,
        locations: config.locations,
      },
    });
  } catch (error) {
    req.logger.error('Survey location config load error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load location rules' });
  }
};

exports.getMarketingAgentOverview = async (req, res) => {
  try {
    const agentId = req.user.id;

    const statsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS captured,
         COUNT(*) FILTER (WHERE completed_at IS NULL AND superseded_at IS NULL) AS in_progress,
         COUNT(*) FILTER (WHERE has_email = TRUE AND respondent_email IS NOT NULL) AS with_email,
         COUNT(*) FILTER (WHERE respondent_phone IS NOT NULL) AS with_phone
       FROM survey_responses
       WHERE agent_user_id = $1 AND superseded_at IS NULL`,
      [agentId]
    );

    const recent = await db.query(
      `SELECT id, respondent_code, survey_type, respondent_name, respondent_phone,
              respondent_email, respondent_location, respondent_state_of_origin,
              agent_lga, agent_location, admin_mode, created_at, completed_at
       FROM survey_responses
       WHERE agent_user_id = $1 AND superseded_at IS NULL
       ORDER BY created_at DESC
       LIMIT 50`,
      [agentId]
    );

    const byLga = await db.query(
      `SELECT COALESCE(agent_lga, 'Unknown') AS lga, COUNT(*) AS count
       FROM survey_responses
       WHERE agent_user_id = $1 AND completed_at IS NOT NULL AND superseded_at IS NULL
       GROUP BY agent_lga ORDER BY count DESC`,
      [agentId]
    );

    return res.json({
      success: true,
      data: {
        stats: statsResult.rows[0] || { captured: 0, in_progress: 0, with_email: 0, with_phone: 0 },
        by_lga: byLga.rows,
        responses: recent.rows,
      },
    });
  } catch (error) {
    req.logger.error('Marketing agent overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load agent overview' });
  }
};

exports.DEPARTMENTS = DEPARTMENTS;
exports.DEFAULT_COST_MODEL = DEFAULT_COST_MODEL;
