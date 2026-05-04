import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  EmptyState,
  ErrorState,
  formatCurrency,
  formatDateTime,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionCard,
  SectionTabs,
  StatusPill,
} from '../../components/admin/TransportationAdminUi';
import CommissionWithdrawalBanner from '../../components/admin/CommissionWithdrawalBanner';

const tabs = [
  { label: 'Overview', value: 'overview' },
  { label: 'Bookings', value: 'bookings' },
  { label: 'Services', value: 'services' },
  { label: 'Alerts', value: 'alerts' },
  { label: 'Analytics', value: 'analytics' },
];

const defaultServiceForm = {
  service_name: '',
  service_type: 'van',
  provider_name: '',
  provider_phone: '',
  base_price: '',
  price_per_km: '',
  capacity_kg: '',
  description: '',
};

const TransportationAdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [serviceForm, setServiceForm] = useState(defaultServiceForm);

  const loadDashboard = useCallback(async () => {
    const response = await api.get('/transportation-admin/dashboard');
    setDashboard(response.data?.data || null);
  }, []);

  const loadBookings = useCallback(async () => {
    const response = await api.get('/transportation-admin/bookings', {
      params: { limit: 12 },
    });
    setBookings(response.data?.data?.bookings || []);
  }, []);

  const loadServices = useCallback(async () => {
    const response = await api.get('/transportation-admin/services');
    setServices(Array.isArray(response.data?.data) ? response.data.data : []);
  }, []);

  const loadAlerts = useCallback(async () => {
    const response = await api.get('/transportation-admin/alerts', {
      params: { limit: 12, is_resolved: false },
    });
    setAlerts(response.data?.data?.alerts || []);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const response = await api.get('/transportation-admin/analytics', {
      params: { period: '30days' },
    });
    setAnalytics(response.data?.data || null);
  }, []);

  const loadPage = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      await Promise.all([
        loadDashboard(),
        loadBookings(),
        loadServices(),
        loadAlerts(),
        loadAnalytics(),
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transportation admin console');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAlerts, loadAnalytics, loadBookings, loadDashboard, loadServices]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const updateBookingStatus = async (bookingId, booking_status) => {
    const key = `booking-${bookingId}-${booking_status}`;
    try {
      setActionKey(key);
      await api.patch(`/transportation-admin/bookings/${bookingId}/status`, { booking_status });
      toast.success('Booking status updated');
      await Promise.all([loadDashboard(), loadBookings(), loadAnalytics()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update booking status');
    } finally {
      setActionKey('');
    }
  };

  const updatePaymentStatus = async (bookingId, payment_status) => {
    const key = `payment-${bookingId}-${payment_status}`;
    try {
      setActionKey(key);
      await api.patch(`/transportation-admin/bookings/${bookingId}/payment-status`, { payment_status });
      toast.success('Payment status updated');
      await Promise.all([loadDashboard(), loadBookings(), loadAnalytics()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update payment status');
    } finally {
      setActionKey('');
    }
  };

  const toggleServiceStatus = async (service) => {
    const key = `service-${service.id}`;
    try {
      setActionKey(key);
      await api.patch(`/transportation-admin/services/${service.id}`, {
        is_active: !service.is_active,
      });
      toast.success(`Service ${service.is_active ? 'deactivated' : 'activated'}`);
      await Promise.all([loadDashboard(), loadServices(), loadAnalytics()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update service');
    } finally {
      setActionKey('');
    }
  };

  const createService = async (event) => {
    event.preventDefault();

    if (
      !serviceForm.service_name ||
      !serviceForm.provider_name ||
      !serviceForm.base_price ||
      !serviceForm.price_per_km
    ) {
      toast.error('Fill in the required service fields');
      return;
    }

    try {
      setActionKey('create-service');
      await api.post('/transportation-admin/services', serviceForm);
      toast.success('Transportation service created');
      setServiceForm(defaultServiceForm);
      await Promise.all([loadServices(), loadDashboard(), loadAnalytics()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create service');
    } finally {
      setActionKey('');
    }
  };

  const resolveAlert = async (alertId) => {
    const key = `alert-${alertId}`;
    try {
      setActionKey(key);
      await api.patch(`/transportation-admin/alerts/${alertId}/resolve`, {
        resolution_notes: 'Resolved from transportation admin console',
      });
      toast.success('Alert resolved');
      await Promise.all([loadAlerts(), loadDashboard()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve alert');
    } finally {
      setActionKey('');
    }
  };

  if (loading) {
    return <LoadingState label="Loading transportation admin console..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadPage()} />;
  }

  const overview = dashboard?.overview || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-100/40 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-6">
      <PageHeader
        eyebrow="Transportation Admin"
        title="Tenant Move Logistics Console"
        description="Monitor tenant relocation bookings, provider performance, service pricing, and alert resolution without changing the transportation business logic already in place."
        actions={
          <button
            type="button"
            onClick={() => loadPage(true)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-white/20 hover:bg-slate-100"
          >
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        }
      />

      {/* Commission Withdrawal Banner */}
      <div className="mb-6">
        <CommissionWithdrawalBanner />
      </div>

      <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Bookings (30 days)" value={overview.total_bookings || 0} tone="cyan" />
            <MetricCard label="Revenue" value={formatCurrency(overview.total_revenue)} tone="emerald" />
            <MetricCard label="Pending Payments" value={overview.pending_payments || 0} tone="amber" />
            <MetricCard label="Unique Tenants" value={overview.unique_tenants || 0} tone="slate" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
            <SectionCard
              title="Recent bookings"
              description="Latest transportation requests from tenants moving into their rented properties."
            >
              {dashboard?.recent_bookings?.length ? (
                <div className="space-y-3">
                  {dashboard.recent_bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {booking.tenant_name || 'Unknown tenant'} · {booking.property_title || 'Unknown property'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {booking.service_name || 'Service unavailable'} · {formatCurrency(booking.total_price)}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            Created {formatDateTime(booking.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill value={booking.booking_status} />
                          <StatusPill value={booking.payment_status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No transportation bookings yet"
                  description="Bookings will appear here as tenants schedule logistics for their move."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Service mix"
              description="What providers and service types are carrying the current booking load."
            >
              {dashboard?.service_analytics?.length ? (
                <div className="space-y-3">
                  {dashboard.service_analytics.slice(0, 6).map((service) => (
                    <div
                      key={`${service.service_name}-${service.service_type}`}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{service.service_name}</p>
                          <p className="text-sm text-slate-500 capitalize">{service.service_type}</p>
                        </div>
                        <StatusPill value={service.service_type} className="capitalize" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Bookings</p>
                          <p className="mt-1 font-semibold text-slate-900">{service.booking_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Revenue</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatCurrency(service.total_revenue)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No service analytics yet"
                  description="Provider activity will populate here after transportation usage starts."
                />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'bookings' ? (
        <SectionCard
          title="Booking management"
          description="Track relocation requests and update operational or payment status when the logistics team changes state."
        >
          {bookings.length ? (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">
                        #{booking.id} · {booking.tenant_name || 'Unknown tenant'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {booking.property_title || 'Unknown property'} · {booking.service_name || 'Unknown service'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {booking.pickup_address} to {booking.destination_address}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(booking.total_price)} · {formatDateTime(booking.created_at)}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-slate-600">
                        Booking status
                        <select
                          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={booking.booking_status || 'pending'}
                          onChange={(event) => updateBookingStatus(booking.id, event.target.value)}
                          disabled={actionKey.startsWith(`booking-${booking.id}`)}
                        >
                          {['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm font-medium text-slate-600">
                        Payment status
                        <select
                          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={booking.payment_status || 'pending'}
                          onChange={(event) => updatePaymentStatus(booking.id, event.target.value)}
                          disabled={actionKey.startsWith(`payment-${booking.id}`)}
                        >
                          {['pending', 'completed', 'failed', 'refunded'].map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No bookings to manage"
              description="Tenant move bookings will surface here as soon as they are created."
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'services' ? (
        <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
          <SectionCard
            title="Create service"
            description="Add a provider or pricing option for tenant relocation logistics."
          >
            <form className="space-y-4" onSubmit={createService}>
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Service name"
                  value={serviceForm.service_name}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    service_name: event.target.value,
                  }))}
                />
                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={serviceForm.service_type}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    service_type: event.target.value,
                  }))}
                >
                  {['van', 'truck', 'pickup', 'moving_company'].map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Provider name"
                  value={serviceForm.provider_name}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    provider_name: event.target.value,
                  }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Provider phone"
                  value={serviceForm.provider_phone}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    provider_phone: event.target.value,
                  }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Base price"
                  value={serviceForm.base_price}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    base_price: event.target.value,
                  }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Price per km"
                  value={serviceForm.price_per_km}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    price_per_km: event.target.value,
                  }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Capacity (kg)"
                  value={serviceForm.capacity_kg}
                  onChange={(event) => setServiceForm((current) => ({
                    ...current,
                    capacity_kg: event.target.value,
                  }))}
                />
              </div>

              <textarea
                className="min-h-[120px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Describe what this transportation option handles"
                value={serviceForm.description}
                onChange={(event) => setServiceForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))}
              />

              <button
                type="submit"
                disabled={actionKey === 'create-service'}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionKey === 'create-service' ? 'Creating...' : 'Create service'}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title="Service management"
            description="Review pricing, provider activity, and availability."
          >
            {services.length ? (
              <div className="space-y-3">
                {services.map((service) => (
                  <div key={service.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{service.service_name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {service.provider_name || 'No provider'} · {service.service_type}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          Base {formatCurrency(service.base_price)} · {formatCurrency(service.price_per_km)} per km
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Bookings: {service.total_bookings || 0} · Revenue: {formatCurrency(service.total_revenue)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusPill value={service.is_active ? 'active' : 'inactive'} />
                        <button
                          type="button"
                          onClick={() => toggleServiceStatus(service)}
                          disabled={actionKey === `service-${service.id}`}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {service.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No services available"
                description="Add providers here so tenants can choose a logistics option during move-in."
              />
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'alerts' ? (
        <SectionCard
          title="Alert management"
          description="Resolve failed payments, cancellations, and critical logistics issues before they affect the tenant move experience."
        >
          {alerts.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{alert.alert_title}</p>
                      <p className="mt-2 text-sm text-slate-500">{alert.alert_description || 'No description'}</p>
                    </div>
                    <StatusPill value={alert.alert_level} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {alert.state || 'Unknown state'} · {alert.city || 'Unknown city'} · {formatDateTime(alert.created_at)}
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => resolveAlert(alert.id)}
                      disabled={actionKey === `alert-${alert.id}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionKey === `alert-${alert.id}` ? 'Resolving...' : 'Resolve alert'}
                    </button>
                    <StatusPill value={alert.is_resolved ? 'completed' : 'warning'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No open alerts"
              description="Current warning and critical events have been cleared."
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Revenue trend"
            description="Completed transportation revenue over the selected analysis window."
          >
            {analytics?.revenue_trends?.length ? (
              <div className="space-y-3">
                {analytics.revenue_trends.slice(0, 10).map((item) => (
                  <div
                    key={item.date}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{formatDateTime(item.date)}</p>
                      <p className="text-sm text-slate-500">{item.booking_count || 0} bookings</p>
                    </div>
                    <p className="font-semibold text-slate-900">{formatCurrency(item.daily_revenue)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No revenue trend data" description="Completed transportation payments will appear here." />
            )}
          </SectionCard>

          <SectionCard
            title="Top tenants and properties"
            description="Who is using the logistics product and which properties generate the highest move volume."
          >
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-700">Top tenants</p>
                {analytics?.tenant_analytics?.length ? (
                  <div className="mt-3 space-y-2">
                    {analytics.tenant_analytics.slice(0, 5).map((tenant) => (
                      <div
                        key={tenant.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{tenant.full_name}</p>
                          <p className="text-sm text-slate-500">{tenant.booking_count || 0} bookings</p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatCurrency(tenant.total_spent)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No tenant analytics yet.</p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700">Top properties</p>
                {analytics?.property_analytics?.length ? (
                  <div className="mt-3 space-y-2">
                    {analytics.property_analytics.slice(0, 5).map((property) => (
                      <div
                        key={property.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{property.title}</p>
                          <p className="text-sm text-slate-500">
                            {property.state} · {property.city}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-900">{property.booking_count || 0} bookings</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No property analytics yet.</p>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
};

export default TransportationAdminDashboard;
