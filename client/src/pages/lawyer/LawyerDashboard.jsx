import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import ApprovalTimeline from '../../components/common/ApprovalTimeline';
import api from '../../services/api';
import LawyerVerification from './LawyerVerification';

const EVIDENCE_STATUSES = ['pending', 'verified', 'flagged', 'rejected'];

const STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

const MIGRATION_STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'outgoing', label: 'Outgoing' },
  { key: 'incoming', label: 'Incoming' },
  { key: 'final', label: 'Final' },
];

const PROGRAM_STEPS = [
  { key: 'broadcast', label: 'Open' },
  { key: 'applied', label: 'Applied' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'listed', label: 'Listed' },
];

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};

const staggerList = {
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getStatusBadge = (status) => {
  if (status === 'resolved') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-700';
  }

  if (status === 'in_progress' || status === 'active') {
    return 'border-blue-200 bg-blue-100 text-blue-700';
  }

  return 'border-amber-200 bg-amber-100 text-amber-700';
};

const getEvidenceStatusBadge = (status) => {
  if (status === 'verified') return 'border-emerald-200 bg-emerald-100 text-emerald-700';
  if (status === 'flagged') return 'border-orange-200 bg-orange-100 text-orange-700';
  if (status === 'rejected') return 'border-red-200 bg-red-100 text-red-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
};

const getWorkflowBadge = (status) => {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'border-red-200 bg-red-100 text-red-700';
  return 'border-amber-200 bg-amber-100 text-amber-700';
};

const resolveMigrationStep = (request) => {
  if (!request) return 'requested';
  if (request.super_review_status || request.status !== 'pending') return 'final';
  if (request.incoming_status && request.incoming_status !== 'pending') return 'incoming';
  if (request.outgoing_status && request.outgoing_status !== 'pending') return 'outgoing';
  return 'requested';
};

const resolveMigrationNote = (request) =>
  request?.super_review_note ||
  request?.incoming_review_note ||
  request?.outgoing_review_note ||
  request?.review_note ||
  '';

const resolveProgramStep = (application, hasBroadcast) => {
  if (application?.directory_active) return 'listed';
  if (application?.status === 'approved' || application?.status === 'rejected') return 'reviewed';
  if (application) return 'applied';
  return hasBroadcast ? 'broadcast' : 'broadcast';
};

const resolveProgramFinalStatus = (application) => {
  if (!application) return 'pending';
  if (application.directory_active) return 'approved';
  return application.status || 'pending';
};

const getRoleTheme = ({ showSuperLawyerPanel, showStateLawyerPanel }) => {
  if (showSuperLawyerPanel) {
    return {
      pill: 'from-slate-900 via-slate-800 to-indigo-900',
      accent: 'text-indigo-700',
      softPanel: 'border-indigo-200 bg-indigo-50',
      statPanel: 'from-slate-900 via-slate-800 to-indigo-900',
      label: 'Super Lawyer',
    };
  }

  if (showStateLawyerPanel) {
    return {
      pill: 'from-emerald-700 via-emerald-600 to-teal-600',
      accent: 'text-emerald-700',
      softPanel: 'border-emerald-200 bg-emerald-50',
      statPanel: 'from-emerald-700 via-emerald-600 to-teal-600',
      label: 'State Lawyer',
    };
  }

  return {
    pill: 'from-sky-700 via-sky-600 to-cyan-600',
    accent: 'text-sky-700',
    softPanel: 'border-sky-200 bg-sky-50',
    statPanel: 'from-sky-700 via-sky-600 to-cyan-600',
    label: 'Lawyer',
  };
};

const StatCard = ({ label, value, helper, toneClass }) => (
  <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
      {label}
    </p>
    <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
    {helper ? <p className="mt-2 text-sm text-slate-600">{helper}</p> : null}
  </div>
);

