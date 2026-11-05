import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import TransportationMap from '../../components/transportation/TransportationMap';
import { toast } from 'react-toastify';
import {
  FaTruck,
  FaLocationArrow,
  FaPhoneAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaFlagCheckered,
  FaCamera,
  FaRoute,
  FaExternalLinkAlt,
  FaBatteryThreeQuarters,
  FaSatellite,
  FaSyncAlt,
  FaClock
} from 'react-icons/fa';

const STAGE_FLOW = [
  { key: 'assigned', next: 'heading_to_pickup', label: 'Head to Pickup Location' },
  { key: 'heading_to_pickup', next: 'arrived_pickup', label: 'Arrived at Pickup' },
  { key: 'arrived_pickup', next: 'pickup_confirmed', label: 'Confirm Cargo Loaded (Pickup Proof)', requiresProof: true },
  { key: 'pickup_confirmed', next: 'in_transit', label: 'Start Journey to Destination' },
  { key: 'in_transit', next: 'approaching_destination', label: 'Approaching Destination' },
  { key: 'approaching_destination', next: 'arrived_destination', label: 'Arrived at Destination' },
  { key: 'arrived_destination', next: 'dropoff_confirmed', label: 'Confirm Drop-off & Delivery', requiresProof: true },
  { key: 'dropoff_confirmed', next: 'completed', label: 'Complete Assignment' }
];

