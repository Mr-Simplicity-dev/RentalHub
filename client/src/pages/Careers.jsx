import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaBriefcase,
  FaCalendarAlt,
  FaCheck,
  FaCopy,
  FaDownload,
  FaFileUpload,
  FaLock,
  FaMicrophone,
  FaTimes,
  FaVideo,
} from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

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

  const [phoneCheck, setPhoneCheck] = useState('');
  const [interviewMode, setInterviewMode] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [spokenAnswer, setSpokenAnswer] = useState('');
  const [interviewLocked, setInterviewLocked] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const motionCanvasRef = useRef(null);
  const lastFrameRef = useRef(null);
  const violationCountRef = useRef(0);
  const motionTimerRef = useRef(null);

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
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/recruitment/my-application');
      const app = res.data?.data || null;
      setApplication(app);
      if (app?.access_code && !app.access_code_used) {
        setVisibleAccessCode(app.access_code);
      }
    } catch (error) {
      console.error('Failed to load applicant dashboard:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  useEffect(() => {
    loadMyApplication();
  }, [loadMyApplication]);

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
    if (!reference || !isAuthenticated) return;

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
        searchParams.delete('payment_reference');
        setSearchParams(searchParams, { replace: true });
      } catch (error) {
        toast.error(error.response?.data?.message || 'Payment verification failed');
      } finally {
        setPaymentBusy(false);
      }
    };

    verify();
  }, [isAuthenticated, loadMyApplication, searchParams, setSearchParams]);

  useEffect(() => {
    return () => {
      stopInterviewMedia();
    };
  }, []);

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

  const detectMotion = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || interviewLocked) return;
    const canvas = motionCanvasRef.current || document.createElement('canvas');
    motionCanvasRef.current = canvas;
    canvas.width = 96;
    canvas.height = 72;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;

    if (lastFrameRef.current) {
      let diff = 0;
      for (let i = 0; i < frame.length; i += 16) {
        diff += Math.abs(frame[i] - lastFrameRef.current[i]);
      }
      const score = diff / (frame.length / 16);
      if (score > 42) {
        violationCountRef.current += 1;
      } else {
        violationCountRef.current = Math.max(violationCountRef.current - 1, 0);
      }

      if (violationCountRef.current >= 5) {
        await reportInterviewViolation('unusual_movement', `Motion score exceeded safety threshold (${Math.round(score)})`);
      }
    }

    lastFrameRef.current = frame;
  };

  const reportInterviewViolation = async (type, details) => {
    if (interviewLocked) return;
    setInterviewLocked(true);
    try {
      await api.post('/recruitment/interview/violation', {
        violation_type: type,
        details,
      });
      toast.error('Interview locked due to detected violation');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Interview violation recorded');
    } finally {
      stopInterviewMedia();
      await loadMyApplication();
    }
  };

  const stopInterviewMedia = () => {
    if (motionTimerRef.current) {
      clearInterval(motionTimerRef.current);
      motionTimerRef.current = null;
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
  };

  const startInterview = async () => {
    if (!application) return;
    if (normalize(phoneCheck) !== normalize(application.phone_number)) {
      toast.error('Enter the same phone number used on your application');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

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

      const res = await api.get('/recruitment/interview/start');
      setInterviewQuestions(res.data?.data?.questions || []);
      setQuestionIndex(0);
      setInterviewMode(true);
      setInterviewLocked(false);
      violationCountRef.current = 0;
      motionTimerRef.current = setInterval(detectMotion, 1200);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Camera and microphone permission is required');
      stopInterviewMedia();
    }
  };

  const submitInterviewAnswer = async (answer) => {
    const question = interviewQuestions[questionIndex];
    if (!question || interviewLocked) return;
    try {
      await api.post('/recruitment/interview/answer', {
        question_id: question.id,
        answer: answer.toUpperCase(),
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

  const completeInterview = async () => {
    try {
      await api.post('/recruitment/interview/complete');
      toast.success('Interview completed');
      stopInterviewMedia();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await uploadRecording();
      setInterviewMode(false);
      await loadMyApplication();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete interview');
    }
  };

  const uploadRecording = async () => {
    const chunks = recordingChunksRef.current || [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('recording', blob, `recruitment-interview-${Date.now()}.webm`);
    formData.append('violation_log', interviewLocked ? 'Interview locked by motion monitor' : '');
    try {
      await api.post('/recruitment/interview/recording', formData);
    } catch (error) {
      console.error('Interview recording upload failed:', error);
    }
  };

  const renderClosed = () => (
    <section className="mx-auto flex min-h-[58vh] max-w-3xl items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <FaLock />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Recruitment is currently closed</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Career applications are not open right now. When Super Admin reopens recruitment, the Career link will appear in the footer.
        </p>
      </div>
    </section>
  );

  const renderLoginPrompt = () => (
    <section className="mx-auto flex min-h-[58vh] max-w-3xl items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <FaBriefcase />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Sign in to apply</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Recruitment uses your existing RentalHub NG account. There is no separate career registration.
        </p>
        <Link to="/login" className="mt-5 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Login to continue
        </Link>
      </div>
    </section>
  );

  const renderApplicationForm = () => (
    <form onSubmit={startApplication} className="grid gap-4 lg:grid-cols-2">
      <SelectField label="Role Applying For" name="role_id" value={form.role_id} onChange={handleFormChange} required>
        <option value="">Select role</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.title} - {formatCurrency(form.application_track === 'premium' ? role.premium_fee : role.application_fee)}
          </option>
        ))}
      </SelectField>

      <SelectField label="Application Track" name="application_track" value={form.application_track} onChange={handleFormChange}>
        <option value="standard">Standard - written application</option>
        <option value="premium">Premium - platform CV and digital tools</option>
      </SelectField>

      <InputField label="Full Name" name="full_name" value={form.full_name} onChange={handleFormChange} required />
      <InputField label="Phone Number" name="phone_number" value={form.phone_number} onChange={handleFormChange} required />
      <InputField label="Email Address" type="email" name="email_address" value={form.email_address} onChange={handleFormChange} required />
      <InputField label="Date of Birth" type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleFormChange} />

      <SelectField label="State" name="state_name" value={form.state_name} onChange={handleFormChange} required>
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

      <InputField label="Area / Locality" name="area_locality" value={form.area_locality} onChange={handleFormChange} placeholder="Kutunku, Phase 1, Gwarinpa, Ikeja" required />
      <InputField label="Years of Experience" type="number" name="years_of_experience" value={form.years_of_experience} onChange={handleFormChange} min="0" />
      <InputField label="Highest Education Level" name="highest_education" value={form.highest_education} onChange={handleFormChange} required />
      <InputField label="Current Employment Status" name="current_employment_status" value={form.current_employment_status} onChange={handleFormChange} />

      <TextAreaField label="Residential Address" name="residential_address" value={form.residential_address} onChange={handleFormChange} required />
      <TextAreaField label="Skills / Qualifications" name="skills_qualifications" value={form.skills_qualifications} onChange={handleFormChange} />
      <TextAreaField label="Why are you suitable for this role?" name="suitability_reason" value={form.suitability_reason} onChange={handleFormChange} required className="lg:col-span-2" />

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 lg:col-span-2">
        <p className="text-sm font-semibold text-blue-900">Application Access Fee</p>
        <p className="mt-1 text-2xl font-bold text-blue-950">{formatCurrency(effectiveFee || 5000)}</p>
        <p className="mt-1 text-sm text-blue-800">
          On successful payment, your access code is shown on screen and also sent by email/SMS.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting || roles.length === 0}
        className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2"
      >
        {submitting ? 'Saving...' : 'Proceed to Payment'}
      </button>
    </form>
  );

  const renderDashboard = () => {
    const docsByType = new Set((application?.documents || []).map((doc) => doc.document_type));
    const canUpload = application?.payment_status === 'paid' && application?.access_code_used;
    const isSubmitted = application?.status && application.status !== 'draft';
    const canJoinInterview = application?.status === 'shortlisted' && application?.interview_activated;

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Applicant Dashboard</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{application.reference_number || 'Draft application'}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {application.role_title} - {application.state_name}, {application.lga_name}, {application.area_locality}
              </p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[application.status] || 'bg-slate-100 text-slate-700'}`}>
              {String(application.status || 'draft').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoTile label="Payment" value={application.payment_status} />
            <InfoTile label="Track" value={application.application_track} />
            <InfoTile label="Fee" value={formatCurrency(application.application_fee)} />
            <InfoTile label="Interview" value={formatDateTime(application.interview_date)} />
          </div>
        </section>

        {visibleAccessCode && !application.access_code_used && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-emerald-900">Your Access Code</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-white px-4 py-3 text-2xl font-black tracking-[0.16em] text-emerald-900 shadow-sm">
                {visibleAccessCode}
              </div>
              <button type="button" onClick={copyAccessCode} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                <FaCopy /> Copy
              </button>
            </div>
          </section>
        )}

        {application.payment_status !== 'paid' && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Application Access Fee required</p>
            <p className="mt-1 text-sm text-amber-800">Pay {formatCurrency(application.application_fee)} to receive your access code and unlock document upload.</p>
            <button type="button" onClick={initiatePayment} disabled={paymentBusy} className="mt-4 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {paymentBusy ? 'Opening payment...' : 'Pay Application Access Fee'}
            </button>
          </section>
        )}

        {application.payment_status === 'paid' && !application.access_code_used && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Unlock document upload</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={accessCodeInput}
                onChange={(event) => setAccessCodeInput(event.target.value.toUpperCase())}
                className="input w-full"
                placeholder="RH-CR-8X7K9"
              />
              <button type="button" onClick={verifyAccessCode} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                Verify Code
              </button>
            </div>
          </section>
        )}

        {canUpload && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FaFileUpload className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Required Documents</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {DOCUMENT_FIELDS.map((field) => (
                <label key={field.name} className="rounded-xl border border-slate-200 p-4">
                  <span className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    {field.label}
                    {field.required && <span className="text-xs text-red-500">Required</span>}
                  </span>
                  <input
                    type="file"
                    name={field.name}
                    multiple={field.multiple}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleDocumentChange}
                    className="mt-3 block w-full text-sm"
                  />
                  {docsByType.has(field.name === 'certificates' ? 'certificate' : field.name) && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <FaCheck /> Uploaded
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={uploadDocuments} disabled={uploading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload Documents'}
              </button>
              <button type="button" onClick={submitApplication} disabled={isSubmitted} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {isSubmitted ? 'Application Submitted' : 'Submit Application'}
              </button>
            </div>
          </section>
        )}

        {application.documents?.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">Submitted Documents</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {application.documents.map((doc) => (
                <a key={doc.id} href={`/api/recruitment/documents/download/${doc.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                  <span className="truncate">{doc.document_type}: {doc.file_name}</span>
                  <FaDownload className="ml-2 shrink-0 text-slate-500" />
                </a>
              ))}
            </div>
          </section>
        )}

        {application.status === 'rejected' && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-semibold">Not Shortlisted</p>
            <p className="mt-1 text-sm">Your application was not selected for this recruitment cycle.</p>
          </section>
        )}

        {canJoinInterview && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-indigo-950">
              <FaCalendarAlt /> Online Interview
            </h2>
            <p className="mt-2 text-sm text-indigo-800">Scheduled for {formatDateTime(application.interview_date)}. Enter your application phone number before joining.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={phoneCheck}
                onChange={(event) => setPhoneCheck(event.target.value)}
                className="input w-full"
                placeholder="Confirm phone number"
              />
              <button type="button" onClick={startInterview} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">
                <FaVideo /> Join Interview
              </button>
            </div>
          </section>
        )}

        {interviewMode && renderInterviewRoom()}
      </div>
    );
  };

  const renderInterviewRoom = () => {
    const question = interviewQuestions[questionIndex];
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 px-4 py-6 text-white">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
              {interviewLocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-950/85 text-center">
                  <div>
                    <FaTimes className="mx-auto mb-2 text-3xl" />
                    <p className="font-bold">Interview locked</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1"><FaVideo /> Camera active</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-3 py-1"><FaMicrophone /> Microphone active</span>
              <span className="rounded-full bg-amber-500/20 px-3 py-1">Motion monitoring active</span>
            </div>
          </section>

          <aside className="rounded-2xl border border-white/10 bg-white p-4 text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Question {Math.min(questionIndex + 1, interviewQuestions.length)} of {interviewQuestions.length}
            </p>
            {question ? (
              <>
                <h2 className="mt-2 text-lg font-bold leading-7">{question.question}</h2>
                <div className="mt-4 space-y-2">
                  {['A', 'B', 'C', 'D'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => submitInterviewAnswer(option)}
                      disabled={interviewLocked}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="font-bold">{option}.</span> {question[`option_${option.toLowerCase()}`]}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={listenForAnswer} disabled={interviewLocked} className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  Say A, B, C, or D
                </button>
                {spokenAnswer && <p className="mt-2 text-center text-sm text-emerald-700">Captured answer: {spokenAnswer}</p>}
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Loading questions...</p>
            )}
          </aside>
        </div>
      </div>
    );
  };

  if (statusLoading || authLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500">Loading careers...</div>;
  }

  if (!isActive) return renderClosed();
  if (!isAuthenticated) return renderLoginPrompt();

  return (
    <div className="bg-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="mb-6 rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">RentalHub NG Careers</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Recruitment Applicant Portal</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
            Apply with your existing RentalHub NG login. Pay the Application Access Fee, unlock your document upload with the access code, and track your application from draft to final decision.
          </p>
        </div>

        {paymentBusy && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
            Verifying payment. Please wait...
          </div>
        )}

        {application ? renderDashboard() : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-slate-900">Career Application Form</h2>
              <p className="mt-1 text-sm text-slate-600">All fields are stored for admin PDF reports, including your free-text area/locality.</p>
            </div>
            {renderApplicationForm()}
          </section>
        )}
      </section>
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

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold capitalize text-slate-900">{String(value || '-').replace(/_/g, ' ')}</p>
    </div>
  );
}
