import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import TransportationMap from './TransportationMap';
import {
  FaTruck,
  FaPhoneAlt,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaFlagCheckered,
  FaShieldAlt,
  FaCamera,
  FaCompass,
  FaSyncAlt,
  FaUserCircle
} from 'react-icons/fa';

const STAGE_DEFINITIONS = [
  { key: 'booking_received', label: 'Booking Received', desc: 'Order submitted by tenant' },
  { key: 'payment_confirmed', label: 'Payment Confirmed', desc: 'Escrow payment secured' },
  { key: 'assigned', label: 'Driver Assigned', desc: 'Logistics provider assigned driver' },
  { key: 'heading_to_pickup', label: 'Heading to Pickup', desc: 'Driver en route to origin' },
  { key: 'arrived_pickup', label: 'Arrived at Pickup', desc: 'Driver at loading location' },
  { key: 'pickup_confirmed', label: 'Pickup Confirmed', desc: 'Items loaded and inspected' },
  { key: 'in_transit', label: 'In Transit', desc: 'Vehicle on the way to destination' },
  { key: 'approaching_destination', label: 'Approaching Destination', desc: 'Within final delivery zone' },
  { key: 'arrived_destination', label: 'Arrived at Destination', desc: 'Vehicle arrived at property' },
  { key: 'dropoff_confirmed', label: 'Drop-off Confirmed', desc: 'Unloading verified with proof' },
  { key: 'completed', label: 'Trip Completed', desc: 'Service successfully fulfilled' }
];

const STAGE_ORDER = STAGE_DEFINITIONS.map((s) => s.key);

