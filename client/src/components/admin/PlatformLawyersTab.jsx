import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

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

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super/platform-lawyers');
      setEntries(res.data?.data?.entries || []);
      setApplications(res.data?.data?.applications || []);
      setBroadcasts(res.data?.data?.recruitment_broadcasts || []);
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

  const toggleEntry = async (entry) => {
    try {
      await api.patch(`/super/platform-lawyers/${entry.id}`, {
        is_active: !entry.is_active,
      });
      toast.success(
        entry.is_active ? 'Lawyer removed from public directory' : 'Lawyer activated in public directory'
      );
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update lawyer record');
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete ${entry.display_name || entry.full_name}?`)) {
      return;
    }

    try {
      await api.delete(`/super/platform-lawyers/${entry.id}`);
      toast.success('Manual lawyer record deleted');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete lawyer record');
    }
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

  const reviewApplication = async (application, action) => {
    const promptMessage =
      action === 'reject'
        ? 'Optional rejection note for the lawyer'
        : 'Optional approval note';
    const reviewInput = window.prompt(promptMessage, '');

    if (reviewInput === null) {
      return;
    }

    const review_note = reviewInput || '';

    try {
      await api.patch(
        `/super/platform-lawyers/applications/${application.id}/${action}`,
        { review_note }
      );
      toast.success(
        action === 'approve'
          ? 'Lawyer application approved'
          : 'Lawyer application rejected'
      );
      await loadData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || `Failed to ${action} application`
      );
    }
  };

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
            {entries.map((entry) => (
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
                      onClick={() => toggleEntry(entry)}
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
                        onClick={() => deleteEntry(entry)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Lawyer Applications</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading applications...</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-gray-500">No lawyer applications yet.</p>
        ) : (
          <div className="space-y-3">
            {applications.map((application) => (
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
                        onClick={() => reviewApplication(application, 'approve')}
                        className="rounded-lg border border-green-200 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewApplication(application, 'reject')}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Recruitment Broadcast History</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading broadcasts...</p>
        ) : broadcasts.length === 0 ? (
          <p className="text-sm text-gray-500">No recruitment broadcasts sent yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {broadcasts.map((broadcast) => (
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
      </div>
    </div>
  );
};

export default PlatformLawyersTab;
