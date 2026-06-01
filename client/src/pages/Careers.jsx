import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import {
  FaBriefcase,
  FaCalendarAlt,
  FaCheck,
  FaCheckCircle,
  FaCopy,
  FaDownload,
  FaExclamationTriangle,
  FaFileUpload,
  FaHourglassHalf,
  FaLock,
  FaMicrophone,
  FaMicrophoneAlt,
  FaShieldAlt,
  FaSpinner,
  FaTimes,
  FaUser,
  FaVideo,
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

// ============================================================
// Interview Constants
// ============================================================
const QUESTION_TIME_LIMIT_SECONDS = 30;
const FACE_DETECTION_INTERVAL_MS = 800;
const MIN_FACE_CONFIDENCE = 0.65;
const CONSECUTIVE_FACE_VIOLATIONS = 3;
const FACE_API_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const TINY_FACE_DETECTOR_MODEL_URLS = [
  'https://cdn.jsdelivr.net/npm/@xkeshi/face-api.js-models@0.0.1/models/tiny_face_detector',
  'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model',
];
const CAREERS_DRAFT_STORAGE_KEY = 'rentalhub_careers_application_draft';

// ============================================================
// face-api.js Global References (loaded from CDN)
// ============================================================
let faceApiLoaded = false;
let faceApiLoading = null;

const loadTinyFaceDetectorModel = async () => {
  for (const modelUrl of TINY_FACE_DETECTOR_MODEL_URLS) {
    try {
      await window.faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
      return true;
    } catch (error) {
      console.warn(`TinyFaceDetector model failed from ${modelUrl}`, error);
    }
  }
  return false;
};

const loadFaceApi = () => {
  if (faceApiLoaded) return Promise.resolve(true);
  if (faceApiLoading) return faceApiLoading;

  faceApiLoading = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const markFaceApiReady = async () => {
      if (!window.faceapi?.nets?.tinyFaceDetector || !window.faceapi?.TinyFaceDetectorOptions) {
        console.warn('face-api.js loaded without TinyFaceDetector support');
        faceApiLoading = null;
        resolve(false);
        return;
      }

      const modelReady = await loadTinyFaceDetectorModel();
      faceApiLoaded = modelReady;
      if (!modelReady) faceApiLoading = null;
      resolve(modelReady);
    };

    // Check if already available
    if (typeof window !== 'undefined' && window.faceapi) {
      markFaceApiReady();
      return;
    }

    // Load face-api.js script dynamically from CDN
    const existingScript = document.querySelector(`script[src="${FACE_API_SCRIPT_URL}"]`);
    const script = existingScript || document.createElement('script');
    script.src = FACE_API_SCRIPT_URL;
    script.async = true;
    script.dataset.rentalhubFaceApi = 'true';
    script.onload = markFaceApiReady;
    script.onerror = () => {
      console.warn('face-api.js CDN unavailable, falling back to motion detection');
      faceApiLoading = null;
      resolve(false);
    };
    if (!existingScript) document.head.appendChild(script);
  });

  return faceApiLoading;
};

const EMPTY_FORM = {
  role_id: '',
  full_name: '',
  phone_number: '',
  email_address: '',
  state_name: '',
  lga_name: '',
  area_locality: '',
  residential_address: '',
  date_of_birth: '',
  highest_education: '',
  years_of_experience: '',
  current_employment_status: '',
  skills_qualifications: '',
  suitability_reason: '',
  application_track: 'standard',
};

const EMPTY_CV_FORM = {
  bio: '',
  address: '',
  phone: '',
  email: '',
  education: '',
  experience: '',
  skills: '',
};

const DOCUMENT_FIELDS = [
  { name: 'cv', label: 'CV / Resume', required: true },
  { name: 'cover_letter', label: 'Cover Letter', required: true },
  { name: 'guarantor_letter', label: "Guarantor's Letter", required: true },
  { name: 'government_id', label: 'Government ID', required: true },
  { name: 'proof_of_address', label: 'Proof of Address', required: true },
  { name: 'certificates', label: 'Certificates', multiple: true },
];

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  shortlisted: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  disqualified: 'bg-red-100 text-red-700',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
};

const normalize = (value) => String(value || '').trim();