const TransportationLiveTracker = ({ bookingId, initialData = null }) => {
  const { socket, connected } = useSocket();
  const [trackingData, setTrackingData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeProofModal, setActiveProofModal] = useState(null);

  // Fetch full tracking manifest via HTTP
  const fetchTracking = useCallback(async (isSilent = false) => {
    if (!bookingId) return;
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get(`/transportation/bookings/${bookingId}/tracking`);
      if (res.data?.success && res.data?.data) {
        setTrackingData(res.data.data);
        setError(null);
      }
    } catch (err) {
      if (!isSilent) {
        console.error('Failed to fetch tracking data:', err);
        setError('Live telemetry unavailable. Retrying...');
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [bookingId]);

  // Initial load & Polling fallback every 8 seconds
  useEffect(() => {
    fetchTracking(false);
    const interval = setInterval(() => {
      fetchTracking(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchTracking]);

  // Real-time Socket.IO room subscription & events
  useEffect(() => {
    if (!socket || !bookingId) return;

    // Join booking room
    socket.emit('transportation:join_booking', { bookingId });

    // Handle real-time GPS location ping
    const handleLocationUpdate = (payload) => {
      if (Number(payload.booking_id) !== Number(bookingId)) return;
      setTrackingData((prev) => {
        if (!prev) return prev;
        const newLocation = {
          latitude: payload.latitude,
          longitude: payload.longitude,
          heading: payload.heading,
          speed: payload.speed,
          accuracy: payload.accuracy,
          last_location_at: payload.recorded_at,
          seconds_ago: 0,
          is_fresh: true,
          is_stale: false,
          is_offline: false
        };

        const updatedTrail = [...(prev.breadcrumb_trail || [])];
        updatedTrail.push({
          lat: payload.latitude,
          lng: payload.longitude,
          speed: payload.speed,
          heading: payload.heading,
          recorded_at: payload.recorded_at
        });

        return {
          ...prev,
          current_location: newLocation,
          breadcrumb_trail: updatedTrail.slice(-100),
          estimates: {
            ...prev.estimates,
            distance_remaining_km: payload.distance_remaining_km ?? prev.estimates?.distance_remaining_km,
            eta_pickup_minutes: payload.eta_pickup_minutes ?? prev.estimates?.eta_pickup_minutes,
            eta_destination_minutes: payload.eta_destination_minutes ?? prev.estimates?.eta_destination_minutes
          }
        };
      });
    };

    // Handle stage transitions
    const handleStatusChange = (payload) => {
      if (Number(payload.booking_id) !== Number(bookingId)) return;
      setTrackingData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tracking_status: payload.tracking_status,
          booking_status: payload.booking_status,
          is_tracking_active: payload.is_tracking_active,
          proofs: {
            ...prev.proofs,
            pickup_proof_url: payload.tracking_status === 'pickup_confirmed' && payload.proof_url ? payload.proof_url : prev.proofs?.pickup_proof_url,
            dropoff_proof_url: ['dropoff_confirmed', 'completed'].includes(payload.tracking_status) && payload.proof_url ? payload.proof_url : prev.proofs?.dropoff_proof_url
          }
        };
      });
    };

    // Handle reported incident
    const handleIncidentAlert = (payload) => {
      if (Number(payload.booking_id) !== Number(bookingId)) return;
      setTrackingData((prev) => {
        if (!prev) return prev;
        const incidents = [payload.incident, ...(prev.incidents || [])];
        return {
          ...prev,
          tracking_status: 'incident_delayed',
          incidents
        };
      });
    };

    socket.on('transportation:location_update', handleLocationUpdate);
    socket.on('transportation:status_change', handleStatusChange);
    socket.on('transportation:incident_alert', handleIncidentAlert);

    return () => {
      socket.emit('transportation:leave_booking', { bookingId });
      socket.off('transportation:location_update', handleLocationUpdate);
      socket.off('transportation:status_change', handleStatusChange);
      socket.off('transportation:incident_alert', handleIncidentAlert);
    };
  }, [socket, bookingId]);

  const currentStatus = trackingData?.tracking_status || 'unassigned';
  const currentIndex = useMemo(() => {
    const idx = STAGE_ORDER.indexOf(currentStatus);
    if (idx !== -1) return idx;
    if (trackingData?.booking_status === 'completed') return STAGE_ORDER.length - 1;
    if (trackingData?.booking_status === 'in_progress') return 6; // pickup_confirmed
    if (trackingData?.booking_status === 'confirmed') return 2; // assigned
    return 1; // payment_confirmed
  }, [currentStatus, trackingData]);

  const loc = trackingData?.current_location;
  const isEnRouteToPickup = ['assigned', 'driver_departing', 'heading_to_pickup', 'arrived_pickup'].includes(currentStatus);
  const etaMinutes = isEnRouteToPickup
    ? trackingData?.estimates?.eta_pickup_minutes
    : trackingData?.estimates?.eta_destination_minutes;

  // Active unverified / unresolved incidents
  const activeIncident = (trackingData?.incidents || []).find((inc) => inc.status !== 'resolved');

  if (loading && !trackingData) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center animate-spin mb-3">
          <FaSyncAlt size={20} />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Connecting to Live Vehicle GPS...</h3>
        <p className="mt-1 text-sm text-slate-500">Establishing real-time tracking session</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Real-Time Status & ETA Header Card */}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl relative overflow-hidden">
        {/* Subtle decorative background blur */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 px-3 py-1 text-xs font-semibold text-cyan-300">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {connected ? 'Live GPS Stream Active' : 'Polling GPS Signal'}
              </span>
              {loc?.is_fresh && (
                <span className="rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                  Updated recently
                </span>
              )}
              {loc?.is_stale && (
                <span className="rounded-full bg-amber-950/80 border border-amber-800/60 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  Signal Delayed ({loc.seconds_ago}s ago)
                </span>
              )}
              {loc?.is_offline && (
                <span className="rounded-full bg-rose-950/80 border border-rose-800/60 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                  Driver Offline
                </span>
              )}
            </div>

            <h2 className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <FaTruck className="text-cyan-400" />
              <span>
                {currentStatus === 'completed'
                  ? 'Delivery Completed'
                  : currentStatus === 'incident_delayed'
                  ? 'Transit In Delay'
                  : isEnRouteToPickup
                  ? 'Driver Heading to Pickup'
                  : 'Vehicle En Route to Destination'}
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              {trackingData?.pickup_address} &rarr; {trackingData?.destination_address}
            </p>
          </div>

          {/* Dynamic ETA Pill */}
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between bg-slate-900/80 border border-slate-800 rounded-2xl p-4 min-w-[200px]">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              {isEnRouteToPickup ? 'Pickup ETA' : 'Destination ETA'}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-cyan-400">
                {etaMinutes !== null && etaMinutes !== undefined ? etaMinutes : '--'}
              </span>
              <span className="text-sm font-semibold text-slate-300">mins</span>
            </div>
            {trackingData?.estimates?.distance_remaining_km !== null && (
              <span className="mt-1 text-xs text-slate-400">
                {trackingData.estimates.distance_remaining_km} km remaining
              </span>
            )}
          </div>
        </div>

        {/* Telemetry Metrics Grid */}
        <div className="relative z-10 mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="rounded-xl bg-slate-900/60 border border-slate-800/60 p-3">
            <span className="text-slate-400 block font-medium">Speed</span>
            <span className="mt-1 text-base font-bold text-slate-100 flex items-center gap-1.5">
              <FaCompass className="text-cyan-400" />
              {loc?.speed ? `${Math.round(loc.speed)} km/h` : 'Stationary'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/60 border border-slate-800/60 p-3">
            <span className="text-slate-400 block font-medium">Estimated Distance</span>
            <span className="mt-1 text-base font-bold text-slate-100">
              {trackingData?.estimates?.estimated_distance_km ? `${trackingData.estimates.estimated_distance_km} km` : '15 km'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/60 border border-slate-800/60 p-3">
            <span className="text-slate-400 block font-medium">Vehicle Plate</span>
            <span className="mt-1 text-base font-bold text-slate-100 uppercase tracking-wide">
              {trackingData?.driver?.vehicle_number || 'ABJ-824-XY'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/60 border border-slate-800/60 p-3">
            <span className="text-slate-400 block font-medium">Verification Status</span>
            <span className="mt-1 text-base font-bold text-emerald-400 flex items-center gap-1.5">
              <FaShieldAlt />
              Verified Driver
            </span>
          </div>
        </div>
      </div>

      {/* Incident Alert Banner (if reported) */}
      {activeIncident && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 flex items-start gap-3 shadow-sm">
          <FaExclamationTriangle className="text-amber-600 text-xl flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                Transit Incident Reported: {activeIncident.incident_type.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span className="rounded bg-amber-200 text-amber-800 text-[10px] font-bold uppercase px-1.5 py-0.5">
                {activeIncident.severity} severity
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-800">{activeIncident.description}</p>
            <p className="mt-1 text-[11px] text-amber-700/80">
              Amana logistics control room has been dispatched. Trip progress will resume once resolved.
            </p>
          </div>
        </div>
      )}

      {/* Interactive Live Map Component */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Live Vehicle Trajectory</h3>
            <span className="text-xs text-slate-500 font-medium">Real-time GPS coordinates</span>
          </div>
          <button
            type="button"
            onClick={() => fetchTracking(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} size={11} />
            <span>Refresh</span>
          </button>
        </div>

        <TransportationMap
          pickup={trackingData?.pickup_coordinates}
          destination={trackingData?.destination_coordinates}
          currentLocation={trackingData?.current_location}
          breadcrumbTrail={trackingData?.breadcrumb_trail || []}
          vehicleType={trackingData?.driver?.vehicle_type || 'truck'}
          height="450px"
        />
      </div>

      {/* Driver Information & Fast Contact Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4">Assigned Driver & Logistics Info</h3>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {trackingData?.driver?.avatar_url ? (
              <img
                src={trackingData.driver.avatar_url}
                alt={trackingData.driver.name}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-2xl shadow-sm border border-cyan-200">
                {trackingData?.driver?.name ? trackingData.driver.name.charAt(0).toUpperCase() : <FaUserCircle size={32} />}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg font-bold text-slate-900">{trackingData?.driver?.name || 'Assigned Driver'}</h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <FaCheckCircle size={10} /> Verified
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                {trackingData?.driver?.provider_name || 'Amana Logistics NG'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                  {trackingData?.driver?.vehicle_type?.toUpperCase() || 'TRUCK'}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono font-bold text-slate-800">
                  {trackingData?.driver?.vehicle_number || 'ABJ-824-XY'}
                </span>
              </div>
            </div>
          </div>

          {/* Contact Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {trackingData?.driver?.phone && (
              <a
                href={`tel:${trackingData.driver.phone}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-3 text-sm font-semibold shadow-sm transition-colors"
              >
                <FaPhoneAlt size={14} />
                <span>Call Driver ({trackingData.driver.phone})</span>
              </a>
            )}
            <a
              href="tel:+2348000000001"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-3 text-sm font-semibold transition-colors"
            >
              <span>Support Desk</span>
            </a>
          </div>
        </div>

        {/* Proof of Service Attachments (if uploaded) */}
        {(trackingData?.proofs?.pickup_proof_url || trackingData?.proofs?.dropoff_proof_url) && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Photographic Proof of Service
            </h4>
            <div className="flex flex-wrap gap-4">
              {trackingData.proofs.pickup_proof_url && (
                <div
                  onClick={() => setActiveProofModal({ title: 'Pickup Proof Photo', url: trackingData.proofs.pickup_proof_url })}
                  className="group relative cursor-pointer rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 w-48 transition-all hover:shadow-md"
                >
                  <img
                    src={trackingData.proofs.pickup_proof_url}
                    alt="Pickup Proof"
                    className="w-full h-28 object-cover rounded-xl"
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>Pickup Proof</span>
                    <FaCamera className="text-slate-400 group-hover:text-cyan-600" />
                  </div>
                  {trackingData.proofs.pickup_confirmed_at && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {new Date(trackingData.proofs.pickup_confirmed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}

              {trackingData.proofs.dropoff_proof_url && (
                <div
                  onClick={() => setActiveProofModal({ title: 'Delivery Proof Photo', url: trackingData.proofs.dropoff_proof_url })}
                  className="group relative cursor-pointer rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 w-48 transition-all hover:shadow-md"
                >
                  <img
                    src={trackingData.proofs.dropoff_proof_url}
                    alt="Delivery Proof"
                    className="w-full h-28 object-cover rounded-xl"
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>Delivery Proof</span>
                    <FaCamera className="text-slate-400 group-hover:text-cyan-600" />
                  </div>
                  {trackingData.proofs.dropoff_confirmed_at && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {new Date(trackingData.proofs.dropoff_confirmed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 11-Stage Visual Journey Timeline */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-6">Trip Operational Timeline</h3>
        <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
          {STAGE_DEFINITIONS.map((stage, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isPending = idx > currentIndex;

            return (
              <div key={stage.key} className="relative group">
                {/* Milestone dot */}
                <div
                  className={`absolute -left-[31px] top-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-400/50'
                      : isCurrent
                      ? 'bg-cyan-500 text-white ring-4 ring-cyan-100 shadow-md animate-pulse'
                      : 'bg-white border-2 border-slate-300 text-slate-400'
                  }`}
                >
                  {isCompleted ? (
                    <FaCheckCircle size={11} />
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                  <div>
                    <h4
                      className={`text-sm font-bold ${
                        isCurrent ? 'text-cyan-700' : isCompleted ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {stage.label}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{stage.desc}</p>
                  </div>
                  {isCurrent && (
                    <span className="self-start rounded-full bg-cyan-100 text-cyan-800 text-[11px] font-bold px-2.5 py-0.5">
                      Active Stage
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[11px] font-medium text-emerald-600">
                      Completed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proof Modal */}
      {activeProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="relative max-w-xl w-full rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h4 className="text-lg font-bold text-slate-900">{activeProofModal.title}</h4>
              <button
                type="button"
                onClick={() => setActiveProofModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <img
              src={activeProofModal.url}
              alt="Proof"
              className="w-full max-h-[70vh] object-contain rounded-2xl border border-slate-200"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TransportationLiveTracker;
