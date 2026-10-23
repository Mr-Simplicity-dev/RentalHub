import React, { useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';

const FEATURE_CATEGORIES = [
  { key: 'water_utilities', label: 'Water & Utilities' },
  { key: 'property_rooms', label: 'Property & Rooms' },
  { key: 'security_access', label: 'Security & Access' },
  { key: 'parking_outdoor', label: 'Parking & Outdoor' },
  { key: 'building_features', label: 'Building Features' },
  { key: 'estate_community', label: 'Estate / Community' },
];

const FEATURES = [
  { key: 'water_board', label: 'Public Water / Water Board', category: 'water_utilities', conditional: [
    { key: 'availabilityType', label: 'Availability', type: 'select', options: [
      { value: '24_hours', label: '24 hours' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'irregular', label: 'Irregular' },
      { value: 'unknown', label: 'Unknown' },
    ]},
    { key: 'startTime', label: 'Supply starts', type: 'time', showIf: { availabilityType: 'scheduled' }},
    { key: 'endTime', label: 'Supply ends', type: 'time', showIf: { availabilityType: 'scheduled' }},
  ]},
  { key: 'borehole', label: 'Borehole', category: 'water_utilities', conditional: [
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'private', label: 'Private' },
      { value: 'shared', label: 'Shared' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]},
  { key: 'water_storage', label: 'Water Storage Tank', category: 'water_utilities', conditional: [
    { key: 'quantity', label: 'Number of tanks', type: 'number' },
    { key: 'capacityLitres', label: 'Capacity (Litres)', type: 'number' },
  ]},
  { key: 'electricity', label: 'Electricity / Grid Supply', category: 'water_utilities', conditional: [
    { key: 'meterType', label: 'Meter type', type: 'select', options: [
      { value: 'prepaid', label: 'Prepaid' },
      { value: 'postpaid', label: 'Postpaid' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]},
  { key: 'prepaid_meter', label: 'Prepaid Meter', category: 'water_utilities' },
  { key: 'generator', label: 'Generator', category: 'water_utilities' },
  { key: 'solar', label: 'Solar Power', category: 'water_utilities' },
  { key: 'inverter', label: 'Inverter', category: 'water_utilities' },
  { key: 'internet', label: 'Internet / Fibre', category: 'water_utilities' },
  { key: 'living_room', label: 'Living Room', category: 'property_rooms' },
  { key: 'kitchen', label: 'Kitchen', category: 'property_rooms' },
  { key: 'dining_area', label: 'Dining Area', category: 'property_rooms' },
  { key: 'store_room', label: 'Store Room', category: 'property_rooms' },
  { key: 'ensuite_bedroom', label: 'Ensuite Bedroom', category: 'property_rooms' },
  { key: 'wardrobe', label: 'Wardrobe', category: 'property_rooms' },
  { key: 'air_conditioning', label: 'Air Conditioning', category: 'property_rooms' },
  { key: 'fence', label: 'Fence', category: 'security_access' },
  { key: 'gate', label: 'Gate', category: 'security_access' },
  { key: 'security_personnel', label: 'Security Personnel', category: 'security_access' },
  { key: 'cctv', label: 'CCTV', category: 'security_access' },
  { key: 'parking', label: 'Parking', category: 'parking_outdoor', conditional: [
    { key: 'capacity', label: 'Number of vehicles', type: 'number' },
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'open', label: 'Open' },
      { value: 'covered', label: 'Covered' },
      { value: 'carport', label: 'Carport' },
      { value: 'garage', label: 'Garage' },
      { value: 'unknown', label: 'Unknown' },
    ]},
  ]},
  { key: 'covered_parking', label: 'Covered Parking', category: 'parking_outdoor' },
  { key: 'compound', label: 'Compound', category: 'parking_outdoor' },
  { key: 'garden', label: 'Garden', category: 'parking_outdoor' },
  { key: 'balcony', label: 'Balcony', category: 'parking_outdoor' },
  { key: 'terrace', label: 'Terrace', category: 'parking_outdoor' },
  { key: 'tiled_floor', label: 'Tiled Floor', category: 'building_features' },
  { key: 'pop_ceiling', label: 'POP Ceiling', category: 'building_features' },
  { key: 'fitted_kitchen', label: 'Fitted Kitchen', category: 'building_features' },
  { key: 'water_heater', label: 'Water Heater', category: 'building_features' },
  { key: 'elevator', label: 'Elevator', category: 'building_features' },
  { key: 'estate', label: 'Estate', category: 'estate_community' },
  { key: 'estate_gate', label: 'Estate Gate', category: 'estate_community' },
  { key: 'estate_security', label: 'Estate Security', category: 'estate_community' },
];

const PropertyFeaturesForm = ({ value = {}, onChange }) => {
  const [open, setOpen] = useState({});

  const getFeature = (key) => value[key] || { available: null, details: {}, description: '' };

  const setFeature = (key, available) => {
    const next = { ...value };
    if (available === null) {
      next[key] = { available: null, details: {}, description: '' };
    } else if (available === true) {
      next[key] = { available: true, details: next[key]?.details || {}, description: next[key]?.description || '' };
    } else {
      next[key] = { available: false, details: {}, description: '' };
    }
    onChange(next);
  };

  const setDetail = (key, detailKey, detailValue) => {
    const next = { ...value };
    const current = next[key] || { available: null, details: {}, description: '' };
    next[key] = { ...current, available: current.available === null ? true : current.available, details: { ...(current.details || {}), [detailKey]: detailValue } };
    onChange(next);
  };

  const shouldShow = (feature, details) => {
    if (!feature.conditional) return true;
    for (const field of feature.conditional) {
      if (field.showIf) {
        for (const [k, v] of Object.entries(field.showIf)) {
          if (details[k] !== v) return false;
        }
      }
    }
    return true;
  };

  const grouped = FEATURE_CATEGORIES.map(cat => ({
    ...cat,
    features: FEATURES.filter(f => f.category === cat.key),
  })).filter(g => g.features.length);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <label className="block text-sm font-semibold text-gray-900">Property Features</label>
        <p className="mt-1 text-xs text-gray-500">Answer Yes/No/Unspecified. Add details only if you know them.</p>
      </div>
      {grouped.map((group) => (
        <div key={group.key} className="border border-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setOpen(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-50"
          >
            <span className="text-sm font-medium">{group.label}</span>
            {open[group.key] ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          {open[group.key] && (
            <div className="divide-y divide-gray-100">
              {group.features.map((feature) => {
                const feat = getFeature(feature.key);
                const details = feat.details || {};
                return (
                  <div key={feature.key} className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{feature.label}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setFeature(feature.key, true)} className={`px-3 py-1 rounded text-xs ${feat.available === true ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>YES</button>
                        <button type="button" onClick={() => setFeature(feature.key, false)} className={`px-3 py-1 rounded text-xs ${feat.available === false ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>NO</button>
                        <button type="button" onClick={() => setFeature(feature.key, null)} className={`px-3 py-1 rounded text-xs ${feat.available === null ? 'bg-gray-600 text-white' : 'bg-gray-100'}`}>UNSPECIFIED</button>
                      </div>
                    </div>
                    {feat.available === true && feature.conditional && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2">
                        {feature.conditional.map((field) => {
                          if (field.showIf && !Object.entries(field.showIf).every(([k,v]) => details[k] === v)) return null;
                          if (field.type === 'select') {
                            return (
                              <div key={field.key} className="space-y-1">
                                <label className="text-xs text-gray-600">{field.label}</label>
                                <select value={details[field.key] || ''} onChange={(e) => setDetail(feature.key, field.key, e.target.value)} className="input text-sm">
                                  <option value="">Select</option>
                                  {(field.options || []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                              </div>
                            );
                          }
                          if (field.type === 'time') {
                            return (
                              <div key={field.key} className="space-y-1">
                                <label className="text-xs text-gray-600">{field.label}</label>
                                <input type="time" value={details[field.key] || ''} onChange={(e) => setDetail(feature.key, field.key, e.target.value)} className="input text-sm" />
                              </div>
                            );
                          }
                          return (
                            <div key={field.key} className="space-y-1">
                              <label className="text-xs text-gray-600">{field.label}</label>
                              <input type={field.type || 'text'} value={details[field.key] || ''} onChange={(e) => setDetail(feature.key, field.key, e.target.value)} className="input text-sm" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  );
};

export default PropertyFeaturesForm;
