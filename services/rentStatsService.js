const db = require('../config/middleware/database');
const slugify = require('../config/utils/slugify');

// ── Configuration ─────────────────────────────────────────────────────────────
// A state's rent figure is only published when at least one source meets its
// minimum sample size. Below these thresholds the answer would be
// statistically meaningless, so the state reports insufficient_data instead.
const MIN_SURVEY_RESPONSES = 30;
const MIN_LISTINGS = 5;

// Shared rent bands used by the survey (tenant T1.8 and landlord L1.6).
// Midpoints are conservative estimates used only for blending with listing
// medians — the band distribution itself is always shown verbatim.
const RENT_BANDS = [
  { key: 'lt300k', label: 'Below ₦300,000', midpoint: 250000 },
  { key: '300_599', label: '₦300,000 – ₦599,999', midpoint: 450000 },
  { key: '600_999', label: '₦600,000 – ₦999,999', midpoint: 800000 },
  { key: '1m_1_99', label: '₦1m – ₦1.99m', midpoint: 1500000 },
  { key: '2m_4_99', label: '₦2m – ₦4.99m', midpoint: 3500000 },
  { key: '5m_plus', label: '₦5m+', midpoint: 6500000 },
];

const SURVEY_QUESTION_KEY = {
  tenant: 'T1.8',
  landlord: 'L1.6',
};

const SKIPPED_ANSWERS = new Set(['prefer_not', '', null, undefined]);

const bandByKey = (key) => RENT_BANDS.find((band) => band.key === key) || null;

const medianOfDistribution = (countByKey) => {
  const ordered = RENT_BANDS.filter((band) => (countByKey[band.key] || 0) > 0);
  if (!ordered.length) return null;
  const total = ordered.reduce((sum, band) => sum + countByKey[band.key], 0);
  let cumulative = 0;
  for (const band of ordered) {
    cumulative += countByKey[band.key];
    if (cumulative * 2 >= total) return band;
  }
  return ordered[ordered.length - 1];
};

// ── SQL ──────────────────────────────────────────────────────────────────────

// One row per completed survey response that carries a usable rent band.
// Tenant responses contribute their ACTUAL paid rent (T1.8); landlord
// responses contribute the rent they charge (L1.6).
const SURVEY_ROW_SQL = `
  SELECT
    s.state_name,
    sr.survey_type,
    COALESCE(sr.answers->>'T1.8', sr.answers->>'L1.6') AS rent_band
  FROM survey_responses sr
  LEFT JOIN states s ON s.id = sr.state_id
  WHERE sr.completed_at IS NOT NULL
    AND sr.state_id IS NOT NULL
    AND s.state_name IS NOT NULL
`;

// Live listing medians per state — verified, available properties only.
const LISTING_STATS_SQL = `
  SELECT
    s.state_name,
    COUNT(*)::INT AS n,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.rent_amount)::NUMERIC AS median_rent,
    AVG(p.rent_amount)::NUMERIC AS avg_rent
  FROM properties p
  JOIN states s ON s.id = p.state_id
  WHERE p.is_verified = TRUE
    AND COALESCE(p.is_available, TRUE) = TRUE
    AND p.rent_amount > 0
  GROUP BY s.state_name
`;

const buildSurveyStateStats = (rows) => {
  const byState = {};

  for (const row of rows) {
    const stateName = String(row.state_name || '').trim();
    const band = bandByKey(String(row.rent_band || ''));
    if (!stateName || !band || SKIPPED_ANSWERS.has(row.rent_band)) continue;

    const bucket = byState[stateName] || (byState[stateName] = {
      countByKey: {},
      tenantN: 0,
      landlordN: 0,
      totalN: 0,
    });

    bucket.countByKey[band.key] = (bucket.countByKey[band.key] || 0) + 1;
    bucket.totalN += 1;
    if (row.survey_type === 'tenant') bucket.tenantN += 1;
    else if (row.survey_type === 'landlord') bucket.landlordN += 1;
  }

  return Object.entries(byState).map(([stateName, bucket]) => {
    const medianBand = medianOfDistribution(bucket.countByKey);
    return {
      state_name: stateName,
      n: bucket.totalN,
      tenant_n: bucket.tenantN,
      landlord_n: bucket.landlordN,
      median_band: medianBand ? medianBand.key : null,
      median_rent_naira: medianBand ? medianBand.midpoint : null,
      distribution: RENT_BANDS.map((band) => ({
        band: band.key,
        label: band.label,
        count: bucket.countByKey[band.key] || 0,
        pct: bucket.totalN ? Math.round(((bucket.countByKey[band.key] || 0) / bucket.totalN) * 1000) / 10 : 0,
      })).filter((entry) => entry.count > 0),
    };
  });
};

