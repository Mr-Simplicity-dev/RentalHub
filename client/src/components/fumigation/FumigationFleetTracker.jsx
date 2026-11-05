import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import FumigationMap from './FumigationMap';
import {
  FaSprayCan,
  FaMapMarkerAlt,
  FaShieldAlt,
  FaExclamationTriangle,
  FaSyncAlt,
  FaCheckCircle,
  FaClock,
  FaSearch,
  FaVial,
  FaTimes
} from 'react-icons/fa';

const FumigationFleetTracker = ({ adminLevel = 'national' }) => {
  const [fleet, setFleet] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [zonalStats, setZonalStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSquad, setSelectedSquad] = useState(null);
  const [resolvingIncident, setResolvingIncident] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [submittingResolution, setSubmittingResolution] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const fetchFleetData = useCallback(async () => {
    try {
      const [fleetRes, incRes, zonalRes] = await Promise.allSettled([
        api.get('/fumigation-admin/live-tracking'),
        api.get('/fumigation-admin/incidents'),
        api.get('/fumigation-admin/zonal-overview')
      ]);

      if (fleetRes.status === 'fulfilled' && fleetRes.value.data?.success) {
        setFleet(fleetRes.value.data.data || []);
        if (fleetRes.value.data.data?.length > 0 && !selectedSquad) {
          setSelectedSquad(fleetRes.value.data.data[0]);
        }
      }

      if (incRes.status === 'fulfilled' && incRes.value.data?.success) {
        setIncidents(incRes.value.data.data || []);
      }

      if (zonalRes.status === 'fulfilled' && zonalRes.value.data?.success) {
        setZonalStats(zonalRes.value.data.data || []);
      }
    } catch (e) {
      console.error('Failed to load fleet monitoring data:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedSquad]);

  useEffect(() => {
    fetchFleetData();
    const interval = setInterval(fetchFleetData, 10000);
    return () => clearInterval(interval);
  }, [fetchFleetData]);

  const handleResolveIncident = async (e) => {
    e.preventDefault();
    if (!resolvingIncident || !resolutionNote.trim()) return;

    setSubmittingResolution(true);
    try {
      const res = await api.patch(`/fumigation-admin/incidents/${resolvingIncident.id}/resolve`, {
        resolution_note: resolutionNote.trim()
      });
      if (res.data?.success) {
        setResolvingIncident(null);
        setResolutionNote('');
        fetchFleetData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to resolve incident');
    } finally {
      setSubmittingResolution(false);
    }
  };

  const filteredFleet = fleet.filter((item) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      item.team?.name?.toLowerCase().includes(q) ||
      item.property?.address?.toLowerCase().includes(q) ||
      item.property?.state?.toLowerCase().includes(q) ||
      item.property?.lga?.toLowerCase().includes(q) ||
      item.reference?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <FaShieldAlt /> Jurisdictional Operational Oversight
            </div>
            <h2 className="text-xl font-bold text-white mt-1">Live Fumigation Fleet Radar</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time GPS tracking of certified fumigation squads and chemical treatment compliance
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchFleetData}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
            >
              <FaSyncAlt className={loading ? 'animate-spin' : ''} size={11} />
              Sync Fleet
            </button>
          </div>
        </div>

        {/* Quick summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div>
            <span className="text-slate-400">Active Squads on Radar:</span>
            <span className="ml-2 font-bold text-white text-sm">{fleet.length}</span>
          </div>
          <div>
            <span className="text-slate-400">Reported Incidents:</span>
            <span className="ml-2 font-bold text-amber-400 text-sm">
              {incidents.filter((i) => i.status !== 'resolved').length}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Active Treatments:</span>
            <span className="ml-2 font-bold text-emerald-400 text-sm">
              {fleet.filter((f) => f.tracking_status === 'chemical_treatment_active').length}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Jurisdiction Level:</span>
            <span className="ml-2 font-bold uppercase text-slate-300">{adminLevel}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Radar Map + Squad Telemetry Manifest */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Vector Map (2 cols) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FaSprayCan className="text-emerald-600" />
                Live Fleet Tracking Radar
              </h3>
              {selectedSquad && (
                <span className="text-xs font-semibold text-slate-600">
                  Tracking: <strong>{selectedSquad.team?.name}</strong> ({selectedSquad.reference})
                </span>
              )}
            </div>

            <FumigationMap
              propertyDestination={selectedSquad?.property}
              teamLocation={selectedSquad?.location}
              height="400px"
            />
          </div>
        </div>

        {/* Squad Selection List (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Active Squads</h3>
              <span className="text-xs text-slate-500">{filteredFleet.length} in jurisdiction</span>
            </div>

            <div className="relative mb-3">
              <FaSearch className="absolute left-3 top-2.5 text-slate-400 text-xs" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search LGA, state, reference..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredFleet.length > 0 ? (
                filteredFleet.map((squad) => (
                  <button
                    key={squad.booking_id}
                    type="button"
                    onClick={() => setSelectedSquad(squad)}
                    className={`w-full p-2.5 rounded-lg text-left text-xs transition-colors border ${
                      selectedSquad?.booking_id === squad.booking_id
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                        : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{squad.team?.name || 'Squad Alpha'}</span>
                      <span className="text-[10px] font-mono font-medium text-slate-500">{squad.reference}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{squad.property?.address}</p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                      <span>{squad.property?.lga}, {squad.property?.state}</span>
                      <span className="text-emerald-700 font-medium capitalize">{squad.tracking_status?.replace(/_/g, ' ')}</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">No active squads matching filter.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Geopolitical Zones Breakdown (Zonal & Super Admin view) */}
      {zonalStats.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <FaMapMarkerAlt className="text-emerald-600" />
            National Geopolitical Zones Fumigation Overview
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {zonalStats.map((z) => (
              <div key={z.zone} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                <p className="text-xs font-bold text-slate-800 truncate">{z.zone}</p>
                <p className="text-xl font-extrabold text-emerald-600 mt-1">{z.total_active_jobs}</p>
                <p className="text-[10px] text-slate-400">Active Treatments</p>
                <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-200 pt-1">
                  En Route: <strong>{z.teams_en_route}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incidents & Operational Exceptions Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FaExclamationTriangle className="text-amber-500" />
            Reported Operational Exceptions &amp; Delays
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            {incidents.filter((i) => i.status !== 'resolved').length} Unresolved
          </span>
        </div>

        {incidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-2.5">Reference</th>
                  <th className="p-2.5">Squad</th>
                  <th className="p-2.5">Incident Type</th>
                  <th className="p-2.5">Severity</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-medium text-slate-900">{inc.booking_reference || `FC-${inc.booking_id}`}</td>
                    <td className="p-2.5">{inc.team_name || 'Assigned Squad'}</td>
                    <td className="p-2.5 font-medium capitalize">{inc.incident_type?.replace(/_/g, ' ')}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inc.severity === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : inc.severity === 'high'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="p-2.5 max-w-xs truncate">{inc.description}</td>
                    <td className="p-2.5">
                      {inc.status === 'resolved' ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <FaCheckCircle size={11} /> Resolved
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold">Active</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right">
                      {inc.status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => setResolvingIncident(inc)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-[11px] transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No operational exceptions reported in this jurisdiction.</p>
        )}
      </div>

      {/* Incident Resolution Modal */}
      {resolvingIncident && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Resolve Operational Incident</h3>
              <button onClick={() => setResolvingIncident(null)} className="text-slate-400 hover:text-slate-600">
                <FaTimes />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              <strong>Incident:</strong> [{resolvingIncident.incident_type}] {resolvingIncident.description}
            </p>

            <form onSubmit={handleResolveIncident} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Administrative Resolution Note *</label>
                <textarea
                  rows="3"
                  required
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Detail the corrective actions taken (e.g. backup team dispatched, tenant contacted)..."
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolvingIncident(null)}
                  className="py-2 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution || !resolutionNote.trim()}
                  className="py-2 px-4 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submittingResolution ? 'Saving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FumigationFleetTracker;
