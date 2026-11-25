import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  FaCamera,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaFlag,
  FaIdBadge,
  FaQrcode,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaTimesCircle,
  FaUserCheck,
} from 'react-icons/fa';
import staffVerificationService from '../services/staffVerificationService';
import PaymentSafetyNotice from '../components/staff/PaymentSafetyNotice';

const STATE_CONFIG = {
  ACTIVE_REGISTRATION: {
    label: 'Active Registration',
    summary:
      'This individual has an approved, currently active Amana staff registration. Request Live Confirmation below to verify that the person presenting this profile controls the registered Amana account.',
    containerClass: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    icon: FaCheckCircle,
    iconClass: 'text-emerald-700',
  },
  LIVE_CONFIRMATION_SUCCESSFUL: {
    label: 'Live Confirmation Successful',
    summary:
      'The registered Amana staff account explicitly confirmed this specific verification challenge.',
    containerClass: 'border-emerald-400 bg-emerald-100/80 text-emerald-950',
    icon: FaUserCheck,
    iconClass: 'text-emerald-800',
  },
  PENDING: {
    label: 'Pending Live Confirmation',
    summary:
      'Waiting for the registered staff member to approve or reject this request inside their authenticated Amana dashboard.',
    containerClass: 'border-blue-300 bg-blue-50 text-blue-950',
    icon: FaClock,
    iconClass: 'text-blue-700',
  },
  REJECTED: {
    label: 'Verification Request Rejected',
    summary:
      'The registered Amana staff account explicitly rejected this verification request. Do not engage or share sensitive information or payments.',
    containerClass: 'border-red-300 bg-red-50 text-red-950',
    icon: FaTimesCircle,
    iconClass: 'text-red-700',
  },
  EXPIRED: {
    label: 'Verification Challenge Expired',
    summary:
      'The live confirmation window expired without approval. Start a new live confirmation request if you are still speaking with the representative.',
    containerClass: 'border-amber-300 bg-amber-50 text-amber-950',
    icon: FaClock,
    iconClass: 'text-amber-700',
  },
  SUSPENDED: {
    label: 'Staff Identity Suspended',
    summary:
      'This Amana staff identity is currently suspended. Do not proceed with any transaction or official engagement.',
    containerClass: 'border-amber-400 bg-amber-50 text-amber-950',
    icon: FaExclamationTriangle,
    iconClass: 'text-amber-800',
  },
  REVOKED: {
    label: 'Authorisation Revoked',
    summary:
      'This individual\'s Amana staff authorisation has been withdrawn. They are not authorised to represent Amana RentalHub NG.',
    containerClass: 'border-red-400 bg-red-50 text-red-950',
    icon: FaTimesCircle,
    iconClass: 'text-red-800',
  },
  EXPIRED_STAFF_REGISTRATION: {
    label: 'Expired Staff Registration',
    summary:
      'The validity period of this staff registration has ended. Do not treat this person as currently authorised.',
    containerClass: 'border-amber-400 bg-amber-50 text-amber-950',
    icon: FaExclamationCircle,
    iconClass: 'text-amber-800',
  },
  NOT_FOUND: {
    label: 'No Approved Staff Record Found',
    summary:
      'The supplied Staff Verification ID does not match an approved Amana staff identity. Double-check the ID or report suspected impersonation.',
    containerClass: 'border-slate-300 bg-slate-100 text-slate-900',
    icon: FaExclamationCircle,
    iconClass: 'text-slate-700',
  },
};

const IMPERSONATION_OPTIONS = [
  { value: 'fake_identity', label: 'Someone using a fake Amana identity' },
  { value: 'stolen_staff_id', label: 'Someone using another person\'s staff ID' },
  { value: 'photo_mismatch', label: 'Official photograph does not match the individual' },
  { value: 'unauthorised_payment_request', label: 'Someone requesting unauthorised payments' },
  { value: 'unauthorised_permissions_claimed', label: 'Claiming permissions not shown in this portal' },
  { value: 'refused_live_confirmation', label: 'Refused to complete live identity confirmation' },
  { value: 'suspicious_or_rejected_request', label: 'Suspicious or rejected verification request' },
  { value: 'other', label: 'Other suspected impersonation' },
];

