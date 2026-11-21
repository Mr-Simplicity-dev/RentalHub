const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveParkingSpaces, syncStructuredParking } = require('../config/utils/parkingInfo');

test('resolveParkingSpaces prioritizes explicit parking_spaces count', () => {
  assert.equal(resolveParkingSpaces({ parking_spaces: 3 }), 3);
  assert.equal(resolveParkingSpaces({ parking_spaces: '2' }), 2);
  assert.equal(resolveParkingSpaces({ parking_spaces: 0 }), 0);
});

test('resolveParkingSpaces falls back to structured_features capacity or availability', () => {
  assert.equal(
    resolveParkingSpaces({
      structured_features: { parking: { available: true, details: { capacity: 4 } } },
    }),
    4
  );
  assert.equal(
    resolveParkingSpaces({
      structured_features: { parking: { available: true, details: {} } },
    }),
    1
  );
  assert.equal(
    resolveParkingSpaces({
      structured_features: { covered_parking: { available: true } },
    }),
    1
  );
});

test('resolveParkingSpaces falls back to amenities text when structured features absent', () => {
  assert.equal(resolveParkingSpaces({ amenities: ['24/7 Power', 'Car Park'] }), 1);
  assert.equal(resolveParkingSpaces({ amenities: ['Borehole', 'Security'] }), 0);
});

test('syncStructuredParking keeps structured_features.parking aligned with numeric parking_spaces', () => {
  const synced = syncStructuredParking({}, 2, true);
  assert.equal(synced.parking.available, true);
  assert.equal(synced.parking.details.capacity, 2);

  const zeroSynced = syncStructuredParking({}, 0, true);
  assert.equal(zeroSynced.parking.available, false);
});
