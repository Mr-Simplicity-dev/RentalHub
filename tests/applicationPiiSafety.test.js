const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const applicationService = require('../services/applicationService');

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
  };

  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };

  res.json = (body) => {
    res.body = body;
    return res;
  };

  return res;
};

test('landlord application detail exposes verification status without identity numbers', async (t) => {
  const originalQuery = db.query;
  const identitySelects = [];

  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (text) => {
    if (text.includes('ALTER TABLE applications')) {
      return { rows: [] };
    }

    if (text.includes('FROM applications a') && text.includes('p.landlord_id = $2')) {
      identitySelects.push(text);
      return {
        rows: [{
          id: 71,
          status: 'pending',
          property_id: 22,
          tenant_name: 'Verified Tenant',
          tenant_email: 'tenant@example.test',
          tenant_identity_document_type: 'nin',
          tenant_nationality: 'Nigeria',
          tenant_verified: true,
          tenant_identity_verification_status: 'verified',
          // Simulate an accidental future query regression. The response
          // sanitizer must still remove all raw identity-number aliases.
          tenant_nin: '12345678901',
          tenant_passport_number: 'A12345678',
          nin: '12345678901',
          international_passport_number: 'A12345678',
        }],
      };
    }

    if (text.includes('FROM application_negotiations an')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected test query: ${text}`);
  };

  const req = {
    params: { applicationId: '71' },
    user: { id: 9, user_type: 'landlord' },
  };
  const res = makeRes();

  await applicationService.getApplicationById(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.tenant_verified, true);
  assert.equal(res.body.data.tenant_identity_verification_status, 'verified');
  assert.equal(res.body.data.tenant_identity_document_type, 'nin');

  for (const field of [
    'tenant_nin',
    'tenant_passport_number',
    'nin',
    'international_passport_number',
  ]) {
    assert.equal(Object.hasOwn(res.body.data, field), false, `${field} must not be returned`);
  }

  assert.doesNotMatch(JSON.stringify(res.body), /12345678901|A12345678/);
  assert.equal(identitySelects.length, 1);
  assert.doesNotMatch(identitySelects[0], /\bu\.nin\b/i);
  assert.doesNotMatch(identitySelects[0], /\bu\.international_passport_number\b/i);
});