const DriverTripConsole = () => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [assignedTrips, setAssignedTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [tripDetails, setTripDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  // GPS Tracking State
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [currentGps, setCurrentGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);

  // Modals
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofType, setProofType] = useState('pickup_confirmed');
  const [proofNote, setProofNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState('traffic_delay');
  const [incidentSeverity, setIncidentSeverity] = useState('medium');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [submittingIncident, setSubmittingIncident] = useState(false);

  const watchIdRef = useRef(null);
  const lastPingTimeRef = useRef(0);

  // Load battery level if supported
  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((battery) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  // Fetch assigned trips
  const loadAssignedTrips = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/transportation/driver/assigned');
      if (res.data?.success) {
        const trips = res.data.data || [];
        setAssignedTrips(trips);
        if (trips.length > 0 && !selectedTripId) {
          setSelectedTripId(trips[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load driver trips:', err);
      toast.error('Unable to retrieve assigned trips');
    } finally {
      setLoading(false);
    }
  }, [selectedTripId]);

  useEffect(() => {
    loadAssignedTrips();
  }, [loadAssignedTrips]);

  // Load details for selected trip
  const loadTripDetails = useCallback(async (tripId) => {
    if (!tripId) return;
    try {
      const res = await api.get(`/transportation/driver/trips/${tripId}`);
      if (res.data?.success) {
        setTripDetails(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load trip manifest:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadTripDetails(selectedTripId);
    }
  }, [selectedTripId, loadTripDetails]);

  // Real-time GPS broadcasting handler
  const sendLocationPing = useCallback(async (coords) => {
    if (!selectedTripId || !coords) return;
    const now = Date.now();
    // Throttle: send at most once every 4 seconds to balance real-time tracking with device battery
    if (now - lastPingTimeRef.current < 4000) return;
    lastPingTimeRef.current = now;

    const payload = {
      booking_id: Number(selectedTripId),
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading || 0,
      speed: coords.speed ? coords.speed * 3.6 : 0, // Convert m/s to km/h
      altitude: coords.altitude,
      battery_level: batteryLevel,
      is_mocked: false
    };

    // Emit via WebSocket if connected
    if (socket && connected) {
      socket.emit('transportation:driver_location', payload);
    }

    // Always post to HTTP endpoint to guarantee persistence
    try {
      await api.post('/transportation/driver/location', payload);
      setLastSentAt(new Date());
      setGpsError(null);
    } catch (e) {
      console.warn('GPS location ping failed:', e.message);
    }
  }, [selectedTripId, batteryLevel, socket, connected]);

  // Toggle GPS Geolocation Watcher
  useEffect(() => {
    if (!isSharingLocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your browser');
      setIsSharingLocation(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    };

    const handleSuccess = (position) => {
      const coords = position.coords;
      setCurrentGps({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed ? Math.round(coords.speed * 3.6) : 0,
        heading: coords.heading || 0
      });
      setGpsError(null);
      sendLocationPing(coords);
    };

    const handleError = (error) => {
      console.warn('Geolocation watch error:', error);
      setGpsError(error.message || 'GPS signal lost');
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isSharingLocation, sendLocationPing]);

  // Status transition handler
  const handleStageTransition = async (nextStatus) => {
    if (!selectedTripId) return;

    // Check if stage requires proof modal
    const flow = STAGE_FLOW.find((s) => s.next === nextStatus);
    if (flow?.requiresProof) {
      setProofType(nextStatus);
      setShowProofModal(true);
      return;
    }

    try {
      const res = await api.post('/transportation/driver/status', {
        booking_id: Number(selectedTripId),
        status: nextStatus
      });

      if (res.data?.success) {
        toast.success(`Trip status updated: ${nextStatus.replace(/_/g, ' ')}`);
        loadTripDetails(selectedTripId);
        loadAssignedTrips();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update trip status');
    }
  };

  // Submit proof modal
  const submitProof = async (e) => {
    e.preventDefault();
    if (!selectedTripId) return;
    setSubmittingProof(true);
    try {
      const res = await api.post('/transportation/driver/status', {
        booking_id: Number(selectedTripId),
        status: proofType,
        note: proofNote,
        proof_url: proofUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80'
      });

      if (res.data?.success) {
        toast.success('Service proof verified and logged');
        setShowProofModal(false);
        setProofNote('');
        setProofUrl('');
        loadTripDetails(selectedTripId);
        loadAssignedTrips();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit proof');
    } finally {
      setSubmittingProof(false);
    }
  };

  // Submit incident
  const submitIncident = async (e) => {
    e.preventDefault();
    if (!selectedTripId || !incidentDescription.trim()) return;
    setSubmittingIncident(true);
    try {
      const res = await api.post('/transportation/driver/incident', {
        booking_id: Number(selectedTripId),
        incident_type: incidentType,
        severity: incidentSeverity,
        description: incidentDescription,
        latitude: currentGps?.latitude,
        longitude: currentGps?.longitude
      });

      if (res.data?.success) {
        toast.warning('Incident reported and dispatched to control desk');
        setShowIncidentModal(false);
        setIncidentDescription('');
        loadTripDetails(selectedTripId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to report incident');
    } finally {
      setSubmittingIncident(false);
    }
  };

  const selectedTrip = assignedTrips.find((t) => t.id === Number(selectedTripId));
  const currentStatus = tripDetails?.tracking_status || selectedTrip?.tracking_status || 'assigned';
  const currentStageIndex = STAGE_FLOW.findIndex((s) => s.key === currentStatus);
  const nextStage = currentStageIndex !== -1 ? STAGE_FLOW[currentStageIndex] : STAGE_FLOW[0];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      {/* Top App Header */}
      <div className="border-b border-slate-800 bg-slate-950 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <p className="text-xs uppercase font-bold tracking-widest text-cyan-400">
                Amana Driver Operations Console
              </p>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">
              {user?.full_name || 'Driver Console'}
            </h1>
          </div>

          {/* Location Streaming Switch */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 self-start sm:self-auto shadow-lg">
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-slate-200">
                {isSharingLocation ? 'Live GPS Broadcasting' : 'Location Sharing Paused'}
              </span>
              <span className="text-[10px] text-slate-400">
                {lastSentAt ? `Last ping: ${lastSentAt.toLocaleTimeString()}` : 'Awaiting start'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSharingLocation(!isSharingLocation)}
              className={`relative inline-flex h-7 w-13 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isSharingLocation ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isSharingLocation ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6">
        {/* GPS Hardware Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl text-xs">
          <div className="flex items-center gap-2.5">
            <FaSatellite className="text-cyan-400 text-base" />
            <div>
              <span className="text-slate-400 block font-medium">GPS Accuracy</span>
              <span className="font-bold text-slate-100">
                {currentGps?.accuracy ? `±${Math.round(currentGps.accuracy)} meters` : 'Acquiring lock...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <FaLocationArrow className="text-emerald-400 text-base" />
            <div>
              <span className="text-slate-400 block font-medium">Current Speed</span>
              <span className="font-bold text-slate-100">
                {currentGps?.speed ? `${currentGps.speed} km/h` : '0 km/h (Parked)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <FaBatteryThreeQuarters className="text-amber-400 text-base" />
            <div>
              <span className="text-slate-400 block font-medium">Battery Status</span>
              <span className="font-bold text-slate-100">
                {batteryLevel !== null ? `${batteryLevel}% Normal` : 'Connected'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <div>
              <span className="text-slate-400 block font-medium">Server Stream</span>
              <span className="font-bold text-slate-100">
                {connected ? 'Socket 100%' : 'HTTP Fallback'}
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Trips Selector */}
        {assignedTrips.length > 1 && (
          <div className="mb-6 flex items-center gap-3 overflow-x-auto pb-2">
            <span className="text-xs font-bold uppercase text-slate-400 whitespace-nowrap">Your Trips:</span>
            {assignedTrips.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTripId(t.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedTripId === t.id
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25 ring-2 ring-cyan-400'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                #{t.id} &middot; {t.service_name} ({t.booking_status})
              </button>
            ))}
          </div>
        )}

        {gpsError && (
          <div className="mb-6 rounded-2xl border border-rose-800 bg-rose-950/60 p-4 text-rose-300 text-xs flex items-center gap-3">
            <FaExclamationTriangle className="text-base text-rose-400 flex-shrink-0" />
            <span>GPS Warning: {gpsError}. Please allow browser location permissions for live tracking.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Console Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Interactive Live Route Map */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-200">Real-Time Navigation & Breadcrumb Trail</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {currentGps?.latitude ? `${currentGps.latitude.toFixed(4)}°, ${currentGps.longitude.toFixed(4)}°` : 'Awaiting GPS'}
                </span>
              </div>

              <TransportationMap
                pickup={tripDetails?.pickup_coordinates}
                destination={tripDetails?.destination_coordinates}
                currentLocation={
                  currentGps
                    ? {
                        latitude: currentGps.latitude,
                        longitude: currentGps.longitude,
                        heading: currentGps.heading,
                        speed: currentGps.speed,
                        is_fresh: true
                      }
                    : tripDetails?.current_location
                }
                breadcrumbTrail={tripDetails?.breadcrumb_trail || []}
                vehicleType={tripDetails?.driver?.vehicle_type || 'truck'}
                height="380px"
              />
            </div>

            {/* Turn-by-Turn External Navigation Links */}
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  tripDetails?.pickup_address || ''
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 text-xs font-bold transition-colors"
              >
                <FaExternalLinkAlt />
                <span>Navigate to Pickup (Google Maps)</span>
              </a>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  tripDetails?.destination_address || ''
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 text-xs font-bold transition-colors"
              >
                <FaExternalLinkAlt />
                <span>Navigate to Destination</span>
              </a>
            </div>

            {/* Workflow Action Command Box */}
            <div className="rounded-3xl border border-cyan-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-cyan-400">Current Trip Stage</span>
                  <h3 className="text-2xl font-black text-white capitalize mt-0.5">
                    {currentStatus.replace(/_/g, ' ')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(true)}
                  className="rounded-xl border border-amber-600/70 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FaExclamationTriangle />
                  <span>Report Incident</span>
                </button>
              </div>

              {/* Big Workflow Button */}
              {nextStage && currentStatus !== 'completed' && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => handleStageTransition(nextStage.next)}
                    className="w-full rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-base md:text-lg font-black py-4 shadow-xl shadow-cyan-500/25 transition-all transform active:scale-[0.99] cursor-pointer flex items-center justify-center gap-3"
                  >
                    <FaCheckCircle className="text-xl" />
                    <span>{nextStage.label}</span>
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Advancing will notify the tenant and update central logistics dispatch in real time.
                  </p>
                </div>
              )}

              {currentStatus === 'completed' && (
                <div className="mt-6 rounded-2xl bg-emerald-950/60 border border-emerald-800 p-4 text-center text-emerald-300">
                  <FaCheckCircle className="mx-auto text-2xl mb-1 text-emerald-400" />
                  <p className="font-bold text-base">Trip Successfully Completed</p>
                  <p className="text-xs text-emerald-400/80 mt-1">
                    Proof of delivery has been sealed and customer notified.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Manifest Sidebar */}
          <div className="space-y-6">
            {/* Customer Details Card */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">
                Customer & Cargo Manifest
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Customer Name</span>
                  <span className="font-bold text-sm text-slate-100">{selectedTrip?.tenant_name || 'Customer'}</span>
                </div>

                {selectedTrip?.tenant_phone && (
                  <div>
                    <span className="text-slate-400 block font-medium">Phone Number</span>
                    <a
                      href={`tel:${selectedTrip.tenant_phone}`}
                      className="mt-1 inline-flex items-center gap-2 rounded-xl bg-cyan-600/20 text-cyan-300 border border-cyan-700/50 px-3 py-2 font-bold hover:bg-cyan-600/30 transition-colors"
                    >
                      <FaPhoneAlt size={11} />
                      <span>{selectedTrip.tenant_phone}</span>
                    </a>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-3">
                  <span className="text-slate-400 block font-medium flex items-center gap-1.5 text-emerald-400">
                    <FaMapMarkerAlt /> Pickup Location
                  </span>
                  <p className="mt-1 text-slate-200 leading-relaxed font-semibold">
                    {selectedTrip?.pickup_address}
                  </p>
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <span className="text-slate-400 block font-medium flex items-center gap-1.5 text-rose-400">
                    <FaFlagCheckered /> Destination Location
                  </span>
                  <p className="mt-1 text-slate-200 leading-relaxed font-semibold">
                    {selectedTrip?.destination_address}
                  </p>
                </div>

                {selectedTrip?.items_description && (
                  <div className="border-t border-slate-800 pt-3">
                    <span className="text-slate-400 block font-medium">Cargo Description</span>
                    <p className="mt-1 text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      {selectedTrip.items_description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Proof of Service Thumbnails */}
            {(tripDetails?.proofs?.pickup_proof_url || tripDetails?.proofs?.dropoff_proof_url) && (
              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
                <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">
                  Verified Trip Proofs
                </h3>
                <div className="space-y-3">
                  {tripDetails.proofs.pickup_proof_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 p-2">
                      <img
                        src={tripDetails.proofs.pickup_proof_url}
                        alt="Pickup"
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <span className="text-[11px] font-bold text-emerald-400 mt-1 block">
                        ✓ Pickup Loading Proof Verified
                      </span>
                    </div>
                  )}

                  {tripDetails.proofs.dropoff_proof_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 p-2">
                      <img
                        src={tripDetails.proofs.dropoff_proof_url}
                        alt="Dropoff"
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <span className="text-[11px] font-bold text-emerald-400 mt-1 block">
                        ✓ Delivery Drop-off Proof Verified
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Proof Photo Upload Modal */}
      {showProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FaCamera className="text-cyan-400" />
              <span>
                {proofType === 'pickup_confirmed' ? 'Confirm Cargo Pickup' : 'Confirm Delivery Drop-off'}
              </span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Upload a photograph of the goods loaded in the vehicle or safely delivered at the destination.
            </p>

            <form onSubmit={submitProof} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Photo Proof Image URL (or Camera snapshot)
                </label>
                <input
                  type="text"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://... (or leave blank for automatic camera link)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Driver Notes / Condition of Goods
                </label>
                <textarea
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  rows={3}
                  placeholder="Describe goods status, condition, or tenant inspection comments..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProofModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProof}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
                >
                  {submittingProof ? 'Uploading...' : 'Confirm & Proceed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Incident Reporting Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
              <FaExclamationTriangle />
              <span>Report Operational Incident</span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Immediately dispatchers and customer will be notified of delay or vehicle difficulty.
            </p>

            <form onSubmit={submitIncident} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Incident Type</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="traffic_delay">Heavy Traffic Congestion</option>
                  <option value="breakdown">Vehicle Breakdown / Engine Issue</option>
                  <option value="flat_tyre">Flat Tyre / Puncture</option>
                  <option value="accident">Traffic Accident</option>
                  <option value="road_block">Police / Military Roadblock</option>
                  <option value="weather">Severe Weather / Flooding</option>
                  <option value="other">Other Operational Difficulty</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Severity</label>
                <div className="grid grid-cols-4 gap-2">
                  {['low', 'medium', 'high', 'critical'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setIncidentSeverity(s)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                        incidentSeverity === s
                          ? s === 'critical'
                            ? 'bg-rose-600 text-white'
                            : s === 'high'
                            ? 'bg-amber-600 text-white'
                            : 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Detailed Explanation
                </label>
                <textarea
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  required
                  rows={3}
                  placeholder="Describe location, cause of delay, and estimated resolution..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIncident}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
                >
                  {submittingIncident ? 'Reporting...' : 'Dispatch Incident Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverTripConsole;
