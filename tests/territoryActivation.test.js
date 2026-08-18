const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/middleware/database');
const adminService = require('../services/adminService');

test('territory activation remains transition-compatible when policy is disabled', async () => {
  const previous = process.env.ENFORCE_TERRITORY_ACTIVATION;
  delete process.env.ENFORCE_TERRITORY_ACTIVATION;
  await assert.doesNotReject(() => adminService._territoryActivationForTest.requireActiveTerritory('lga', 'Ikeja', 'Lagos'));
  if (previous === undefined) delete process.env.ENFORCE_TERRITORY_ACTIVATION;
  else process.env.ENFORCE_TERRITORY_ACTIVATION = previous;
});

test('enabled policy accepts only explicitly active territories', async () => {
  const previous = process.env.ENFORCE_TERRITORY_ACTIVATION;
  const originalQuery = db.query;
  process.env.ENFORCE_TERRITORY_ACTIVATION = 'true';
  try {
    db.query = async () => ({ rows: [{ is_active: true }] });
    await assert.doesNotReject(() => adminService._territoryActivationForTest.requireActiveTerritory('state', 'Lagos'));
    db.query = async () => ({ rows: [{ is_active: false }] });
    await assert.rejects(() => adminService._territoryActivationForTest.requireActiveTerritory('state', 'Lagos'), /not operationally active/);
    db.query = async () => ({ rows: [] });
    await assert.rejects(() => adminService._territoryActivationForTest.requireActiveTerritory('lga', 'Ikeja', 'Lagos'), /not operationally active/);
  } finally {
    db.query = originalQuery;
    if (previous === undefined) delete process.env.ENFORCE_TERRITORY_ACTIVATION;
    else process.env.ENFORCE_TERRITORY_ACTIVATION = previous;
  }
});