const buildInterviewFingerprint = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return '';
  return [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`,
    String(navigator.hardwareConcurrency || ''),
  ].join('|').slice(0, 300);
};

export default function Careers() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusLoading, setStatusLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [roles, setRoles] = useState([]);
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [application, setApplication] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [visibleAccessCode, setVisibleAccessCode] = useState('');
  const [documents, setDocuments] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cvModal, setCvModal] = useState(false);
  const [cvForm, setCvForm] = useState(EMPTY_CV_FORM);
  const [generatingCv, setGeneratingCv] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  // ─── Interview State ───────────────────────────────────────
  const [phoneCheck, setPhoneCheck] = useState('');
  const [interviewMode, setInterviewMode] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [spokenAnswer, setSpokenAnswer] = useState('');
  const [interviewLocked, setInterviewLocked] = useState(false);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [faceDetectionReady, setFaceDetectionReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState({ faces: 0, status: 'idle' }); // idle | monitoring | violation | locked
  const [interviewStarting, setInterviewStarting] = useState(false);
  const [interviewStartupStep, setInterviewStartupStep] = useState('');
  const [interviewChallengeToken, setInterviewChallengeToken] = useState('');
  const [interviewResult, setInterviewResult] = useState(null);

  // ─── Refs ──────────────────────────────────────────────────
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const faceCanvasRef = useRef(null);
  const faceDetectionTimerRef = useRef(null);
  const questionTimerRef = useRef(null);
  const interviewPingTimerRef = useRef(null);
  const verifiedPaymentReferenceRef = useRef('');
  const interviewFingerprintRef = useRef('');
  const consecutiveNoFaceRef = useRef(0);
  const consecutiveMultiFaceRef = useRef(0);
  const interviewLockedRef = useRef(false);

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(form.role_id)),
    [roles, form.role_id]
  );

  const effectiveFee = useMemo(() => {
    if (!selectedRole) return 0;
    return form.application_track === 'premium'
      ? selectedRole.premium_fee
      : selectedRole.application_fee;
  }, [selectedRole, form.application_track]);

  const loadPublicData = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [statusRes, statesRes] = await Promise.all([
        api.get('/recruitment/status'),
        api.get('/recruitment/locations/states'),
      ]);
      const active = Boolean(statusRes.data?.data?.is_active);
      setIsActive(active);
      setStates(statesRes.data?.data || []);
      if (active) {
        const rolesRes = await api.get('/recruitment/roles/active');
        setRoles(rolesRes.data?.data || []);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load recruitment information');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadMyApplication = useCallback(async () => {
    try {
      const email = form.email_address;
      if (!email) return;
      const res = await api.get(`/recruitment/my-application?email=${encodeURIComponent(email)}`);
      const app = res.data?.data || null;
      setApplication(app);
      if (app?.access_code && !app.access_code_used) {
        setVisibleAccessCode(app.access_code);
      }
    } catch (error) {
      console.error('Failed to load applicant dashboard:', error);
    }
  }, [form.email_address]);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  useEffect(() => {
    loadMyApplication();
  }, [loadMyApplication]);

  useEffect(() => {
    if (application || typeof window === 'undefined') return;
    try {
      const savedDraft = JSON.parse(window.localStorage.getItem(CAREERS_DRAFT_STORAGE_KEY) || 'null');
      if (savedDraft && typeof savedDraft === 'object') {
        setForm((prev) => ({ ...prev, ...savedDraft }));
      }
    } catch {
      // Ignore malformed local draft data.
    }
  }, [application]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const timer = setInterval(async () => {
      if (application?.id && application.status === 'draft') {
        setDraftSaving(true);
        try {
          await api.put(`/recruitment/applications/${application.id}`, form);
        } catch (error) {
          console.error('Recruitment draft autosave failed:', error);
        } finally {
          setDraftSaving(false);
        }
        return;
      }

      if (!application) {
        window.localStorage.setItem(CAREERS_DRAFT_STORAGE_KEY, JSON.stringify(form));
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [application, form]);

  useEffect(() => {
    if (!form.state_name) {
      setLgas([]);
      return;
    }

    let active = true;
    api.get(`/recruitment/locations/lgas/${encodeURIComponent(form.state_name)}`)
      .then((res) => {
        if (active) setLgas(res.data?.data || []);
      })
      .catch(() => {
        if (active) setLgas([]);
      });

    return () => {
      active = false;
    };
  }, [form.state_name]);

  useEffect(() => {
    const reference = searchParams.get('payment_reference');
    if (!reference) return;
    if (verifiedPaymentReferenceRef.current === reference) return;
    verifiedPaymentReferenceRef.current = reference;

    const verify = async () => {
      setPaymentBusy(true);
      try {
        const res = await api.post(`/recruitment/payments/verify/${encodeURIComponent(reference)}`);
        const code = res.data?.data?.access_code;
        if (code) {
          setVisibleAccessCode(code);
          toast.success('Payment confirmed. Your access code is ready.');
        }
        await loadMyApplication();
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('payment_reference');
        setSearchParams(nextParams, { replace: true });
      } catch (error) {
        verifiedPaymentReferenceRef.current = '';
        toast.error(error.response?.data?.message || 'Payment verification failed');
      } finally {
        setPaymentBusy(false);
      }
    };

    verify();
  }, [loadMyApplication, searchParams, setSearchParams]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'state_name' ? { lga_name: '' } : {}),
    }));
  };

  const startApplication = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/recruitment/apply', form);
      setApplication(res.data?.data || null);
      window.localStorage?.removeItem(CAREERS_DRAFT_STORAGE_KEY);
      toast.success(res.data?.message || 'Application started');
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start application');
    } finally {
      setSubmitting(false);
    }
  };

  const initiatePayment = async () => {
    if (!application?.id) return;
    setPaymentBusy(true);
    try {
      const res = await api.post('/recruitment/payments/initiate', {
        application_id: application.id,
      });
      const url = res.data?.data?.authorization_url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error('Payment gateway did not return a payment link');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to initialize payment');
    } finally {
      setPaymentBusy(false);
    }
  };

  const verifyAccessCode = async () => {
    if (!application?.id || !accessCodeInput) return;
    try {
      await api.post('/recruitment/verify-access-code', {
        application_id: application.id,
        access_code: accessCodeInput,
      });
      toast.success('Access code verified. Document upload is now unlocked.');
      setAccessCodeInput('');
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to verify access code');
    }
  };

  const handleDocumentChange = (event) => {
    const { name, files } = event.target;
    setDocuments((prev) => ({ ...prev, [name]: files }));
  };

  const uploadDocuments = async () => {
    if (!application?.id) return;
    const formData = new FormData();
    DOCUMENT_FIELDS.forEach((field) => {
      const selected = documents[field.name];
      if (!selected) return;
      Array.from(selected).forEach((file) => formData.append(field.name, file));
    });

    setUploading(true);
    try {
      await api.post(`/recruitment/documents/upload/${application.id}`, formData);
      toast.success('Documents uploaded successfully');
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  const downloadBlob = async (url, filename) => {
    try {
      const response = await api.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to download document');
    }
  };

  const openCvBuilder = () => {
    setCvForm({
      bio: '',
      address: application?.residential_address || form.residential_address || '',
      phone: application?.phone_number || form.phone_number || '',
      email: application?.email_address || form.email_address || '',
      education: application?.highest_education || form.highest_education || '',
      experience: application?.current_employment_status || form.current_employment_status || '',
      skills: application?.skills_qualifications || form.skills_qualifications || '',
    });
    setCvModal(true);
  };

  const handleCvChange = (event) => {
    const { name, value } = event.target;
    setCvForm((prev) => ({ ...prev, [name]: value }));
  };

  const generatePlatformCv = async () => {
    if (!application?.id) return;
    setGeneratingCv(true);
    try {
      await api.post(`/recruitment/documents/generate-cv/${application.id}`, cvForm);
      toast.success('Platform CV generated and attached');
      setCvModal(false);
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate platform CV');
    } finally {
      setGeneratingCv(false);
    }
  };

  const submitApplication = async () => {
    if (!application?.id) return;
    try {
      await api.post(`/recruitment/applications/${application.id}/submit`);
      toast.success('Application submitted successfully');
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit application');
    }
  };

  const copyAccessCode = async () => {
    if (!visibleAccessCode) return;
    await navigator.clipboard?.writeText(visibleAccessCode);
    toast.success('Access code copied');
  };

  // ─── Face Detection ──────────────────────────────────────
  const detectFaceWithApi = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || interviewLockedRef.current) return;

    try {
      if (typeof window === 'undefined' || !window.faceapi || !window.faceapi.detectAllFaces) {
        // Fall back to basic motion detection
        return;
      }

      const detections = await window.faceapi
        .detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: MIN_FACE_CONFIDENCE,
        }));

      const faceCount = detections.length;

      // Multiple faces → other person in frame → disqualify
      if (faceCount > 1) {
        consecutiveMultiFaceRef.current += 1;
        consecutiveNoFaceRef.current = 0;
        if (consecutiveMultiFaceRef.current >= 2) {
          setFaceStatus({ faces: faceCount, status: 'violation' });
          await reportInterviewViolation('multiple_faces', `Detected ${faceCount} faces in frame`);
          return;
        }
      } else {
        consecutiveMultiFaceRef.current = 0;
      }

      // Zero faces → candidate left frame
      if (faceCount === 0) {
        consecutiveNoFaceRef.current += 1;
        if (consecutiveNoFaceRef.current >= CONSECUTIVE_FACE_VIOLATIONS) {
          setFaceStatus({ faces: 0, status: 'violation' });
          await reportInterviewViolation('candidate_left_frame', 'No face detected for multiple frames');
          return;
        }
      } else {
        consecutiveNoFaceRef.current = 0;
      }

      setFaceStatus({ faces: faceCount, status: faceCount === 1 ? 'monitoring' : 'warning' });
    } catch (err) {
      // Silently skip detection errors (e.g., model not loaded yet)
    }
  };

  // ─── Question Timer ─────────────────────────────────────
  // ─── Report Violation ──────────────────────────────────
  const reportInterviewViolation = async (type, details) => {
    if (interviewLockedRef.current) return;
    interviewLockedRef.current = true;
    setInterviewLocked(true);
    setFaceStatus((prev) => ({ ...prev, status: 'locked' }));

    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    if (interviewPingTimerRef.current) {
      clearInterval(interviewPingTimerRef.current);
      interviewPingTimerRef.current = null;
    }

    try {
      await api.post('/recruitment/interview/violation', {
        violation_type: type,
        details,
        challenge_token: interviewChallengeToken,
        fingerprint: interviewFingerprintRef.current,
      });
      toast.error('Interview locked due to detected violation');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Interview violation recorded');
    } finally {
      stopInterviewMedia();
      await loadMyApplication();
    }
  };

  // ─── Stop Media ────────────────────────────────────────
  const stopInterviewMedia = useCallback(() => {
    if (faceDetectionTimerRef.current) {
      clearInterval(faceDetectionTimerRef.current);
      faceDetectionTimerRef.current = null;
    }

    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore recorder stop failures.
      }
    }

    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // ─── Start Interview ───────────────────────────────────
  useEffect(() => {
    // Pre-load face-api models in the background
    loadFaceApi().then((ready) => {
      if (ready) setFaceDetectionReady(true);
    });
    return () => {
      stopInterviewMedia();
    };
  }, [stopInterviewMedia]);

  const startInterview = async () => {
    if (!application) return;
    if (normalize(phoneCheck) !== normalize(application.phone_number)) {
      toast.error('Enter the same phone number used on your application');
      return;
    }

    setInterviewStarting(true);
    setInterviewStartupStep('Requesting camera and microphone permission...');
    try {
      const fingerprint = buildInterviewFingerprint();
      interviewFingerprintRef.current = fingerprint;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setInterviewStartupStep('Preparing secure interview recording...');

      const recorderOptions = MediaRecorder.isTypeSupported?.('video/webm')
        ? { mimeType: 'video/webm' }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      recorderRef.current = recorder;
      const chunks = [];
      recordingChunksRef.current = chunks;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.start(1000);

      // Wait for video to be ready
      setInterviewStartupStep('Checking camera readiness...');
      await new Promise((resolve) => {
        const check = () => {
          if (videoRef.current?.readyState >= 2) resolve();
          else setTimeout(check, 200);
        };
        check();
      });

      // Load face-api
      setInterviewStartupStep('Loading face monitoring model...');
      const faceReady = await loadFaceApi();
      setFaceDetectionReady(faceReady);

      if (faceReady) {
        setFaceStatus({ faces: 0, status: 'monitoring' });
        // Start face detection
        faceDetectionTimerRef.current = setInterval(detectFaceWithApi, FACE_DETECTION_INTERVAL_MS);
      } else {
        setFaceStatus({ faces: 0, status: 'idle' });
      }

      setInterviewStartupStep('Fetching your assigned questions...');
      const res = await api.post('/recruitment/interview/start', {
        phone_number: phoneCheck,
        fingerprint,
      });
      setInterviewQuestions(res.data?.data?.questions || []);
      setInterviewChallengeToken(res.data?.data?.challenge_token || '');
      setQuestionIndex(0);
      setInterviewMode(true);
      setInterviewResult(null);
      interviewLockedRef.current = false;
      setInterviewLocked(false);
      consecutiveNoFaceRef.current = 0;
      consecutiveMultiFaceRef.current = 0;
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Camera and microphone permission is required');
      stopInterviewMedia();
    } finally {
      setInterviewStarting(false);
      setInterviewStartupStep('');
    }
  };

  // ─── Submit Answer (with empty timeout) ─────────────────
  const uploadRecording = useCallback(async () => {
    const chunks = recordingChunksRef.current || [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('recording', blob, `recruitment-interview-${Date.now()}.webm`);
    formData.append('violation_log', interviewLocked ? 'Interview locked by proctoring' : '');
    try {
      await api.post('/recruitment/interview/recording', formData);
    } catch (error) {
      console.error('Interview recording upload failed:', error);
    }
  }, [interviewLocked]);

  const completeInterview = useCallback(async () => {
    try {
      const res = await api.post('/recruitment/interview/complete');
      setInterviewResult(res.data?.data || null);
      toast.success('Interview completed successfully');
      stopInterviewMedia();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await uploadRecording();
      setInterviewMode(false);
      setInterviewChallengeToken('');
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete interview');
    }
  }, [loadMyApplication, stopInterviewMedia, uploadRecording]);

  const submitEmptyAnswer = useCallback(async () => {
    const question = interviewQuestions[questionIndex];
    if (!question || interviewLockedRef.current) return;
    try {
      await api.post('/recruitment/interview/answer', {
        question_id: question.id,
        answer: 'X', // X marks timed-out/unanswered
        challenge_token: interviewChallengeToken,
        fingerprint: interviewFingerprintRef.current,
      });
      if (questionIndex + 1 >= interviewQuestions.length) {
        await completeInterview();
      } else {
        setQuestionIndex((prev) => prev + 1);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit answer');
    }
  }, [completeInterview, questionIndex, interviewQuestions, interviewChallengeToken]);

  const startQuestionTimer = useCallback(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    setQuestionTimeLeft(QUESTION_TIME_LIMIT_SECONDS);

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
          submitEmptyAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [submitEmptyAnswer]);

  const submitInterviewAnswer = async (answer) => {
    const question = interviewQuestions[questionIndex];
    if (!question || interviewLockedRef.current) return;

    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }

    try {
      await api.post('/recruitment/interview/answer', {
        question_id: question.id,
        answer: answer.toUpperCase(),
        challenge_token: interviewChallengeToken,
        fingerprint: interviewFingerprintRef.current,
      });
      setSpokenAnswer('');
      if (questionIndex + 1 >= interviewQuestions.length) {
        await completeInterview();
      } else {
        setQuestionIndex((prev) => prev + 1);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit answer');
    }
  };

  // ─── Start timer when question changes ─────────────────
  useEffect(() => {
    if (interviewMode && !interviewLocked && interviewQuestions.length > 0) {
      startQuestionTimer();
    }
    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [questionIndex, interviewMode, interviewLocked, interviewQuestions.length, startQuestionTimer]);

  useEffect(() => {
    if (!interviewMode || !interviewChallengeToken || interviewLocked) return undefined;

    const sendPing = async () => {
      try {
        await api.post('/recruitment/interview/ping', {
          challenge_token: interviewChallengeToken,
          fingerprint: interviewFingerprintRef.current,
        });
      } catch (error) {
        console.error('Interview heartbeat failed:', error);
      }
    };

    sendPing();
    interviewPingTimerRef.current = setInterval(sendPing, 20000);

    return () => {
      if (interviewPingTimerRef.current) {
        clearInterval(interviewPingTimerRef.current);
        interviewPingTimerRef.current = null;
      }
    };
  }, [interviewMode, interviewChallengeToken, interviewLocked]);

  // ─── Speech Recognition ────────────────────────────────
  const listenForAnswer = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info('Speech recognition is not available on this browser. Tap A, B, C, or D.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      const match = transcript.toUpperCase().match(/\b(A|B|C|D)\b/);
      if (match) {
        setSpokenAnswer(match[1]);
        submitInterviewAnswer(match[1]);
      } else {
        toast.info('Please say A, B, C, or D clearly');
      }
    };
    recognition.start();
  };

  // ─── Complete Interview ────────────────────────────────
  const renderClosed = () => (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto flex min-h-[58vh] max-w-3xl items-center px-4 py-12"
    >
      <div className="w-full rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 text-center shadow-elevated-lg sm:p-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 shadow-inner">
          <FaLock className="text-2xl" />
        </div>
        <h1 className="text-3xl font-black text-slate-900">Recruitment is currently closed</h1>
        <p className="mt-3 max-w-lg mx-auto text-base leading-7 text-slate-500">
          Career applications are not open right now. When the recruitment cycle reopens, the Career link will appear in the footer and you'll be able to apply.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/" className="btn btn-secondary">
            Back to Home
          </Link>
        </div>
      </div>
    </motion.section>
  );

  const renderLoginPrompt = () => (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto flex min-h-[58vh] max-w-3xl items-center px-4 py-12"
    >
      <div className="w-full rounded-3xl border border-primary-200/50 bg-gradient-to-br from-white to-primary-50/30 p-8 text-center shadow-elevated-lg sm:p-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20">
          <FaBriefcase className="text-2xl" />
        </div>
        <h1 className="text-3xl font-black text-slate-900">Sign in to apply</h1>
        <p className="mt-3 max-w-lg mx-auto text-base leading-7 text-slate-500">
          Recruitment uses your existing RentalHub NG account. There is no separate career registration — just sign in and complete your application.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login" className="btn btn-primary px-8 py-3 text-base">
            Sign in to continue
          </Link>
          <Link to="/register" className="btn btn-secondary px-8 py-3 text-base">
            Create Account
          </Link>
        </div>
      </div>
    </motion.section>
  );

  const renderApplicationForm = () => (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      onSubmit={startApplication}
      className="grid gap-5 lg:grid-cols-2"
    >
      <SelectField label="Role Applying For" name="role_id" value={form.role_id} onChange={handleFormChange} required>
        <option value="">Select role</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.title} - {formatCurrency(form.application_track === 'premium' ? role.premium_fee : role.application_fee)}
          </option>
        ))}
      </SelectField>

      <SelectField label="Application Track" name="application_track" value={form.application_track} onChange={handleFormChange}>
        <option value="standard">Standard - Written application</option>
        <option value="premium">Premium - Platform CV &amp; digital tools</option>
      </SelectField>

      <div className="lg:col-span-2 border-b border-slate-100 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Personal Information</h3>
      </div>
      <InputField label="Full Name" name="full_name" value={form.full_name} onChange={handleFormChange} required />
      <InputField label="Phone Number" name="phone_number" value={form.phone_number} onChange={handleFormChange} required />
      <InputField label="Email Address" type="email" name="email_address" value={form.email_address} onChange={handleFormChange} required />
      <InputField label="Date of Birth" type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleFormChange} />

      <SelectField label="State of Residence" name="state_name" value={form.state_name} onChange={handleFormChange} required>
        <option value="">Select state</option>
        {states.map((state) => (
          <option key={state.name || state.displayName} value={state.displayName || state.name}>
            {state.displayName || state.name}
          </option>
        ))}
      </SelectField>

      <SelectField label="LGA" name="lga_name" value={form.lga_name} onChange={handleFormChange} required disabled={!form.state_name}>
        <option value="">Select LGA</option>
        {lgas.map((lga) => (
          <option key={lga} value={lga}>{lga}</option>
        ))}
      </SelectField>

      <InputField label="Area / Locality" name="area_locality" value={form.area_locality} onChange={handleFormChange} placeholder="e.g. Kutunku, Phase 1, Gwarinpa, Ikeja" required />

      <div className="lg:col-span-2 border-b border-slate-100 pb-1 mt-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Professional Background</h3>
      </div>
      <InputField label="Highest Education Level" name="highest_education" value={form.highest_education} onChange={handleFormChange} required />
      <InputField label="Years of Experience" type="number" name="years_of_experience" value={form.years_of_experience} onChange={handleFormChange} min="0" />
      <InputField label="Current Employment Status" name="current_employment_status" value={form.current_employment_status} onChange={handleFormChange} />

      <TextAreaField label="Residential Address" name="residential_address" value={form.residential_address} onChange={handleFormChange} required />
      <TextAreaField label="Skills / Qualifications" name="skills_qualifications" value={form.skills_qualifications} onChange={handleFormChange} />
      <TextAreaField label="Why are you suitable for this role?" name="suitability_reason" value={form.suitability_reason} onChange={handleFormChange} required className="lg:col-span-2" />

      <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-200/50 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <FaBriefcase className="text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-900">Application Access Fee</p>
            <p className="mt-1 text-3xl font-black text-primary-950">{formatCurrency(effectiveFee || 5000)}</p>
            <p className="mt-1 text-sm text-primary-700">
              On successful payment, your <strong>access code</strong> is shown on screen and also sent by email/SMS.
            </p>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || roles.length === 0}
        className="btn btn-primary w-full py-3.5 text-base lg:col-span-2"
      >
        {submitting ? (
          <><FaSpinner className="animate-spin mr-2" /> Saving...</>
        ) : (
          'Proceed to Payment'
        )}
      </button>
    </motion.form>
  );

  const renderDashboard = () => {
    const docsByType = new Set((application?.documents || []).map((doc) => doc.document_type));
    const canUpload = application?.payment_status === 'paid' && application?.access_code_used;
    const isSubmitted = application?.status && application.status !== 'draft';
    const canJoinInterview = application?.status === 'shortlisted' && application?.interview_activated;

    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-elevated">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Applicant Dashboard</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{application.reference_number || 'Draft application'}</h1>
              <p className="mt-2 text-sm text-slate-500">
                <FaBriefcase className="inline mr-1.5 text-primary-500" />
                {application.role_title} &mdash; {application.state_name}, {application.lga_name}, {application.area_locality}
              </p>
              {draftSaving && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                  <FaSpinner className="animate-spin" /> Saving draft...
                </p>
              )}
            </div>
            <span className={`inline-flex w-fit rounded-full px-4 py-1.5 text-xs font-semibold capitalize shadow-sm ${STATUS_STYLES[application.status] || 'bg-slate-100 text-slate-700'}`}>
              {String(application.status || 'draft').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoTile icon={<FaCheckCircle />} label="Payment" value={application.payment_status} color="emerald" />
            <InfoTile icon={<FaBriefcase />} label="Track" value={application.application_track} color="blue" />
            <InfoTile icon={<FaCalendarAlt />} label="Fee" value={formatCurrency(application.application_fee)} color="amber" />
            <InfoTile icon={<FaCalendarAlt />} label="Interview" value={formatDateTime(application.interview_date)} color="indigo" />
          </div>
        </section>

        {/* Access Code Banner */}
        {visibleAccessCode && !application.access_code_used && (
          <motion.section
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 shadow-elevated"
          >
            <div className="flex items-center gap-2 mb-1">
              <FaCheckCircle className="text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-900">Your Access Code</p>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-white px-5 py-3.5 text-2xl font-black tracking-[0.2em] text-emerald-900 shadow-inner border border-emerald-100">
                {visibleAccessCode}
              </div>
              <button type="button" onClick={copyAccessCode} className="btn inline-flex items-center justify-center gap-2 bg-emerald-700 text-white hover:bg-emerald-800 shadow-md">
                <FaCopy /> Copy Code
              </button>
            </div>
          </motion.section>
        )}

        {/* Payment Required */}
        {application.payment_status !== 'paid' && (
          <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-elevated">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
                <FaBriefcase className="text-sm" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">Application Access Fee Required</p>
                <p className="mt-1 text-sm text-amber-800">
                  Pay {formatCurrency(application.application_fee)} to receive your access code and unlock document upload.
                </p>
                <button type="button" onClick={initiatePayment} disabled={paymentBusy} className="btn mt-4 bg-amber-600 text-white hover:bg-amber-700 shadow-md">
                  {paymentBusy ? <><FaSpinner className="animate-spin mr-2" /> Opening payment...</> : 'Pay Application Access Fee'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Verify Access Code */}
        {application.payment_status === 'paid' && !application.access_code_used && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-elevated">
            <p className="text-sm font-semibold text-slate-900">Unlock Document Upload</p>
            <p className="mt-1 text-xs text-slate-500">Enter the access code you received via email/SMS after payment.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={accessCodeInput}
                onChange={(event) => setAccessCodeInput(event.target.value.toUpperCase())}
                className="input w-full sm:max-w-xs font-mono tracking-widest"
                placeholder="RH-CR-8X7K9"
              />
              <button type="button" onClick={verifyAccessCode} className="btn bg-slate-900 text-white hover:bg-slate-800">
                <FaCheck /> Verify Code
              </button>
            </div>
          </section>
        )}

        {/* Document Upload */}
        {canUpload && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-elevated"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                <FaFileUpload />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Required Documents</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">Upload all required documents below. Accepted formats: PDF, DOC, DOCX, JPG, PNG.</p>
            <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-primary-900">CV / Resume option</p>
                  <p className="mt-1 text-xs leading-5 text-primary-700">
                    Use the RentalHub NG CV template to generate a formatted PDF automatically, or upload your own CV below.
                  </p>
                </div>
                <button type="button" onClick={openCvBuilder} className="btn shrink-0 bg-primary-700 text-white hover:bg-primary-800">
                  Use Platform CV Template
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {DOCUMENT_FIELDS.map((field) => (
                <label key={field.name} className="rounded-xl border border-slate-200 p-4 hover:border-primary-200 transition-colors cursor-pointer">
                  <span className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    {field.label}
                    {field.required && <span className="badge-danger text-[10px] px-2 py-0.5">Required</span>}
                  </span>
                  <input
                    type="file"
                    name={field.name}
                    multiple={field.multiple}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleDocumentChange}
                    className="mt-3 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {docsByType.has(field.name === 'certificates' ? 'certificate' : field.name) && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <FaCheckCircle /> Uploaded
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={uploadDocuments} disabled={uploading} className="btn btn-primary">
                {uploading ? <><FaSpinner className="animate-spin mr-2" /> Uploading...</> : 'Upload Documents'}
              </button>
              <button type="button" onClick={submitApplication} disabled={isSubmitted} className={`btn ${isSubmitted ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                {isSubmitted ? <><FaCheckCircle className="mr-2" /> Application Submitted</> : 'Submit Application'}
              </button>
            </div>
          </motion.section>
        )}

        {/* Submitted Documents */}
        {application.documents?.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-elevated">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-slate-900">Submitted Documents</h2>
              <button
                type="button"
                onClick={() => downloadBlob(`/recruitment/documents/download-all/${application.id}`, `${application.reference_number || 'recruitment'}-documents.zip`)}
                className="btn btn-secondary justify-center text-xs"
              >
                <FaDownload className="mr-2" /> Download My Submitted Documents
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {application.documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => downloadBlob(`/recruitment/documents/download/${doc.id}`, doc.file_name || `${doc.document_type}.pdf`)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                >
                  <span className="truncate font-medium text-slate-700 group-hover:text-primary-700">
                    {doc.document_type}: {doc.file_name}
                  </span>
                  <FaDownload className="ml-2 shrink-0 text-slate-400 group-hover:text-primary-600" />
                </button>
              ))}
            </div>
          </section>
        )}

        {(interviewResult || application.interview_completed) && (
          <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6 shadow-elevated">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <FaCheckCircle />
              </div>
              <div>
                <p className="font-bold text-emerald-950">Interview Completed</p>
                <p className="mt-1 text-sm text-emerald-800">
                  Score: {Math.round(interviewResult?.score ?? application.interview_score ?? 0)}%.
                  Status: {(interviewResult?.passed ?? application.interview_passed) ? ' Passed' : ' Under admin review'}.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Rejected Status */}
        {application.status === 'rejected' && (
          <section className="rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
                <FaTimes />
              </div>
              <div>
                <p className="font-semibold text-red-900">Not Shortlisted</p>
                <p className="mt-1 text-sm text-red-700">Your application was not selected for this recruitment cycle. Thank you for your interest.</p>
              </div>
            </div>
          </section>
        )}

        {/* Interview Invitation */}
        {canJoinInterview && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-6 shadow-elevated"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                <FaVideo className="text-lg" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-indigo-950">Online Interview Scheduled</h2>
                <p className="mt-1 text-sm text-indigo-800">
                  <FaCalendarAlt className="inline mr-1.5" />
                  {formatDateTime(application.interview_date)}
                </p>
                <p className="mt-2 text-sm text-indigo-700">
                  Confirm your application phone number below to join your proctored interview.
                  Face detection monitoring will be active during the session.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={phoneCheck}
                    onChange={(event) => setPhoneCheck(event.target.value)}
                    className="input w-full sm:max-w-xs"
                    placeholder="Confirm phone number"
                  />
                  <button
                    type="button"
                    onClick={startInterview}
                    disabled={interviewStarting}
                    className="btn bg-gradient-to-r from-indigo-700 to-indigo-600 text-white hover:from-indigo-800 hover:to-indigo-700 shadow-lg shadow-indigo-500/20"
                  >
                    {interviewStarting ? (
                      <><FaSpinner className="animate-spin mr-2" /> Starting...</>
                    ) : (
                      <><FaVideo className="mr-2" /> Join Interview</>
                    )}
                  </button>
                </div>
                {interviewStarting && interviewStartupStep && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-indigo-800">
                    <FaSpinner className="animate-spin" /> {interviewStartupStep}
                  </p>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* Interview Room Overlay */}
        <AnimatePresence>
          {interviewMode && renderInterviewRoom()}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderInterviewRoom = () => {
    const question = interviewQuestions[questionIndex];

    const getFaceStatusBadge = () => {
      if (!faceDetectionReady) {
        return { icon: <FaShieldAlt />, text: 'Basic monitoring', color: 'bg-amber-500/20 text-amber-300' };
      }
      switch (faceStatus.status) {
        case 'monitoring':
          return { icon: <FaUser />, text: faceStatus.faces === 1 ? '1 face detected ✓' : 'No face detected', color: faceStatus.faces === 1 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300' };
        case 'warning':
          return { icon: <FaExclamationTriangle />, text: `Attention: ${faceStatus.faces || 0} faces`, color: 'bg-amber-500/20 text-amber-300' };
        case 'violation':
          return { icon: <FaTimes />, text: 'Violation detected', color: 'bg-red-500/20 text-red-300' };
        case 'locked':
          return { icon: <FaLock />, text: 'Interview locked', color: 'bg-red-500/20 text-red-300 animate-pulse' };
        default:
          return { icon: <FaShieldAlt />, text: 'Monitoring inactive', color: 'bg-slate-500/20 text-slate-300' };
      }
    };

    const faceBadge = getFaceStatusBadge();

    const timerPercentage = (questionTimeLeft / QUESTION_TIME_LIMIT_SECONDS) * 100;
    const timerColor = questionTimeLeft <= 5 ? 'bg-red-500' : questionTimeLeft <= 10 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-6"
      >
        {/* Top Navigation Bar */}
        <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white">
              RH
            </span>
            <span className="text-white/60 hidden sm:inline">Proctored Interview</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${faceBadge.color}`}>
              {faceBadge.icon} {faceBadge.text}
            </span>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {/* Video Panel */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4 shadow-elevated-lg">
            <div className="relative overflow-hidden rounded-2xl bg-black shadow-xl">
              <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />

              {/* Face Detection Overlay Canvas */}
              <canvas ref={faceCanvasRef} className="absolute inset-0 pointer-events-none" />

              {/* Timer Bar at bottom of video */}
              {!interviewLocked && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                  <motion.div
                    className={`h-full ${timerColor} transition-colors duration-500`}
                    initial={{ width: '100%' }}
                    animate={{ width: `${Math.max(timerPercentage, 0)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}

              {/* Locked Overlay */}
              {interviewLocked && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center bg-red-950/85 backdrop-blur-sm text-center"
                >
                  <div>
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/30">
                      <FaTimes className="text-3xl text-red-400" />
                    </div>
                    <p className="text-xl font-bold text-white">Interview Locked</p>
                    <p className="mt-2 text-sm text-red-200">A proctoring violation was detected.</p>
                  </div>
                </motion.div>
              )}

              {/* Timer Countdown Badge */}
              {!interviewLocked && (
                <div className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg ${
                  questionTimeLeft <= 5
                    ? 'bg-red-600 text-white animate-pulse'
                    : questionTimeLeft <= 10
                    ? 'bg-amber-500 text-white'
                    : 'bg-white/20 text-white backdrop-blur-sm'
                }`}>
                  <FaHourglassHalf />
                  {questionTimeLeft}s
                </div>
              )}

              {/* Proctoring Status */}
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-medium text-emerald-300 backdrop-blur-sm border border-emerald-500/10">
                  <FaVideo /> Camera
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-1 text-[10px] font-medium text-blue-300 backdrop-blur-sm border border-blue-500/10">
                  <FaMicrophoneAlt /> Audio
                </span>
                {faceDetectionReady ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm border ${
                    faceStatus.faces === 1 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/10' : 'bg-amber-500/20 text-amber-300 border-amber-500/10'
                  }`}>
                    <FaUser /> Face
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2.5 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm border border-slate-500/10">
                    <FaShieldAlt /> Motion
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Questions Panel */}
          <aside className="rounded-3xl border border-slate-200/10 bg-white p-5 shadow-elevated-lg">
            {/* Progress */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Question {Math.min(questionIndex + 1, interviewQuestions.length)} of {interviewQuestions.length}
              </p>
              <span className="text-xs font-bold text-slate-400">
                {Math.round(((questionIndex) / interviewQuestions.length) * 100)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-indigo-500"
                initial={{ width: 0 }}
                animate={{ width: `${((questionIndex) / interviewQuestions.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Question */}
            {question ? (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="mt-4 text-lg font-bold leading-7 text-slate-900">{question.question}</h2>

                {/* Options */}
                <div className="mt-5 space-y-2.5">
                  {['A', 'B', 'C', 'D'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => submitInterviewAnswer(option)}
                      disabled={interviewLocked}
                      className="group w-full rounded-xl border-2 border-slate-100 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600 group-hover:bg-primary-200 group-hover:text-primary-800 mr-2.5 transition-colors">
                        {option}
                      </span>
                      {question[`option_${option.toLowerCase()}`]}
                    </button>
                  ))}
                </div>

                {/* Voice Answer */}
                <button
                  type="button"
                  onClick={listenForAnswer}
                  disabled={interviewLocked}
                  className="btn mt-5 w-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <FaMicrophone className="mr-2" /> Say A, B, C, or D
                </button>

                {spokenAnswer && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 text-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-lg py-2"
                  >
                    Captured answer: {spokenAnswer}
                  </motion.p>
                )}
              </motion.div>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center text-slate-400">
                <FaSpinner className="animate-spin text-2xl mb-2" />
                <p className="text-sm">Loading questions...</p>
              </div>
            )}

            {/* Proctoring Rules */}
            <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                <FaShieldAlt /> Proctoring Rules
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                <li className="flex items-start gap-1.5"><FaCheckCircle className="mt-0.5 shrink-0 text-[9px]" /> Keep your face visible in the camera</li>
                <li className="flex items-start gap-1.5"><FaCheckCircle className="mt-0.5 shrink-0 text-[9px]" /> No other person should enter the frame</li>
                <li className="flex items-start gap-1.5"><FaCheckCircle className="mt-0.5 shrink-0 text-[9px]" /> You have {QUESTION_TIME_LIMIT_SECONDS}s per question</li>
              </ul>
            </div>
          </aside>
        </div>
      </motion.div>
    );
  };

  // ─── Loading State ────────────────────────────────────────
  const renderCvBuilderModal = () => (
    <AnimatePresence>
      {cvModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-elevated-lg sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-500">Platform CV Template</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Generate formatted CV PDF</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Complete the fields below and RentalHub NG will attach the generated PDF as your CV document.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCvModal(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close CV builder"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InputField label="Phone" name="phone" value={cvForm.phone} onChange={handleCvChange} />
              <InputField label="Email" name="email" type="email" value={cvForm.email} onChange={handleCvChange} />
              <InputField label="Address" name="address" value={cvForm.address} onChange={handleCvChange} className="sm:col-span-2" />
              <TextAreaField label="Professional bio" name="bio" value={cvForm.bio} onChange={handleCvChange} className="sm:col-span-2" />
              <TextAreaField label="Education" name="education" value={cvForm.education} onChange={handleCvChange} />
              <TextAreaField label="Experience" name="experience" value={cvForm.experience} onChange={handleCvChange} />
              <TextAreaField label="Skills / Qualifications" name="skills" value={cvForm.skills} onChange={handleCvChange} className="sm:col-span-2" />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCvModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={generatePlatformCv} disabled={generatingCv} className="btn btn-primary">
                {generatingCv ? (
                  <><FaSpinner className="mr-2 animate-spin" /> Generating...</>
                ) : (
                  'Generate and Attach CV'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (statusLoading || authLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100">
          <FaSpinner className="animate-spin text-xl text-primary-600" />
        </div>
        <p className="text-sm font-medium text-slate-400">Loading careers portal...</p>
      </div>
    );
  }

  if (!isActive) return renderClosed();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-elevated-lg sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">RentalHub NG Careers</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Recruitment Portal</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            Fill in your details below to apply. Pay the Application Access Fee, unlock your document upload with the access code, and track your application from draft to final decision.
          </p>
          {application && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <FaBriefcase className="text-blue-300" /> {application.role_title || 'No role'}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize backdrop-blur-sm ${STATUS_STYLES[application.status] || 'bg-white/10 text-white'}`}>
                {String(application.status || 'draft').replace(/_/g, ' ')}
              </span>
            </div>
          )}
        </motion.div>

        {/* Payment Busy Notice */}
        <AnimatePresence>
          {paymentBusy && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 to-blue-50 px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <FaSpinner className="animate-spin text-primary-600" />
                <p className="text-sm font-semibold text-primary-800">Verifying payment. Please wait...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        {application ? renderDashboard() : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <section className="rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-elevated sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Career Application Form</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Fill in your details below. All fields are stored for admin review.
                </p>
              </div>
              {renderApplicationForm()}
            </section>
          </motion.div>
        )}
      </section>
      {renderCvBuilderModal()}
    </div>
  );
}

function InputField({ label, className = '', ...props }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input {...props} className="input w-full" />
    </label>
  );
}

function SelectField({ label, children, className = '', ...props }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <select {...props} className="input w-full">
        {children}
      </select>
    </label>
  );
}

function TextAreaField({ label, className = '', ...props }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <textarea {...props} rows={4} className="input w-full resize-y" />
    </label>
  );
}

function InfoTile({ icon, label, value, color = 'blue' }) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-3.5 transition-all hover:shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        {icon && <span className={`${c.icon} text-xs`}>{icon}</span>}
      </div>
      <p className="break-words text-sm font-bold capitalize text-slate-900">
        {String(value || '-').replace(/_/g, ' ')}
      </p>
    </div>
  );
}
