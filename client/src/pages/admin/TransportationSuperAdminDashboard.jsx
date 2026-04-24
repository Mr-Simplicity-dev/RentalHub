import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const tabs = [
  { label: 'Overview', value: 'overview' },
  { label: 'State admins', value: 'state-admins' },
  { label: 'Alerts', value: 'alerts' },
  { label: 'System health', value: 'health' },
  { label: 'Metrics', value: 'metrics' },
];

const defaultAssignmentForm = {
  state_admin_id: '',
  state: '',
  city: '',
  can_monitor_bookings: true,
  can_manage_services: false,
  can_view_analytics: true,
  can_override_status: false,
};

const STATE_ADMIN_USER_TYPES = ['state_admin', 'state_financial_admin', 'state_support_admin'];

export default function TransportationSuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [stateAdmins, setStateAdmins] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [candidateAdmins, setCandidateAdmins] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState(defaultAssignmentForm);

  const loadDashboard = useCallback(async () => {
    const response = await api.get('/transportation-admin/super-admin/dashboard');
    setDashboard(response.data?.data || null);
  }, []);

  const loadStateAdmins = useCallback(async () => {
    const response = await api.get('/transportation-admin/super-admin/state-admins', {
      params: { limit: 50 },
    });
    setStateAdmins(response.data?.data?.state_admins || []);
  }, []);

  const loadAlerts = useCallback(async () => {
    const response = await api.get('/transportation-admin/super-admin/alerts', {
      params: { limit: 12, is_resolved: false },
    });
    setAlerts(response.data?.data?.alerts || []);
  }, []);

  const loadSystemHealth = useCallback(async () => {
    const response = await api.get('/transportation-admin/super-admin/system-health', {
      params: { days: 30 },
    });
    setSystemHealth(response.data?.data || null);
  }, []);

  const loadMetrics = useCallback(async () => {
    const response = await api.get('/transportation-admin/super-admin/performance-metrics', {
      params: { limit: 20 },
    });
    setMetrics(response.data?.data?.metrics || []);
  }, []);

  const loadCandidates = useCallback(async () => {
    const response = await api.get('/admin/users');
    const users = response.data?.data?.users || response.data?.data || [];
    const candidates = Array.isArray(users)
      ? users.filter((user) => STATE_ADMIN_USER_TYPES.includes(user.user_type))
      : [];
    setCandidateAdmins(candidates);
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
        loadStateAdmins(),
        loadAlerts(),
        loadSystemHealth(),
        loadMetrics(),
        loadCandidates(),
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transportation super admin dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAlerts, loadCandidates, loadDashboard, loadMetrics, loadStateAdmins, loadSystemHealth]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const assignJurisdiction = async (event) => {
    event.preventDefault();

    if (!assignmentForm.state_admin_id || !assignmentForm.state) {
      toast.error('Choose a state admin and a state');
      return;
    }

    try {
      setActionKey('assign-jurisdiction');
      await api.post('/transportation-admin/super-admin/state-admins/assign', {
        ...assignmentForm,
        state_admin_id: Number(assignmentForm.state_admin_id),
        city: assignmentForm.city || null,
      });
      toast.success('Transportation jurisdiction saved');
      setAssignmentForm(defaultAssignmentForm);
      await Promise.all([loadStateAdmins(), loadDashboard()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save jurisdiction');
    } finally {
      setActionKey('');
    }
  };

  const removeJurisdiction = async (jurisdictionId) => {
    try {
      setActionKey(`remove-${jurisdictionId}`);
      await api.delete(`/transportation-admin/super-admin/state-admins/${jurisdictionId}`);
      toast.success('Jurisdiction removed');
      await Promise.all([loadStateAdmins(), loadDashboard()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove jurisdiction');
    } finally {
      setActionKey('');
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      setActionKey(`alert-${alertId}`);
      await api.patch(`/transportation-admin/alerts/${alertId}/resolve`, {
        resolution_notes: 'Resolved from super admin transportation command',
      });
      toast.success('Alert resolved');
      await Promise.all([loadAlerts(), loadDashboard()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve alert');
    } finally {
      setActionKey('');
    }
  };

  const candidateOptions = useMemo(
    () =>
      candidateAdmins.map((admin) => ({
        value: admin.id,
        label: `${admin.full_name || admin.email} (${admin.user_type})`,
      })),
    [candidateAdmins]
  );

  if (loading) {
    return <LoadingState label="Loading transportation super admin dashboard..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadPage()} />;
  }

  const stats = dashboard?.national_statistics || {};

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Transportation Super Admin"
        title="National Logistics Command"
        description="Oversee tenant move logistics across Nigeria, assign state transportation jurisdictions, and track system health, unresolved alerts, and performance metrics from one command layer."
        actions={
          <div className="flex flex-wrap gap-3">
            <span className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">
              Oversight: {dashboard?.oversight_config?.oversight_level || 'national'}
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

      <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="National bookings" value={stats.total_bookings || 0} tone="cyan" />
            <MetricCard label="National revenue" value={formatCurrency(stats.total_revenue)} tone="emerald" />
            <MetricCard label="Unique tenants" value={stats.unique_tenants || 0} tone="slate" />
            <MetricCard label="Open alerts" value={alerts.length} tone="amber" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
            <SectionCard
              title="State breakdown"
              description="How transportation demand is spreading across states under national oversight."
            >
              {dashboard?.regional_breakdown?.length || dashboard?.state_breakdown?.length ? (
                <div className="space-y-3">
                  {(dashboard.regional_breakdown?.length ? dashboard.regional_breakdown : dashboard.state_breakdown).map((row, index) => (
                    <div key={`${row.state || row.city}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{row.state || row.city || 'Unknown scope'}</p>
                        <p className="text-sm text-slate-500">{row.booking_count || 0} bookings</p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(row.state_revenue || row.city_revenue || 0)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No state breakdown yet" description="This will populate when bookings start accumulating across states." />
              )}
            </SectionCard>

            <SectionCard
              title="Recent critical alerts"
              description="Most recent warning and critical events that still need national review."
            >
              {dashboard?.recent_alerts?.length ? (
                <div className="space-y-3">
                  {dashboard.recent_alerts.slice(0, 6).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{alert.alert_title}</p>
                          <p className="mt-1 text-sm text-slate-500">{alert.alert_description || 'No description'}</p>
                        </div>
                        <StatusPill value={alert.alert_level} />
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        {[alert.state, alert.city].filter(Boolean).join(' / ') || 'National scope'} · {formatDateTime(alert.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No critical alerts" description="There are no unresolved national warning or critical alerts right now." />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'state-admins' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <SectionCard
            title="Assign transportation jurisdiction"
            description="Give a state admin visibility or management rights over transportation operations in a state or city."
          >
            <form className="space-y-4" onSubmit={assignJurisdiction}>
              <label className="block text-sm font-medium text-slate-700">
                State admin
                <select
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={assignmentForm.state_admin_id}
                  onChange={(event) => setAssignmentForm((current) => ({
                    ...current,
                    state_admin_id: event.target.value,
                  }))}
                >
                  <option value="">Select state admin</option>
                  {candidateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="State"
                  value={assignmentForm.state}
                  onChange={(event) => setAssignmentForm((current) => ({
                    ...current,
                    state: event.target.value,
                  }))}
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="City (optional)"
                  value={assignmentForm.city}
                  onChange={(event) => setAssignmentForm((current) => ({
                    ...current,
                    city: event.target.value,
                  }))}
                />
              </div>

              <div className="grid gap-3 text-sm text-slate-700">
                {[
                  ['can_monitor_bookings', 'Can monitor bookings'],
                  ['can_manage_services', 'Can manage services'],
                  ['can_view_analytics', 'Can view analytics'],
                  ['can_override_status', 'Can override status'],
                ].map(([field, label]) => (
                  <label key={field} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={assignmentForm[field]}
                      onChange={(event) => setAssignmentForm((current) => ({
                        ...current,
                        [field]: event.target.checked,
                      }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={actionKey === 'assign-jurisdiction'}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionKey === 'assign-jurisdiction' ? 'Saving...' : 'Save jurisdiction'}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title="Current state transportation jurisdictions"
            description="State-scoped transportation monitoring assignments currently active across Nigeria."
          >
            {stateAdmins.length ? (
              <div className="space-y-3">
                {stateAdmins.map((admin) => (
                  <div key={admin.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {admin.admin_name || admin.admin_email || 'Unknown state admin'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {admin.state}{admin.city ? ` · ${admin.city}` : ' · All cities'} · {admin.admin_role}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Assigned {formatDateTime(admin.assigned_at)} by {admin.assigned_by_name || 'system'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill value={admin.can_monitor_bookings ? 'active' : 'inactive'} />
                          <StatusPill value={admin.can_manage_services ? 'info' : 'default'} />
                          <StatusPill value={admin.can_view_analytics ? 'completed' : 'default'} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeJurisdiction(admin.id)}
                        disabled={actionKey === `remove-${admin.id}`}
                        className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionKey === `remove-${admin.id}` ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No state jurisdictions assigned" description="Use the form to create the first transportation jurisdiction assignment." />
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === 'alerts' ? (
        <SectionCard
          title="National alert queue"
          description="Warning and critical transportation events from all monitored states."
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
                    {[alert.state, alert.city].filter(Boolean).join(' / ') || 'National scope'} · {formatDateTime(alert.created_at)}
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
            <EmptyState title="No open alerts" description="All monitored transportation alerts are currently resolved." />
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'health' ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Active bookings" value={systemHealth?.current_stats?.total_active_bookings || 0} tone="cyan" />
            <MetricCard label="Today revenue" value={formatCurrency(systemHealth?.current_stats?.today_revenue)} tone="emerald" />
            <MetricCard label="Active tenants" value={systemHealth?.current_stats?.active_tenants || 0} tone="slate" />
            <MetricCard label="Active services" value={systemHealth?.current_stats?.active_services || 0} tone="amber" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Daily health view"
              description="Recent transportation system health snapshots generated from booking activity."
            >
              {systemHealth?.health_data?.length ? (
                <div className="space-y-3">
                  {systemHealth.health_data.slice(0, 10).map((item) => (
                    <div key={item.health_date} className="rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">{formatDateTime(item.health_date)}</p>
                          <p className="text-sm text-slate-500">
                            {item.total_bookings || 0} bookings · {item.completed_bookings || 0} completed
                          </p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatCurrency(item.daily_revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No health snapshots yet" description="Daily system health will appear here after metrics are generated." />
              )}
            </SectionCard>

            <SectionCard
              title="Alert summary"
              description="Severity distribution for recent transportation alerts."
            >
              {systemHealth?.alert_summary?.length ? (
                <div className="space-y-3">
                  {systemHealth.alert_summary.map((item) => (
                    <div key={item.alert_level} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StatusPill value={item.alert_level} />
                        <p className="text-sm text-slate-600">Unresolved: {item.unresolved || 0}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{item.count || 0}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No alert summary yet" description="Alert severity totals will appear here once the system records them." />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'metrics' ? (
        <SectionCard
          title="Performance metrics"
          description="Stored transportation performance metrics that can later feed automated reporting and scheduled monitoring."
        >
          {metrics.length ? (
            <div className="space-y-3">
              {metrics.map((metric) => (
                <div key={`${metric.metric_date}-${metric.metric_type}`} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{metric.metric_type}</p>
                      <p className="text-sm text-slate-500">{formatDateTime(metric.metric_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{metric.metric_value}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(metric.calculated_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No metrics stored yet" description="The automation layer can start populating this after daily calculations are enabled." />
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
