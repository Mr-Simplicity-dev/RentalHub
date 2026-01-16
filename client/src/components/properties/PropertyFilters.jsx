import React, { useState, useEffect } from 'react';
import { propertyService } from '../../services/propertyService';
import { FaSearch } from 'react-icons/fa';

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
  const [states, setStates] = useState([]);
  const [filters, setFilters] = useState({
    state: '',
    city: '',
    property_type: '',
    min_price: '',
    max_price: '',
    bedrooms: '',
    bathrooms: '',
    ...initialFilters,
  });

  useEffect(() => {
    loadStates();
  }, []);

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
    };
    setFilters(reset);
    onFilterChange({});
  };

  return (
    <div className="card mb-6">
      <h3 className="text-lg font-semibold mb-4">Filter Properties</h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* State */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select name="state" value={filters.state} onChange={handleChange} className="input">
              <option value="">All States</option>
              {states.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City/Area</label>
            <input
              type="text"
              name="city"
              value={filters.city}
              onChange={handleChange}
              className="input"
              placeholder="Enter city or area"
            />
          </div>

          {/* Property Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
            <select
              name="property_type"
              value={filters.property_type}
              onChange={handleChange}
              className="input"
            >
              <option value="">All Types</option>
              {PROPERTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bedrooms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. Bedrooms</label>
            <select name="bedrooms" value={filters.bedrooms} onChange={handleChange} className="input">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>

          {/* Min Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. Price (₦)</label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max. Price (₦)</label>
            <input
              type="number"
              name="max_price"
              value={filters.max_price}
              onChange={handleChange}
              className="input"
              placeholder="No limit"
            />
          </div>

          {/* Bathrooms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. Bathrooms</label>
            <select name="bathrooms" value={filters.bathrooms} onChange={handleChange} className="input">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex items-end space-x-2">
            <button type="submit" className="btn btn-primary flex-1">
              <FaSearch className="inline mr-2" />
              Search
            </button>
            <button type="button" onClick={handleReset} className="btn btn-secondary">
              Reset
            </button>
          </div>

        </div>
      </form>
    </div>
  );
};

export default PropertyFilters;
