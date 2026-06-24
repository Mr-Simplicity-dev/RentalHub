import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaVideo, FaToggleOn, FaToggleOff, FaSyncAlt } from 'react-icons/fa';
import api from '../../services/api';
import {
  PageHeader,
  MetricCard,
  SectionTabs,
  LoadingState,
  ErrorState,
  EmptyState,
  formatCurrency,
} from '../../components/admin/RecruitmentAdminUi';
import {
  RecruitmentOverviewTab,
  RecruitmentCyclesTab,
  RecruitmentRolesTab,
  RecruitmentLocationsTab,
  RecruitmentApplicantsTab,
  RecruitmentInterviewTab,
} from '../../components/admin/RecruitmentTabs';

const TABS = [
  { label: 'Overview', value: 'overview' },
  { label: 'Cycles', value: 'cycles' },
  { label: 'Roles & Fees', value: 'roles' },
  { label: 'Locations', value: 'locations' },
  { label: 'Applicants', value: 'applicants' },
  { label: 'Interviews', value: 'interviews' },
];

export default function RecruitmentAdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    return new URLSearchParams(location.search).get('tab') || 'overview';
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Core data
  const [status, setStatus] = useState({ is_active: false });
  const [analytics, setAnalytics] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [states, setStates] = useState([]);

  const activeLocations = React.useMemo(
    () => locations.filter((loc) => loc.is_active),
    [locations]
  );

  // ─── Sync URL tab ─────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentTab = params.get('tab') || 'overview';
    if (activeTab !== currentTab) {
      params.set('tab', activeTab);
      navigate({ search: params.toString() }, { replace: true });
    }
  }, [activeTab, navigate]);

  // ─── Load core data ───────────────────────────────────
  const loadCore = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError('');

      const [statusRes, cyclesRes, rolesRes, statesRes, locationsRes, analyticsRes] =
        await Promise.all([
          api.get('/recruitment/status'),
          api.get('/recruitment/admin/cycles'),
          api.get('/recruitment/admin/roles'),
          api.get('/recruitment/locations/states'),
          api.get('/recruitment/admin/locations'),
          api.get('/recruitment/admin/analytics'),
        ]);

      setStatus(statusRes.data?.data || { is_active: false });
      setCycles(cyclesRes.data?.data || []);
      setRoles(rolesRes.data?.data || []);
      setStates(statesRes.data?.data || []);
      setLocations(locationsRes.data?.data || []);
      setAnalytics(analyticsRes.data?.data || null);
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to load recruitment dashboard';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  // ─── Toggle recruitment open/close ────────────────────
  const toggleRecruitment = useCallback(async () => {
    try {
      const next = !status.is_active;
      await api.put('/recruitment/admin/settings/toggle', { is_active: next });
      setStatus({ is_active: next });
      toast.success(next ? 'Recruitment opened for applications' : 'Recruitment closed');
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to update recruitment status'
      );
    }
  }, [status.is_active]);

  // ─── Loading state ────────────────────────────────────
  if (loading) {
    return <LoadingState label="Loading recruitment admin console..." />;
  }

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => loadCore()} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-100/40 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-6">
          {/* ── Page Header ────────────────────────────── */}
          <PageHeader
            eyebrow="Recruitment Control"
            title="Career Module Admin Console"
            description="Manage recruitment cycles, role-based fees, location activation, applicant processing, document exports, and interview scheduling."
            actions={
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={toggleRecruitment}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition-all ${
                    status.is_active
                      ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                      : 'bg-slate-100 text-slate-900 hover:bg-white'
                  }`}
                >
                  {status.is_active ? <FaToggleOn /> : <FaToggleOff />}
                  {status.is_active ? 'Recruitment Open' : 'Recruitment Closed'}
                </button>
                <button
                  type="button"
                  onClick={() => loadCore(true)}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white shadow-sm ring-1 ring-white/20 hover:bg-white/20 transition-all disabled:opacity-50"
                >
                  <FaSyncAlt className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            }
          />

          {/* ── Metric Cards ───────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Applicants"
              value={analytics?.total_applicants || 0}
              tone="indigo"
            />
            <MetricCard
              label="Fees Collected"
              value={formatCurrency(analytics?.total_fees_collected || 0)}
              tone="emerald"
            />
            <MetricCard
              label="Interviews Completed"
              value={analytics?.interview?.completed || 0}
              tone="blue"
            />
            <MetricCard
              label="Active Locations"
              value={activeLocations.length}
              subtext={`${locations.length - activeLocations.length} inactive`}
              tone="amber"
            />
          </div>

          {/* ── Tab Navigation ─────────────────────────── */}
          <SectionTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          {/* ── Tab Content ────────────────────────────── */}
          {activeTab === 'overview' && (
            <RecruitmentOverviewTab
              analytics={analytics}
              cycles={cycles}
              roles={roles}
              locations={locations}
              activeLocations={activeLocations}
              status={status}
              onRefresh={loadCore}
            />
          )}

          {activeTab === 'cycles' && (
            <RecruitmentCyclesTab cycles={cycles} onRefresh={loadCore} />
          )}

          {activeTab === 'roles' && (
            <RecruitmentRolesTab roles={roles} cycles={cycles} onRefresh={loadCore} />
          )}

          {activeTab === 'locations' && (
            <RecruitmentLocationsTab
              locations={locations}
              states={states}
              onRefresh={loadCore}
            />
          )}

          {activeTab === 'applicants' && (
            <RecruitmentApplicantsTab
              roles={roles}
              onRefreshCore={loadCore}
            />
          )}

          {activeTab === 'interviews' && (
            <RecruitmentInterviewTab
              cycles={cycles}
              roles={roles}
              onRefreshCore={loadCore}
            />
          )}
        </div>
      </div>
    </div>
  );
}