const formatDate = (value) => {
  if (!value) return 'Not specified';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not specified';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCountdown = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export default function VerifyStaff() {
  const { staffId: paramStaffId } = useParams();
  const [searchParams] = useSearchParams();
  const initialQuery = paramStaffId || searchParams.get('id') || searchParams.get('staff_id') || '';

  const [lookupInput, setLookupInput] = useState(initialQuery);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  // QR Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  // Live confirmation challenge state
  const [purpose, setPurpose] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [challengeStatus, setChallengeStatus] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Impersonation report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportReceipt, setReportReceipt] = useState(null);
  const [reportForm, setReportForm] = useState({
    reported_staff_id: '',
    category: 'fake_identity',
    description: '',
    incident_location: '',
    reporter_name: '',
    reporter_contact: '',
  });

  const stopScanner = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
  }, []);

  const performLookup = useCallback(
    async (rawQuery) => {
      const trimmed = String(rawQuery || '').trim();
      if (!trimmed) {
        setLookupError('Enter an Amana Staff Verification ID or scan an official staff QR code.');
        return;
      }
      setLookupLoading(true);
      setLookupError('');
      setPhotoLoadFailed(false);
      setChallenge(null);
      setChallengeStatus(null);
      setChallengeError('');
      try {
        const res = await staffVerificationService.lookupPublicStaff(trimmed);
        if (res.data?.success) {
          setLookupResult(res.data.data);
        } else {
          setLookupError(res.data?.message || 'Unable to verify staff identity right now.');
        }
      } catch (err) {
        setLookupError(
          err.response?.data?.message ||
            'Unable to verify staff identity right now. Please try again.'
        );
      } finally {
        setLookupLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (initialQuery) {
      performLookup(initialQuery);
    }
  }, [initialQuery, performLookup]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startQrScanner = async () => {
    setScannerError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError(
        'Camera access is unavailable in this browser. Please enter the Amana Staff Verification ID manually.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setScannerOpen(true);

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.().catch(() => {});
        }
      }, 60);

      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanTimerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length > 0 && barcodes[0]?.rawValue) {
              const scanned = barcodes[0].rawValue;
              stopScanner();
              setLookupInput(scanned);
              performLookup(scanned);
            }
          } catch {
            // Keep scanning on transient frame errors
          }
        }, 450);
      } else {
        setScannerError(
          'Live QR decoding is not supported by this browser engine. Point your phone camera app at the QR code or type the Staff Verification ID below.'
        );
      }
    } catch (err) {
      stopScanner();
      setScannerError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. You can still verify the staff member by entering their Staff Verification ID below.'
          : 'Unable to open camera. Please enter the Staff Verification ID manually.'
      );
    }
  };

  const handleRequestLiveConfirmation = async (event) => {
    event.preventDefault();
    const staffId = lookupResult?.staff_profile?.staff_verification_id;
    if (!staffId) return;
    if (purpose.trim().length < 3) {
      setChallengeError('Please state the purpose of this engagement (e.g. Property inspection).');
      return;
    }

    setChallengeLoading(true);
    setChallengeError('');
    try {
      const res = await staffVerificationService.createLiveChallenge({
        staff_verification_id: staffId,
        purpose: purpose.trim(),
      });
      if (res.data?.success) {
        const data = res.data.data;
        setChallenge(data);
        setChallengeStatus({
          verification_state: data.verification_state,
          challenge_reference: data.challenge_reference,
          purpose: data.purpose,
          expires_at: data.expires_at,
        });
      }
    } catch (err) {
      setChallengeError(
        err.response?.data?.message || 'Unable to start live confirmation right now.'
      );
    } finally {
      setChallengeLoading(false);
    }
  };

  // Countdown timer for active pending challenge
  useEffect(() => {
    if (!challenge?.expires_at || challengeStatus?.verification_state !== 'PENDING') {
      setSecondsLeft(0);
      return undefined;
    }
    const update = () => {
      const remaining = Math.ceil(
        (new Date(challenge.expires_at).getTime() - Date.now()) / 1000
      );
      setSecondsLeft(Math.max(0, remaining));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.expires_at, challengeStatus?.verification_state]);

  // Authoritative backend polling for live challenge status
  useEffect(() => {
    if (
      !challenge?.challenge_reference ||
      !challenge?.visitor_poll_token ||
      challengeStatus?.verification_state !== 'PENDING'
    ) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await staffVerificationService.pollLiveChallenge(
          challenge.challenge_reference,
          challenge.visitor_poll_token
        );
        if (!cancelled && res.data?.success) {
          const next = res.data.data;
          setChallengeStatus(next);
          if (next.staff_profile) {
            setLookupResult((prev) =>
              prev
                ? {
                    ...prev,
                    verification_state: next.staff_profile.verification_state,
                    staff_profile: next.staff_profile,
                  }
                : prev
            );
          }
        }
      } catch {
        // Keep polling until authoritative state or expiry
      }
    };

    const interval = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    challenge?.challenge_reference,
    challenge?.visitor_poll_token,
    challengeStatus?.verification_state,
  ]);

  const openReportModal = () => {
    setReportError('');
    setReportReceipt(null);
    setReportForm((prev) => ({
      ...prev,
      reported_staff_id:
        lookupResult?.staff_profile?.staff_verification_id || lookupInput.trim() || '',
    }));
    setReportOpen(true);
  };

  const handleReportSubmit = async (event) => {
    event.preventDefault();
    if (reportForm.description.trim().length < 10) {
      setReportError('Please provide at least 10 characters describing what happened.');
      return;
    }
    setReportSubmitting(true);
    setReportError('');
    try {
      const res = await staffVerificationService.submitImpersonationReport({
        ...reportForm,
        challenge_reference: challenge?.challenge_reference || '',
      });
      if (res.data?.success) {
        setReportReceipt(res.data.data);
      }
    } catch (err) {
      setReportError(
        err.response?.data?.message || 'Unable to submit impersonation report right now.'
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  const profile = lookupResult?.staff_profile || null;
  const registrationState = lookupResult?.verification_state || null;
  const activeDisplayState = challengeStatus?.verification_state || registrationState;
  const statusMeta = activeDisplayState ? STATE_CONFIG[activeDisplayState] : null;
  const StatusIcon = statusMeta?.icon || FaShieldAlt;

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-primary-700">
            Amana RentalHub NG · Official Public Verification Service
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Amana Staff Identity and Authorisation Verification Portal
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-slate-600">
            Confirm whether an individual claiming to represent Amana RentalHub NG holds an
            approved staff registration, inspect their explicitly permitted activities, and
            request live identity confirmation before engaging them. No account is required.
          </p>
        </div>

        {/* Mandatory Payment Safety Notice (Landing) */}
        <PaymentSafetyNotice />

        {/* Lookup Panel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Verify an Amana Staff Member
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Enter the staff member&apos;s unique Amana Staff Verification ID or scan their
                official QR code.
              </p>
            </div>
            <button
              type="button"
              onClick={openReportModal}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <FaFlag className="text-xs" aria-hidden="true" />
              <span>Report Suspected Impersonation</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              performLookup(lookupInput);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <label htmlFor="staff-verification-id-input" className="sr-only">
                Amana Staff Verification ID
              </label>
              <FaIdBadge
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="staff-verification-id-input"
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Enter Staff ID (e.g. AMN-7K4P-9M2X-3Q8R)"
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <button
              type="submit"
              disabled={lookupLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <FaSearch className="text-xs" aria-hidden="true" />
              <span>{lookupLoading ? 'Verifying...' : 'Verify Staff ID'}</span>
            </button>

            <button
              type="button"
              onClick={scannerOpen ? stopScanner : startQrScanner}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FaCamera className="text-xs" aria-hidden="true" />
              <span>{scannerOpen ? 'Close Scanner' : 'Scan Staff QR Code'}</span>
            </button>
          </form>

          {lookupError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {lookupError}
            </div>
          )}

          {scannerError && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {scannerError}
            </div>
          )}

          {scannerOpen && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-900 p-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Align the official Amana staff QR code inside the camera frame
                </p>
                <button
                  type="button"
                  onClick={stopScanner}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Stop Camera
                </button>
              </div>
              <video
                ref={videoRef}
                playsInline
                muted
                className="mx-auto max-h-72 w-full rounded-lg bg-black object-cover"
              />
            </div>
          )}
        </section>

        {/* Authoritative Verification Result */}
        {lookupResult && statusMeta && (
          <section className="space-y-6" aria-live="polite">
            {/* Primary Status Banner */}
            <div
              className={`rounded-2xl border p-5 sm:p-6 ${statusMeta.containerClass}`}
              data-testid="verification-status-banner"
              data-verification-state={activeDisplayState}
            >
              <div className="flex items-start gap-3">
                <StatusIcon
                  className={`mt-0.5 h-6 w-6 shrink-0 ${statusMeta.iconClass}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold tracking-wide opacity-80">
                    Authoritative Verification Result · {activeDisplayState}
                  </p>
                  <h2 className="text-xl font-bold">{statusMeta.label}</h2>
                  <p className="text-sm leading-relaxed">{statusMeta.summary}</p>
                  {challengeStatus?.verification_state === 'LIVE_CONFIRMATION_SUCCESSFUL' &&
                    challengeStatus?.responded_at && (
                      <p className="pt-1 font-mono text-xs tabular-nums">
                        Confirmed at: {new Date(challengeStatus.responded_at).toLocaleString()} ·
                        Reference: {challengeStatus.challenge_reference}
                      </p>
                    )}
                </div>
              </div>
            </div>

            {/* Public Staff Profile Card */}
            {profile && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-8">
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Official Registered Photograph */}
                  <div className="flex flex-col items-center space-y-3">
                    <div className="h-52 w-52 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                      {profile.official_photo_url && !photoLoadFailed ? (
                        <img
                          src={profile.official_photo_url}
                          alt={`Official registered photograph of ${profile.full_name}`}
                          referrerPolicy="no-referrer"
                          onError={() => setPhotoLoadFailed(true)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center px-4 text-center text-slate-500">
                          <FaIdBadge className="h-12 w-12 text-slate-400" aria-hidden="true" />
                          <span className="mt-2 text-xs font-medium">
                            Official photograph unavailable
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-center text-xs leading-relaxed text-slate-600">
                      Compare the person in front of you with this official photograph before
                      proceeding.
                    </p>
                  </div>

                  {/* Public Identity Metadata */}
                  <div className="md:col-span-2 space-y-5">
                    <div className="border-b border-slate-200 pb-4">
                      <p className="text-xs font-medium text-slate-500">
                        {profile.engagement_type_label} · {profile.department}
                      </p>
                      <h3 className="mt-1 text-2xl font-bold text-slate-900">
                        {profile.full_name}
                      </h3>
                      <p className="mt-1 text-base font-medium text-slate-700">
                        {profile.official_role}
                      </p>
                    </div>

                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">
                          Unique Amana Staff ID
                        </dt>
                        <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                          {profile.staff_verification_id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">
                          Registration Status
                        </dt>
                        <dd className="mt-1 font-semibold capitalize text-slate-900">
                          {String(profile.registration_status || '').replace(/_/g, ' ')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Department</dt>
                        <dd className="mt-1 text-slate-900">{profile.department}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Engagement Type</dt>
                        <dd className="mt-1 text-slate-900">{profile.engagement_type_label}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Valid From</dt>
                        <dd className="mt-1 font-mono text-slate-900 tabular-nums">
                          {formatDate(profile.valid_from)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Valid Until</dt>
                        <dd className="mt-1 font-mono text-slate-900 tabular-nums">
                          {profile.expires_at ? formatDate(profile.expires_at) : 'Ongoing (subject to active status)'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Explicit Approved Activities vs Restricted Activities */}
                <div className="grid gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Explicitly Approved Activities
                    </h4>
                    {profile.approved_activities?.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {profile.approved_activities.map((activity) => (
                          <li key={activity.code} className="flex items-start gap-2">
                            <FaCheckCircle
                              className="mt-1 h-4 w-4 shrink-0 text-emerald-600"
                              aria-hidden="true"
                            />
                            <span>{activity.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">
                        No approved field or operational activities are currently assigned to this
                        staff identity.
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Not Authorised by Default
                    </h4>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {(profile.restricted_by_default || []).map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <FaTimesCircle
                            className="mt-1 h-4 w-4 shrink-0 text-red-600"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs font-semibold text-slate-700">
                      Financial Collection Authority:{' '}
                      {profile.financial_collection_authorized
                        ? 'Separately authorised via official platform channels only'
                        : 'NOT authorised to collect payments or cash'}
                    </p>
                  </div>
                </div>

                {/* Live Identity Confirmation Workflow */}
                {profile.can_request_live_confirmation && (
                  <div className="border-t border-slate-200 pt-6 space-y-5">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Step 2 — Live Identity Confirmation
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        A static QR code only confirms a profile exists. Request a short-lived
                        challenge so the staff member can prove live control of their authenticated
                        Amana account.
                      </p>
                    </div>

                    {!challenge ||
                    ['EXPIRED', 'REJECTED'].includes(challengeStatus?.verification_state) ? (
                      <form
                        onSubmit={handleRequestLiveConfirmation}
                        className="flex flex-col gap-3 sm:flex-row"
                      >
                        <div className="flex-1">
                          <label htmlFor="live-purpose-input" className="sr-only">
                            Purpose of verification
                          </label>
                          <input
                            id="live-purpose-input"
                            type="text"
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                            maxLength={280}
                            placeholder="Purpose (e.g. Scheduled apartment inspection at Lekki Phase 1)"
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-200"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={challengeLoading}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          <FaQrcode className="text-xs" aria-hidden="true" />
                          <span>
                            {challengeLoading ? 'Generating...' : 'Request Live Confirmation'}
                          </span>
                        </button>
                      </form>
                    ) : null}

                    {challengeError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                      >
                        {challengeError}
                      </div>
                    )}

                    {challenge && challengeStatus?.verification_state === 'PENDING' && (
                      <div className="grid gap-6 rounded-xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2 items-center">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <QRCodeSVG value={challenge.qr_payload} size={184} level="M" />
                          </div>
                          <p className="text-xs text-slate-600 text-center">
                            Ask the staff member to scan this QR code or enter the short code
                            inside their authenticated Amana dashboard.
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-medium text-slate-500">
                              Manual Confirmation Code
                            </p>
                            <p
                              className="mt-1 font-mono text-2xl font-bold tracking-widest text-slate-900 tabular-nums"
                              data-testid="live-challenge-code"
                            >
                              {challenge.short_code}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-xs font-medium text-slate-500">Reference</p>
                              <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                                {challenge.challenge_reference}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500">Expires In</p>
                              <p className="mt-0.5 font-mono font-semibold text-primary-700 tabular-nums">
                                {formatCountdown(secondsLeft)}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-500">Purpose</p>
                            <p className="mt-0.5 text-sm text-slate-800">{challenge.purpose}</p>
                          </div>
                          <p className="text-xs text-slate-600">
                            This page updates automatically as soon as the staff member confirms or
                            rejects the request.
                          </p>
                        </div>
                      </div>
                    )}

                    {lookupResult?.face_match_advisory && (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                        <strong>Physical Meeting Advisory:</strong> {lookupResult.face_match_advisory}
                      </p>
                    )}
                  </div>
                )}

                {/* Mandatory Payment Safety Notice on Profile & Live Result */}
                <PaymentSafetyNotice compact />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-xs text-slate-600">
                    Something does not match? Report suspected impersonation immediately.
                  </p>
                  <button
                    type="button"
                    onClick={openReportModal}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    <FaFlag className="text-xs" aria-hidden="true" />
                    <span>Report Suspected Impersonation</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Impersonation Reporting Modal */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="impersonation-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2
                  id="impersonation-modal-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Report Suspected Impersonation
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Your report goes directly to Amana&apos;s Super Admin investigation team. Any
                  contact details you provide remain strictly confidential.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Close impersonation report modal"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <FaTimes />
              </button>
            </div>

            {reportReceipt ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 space-y-1">
                  <p className="text-sm font-bold">Impersonation Report Recorded</p>
                  <p className="text-sm">
                    Reference:{' '}
                    <span className="font-mono font-bold tabular-nums">
                      {reportReceipt.report_reference}
                    </span>
                  </p>
                  <p className="text-xs text-emerald-800">
                    Thank you for alerting Amana RentalHub NG. Our security team has been notified
                    to investigate this report.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="report-category"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Reason for Report
                  </label>
                  <select
                    id="report-category"
                    value={reportForm.category}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                  >
                    {IMPERSONATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="report-staff-id"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Staff Verification ID Claimed (optional)
                  </label>
                  <input
                    id="report-staff-id"
                    type="text"
                    value={reportForm.reported_staff_id}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, reported_staff_id: e.target.value }))
                    }
                    placeholder="AMN-XXXX-XXXX-XXXX"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="report-description"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    What Happened? *
                  </label>
                  <textarea
                    id="report-description"
                    rows={4}
                    required
                    value={reportForm.description}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Describe the encounter, claims made, or payment requested..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="report-location"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Location / Channel (optional)
                  </label>
                  <input
                    id="report-location"
                    type="text"
                    value={reportForm.incident_location}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, incident_location: e.target.value }))
                    }
                    placeholder="e.g. Wuse II, Abuja or WhatsApp"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="report-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Your Name (optional, private)
                    </label>
                    <input
                      id="report-name"
                      type="text"
                      value={reportForm.reporter_name}
                      onChange={(e) =>
                        setReportForm((prev) => ({ ...prev, reporter_name: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="report-contact"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Phone or Email (optional, private)
                    </label>
                    <input
                      id="report-contact"
                      type="text"
                      value={reportForm.reporter_contact}
                      onChange={(e) =>
                        setReportForm((prev) => ({ ...prev, reporter_contact: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                    />
                  </div>
                </div>

                {reportError && (
                  <p role="alert" className="text-sm font-medium text-red-700">
                    {reportError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportSubmitting}
                    className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                  >
                    {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
