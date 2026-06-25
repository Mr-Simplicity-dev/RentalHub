import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useLocation, useNavigate } from 'react-router-dom';
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
import DepartmentSupportEscalations from '../../components/admin/DepartmentSupportEscalations';

const tabs = [
  { label: 'Overview', value: 'overview' },
  { label: 'Bookings', value: 'bookings' },
  { label: 'Services', value: 'services' },
  { label: 'Alerts', value: 'alerts' },
  { label: 'Escalations', value: 'support-escalations' },
  { label: 'Jurisdiction', value: 'jurisdiction' },
  { label: 'Analytics', value: 'analytics' },
];

export default function TransportationAdminStateDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    return new URLSearchParams(location.search).get('tab') || 'overview';
  });
  const highlightedBookingId = new URLSearchParams(location.search).get('bookingId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [jurisdiction, setJurisdiction] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const loadDashboard = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/dashboard');
    setDashboard(response.data?.data || null);
  }, []);

  const loadBookings = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/bookings', {
      params: { limit: 12 },
    });
    setBookings(response.data?.data?.bookings || []);
  }, []);

  const loadServices = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/services', {
      params: { limit: 12 },
    });
    setServices(response.data?.data?.services || []);
  }, []);

  const loadAlerts = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/alerts', {
      params: { limit: 12, is_resolved: false },
    });
    setAlerts(response.data?.data?.alerts || []);
  }, []);

  const loadJurisdiction = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/jurisdiction');
    setJurisdiction(response.data?.data?.jurisdiction || []);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const response = await api.get('/transportation-admin/state-admin/analytics');
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
        loadJurisdiction(),
        loadAnalytics(),
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load state transportation dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAlerts, loadAnalytics, loadBookings, loadDashboard, loadJurisdiction, loadServices]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Sync internal activeTab with URL search params for sidebar highlighting
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeTab changes, update URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentTab = params.get('tab') || 'overview';
    if (activeTab !== currentTab) {
      params.set('tab', activeTab);
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveAlert = async (alertId) => {
    try {
      setActionKey(`alert-${alertId}`);
      await api.patch(`/transportation-admin/state-admin/alerts/${alertId}/resolve`, {
        resolution_notes: 'Resolved from state transportation monitoring console',
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
    return <LoadingState label="Loading state transportation dashboard..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadPage()} />;
  }

  const stats = dashboard?.statistics || {};
  const scopeLabel = dashboard?.jurisdiction
    ? [dashboard.jurisdiction.state, dashboard.jurisdiction.city].filter(Boolean).join(' / ')
    : 'Assigned state scope';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-100/40 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-6">
      <PageHeader
        eyebrow="State Transportation Monitoring"
        title="State Logistics Oversight"
        description="Monitor transportation bookings tied to properties in your jurisdiction, keep a close eye on unresolved alerts, and review which providers are supporting tenant move-ins in your state."
        actions={
          <div className="flex flex-wrap gap-3">
            <span className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">
              Scope: {scopeLabel}
            </span>
            <button
              type="button"
              onClick={() => loadPage(true)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
            >
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
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
            <MetricCard label="Bookings (30 days)" value={stats.total_bookings || 0} tone="cyan" />
            <MetricCard label="Revenue" value={formatCurrency(stats.total_revenue)} tone="emerald" />
            <MetricCard label="Unique Tenants" value={stats.unique_tenants || 0} tone="slate" />
            <MetricCard label="Unresolved Alerts" value={alerts.length} tone="amber" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <SectionCard
              title="Recent bookings in your state"
              description="Latest logistics activity inside your assigned monitoring jurisdiction."
            >
              {dashboard?.recent_bookings?.length ? (
                <div className="space-y-3">
                  {dashboard.recent_bookings.map((booking) => (
                    <div key={booking.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {booking.tenant_name || 'Unknown tenant'} · {booking.property_title || 'Unknown property'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {booking.property_city || 'Unknown city'} · {booking.service_name || 'Unknown service'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {formatCurrency(booking.total_price)} · {formatDateTime(booking.created_at)}
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
                <EmptyState title="No recent bookings" description="Transportation activity in your state will appear here." />
              )}
            </SectionCard>

            <SectionCard
              title="State service activity"
              description="Providers that are currently generating transportation movement within your jurisdiction."
            >
              {dashboard?.service_analytics?.length ? (
                <div className="space-y-3">
                  {dashboard.service_analytics.slice(0, 6).map((service) => (
                    <div key={`${service.service_name}-${service.service_type}`} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{service.service_name}</p>
                          <p className="text-sm text-slate-500">{service.service_type}</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{service.booking_count || 0} bookings</p>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">
                        Revenue: {formatCurrency(service.total_revenue)} · Avg price: {formatCurrency(service.avg_price)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No state service activity yet" description="Provider analytics will appear after local bookings are recorded." />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'bookings' ? (
        <SectionCard
          title="State booking queue"
          description="All transportation bookings linked to properties inside your assigned jurisdiction."
        >
          {bookings.length ? (
            <div className="space-y-3">
              {[...bookings].sort((a, b) => (String(b.id) === highlightedBookingId) - (String(a.id) === highlightedBookingId)).map((booking) => (
                <div key={booking.id} className={`rounded-2xl border p-4 ${String(booking.id) === highlightedBookingId ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        #{booking.id} · {booking.tenant_name || 'Unknown tenant'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {booking.property_title || 'Unknown property'} · {booking.property_city || 'Unknown city'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {booking.service_name || 'Unknown service'} · {formatCurrency(booking.total_price)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">{formatDateTime(booking.created_at)}</p>
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
            <EmptyState title="No state bookings found" description="Bookings from your state scope will appear here." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'services' ? (
        <SectionCard
          title="Services visible in your jurisdiction"
          description="Transportation services with booking activity mapped to your state scope."
        >
          {services.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {services.map((service) => (
                <div key={service.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{service.service_name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {service.provider_name || 'No provider'} · {service.service_type}
                      </p>
                    </div>
                    <StatusPill value={service.is_active ? 'active' : 'inactive'} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Base price</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(service.base_price)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">State bookings</p>
                      <p className="mt-1 font-semibold text-slate-900">{service.total_bookings || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No services found" description="Once providers serve your jurisdiction, they will appear here." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'alerts' ? (
        <SectionCard
          title="Jurisdiction alerts"
          description="Resolve operational or payment issues affecting transportation requests in your state."
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
                    {alert.city || dashboard?.jurisdiction?.city || dashboard?.jurisdiction?.state || 'State scope'} · {formatDateTime(alert.created_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => resolveAlert(alert.id)}
                    disabled={actionKey === `alert-${alert.id}`}
                    className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionKey === `alert-${alert.id}` ? 'Resolving...' : 'Resolve alert'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No open alerts in your state" description="Current issues have been cleared for your jurisdiction." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'support-escalations' ? (
        <DepartmentSupportEscalations department="transportation" title="Transportation Support Escalations" />
      ) : null}

      {activeTab === 'jurisdiction' ? (
        <SectionCard
          title="Assigned transportation jurisdiction"
          description="This is the monitoring scope configured for your account."
        >
          {jurisdiction.length ? (
            <div className="space-y-3">
              {jurisdiction.map((item) => (
                <div key={`${item.state}-${item.city || 'all'}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.state}{item.city ? ` · ${item.city}` : ' · All cities'}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Assigned {formatDateTime(item.assigned_at)} by {item.assigned_by_name || 'system'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill value={item.can_monitor_bookings ? 'active' : 'inactive'} />
                      <StatusPill value={item.can_manage_services ? 'info' : 'default'} />
                      <StatusPill value={item.can_view_analytics ? 'completed' : 'default'} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No jurisdiction found" description="A super admin needs to assign your transportation monitoring scope." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Revenue trend"
            description="Completed transportation revenue inside your state scope."
          >
            {analytics?.revenue_trends?.length ? (
              <div className="space-y-3">
                {analytics.revenue_trends.map((item) => (
                  <div key={item.date} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{formatDateTime(item.date)}</p>
                      <p className="text-sm text-slate-500">{item.booking_count || 0} bookings</p>
                    </div>
                    <p className="font-semibold text-slate-900">{formatCurrency(item.daily_revenue)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No revenue data yet" description="Completed payments will populate this trend." />
            )}
          </SectionCard>

          <SectionCard
            title="Top properties"
            description="Properties with the highest transportation volume in your state."
          >
            {analytics?.top_properties?.length ? (
              <div className="space-y-3">
                {analytics.top_properties.map((property) => (
                  <div key={property.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{property.title}</p>
                      <p className="text-sm text-slate-500">
                        {property.city || 'Unknown city'} · {property.area || 'Unknown area'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{property.booking_count || 0} bookings</p>
                      <p className="text-sm text-slate-500">{formatCurrency(property.total_revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No property analytics yet" description="Property movement data will appear here." />
            )}
          </SectionCard>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
