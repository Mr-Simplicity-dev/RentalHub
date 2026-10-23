export const FEATURE_CATEGORIES = [
  { key: 'water_utilities', label: 'Water & Utilities' },
  { key: 'property_rooms', label: 'Property & Rooms' },
  { key: 'security_access', label: 'Security & Access' },
  { key: 'parking_outdoor', label: 'Parking & Outdoor' },
  { key: 'building_features', label: 'Building Features' },
  { key: 'estate_community', label: 'Estate / Community' },
];

const waterAvailability = {
  key: 'availabilityType',
  label: 'Availability',
  type: 'select',
  options: [
    { value: '24_hours', label: '24 hours' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'irregular', label: 'Irregular' },
    { value: 'unknown', label: 'Unknown' },
  ],
};

export const PROPERTY_FEATURES = [
  {
    key: 'water_board',
    label: 'Public Water / Water Board',
    category: 'water_utilities',
    narrationEligible: true,
    searchEligible: true,
    conditional: [
      waterAvailability,
      { key: 'startTime', label: 'Supply starts', type: 'time', showIf: { availabilityType: 'scheduled' } },
      { key: 'endTime', label: 'Supply ends', type: 'time', showIf: { availabilityType: 'scheduled' } },
      {
        key: 'frequency',
        label: 'Frequency',
        type: 'select',
        options: [
          { value: 'daily', label: 'Daily' },
          { value: 'certain_days', label: 'Certain days' },
          { value: 'other', label: 'Other' },
        ],
        showIf: { availabilityType: 'scheduled' },
      },
    ],
  },
  {
    key: 'borehole',
    label: 'Borehole',
    category: 'water_utilities',
    narrationEligible: true,
    searchEligible: true,
    conditional: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'private', label: 'Private' },
          { value: 'shared', label: 'Shared' },
          { value: 'unknown', label: 'Unknown' },
        ],
      },
      waterAvailability,
    ],
  },
  {
    key: 'water_storage',
    label: 'Water Storage Tank',
    category: 'water_utilities',
    narrationEligible: true,
    searchEligible: true,
    conditional: [
      { key: 'quantity', label: 'Number of tanks', type: 'number', min: 1 },
      { key: 'capacityLitres', label: 'Capacity (Litres)', type: 'number', min: 1 },
    ],
  },
  {
    key: 'electricity',
    label: 'Electricity / Grid Supply',
    category: 'water_utilities',
    narrationEligible: true,
    searchEligible: true,
    conditional: [
      {
        key: 'meterType',
        label: 'Meter type',
        type: 'select',
        options: [
          { value: 'prepaid', label: 'Prepaid' },
          { value: 'postpaid', label: 'Postpaid' },
          { value: 'unknown', label: 'Unknown' },
        ],
      },
      { key: 'provider', label: 'Electricity provider', type: 'text' },
    ],
  },
  { key: 'prepaid_meter', label: 'Prepaid Meter', category: 'water_utilities', narrationEligible: true, searchEligible: true },
  { key: 'postpaid_meter', label: 'Postpaid Meter', category: 'water_utilities', narrationEligible: true, searchEligible: true },
  {
    key: 'generator',
    label: 'Generator',
    category: 'water_utilities',
    searchEligible: true,
    conditional: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'private', label: 'Private' },
          { value: 'shared', label: 'Shared' },
          { value: 'estate', label: 'Estate-provided' },
          { value: 'unknown', label: 'Unknown' },
        ],
      },
    ],
  },
  { key: 'solar', label: 'Solar Power', category: 'water_utilities', searchEligible: true },
  { key: 'inverter', label: 'Inverter', category: 'water_utilities', searchEligible: true },
  { key: 'internet', label: 'Internet / Fibre', category: 'water_utilities', searchEligible: true },

  { key: 'living_room', label: 'Living Room', category: 'property_rooms', narrationEligible: true, searchEligible: true },
  { key: 'dining_area', label: 'Dining Area', category: 'property_rooms', searchEligible: true },
  { key: 'kitchen', label: 'Kitchen', category: 'property_rooms', narrationEligible: true, searchEligible: true },
  { key: 'store_room', label: 'Store Room', category: 'property_rooms', searchEligible: true },
  { key: 'pantry', label: 'Pantry', category: 'property_rooms', searchEligible: true },
  { key: 'ensuite_bedroom', label: 'Ensuite Bedroom', category: 'property_rooms', searchEligible: true },
  { key: 'guest_toilet', label: 'Guest Toilet', category: 'property_rooms', searchEligible: true },
  { key: 'wardrobe', label: 'Wardrobe', category: 'property_rooms', searchEligible: true },
  { key: 'air_conditioning', label: 'Air Conditioning', category: 'property_rooms', searchEligible: true },
  { key: 'ceiling_fan', label: 'Ceiling Fan', category: 'property_rooms', searchEligible: true },

  { key: 'fence', label: 'Fence', category: 'security_access', searchEligible: true },
  { key: 'gate', label: 'Gate', category: 'security_access', searchEligible: true },
  { key: 'security_personnel', label: 'Security Personnel', category: 'security_access', searchEligible: true },
  { key: 'cctv', label: 'CCTV', category: 'security_access', searchEligible: true },
  { key: 'access_control', label: 'Access Control', category: 'security_access', searchEligible: true },
  { key: 'intercom', label: 'Intercom', category: 'security_access', searchEligible: true },

  {
    key: 'parking',
    label: 'Parking',
    category: 'parking_outdoor',
    narrationEligible: true,
    searchEligible: true,
    conditional: [
      { key: 'capacity', label: 'Number of vehicles', type: 'number', min: 0 },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'open', label: 'Open' },
          { value: 'covered', label: 'Covered' },
          { value: 'carport', label: 'Carport' },
          { value: 'garage', label: 'Garage' },
          { value: 'unknown', label: 'Unknown' },
        ],
      },
    ],
  },
  { key: 'covered_parking', label: 'Covered Parking', category: 'parking_outdoor', searchEligible: true },
  { key: 'compound', label: 'Compound', category: 'parking_outdoor', searchEligible: true },
  { key: 'garden', label: 'Garden', category: 'parking_outdoor', searchEligible: true },
  { key: 'balcony', label: 'Balcony', category: 'parking_outdoor', searchEligible: true },
  { key: 'terrace', label: 'Terrace', category: 'parking_outdoor', searchEligible: true },

  { key: 'tiled_floor', label: 'Tiled Floor', category: 'building_features', searchEligible: true },
  { key: 'pop_ceiling', label: 'POP Ceiling', category: 'building_features', searchEligible: true },
  { key: 'fitted_kitchen', label: 'Fitted Kitchen', category: 'building_features', searchEligible: true },
  { key: 'kitchen_cabinets', label: 'Kitchen Cabinets', category: 'building_features', searchEligible: true },
  { key: 'water_heater', label: 'Water Heater', category: 'building_features', searchEligible: true },
  { key: 'elevator', label: 'Elevator', category: 'building_features', searchEligible: true },
  { key: 'staircase', label: 'Staircase', category: 'building_features', searchEligible: true },

  { key: 'estate', label: 'Estate', category: 'estate_community', searchEligible: true },
  { key: 'estate_gate', label: 'Estate Gate', category: 'estate_community', searchEligible: true },
  { key: 'estate_security', label: 'Estate Security', category: 'estate_community', searchEligible: true },
  { key: 'estate_waste', label: 'Estate Waste Management', category: 'estate_community', searchEligible: true },
];

