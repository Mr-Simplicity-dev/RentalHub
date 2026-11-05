import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import FumigationMap from './FumigationMap';
import {
  FaSprayCan,
  FaPhoneAlt,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaShieldAlt,
  FaCamera,
  FaSyncAlt,
  FaUserCircle,
  FaHourglassHalf,
  FaVial,
  FaCheck,
  FaExclamationCircle,
  FaFileContract,
  FaStar,
  FaTimes
} from 'react-icons/fa';

const FUMIGATION_STAGES = [
  { key: 'unassigned', label: 'Booking Confirmed', desc: 'Awaiting team assignment' },
  { key: 'assigned', label: 'Team Assigned', desc: 'Certified specialist assigned' },
  { key: 'team_acknowledged', label: 'Acknowledged', desc: 'Specialist accepted service request' },
  { key: 'dispatched_travelling', label: 'En Route', desc: 'Team travelling with GPS active' },
  { key: 'arrived_on_site', label: 'Arrived at Site', desc: 'Specialist on property grounds' },
  { key: 'inspection_active', label: 'Safety Inspection', desc: 'Evaluating infestation & sealing access' },
  { key: 'chemical_treatment_active', label: 'Treatment Active', desc: 'Chemical application in progress' },
  { key: 'treatment_completed', label: 'Application Done', desc: 'Chemical dispersal complete' },
  { key: 'ventilation_period', label: 'Ventilation Phase', desc: 'Safe evacuation countdown active' },
  { key: 'service_completed', label: 'Service Certified', desc: 'Safety cleared & report filed' }
];

