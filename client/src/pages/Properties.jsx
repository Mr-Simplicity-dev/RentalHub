import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyList from '../components/properties/PropertyList';
import PropertyFilters from '../components/properties/PropertyFilters';
import { toast } from 'react-toastify';
import ReactPaginate from 'react-paginate';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;

const Properties = () => {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
  });
  const [filters, setFilters] = useState({});
  const [savedPropertyIds, setSavedPropertyIds] = useState([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [states, setStates] = useState([]);
  const requestSectionRef = useRef(null);
  const [requestForm, setRequestForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    property_type: '',
    state_id: '',
    location: '',
    min_price: '',
    max_price: '',
    bedrooms: '',
    bathrooms: '',
  });

  const loadProperties = useCallback(async (filterParams = {}, page = 1) => {
    setLoading(true);
    try {
      const response = await propertyService.searchProperties({
        ...filterParams,
        page,
        limit: PAGE_SIZE,
      });

      if (response.success) {
        setProperties(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(t('properties.load_failed'));
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadStates = useCallback(async () => {
    try {
      const response = await propertyService.getStates();
      if (response?.success && Array.isArray(response.data)) {
        setStates(response.data);
      } else {
        setStates([]);
      }
    } catch {
      setStates([]);
    }
  }, []);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  useEffect(() => {
    // Get initial filters from URL
    const initialFilters = {};
    searchParams.forEach((value, key) => {
      if (key !== 'request') {
        initialFilters[key] = value;
      }
    });

    const shouldOpenRequestForm =
      searchParams.get('request') === '1' ||
      window.location.hash === '#tenant-request';

    setFilters(initialFilters);
    setShowRequestForm(shouldOpenRequestForm);
    setRequestForm((prev) => ({
      ...prev,
      property_type: initialFilters.property_type || '',
      state_id: initialFilters.state_id || '',
      location: initialFilters.city || '',
    }));

    if (shouldOpenRequestForm) {
      setTimeout(() => {
        requestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }

    loadProperties(initialFilters);
  }, [searchParams, loadProperties]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    loadProperties(newFilters, 1);
  };

  const handlePageChange = (selectedPage) => {
    const newPage = selectedPage.selected + 1;
    loadProperties(filters, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProperty = async (propertyId) => {
    try {
      if (savedPropertyIds.includes(propertyId)) {
        await propertyService.unsaveProperty(propertyId);
        setSavedPropertyIds(savedPropertyIds.filter(id => id !== propertyId));
        toast.success(t('properties.removed_favorite'));
      } else {
        await propertyService.saveProperty(propertyId);
        setSavedPropertyIds([...savedPropertyIds, propertyId]);
        toast.success(t('properties.saved_favorite'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('properties.save_failed'));
    }
  };

  const handleRequestChange = (e) => {
    const { name, value } = e.target;
    setRequestForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitTenantRequest = async (e) => {
    e.preventDefault();

    if (!requestForm.full_name || !requestForm.email || !requestForm.property_type) {
      toast.error('Name, email and property type are required');
      return;
    }

    setRequestLoading(true);
    try {
      const payload = {
        full_name: requestForm.full_name,
        email: requestForm.email,
        phone: requestForm.phone || undefined,
        property_type: requestForm.property_type,
        state_id: requestForm.state_id ? Number(requestForm.state_id) : undefined,
        city: requestForm.location || undefined,
        min_price: requestForm.min_price || undefined,
        max_price: requestForm.max_price || undefined,
        bedrooms: requestForm.bedrooms || undefined,
        bathrooms: requestForm.bathrooms || undefined,
      };

      const res = await propertyService.requestPropertyAlert(payload);
      if (res.success) {
        toast.success(res.message || 'Request submitted successfully');
        setRequestForm((prev) => ({
          ...prev,
          phone: '',
          location: '',
          min_price: '',
          max_price: '',
          bedrooms: '',
          bathrooms: '',
        }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit request');
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6">
          {t('properties.title')}
        </h1>

        {/* Filters */}
        <PropertyFilters
          onFilterChange={handleFilterChange}
          initialFilters={filters}
        />

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-gray-600">
            {loading
              ? t('properties.loading')
              : t('properties.found', { count: pagination.total })}
          </p>
          <button
            type="button"
            className="mt-2 text-primary-600 hover:text-primary-700 font-medium underline"
            onClick={() => {
              setShowRequestForm((prev) => !prev);
              setTimeout(() => {
                requestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 0);
            }}
          >
            {showRequestForm
              ? 'Hide request form'
              : "Can't find your preferred property? Submit a request"}
          </button>
        </div>

        {/* Property List */}
        <PropertyList
          properties={properties}
          loading={loading}
          onSave={handleSaveProperty}
          savedPropertyIds={savedPropertyIds}
        />

        {(showRequestForm || (!loading && properties.length === 0)) && (
          <div id="tenant-request" ref={requestSectionRef} className="card mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Not finding what you need?
            </h2>
            <p className="text-gray-600 mb-4">
              Submit your request and we will notify you by email and WhatsApp once a matching property is available.
            </p>

            <form onSubmit={submitTenantRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                name="full_name"
                className="input"
                placeholder="Full name"
                value={requestForm.full_name}
                onChange={handleRequestChange}
              />
              <input
                name="email"
                type="email"
                className="input"
                placeholder="Email address"
                value={requestForm.email}
                onChange={handleRequestChange}
              />
              <input
                name="phone"
                className="input"
                placeholder="WhatsApp phone (e.g. +234...)"
                value={requestForm.phone}
                onChange={handleRequestChange}
              />
              <select
                name="property_type"
                className="input"
                value={requestForm.property_type}
                onChange={handleRequestChange}
              >
                <option value="">Property type</option>
                <option value="apartment">Apartment</option>
                <option value="house">House</option>
                <option value="duplex">Duplex</option>
                <option value="studio">Studio</option>
                <option value="bungalow">Bungalow</option>
                <option value="flat">Flat</option>
                <option value="room">Room</option>
              </select>
              <select
                name="state_id"
                className="input"
                value={requestForm.state_id}
                onChange={handleRequestChange}
              >
                <option value="">Preferred state</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.state_name}
                  </option>
                ))}
              </select>
              <input
                name="location"
                className="input"
                placeholder="Preferred location (city/area)"
                value={requestForm.location}
                onChange={handleRequestChange}
              />
              <input
                name="min_price"
                type="number"
                className="input"
                placeholder="Min budget (NGN)"
                value={requestForm.min_price}
                onChange={handleRequestChange}
              />
              <input
                name="max_price"
                type="number"
                className="input"
                placeholder="Max budget (NGN)"
                value={requestForm.max_price}
                onChange={handleRequestChange}
              />
              <input
                name="bedrooms"
                type="number"
                className="input"
                placeholder="Minimum bedrooms"
                value={requestForm.bedrooms}
                onChange={handleRequestChange}
              />
              <input
                name="bathrooms"
                type="number"
                className="input"
                placeholder="Minimum bathrooms"
                value={requestForm.bathrooms}
                onChange={handleRequestChange}
              />

              <button disabled={requestLoading} className="btn btn-primary md:col-span-2">
                {requestLoading ? 'Submitting request...' : 'Notify me when available'}
              </button>
            </form>
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.total > pagination.limit && (
          <div className="mt-8 flex justify-center">
            <ReactPaginate
              previousLabel={t('properties.prev')}
              nextLabel={t('properties.next')}
              pageCount={Math.ceil(pagination.total / pagination.limit)}
              onPageChange={handlePageChange}
              containerClassName="flex space-x-2"
              pageClassName="px-4 py-2 border rounded hover:bg-gray-100"
              activeClassName="bg-primary-600 text-white hover:bg-primary-700"
              previousClassName="px-4 py-2 border rounded hover:bg-gray-100"
              nextClassName="px-4 py-2 border rounded hover:bg-gray-100"
              disabledClassName="opacity-50 cursor-not-allowed"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Properties;
