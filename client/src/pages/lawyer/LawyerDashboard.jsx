import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import LawyerVerification from './LawyerVerification';

const NOTE_TYPE_OPTIONS = [
  { value: 'case_analysis', label: 'Case Analysis' },
  { value: 'evidence_review', label: 'Evidence Review' },
  { value: 'client_update', label: 'Client Update' },
  { value: 'strategy', label: 'Strategy' },
];

const EVIDENCE_STATUS_OPTIONS = ['pending', 'verified', 'flagged', 'rejected'];

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
};

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;

const getStatusStyles = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'verified':
    case 'resolved':
      return 'bg-green-100 text-green-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const Card = ({ title, helper, action, children }) => (
  <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {helper ? <p className="mt-1 text-sm text-gray-500">{helper}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Badge = ({ children, className = '' }) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${className}`}>
    {children}
  </span>
);

export default function LawyerDashboard() {
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [programLoading, setProgramLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [verificationBusyId, setVerificationBusyId] = useState(null);
  const [resolvingDispute, setResolvingDispute] = useState(false);

  const [lawyerProfile, setLawyerProfile] = useState(null);
  const [programData, setProgramData] = useState(null);
  const [properties, setProperties] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedDisputeId, setSelectedDisputeId] = useState('');
  const [selectedDisputeDetails, setSelectedDisputeDetails] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [caseNotes, setCaseNotes] = useState([]);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [evidenceNoteDrafts, setEvidenceNoteDrafts] = useState({});
  const [noteForm, setNoteForm] = useState({
    title: '',
    content: '',
    note_type: 'case_analysis',
    is_visible_to_client: false,
  });

  const selectedProperty = useMemo(
    () => properties.find((item) => String(item.id) === String(selectedPropertyId)) || null,
    [properties, selectedPropertyId]
  );

  const selectedDispute = useMemo(
    () => disputes.find((item) => String(item.id) === String(selectedDisputeId)) || null,
    [disputes, selectedDisputeId]
  );

  const loadLawyerProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      const res = await api.get('/auth/me');
      setLawyerProfile(res.data?.data || null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load lawyer profile'));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadPlatformLawyerProgram = useCallback(async () => {
    try {
      setProgramLoading(true);
      const res = await api.get('/legal/platform-lawyer-program');
      setProgramData(res.data?.data || null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load lawyer program'));
    } finally {
      setProgramLoading(false);
    }
  }, []);

  const loadDisputeWorkspace = useCallback(async (dispute) => {
    if (!dispute?.id) {
      setSelectedDisputeDetails(null);
      setEvidenceItems([]);
      setCaseNotes([]);
      setSummaryDraft('');
      setEvidenceNoteDrafts({});
      return;
    }

    try {
      setWorkspaceLoading(true);

      const disputeDetailsPromise = api
        .get(`/disputes/${dispute.id}`)
        .catch(() => ({ data: { data: { dispute, timeline: [] } } }));

      const [evidenceRes, notesRes, disputeRes] = await Promise.all([
        api.get(`/legal/disputes/${dispute.id}/evidence/verification`),
        api.get(`/legal/disputes/${dispute.id}/notes`),
        disputeDetailsPromise,
      ]);

      const detailPayload = disputeRes.data?.data || { dispute, timeline: [] };
      const mergedDispute = {
        ...dispute,
        ...(detailPayload.dispute || {}),
      };

      setSelectedDisputeDetails({
        ...detailPayload,
        dispute: mergedDispute,
      });
      setEvidenceItems(evidenceRes.data?.data || []);
      setCaseNotes(notesRes.data?.data || []);
      setSummaryDraft(mergedDispute.lawyer_summary || '');
      setEvidenceNoteDrafts({});
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load dispute workspace'));
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const loadDisputes = useCallback(
    async (propertyId, preferredDisputeId = null) => {
      if (!propertyId) {
        setDisputes([]);
        setSelectedDisputeId('');
        setSelectedDisputeDetails(null);
        setEvidenceItems([]);
        setCaseNotes([]);
        setSummaryDraft('');
        return [];
      }

      try {
        const res = await api.get(`/legal/property/${propertyId}/disputes`);
        const records = res.data?.data || [];
        setDisputes(records);

        const nextDispute =
          records.find((item) => String(item.id) === String(preferredDisputeId)) ||
          records[0] ||
          null;

        if (nextDispute) {
          setSelectedDisputeId(String(nextDispute.id));
          await loadDisputeWorkspace(nextDispute);
        } else {
          setSelectedDisputeId('');
          setSelectedDisputeDetails(null);
          setEvidenceItems([]);
          setCaseNotes([]);
          setSummaryDraft('');
        }

        return records;
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to load disputes'));
        setDisputes([]);
        setSelectedDisputeId('');
        setSelectedDisputeDetails(null);
        return [];
      }
    },
    [loadDisputeWorkspace]
  );

  const loadAuthorizedProperties = useCallback(async () => {
    const res = await api.get('/legal/properties');
    const records = res.data?.data || [];
    setProperties(records);
    return records;
  }, []);

  useEffect(() => {
    let ignore = false;

    const initializeDashboard = async () => {
      try {
        setLoading(true);
        const [propertyRows] = await Promise.all([
          loadAuthorizedProperties(),
          loadLawyerProfile(),
          loadPlatformLawyerProgram(),
        ]);

        if (ignore) return;

        const firstProperty = propertyRows[0];
        if (firstProperty) {
          setSelectedPropertyId(String(firstProperty.id));
          await loadDisputes(firstProperty.id);
        }
      } catch (error) {
        if (!ignore) {
          toast.error(getErrorMessage(error, 'Failed to load lawyer dashboard'));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    initializeDashboard();

    return () => {
      ignore = true;
    };
  }, [loadAuthorizedProperties, loadDisputes, loadLawyerProfile, loadPlatformLawyerProgram]);

  const handleSelectProperty = async (property) => {
    setSelectedPropertyId(String(property.id));
    await loadDisputes(property.id);
  };

  const handleSelectDispute = async (dispute) => {
    setSelectedDisputeId(String(dispute.id));
    await loadDisputeWorkspace(dispute);
  };

  const handleApplyToProgram = async () => {
    try {
      setApplyLoading(true);
      const res = await api.post('/legal/platform-lawyer-program/apply');
      toast.success(res.data?.message || 'Application submitted');
      await loadPlatformLawyerProgram();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to apply to the lawyer program'));
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
      await loadDisputeWorkspace(selectedDispute);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to verify evidence'));
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
      setSavingSummary(true);
      const res = await api.patch(`/legal/disputes/${selectedDispute.id}/summary`, {
        lawyer_summary: summaryDraft.trim(),
      });
      toast.success(res.data?.message || 'Dispute summary saved');
      await loadDisputes(selectedPropertyId, selectedDispute.id);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save dispute summary'));
    } finally {
      setSavingSummary(false);
    }
  };

  const handleCreateCaseNote = async (event) => {
    event.preventDefault();

    if (!selectedDispute?.id || !noteForm.content.trim()) {
      toast.error('Write your case note before saving');
      return;
    }

    try {
      setSavingNote(true);
      const res = await api.post(`/legal/disputes/${selectedDispute.id}/notes`, {
        ...noteForm,
        title: noteForm.title.trim(),
        content: noteForm.content.trim(),
      });
      toast.success(res.data?.message || 'Case note added');
      setNoteForm({
        title: '',
        content: '',
        note_type: 'case_analysis',
        is_visible_to_client: false,
      });
      await loadDisputeWorkspace(selectedDispute);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add case note'));
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditCaseNote = async (note) => {
    const nextContent = window.prompt('Update case note content', note.content || '');
    if (nextContent === null) return;

    const nextTitle = window.prompt('Update case note title', note.title || '');
    if (nextTitle === null) return;

    try {
      const res = await api.patch(`/legal/disputes/${selectedDispute.id}/notes/${note.id}`, {
        title: nextTitle.trim(),
        content: nextContent.trim(),
      });
      toast.success(res.data?.message || 'Case note updated');
      await loadDisputeWorkspace(selectedDispute);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update case note'));
    }
  };

  const handleDeleteCaseNote = async (note) => {
    if (!window.confirm('Delete this case note?')) return;

    try {
      const res = await api.delete(`/legal/disputes/${selectedDispute.id}/notes/${note.id}`);
      toast.success(res.data?.message || 'Case note deleted');
      await loadDisputeWorkspace(selectedDispute);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete case note'));
    }
  };

  const handleResolveDispute = async () => {
    if (!selectedDispute?.id) return;

    const resolutionNote = window.prompt('Add a resolution note (optional)', '') ?? '';

    try {
      setResolvingDispute(true);
      const res = await api.patch(`/legal/disputes/${selectedDispute.id}/resolve`, {
        resolution_note: resolutionNote.trim(),
      });
      toast.success(res.data?.message || 'Dispute resolved');
      await loadDisputes(selectedPropertyId, selectedDispute.id);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to resolve dispute'));
    } finally {
      setResolvingDispute(false);
    }
  };

  const programApplication = programData?.application || null;
  const programBroadcast = programData?.broadcast || null;

  return (
    <LawyerVerification>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 rounded-3xl bg-slate-900 px-6 py-8 text-white shadow-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                Lawyer Workspace
              </p>
              <h1 className="mt-2 text-3xl font-bold">Review disputes and protect the evidence trail</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-200">
                Verify uploaded evidence, keep private case notes, update your summary, and trace the
                full dispute history from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/verify" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                Verify Case
              </Link>
              {selectedDispute ? (
                <Link
                  to={`/dispute/${selectedDispute.id}`}
                  className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white"
                >
                  Trace Dispute
                </Link>
              ) : null}
            </div>
          </div>

          {loading || profileLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
              Loading lawyer dashboard...
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                <Card title="Lawyer Profile" helper="Your current verification and account status">
                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</p>
                      <p className="mt-1 font-semibold text-slate-900">{lawyerProfile?.full_name || 'Not provided'}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                        <p className="mt-1">{lawyerProfile?.email || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                        <p className="mt-1">{lawyerProfile?.phone || 'Not provided'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Badge className={lawyerProfile?.identity_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                        {lawyerProfile?.identity_verified ? 'Identity Verified' : 'Verification Pending'}
                      </Badge>
                      <Badge className={lawyerProfile?.email_verified ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}>
                        {lawyerProfile?.email_verified ? 'Email Verified' : 'Email Unverified'}
                      </Badge>
                    </div>
                  </div>
                </Card>

                <Card
                  title="RentalHub NG Lawyer Program"
                  helper="Internal recruitment status for platform lawyers"
                  action={
                    programApplication?.status ? (
                      <Badge className={getStatusStyles(programApplication.status)}>
                        {programApplication.status}
                      </Badge>
                    ) : null
                  }
                >
                  {programLoading ? (
                    <p className="text-sm text-slate-500">Loading recruitment details...</p>
                  ) : (
                    <div className="space-y-4 text-sm text-slate-700">
                      {programBroadcast ? (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                          <p className="font-semibold">{programBroadcast.title || 'Active Recruitment Broadcast'}</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm">{programBroadcast.message || 'A new platform lawyer recruitment notice is available.'}</p>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
                          There is no active platform-lawyer recruitment announcement right now.
                        </div>
                      )}

                      {programApplication ? (
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <p className="font-semibold text-slate-900">Your application</p>
                          <p className="mt-2">Status: <span className="font-medium capitalize">{programApplication.status}</span></p>
                          <p className="mt-1">Applied: {formatDateTime(programApplication.applied_at)}</p>
                          {programApplication.review_note ? (
                            <p className="mt-2 text-slate-600">Review note: {programApplication.review_note}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleApplyToProgram}
                        disabled={applyLoading || !programBroadcast || programApplication?.status === 'approved'}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {applyLoading
                          ? 'Submitting...'
                          : programApplication?.status === 'approved'
                            ? 'Already Approved'
                            : programApplication?.status === 'rejected'
                              ? 'Apply Again'
                              : programApplication?.status === 'pending'
                                ? 'Refresh Application'
                                : 'Apply to Join'}
                      </button>
                    </div>
                  )}
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[340px,1fr]">
                <Card title="Authorized Properties" helper="Properties and clients currently linked to you">
                  <div className="space-y-3">
                    {properties.length === 0 ? (
                      <p className="text-sm text-slate-500">No authorized properties yet.</p>
                    ) : (
                      properties.map((property) => (
                        <button
                          key={property.id}
                          type="button"
                          onClick={() => handleSelectProperty(property)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            String(property.id) === String(selectedPropertyId)
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300'
                          }`}
                        >
                          <p className="font-semibold">{property.title || `Property #${property.id}`}</p>
                          <p className={`mt-2 text-sm ${String(property.id) === String(selectedPropertyId) ? 'text-slate-200' : 'text-slate-600'}`}>
                            {[property.area, property.city, property.state_name || property.state].filter(Boolean).join(', ')}
                          </p>
                          <p className={`mt-2 text-xs ${String(property.id) === String(selectedPropertyId) ? 'text-slate-300' : 'text-slate-500'}`}>
                            Assigned by {property.assigned_by_name || 'Unknown'}
                            {property.client_name ? ` for ${property.client_name}` : ''}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card
                    title={selectedProperty ? `Disputes for ${selectedProperty.title}` : 'Disputes'}
                    helper="Choose a dispute to load evidence, notes, summary, and trace data"
                  >
                    {!selectedProperty ? (
                      <p className="text-sm text-slate-500">Select a property first.</p>
                    ) : disputes.length === 0 ? (
                      <p className="text-sm text-slate-500">No disputes found for this property.</p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {disputes.map((dispute) => (
                          <button
                            key={dispute.id}
                            type="button"
                            onClick={() => handleSelectDispute(dispute)}
                            className={`rounded-2xl border p-4 text-left transition ${
                              String(dispute.id) === String(selectedDisputeId)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-slate-900">{dispute.title || `Dispute #${dispute.id}`}</p>
                              <Badge className={getStatusStyles(dispute.status || 'open')}>
                                {dispute.status || 'open'}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{dispute.description || 'No description provided.'}</p>
                            <p className="mt-3 text-xs text-slate-500">
                              Opened by {dispute.opened_by_name || 'Unknown'} against {dispute.against_name || 'Unknown'}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>

                  {selectedDispute ? (
                    <Card
                      title={`Dispute Workspace: ${selectedDispute.title || `#${selectedDispute.id}`}`}
                      helper="Review evidence, update your summary, and keep structured notes"
                      action={
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/dispute/${selectedDispute.id}`}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Trace Dispute
                          </Link>
                          {String(selectedDispute.status).toLowerCase() !== 'resolved' ? (
                            <button
                              type="button"
                              onClick={handleResolveDispute}
                              disabled={resolvingDispute}
                              className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {resolvingDispute ? 'Resolving...' : 'Resolve Dispute'}
                            </button>
                          ) : null}
                        </div>
                      }
                    >
                      {workspaceLoading ? (
                        <p className="text-sm text-slate-500">Loading dispute workspace...</p>
                      ) : (
                        <div className="space-y-6">
                          <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                            <div className="space-y-4">
                              <div>
                                <h3 className="text-base font-semibold text-slate-900">Evidence Verification</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  Review each uploaded file and record your verification decision.
                                </p>
                              </div>
                              {evidenceItems.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                                  No evidence has been uploaded for this dispute yet.
                                </div>
                              ) : (
                                evidenceItems.map((item) => (
                                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <p className="font-semibold text-slate-900">{item.file_name || `Evidence #${item.id}`}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Uploaded by {item.uploaded_by_name || 'Unknown'} on {formatDateTime(item.uploaded_at)}
                                        </p>
                                      </div>
                                      <Badge className={getStatusStyles(item.verification_status || 'pending')}>
                                        {item.verification_status || 'pending'}
                                      </Badge>
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
                                      className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                      placeholder="Add lawyer notes for this evidence"
                                    />
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {EVIDENCE_STATUS_OPTIONS.map((status) => (
                                        <button
                                          key={status}
                                          type="button"
                                          onClick={() => handleEvidenceVerification(item.id, status)}
                                          disabled={verificationBusyId === item.id}
                                          className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                                            item.verification_status === status
                                              ? 'bg-slate-900 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          {verificationBusyId === item.id && item.verification_status !== status ? 'Saving...' : status}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 p-4">
                                <h3 className="text-base font-semibold text-slate-900">Lawyer Summary</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  Keep a concise dispute summary for fast case review.
                                </p>
                                <textarea
                                  value={summaryDraft}
                                  onChange={(event) => setSummaryDraft(event.target.value)}
                                  rows={8}
                                  className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                  placeholder="Summarize the dispute, evidence position, and next legal steps."
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveSummary}
                                  disabled={savingSummary}
                                  className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                  {savingSummary ? 'Saving...' : 'Save Summary'}
                                </button>
                              </div>
                              <div className="rounded-2xl border border-slate-200 p-4">
                                <h3 className="text-base font-semibold text-slate-900">Trace Snapshot</h3>
                                <div className="mt-3 space-y-3 text-sm text-slate-600">
                                  {(selectedDisputeDetails?.timeline || []).slice(-5).reverse().map((entry, index) => (
                                    <div key={`${entry.type || 'event'}-${entry.happened_at || index}`} className="rounded-xl bg-slate-50 p-3">
                                      <p className="font-medium text-slate-900">{entry.summary || entry.type || 'Event'}</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {entry.actor_name || 'System'} · {formatDateTime(entry.happened_at)}
                                      </p>
                                      {entry.details ? <p className="mt-2 text-sm text-slate-600">{String(entry.details)}</p> : null}
                                    </div>
                                  ))}
                                  {!(selectedDisputeDetails?.timeline || []).length ? (
                                    <p className="text-slate-500">No trace entries loaded yet.</p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
                            <div className="rounded-2xl border border-slate-200 p-4">
                              <h3 className="text-base font-semibold text-slate-900">Add Case Note</h3>
                              <form className="mt-4 space-y-3" onSubmit={handleCreateCaseNote}>
                                <input
                                  type="text"
                                  value={noteForm.title}
                                  onChange={(event) => setNoteForm((current) => ({ ...current, title: event.target.value }))}
                                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                  placeholder="Optional note title"
                                />
                                <select
                                  value={noteForm.note_type}
                                  onChange={(event) => setNoteForm((current) => ({ ...current, note_type: event.target.value }))}
                                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                >
                                  {NOTE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <textarea
                                  value={noteForm.content}
                                  onChange={(event) => setNoteForm((current) => ({ ...current, content: event.target.value }))}
                                  rows={6}
                                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                  placeholder="Record case analysis, legal strategy, or client-facing updates."
                                />
                                <label className="flex items-center gap-2 text-sm text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={noteForm.is_visible_to_client}
                                    onChange={(event) =>
                                      setNoteForm((current) => ({
                                        ...current,
                                        is_visible_to_client: event.target.checked,
                                      }))
                                    }
                                  />
                                  Visible to client
                                </label>
                                <button
                                  type="submit"
                                  disabled={savingNote}
                                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                  {savingNote ? 'Saving...' : 'Save Case Note'}
                                </button>
                              </form>
                            </div>
                            <div className="rounded-2xl border border-slate-200 p-4">
                              <h3 className="text-base font-semibold text-slate-900">Case Notes</h3>
                              <div className="mt-4 space-y-3">
                                {caseNotes.length === 0 ? (
                                  <p className="text-sm text-slate-500">No case notes yet for this dispute.</p>
                                ) : (
                                  caseNotes.map((note) => (
                                    <div key={note.id} className="rounded-2xl bg-slate-50 p-4">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="font-semibold text-slate-900">{note.title || 'Untitled Note'}</p>
                                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                                            {String(note.note_type || 'case_analysis').replace(/_/g, ' ')}
                                          </p>
                                        </div>
                                        {Number(note.lawyer_user_id) === Number(lawyerProfile?.id) ? (
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleEditCaseNote(note)}
                                              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteCaseNote(note)}
                                              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
                                      <p className="mt-3 text-xs text-slate-500">
                                        {note.lawyer_name || 'Lawyer'} · {formatDateTime(note.updated_at || note.created_at)}
                                        {note.is_visible_to_client ? ' · Client visible' : ' · Private'}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </LawyerVerification>
  );
}
