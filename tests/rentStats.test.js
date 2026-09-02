const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const rentStatsService = require('../services/rentStatsService');

const { blendState, buildSurveyStateStats, MIN_SURVEY_RESPONSES, MIN_LISTINGS } = rentStatsService;

const sampleSurveyRows = (stateName, bands, surveyType = 'tenant') =>
  bands.map((band) => ({
    state_name: stateName,
    survey_type: surveyType,
    rent_band: band,
  }));

test('blendState reports insufficient_data when both sources are below minimums', () => {
  const survey = { n: 5, median_rent_naira: 250000 };
  const listing = { n: 2, median_rent: 300000 };
  const result = blendState(survey, listing);
  assert.equal(result.status, 'insufficient_data');
});

test('blendState uses survey alone when listings are below the minimum', () => {
  const survey = { n: MIN_SURVEY_RESPONSES, median_rent_naira: 450000 };
  const listing = { n: 2, median_rent: 900000 };
  const result = blendState(survey, listing);
  assert.equal(result.status, 'survey');
  assert.equal(result.median_rent_naira, 450000);
});

test('blendState uses listings alone when survey responses are below the minimum', () => {
  const survey = { n: 4, median_rent_naira: 250000 };
  const listing = { n: MIN_LISTINGS, median_rent: 1200000 };
  const result = blendState(survey, listing);
  assert.equal(result.status, 'listings');
  assert.equal(result.median_rent_naira, 1200000);
});

test('blendState blends when both sources qualify and listings pull the median', () => {
  // Survey median 450k with 100 responses; listing median 1.5m with 100
  // listings -> weights are equal (sqrt(100) each), blended = midpoint.
  const survey = { n: 100, median_rent_naira: 450000 };
  const listing = { n: 100, median_rent: 1500000 };
  const result = blendState(survey, listing);
  assert.equal(result.status, 'blended');
  assert.equal(result.median_rent_naira, 975000);
});

test('blendState gives the survey less weight as listings outnumber it', () => {
  const survey = { n: MIN_SURVEY_RESPONSES, median_rent_naira: 450000 };
  const listing = { n: 1000, median_rent: 1500000 };
  const result = blendState(survey, listing);
  assert.equal(result.status, 'blended');
  // Listing weight sqrt(1000)≈31.6 vs survey sqrt(30)≈5.5 -> strongly toward 1.5m
  assert.ok(result.median_rent_naira > 1300000, `expected near listing median, got ${result.median_rent_naira}`);
  assert.ok(result.survey_weight < 25, `survey weight should shrink, got ${result.survey_weight}`);
});

test('buildSurveyStateStats computes band distribution and median per state', () => {
  const rows = [
    ...sampleSurveyRows('Lagos', ['lt300k', 'lt300k', 'lt300k', 'lt300k', '300_599', '600_999', '1m_1_99']),
    ...sampleSurveyRows('Kaduna', ['lt300k', 'lt300k', '1m_1_99'], 'landlord'),
  ];
  const stats = buildSurveyStateStats(rows);
  assert.equal(stats.length, 2);

  const lagos = stats.find((s) => s.state_name === 'Lagos');
  assert.equal(lagos.n, 7);
  assert.equal(lagos.median_band, 'lt300k');
  assert.equal(lagos.distribution[0].band, 'lt300k');
  assert.equal(lagos.distribution[0].count, 4);

  const kaduna = stats.find((s) => s.state_name === 'Kaduna');
  assert.equal(kaduna.n, 3);
  assert.equal(kaduna.landlord_n, 3);
  assert.equal(kaduna.median_band, 'lt300k');
});

test('buildSurveyStateStats ignores prefer-not and unknown bands', () => {
  const rows = sampleSurveyRows('Ogun', ['lt300k', 'prefer_not', 'not_a_band', null]);
  const stats = buildSurveyStateStats(rows);
  const ogun = stats.find((s) => s.state_name === 'Ogun');
  assert.equal(ogun.n, 1);
  assert.equal(ogun.distribution.length, 1);
});

test('getRentStats blends survey and listing rows and exposes sample sizes', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM survey_responses')) {
      return {
        rows: [
          ...Array.from({ length: 40 }, () => ({
            state_name: 'Lagos',
            survey_type: 'tenant',
            rent_band: '1m_1_99',
          })),
          ...Array.from({ length: 20 }, () => ({
            state_name: 'Kaduna',
            survey_type: 'tenant',
            rent_band: 'lt300k',
          })),
        ],
      };
    }
    if (sql.includes('FROM properties p')) {
      return {
        rows: [
          { state_name: 'Lagos', n: 50, median_rent: '1800000', avg_rent: '2100000' },
        ],
      };
    }
    return { rows: [] };
  };

  try {
    const result = await rentStatsService.getRentStats({});
    const lagos = result.find((s) => s.state_name === 'Lagos');
    const kaduna = result.find((s) => s.state_name === 'Kaduna');

    assert.ok(lagos, 'Lagos present');
    assert.equal(lagos.state_slug, 'lagos');
    assert.equal(lagos.survey.n, 40);
    assert.equal(lagos.survey.median_band, '1m_1_99');
    assert.equal(lagos.listings.n, 50);
    assert.equal(lagos.status, 'blended');

    assert.ok(kaduna, 'Kaduna present');
    assert.equal(kaduna.survey.n, 20);
    assert.equal(kaduna.listings, null, 'no listings for Kaduna');
    assert.equal(kaduna.status, 'insufficient_data', '20 survey responses < 30 minimum');
  } finally {
    db.query = originalQuery;
  }
});

test('getRentStats supports a single-state filter and returns null when absent', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM survey_responses')) {
      return {
        rows: Array.from({ length: 40 }, () => ({
          state_name: 'Lagos',
          survey_type: 'tenant',
          rent_band: 'lt300k',
        })),
      };
    }
    if (sql.includes('FROM properties p')) {
      return { rows: [{ state_name: 'Lagos', n: 10, median_rent: '400000', avg_rent: '450000' }] };
    }
    return { rows: [] };
  };

  try {
    const lagos = await rentStatsService.getRentStats({ stateName: 'LAGOS' });
    assert.ok(lagos, 'found regardless of case');
    assert.equal(lagos.state_name, 'Lagos');

    const missing = await rentStatsService.getRentStats({ stateName: 'Sokoto' });
    assert.equal(missing, null);
  } finally {
    db.query = originalQuery;
  }
});
