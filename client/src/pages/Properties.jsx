import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import { paymentService } from '../services/paymentService';
import PropertyList from '../components/properties/PropertyList';
import PropertyFilters from '../components/properties/PropertyFilters';
import AdSpace from '../components/common/AdSpace';
import { toast } from 'react-toastify';
import ReactPaginate from 'react-paginate';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;
const IGNORED_PROPERTY_FILTER_PARAMS = [
  'request',
  'alert_ref',
  'location_access_ref',
  'reference',
  'trxref',
];

const getPropertyFiltersFromSearchParams = (params) => {
  const nextFilters = {};
  params.forEach((value, key) => {
    if (!IGNORED_PROPERTY_FILTER_PARAMS.includes(key)) {
      nextFilters[key] = value;
    }
  });
  return nextFilters;
};

const Properties = () => {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const genericPaymentReference =
    searchParams.get('reference') || searchParams.get('trxref') || '';
  const locationAccessReference =
    searchParams.get('location_access_ref') ||
    (genericPaymentReference.startsWith('LOC_') ? genericPaymentReference : '');
  const alertRequestReference =
    searchParams.get('alert_ref') ||
    (!locationAccessReference ? genericPaymentReference : '');

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
  const [locationAccessRequirement, setLocationAccessRequirement] = useState(null);
  const [locationAccessLoading, setLocationAccessLoading] = useState(false);
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
        setLocationAccessRequirement(null);
        const exactResults = response.data || [];

        if (exactResults.length > 0 || page !== 1) {
          setProperties(exactResults);
          setPagination(response.pagination);
          return;
        }

        const hasStateFilter = Boolean(filterParams.state || filterParams.state_id);
        const hasNarrowSearch = Boolean(
          filterParams.search ||
          filterParams.lga_name ||
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
              filterParams.lga_name
                ? `No exact matches found in ${filterParams.lga_name}. Showing related properties in the selected state.`
                : filterParams.state
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
      const responseData = error.response?.data;
      if (
        error.response?.status === 402 &&
        responseData?.code === 'LOCATION_ACCESS_PAYMENT_REQUIRED'
      ) {
        setLocationAccessRequirement({
          message: responseData.message,
          ...(responseData.data || {}),
        });
        setProperties([]);
        setPagination((prev) => ({
          ...prev,
          page,
          total: 0,
        }));
        return;
      }

      toast.error(responseData?.message || t('properties.load_failed'));
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
  const alertRequestFeeLabel = `₦${Number(
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
    const initialFilters = getPropertyFiltersFromSearchParams(searchParams);

    const shouldOpenRequestForm =
      searchParams.get('request') === '1' ||
      window.location.hash === '#tenant-request';

    setFilters(initialFilters);
    setShowRequestForm(shouldOpenRequestForm);
    setRequestForm((prev) => ({
      ...prev,
      property_type: initialFilters.property_type || '',
      state_id: initialFilters.state_id || '',
      lga_name: initialFilters.lga_name || '',
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

  const clearCompletedLocationAccessParams = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('location_access_ref');
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
              'Request submitted successfully. Support admin will review it before the state team starts sourcing.'
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

  const completeLocationAccessPayment = useCallback(
    async (reference) => {
      if (!reference) {
        return;
      }

      setLocationAccessLoading(true);
      try {
        const res = await paymentService.verifyLocationAccess(reference);

        if (res.success) {
          toast.success(res.message || 'Location access activated');
          setLocationAccessRequirement(null);
          clearCompletedLocationAccessParams();
          const nextFilters = getPropertyFiltersFromSearchParams(
            new URLSearchParams(window.location.search)
          );
          setFilters(nextFilters);
          loadProperties(nextFilters, 1);
        }
      } catch (error) {
        toast.error(
          error.response?.data?.message || 'Failed to verify location access payment'
        );
      } finally {
        setLocationAccessLoading(false);
      }
    },
    [clearCompletedLocationAccessParams, loadProperties]
  );

  const handledLocationAccessRef = useRef('');

  useEffect(() => {
    if (
      locationAccessReference &&
      handledLocationAccessRef.current !== locationAccessReference
    ) {
      handledLocationAccessRef.current = locationAccessReference;
      completeLocationAccessPayment(locationAccessReference);
    }
  }, [locationAccessReference, completeLocationAccessPayment]);

  const handleLocationAccessPayment = useCallback(async () => {
    const location = locationAccessRequirement?.location;

    if (!location?.state_id) {
      toast.error(t('properties.select_valid_location'));
      return;
    }

    setLocationAccessLoading(true);
    try {
      const res = await paymentService.initializeLocationAccess({
        state_id: location.state_id,
        lga_name: location.lga_name || undefined,
      });

      if (res.payment_required === false) {
        toast.success(res.message || t('properties.already_have_access'));
        setLocationAccessRequirement(null);
        loadProperties(filters, 1);
        return;
      }

      if (res.data?.authorization_url) {
        window.location.href = res.data.authorization_url;
        return;
      }

      toast.error(res.message || t('properties.location_access_start_failed'));
    } catch (error) {
      toast.error(
        error.response?.data?.message || t('properties.location_access_start_failed')
      );
    } finally {
      setLocationAccessLoading(false);
    }
  }, [filters, loadProperties, locationAccessRequirement, t]);

  const submitTenantRequest = useCallback(async (e) => {
    e.preventDefault();

    if (!requestForm.full_name || !requestForm.email || !requestForm.property_type) {
      toast.error(t('properties.request_required'));
      return;
    }

    if (alertPaymentEnabled && !requestForm.state_id) {
      toast.error(t('properties.request_state_required'));
      return;
    }

    if (alertPaymentEnabled && !requestForm.lga_name) {
      toast.error(t('properties.request_lga_required'));
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
            t('properties.request_success')
        );
        resetRequestOptionalFields();
        return;
      }

      toast.error(res.message || t('properties.request_submit_failed'));
    } catch (error) {
      toast.error(
        error.response?.data?.message || t('properties.request_submit_failed')
      );
    } finally {
      setRequestLoading(false);
    }
  }, [alertPaymentEnabled, requestForm, resetRequestOptionalFields, t]);

  const locationAccessLocationLabel = locationAccessRequirement?.location
    ? [
        locationAccessRequirement.location.lga_name,
        locationAccessRequirement.location.state_name,
      ]
        .filter(Boolean)
        .join(', ')
    : t('properties.this_location');
  const locationAccessHomeLabel = locationAccessRequirement?.home_location
    ? [
        locationAccessRequirement.home_location.lga_name,
        locationAccessRequirement.home_location.state_name,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  const locationAccessFeeLabel = `₦${Number(
    locationAccessRequirement?.amount || 10000
  ).toLocaleString()}`;

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6 text-center">
          {filters.featured ? t('properties.featured_title') : t('properties.title')}
        </h1>

        <AdSpace placement="properties_top" className="mb-6" />

        {/* Filters */}
        <PropertyFilters
          onFilterChange={handleFilterChange}
          initialFilters={filters}
        />

        {locationAccessRequirement && (
          <div className="card mb-6 border border-amber-200 bg-amber-50">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
                  {t('properties.location_access_required')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {t('properties.pay_to_browse', {
                    amount: locationAccessFeeLabel,
                    location: locationAccessLocationLabel,
                  })}
                </h2>
                <p className="mt-2 text-sm text-gray-700">
                  {locationAccessRequirement.message ||
                    t('properties.location_access_text')}
                </p>
                {locationAccessHomeLabel && (
                  <p className="mt-1 text-xs text-gray-600">
                    {t('properties.registered_location', { location: locationAccessHomeLabel })}
                  </p>
                )}
                {locationAccessRequirement.access_days && (
                  <p className="mt-1 text-xs text-gray-600">
                    {t('properties.access_lasts', { days: locationAccessRequirement.access_days })}
                  </p>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary w-full md:w-auto"
                onClick={handleLocationAccessPayment}
                disabled={locationAccessLoading}
              >
                {locationAccessLoading
                  ? t('common.processing')
                  : t('properties.pay_amount', { amount: locationAccessFeeLabel })}
              </button>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-gray-600">
            {loading
              ? t('properties.loading')
              : t('properties.found', { count: pagination.total })}
          </p>
          {filters.featured && !loading && (
            <p className="mt-2 text-sm text-primary-700">
              {t('properties.featured_note')}
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
              ? t('properties.hide_request_form')
              : t('properties.show_request_form')}
          </button>
        </div>

        {/* Property List */}
        <PropertyList
          properties={properties}
          loading={loading}
          onSave={handleSaveProperty}
          savedPropertyIds={savedPropertyIds}
        />

        <AdSpace placement="properties_inline" className="mt-8" />

        {(showRequestForm || (!loading && properties.length === 0)) && (
          <div id="tenant-request" ref={requestSectionRef} className="card mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              {t('properties.request_title')}
            </h2>
            <p className="text-gray-600 mb-4">
              {t('properties.request_intro')}
            </p>
            <p className={`text-sm mb-4 ${alertPaymentEnabled ? 'text-primary-700' : 'text-green-700'}`}>
              {alertPaymentEnabled
                ? t('properties.request_fee_text', { amount: alertRequestFeeLabel })
                : t('properties.request_free_text')}
              {alertPaymentEnabled && !alertPricing.location_complete && (
                <span className="block mt-1 text-xs text-primary-700">
                  {t('properties.request_select_location_fee')}
                </span>
              )}
            </p>

            <form onSubmit={submitTenantRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                name="full_name"
                className="input"
                placeholder={t('properties.request_full_name')}
                value={requestForm.full_name}
                onChange={handleRequestChange}
              />
              <input
                name="email"
                type="email"
                className="input"
                placeholder={t('properties.request_email')}
                value={requestForm.email}
                onChange={handleRequestChange}
              />
              <input
                name="phone"
                className="input"
                placeholder={t('properties.request_phone')}
                value={requestForm.phone}
                onChange={handleRequestChange}
              />
              <select
                name="property_type"
                className="input"
                value={requestForm.property_type}
                onChange={handleRequestChange}
              >
                <option value="">{t('properties.request_property_type')}</option>
                <option value="apartment">{t('property_types.apartment')}</option>
                <option value="house">{t('property_types.house')}</option>
                <option value="duplex">{t('property_types.duplex')}</option>
                <option value="studio">{t('property_types.studio')}</option>
                <option value="bungalow">{t('property_types.bungalow')}</option>
                <option value="flat">{t('property_types.flat')}</option>
                <option value="room">{t('property_types.room')}</option>
              </select>
              <select
                name="state_id"
                className="input"
                value={requestForm.state_id}
                onChange={handleRequestChange}
              >
                <option value="">{t('properties.request_state')}</option>
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
                <option value="">{t('properties.request_lga')}</option>
                {availableRequestLgas.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga}
                  </option>
                ))}
              </select>
              <input
                name="location"
                className="input"
                placeholder={t('properties.request_location')}
                value={requestForm.location}
                onChange={handleRequestChange}
              />
              <input
                name="min_price"
                type="number"
                className="input"
                placeholder={t('properties.request_min_budget')}
                value={requestForm.min_price}
                onChange={handleRequestChange}
              />
              <input
                name="max_price"
                type="number"
                className="input"
                placeholder={t('properties.request_max_budget')}
                value={requestForm.max_price}
                onChange={handleRequestChange}
              />
              <input
                name="bedrooms"
                type="number"
                className="input"
                placeholder={t('properties.request_min_bedrooms')}
                value={requestForm.bedrooms}
                onChange={handleRequestChange}
              />
              <input
                name="bathrooms"
                type="number"
                className="input"
                placeholder={t('properties.request_min_bathrooms')}
                value={requestForm.bathrooms}
                onChange={handleRequestChange}
              />

              <button
                disabled={requestLoading || (alertPaymentEnabled && !alertPricing.location_complete)}
                className="btn btn-primary md:col-span-2"
              >
                {requestLoading
                  ? (alertRequestReference
                    ? t('properties.confirming_request_payment')
                    : (alertPaymentEnabled ? t('properties.redirecting_payment') : t('properties.submitting_request')))
                  : (alertPaymentEnabled
                    ? t('properties.pay_to_notify', { amount: alertRequestFeeLabel })
                    : t('properties.notify_me'))}
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
              containerClassName="flex max-w-full flex-wrap justify-center gap-2"
              pageClassName="px-3 py-2 sm:px-4 border rounded hover:bg-gray-100"
              activeClassName="bg-primary-600 text-white hover:bg-primary-700"
              previousClassName="px-3 py-2 sm:px-4 border rounded hover:bg-gray-100"
              nextClassName="px-3 py-2 sm:px-4 border rounded hover:bg-gray-100"
              disabledClassName="opacity-50 cursor-not-allowed"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Properties;
