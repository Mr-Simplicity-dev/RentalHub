import React, { useState, useEffect } from 'react';
import { propertyService } from '../../services/propertyService';
import { FaSearch, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { SEARCHABLE_FEATURES } from '../../data/propertyFeatureSchema';

const QUICK_FEATURES = [
  'water_board',
  'borehole',
  'electricity',
  'prepaid_meter',
  'generator',
  'solar',
  'internet',
  'kitchen',
  'air_conditioning',
  'fence',
  'gate',
  'security_personnel',
  'cctv',
  'parking',
  'balcony',
  'estate',
  'estate_security',
  'fitted_kitchen',
  'water_heater',
  'elevator',
];

const QUICK_FEATURE_OPTIONS = QUICK_FEATURES.map((key) =>
  SEARCHABLE_FEATURES.find((feature) => feature.key === key)
).filter(Boolean);

const FALLBACK_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
  'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'detached', label: 'Detached House' },
  { value: 'semi-detached', label: 'Semi-Detached' },
  { value: 'terrace', label: 'Terrace' },
  { value: 'land', label: 'Land' },
  { value: 'shop', label: 'Shop' },
  { value: 'office', label: 'Office Space' },
  { value: 'warehouse', label: 'Warehouse' },
];

const PropertyFilters = ({ onFilterChange, initialFilters = {} }) => {
  const { t } = useTranslation();
  const [states, setStates] = useState([]);
  const [filters, setFilters] = useState({
    state: '',
    city: '',
    property_type: '',
    min_price: '',
    max_price: '',
    bedrooms: '',
    bathrooms: '',
    features: '',
    ...initialFilters,
  });
  const [showFeatureFilters, setShowFeatureFilters] = useState(
    Boolean(initialFilters?.features)
  );

  useEffect(() => {
    loadStates();
  }, []);

  const selectedFeatureKeys = String(filters.features || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  const toggleFeature = (key) => {
    const next = selectedFeatureKeys.includes(key)
      ? selectedFeatureKeys.filter((item) => item !== key)
      : [...selectedFeatureKeys, key];
    setFilters((prev) => ({ ...prev, features: next.join(',') }));
  };

  const loadStates = async () => {
    try {
      const response = await propertyService.getStates();
      if (response?.success && Array.isArray(response.data) && response.data.length) {
        setStates(response.data.map(s => s.state_name));
      } else {
        setStates(FALLBACK_STATES);
      }
    } catch (error) {
      console.error('Error loading states, using fallback:', error);
      setStates(FALLBACK_STATES);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== '')
    );
    onFilterChange(activeFilters);
  };

  const handleReset = () => {
    const reset = {
      state: '',
      city: '',
      property_type: '',
      min_price: '',
      max_price: '',
      bedrooms: '',
      bathrooms: '',
      features: '',
    };
    setFilters(reset);
    setShowFeatureFilters(false);
    onFilterChange({});
  };

return (
  <div className="card mb-6 w-full max-w-full overflow-hidden">
    <div className="text-center mb-4">
      <h3 className="text-lg font-semibold">{t('property_filters.title', 'Filter Properties')}</h3>
    </div>

    <form onSubmit={handleSubmit} className="w-full">
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

        {/* State */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.state', 'State')}
          </label>
          <select
            name="state"
            value={filters.state}
            onChange={handleChange}
            className="input"
          >
            <option value="">{t('property_filters.all_states', 'All States')}</option>
            {states.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.city_area', 'City/Area')}
          </label>
          <input
            type="text"
            name="city"
            value={filters.city}
            onChange={handleChange}
            className="input"
            placeholder={t('property_filters.city_placeholder', 'Enter city or area')}
          />
        </div>

        {/* Property Type */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.property_type', 'Property Type')}
          </label>
          <select
            name="property_type"
            value={filters.property_type}
            onChange={handleChange}
            className="input"
          >
            <option value="">{t('property_filters.all_types', 'All Types')}</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {t(`property_filters.type_${type.value}`, type.label)}
              </option>
            ))}
          </select>
        </div>

        {/* Bedrooms */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.min_bedrooms', 'Min. Bedrooms')}
          </label>
          <select
            name="bedrooms"
            value={filters.bedrooms}
            onChange={handleChange}
            className="input"
          >
            <option value="">{t('property_filters.any', 'Any')}</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="5">5+</option>
          </select>
        </div>

        {/* Min Price */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.min_price', 'Min. Price (₦)')}
          </label>
          <input
            type="number"
            name="min_price"
            value={filters.min_price}
            onChange={handleChange}
            className="input"
            placeholder="0"
          />
        </div>

        {/* Max Price */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.max_price', 'Max. Price (₦)')}
          </label>
          <input
            type="number"
            name="max_price"
            value={filters.max_price}
            onChange={handleChange}
            className="input"
            placeholder={t('property_filters.max_price_placeholder', 'No limit')}
          />
        </div>

        {/* Bathrooms */}
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('property_filters.min_bathrooms', 'Min. Bathrooms')}
          </label>
          <select
            name="bathrooms"
            value={filters.bathrooms}
            onChange={handleChange}
            className="input"
          >
            <option value="">{t('property_filters.any', 'Any')}</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </div>

        {/* Must-have features */}
        <div className="min-w-0 md:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={() => setShowFeatureFilters((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700"
          >
            <span>
              {t('property_filters.must_have_features', 'Must-have features')}
              {selectedFeatureKeys.length > 0 && (
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                  {selectedFeatureKeys.length}
                </span>
              )}
            </span>
            {showFeatureFilters ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          {showFeatureFilters && (
            <>
              <p className="mt-2 text-xs text-gray-500">
                {t(
                  'property_filters.features_hint',
                  'Only properties where the landlord confirmed these features will match.'
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_FEATURE_OPTIONS.map((feature) => {
                  const active = selectedFeatureKeys.includes(feature.key);
                  return (
                    <button
                      key={feature.key}
                      type="button"
                      onClick={() => toggleFeature(feature.key)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        active
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {t(`property_features.${feature.key}`, feature.label)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Buttons */}
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-end">
          <button type="submit" className="btn btn-primary w-full sm:flex-1">
            <FaSearch className="mr-2 shrink-0" />
            {t('property_filters.search', 'Search')}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary w-full sm:w-auto"
          >
            {t('property_filters.reset', 'Reset')}
          </button>
        </div>

      </div>
    </form>
  </div>
);
};
export default PropertyFilters;
