/**
 * Structured property feature schema with three-state logic (true/false/null).
 * Designed to be reused across AddProperty, property detail, search, tour, narration.
 */

const FEATURE_CATEGORIES = {
  WATER_UTILITIES: { key: 'water_utilities', label: 'Water & Utilities' },
  PROPERTY_ROOMS: { key: 'property_rooms', label: 'Property & Rooms' },
  SECURITY_ACCESS: { key: 'security_access', label: 'Security & Access' },
  PARKING_OUTDOOR: { key: 'parking_outdoor', label: 'Parking & Outdoor' },
  BUILDING_FEATURES: { key: 'building_features', label: 'Building Features' },
  ESTATE_COMMUNITY: { key: 'estate_community', label: 'Estate / Community' },
};

const PROPERTY_FEATURES = [
  // Water & Utilities
  { key: 'water_board', label: 'Public Water / Water Board', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true, conditional: { fields: [
    { key: 'availabilityType', label: 'Availability', type: 'select', options: [
      { value: '24_hours', label: '24 hours' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'irregular', label: 'Irregular' },
      { value: 'unknown', label: 'Unknown' },
    ]},
    { key: 'startTime', label: 'Supply starts', type: 'time', showIf: { availabilityType: 'scheduled' }},
    { key: 'endTime', label: 'Supply ends', type: 'time', showIf: { availabilityType: 'scheduled' }},
    { key: 'frequency', label: 'Frequency', type: 'select', options: [
      { value: 'daily', label: 'Daily' },
      { value: 'certain_days', label: 'Certain days' },
      { value: 'other', label: 'Other' },
    ], showIf: { availabilityType: 'scheduled' }},
  ]}},
  { key: 'borehole', label: 'Borehole', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true, conditional: { fields: [
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'private', label: 'Private' },
      { value: 'shared', label: 'Shared' },
      { value: 'unknown', label: 'Unknown' },
    ]},
    { key: 'availabilityType', label: 'Availability', type: 'select', options: [
      { value: '24_hours', label: '24 hours' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'irregular', label: 'Irregular' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]}},
  { key: 'water_storage', label: 'Water Storage Tank', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true, conditional: { fields: [
    { key: 'quantity', label: 'Number of tanks', type: 'number', min: 1 },
    { key: 'capacityLitres', label: 'Capacity (Litres)', type: 'number', min: 1 },
    { key: 'shared', label: 'Shared?', type: 'select', options: [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]}},
  { key: 'electricity', label: 'Electricity / Grid Supply', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true, conditional: { fields: [
    { key: 'meterType', label: 'Meter type', type: 'select', options: [
      { value: 'prepaid', label: 'Prepaid' },
      { value: 'postpaid', label: 'Postpaid' },
      { value: 'unknown', label: 'Unknown' },
    ]},
    { key: 'provider', label: 'Electricity provider', type: 'text' },
  ]}},
  { key: 'prepaid_meter', label: 'Prepaid Meter', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true },
  { key: 'postpaid_meter', label: 'Postpaid Meter', category: 'water_utilities', type: 'boolean', narrationEligible: true, searchEligible: true },
  { key: 'generator', label: 'Generator', category: 'water_utilities', type: 'boolean', narrationEligible: false, searchEligible: true, conditional: { fields: [
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'private', label: 'Private' },
      { value: 'shared', label: 'Shared' },
      { value: 'estate', label: 'Estate-provided' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]}},
  { key: 'solar', label: 'Solar Power', category: 'water_utilities', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'inverter', label: 'Inverter', category: 'water_utilities', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'internet', label: 'Internet / Fibre', category: 'water_utilities', type: 'boolean', narrationEligible: false, searchEligible: true },
  
  // Rooms
  { key: 'living_room', label: 'Living Room', category: 'property_rooms', type: 'boolean', narrationEligible: true, searchEligible: true },
  { key: 'dining_area', label: 'Dining Area', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'kitchen', label: 'Kitchen', category: 'property_rooms', type: 'boolean', narrationEligible: true, searchEligible: true },
  { key: 'store_room', label: 'Store Room', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'pantry', label: 'Pantry', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'ensuite_bedroom', label: 'Ensuite Bedroom', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'guest_toilet', label: 'Guest Toilet', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'wardrobe', label: 'Wardrobe', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'air_conditioning', label: 'Air Conditioning', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'ceiling_fan', label: 'Ceiling Fan', category: 'property_rooms', type: 'boolean', narrationEligible: false, searchEligible: true },
  
  // Security
  { key: 'fence', label: 'Fence', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'gate', label: 'Gate', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'security_personnel', label: 'Security Personnel', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'cctv', label: 'CCTV', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'access_control', label: 'Access Control', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'intercom', label: 'Intercom', category: 'security_access', type: 'boolean', narrationEligible: false, searchEligible: true },
  
  // Parking & Outdoor
  { key: 'parking', label: 'Parking', category: 'parking_outdoor', type: 'boolean', narrationEligible: true, searchEligible: true, conditional: { fields: [
    { key: 'capacity', label: 'Number of vehicles', type: 'number', min: 0 },
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'open', label: 'Open' },
      { value: 'covered', label: 'Covered' },
      { value: 'carport', label: 'Carport' },
      { value: 'garage', label: 'Garage' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]}},
  { key: 'covered_parking', label: 'Covered Parking', category: 'parking_outdoor', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'compound', label: 'Compound', category: 'parking_outdoor', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'garden', label: 'Garden', category: 'parking_outdoor', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'balcony', label: 'Balcony', category: 'parking_outdoor', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'terrace', label: 'Terrace', category: 'parking_outdoor', type: 'boolean', narrationEligible: false, searchEligible: true },
  
  // Building
  { key: 'tiled_floor', label: 'Tiled Floor', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'pop_ceiling', label: 'POP Ceiling', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'fitted_kitchen', label: 'Fitted Kitchen', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'kitchen_cabinets', label: 'Kitchen Cabinets', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'water_heater', label: 'Water Heater', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'elevator', label: 'Elevator', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'staircase', label: 'Staircase', category: 'building_features', type: 'boolean', narrationEligible: false, searchEligible: true },
  
  // Estate
  { key: 'estate', label: 'Estate', category: 'estate_community', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'estate_gate', label: 'Estate Gate', category: 'estate_community', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'estate_security', label: 'Estate Security', category: 'estate_community', type: 'boolean', narrationEligible: false, searchEligible: true },
  { key: 'estate_waste', label: 'Estate Waste Management', category: 'estate_community', type: 'boolean', narrationEligible: false, searchEligible: true },
];

const getFeatureByKey = (key) => PROPERTY_FEATURES.find(f => f.key === key);
const getFeaturesByCategory = () => {
  const result = {};
  for (const cat of Object.values(FEATURE_CATEGORIES)) {
    result[cat.key] = PROPERTY_FEATURES.filter(f => f.category === cat.key);
  }
  return result;
};

const validateStructuredFeatures = (features = {}) => {
  const errors = [];
  const sanitized = {};
  if (!features || typeof features !== 'object') return { valid: true, features: sanitized };
  
  for (const [key, value] of Object.entries(features)) {
    if (!getFeatureByKey(key)) continue;
    if (value === null || value === undefined) {
      sanitized[key] = { available: null };
      continue;
    }
    if (typeof value === 'boolean') {
      sanitized[key] = { available: value, details: {}, description: '' };
      continue;
    }
    if (typeof value === 'object') {
      const available = value.available === true ? true : value.available === false ? false : null;
      const details = value.details && typeof value.details === 'object' ? value.details : {};
      const description = typeof value.description === 'string' ? value.description.slice(0, 500) : '';
      // Basic validation
      if (details.capacity !== undefined) {
        const cap = Number(details.capacity);
        if (!Number.isFinite(cap) || cap < 0) {
          errors.push({ key, message: 'Invalid capacity' });
          delete details.capacity;
        } else {
          details.capacity = Math.floor(cap);
        }
      }
      if (details.quantity !== undefined) {
        const qty = Number(details.quantity);
        if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
          errors.push({ key, message: 'Invalid quantity' });
          delete details.quantity;
        } else {
          details.quantity = qty;
        }
      }
      if (details.capacityLitres !== undefined) {
        const cap = Number(details.capacityLitres);
        if (!Number.isFinite(cap) || cap < 1) {
          errors.push({ key, message: 'Invalid capacity' });
          delete details.capacityLitres;
        } else {
          details.capacityLitres = cap;
        }
      }
      sanitized[key] = { available, details, description };
      continue;
    }
  }
  return { valid: errors.length === 0, errors, features: sanitized };
};

module.exports = {
  FEATURE_CATEGORIES,
  PROPERTY_FEATURES,
  getFeatureByKey,
  getFeaturesByCategory,
  validateStructuredFeatures,
};
