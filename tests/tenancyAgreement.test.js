const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const svc = require('../services/tenancyAgreementService');

const EXPECTED_STATUSES = [
  'DRAFT',
  'PENDING_LANDLORD_REVIEW',
  'PENDING_LANDLORD_SIGNATURE',
  'PENDING_TENANT_REVIEW',
  'PENDING_TENANT_SIGNATURE',
  'PARTIALLY_EXECUTED',
  'FULLY_EXECUTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'AMENDED',
  'SUPERSEDED',
];

test('tenancy agreement status machine exposes the canonical statuses', () => {
  assert.deepEqual(Object.values(svc.TENANCY_AGREEMENT_STATUS).sort(), [...EXPECTED_STATUSES].sort());
});

test('tenancy agreement events expose the canonical audit event types', () => {
  const events = Object.values(svc.TENANCY_AGREEMENT_EVENTS);
  for (const required of ['AGREEMENT_CREATED', 'LANDLORD_SIGNED', 'TENANT_SIGNED', 'AGREEMENT_FULLY_EXECUTED', 'AMENDMENT_REQUESTED']) {
    assert.ok(events.includes(required), `missing event type ${required}`);
  }
});

test('buildAgreementTerms derives structured terms from application and property', () => {
  const application = { id: 5, move_in_date: '2026-01-15', agreed_rent: 1200000, rent_amount: 1000000 };
  const property = {
    id: 22,
    full_address: '12 Test Road',
    state: 'Lagos',
    lga_name: 'Ikeja',
    property_type: 'flat',
    bedrooms: 2,
    bathrooms: 1,
    payment_frequency: 'yearly',
    caution_deposit: 100000,
  };

  const terms = svc.buildAgreementTerms(application, property);

  assert.equal(terms.propertyId, 22);
  assert.equal(terms.propertyAddress, '12 Test Road');
  assert.equal(terms.state, 'Lagos');
  assert.equal(terms.lga, 'Ikeja');
  assert.equal(terms.rentAmount, 1200000);
  assert.equal(terms.commencementDate, '2026-01-15');
  assert.equal(terms.expiryDate, '2027-01-15');
  assert.equal(terms.deposit, 100000);
  assert.equal(terms.tenancyType, 'residential');
});

test('buildAgreementTerms uses a one-month term for monthly payment frequency', () => {
  const terms = svc.buildAgreementTerms(
    { move_in_date: '2026-03-01', agreed_rent: 100 },
    { payment_frequency: 'monthly' }
  );
  assert.equal(terms.expiryDate, '2026-04-01');
});

test('buildAgreementTerms falls back to the property rent when no agreed rent exists', () => {
  const terms = svc.buildAgreementTerms(
    { move_in_date: '2026-06-01', rent_amount: 500000 },
    { payment_frequency: 'yearly' }
  );
  assert.equal(terms.rentAmount, 500000);
});
