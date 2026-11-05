import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import TransportationMap from '../transportation/TransportationMap';
import { toast } from 'react-toastify';
import {
  FaTruck,
  FaMapMarkerAlt,
  FaFlagCheckered,
  FaExclamationTriangle,
  FaCheckCircle,
  FaSyncAlt,
  FaPhoneAlt,
  FaRoute,
  FaSatellite,
  FaUser,
  FaCompass
} from 'react-icons/fa';

const TransportationFleetTracker = ({ zone = null, userRole = null, title = null }) => {
  const { socket, connected } = useSocket();
  const [fleet, setFleet] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [breadcrumbTrail, setBreadcrumbTrail] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // Resolving incident
  const [resolvingIncidentId, setResolvingIncidentId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Load live fleet from API
  const loadLiveFleet = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const params = zone ? { zone } : {};
      const res = await api.get('/transportation-admin/live-tracking', { params });
      if (res.data?.success) {
        const vehicles = res.data.data || [];
        setFleet(vehicles);
        if (vehicles.length > 0 && !selectedVehicle) {
          setSelectedVehicle(vehicles[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load fleet:', err);
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedVehicle, zone]);

  // Load incidents
  const loadIncidents = useCallback(async () => {
    try {
      const params = zone ? { zone } : {};
      const res = await api.get('/transportation-admin/incidents', { params });
      if (res.data?.success) {
        setIncidents(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load incidents:', err);
    }
  }, [zone]);

  // Load breadcrumbs for selected vehicle
  const loadBreadcrumbs = useCallback(async (bookingId) => {
    if (!bookingId) return;
    try {
      const res = await api.get(`/transportation-admin/bookings/${bookingId}/pings`);
      if (res.data?.success) {
        setBreadcrumbTrail(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load pings:', err);
    }
  }, []);

  useEffect(() => {
    loadLiveFleet(false);
    loadIncidents();
    const interval = setInterval(() => {
      loadLiveFleet(true);
      loadIncidents();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadLiveFleet, loadIncidents]);

  useEffect(() => {
    if (selectedVehicle?.booking_id) {
      loadBreadcrumbs(selectedVehicle.booking_id);
    }
  }, [selectedVehicle, loadBreadcrumbs]);

  // Socket.IO real-time fleet updates
  useEffect(() => {
    if (!socket) return;

    const handleLocationUpdate = (payload) => {
      setFleet((prevFleet) => {
        return prevFleet.map((v) => {
          if (Number(v.booking_id) === Number(payload.booking_id)) {
            const updated = {
              ...v,
              current_latitude: payload.latitude,
              current_longitude: payload.longitude,
              current_heading: payload.heading,
              current_speed: payload.speed,
              last_location_at: payload.recorded_at,
              distance_remaining_km: payload.distance_remaining_km ?? v.distance_remaining_km,
              eta_destination_minutes: payload.eta_destination_minutes ?? v.eta_destination_minutes,
              is_fresh: true,
              is_stale: false,
              is_offline: false,
              seconds_ago: 0
            };
            if (selectedVehicle?.booking_id === v.booking_id) {
              setSelectedVehicle(updated);
            }
            return updated;
          }
          return v;
        });
      });
    };

    const handleStatusChange = (payload) => {
      setFleet((prev) =>
        prev.map((v) =>
          Number(v.booking_id) === Number(payload.booking_id)
            ? { ...v, tracking_status: payload.tracking_status, booking_status: payload.booking_status }
            : v
        )
      );
    };

    const handleIncidentAlert = (payload) => {
      if (payload.incident) {
        setIncidents((prev) => [payload.incident, ...prev]);
        toast.warning(`Emergency Alert: ${payload.incident.incident_type} reported on Booking #${payload.booking_id}`);
      }
    };

    socket.on('transportation:location_update', handleLocationUpdate);
    socket.on('transportation:status_change', handleStatusChange);
    socket.on('transportation:incident_alert', handleIncidentAlert);

    return () => {
      socket.off('transportation:location_update', handleLocationUpdate);
      socket.off('transportation:status_change', handleStatusChange);
      socket.off('transportation:incident_alert', handleIncidentAlert);
    };
  }, [socket, selectedVehicle]);

  // Resolve incident
  const handleResolveIncident = async (e) => {
    e.preventDefault();
    if (!resolvingIncidentId) return;
    setIsResolving(true);
    try {
      const res = await api.patch(`/transportation-admin/incidents/${resolvingIncidentId}/resolve`, {
        status: 'resolved',
        resolution_note: resolutionNote || 'Resolved by transportation desk control'
      });
      if (res.data?.success) {
        toast.success('Incident resolved successfully');
        setResolvingIncidentId(null);
        setResolutionNote('');
        loadIncidents();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve incident');
    } finally {
      setIsResolving(false);
    }
  };

  const filteredFleet = fleet.filter((v) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'moving') return v.current_speed > 5;
    if (filterStatus === 'stationary') return !v.current_speed || v.current_speed <= 5;
    if (filterStatus === 'delayed') return v.tracking_status === 'incident_delayed';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold">
            <FaTruck size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {title || (zone ? `${zone} Live Fleet Tracking Desk` : 'Jurisdiction Live Fleet Tracking Desk')}
            </h3>
            <p className="text-xs text-slate-500">
              {fleet.length} Active Vehicles &middot; Real-Time GPS Telemetry Stream
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: `All (${fleet.length})` },
            { id: 'moving', label: 'In Motion' },
            { id: 'stationary', label: 'Stationary' },
            { id: 'delayed', label: 'Delayed / Incidents' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => loadLiveFleet(false)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer ml-1"
            title="Refresh Fleet"
          >
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} size={12} />
          </button>
        </div>
      </div>

      {/* Active Incidents Alert Bar (if any) */}
      {incidents.filter((i) => i.status !== 'resolved').length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FaExclamationTriangle className="text-rose-600" />
            <h4 className="font-bold text-sm text-rose-900">
              Active Transit Alerts ({incidents.filter((i) => i.status !== 'resolved').length})
            </h4>
          </div>

          <div className="space-y-2">
            {incidents
              .filter((i) => i.status !== 'resolved')
              .slice(0, 3)
              .map((inc) => (
                <div
                  key={inc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-rose-200 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 uppercase">
                        {inc.incident_type.replace(/_/g, ' ')}
                      </span>
                      <span className="rounded bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 uppercase">
                        {inc.severity}
                      </span>
                      <span className="text-slate-500">
                        Booking #{inc.booking_id} &middot; Driver: {inc.driver_name || 'N/A'}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1">{inc.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResolvingIncidentId(inc.id)}
                    className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Resolve Alert
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Main Grid: Interactive Map & Live Vehicle List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map View */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                {selectedVehicle ? `Tracking #${selectedVehicle.booking_id} — ${selectedVehicle.driver_name}` : 'Live Jurisdiction Radar'}
              </h4>
              <p className="text-xs text-slate-500">
                {selectedVehicle ? `${selectedVehicle.pickup_address} → ${selectedVehicle.destination_address}` : 'Select a vehicle from the fleet roster'}
              </p>
            </div>
            {selectedVehicle?.is_fresh && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live GPS Active
              </span>
            )}
          </div>

          <TransportationMap
            pickup={
              selectedVehicle?.pickup_latitude
                ? { lat: selectedVehicle.pickup_latitude, lng: selectedVehicle.pickup_longitude }
                : null
            }
            destination={
              selectedVehicle?.destination_latitude
                ? { lat: selectedVehicle.destination_latitude, lng: selectedVehicle.destination_longitude }
                : null
            }
            currentLocation={
              selectedVehicle
                ? {
                    latitude: selectedVehicle.current_latitude,
                    longitude: selectedVehicle.current_longitude,
                    heading: selectedVehicle.current_heading,
                    speed: selectedVehicle.current_speed,
                    is_fresh: selectedVehicle.is_fresh
                  }
                : null
            }
            breadcrumbTrail={breadcrumbTrail}
            vehicleType={selectedVehicle?.service_type || 'truck'}
            height="440px"
          />
        </div>

        {/* Fleet Vehicle Roster */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col h-[520px]">
          <h4 className="font-bold text-slate-900 text-sm mb-3">Fleet Roster ({filteredFleet.length})</h4>
          <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
            {filteredFleet.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No active vehicles match the selected filter.
              </div>
            ) : (
              filteredFleet.map((v) => {
                const isSelected = selectedVehicle?.booking_id === v.booking_id;
                return (
                  <div
                    key={v.booking_id}
                    onClick={() => setSelectedVehicle(v)}
                    className={`rounded-2xl border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/50 shadow-md ring-2 ring-cyan-200'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        #{v.booking_id} &middot; {v.service_name}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          v.tracking_status === 'incident_delayed'
                            ? 'bg-rose-100 text-rose-800'
                            : v.is_fresh
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {v.tracking_status?.replace(/_/g, ' ') || v.booking_status}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
                      <span>Driver: {v.driver_name || 'Assigned Driver'}</span>
                      <span className="font-mono font-bold text-slate-800">{v.vehicle_number || 'N/A'}</span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{v.current_speed ? `${Math.round(v.current_speed)} km/h` : 'Stationary'}</span>
                      <span>
                        {v.eta_destination_minutes ? `ETA: ${v.eta_destination_minutes}m` : 'ETA calculating'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Incident Resolution Modal */}
      {resolvingIncidentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-3xl bg-white p-6 shadow-2xl">
            <h4 className="font-bold text-slate-900 text-base mb-1">Resolve Transit Incident</h4>
            <p className="text-xs text-slate-500 mb-4">
              Enter notes on action taken (e.g., replacement vehicle sent, police clearance obtained).
            </p>

            <form onSubmit={handleResolveIncident} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Resolution Summary</label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  required
                  rows={3}
                  placeholder="Action taken and outcome..."
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingIncidentId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolving}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  {isResolving ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransportationFleetTracker;