export const SEARCHABLE_FEATURES = PROPERTY_FEATURES.filter((feature) => feature.searchEligible);

export const getFeatureByKey = (key) =>
  PROPERTY_FEATURES.find((feature) => feature.key === key) || null;

export const getFeaturesByCategory = () =>
  FEATURE_CATEGORIES.reduce((acc, category) => {
    acc[category.key] = PROPERTY_FEATURES.filter((feature) => feature.category === category.key);
    return acc;
  }, {});

const isFieldVisible = (field, details) => {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([key, value]) => details?.[key] === value);
};

export const getVisibleDetailFields = (feature, details = {}) => {
  if (!feature?.conditional) return [];
  return feature.conditional.filter((field) => isFieldVisible(field, details));
};

export const formatDetailValue = (field, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return '';
  if (Array.isArray(field.options)) {
    const match = field.options.find((option) => String(option.value) === String(rawValue));
    return match ? match.label : String(rawValue);
  }
  if (field.key === 'capacityLitres') return `${Number(rawValue).toLocaleString()} L`;
  return String(rawValue);
};

/**
 * Normalises the three-state structured feature map into display rows.
 * Anything that is not explicitly true or false is reported as unspecified,
 * so the UI never implies a missing answer means "no".
 */
export const summariseStructuredFeatures = (structuredFeatures = {}) => {
  if (!structuredFeatures || typeof structuredFeatures !== 'object') {
    return { available: [], unavailable: [], unspecified: [], answeredCount: 0 };
  }

  const available = [];
  const unavailable = [];
  const unspecified = [];

  for (const feature of PROPERTY_FEATURES) {
    const raw = structuredFeatures[feature.key];
    const availableState =
      raw === true
        ? true
        : raw === false
        ? false
        : raw && typeof raw === 'object'
        ? raw.available === true
          ? true
          : raw.available === false
          ? false
          : null
        : null;

    if (availableState === null) {
      unspecified.push(feature);
      continue;
    }

    const details = raw && typeof raw === 'object' && raw.details ? raw.details : {};
    const rows = availableState
      ? getVisibleDetailFields(feature, details)
          .map((field) => ({
            key: field.key,
            label: field.label,
            value: formatDetailValue(field, details[field.key]),
          }))
          .filter((row) => row.value)
      : [];

    const description =
      raw && typeof raw === 'object' && typeof raw.description === 'string' ? raw.description : '';

    if (availableState) {
      available.push({ ...feature, details: rows, description });
    } else {
      unavailable.push(feature);
    }
  }

  return {
    available,
    unavailable,
    unspecified,
    answeredCount: available.length + unavailable.length,
  };
};

export const buildStructuredFeatureSearchQuery = (selectedKeys = []) =>
  selectedKeys.filter((key) => getFeatureByKey(key)?.searchEligible);