const FumigationLiveTracker = ({ bookingId, initialData = null }) => {
  const { socket, connected } = useSocket();
  const [trackingData, setTrackingData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activePhotoModal, setActivePhotoModal] = useState(null);
  const [showSignoffModal, setShowSignoffModal] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Signoff form state
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [problemDescription, setProblemDescription] = useState('');

  // Countdown timer for re-entry
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, isSafe: false });

  // Fetch full tracking manifest via HTTP
  const fetchTracking = useCallback(async (isSilent = false) => {
    if (!bookingId) return;
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get(`/fumigation-cleaning/bookings/${bookingId}/tracking`);
      if (res.data?.success && res.data?.data) {
        setTrackingData(res.data.data);
        setError(null);
      }
    } catch (err) {
      if (!isSilent) {
        console.error('Failed to fetch fumigation tracking data:', err);
        setError('Live telemetry temporarily unavailable. Retrying...');
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

    // Join fumigation room
    socket.emit('fumigation:join_booking', { bookingId });

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

        const breadcrumbs = [
          ...(prev.telemetry?.breadcrumb_pings || []),
          {
            lat: payload.latitude,
            lng: payload.longitude,
            heading: payload.heading,
            speed: payload.speed,
            recorded_at: payload.recorded_at
          }
        ];

        return {
          ...prev,
          telemetry: {
            ...prev.telemetry,
            current_location: newLocation,
            distance_remaining_km: payload.distance_remaining_km ?? prev.telemetry?.distance_remaining_km,
            eta_arrival_minutes: payload.eta_arrival_minutes ?? prev.telemetry?.eta_arrival_minutes,
            breadcrumb_pings: breadcrumbs
          }
        };
      });
    };

    // Handle real-time status update
    const handleStatusUpdate = (payload) => {
      if (Number(payload.booking_id) !== Number(bookingId)) return;
      setTrackingData((prev) => {
        if (!prev) return prev;
        const currentStageIndex = FUMIGATION_STAGES.findIndex((s) => s.key === payload.tracking_status);
        return {
          ...prev,
          booking: {
            ...prev.booking,
            booking_status: payload.booking_status
          },
          progress: {
            ...prev.progress,
            current_status: payload.tracking_status,
            current_stage_index: currentStageIndex >= 0 ? currentStageIndex : prev.progress?.current_stage_index
          },
          safety_and_compliance: {
            ...prev.safety_and_compliance,
            chemical_used: payload.chemical_used || prev.safety_and_compliance?.chemical_used,
            ventilation_hours_required: payload.ventilation_hours_required || prev.safety_and_compliance?.ventilation_hours_required,
            reentry_permitted_at: payload.reentry_permitted_at || prev.safety_and_compliance?.reentry_permitted_at
          }
        };
      });
    };

    // Handle tenant signoff
    const handleTenantSignoff = (payload) => {
      if (Number(payload.booking_id) !== Number(bookingId)) return;
      setTrackingData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          signoff: {
            ...prev.signoff,
            tenant_confirmed_at: payload.tenant_confirmed_at,
            tenant_problem_reported: payload.problem_reported,
            tenant_problem_description: payload.problem_description
          }
        };
      });
    };

    socket.on('fumigation:location_update', handleLocationUpdate);
    socket.on('fumigation:status_update', handleStatusUpdate);
    socket.on('fumigation:tenant_signoff', handleTenantSignoff);

    return () => {
      socket.emit('fumigation:leave_booking', { bookingId });
      socket.off('fumigation:location_update', handleLocationUpdate);
      socket.off('fumigation:status_update', handleStatusUpdate);
      socket.off('fumigation:tenant_signoff', handleTenantSignoff);
    };
  }, [socket, bookingId]);

  // Live countdown timer for safe property re-entry
  useEffect(() => {
    const targetTime = trackingData?.safety_and_compliance?.reentry_permitted_at;
    if (!targetTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diffMs = target - now;

      if (diffMs <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isSafe: true });
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({ hours, minutes, seconds, isSafe: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [trackingData?.safety_and_compliance?.reentry_permitted_at]);

  // Submit completion signoff
  const handleSubmitSignoff = async () => {
    setSubmittingFeedback(true);
    try {
      const res = await api.post(`/fumigation-cleaning/bookings/${bookingId}/signoff`, {
        rating,
        feedback: feedbackText,
        problem_reported: false
      });
      if (res.data?.success) {
        setShowSignoffModal(false);
        fetchTracking(true);
      }
    } catch (err) {
      console.error('Signoff error:', err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Submit issue / problem report
  const handleSubmitProblem = async () => {
    if (!problemDescription.trim()) return;
    setSubmittingFeedback(true);
    try {
      const res = await api.post(`/fumigation-cleaning/bookings/${bookingId}/signoff`, {
        problem_reported: true,
        problem_description: problemDescription
      });
      if (res.data?.success) {
        setShowProblemModal(false);
        fetchTracking(true);
      }
    } catch (err) {
      console.error('Problem report error:', err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading && !trackingData) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
        <FaSprayCan className="mx-auto text-emerald-600 animate-bounce mb-3 text-3xl" />
        <h3 className="text-base font-semibold text-slate-800">Connecting to Fumigation Tracking Centre</h3>
        <p className="text-xs text-slate-500 mt-1">Acquiring live telemetry and safety compliance records...</p>
      </div>
    );
  }

  const { booking, team, telemetry, progress, safety_and_compliance, evidence, signoff } = trackingData || {};
  const isEnRoute = progress?.current_status === 'dispatched_travelling';
  const isTreatmentActive = progress?.current_status === 'chemical_treatment_active';
  const isVentilationActive = progress?.current_status === 'ventilation_period';
  const isCompleted = progress?.current_status === 'service_completed' || booking?.booking_status === 'completed';

  return (
    <div className="space-y-6">
      {/* Top Telemetry Header & Freshness Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <FaSprayCan size={11} />
                Live Fumigation Tracking
              </span>
              <span className="text-slate-400 text-xs font-mono">{booking?.reference}</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              {booking?.service_name || 'Professional Fumigation & Pest Extermination'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-300 mt-1">
              <FaMapMarkerAlt className="text-emerald-400 shrink-0" />
              <span className="truncate">{booking?.property_address || 'Property Destination'}</span>
            </div>
          </div>

          {/* Quick Metrics (ETA, Distance, Telemetry Status) */}
          <div className="flex items-center gap-4 bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            {isEnRoute ? (
              <>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Arrival</p>
                  <p className="text-lg font-extrabold text-emerald-400">
                    {telemetry?.eta_arrival_minutes ? `${telemetry.eta_arrival_minutes} mins` : 'Arriving soon'}
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-700" />
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Distance</p>
                  <p className="text-lg font-bold text-slate-200">
                    {telemetry?.distance_remaining_km ? `${telemetry.distance_remaining_km} km` : 'Near property'}
                  </p>
                </div>
              </>
            ) : isVentilationActive || safety_and_compliance?.reentry_permitted_at ? (
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
                  <FaHourglassHalf size={10} />
                  Safe Re-entry In
                </p>
                <p className="text-lg font-mono font-bold text-white">
                  {timeLeft.isSafe ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <FaCheck size={12} /> Safe to Enter
                    </span>
                  ) : (
                    `${String(timeLeft.hours).padStart(2, '0')}:${String(timeLeft.minutes).padStart(2, '0')}:${String(timeLeft.seconds).padStart(2, '0')}`
                  )}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Service Status</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {FUMIGATION_STAGES.find((s) => s.key === progress?.current_status)?.label || 'In Progress'}
                </p>
              </div>
            )}

            <button
              onClick={() => fetchTracking(false)}
              disabled={refreshing}
              title="Refresh telemetry"
              className="p-2 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors"
            >
              <FaSyncAlt className={refreshing ? 'animate-spin' : ''} size={14} />
            </button>
          </div>
        </div>

        {/* Telemetry freshness strip */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{connected ? 'Real-time WebSocket Active' : 'Polling Sync Active'}</span>
            <span className="text-slate-600">·</span>
            {telemetry?.current_location?.is_fresh && (
              <span className="text-emerald-400 font-medium">GPS Signal Live (&lt;1m)</span>
            )}
            {telemetry?.current_location?.is_stale && (
              <span className="text-amber-400">Signal Stale ({telemetry?.current_location?.seconds_ago}s ago)</span>
            )}
            {telemetry?.current_location?.is_offline && (
              <span className="text-slate-400">Last GPS update: {telemetry?.current_location?.last_location_at ? new Date(telemetry.current_location.last_location_at).toLocaleTimeString() : 'N/A'}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Scheduled: <strong>{booking?.booking_date}</strong> at <strong>{booking?.booking_time}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Map + Assigned Specialist Team Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Live Map (2 cols) */}
        <div className="lg:col-span-2">
          <FumigationMap
            propertyDestination={telemetry?.property_destination}
            teamLocation={telemetry?.current_location}
            breadcrumbTrail={telemetry?.breadcrumb_pings || []}
            height="440px"
          />
        </div>

        {/* Team Details & Direct Communication (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Assigned Squad</span>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                <FaShieldAlt size={10} /> Certified
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                {team?.name ? team.name.charAt(0) : <FaUserCircle size={28} />}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">{team?.name || 'Amana Certified Fumigation Squad'}</h4>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <FaStar className="text-amber-400" size={10} />
                  <span>4.9 (Verified Professional)</span>
                </div>
              </div>
            </div>

            {/* Specialist & Vehicle Details */}
            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Service Vehicle:</span>
                <span className="font-semibold text-slate-800">{team?.vehicle_plate || 'ARH-FUM-01'} ({team?.vehicle_type || 'Van'})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Safety License:</span>
                <span className="font-mono font-medium text-slate-700">{team?.license_number || 'FUM-NG-2026-9921'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Equipment Carried:</span>
                <span className="text-slate-700 text-right truncate max-w-[180px]">{team?.equipment || 'Thermal Fogger & Respirators'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer Support:</span>
                <span className="text-slate-700">Amana 24/7 Verified</span>
              </div>
            </div>
          </div>

          {/* Contact Action */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            {team?.phone ? (
              <a
                href={`tel:${team.phone}`}
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm"
              >
                <FaPhoneAlt size={12} />
                Call Fumigation Specialist
              </a>
            ) : (
              <button
                disabled
                className="w-full bg-slate-100 text-slate-400 font-medium py-2.5 px-4 rounded-lg text-sm cursor-not-allowed"
              >
                Contact Details Available on Dispatch
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Safety & Chemical Disclosure Card with Live Re-Entry Countdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FaVial className="text-emerald-600" />
              Safety Instructions &amp; Safe Re-Entry Protocol
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chemical disclosure and ventilation clearance according to public health guidelines
            </p>
          </div>

          {/* Countdown Pill Box */}
          <div className={`px-4 py-2 rounded-lg border ${timeLeft.isSafe ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider">
              {timeLeft.isSafe ? 'Property Cleared' : 'Mandatory Ventilation Remaining'}
            </div>
            <div className="text-xl font-mono font-extrabold">
              {timeLeft.isSafe ? (
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <FaCheckCircle size={16} /> SAFE TO RE-ENTER PREMISES
                </span>
              ) : (
                `${String(timeLeft.hours).padStart(2, '0')}h : ${String(timeLeft.minutes).padStart(2, '0')}m : ${String(timeLeft.seconds).padStart(2, '0')}s`
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chemical Details */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Applied Formulation</h4>
            <div className="space-y-1.5 text-xs text-slate-700">
              <p><strong>Chemical:</strong> {safety_and_compliance?.chemical_used}</p>
              <p><strong>Registration:</strong> {safety_and_compliance?.chemical_registration_number}</p>
              <p><strong>Application:</strong> {safety_and_compliance?.application_method}</p>
              <p><strong>Ventilation Required:</strong> {safety_and_compliance?.ventilation_hours_required} hours</p>
            </div>
          </div>

          {/* Step-by-Step Re-entry Guidelines */}
          <div className="md:col-span-2 space-y-2 text-xs text-slate-700">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Mandatory Precautions</h4>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-600">
              <li>Do not enter the property before the ventilation timer reaches zero.</li>
              <li>Upon first entering, open all exterior windows and doors for at least 30 minutes to facilitate continuous cross-ventilation.</li>
              <li>Wipe down kitchen countertops, food preparation areas, and dining surfaces with soapy water before preparing food.</li>
              <li>Keep domestic pets and potted plants outdoors until the full ventilation clearance has concluded.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Chronological Service Progress Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <FaClock className="text-emerald-600" />
          Chronological Service Progress Timeline
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {FUMIGATION_STAGES.map((stage, idx) => {
            const currentIdx = progress?.current_stage_index ?? 0;
            const isStageDone = currentIdx > idx;
            const isStageCurrent = currentIdx === idx;

            return (
              <div key={stage.key} className="relative flex items-start gap-3">
                <div
                  className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                    isStageDone
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : isStageCurrent
                      ? 'bg-white border-emerald-600 text-emerald-600 animate-pulse'
                      : 'bg-white border-slate-300 text-slate-300'
                  }`}
                >
                  {isStageDone ? <FaCheck size={8} /> : idx + 1}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isStageCurrent ? 'text-emerald-700' : isStageDone ? 'text-slate-800' : 'text-slate-400'}`}>
                      {stage.label}
                    </span>
                    {isStageCurrent && (
                      <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Active Stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{stage.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Before & After Service Evidence Gallery */}
      {(evidence?.before_photos?.length > 0 || evidence?.after_photos?.length > 0 || evidence?.service_report_url) && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FaCamera className="text-emerald-600" />
            Service Evidence &amp; Completion Gallery
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before Photos */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Before Treatment</h4>
              {evidence?.before_photos?.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {evidence.before_photos.map((url, i) => (
                    <img
                      key={`before-${i}`}
                      src={url}
                      alt="Before treatment"
                      onClick={() => setActivePhotoModal(url)}
                      className="w-full h-32 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No pre-inspection photos uploaded yet.</p>
              )}
            </div>

            {/* After Photos */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Post-Treatment Verification</h4>
              {evidence?.after_photos?.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {evidence.after_photos.map((url, i) => (
                    <img
                      key={`after-${i}`}
                      src={url}
                      alt="After treatment"
                      onClick={() => setActivePhotoModal(url)}
                      className="w-full h-32 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Post-treatment photos will be uploaded upon completion.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Action Hub: Signoff & Problem Reporting */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Customer Service Signoff &amp; Escalation</h4>
            <p className="text-xs text-slate-600 mt-0.5">
              {signoff?.tenant_confirmed_at ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <FaCheckCircle /> You confirmed satisfactory service completion on {new Date(signoff.tenant_confirmed_at).toLocaleDateString()}.
                </span>
              ) : signoff?.tenant_problem_reported ? (
                <span className="text-red-700 font-medium flex items-center gap-1">
                  <FaExclamationTriangle /> You reported a service issue. Our operations team is investigating.
                </span>
              ) : (
                'Review your completed service, verify pest clearance, or escalate an operational problem.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!signoff?.tenant_confirmed_at && (
              <button
                type="button"
                onClick={() => setShowSignoffModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg text-xs shadow-sm transition-colors"
              >
                Confirm Completion
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowProblemModal(true)}
              className="bg-white hover:bg-slate-100 text-red-600 border border-red-200 font-medium py-2 px-4 rounded-lg text-xs shadow-sm transition-colors"
            >
              Report a Problem
            </button>
          </div>
        </div>
      </div>

      {/* Signoff Confirmation Modal */}
      {showSignoffModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Confirm Service Completion</h3>
              <button onClick={() => setShowSignoffModal(false)} className="text-slate-400 hover:text-slate-600">
                <FaTimes />
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              By confirming, you acknowledge that the fumigation specialist completed the treatment and provided safety instructions.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Rating</label>
              <div className="flex items-center gap-2 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`text-xl ${star <= rating ? 'text-amber-400' : 'text-slate-200'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-700">Comments or Feedback (Optional)</label>
              <textarea
                rows="3"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="How was the service conducted?"
                className="w-full mt-1 p-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignoffModal(false)}
                className="py-2 px-4 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitSignoff}
                disabled={submittingFeedback}
                className="py-2 px-4 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {submittingFeedback ? 'Submitting...' : 'Sign Off & Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Problem Modal */}
      {showProblemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-red-600 flex items-center gap-1.5">
                <FaExclamationTriangle /> Report a Problem
              </h3>
              <button onClick={() => setShowProblemModal(false)} className="text-slate-400 hover:text-slate-600">
                <FaTimes />
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Please describe the issue (e.g. chemical odor unresolved, team arrived late, property damage, missed rooms). This will be flagged to the jurisdictional fumigation administrator immediately.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Problem Description</label>
              <textarea
                rows="4"
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder="Provide detailed description of the problem..."
                className="w-full mt-1 p-2.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-red-500"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProblemModal(false)}
                className="py-2 px-4 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitProblem}
                disabled={submittingFeedback || !problemDescription.trim()}
                className="py-2 px-4 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submittingFeedback ? 'Escalating...' : 'Submit Incident to Support'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {activePhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setActivePhotoModal(null)}>
          <div className="max-w-2xl w-full bg-white rounded-lg overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            <img src={activePhotoModal} alt="Service evidence" className="w-full h-auto max-h-[80vh] object-contain rounded" />
            <div className="p-3 text-right">
              <button onClick={() => setActivePhotoModal(null)} className="text-xs font-semibold text-slate-700 hover:underline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FumigationLiveTracker;
