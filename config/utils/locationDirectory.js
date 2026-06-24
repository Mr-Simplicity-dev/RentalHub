const db = require('../middleware/database');
const nigeriaLocations = require('../../data/nigeriaLocations');
const slugify = require('./slugify');

const locationDatasetLookup = new Map();

const addLocationLookupKey = (key, value) => {
  if (!key || locationDatasetLookup.has(key)) {
    return;
  }

  locationDatasetLookup.set(key, value);
};

nigeriaLocations.forEach((entry) => {
  const normalizedEntry = {
    ...entry,
    lgas: Array.isArray(entry.lgas) ? entry.lgas.map((item) => String(item)) : [],
  };

  if (entry.slug) {
    addLocationLookupKey(entry.slug, normalizedEntry);
  }

  if (entry.displayName) {
    addLocationLookupKey(slugify(entry.displayName), normalizedEntry);
  }

  if (entry.state) {
    addLocationLookupKey(slugify(entry.state), normalizedEntry);
  }
});

const normalizeLgaKey = (value) => slugify(String(value || ''));

const findDatasetEntryForState = (state) => {
  const keys = [
    state.state_code,
    state.state_name,
  ]
    .map((value) => slugify(value))
    .filter(Boolean);

  for (const key of keys) {
    if (locationDatasetLookup.has(key)) {
      return locationDatasetLookup.get(key);
    }
  }

  return null;
};

const getLocationOptions = async () => {
  const { rows } = await db.query(
    `SELECT id, state_name, state_code
     FROM states
     ORDER BY state_name ASC`
  );

  return rows.map((state) => {
    const datasetEntry = findDatasetEntryForState(state);

    return {
      id: state.id,
      state_name: state.state_name,
      state_code: state.state_code,
      lgas: datasetEntry?.lgas || [],
    };
  });
};

const resolveLocationSelection = async ({
  stateId,
  lgaName = null,
  requireLga = false,
}) => {
  const parsedStateId = Number.parseInt(stateId, 10);

  if (!Number.isFinite(parsedStateId) || parsedStateId <= 0) {
    const error = new Error('A valid state is required');
    error.statusCode = 400;
    throw error;
  }

  const locations = await getLocationOptions();
  const state = locations.find((item) => Number(item.id) === parsedStateId);

  if (!state) {
    const error = new Error('Selected state was not found');
    error.statusCode = 400;
    throw error;
  }

  const rawLgaName = String(lgaName || '').trim();

  if (!rawLgaName) {
    if (requireLga) {
      const error = new Error('A valid local government area is required');
      error.statusCode = 400;
      throw error;
    }

    return {
      state_id: parsedStateId,
      state_name: state.state_name,
      lga_name: null,
      location_key: '',
    };
  }

  const normalizedLgaKey = normalizeLgaKey(rawLgaName);
  const matchedLga = state.lgas.find(
    (item) => normalizeLgaKey(item) === normalizedLgaKey
  );

  if (!matchedLga) {
    const error = new Error(
      'Selected local government area is not valid for the chosen state'
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    state_id: parsedStateId,
    state_name: state.state_name,
    lga_name: matchedLga,
    location_key: normalizedLgaKey,
  };
};

module.exports = {
  getLocationOptions,
  normalizeLgaKey,
  resolveLocationSelection,
};
