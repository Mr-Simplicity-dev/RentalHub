import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import PaginationControls from './PaginationControls';

const ENTRIES_PAGE_SIZE = 8;
const APPLICATIONS_PAGE_SIZE = 8;
const BROADCASTS_PAGE_SIZE = 8;

const initialManualForm = {
  full_name: '',
  email: '',
  phone: '',
  nationality: 'Nigeria',
  chamber_name: '',
  chamber_phone: '',
  is_active: true,
};

const initialBroadcastForm = {
  title: 'RentalHub NG lawyer recruitment',
  message:
    'We are currently recruiting lawyers to serve on the RentalHub NG lawyer program. Apply from your lawyer dashboard if you want to be reviewed for approval.',
};

const statusBadgeClass = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  accepted: 'bg-green-100 text-green-700',
  expired: 'bg-slate-200 text-slate-700',
};

const PlatformLawyersTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [applications, setApplications] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [broadcastForm, setBroadcastForm] = useState(initialBroadcastForm);
  const [entriesPage, setEntriesPage] = useState(1);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [broadcastsPage, setBroadcastsPage] = useState(1);
  const [reviewDialog, setReviewDialog] = useState({
    open: false,
    application: null,
    action: '',
    note: '',
  });
  const [entryAction, setEntryAction] = useState({
    open: false,
    entry: null,
    action: '',
    reason: '',
    loading: false,
    error: '',
  });
  const [reviewSaving, setReviewSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super/platform-lawyers');
      setEntries(res.data?.data?.entries || []);
      setApplications(res.data?.data?.applications || []);
      setBroadcasts(res.data?.data?.recruitment_broadcasts || []);
      setEntriesPage(1);
      setApplicationsPage(1);
      setBroadcastsPage(1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load platform lawyers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createManualEntry = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.post('/super/platform-lawyers/manual', manualForm);
      const invite = res.data?.data?.invite;

      if (invite?.email_sent) {
        toast.success('Platform lawyer added and setup email sent');
      } else {
        toast.warn(
          invite?.email_error ||
            'Platform lawyer record created, but the setup email failed to send'
        );
      }

      setManualForm(initialManualForm);
      await loadData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to create platform lawyer record'
      );
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (lawyerId) => {
    try {
      const res = await api.post(`/super/platform-lawyers/${lawyerId}/resend-invite`);
      const invite = res.data?.data?.invite;

      if (invite?.email_sent) {
        toast.success('Setup email resent');
      } else {
        toast.warn(
          invite?.email_error ||
            'A fresh invite was created, but the setup email failed to send'
        );
      }

      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resend setup email');
    }
  };

  const openEntryAction = (entry, action) => {
    setEntryAction({
      open: true,
      entry,
      action,
      reason: '',
      loading: false,
      error: '',
    });
  };

  const closeEntryAction = () => {
    setEntryAction({
      open: false,
      entry: null,
      action: '',
      reason: '',
      loading: false,
      error: '',
    });
  };

  const toggleEntry = async (entry, reason) => {
    try {
      await api.patch(`/super/platform-lawyers/${entry.id}`, {
        is_active: !entry.is_active,
        reason,
      });
      toast.success(
        entry.is_active ? 'Lawyer removed from public directory' : 'Lawyer activated in public directory'
      );
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update lawyer record');
      throw error;
    }
  };

  const deleteEntry = async (entry, reason) => {
    try {
      await api.delete(`/super/platform-lawyers/${entry.id}`, {
        data: { reason },
      });
      toast.success('Manual lawyer record deleted');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete lawyer record');
      throw error;
    }
  };

  const submitEntryAction = async () => {
    const reason = entryAction.reason.trim();
    if (!reason) {
      setEntryAction((prev) => ({ ...prev, error: 'A reason is required' }));
      return;
    }

    try {
      setEntryAction((prev) => ({ ...prev, loading: true, error: '' }));
      if (entryAction.action === 'delete') {
        await deleteEntry(entryAction.entry, reason);
      } else {
        await toggleEntry(entryAction.entry, reason);
      }
      closeEntryAction();
    } catch {
      setEntryAction((prev) => ({
        ...prev,
        loading: false,
        error: 'Action failed. Check the message above and try again.',
      }));
    }
  };

  const formatOperationLabel = (eventType) => {
    const labels = {
      platform_lawyer_activated: 'Activated',
      platform_lawyer_deactivated: 'Deactivated',
      platform_lawyer_updated: 'Updated',
      platform_lawyer_deleted: 'Deleted',
    };
    return labels[eventType] || String(eventType || 'Updated').replace(/_/g, ' ');
  };

  const sendRecruitmentBroadcast = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post('/super/platform-lawyers/broadcast', broadcastForm);
      toast.success('Lawyer recruitment broadcast sent');
      setBroadcastForm(initialBroadcastForm);
      await loadData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to send recruitment broadcast'
      );
    } finally {
      setSaving(false);
    }
  };

  const openReviewDialog = (application, action) => {
    setReviewDialog({
      open: true,
      application,
      action,
      note: application.review_note || '',
    });
  };

  const closeReviewDialog = () => {
    setReviewDialog({
      open: false,
      application: null,
      action: '',
      note: '',
    });
  };

  const submitApplicationReview = async () => {
    const { application, action, note } = reviewDialog;

    if (!application || !action) return;

    if (action === 'reject' && !note.trim()) {
      toast.error('Add a rejection reason before rejecting this application');
      return;
    }

    try {
      setReviewSaving(true);
      await api.patch(
        `/super/platform-lawyers/applications/${application.id}/${action}`,
        { review_note: note.trim() }
      );
      toast.success(
        action === 'approve'
          ? 'Lawyer application approved'
          : 'Lawyer application rejected'
      );
      closeReviewDialog();
      await loadData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || `Failed to ${action} application`
      );
    } finally {
      setReviewSaving(false);
    }
  };

  const entriesTotalPages = Math.max(Math.ceil((entries.length || 0) / ENTRIES_PAGE_SIZE), 1);
  const entriesStart = (entriesPage - 1) * ENTRIES_PAGE_SIZE;
  const pagedEntries = entries.slice(entriesStart, entriesStart + ENTRIES_PAGE_SIZE);

  const applicationsTotalPages = Math.max(Math.ceil((applications.length || 0) / APPLICATIONS_PAGE_SIZE), 1);
  const applicationsStart = (applicationsPage - 1) * APPLICATIONS_PAGE_SIZE;
  const pagedApplications = applications.slice(applicationsStart, applicationsStart + APPLICATIONS_PAGE_SIZE);

  const broadcastsTotalPages = Math.max(Math.ceil((broadcasts.length || 0) / BROADCASTS_PAGE_SIZE), 1);
  const broadcastsStart = (broadcastsPage - 1) * BROADCASTS_PAGE_SIZE;
  const pagedBroadcasts = broadcasts.slice(broadcastsStart, broadcastsStart + BROADCASTS_PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fadeIn text-left">
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={createManualEntry}
          className="rounded-xl2 border border-soft bg-white p-6 shadow-card"
        >
          <h3 className="mb-1 font-semibold">Manual Lawyer Entry</h3>
          <p className="mb-4 text-sm text-gray-500">
            Add a lawyer directly to the public directory and send a setup email with a password-creation link.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="Full name"
              value={manualForm.full_name}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, full_name: e.target.value }))
              }
            />
            <input
              className="input"
              placeholder="Email"
              value={manualForm.email}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <input
              className="input"
              placeholder="Phone"
              value={manualForm.phone}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
            <input
              className="input"
              placeholder="Nationality"
              value={manualForm.nationality}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, nationality: e.target.value }))
              }
            />
            <input
              className="input"
              placeholder="Chamber name"
              value={manualForm.chamber_name}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, chamber_name: e.target.value }))
              }
            />
            <input
              className="input"
              placeholder="Chamber phone"
              value={manualForm.chamber_phone}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, chamber_phone: e.target.value }))
              }
            />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={manualForm.is_active}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, is_active: e.target.checked }))
              }
            />
            Show this lawyer in the public directory immediately
          </label>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary mt-4"
          >
            {saving ? 'Saving...' : 'Add Lawyer & Send Setup Email'}
          </button>
        </form>

        <form
          onSubmit={sendRecruitmentBroadcast}
          className="rounded-xl2 border border-soft bg-white p-6 shadow-card"
        >
          <h3 className="mb-1 font-semibold">Recruit Registered Lawyers</h3>
          <p className="mb-4 text-sm text-gray-500">
            Send an internal broadcast to lawyer users so they can apply from their dashboard.
          </p>

          <input
            className="input mb-3 w-full"
            placeholder="Broadcast title"
            value={broadcastForm.title}
            onChange={(e) =>
              setBroadcastForm((prev) => ({ ...prev, title: e.target.value }))
            }
          />

          <textarea
            className="input mb-4 h-32 w-full"
            placeholder="Broadcast message"
            value={broadcastForm.message}
            onChange={(e) =>
              setBroadcastForm((prev) => ({ ...prev, message: e.target.value }))
            }
          />

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Sending...' : 'Send Recruitment Broadcast'}
          </button>
        </form>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Current Public Lawyers</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading platform lawyers...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No platform lawyers have been configured yet.</p>
        ) : (
          <div className="space-y-3">
            {pagedEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {entry.display_name || entry.full_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {entry.display_email} • {entry.display_phone || 'No phone'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {entry.display_chamber_name || 'No chamber'} • {entry.display_nationality || 'Nigeria'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                        {entry.source_type === 'manual' ? 'Manual Entry' : 'Approved Applicant'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${
                          entry.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {entry.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {entry.latest_invite_status ? (
                        <span
                          className={`rounded-full px-2 py-1 ${
                            statusBadgeClass[entry.latest_invite_status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Invite: {entry.latest_invite_status}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEntryAction(entry, entry.is_active ? 'deactivate' : 'activate')}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {entry.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    {entry.source_type === 'manual' ? (
                      <button
                        type="button"
                        onClick={() => resendInvite(entry.id)}
                        className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Resend Setup Email
                      </button>
                    ) : null}
                    {entry.source_type === 'manual' ? (
                      <button
                        type="button"
                        onClick={() => openEntryAction(entry, 'delete')}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
                {Array.isArray(entry.operations) && entry.operations.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-gray-800">
                        {formatOperationLabel(entry.operations[0].event_type)}
                      </span>
                      <span>{new Date(entry.operations[0].created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 line-clamp-2">
                      {entry.operations[0].note || 'No note recorded'} by {entry.operations[0].actor_name || 'Admin'}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <PaginationControls
          currentPage={entriesPage}
          totalPages={entriesTotalPages}
          onPageChange={setEntriesPage}
          summary={`Showing ${entries.length === 0 ? 0 : entriesStart + 1}-${Math.min(entriesPage * ENTRIES_PAGE_SIZE, entries.length)} of ${entries.length}`}
        />
      </div>

      {entryAction.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl2 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                Platform lawyer governance
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">
                {entryAction.action === 'delete'
                  ? 'Delete lawyer record'
                  : entryAction.action === 'deactivate'
                    ? 'Deactivate lawyer'
                    : 'Activate lawyer'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {entryAction.entry?.display_name || entryAction.entry?.full_name || 'This lawyer'} will be recorded with your reason.
              </p>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Reason
              <textarea
                value={entryAction.reason}
                onChange={(event) =>
                  setEntryAction((prev) => ({
                    ...prev,
                    reason: event.target.value,
                    error: '',
                  }))
                }
                className="input mt-1 min-h-[120px]"
                placeholder="Explain the directory decision"
              />
            </label>

            {entryAction.error ? (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {entryAction.error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeEntryAction}
                disabled={entryAction.loading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEntryAction}
                disabled={entryAction.loading}
                className={entryAction.action === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
              >
                {entryAction.loading
                  ? 'Saving...'
                  : entryAction.action === 'delete'
                    ? 'Delete Record'
                    : entryAction.action === 'deactivate'
                      ? 'Deactivate Lawyer'
                      : 'Activate Lawyer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Lawyer Applications</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading applications...</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-gray-500">No lawyer applications yet.</p>
        ) : (
          <div className="space-y-3">
            {pagedApplications.map((application) => (
              <div
                key={application.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {application.full_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {application.email} • {application.phone || 'No phone'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {application.chamber_name || 'No chamber'} • Applied {new Date(application.applied_at).toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          statusBadgeClass[application.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {application.status}
                      </span>
                      {application.directory_active === true ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">
                          In Public Directory
                        </span>
                      ) : null}
                    </div>
                    {application.review_note ? (
                      <p className="mt-2 text-sm text-gray-600">
                        Review note: {application.review_note}
                      </p>
                    ) : null}
                  </div>

                  {application.status === 'pending' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openReviewDialog(application, 'approve')}
                        className="rounded-lg border border-green-200 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openReviewDialog(application, 'reject')}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
                {application.review_history?.length ? (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Decision history
                    </p>
                    <div className="mt-2 space-y-2">
                      {application.review_history.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-gray-700"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium capitalize">
                              {event.event_type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(event.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            By {event.actor_name || 'Super admin'}
                          </p>
                          {event.note ? (
                            <p className="mt-1 text-sm text-gray-600">
                              {event.note}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <PaginationControls
          currentPage={applicationsPage}
          totalPages={applicationsTotalPages}
          onPageChange={setApplicationsPage}
          summary={`Showing ${applications.length === 0 ? 0 : applicationsStart + 1}-${Math.min(applicationsPage * APPLICATIONS_PAGE_SIZE, applications.length)} of ${applications.length}`}
        />
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Recruitment Broadcast History</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading broadcasts...</p>
        ) : broadcasts.length === 0 ? (
          <p className="text-sm text-gray-500">No recruitment broadcasts sent yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {pagedBroadcasts.map((broadcast) => (
              <li key={broadcast.id} className="border-b border-soft pb-3 last:border-b-0">
                <p className="font-semibold text-gray-900">{broadcast.title}</p>
                <p className="mt-1 whitespace-pre-line text-gray-600">
                  {broadcast.message}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {new Date(broadcast.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        <PaginationControls
          currentPage={broadcastsPage}
          totalPages={broadcastsTotalPages}
          onPageChange={setBroadcastsPage}
          summary={`Showing ${broadcasts.length === 0 ? 0 : broadcastsStart + 1}-${Math.min(broadcastsPage * BROADCASTS_PAGE_SIZE, broadcasts.length)} of ${broadcasts.length}`}
        />
      </div>

      {reviewDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-soft bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {reviewDialog.action === 'approve'
                    ? 'Approve lawyer application'
                    : 'Reject lawyer application'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {reviewDialog.application?.full_name} - {reviewDialog.application?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewDialog}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              {reviewDialog.action === 'reject'
                ? 'Rejection reason'
                : 'Approval note'}
            </label>
            <textarea
              className="input mt-2 h-32 w-full"
              placeholder={
                reviewDialog.action === 'reject'
                  ? 'Explain why this lawyer is not approved yet'
                  : 'Optional note for the approval record'
              }
              value={reviewDialog.note}
              onChange={(e) =>
                setReviewDialog((prev) => ({ ...prev, note: e.target.value }))
              }
            />
            {reviewDialog.action === 'reject' ? (
              <p className="mt-2 text-xs text-gray-500">
                This reason is required and will be saved in the decision history.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeReviewDialog}
                disabled={reviewSaving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitApplicationReview}
                disabled={reviewSaving}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  reviewDialog.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {reviewSaving
                  ? 'Saving...'
                  : reviewDialog.action === 'approve'
                    ? 'Approve application'
                    : 'Reject application'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PlatformLawyersTab;
