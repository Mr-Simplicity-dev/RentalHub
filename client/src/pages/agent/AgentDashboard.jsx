import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaClipboardList, FaHome, FaShieldAlt, FaUserTie, FaCoins, FaExchangeAlt, FaBuilding, FaGavel, FaMoneyBillWave, FaCommentDots } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import Loader from '../../components/common/Loader';

const PermissionBadge = ({ enabled, label }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
      enabled
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
    {label}
  </span>
);

const StatCard = ({ icon, label, value }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md">
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">{icon}</div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  </div>
);

const QuickActionLink = ({ to, icon, label, description }) => (
  <Link
    to={to}
    className="group flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-md"
  >
    <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600 transition group-hover:bg-indigo-100">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="font-medium text-gray-900">{label}</p>
      <p className="mt-0.5 text-xs text-gray-500">{description}</p>
    </div>
  </Link>
);

const AgentDashboard = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationRequests, setMigrationRequests] = useState([]);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationForm, setMigrationForm] = useState({ to_state: '', reason: '' });

  const STATES = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
    'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
    'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
    'Taraba','Yobe','Zamfara'
  ];

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const [res, migrationRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/state-migrations/my').catch(() => ({ data: { data: [] } })),
        ]);
        if (res.data?.success) {
          setProfile(res.data.data);
          setMigrationRequests(migrationRes.data?.data || []);
        } else {
          toast.error(t('agent_dashboard.failed_load'));
        }
      } catch (error) {
        console.error('Failed to load agent dashboard:', error);
        toast.error(error.response?.data?.message || t('agent_dashboard.failed_load'));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const submitMigrationRequest = async () => {
    if (!migrationForm.to_state || !migrationForm.reason.trim()) {
      toast.error(t('agent_dashboard.select_state_reason'));
      return;
    }

    try {
      setMigrationLoading(true);
      const res = await api.post('/state-migrations/request', {
        to_state: migrationForm.to_state,
        reason: migrationForm.reason,
      });

      toast.success(res.data?.message || t('agent_dashboard.migration_submitted'));
      setMigrationForm({ to_state: '', reason: '' });
      const myRes = await api.get('/state-migrations/my');
      setMigrationRequests(myRes.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || t('agent_dashboard.migration_failed'));
    } finally {
      setMigrationLoading(false);
    }
  };

  if (loading) return <Loader />;

  const assignment = profile?.agent_assignment;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
            <div className="agent-profile-section relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-6 text-white shadow-lg sm:p-8">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-white/5" />
          <div className="absolute bottom-0 left-1/3 h-24 w-24 translate-y-4 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-widest text-indigo-200">{t('agent_dashboard.agent_workspace')}</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                Welcome, {profile?.full_name || 'Agent'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-indigo-100">
                {t('agent_dashboard.dashboard_description')}
              </p>
            </div>
            <div className="hidden shrink-0 rounded-xl bg-white/10 p-3 backdrop-blur sm:block">
              <FaUserTie className="text-2xl" />
            </div>
          </div>
        </div>

        {!assignment ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <FaBuilding className="text-lg text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t('agent_dashboard.no_assignment_title')}</h2>
                <p className="mt-1 text-sm text-amber-700">
                  {t('agent_dashboard.no_assignment_desc')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={<FaHome />} label={t('agent_dashboard.assigned_state')} value={profile?.assigned_state || t('agent_dashboard.not_configured')} />
              <StatCard icon={<FaClipboardList />} label={t('agent_dashboard.landlord')} value={assignment.landlord_name} />
              <StatCard icon={<FaShieldAlt />} label={t('agent_dashboard.assignment_status')} value={assignment.status || t('agent_dashboard.active')} />
              <StatCard icon={<FaExchangeAlt />} label={t('agent_dashboard.migration_requests')} value={migrationRequests.length} />
            </div>

            <div className="agent-commissions-section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">{t('agent_dashboard.state_migration_title')}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    {t('agent_dashboard.current_state')} <span className="font-semibold text-gray-800">{profile?.assigned_state || t('agent_dashboard.not_configured')}</span>
                    <br />{t('agent_dashboard.state_locked')}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  value={migrationForm.to_state}
                  onChange={(e) => setMigrationForm((prev) => ({ ...prev, to_state: e.target.value }))}
                  className="input"
                >
                  <option value="">{t('agent_dashboard.select_target_state')}</option>
                  {STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
                <input
                  value={migrationForm.reason}
                  onChange={(e) => setMigrationForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="input md:col-span-2"
                  placeholder={t('agent_dashboard.reason_placeholder')}
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button type="button" className="btn btn-primary" onClick={submitMigrationRequest} disabled={migrationLoading}>
                  {migrationLoading ? t('agent_dashboard.submitting') : t('agent_dashboard.apply_migration')}
                </button>
                {migrationRequests.length > 0 && (
                  <span className="text-xs text-gray-400">{t('agent_dashboard.requests_submitted', { count: migrationRequests.length })}</span>
                )}
              </div>

              {migrationRequests.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('agent_dashboard.recent_requests')}</p>
                  <div className="space-y-2">
                    {migrationRequests.slice(0, 5).map((request) => (
                      <div key={request.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FaExchangeAlt className="text-sm text-indigo-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {request.from_state} <span className="text-gray-400">→</span> {request.to_state}
                            </p>
                            <p className="text-xs text-gray-500">{request.reason}</p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                            request.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : request.status === 'rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {request.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="agent-bookings-section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                      <FaBuilding className="text-lg" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{t('agent_dashboard.assigned_landlord')}</h2>
                      <p className="text-sm text-gray-500">{t('agent_dashboard.supporting_landlord')}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('agent_dashboard.landlord')}</p>
                      <p className="mt-1 font-semibold text-gray-900">{assignment.landlord_name}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('agent_dashboard.email')}</p>
                      <p className="mt-1 font-medium text-gray-800">{assignment.landlord_email || t('agent_dashboard.na')}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('agent_dashboard.phone')}</p>
                      <p className="mt-1 font-medium text-gray-800">{assignment.landlord_phone || 'N/A'}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('agent_dashboard.status')}</p>
                      <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        assignment.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {assignment.status || 'active'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="agent-earnings-section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                      <FaClipboardList className="text-lg" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{t('agent_dashboard.quick_actions')}</h2>
                      <p className="text-sm text-gray-500">{t('agent_dashboard.use_tools')}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <Link to="/my-properties" className="btn btn-primary flex w-full items-center justify-center gap-2">
                      <FaHome /> {t('agent_dashboard.manage_properties')}
                    </Link>
                    <Link to="/add-property" className="btn flex w-full items-center justify-center gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                      <FaBuilding /> {t('agent_dashboard.add_property')}
                    </Link>
                    <Link to="/agent/earnings" className="btn flex w-full items-center justify-center gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                      <FaCoins /> {t('agent_dashboard.view_earnings')}
                    </Link>
                    <Link to="/agent/withdrawals" className="btn flex w-full items-center justify-center gap-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                      <FaMoneyBillWave /> {t('agent_dashboard.request_withdrawal')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                  <FaShieldAlt className="text-lg" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{t('agent_dashboard.delegated_responsibilities')}</h2>
                  <p className="text-sm text-gray-500">{t('agent_dashboard.permissions_note')}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <PermissionBadge enabled={assignment.can_manage_properties} label={t('agent_dashboard.perm_manage_properties')} />
                <PermissionBadge enabled={assignment.can_manage_damage_reports} label={t('agent_dashboard.perm_maintenance')} />
                <PermissionBadge enabled={assignment.can_manage_disputes} label={t('agent_dashboard.perm_disputes')} />
                <PermissionBadge enabled={assignment.can_manage_legal} label={t('agent_dashboard.perm_legal')} />
                <PermissionBadge enabled={assignment.can_manage_finances} label={t('agent_dashboard.perm_finances')} />
              </div>

              <p className="mt-4 text-sm leading-relaxed text-gray-500">
                {t('agent_dashboard.permissions_footer')}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{t('agent_dashboard.task_areas')}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t('agent_dashboard.task_areas_desc')}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <QuickActionLink to="/my-properties" icon={<FaHome />} label={t('agent_dashboard.managed_properties')} description={t('agent_dashboard.managed_properties_desc')} />
                <QuickActionLink to="/add-property" icon={<FaBuilding />} label={t('agent_dashboard.maintenance_assessments')} description={t('agent_dashboard.maintenance_assessments_desc')} />
                <QuickActionLink to="/messages" icon={<FaCommentDots />} label={t('agent_dashboard.dispute_evidence')} description={t('agent_dashboard.dispute_evidence_desc')} />
                <QuickActionLink to="/messages" icon={<FaGavel />} label={t('agent_dashboard.legal_messages')} description={t('agent_dashboard.legal_messages_desc')} />
                <QuickActionLink to="/agent/earnings" icon={<FaCoins />} label={t('agent_dashboard.commission_ledger')} description={t('agent_dashboard.commission_ledger_desc')} />
                <QuickActionLink to="/agent/withdrawals" icon={<FaMoneyBillWave />} label={t('agent_dashboard.withdrawals')} description={t('agent_dashboard.withdrawals_desc')} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentDashboard;
