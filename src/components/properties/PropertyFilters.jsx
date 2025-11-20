import React, { useState, useEffect } from 'react';
import { propertyService } from '../../services/propertyService';
import { PROPERTY_TYPES } from '../../utils/constants';
import { FaSearch } from 'react-icons/fa';

const PropertyFilters = ({ onFilterChange, initialFilters = {} }) => {
  const [states, setStates] = useState([]);
  const [filters, setFilters] = useState({
    state_id: '',
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
      if (response.success) {
        setStates(response.data);
      }
    } catch (error) {
      console.error('Error loading states:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Remove empty filters
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value !== '')
    );
    onFilterChange(activeFilters);
  };

  const handleReset = () => {
    setFilters({
      state_id: '',
      city: '',
      property_type: '',
      min_price: '',
      max_price: '',
      bedrooms: '',
      bathrooms: '',
    });
    onFilterChange({});
  };

  return (
    <div className="card mb-6">
      <h3 className="text-lg font-semibold mb-4">Filter Properties</h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* State */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <select
              name="state_id"
              value={filters.state_id}
              onChange={handleChange}
              className="input"
            >
              <option value="">All States</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.state_name}
                </option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City/Area
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property Type
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min. Bedrooms
            </label>
            <select
              name="bedrooms"
              value={filters.bedrooms}
              onChange={handleChange}
              className="input"
            >
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min. Price (₦)
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max. Price (₦)
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min. Bathrooms
            </label>
            <select
              name="bathrooms"
              value={filters.bathrooms}
              onChange={handleChange}
              className="input"
            >
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
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary"
            >
              Reset
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default PropertyFilters;