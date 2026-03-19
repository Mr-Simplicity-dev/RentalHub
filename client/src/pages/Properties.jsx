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
  const alertRequestReference =
    searchParams.get('alert_ref') ||
    searchParams.get('reference') ||
    searchParams.get('trxref');

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
  });
  const [resultNote, setResultNote] = useState('');
  const [filters, setFilters] = useState({});
  const [savedPropertyIds, setSavedPropertyIds] = useState([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [alertPaymentEnabled, setAlertPaymentEnabled] = useState(false);
  const [alertPricing, setAlertPricing] = useState({
    amount: 5000,
    base_amount: 5000,
    location_required: false,
    location_complete: false,
    rule_scope: 'base',
  });
  const requestSectionRef = useRef(null);
  const handledAlertRequestRef = useRef('');
  const [requestForm, setRequestForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    property_type: '',
    state_id: '',
    lga_name: '',
    location: '',
    min_price: '',
    max_price: '',
    bedrooms: '',
    bathrooms: '',
  });

  const loadProperties = useCallback(async (filterParams = {}, page = 1) => {
    setLoading(true);
    setResultNote('');
    try {
      const response = await propertyService.searchProperties({
        ...filterParams,
        page,
        limit: PAGE_SIZE,
      });

      if (response.success) {
        const exactResults = response.data || [];

        if (exactResults.length > 0 || page !== 1) {
          setProperties(exactResults);
          setPagination(response.pagination);
          return;
        }

        const hasStateFilter = Boolean(filterParams.state || filterParams.state_id);
        const hasNarrowSearch = Boolean(
          filterParams.search ||
          filterParams.city ||
          filterParams.property_type ||
          filterParams.min_price ||
          filterParams.max_price ||
          filterParams.bedrooms ||
          filterParams.bathrooms
        );

        if (hasStateFilter && hasNarrowSearch) {
          const fallbackParams = {};

          if (filterParams.state_id) {
            fallbackParams.state_id = filterParams.state_id;
          }

          if (filterParams.state) {
            fallbackParams.state = filterParams.state;
          }

          if (filterParams.featured) {
            fallbackParams.featured = filterParams.featured;
          }

          const fallbackResponse = await propertyService.searchProperties({
            ...fallbackParams,
            page: 1,
            limit: PAGE_SIZE,
          });

          if (fallbackResponse.success && (fallbackResponse.data || []).length > 0) {
            setProperties(fallbackResponse.data || []);
            setPagination(fallbackResponse.pagination);
            setResultNote(
              filterParams.state
                ? `No exact matches found. Showing related properties in ${filterParams.state}.`
                : 'No exact matches found. Showing related properties in the selected state.'
            );
            return;
          }
        }

        setProperties(exactResults);
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error(t('properties.load_failed'));
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadLocationOptions = useCallback(async () => {
    try {
      const response = await propertyService.getLocationOptions();
      if (response?.success && Array.isArray(response.data)) {
        setLocationOptions(response.data);
      } else {
        setLocationOptions([]);
      }
    } catch {
      setLocationOptions([]);
    }
  }, []);

  const loadAlertRequestConfig = useCallback(async () => {
    try {
      const response = await propertyService.getPropertyAlertConfig({
        state_id: requestForm.state_id || undefined,
        lga_name: requestForm.lga_name || undefined,
      });

      setAlertPaymentEnabled(response?.data?.payment_required === true);
      setAlertPricing({
        amount: response?.data?.amount || 5000,
        base_amount: response?.data?.base_amount || 5000,
        location_required: response?.data?.location_required === true,
        location_complete: response?.data?.location_complete === true,
        rule_scope: response?.data?.rule_scope || 'base',
      });
    } catch {
      setAlertPaymentEnabled(false);
      setAlertPricing({
        amount: 5000,
        base_amount: 5000,
        location_required: false,
        location_complete: false,
        rule_scope: 'base',
      });
    }
  }, [requestForm.state_id, requestForm.lga_name]);

  const selectedRequestState = locationOptions.find(
    (item) => String(item.id) === String(requestForm.state_id)
  );
  const availableRequestLgas = selectedRequestState?.lgas || [];
  const alertRequestFeeLabel = `N${Number(
    alertPricing.amount || 5000
  ).toLocaleString()}`;

  useEffect(() => {
    loadLocationOptions();
  }, [loadLocationOptions]);

  useEffect(() => {
    loadAlertRequestConfig();
  }, [loadAlertRequestConfig]);

  useEffect(() => {
    // Get initial filters from URL
    const initialFilters = {};
    searchParams.forEach((value, key) => {
      if (!['request', 'alert_ref', 'reference', 'trxref'].includes(key)) {
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
      lga_name: '',
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
    const mergedFilters = filters.featured
      ? { ...newFilters, featured: filters.featured }
      : newFilters;

    setFilters(mergedFilters);
    loadProperties(mergedFilters, 1);
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
    setRequestForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'state_id' ? { lga_name: '' } : {}),
    }));
  };

  const clearCompletedAlertRequestParams = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('alert_ref');
    url.searchParams.delete('reference');
    url.searchParams.delete('trxref');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const resetRequestOptionalFields = useCallback(() => {
    setRequestForm((prev) => ({
      ...prev,
      phone: '',
      location: '',
      min_price: '',
      max_price: '',
      bedrooms: '',
      bathrooms: '',
    }));
  }, []);

  const completeTenantRequestPayment = useCallback(
    async (reference) => {
      if (!reference) {
        return;
      }

      setRequestLoading(true);
      setShowRequestForm(true);

      try {
        const res = await propertyService.completePropertyAlertRequest(reference);

        if (res.success) {
          toast.success(
            res.message ||
              'Request submitted successfully. We will notify you when a matching property is available.'
          );
          resetRequestOptionalFields();
          clearCompletedAlertRequestParams();
        }
      } catch (error) {
        toast.error(
          error.response?.data?.message || 'Failed to complete notification request'
        );
      } finally {
        setRequestLoading(false);
      }
    },
    [clearCompletedAlertRequestParams, resetRequestOptionalFields]
  );

  useEffect(() => {
    if (
      alertRequestReference &&
      handledAlertRequestRef.current !== alertRequestReference
    ) {
      handledAlertRequestRef.current = alertRequestReference;
      completeTenantRequestPayment(alertRequestReference);
    }
  }, [alertRequestReference, completeTenantRequestPayment]);

  const submitTenantRequest = useCallback(async (e) => {
    e.preventDefault();

    if (!requestForm.full_name || !requestForm.email || !requestForm.property_type) {
      toast.error('Name, email and property type are required');
      return;
    }

    if (alertPaymentEnabled && !requestForm.state_id) {
      toast.error('Select your preferred state to calculate the request fee');
      return;
    }

    if (alertPaymentEnabled && !requestForm.lga_name) {
      toast.error('Select your preferred local government area to calculate the request fee');
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
        lga_name: requestForm.lga_name || undefined,
        city: requestForm.location || undefined,
        min_price: requestForm.min_price || undefined,
        max_price: requestForm.max_price || undefined,
        bedrooms: requestForm.bedrooms || undefined,
        bathrooms: requestForm.bathrooms || undefined,
      };

      const res = await propertyService.requestPropertyAlert(payload);

      if (res.data?.authorization_url) {
        window.location.href = res.data.authorization_url;
        return;
      }

      if (res.success) {
        toast.success(
          res.message ||
            'Request submitted successfully. We will notify you when a matching property is available.'
        );
        resetRequestOptionalFields();
        return;
      }

      toast.error(res.message || 'Unable to submit notification request');
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to submit notification request'
      );
    } finally {
      setRequestLoading(false);
    }
  }, [alertPaymentEnabled, requestForm, resetRequestOptionalFields]);

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6 text-center">
          {filters.featured ? 'Featured Properties' : t('properties.title')}
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
          {filters.featured && !loading && (
            <p className="mt-2 text-sm text-primary-700">
              Showing featured listings ordered by creation date.
            </p>
          )}
          {resultNote && (
            <p className="mt-2 text-sm text-amber-700">
              {resultNote}
            </p>
          )}
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
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Not finding what you need?
            </h2>
            <p className="text-gray-600 mb-4">
              Submit your request and we will notify you by email and WhatsApp once a matching property is available.
            </p>
            <p className={`text-sm mb-4 ${alertPaymentEnabled ? 'text-primary-700' : 'text-green-700'}`}>
              {alertPaymentEnabled
                ? `A one-time ${alertRequestFeeLabel} payment is required before the request is processed.`
                : 'Requests are currently submitted immediately without payment.'}
              {alertPaymentEnabled && !alertPricing.location_complete && (
                <span className="block mt-1 text-xs text-primary-700">
                  Select both state and local government area to confirm the exact fee.
                </span>
              )}
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
                {locationOptions.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.state_name}
                  </option>
                ))}
              </select>
              <select
                name="lga_name"
                className="input"
                value={requestForm.lga_name}
                onChange={handleRequestChange}
                disabled={!requestForm.state_id}
              >
                <option value="">Preferred local government area</option>
                {availableRequestLgas.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
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

              <button
                disabled={requestLoading || (alertPaymentEnabled && !alertPricing.location_complete)}
                className="btn btn-primary md:col-span-2"
              >
                {requestLoading
                  ? (alertRequestReference
                    ? 'Confirming payment and submitting request...'
                    : (alertPaymentEnabled ? 'Redirecting to payment...' : 'Submitting request...'))
                  : (alertPaymentEnabled
                    ? `Pay ${alertRequestFeeLabel} to Notify Me`
                    : 'Notify me when available')}
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
