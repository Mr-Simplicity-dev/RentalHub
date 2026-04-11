import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import LawyerVerification from './LawyerVerification';

const EVIDENCE_STATUSES = ['pending', 'verified', 'flagged', 'rejected'];

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getStatusBadge = (status) => {
  if (status === 'resolved') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'in_progress' || status === 'active') {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-amber-100 text-amber-700';
};

const getEvidenceStatusBadge = (status) => {
  if (status === 'verified') return 'bg-emerald-100 text-emerald-700';
  if (status === 'flagged') return 'bg-orange-100 text-orange-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const LawyerDashboardContent = ({
  dashboardTitle = 'Lawyer Dashboard',
  profileLabel = 'Lawyer Profile',
  nameFallback = 'Lawyer',
  dashboardSubtitle = 'Manage disputes, verify evidence, and maintain legal case notes.',
  rolePillLabel = 'Lawyer',
  showSuperLawyerPanel = false,
  showStateLawyerPanel = false,
}) => {
  const STATES = [
    'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
    'Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
    'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
    'Taraba','Yobe','Zamfara'
  ];

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

  if (loading || profileLoading) {
    return <div className="p-6">Loading lawyer dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{dashboardTitle}</h1>
          <p className="mt-1 text-sm text-gray-600">{dashboardSubtitle}</p>
          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {rolePillLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/verify-case"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Verify Case Evidence
          </Link>
          <Link
            to="/lawyers"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            View Public Directory
          </Link>
        </div>
      </div>

      {showSuperLawyerPanel && (
        <div className="card p-4 border border-purple-200 bg-purple-50">
          <h2 className="font-semibold text-purple-900">Super Lawyer Controls</h2>
          <p className="mt-1 text-sm text-purple-800">
            This workspace is configured for super lawyer operations with expanded legal review responsibility.
          </p>
        </div>
      )}

      {showStateLawyerPanel && (
        <div className="card p-4 border border-emerald-200 bg-emerald-50">
          <h2 className="font-semibold text-emerald-900">State Lawyer Controls</h2>
          <p className="mt-1 text-sm text-emerald-800">
            This workspace is focused on state-level legal operations. Ensure assigned state is correct for your case queue.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-700">{profileLabel}</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">
              {lawyerProfile?.full_name || nameFallback}
            </h2>
            <p className="mt-1 text-sm text-gray-700">{lawyerProfile?.email || '-'}</p>
            <p className="text-sm text-gray-700">
              {lawyerProfile?.phone || '-'} • {lawyerProfile?.nationality || 'Nigeria'}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {lawyerProfile?.chamber_name || 'No chamber provided'}
              {lawyerProfile?.chamber_phone ? ` • ${lawyerProfile.chamber_phone}` : ''}
            </p>
            <p className="mt-2 text-sm text-blue-800">
              Assigned state: <span className="font-semibold">{lawyerProfile?.assigned_state || 'Not configured'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold text-gray-900">State Migration Request</h2>
        <p className="mt-1 text-sm text-gray-500">
          Lawyers are state-locked and can only work on properties inside their assigned state.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <select
            value={migrationForm.to_state}
            onChange={(e) => setMigrationForm((prev) => ({ ...prev, to_state: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select target state</option>
            {STATES.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          <input
            value={migrationForm.reason}
            onChange={(e) => setMigrationForm((prev) => ({ ...prev, reason: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            placeholder="Reason for migration request"
          />
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={submitMigrationRequest}
            disabled={migrationLoading}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {migrationLoading ? 'Submitting...' : 'Apply for State Migration'}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {migrationRequests.slice(0, 3).map((request) => (
            <div key={request.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <p className="font-medium text-gray-800">
                {request.from_state} → {request.to_state}
                <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs capitalize">{request.status}</span>
              </p>
              <p className="text-xs text-gray-600">{request.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">RentalHub NG Lawyer Program</h2>
            <p className="mt-1 text-sm text-gray-500">
              Apply when the super admin opens recruitment for lawyers listed on the public directory.
            </p>
          </div>
          {programData.application?.status ? (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 capitalize">
              {programData.application.status}
            </span>
          ) : null}
        </div>

        {programLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading lawyer program details...</p>
        ) : (
          <div className="mt-4 space-y-4">
            {programData.broadcast ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">{programData.broadcast.title}</p>
                <p className="mt-2 whitespace-pre-line">{programData.broadcast.message}</p>
                <p className="mt-3 text-xs text-blue-700">
                  Sent {formatDateTime(programData.broadcast.created_at)}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No active platform-lawyer recruitment broadcast is available right now.
              </div>
            )}

            <button
              type="button"
              onClick={applyToProgram}
              disabled={
                applyLoading ||
                !programData.broadcast ||
                programData.application?.status === 'pending' ||
                programData.application?.status === 'approved'
              }
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <section className="card p-4">
          <h2 className="text-base font-semibold text-gray-900">Authorized Properties</h2>
          <p className="mt-1 text-xs text-gray-500">Select a property to open your legal workspace.</p>

          {properties.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No authorized properties.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {properties.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => setSelectedProperty(property)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedProperty?.id === property.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{property.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Client: {property.client_name || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Assigned by {property.assigned_by_name || 'Unknown'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="card p-4">
            <h2 className="text-base font-semibold text-gray-900">
              Disputes {selectedProperty ? `for ${selectedProperty.title}` : ''}
            </h2>

            {!selectedProperty ? (
              <p className="mt-4 text-sm text-gray-500">Select a property first.</p>
            ) : disputes.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No disputes found for this property.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {disputes.map((dispute) => (
                  <button
                    key={dispute.id}
                    type="button"
                    onClick={async () => {
                      setSelectedDispute(dispute);
                      await loadDisputeWorkspace(dispute.id);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      selectedDispute?.id === dispute.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">Dispute #{dispute.id}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadge(dispute.status)}`}>
                        {dispute.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-700">{dispute.description}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      Opened by {dispute.opened_by_name || 'Unknown'} vs {dispute.against_name || 'Unknown'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedDispute ? (
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">Dispute Workspace #{selectedDispute.id}</h2>
                <div className="flex gap-3 text-sm">
                  <Link className="text-blue-600 hover:underline" to={`/dispute/${selectedDispute.id}`}>
                    Open full trace
                  </Link>
                  <Link className="text-blue-600 hover:underline" to={`/verify-case?dispute=${selectedDispute.id}`}>
                    Verify integrity
                  </Link>
                </div>
              </div>

              {workspaceLoading ? (
                <p className="mt-4 text-sm text-gray-500">Loading dispute workspace...</p>
              ) : (
                <div className="mt-4 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-900">Evidence Verification</h3>
                      <p className="mt-1 text-sm text-slate-500">Review each evidence file and set a verification status.</p>

                      <div className="mt-4 space-y-3">
                        {evidenceVerification.length === 0 ? (
                          <p className="text-sm text-gray-500">No evidence uploaded yet.</p>
                        ) : (
                          evidenceVerification.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-900">{item.file_name || `Evidence #${item.id}`}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Uploaded by {item.uploaded_by_name || 'Unknown'} on {formatDateTime(item.uploaded_at)}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getEvidenceStatusBadge(item.verification_status || 'pending')}`}>
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
                                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                placeholder="Add lawyer notes for this evidence"
                              />

                              <div className="mt-3 flex flex-wrap gap-2">
                                {EVIDENCE_STATUSES.map((status) => (
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
                                    {verificationBusyId === item.id && item.verification_status !== status
                                      ? 'Saving...'
                                      : status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-900">Case Notes</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Add internal notes or mark notes visible to clients.
                      </p>

                      <div className="mt-4 rounded-xl border border-slate-200 p-3">
                        <input
                          type="text"
                          value={newNoteTitle}
                          onChange={(event) => setNewNoteTitle(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                          placeholder="Optional note title"
                        />
                        <textarea
                          value={newNoteContent}
                          onChange={(event) => setNewNoteContent(event.target.value)}
                          rows={4}
                          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
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
                            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {noteSaving ? 'Saving...' : 'Add Case Note'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {caseNotes.length === 0 ? (
                          <p className="text-sm text-gray-500">No case notes yet.</p>
                        ) : (
                          caseNotes.map((note) => (
                            <div key={note.id} className="rounded-xl border border-slate-200 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-slate-900">{note.title || 'Untitled note'}</p>
                                <div className="flex items-center gap-2">
                                  {note.is_visible_to_client ? (
                                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                                      Visible to client
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                                      Internal
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCaseNote(note.id)}
                                    className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{note.content}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                {note.lawyer_name || 'Lawyer'} • Updated {formatDateTime(note.updated_at || note.created_at)}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
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
                        rows={10}
                        className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                        placeholder="Write the current legal posture, evidence quality, and next legal action"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSummary}
                        disabled={summarySaving}
                        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {summarySaving ? 'Saving...' : 'Save Summary'}
                      </button>
                      {summaryInfo?.at ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Last updated by {summaryInfo.byName} on {formatDateTime(summaryInfo.at)}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-900">Dispute Timeline Snapshot</h3>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {(disputeDetails?.timeline || []).slice(-8).map((entry, index) => (
                          <div key={`${entry.type}-${entry.happened_at}-${index}`} className="rounded-lg bg-slate-50 p-2">
                            <p className="font-semibold text-slate-900">{entry.summary}</p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(entry.happened_at)} • {entry.actor_name || 'System'}
                            </p>
                          </div>
                        ))}
                        {!(disputeDetails?.timeline || []).length ? (
                          <p className="text-sm text-gray-500">No timeline events yet.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
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
