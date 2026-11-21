'use strict';

const parseJsonSafe = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const clampParking = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.floor(n));
};

const hasParkingAmenity = (amenities) => {
  const list = parseJsonSafe(amenities, []);
  if (!Array.isArray(list)) return false;
  return list.some((item) => /parking|garage|car\s*park/i.test(String(item || '')));
};

const resolveParkingSpaces = ({ parking_spaces, structured_features, amenities } = {}) => {
  if (
    parking_spaces !== undefined &&
    parking_spaces !== null &&
    parking_spaces !== '' &&
    typeof parking_spaces !== 'boolean' &&
    Number.isFinite(Number(parking_spaces))
  ) {
    return clampParking(parking_spaces);
  }

  const features = parseJsonSafe(structured_features, {});
  if (features && typeof features === 'object') {
    const parking = features.parking;
    if (parking && typeof parking === 'object') {
      const cap = parking.details?.capacity;
      if (cap !== undefined && cap !== null && cap !== '' && Number.isFinite(Number(cap))) {
        return clampParking(cap);
      }
      if (parking.available === true) return 1;
      if (parking.available === false) return 0;
    } else if (parking === true) {
      return 1;
    }
    const covered = features.covered_parking;
    if (covered === true || covered?.available === true) return 1;
  }

  if (hasParkingAmenity(amenities)) return 1;
  return 0;
};

const syncStructuredParking = (structuredFeatures = {}, parkingSpaces = 0, explicitParkingInput = false) => {
  const next = structuredFeatures && typeof structuredFeatures === 'object'
    ? JSON.parse(JSON.stringify(structuredFeatures))
    : {};
  const spaces = clampParking(parkingSpaces);
  const existing = next.parking && typeof next.parking === 'object' ? next.parking : {};

  if (spaces > 0) {
    next.parking = {
      available: true,
      details: {
        ...(existing.details && typeof existing.details === 'object' ? existing.details : {}),
        capacity: spaces,
      },
      description: typeof existing.description === 'string' ? existing.description : '',
    };
  } else if (explicitParkingInput && existing.available === undefined) {
    next.parking = {
      available: false,
      details: {},
      description: '',
    };
  }
  return next;
};

module.exports = {
  resolveParkingSpaces,
  syncStructuredParking,
  clampParking,
};
