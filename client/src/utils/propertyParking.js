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

export const getParkingSummary = (property = {}) => {
  const explicit = property?.parking_spaces;
  if (
    explicit !== undefined &&
    explicit !== null &&
    explicit !== '' &&
    typeof explicit !== 'boolean' &&
    Number.isFinite(Number(explicit))
  ) {
    const count = Math.max(0, Math.floor(Number(explicit)));
    if (count > 0) {
      return { count, hasParking: true, label: String(count) };
    }
  }

  const features = parseJsonSafe(property?.structured_features, {});
  if (features && typeof features === 'object') {
    const parking = features.parking;
    if (parking && typeof parking === 'object') {
      const cap = parking.details?.capacity;
      if (cap !== undefined && cap !== null && cap !== '' && Number.isFinite(Number(cap))) {
        const count = Math.max(0, Math.floor(Number(cap)));
        return { count, hasParking: count > 0, label: String(count) };
      }
      if (parking.available === true) {
        return { count: 1, hasParking: true, label: '1' };
      }
      if (parking.available === false) {
        return { count: 0, hasParking: false, label: '0' };
      }
    } else if (parking === true) {
      return { count: 1, hasParking: true, label: '1' };
    }

    const covered = features.covered_parking;
    if (covered === true || covered?.available === true) {
      return { count: 1, hasParking: true, label: '1' };
    }
  }

  const amenities = parseJsonSafe(property?.amenities, []);
  if (
    Array.isArray(amenities) &&
    amenities.some((item) => /parking|garage|car\s*park/i.test(String(item || '')))
  ) {
    return { count: 1, hasParking: true, label: '1' };
  }

  return { count: 0, hasParking: false, label: '0' };
};
