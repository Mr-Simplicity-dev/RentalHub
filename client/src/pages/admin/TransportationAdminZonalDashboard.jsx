import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  PageHeader,
  MetricCard,
  SectionCard,
  SectionTabs,
  StatusPill,
  formatCurrency,
  formatDateTime
} from '../../components/admin/TransportationAdminUi';
import TransportationFleetTracker from '../../components/admin/TransportationFleetTracker';
import CommissionWithdrawalBanner from '../../components/admin/CommissionWithdrawalBanner';
import {
  FaGlobeAfrica,
  FaMapMarkedAlt,
  FaTruck,
  FaSyncAlt,
  FaExclamationTriangle,
  FaCheckCircle,
  FaMoneyBillWave,
  FaRoute
} from 'react-icons/fa';

const ALL_GEOPOLITICAL_ZONES = [
  'North Central',
  'North East',
  'North West',
  'South East',
  'South South',
  'South West'
];

const ZONE_DESCRIPTIONS = {
  'North Central': 'Middle Belt Region & FCT Federal Capital Territory',
  'North East': 'North-Eastern States Logistics Corridor',
  'North West': 'North-Western Commerce & Agricultural Belt',
  'South East': 'South-Eastern Commercial & Industrial Hub',
  'South South': 'Niger Delta Coastal & Haulage Corridor',
  'South West': 'South-Western Maritime, Industrial & Urban Hub'
};

const tabs = [
  { label: 'Zonal Overview', value: 'overview' },
  { label: 'Live Zonal Fleet Radar', value: 'tracking' },
  { label: 'Member States Activity', value: 'states' },
  { label: 'Zonal Bookings', value: 'bookings' },
  { label: 'Zonal Incidents', value: 'incidents' }
];

const TransportationAdminZonalDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    return new URLSearchParams(location.search).get('tab') || 'overview';
  });

  const [selectedZone, setSelectedZone] = useState(() => {
    const urlZone = new URLSearchParams(location.search).get('zone');
    if (urlZone) return urlZone;
    if (user?.assigned_zone) return user.assigned_zone;
    return 'North Central';
  });

  const [zonalData, setZonalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // Load Zonal Overview data
  const loadZonalOverview = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get('/transportation-admin/zonal-overview', {
        params: { zone: selectedZone }
      });
      if (res.data?.success) {
        setZonalData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load zonal overview:', err);
      toast.error('Failed to load geopolitical zone logistics report');
    } finally {
      if (!isSilent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedZone]);

  // Load Zonal Bookings
  const loadZonalBookings = useCallback(async () => {
    try {
      const res = await api.get('/transportation-admin/bookings', {
        params: { zone: selectedZone, limit: 20 }
      });
      if (res.data?.success) {
        setBookings(res.data.data?.bookings || []);
      }
    } catch (e) {
      console.error('Failed to load zonal bookings:', e);
    }
  }, [selectedZone]);

  // Load Zonal Incidents
  const loadZonalIncidents = useCallback(async () => {
    try {
      const res = await api.get('/transportation-admin/incidents', {
        params: { zone: selectedZone }
      });
      if (res.data?.success) {
        setIncidents(res.data.data || []);
      }
    } catch (e) {
      console.error('Failed to load zonal incidents:', e);
    }
  }, [selectedZone]);

  useEffect(() => {
    loadZonalOverview(false);
    loadZonalBookings();
    loadZonalIncidents();
  }, [loadZonalOverview, loadZonalBookings, loadZonalIncidents]);

  // URL Query Sync
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    params.set('zone', selectedZone);
    navigate({ search: params.toString() }, { replace: true });
  };

  const handleZoneChange = (zoneName) => {
    setSelectedZone(zoneName);
    const params = new URLSearchParams(location.search);
    params.set('zone', zoneName);
    params.set('tab', activeTab);
    navigate({ search: params.toString() }, { replace: true });
  };

  const isGlobalAdmin = ['super_admin', 'super_transportation_admin'].includes(user?.user_type);
  const stats = zonalData?.stats || {};
  const memberStates = zonalData?.member_states || [];
  const stateBreakdown = zonalData?.state_breakdown || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-100/40 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <PageHeader
          eyebrow="Zonal Transportation Logistics"
          title={`${selectedZone} Geopolitical Zone`}
          description={ZONE_DESCRIPTIONS[selectedZone] || 'Regional logistics management and live vehicle tracking across member states.'}
          actions={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => loadZonalOverview(false)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white px-4 py-2 text-sm font-semibold backdrop-blur-md transition-colors cursor-pointer border border-white/20"
              >
                <FaSyncAlt className={refreshing ? 'animate-spin' : ''} size={12} />
                <span>{refreshing ? 'Updating...' : 'Sync Fleet'}</span>
              </button>
            </div>
          }
        />

        {/* Commission Banner */}
        <CommissionWithdrawalBanner />

        {/* 6 Geopolitical Zones Navigation Pill Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap pl-2 flex items-center gap-1.5">
              <FaGlobeAfrica className="text-cyan-600" />
              <span>Geopolitical Zones:</span>
            </span>
            <div className="flex items-center gap-2">
              {ALL_GEOPOLITICAL_ZONES.map((zone) => {
                const isSelected = selectedZone === zone;
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => handleZoneChange(zone)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-slate-950 to-cyan-900 text-white shadow-md ring-2 ring-cyan-500/40'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {zone}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <SectionTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Zone Total Bookings"
                value={stats.total_bookings || 0}
                subtext={`Across ${memberStates.length} member states`}
                tone="cyan"
              />
              <MetricCard
                label="Active Vehicles In Transit"
                value={stats.active_trips || 0}
                subtext="Live GPS tracking enabled"
                tone="emerald"
              />
              <MetricCard
                label="Completed Trips"
                value={stats.completed_trips || 0}
                subtext="Verified delivery proofs"
                tone="slate"
              />
              <MetricCard
                label="Total Zonal Revenue"
                value={formatCurrency(stats.total_revenue || 0)}
                subtext="Fulfillments & payments"
                tone="amber"
              />
            </div>

            {/* Member States Regional Grid */}
            <SectionCard
              title="Member States Operational Radar"
              description={`Breakdown of logistics demand, live vehicles, and fulfillment status for each state in the ${selectedZone} zone.`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stateBreakdown.map((item) => (
                  <div
                    key={item.state}
                    className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <FaMapMarkedAlt className="text-cyan-600" />
                        <span>{item.state}</span>
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.active_trips > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.active_trips > 0 ? `${item.active_trips} Active` : 'Idle'}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Total Bookings:</span>
                        <span className="font-bold text-slate-800">{item.total_bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completed:</span>
                        <span className="font-medium text-emerald-700">{item.completed_trips}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delays:</span>
                        <span className={item.delayed_trips > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}>
                          {item.delayed_trips}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
                        <span>Revenue:</span>
                        <span>{formatCurrency(item.total_revenue)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* TAB 2: LIVE FLEET RADAR */}
        {activeTab === 'tracking' && (
          <TransportationFleetTracker zone={selectedZone} key={selectedZone} />
        )}

        {/* TAB 3: MEMBER STATES TABLE */}
        {activeTab === 'states' && (
          <SectionCard
            title={`${selectedZone} Member States Logistics Audit`}
            description="Comparative performance metrics across member states in this geopolitical territory."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5">State</th>
                    <th className="p-3.5">Total Moves</th>
                    <th className="p-3.5">In Transit</th>
                    <th className="p-3.5">Delivered</th>
                    <th className="p-3.5">Delayed</th>
                    <th className="p-3.5">Revenue</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stateBreakdown.map((row) => (
                    <tr key={row.state} className="hover:bg-slate-50/80">
                      <td className="p-3.5 font-bold text-slate-900">{row.state}</td>
                      <td className="p-3.5 font-semibold text-slate-700">{row.total_bookings}</td>
                      <td className="p-3.5 font-bold text-cyan-700">{row.active_trips}</td>
                      <td className="p-3.5 font-medium text-emerald-700">{row.completed_trips}</td>
                      <td className="p-3.5 font-bold text-rose-600">{row.delayed_trips}</td>
                      <td className="p-3.5 font-bold text-slate-900">{formatCurrency(row.total_revenue)}</td>
                      <td className="p-3.5">
                        <StatusPill value={row.active_trips > 0 ? 'active' : 'idle'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* TAB 4: ZONAL BOOKINGS QUEUE */}
        {activeTab === 'bookings' && (
          <SectionCard
            title="Zonal Booking Queue"
            description={`Transportation bookings originating or destined within the ${selectedZone} zone.`}
          >
            {bookings.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No bookings recorded in this zone yet.
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">Booking #{b.id}</span>
                        <StatusPill value={b.booking_status} />
                        <span className="text-xs text-slate-500">· {b.service_name}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {b.pickup_address} &rarr; {b.destination_address}
                      </p>
                      <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-4">
                        <span>Tenant: {b.tenant_name || 'N/A'}</span>
                        <span>Driver: {b.driver_name || 'Unassigned'}</span>
                        <span>Date: {formatDateTime(b.booking_date)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end md:self-auto">
                      <span className="font-bold text-slate-900 text-sm">{formatCurrency(b.total_price)}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/transportation/bookings/${b.id}`)}
                        className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-semibold cursor-pointer"
                      >
                        Inspect Trip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* TAB 5: ZONAL INCIDENTS */}
        {activeTab === 'incidents' && (
          <SectionCard
            title="Zonal Incident Log"
            description={`Operational delays and incidents reported in the ${selectedZone} corridor.`}
          >
            {incidents.length === 0 ? (
              <div className="py-12 text-center text-xs text-emerald-600 font-medium">
                ✓ No active incidents reported in this zone. All corridors normal.
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map((inc) => (
                  <div key={inc.id} className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 uppercase">
                          {inc.incident_type?.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded bg-rose-100 text-rose-800 text-[10px] font-bold uppercase px-2 py-0.5">
                          {inc.severity} severity
                        </span>
                        <span className="text-xs text-slate-500">Booking #{inc.booking_id}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700">{inc.description}</p>
                      <span className="mt-1 text-[11px] text-slate-400 block">
                        Reported {formatDateTime(inc.created_at)}
                      </span>
                    </div>
                    <span className="self-start sm:self-auto text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                      {inc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
};

export default TransportationAdminZonalDashboard;