const LawyerDashboardContent = ({
  dashboardTitle = 'Lawyer Dashboard',
  profileLabel = 'Lawyer Profile',
  nameFallback = 'Lawyer',
  dashboardSubtitle = 'Manage disputes, verify evidence, and maintain legal case notes.',
  rolePillLabel = 'Lawyer',
  showSuperLawyerPanel = false,
  showStateLawyerPanel = false,
}) => {
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [disputeDetails, setDisputeDetails] = useState(null);
  const [evidenceVerification, setEvidenceVerification] = useState([]);
  const [caseNotes, setCaseNotes] = useState([]);
  const [evidenceNoteDrafts, setEvidenceNoteDrafts] = useState({});
  const [summaryDraft, setSummaryDraft] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteVisible, setNewNoteVisible] = useState(false);
  const [lawyerProfile, setLawyerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [verificationBusyId, setVerificationBusyId] = useState(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [programLoading, setProgramLoading] = useState(true);
  const [applyLoading, setApplyLoading] = useState(false);
  const [programData, setProgramData] = useState({
    broadcast: null,
    application: null,
  });
  const [migrationRequests, setMigrationRequests] = useState([]);
  const [migrationForm, setMigrationForm] = useState({ to_state: '', reason: '' });
  const [migrationLoading, setMigrationLoading] = useState(false);

  const roleTheme = getRoleTheme({ showSuperLawyerPanel, showStateLawyerPanel });

  const loadLawyerProfile = async () => {
    try {
      const [res, migrationRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/state-migrations/my').catch(() => ({ data: { data: [] } })),
      ]);
      setLawyerProfile(res.data?.data || null);
      setMigrationRequests(migrationRes.data?.data || []);
    } catch {
      setLawyerProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const submitMigrationRequest = async () => {
    if (!migrationForm.to_state || !migrationForm.reason.trim()) {
      toast.error('Please select target state and provide reason');
      return;
    }

    try {
      setMigrationLoading(true);
      const res = await api.post('/state-migrations/request', {
        to_state: migrationForm.to_state,
        reason: migrationForm.reason,
      });
      toast.success(res.data?.message || 'Migration request submitted');
      setMigrationForm({ to_state: '', reason: '' });
      const myRes = await api.get('/state-migrations/my');
      setMigrationRequests(myRes.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit migration request');
    } finally {
      setMigrationLoading(false);
    }
  };

  const loadAuthorizedProperties = async () => {
    try {
      const res = await api.get('/legal/properties');
      const rows = res.data?.data || [];
      setProperties(rows);
      if (rows.length && !selectedProperty) {
        setSelectedProperty(rows[0]);
      }
    } catch {
      toast.error('Failed to load authorized properties');
    } finally {
      setLoading(false);
    }
  };

  const loadDisputes = async (propertyId, preferredDisputeId = null) => {
    try {
      const res = await api.get(`/legal/property/${propertyId}/disputes`);
      const rows = res.data?.data || [];
      setDisputes(rows);

      if (!rows.length) {
        setSelectedDispute(null);
        setDisputeDetails(null);
        setEvidenceVerification([]);
        setCaseNotes([]);
        setSummaryDraft('');
        return;
      }

      const nextDispute = preferredDisputeId
        ? rows.find((item) => String(item.id) === String(preferredDisputeId)) || rows[0]
        : rows[0];

      setSelectedDispute(nextDispute);
      await loadDisputeWorkspace(nextDispute.id);
    } catch {
      toast.error('Failed to load disputes for this property');
    }
  };

  const loadDisputeWorkspace = async (disputeId) => {
    try {
      setWorkspaceLoading(true);
      const [disputeRes, verificationRes, notesRes] = await Promise.all([
        api.get(`/disputes/${disputeId}`),
        api.get(`/legal/disputes/${disputeId}/evidence/verification`),
        api.get(`/legal/disputes/${disputeId}/notes`),
      ]);

      const payload = disputeRes.data?.data || null;
      const verificationRows = verificationRes.data?.data || [];
      const noteRows = notesRes.data?.data || [];

      setDisputeDetails(payload);
      setEvidenceVerification(verificationRows);
      setCaseNotes(noteRows);
      setSummaryDraft(payload?.dispute?.lawyer_summary || '');

      setEvidenceNoteDrafts((current) => {
        const next = { ...current };
        verificationRows.forEach((row) => {
          if (typeof next[row.id] === 'undefined') {
            next[row.id] = row.lawyer_notes || '';
          }
        });
        return next;
      });
    } catch {
      toast.error('Failed to load dispute workspace');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const loadPlatformLawyerProgram = async () => {
    try {
      const res = await api.get('/legal/platform-lawyer-program');
      setProgramData({
        broadcast: res.data?.data?.broadcast || null,
        application: res.data?.data?.application || null,
      });
    } catch {
      setProgramData({ broadcast: null, application: null });
    } finally {
      setProgramLoading(false);
    }
  };

  useEffect(() => {
    loadAuthorizedProperties();
    loadLawyerProfile();
    loadPlatformLawyerProgram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedProperty?.id) {
      loadDisputes(selectedProperty.id, selectedDispute?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty?.id]);

  const applyToProgram = async () => {
    setApplyLoading(true);
    try {
      const res = await api.post('/legal/platform-lawyer-program/apply');
      toast.success(res.data?.message || 'Application submitted');
      await loadPlatformLawyerProgram();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleEvidenceVerification = async (evidenceId, status) => {
    if (!selectedDispute?.id) return;

    try {
      setVerificationBusyId(evidenceId);
      const notes = evidenceNoteDrafts[evidenceId] || '';
      const res = await api.patch(
        `/legal/disputes/${selectedDispute.id}/evidence/${evidenceId}/verify`,
        {
          verification_status: status,
          notes,
        }
      );
      toast.success(res.data?.message || 'Evidence updated');
      await loadDisputeWorkspace(selectedDispute.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to verify evidence');
    } finally {
      setVerificationBusyId(null);
    }
  };

  const handleSaveSummary = async () => {
    if (!selectedDispute?.id || !summaryDraft.trim()) {
      toast.error('Enter a dispute summary first');
      return;
    }

    try {
      setSummarySaving(true);
      const res = await api.patch(`/legal/disputes/${selectedDispute.id}/summary`, {
        lawyer_summary: summaryDraft,
      });
      toast.success(res.data?.message || 'Summary saved');
      await loadDisputeWorkspace(selectedDispute.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save summary');
    } finally {
      setSummarySaving(false);
    }
  };

  const handleCreateCaseNote = async () => {
    if (!selectedDispute?.id || !newNoteContent.trim()) {
      toast.error('Case note content is required');
      return;
    }

    try {
      setNoteSaving(true);
      const res = await api.post(`/legal/disputes/${selectedDispute.id}/notes`, {
        title: newNoteTitle.trim() || null,
        content: newNoteContent.trim(),
        is_visible_to_client: newNoteVisible,
      });
      toast.success(res.data?.message || 'Case note added');
      setNewNoteTitle('');
      setNewNoteContent('');
      setNewNoteVisible(false);
      await loadDisputeWorkspace(selectedDispute.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add case note');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteCaseNote = async (noteId) => {
    if (!selectedDispute?.id) return;

    try {
      const res = await api.delete(`/legal/disputes/${selectedDispute.id}/notes/${noteId}`);
      toast.success(res.data?.message || 'Case note deleted');
      await loadDisputeWorkspace(selectedDispute.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete case note');
    }
  };

  const summaryInfo = useMemo(() => {
    if (!disputeDetails?.dispute) return null;

    const dispute = disputeDetails.dispute;
    return {
      byName: dispute.lawyer_summary_by_name || 'Unknown',
      at: dispute.lawyer_summary_at,
    };
  }, [disputeDetails]);

  const workspaceStats = useMemo(() => {
    const pendingEvidence = evidenceVerification.filter(
      (item) => !item.verification_status || item.verification_status === 'pending'
    ).length;

    return [
      {
        label: 'Assigned Properties',
        value: properties.length,
        helper: 'Properties you can legally act on',
        toneClass: 'border-sky-100 bg-white',
      },
      {
        label: 'Active Disputes',
        value: disputes.length,
        helper: selectedProperty?.title || 'Select a property to focus workspace',
        toneClass: 'border-indigo-100 bg-white',
      },
      {
        label: 'Pending Evidence',
        value: pendingEvidence,
        helper: selectedDispute ? `Dispute #${selectedDispute.id}` : 'Pending review items',
        toneClass: 'border-amber-100 bg-white',
      },
      {
        label: 'Case Notes',
        value: caseNotes.length,
        helper: 'Internal and client-visible notes',
        toneClass: 'border-emerald-100 bg-white',
      },
    ];
  }, [properties.length, disputes.length, evidenceVerification, caseNotes.length, selectedProperty, selectedDispute]);

  const quickActions = useMemo(() => {
    const base = [
      {
        to: '/verify-case',
        label: 'Evidence Queue',
        description: 'Review integrity checks and dispute uploads.',
      },
      {
        to: '/messages',
        label: 'Messages',
        description: 'Continue escalations and legal coordination.',
      },
      {
        to: '/lawyers',
        label: 'Public Directory',
        description: 'Preview the lawyer listing and profile presence.',
      },
    ];

    if (showSuperLawyerPanel) {
      return [
        {
          to: '/verify-case',
          label: 'Cross-State Review',
          description: 'Open the shared evidence queue for escalated matters.',
        },
        ...base.slice(1),
      ];
    }

    if (showStateLawyerPanel) {
      return [
        {
          to: '/verify-case',
          label: 'State Evidence',
          description: 'Stay on top of evidence reviews inside your jurisdiction.',
        },
        ...base.slice(1),
      ];
    }

    return base;
  }, [showSuperLawyerPanel, showStateLawyerPanel]);

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-xl"
        >
          <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <p className="mt-4 text-sm font-medium text-slate-600">Loading legal workspace...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {showSuperLawyerPanel ? (
          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="relative mb-6 overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-8 text-white shadow-2xl"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_40%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">
                  Super Lawyer Desk
                </p>
                <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                  Cross-state legal review without changing your workflow
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Your evidence, dispute, case-note, migration, and program actions stay on the same endpoints.
                  This layer only sharpens visibility for super lawyer coordination.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/verify-case"
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Review Evidence Queue
                </Link>
                <Link
                  to="/messages"
                  className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  Open Escalations
                </Link>
              </div>
            </div>
          </motion.section>
        ) : null}

        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
        >
          <div className={`bg-gradient-to-r ${roleTheme.pill} px-6 py-6 text-white`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
                  {roleTheme.label} Workspace
                </p>
                <h2 className="mt-2 text-3xl font-bold">{dashboardTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-white/80">{dashboardSubtitle}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
                  {rolePillLabel}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">
                  Assigned State: {lawyerProfile?.assigned_state || 'Not configured'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-6 py-5 md:grid-cols-3">
            {quickActions.map((action) => (
              <motion.div key={action.to} whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                <Link
                  to={action.to}
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                >
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{action.description}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.div
          variants={staggerList}
          initial="initial"
          animate="animate"
          className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {workspaceStats.map((stat) => (
            <motion.div key={stat.label} variants={fadeUp}>
              <StatCard {...stat} />
            </motion.div>
          ))}
        </motion.div>

        {showStateLawyerPanel ? (
          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-emerald-900">State Lawyer Coordination</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  This dashboard keeps your assigned-state work visible without changing any case, evidence, or migration logic.
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                Scope: {lawyerProfile?.assigned_state || 'Not configured'}
              </div>
            </div>
          </motion.section>
        ) : null}

        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="mb-6 rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 p-6 shadow-sm"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                {profileLabel}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {lawyerProfile?.full_name || nameFallback}
              </h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p>Email: {lawyerProfile?.email || '-'}</p>
                <p>Phone: {lawyerProfile?.phone || '-'}</p>
                <p>Chamber: {lawyerProfile?.chamber_name || 'No chamber provided'}</p>
                <p>Jurisdiction: {lawyerProfile?.assigned_state || 'Not configured'}</p>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${roleTheme.softPanel}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Profile Access
              </p>
              <p className={`mt-2 text-base font-semibold ${roleTheme.accent}`}>
                {roleTheme.label} visibility enabled
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Identity-gated access remains unchanged. This panel only improves coordination and status visibility.
              </p>
            </div>
          </div>
        </motion.section>

        <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">State Migration Request</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Submit a migration request and track each approval stage without altering the current flow.
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getWorkflowBadge(migrationRequests[0]?.status || 'pending')}`}>
                {migrationRequests[0]?.status ? `Latest: ${migrationRequests[0].status}` : 'No active request'}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <select
                value={migrationForm.to_state}
                onChange={(e) => setMigrationForm((prev) => ({ ...prev, to_state: e.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              >
                <option value="">Select target state</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>

              <input
                value={migrationForm.reason}
                onChange={(e) => setMigrationForm((prev) => ({ ...prev, reason: e.target.value }))}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 md:col-span-2"
                placeholder="Reason for migration request"
              />
            </div>

            <button
              type="button"
              onClick={submitMigrationRequest}
              disabled={migrationLoading}
              className={`mt-4 rounded-2xl bg-gradient-to-r ${roleTheme.pill} px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {migrationLoading ? 'Submitting...' : 'Apply for State Migration'}
            </button>

            <div className="mt-6 space-y-3">
              {migrationRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  No migration requests yet.
                </div>
              ) : (
                migrationRequests.slice(0, 3).map((request) => {
                  const latestNote = resolveMigrationNote(request);

                  return (
                    <motion.div
                      key={request.id}
                      variants={fadeUp}
                      initial="initial"
                      animate="animate"
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {request.from_state || 'Current state'} to {request.to_state}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{request.reason}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            Submitted {formatDateTime(request.requested_at || request.created_at)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full border px-2.5 py-1 font-semibold ${getWorkflowBadge(request.status)}`}>
                            Final: {request.status}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 font-semibold ${getWorkflowBadge(request.outgoing_status || 'pending')}`}>
                            Outgoing: {request.outgoing_status || 'pending'}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 font-semibold ${getWorkflowBadge(request.incoming_status || 'pending')}`}>
                            Incoming: {request.incoming_status || 'pending'}
                          </span>
                        </div>
                      </div>

                      <ApprovalTimeline
                        steps={MIGRATION_STEPS}
                        currentStepKey={resolveMigrationStep(request)}
                        finalStatus={request.status || 'pending'}
                      />

                      {latestNote ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                          Review note: {latestNote}
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.section>

          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">RentalHub NG Lawyer Program</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Apply from your dashboard and track review progress using the same backend flow already in place.
                </p>
              </div>
              {programData.application?.status ? (
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getWorkflowBadge(programData.application.status)}`}>
                  {programData.application.status}
                </span>
              ) : null}
            </div>

            {programLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-sm font-semibold text-slate-900">
                        {programData.broadcast?.title || 'No active recruitment broadcast'}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                        {programData.broadcast?.message ||
                          'Recruitment is currently closed. Your existing application status is still preserved.'}
                      </p>
                      {programData.broadcast?.created_at ? (
                        <p className="mt-3 text-xs text-slate-500">
                          Broadcast sent {formatDateTime(programData.broadcast.created_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      {programData.application?.directory_active ? 'Directory listing active' : 'Directory listing pending'}
                    </div>
                  </div>

                  <ApprovalTimeline
                    steps={PROGRAM_STEPS}
                    currentStepKey={resolveProgramStep(programData.application, Boolean(programData.broadcast))}
                    finalStatus={resolveProgramFinalStatus(programData.application)}
                  />
                </div>

                {programData.application?.review_note ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    Review note: {programData.application.review_note}
                  </div>
                ) : null}

                {programData.application?.reviewed_at ? (
                  <p className="text-xs text-slate-500">
                    Reviewed by {programData.application.reviewed_by_name || 'Platform team'} on{' '}
                    {formatDateTime(programData.application.reviewed_at)}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={applyToProgram}
                  disabled={
                    applyLoading ||
                    !programData.broadcast ||
                    programData.application?.status === 'pending' ||
                    programData.application?.status === 'approved'
                  }
                  className={`rounded-2xl bg-gradient-to-r ${roleTheme.pill} px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {programData.application?.status === 'approved'
                    ? 'Already Approved'
                    : programData.application?.status === 'pending'
                      ? 'Application Pending'
                      : applyLoading
                        ? 'Submitting...'
                        : 'Apply To Serve On RentalHub NG'}
                </button>
              </div>
            )}
          </motion.section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <motion.aside
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:h-fit"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Authorized Properties</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Select a property to keep your dispute workspace focused.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {properties.length}
              </span>
            </div>

            {properties.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No authorized properties available.
              </div>
            ) : (
              <motion.div
                variants={staggerList}
                initial="initial"
                animate="animate"
                className="mt-5 space-y-2"
              >
                {properties.map((property) => (
                  <motion.button
                    key={property.id}
                    variants={fadeUp}
                    type="button"
                    onClick={() => setSelectedProperty(property)}
                    whileHover={{ y: -1 }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedProperty?.id === property.id
                        ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                        : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <p className="font-semibold">{property.title}</p>
                    <p className={`mt-1 text-xs ${selectedProperty?.id === property.id ? 'text-slate-200' : 'text-slate-500'}`}>
                      Client: {property.client_name || 'Unknown'}
                    </p>
                    <p className={`text-xs ${selectedProperty?.id === property.id ? 'text-slate-200' : 'text-slate-500'}`}>
                      Assigned by {property.assigned_by_name || 'Unknown'}
                    </p>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.aside>

          <div className="space-y-6">
            <motion.section
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Disputes {selectedProperty ? `for ${selectedProperty.title}` : ''}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose a dispute to open evidence, notes, summary, and timeline tools.
                  </p>
                </div>
                {selectedProperty ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {disputes.length} dispute{disputes.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>

              {!selectedProperty ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                  Select a property from the left to view disputes.
                </div>
              ) : disputes.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                  No disputes found for this property.
                </div>
              ) : (
                <motion.div
                  variants={staggerList}
                  initial="initial"
                  animate="animate"
                  className="mt-5 grid gap-3 md:grid-cols-2"
                >
                  {disputes.map((dispute) => (
                    <motion.button
                      key={dispute.id}
                      variants={fadeUp}
                      type="button"
                      onClick={async () => {
                        setSelectedDispute(dispute);
                        await loadDisputeWorkspace(dispute.id);
                      }}
                      whileHover={{ y: -2 }}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selectedDispute?.id === dispute.id
                          ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">Dispute #{dispute.id}</p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            selectedDispute?.id === dispute.id
                              ? 'border-white/20 bg-white/10 text-white'
                              : getStatusBadge(dispute.status)
                          }`}
                        >
                          {dispute.status}
                        </span>
                      </div>
                      <p className={`mt-2 line-clamp-2 text-sm ${selectedDispute?.id === dispute.id ? 'text-slate-100' : 'text-slate-700'}`}>
                        {dispute.description || 'No description provided.'}
                      </p>
                      <p className={`mt-2 text-xs ${selectedDispute?.id === dispute.id ? 'text-slate-200' : 'text-slate-500'}`}>
                        Opened by {dispute.opened_by_name || 'Unknown'} vs {dispute.against_name || 'Unknown'}
                      </p>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </motion.section>

            <AnimatePresence>
              {selectedDispute ? (
                <motion.section
                  key={selectedDispute.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">
                        Dispute Workspace #{selectedDispute.id}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Evidence review, case notes, summary, and timeline stay on the same workflow you already use.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                      <Link
                        className="rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                        to={`/dispute/${selectedDispute.id}`}
                      >
                        Open Full Trace
                      </Link>
                      <Link
                        className={`rounded-xl bg-gradient-to-r ${roleTheme.pill} px-3 py-2 font-medium text-white`}
                        to={`/verify-case?dispute=${selectedDispute.id}`}
                      >
                        Verify Integrity
                      </Link>
                    </div>
                  </div>

                  {workspaceLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                      <div className="space-y-6">
                        <div className="rounded-3xl border border-slate-200 p-5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-base font-semibold text-slate-900">Evidence Verification</h4>
                              <p className="mt-1 text-sm text-slate-500">
                                Review each evidence file and set a verification status.
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {evidenceVerification.length} item{evidenceVerification.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className="mt-5 space-y-3">
                            {evidenceVerification.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                                No evidence uploaded yet.
                              </div>
                            ) : (
                              evidenceVerification.map((item) => (
                                <motion.div
                                  key={item.id}
                                  variants={fadeUp}
                                  initial="initial"
                                  animate="animate"
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <p className="font-semibold text-slate-900">
                                        {item.file_name || `Evidence #${item.id}`}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Uploaded by {item.uploaded_by_name || 'Unknown'} on {formatDateTime(item.uploaded_at)}
                                      </p>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getEvidenceStatusBadge(item.verification_status || 'pending')}`}>
                                      {item.verification_status || 'pending'}
                                    </span>
                                  </div>

                                  <textarea
                                    value={evidenceNoteDrafts[item.id] ?? item.lawyer_notes ?? ''}
                                    onChange={(event) =>
                                      setEvidenceNoteDrafts((current) => ({
                                        ...current,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                    rows={3}
                                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                                    placeholder="Add lawyer notes for this evidence"
                                  />

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {EVIDENCE_STATUSES.map((status) => (
                                      <button
                                        key={status}
                                        type="button"
                                        onClick={() => handleEvidenceVerification(item.id, status)}
                                        disabled={verificationBusyId === item.id}
                                        className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                                          item.verification_status === status
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        {verificationBusyId === item.id && item.verification_status !== status
                                          ? 'Saving...'
                                          : status}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 p-5">
                          <h4 className="text-base font-semibold text-slate-900">Case Notes</h4>
                          <p className="mt-1 text-sm text-slate-500">
                            Add internal notes or mark notes visible to clients.
                          </p>

                          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <input
                              type="text"
                              value={newNoteTitle}
                              onChange={(event) => setNewNoteTitle(event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                              placeholder="Optional note title"
                            />
                            <textarea
                              value={newNoteContent}
                              onChange={(event) => setNewNoteContent(event.target.value)}
                              rows={4}
                              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                              placeholder="Write your legal assessment, actions, or next steps"
                            />
                            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={newNoteVisible}
                                onChange={(event) => setNewNoteVisible(event.target.checked)}
                              />
                              Visible to client
                            </label>
                            <div>
                              <button
                                type="button"
                                onClick={handleCreateCaseNote}
                                disabled={noteSaving}
                                className="mt-3 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {noteSaving ? 'Saving...' : 'Add Case Note'}
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {caseNotes.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                                No case notes yet.
                              </div>
                            ) : (
                              caseNotes.map((note) => (
                                <motion.div
                                  key={note.id}
                                  variants={fadeUp}
                                  initial="initial"
                                  animate="animate"
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <p className="font-semibold text-slate-900">{note.title || 'Untitled note'}</p>
                                      <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{note.content}</p>
                                      <p className="mt-2 text-xs text-slate-500">
                                        {note.lawyer_name || 'Lawyer'} updated {formatDateTime(note.updated_at || note.created_at)}
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                          note.is_visible_to_client
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {note.is_visible_to_client ? 'Visible to client' : 'Internal'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCaseNote(note.id)}
                                        className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="rounded-3xl border border-slate-200 p-5">
                          <h4 className="text-base font-semibold text-slate-900">Lawyer Summary</h4>
                          <p className="mt-1 text-sm text-slate-500">
                            Keep a concise dispute summary for fast case review.
                          </p>
                          <textarea
                            value={summaryDraft}
                            onChange={(event) => setSummaryDraft(event.target.value)}
                            rows={10}
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                            placeholder="Write the current legal posture, evidence quality, and next legal action"
                          />
                          <button
                            type="button"
                            onClick={handleSaveSummary}
                            disabled={summarySaving}
                            className="mt-3 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {summarySaving ? 'Saving...' : 'Save Summary'}
                          </button>
                          {summaryInfo?.at ? (
                            <p className="mt-2 text-xs text-slate-500">
                              Last updated by {summaryInfo.byName} on {formatDateTime(summaryInfo.at)}
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-3xl border border-slate-200 p-5">
                          <h4 className="text-base font-semibold text-slate-900">Dispute Timeline Snapshot</h4>
                          <div className="mt-4 space-y-2">
                            {(disputeDetails?.timeline || []).slice(-8).map((entry, index) => (
                              <motion.div
                                key={`${entry.type}-${entry.happened_at}-${index}`}
                                variants={fadeUp}
                                initial="initial"
                                animate="animate"
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                              >
                                <p className="font-semibold text-slate-900">{entry.summary}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDateTime(entry.happened_at)} by {entry.actor_name || 'System'}
                                </p>
                              </motion.div>
                            ))}
                            {!(disputeDetails?.timeline || []).length ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                                No timeline events yet.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.section>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const LawyerDashboardView = ({
  dashboardTitle,
  profileLabel,
  nameFallback,
  dashboardSubtitle,
  rolePillLabel,
  showSuperLawyerPanel,
  showStateLawyerPanel,
}) => (
  <LawyerVerification>
    <LawyerDashboardContent
      dashboardTitle={dashboardTitle}
      profileLabel={profileLabel}
      nameFallback={nameFallback}
      dashboardSubtitle={dashboardSubtitle}
      rolePillLabel={rolePillLabel}
      showSuperLawyerPanel={showSuperLawyerPanel}
      showStateLawyerPanel={showStateLawyerPanel}
    />
  </LawyerVerification>
);

const LawyerDashboard = () => (
  <LawyerDashboardView
    dashboardTitle="Lawyer Dashboard"
    profileLabel="Lawyer Profile"
    nameFallback="Lawyer"
    dashboardSubtitle="Manage disputes, verify evidence, and keep legal notes synchronized with your assigned state."
    rolePillLabel="Lawyer"
  />
);

export default LawyerDashboard;