const confidenceWeight = (n) => Math.sqrt(Math.max(n, 0));

// Blends survey-paid-rent medians with listing asking medians. Each source
// contributes only when it meets its minimum sample size; its weight grows
// with the square root of its sample count, so as live listings arrive in a
// state they smoothly take over from survey data instead of snapping to it.
const blendState = (survey, listing) => {
  const surveyUsable = survey && survey.n >= MIN_SURVEY_RESPONSES && survey.median_rent_naira;
  const listingUsable = listing && listing.n >= MIN_LISTINGS && Number(listing.median_rent) > 0;

  if (!surveyUsable && !listingUsable) {
    return { status: 'insufficient_data' };
  }

  if (surveyUsable && !listingUsable) {
    return {
      status: 'survey',
      median_rent_naira: Math.round(survey.median_rent_naira),
    };
  }

  if (!surveyUsable && listingUsable) {
    return {
      status: 'listings',
      median_rent_naira: Math.round(Number(listing.median_rent)),
    };
  }

  const surveyWeight = confidenceWeight(survey.n);
  const listingWeight = confidenceWeight(listing.n);
  const blended =
    (survey.median_rent_naira * surveyWeight + Number(listing.median_rent) * listingWeight) /
    (surveyWeight + listingWeight);

  return {
    status: 'blended',
    median_rent_naira: Math.round(blended),
    survey_weight: Math.round((surveyWeight / (surveyWeight + listingWeight)) * 100),
  };
};

const toStateSlug = (stateName) => slugify(stateName);

// ── Public API ───────────────────────────────────────────────────────────────

const getRentStats = async ({ stateName = null } = {}) => {
  const [surveyRows, listingRows] = await Promise.all([
    db.query(SURVEY_ROW_SQL),
    db.query(LISTING_STATS_SQL),
  ]);

  const surveyByState = new Map(
    buildSurveyStateStats(surveyRows.rows).map((entry) => [entry.state_name, entry])
  );
  const listingByState = new Map(
    (listingRows.rows || []).map((row) => [String(row.state_name).trim(), {
      n: Number(row.n || 0),
      median_rent: Number(row.median_rent),
      avg_rent: Number(row.avg_rent),
    }])
  );

  const allStateNames = new Set([
    ...surveyByState.keys(),
    ...listingByState.keys(),
  ]);

  const rows = Array.from(allStateNames)
    .filter((name) => !stateName || String(stateName).toLowerCase() === name.toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const survey = surveyByState.get(name) || null;
      const listing = listingByState.get(name) || null;
      const blend = blendState(survey, listing);

      return {
        state_name: name,
        state_slug: toStateSlug(name),
        survey: survey
          ? {
              n: survey.n,
              tenant_n: survey.tenant_n,
              landlord_n: survey.landlord_n,
              median_band: survey.median_band,
              distribution: survey.distribution,
            }
          : null,
        listings: listing ? { n: listing.n, median_rent: listing.median_rent, avg_rent: listing.avg_rent } : null,
        ...blend,
      };
    });

  if (stateName) {
    return rows[0] || null;
  }

  return rows;
};

module.exports = {
  getRentStats,
  blendState,
  buildSurveyStateStats,
  RENT_BANDS,
  MIN_SURVEY_RESPONSES,
  MIN_LISTINGS,
};
