import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import BackToDashboard from '../../components/common/BackToDashboard';
import FumigationMap from '../../components/fumigation/FumigationMap';
import {
  FaSprayCan,
  FaMapMarkerAlt,
  FaLocationArrow,
  FaPhoneAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaVial,
  FaCamera,
  FaClock,
  FaCalendarAlt,
  FaUserCheck,
  FaSyncAlt,
  FaShieldAlt,
  FaPaperPlane
} from 'react-icons/fa';

const FumigationTeamConsole = () => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [assignedJobs, setAssignedJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTripManifest, setActiveTripManifest] = useState(null);

  // GPS Tracking State
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const watchIdRef = useRef(null);

  // Service Completion Form
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [chemicalName, setChemicalName] = useState('Cypermethrin 10% EC');
  const [nafdacNumber, setNafdacNumber] = useState('04-2218');
  const [applicationMethod, setApplicationMethod] = useState('Thermal Fogging & Residual Spray');
  const [ventilationHours, setVentilationHours] = useState(4.0);
  const [safetyInstructions, setSafetyInstructions] = useState('Keep windows open. No entry for 4 hours. Wash surfaces before use.');
  const [beforePhotoUrl, setBeforePhotoUrl] = useState('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState(null);

  // Incident Modal
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState('traffic_delay');
  const [incidentSeverity, setIncidentSeverity] = useState('medium');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [reportingIncident, setReportingIncident] = useState(false);

  // Fetch assigned jobs
  const fetchAssignedJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/fumigation/team/assigned');
      if (res.data?.success && res.data?.data) {
        setAssignedJobs(res.data.data);
        if (!selectedJob && res.data.data.length > 0) {
          setSelectedJob(res.data.data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch assigned fumigation jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedJob]);

  useEffect(() => {
    fetchAssignedJobs();
  }, [fetchAssignedJobs]);

  // Load manifest for selected job
  const loadJobManifest = useCallback(async (jobId) => {
    if (!jobId) return;
    try {
      const res = await api.get(`/fumigation/team/jobs/${jobId}`);
      if (res.data?.success && res.data?.data) {
        setActiveTripManifest(res.data.data);
      }
    } catch (e) {
      console.error('Failed to load job manifest:', e);
    }
  }, []);

  useEffect(() => {
    if (selectedJob?.id) {
      loadJobManifest(selectedJob.id);
    }
  }, [selectedJob?.id, loadJobManifest]);

  // Send single GPS ping to server
  const sendLocationPing = useCallback(
    async (pos) => {
      if (!selectedJob?.id) return;
      const { latitude, longitude, accuracy, heading, speed, altitude } = pos.coords;

      setCurrentCoords({ latitude, longitude, heading, speed, accuracy });
      setLastPingTime(new Date());

      // 1. Send via WebSocket if connected
      if (socket && connected) {
        socket.emit('fumigation:team_location', {
          bookingId: selectedJob.id,
          latitude,
          longitude,
          accuracy,
          heading: heading || 0,
          speed: speed ? Math.round(speed * 3.6) : 0, // convert m/s to km/h
          altitude
        });
      }

      // 2. HTTP backup ping
      try {
        await api.post(`/fumigation/team/jobs/${selectedJob.id}/ping`, {
          latitude,
          longitude,
          accuracy,
          heading: heading || 0,
          speed: speed ? Math.round(speed * 3.6) : 0
        });
      } catch (err) {
        console.warn('HTTP GPS ping failed:', err.message);
      }
    },
    [selectedJob?.id, socket, connected]
  );

  // Toggle Live GPS Sharing
  const toggleLocationSharing = () => {
    if (isSharingLocation) {
      // Stop GPS watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsSharingLocation(false);
    } else {
      // Start GPS watch
      if (!navigator.geolocation) {
        setGpsError('Geolocation is not supported by your browser or device.');
        return;
      }

      setGpsError(null);
      setIsSharingLocation(true);

      const id = navigator.geolocation.watchPosition(
        (pos) => {
          sendLocationPing(pos);
        },
        (err) => {
          console.error('Geolocation watch error:', err);
          setGpsError(`GPS Error: ${err.message}. Ensure location permissions are granted.`);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000
        }
      );

      watchIdRef.current = id;
    }
  };

  // Cleanup GPS on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Update Status handler
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedJob?.id) return;

    if (newStatus === 'service_completed') {
      setShowCompletionModal(true);
      return;
    }

    try {
      const res = await api.post(`/fumigation/team/jobs/${selectedJob.id}/status`, {
        status: newStatus
      });
      if (res.data?.success) {
        loadJobManifest(selectedJob.id);
        fetchAssignedJobs();
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Status update failed');
    }
  };

  // Submit Completion with Mandatory Records
  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    setCompletionError(null);

    if (!chemicalName.trim()) {
      setCompletionError('Chemical name is mandatory for completion.');
      return;
    }

    setCompleting(true);
    try {
      const beforeArr = beforePhotoUrl.trim() ? [beforePhotoUrl.trim()] : ['https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=500&auto=format&fit=crop&q=60'];
      const afterArr = afterPhotoUrl.trim() ? [afterPhotoUrl.trim()] : ['https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500&auto=format&fit=crop&q=60'];

      // Submit formal service report & complete status
      const res = await api.post(`/fumigation/team/jobs/${selectedJob.id}/status`, {
        status: 'service_completed',
        chemical_used: `${chemicalName.trim()} (NAFDAC Reg: ${nafdacNumber.trim()})`,
        ventilation_hours: Number(ventilationHours) || 4.0,
        safety_instructions: safetyInstructions.trim(),
        after_photos: afterArr,
        before_photos: beforeArr,
        proof_url: afterArr[0]
      });

      if (res.data?.success) {
        setShowCompletionModal(false);
        // Stop location sharing upon completion
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setIsSharingLocation(false);
        }
        loadJobManifest(selectedJob.id);
        fetchAssignedJobs();
      }
    } catch (err) {
      setCompletionError(err.response?.data?.message || err.message || 'Completion failed');
    } finally {
      setCompleting(false);
    }
  };

  // Submit Operational Incident
  const handleSubmitIncident = async (e) => {
    e.preventDefault();
    if (!incidentDesc.trim() || !selectedJob?.id) return;

    setReportingIncident(true);
    try {
      const res = await api.post(`/fumigation/team/jobs/${selectedJob.id}/incidents`, {
        incident_type: incidentType,
        severity: incidentSeverity,
        description: incidentDesc.trim(),
        latitude: currentCoords?.latitude,
        longitude: currentCoords?.longitude
      });
      if (res.data?.success) {
        setShowIncidentModal(false);
        setIncidentDesc('');
        loadJobManifest(selectedJob.id);
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to report incident');
    } finally {
      setReportingIncident(false);
    }
  };

  const currentStatus = activeTripManifest?.progress?.current_status || selectedJob?.tracking_status || 'unassigned';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-600 rounded-lg text-white">
                <FaSprayCan size={18} />
              </span>
              <div>
                <h1 className="text-xl font-bold text-white">Fumigation Specialist Console</h1>
                <p className="text-xs text-slate-400">
                  Certified Team Portal · Authenticated as <strong>{user?.full_name || user?.email}</strong>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BackToDashboard />
            <button
              onClick={fetchAssignedJobs}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              title="Refresh jobs"
            >
              <FaSyncAlt className={loading ? 'animate-spin' : ''} size={14} />
            </button>
          </div>
        </div>

        {/* Assigned Jobs Selector */}
        {assignedJobs.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {assignedJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJob(job)}
                className={`px-4 py-2.5 rounded-lg text-left text-xs shrink-0 transition-all border ${
                  selectedJob?.id === job.id
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md font-bold'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
              >
                <div>ARH-FC-{String(job.id).padStart(6, '0')}</div>
                <div className="truncate max-w-[180px] font-medium opacity-90">{job.property_address || 'Property'}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-slate-800/80 rounded-xl p-8 text-center border border-slate-700">
            <FaSprayCan className="mx-auto text-slate-500 text-3xl mb-2" />
            <h3 className="font-semibold text-slate-300">No active fumigation assignments</h3>
            <p className="text-xs text-slate-400 mt-1">You will receive assignments from your jurisdictional fumigation administrator.</p>
          </div>
        )}

        {selectedJob && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Live Map & Trip Manifest */}
            <div className="lg:col-span-2 space-y-6">
              {/* Live Map */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FaLocationArrow className="text-emerald-400" />
                    Property Navigation &amp; Live GPS Telemetry
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 rounded-full ${isSharingLocation ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                    <span className="text-slate-300">{isSharingLocation ? 'GPS Broadcast Active' : 'GPS Standby'}</span>
                  </div>
                </div>

                <FumigationMap
                  propertyDestination={activeTripManifest?.telemetry?.property_destination}
                  teamLocation={currentCoords || activeTripManifest?.telemetry?.current_location}
                  breadcrumbTrail={activeTripManifest?.telemetry?.breadcrumb_pings || []}
                  height="380px"
                />

                {/* GPS Status Bar & Error message */}
                {gpsError && (
                  <div className="mt-3 p-2 bg-red-900/60 border border-red-700 text-red-200 text-xs rounded">
                    {gpsError}
                  </div>
                )}

                {lastPingTime && (
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Last Ping Sent: {lastPingTime.toLocaleTimeString()}</span>
                    <span>Coordinates: {currentCoords?.latitude.toFixed(5)}, {currentCoords?.longitude.toFixed(5)}</span>
                  </div>
                )}
              </div>

              {/* Property & Customer Contact Card */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Service Destination</h4>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-lg border border-slate-750">
                  <div>
                    <h5 className="font-bold text-white text-sm">{selectedJob.property_title || 'Client Residence'}</h5>
                    <p className="text-xs text-slate-300 mt-0.5">{selectedJob.property_address}</p>
                    <p className="text-[11px] text-slate-400">{selectedJob.property_lga}, {selectedJob.property_state}</p>
                  </div>
                  {selectedJob.tenant_phone && (
                    <a
                      href={`tel:${selectedJob.tenant_phone}`}
                      className="inline-flex items-center gap-2 bg-slate-750 hover:bg-slate-700 text-emerald-400 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-600 transition-colors shrink-0"
                    >
                      <FaPhoneAlt size={11} />
                      Call Customer ({selectedJob.tenant_name || 'Tenant'})
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right 1 Col: Specialist Operational Controls */}
            <div className="space-y-6">
              {/* GPS Location Sharing Toggle Button */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Telemetry Control</h4>
                <button
                  type="button"
                  onClick={toggleLocationSharing}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all ${
                    isSharingLocation
                      ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <FaLocationArrow />
                  {isSharingLocation ? 'Stop Sharing GPS' : 'Start Sharing Live GPS'}
                </button>
                <p className="text-[11px] text-slate-400 mt-2 text-center">
                  Share real device GPS with tenant and supervisor while in transit.
                </p>
              </div>

              {/* Status Progression Sequence */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Operational Progression</h4>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('team_acknowledged')}
                    disabled={currentStatus !== 'unassigned' && currentStatus !== 'assigned'}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-left flex items-center justify-between bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-650 disabled:opacity-40"
                  >
                    <span>1. Acknowledge Assignment</span>
                    {currentStatus !== 'unassigned' && currentStatus !== 'assigned' && <FaCheckCircle className="text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('dispatched_travelling')}
                    disabled={currentStatus === 'dispatched_travelling' || ['arrived_on_site', 'inspection_active', 'chemical_treatment_active', 'treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus)}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-left flex items-center justify-between bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-650 disabled:opacity-40"
                  >
                    <span>2. Depart / En Route to Site</span>
                    {['arrived_on_site', 'inspection_active', 'chemical_treatment_active', 'treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus) && <FaCheckCircle className="text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('arrived_on_site')}
                    disabled={currentStatus === 'arrived_on_site' || ['inspection_active', 'chemical_treatment_active', 'treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus)}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-left flex items-center justify-between bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-650 disabled:opacity-40"
                  >
                    <span>3. Arrived at Property</span>
                    {['inspection_active', 'chemical_treatment_active', 'treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus) && <FaCheckCircle className="text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('chemical_treatment_active')}
                    disabled={currentStatus === 'chemical_treatment_active' || ['treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus)}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-left flex items-center justify-between bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-650 disabled:opacity-40"
                  >
                    <span>4. Commence Chemical Application</span>
                    {['treatment_completed', 'ventilation_period', 'service_completed'].includes(currentStatus) && <FaCheckCircle className="text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('ventilation_period')}
                    disabled={currentStatus === 'ventilation_period' || currentStatus === 'service_completed'}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold text-left flex items-center justify-between bg-slate-750 hover:bg-slate-700 text-slate-200 border border-slate-650 disabled:opacity-40"
                  >
                    <span>5. Activate Ventilation Countdown</span>
                    {currentStatus === 'service_completed' && <FaCheckCircle className="text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCompletionModal(true)}
                    className="w-full py-3 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors flex items-center justify-center gap-1.5"
                  >
                    <FaCheckCircle /> Complete &amp; File Service Record
                  </button>
                </div>
              </div>

              {/* Exception & Delay Reporting */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Operational Incident</h4>
                <p className="text-xs text-slate-400 mb-3">Encountered heavy traffic, locked premises, or weather delays?</p>
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(true)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-750 hover:bg-slate-700 text-amber-300 border border-amber-600/30 flex items-center justify-center gap-2"
                >
                  <FaExclamationTriangle /> Report Incident / Delay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Completion Modal */}
        {showCompletionModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl max-w-lg w-full p-6 border border-slate-700 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <FaShieldAlt className="text-emerald-400" />
                  Service Completion &amp; Chemical Clearance
                </h3>
                <button onClick={() => setShowCompletionModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              {completionError && (
                <div className="p-2.5 bg-red-900/60 border border-red-700 text-red-200 text-xs rounded">
                  {completionError}
                </div>
              )}

              <form onSubmit={handleConfirmCompletion} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Chemical Formulation Used *</label>
                  <input
                    type="text"
                    required
                    value={chemicalName}
                    onChange={(e) => setChemicalName(e.target.value)}
                    placeholder="e.g. Cypermethrin 10% EC"
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">NAFDAC Reg. Number</label>
                    <input
                      type="text"
                      value={nafdacNumber}
                      onChange={(e) => setNafdacNumber(e.target.value)}
                      placeholder="e.g. 04-2218"
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Required Ventilation (Hours) *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="48"
                      required
                      value={ventilationHours}
                      onChange={(e) => setVentilationHours(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Application Method</label>
                  <input
                    type="text"
                    value={applicationMethod}
                    onChange={(e) => setApplicationMethod(e.target.value)}
                    placeholder="e.g. Thermal Fogging & Cold Misting"
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Post-Treatment Verification Photo URL *</label>
                  <input
                    type="url"
                    value={afterPhotoUrl}
                    onChange={(e) => setAfterPhotoUrl(e.target.value)}
                    placeholder="https://... photo link (or leave blank for sample photo)"
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Safety &amp; Re-entry Instructions</label>
                  <textarea
                    rows="2"
                    value={safetyInstructions}
                    onChange={(e) => setSafetyInstructions(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowCompletionModal(false)}
                    className="py-2 px-4 rounded-lg text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={completing}
                    className="py-2 px-5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow"
                  >
                    {completing ? 'Filing Record...' : 'Confirm Completion'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Incident Reporting Modal */}
        {showIncidentModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <h3 className="font-bold text-amber-400 text-base flex items-center gap-2">
                  <FaExclamationTriangle />
                  Report Exception / Operational Delay
                </h3>
                <button onClick={() => setShowIncidentModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleSubmitIncident} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Incident Type</label>
                  <select
                    value={incidentType}
                    onChange={(e) => setIncidentType(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none"
                  >
                    <option value="traffic_delay">Severe Traffic Delay</option>
                    <option value="locked_premises">Property Locked / Tenant Unavailable</option>
                    <option value="adverse_weather">Adverse Weather / Rain</option>
                    <option value="equipment_issue">Equipment Malfunction</option>
                    <option value="chemical_leak">Safety Precaution / Chemical Leak</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Severity</label>
                  <select
                    value={incidentSeverity}
                    onChange={(e) => setIncidentSeverity(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none"
                  >
                    <option value="low">Low - Minor Delay</option>
                    <option value="medium">Medium - Action Required</option>
                    <option value="high">High - Rescheduling May Be Required</option>
                    <option value="critical">Critical - Safety Hazard</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Description *</label>
                  <textarea
                    rows="3"
                    required
                    value={incidentDesc}
                    onChange={(e) => setIncidentDesc(e.target.value)}
                    placeholder="Explain the reason for delay or exception..."
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white outline-none"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowIncidentModal(false)}
                    className="py-2 px-4 rounded-lg text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportingIncident || !incidentDesc.trim()}
                    className="py-2 px-5 rounded-lg font-bold bg-amber-600 hover:bg-amber-500 text-white shadow"
                  >
                    {reportingIncident ? 'Filing Incident...' : 'Submit Incident Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FumigationTeamConsole;
