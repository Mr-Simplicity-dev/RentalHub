import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import PaginationControls from './PaginationControls';

const ENTRIES_PAGE_SIZE = 8;

const initialManualForm = {
  full_name: '',
  email: '',
  phone: '',
  nationality: 'Nigeria',
  is_active: true,
  governance_note: '',
};

const PlatformAgentsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [entriesPage, setEntriesPage] = useState(1);
  const [actionDialog, setActionDialog] = useState({
    open: false,
    entry: null,
    action: '',
    note: '',
  });
  const [actionSaving, setActionSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super/platform-agents');
      setEntries(res.data?.data?.entries || []);
      setEntriesPage(1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load platform agents');
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
      await api.post('/super/platform-agents/manual', manualForm);
      toast.success('Platform agent record created');
      setManualForm(initialManualForm);
      await loadData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to create platform agent record'
      );
    } finally {
      setSaving(false);
    }
  };

  const openActionDialog = (entry, action) => {
    setActionDialog({
      open: true,
      entry,
      action,
      note: '',
    });
  };

  const closeActionDialog = () => {
    setActionDialog({
      open: false,
      entry: null,
      action: '',
      note: '',
    });
  };

  const submitAgentAction = async () => {
    const { entry, action, note } = actionDialog;

    if (!entry || !action) return;

    if (!note.trim()) {
      toast.error(
        action === 'activate'
          ? 'Add an activation reason before enabling this agent'
          : action === 'delete'
          ? 'Add a deletion reason before removing this agent'
          : 'Add a deactivation reason before disabling this agent'
      );
      return;
    }

    try {
      setActionSaving(true);

      if (action === 'delete') {
        await api.delete(`/super/platform-agents/${entry.id}`, {
          data: { governance_note: note.trim() },
        });
        toast.success('Platform agent record deleted');
      } else {
        const isActive = action === 'activate';
        await api.patch(`/super/platform-agents/${entry.id}`, {
          is_active: isActive,
          governance_note: note.trim(),
        });
        toast.success(
          isActive
            ? 'Agent activated in public directory'
            : 'Agent removed from public directory'
        );
      }

      closeActionDialog();
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update agent record');
    } finally {
      setActionSaving(false);
    }
  };

  const totalPages = Math.max(Math.ceil((entries.length || 0) / ENTRIES_PAGE_SIZE), 1);
  const startIndex = (entriesPage - 1) * ENTRIES_PAGE_SIZE;
  const pagedEntries = entries.slice(startIndex, startIndex + ENTRIES_PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fadeIn text-left">
      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-1 font-semibold">Manual Agent Entry</h3>
        <p className="mb-4 text-sm text-gray-500">
          Add an agent directly to the platform agent directory. Agents listed here can be automatically
          assigned to landlords who opt in for RentalHub NG agents during registration.
        </p>

        <form onSubmit={createManualEntry}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="Full name"
              value={manualForm.full_name}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, full_name: e.target.value }))
              }
              required
            />
            <input
              className="input"
              placeholder="Email"
              type="email"
              value={manualForm.email}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, email: e.target.value }))
              }
              required
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
            <textarea
              className="input md:col-span-2"
              placeholder="Governance note, e.g. why this agent is being added"
              value={manualForm.governance_note}
              onChange={(e) =>
                setManualForm((prev) => ({ ...prev, governance_note: e.target.value }))
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
            Show this agent in the platform directory immediately (auto-assignable)
          </label>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary mt-4"
          >
            {saving ? 'Saving...' : 'Add Agent to Directory'}
          </button>
        </form>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">Current Platform Agents</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading platform agents...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No platform agents have been configured yet.</p>
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
                      {entry.display_nationality || 'Nigeria'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                        {entry.source_type === 'manual' ? 'Manual Entry' : 'Registration Entry'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${
                          entry.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {entry.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {entry.linked_user_id ? (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                          Linked to user #{entry.linked_user_id}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                          No linked user
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openActionDialog(entry, entry.is_active ? 'deactivate' : 'activate')
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {entry.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionDialog(entry, 'delete')}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {entry.operations?.length ? (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Governance history
                    </p>
                    <div className="mt-2 space-y-2">
                      {entry.operations.slice(0, 3).map((event) => (
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
                            <p className="mt-1 text-sm text-gray-600">{event.note}</p>
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
          currentPage={entriesPage}
          totalPages={totalPages}
          onPageChange={setEntriesPage}
          summary={`Showing ${entries.length === 0 ? 0 : startIndex + 1}-${Math.min(entriesPage * ENTRIES_PAGE_SIZE, entries.length)} of ${entries.length}`}
        />
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="mb-4 font-semibold">About Platform Agents</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>What are platform agents?</strong> These are agents registered with the RentalHub NG platform
            who can be automatically assigned to landlords during registration.
          </p>
          <p>
            <strong>Manual entries:</strong> Agents added here via the form above are flagged as "Manual Entry".
            If an agent already has a user account (user_type = 'agent'), their user profile details will be used.
          </p>
          <p>
            <strong>Registration entries:</strong> When a landlord opts in for "Use RentalHub NG agents" during
            registration, an entry is automatically created here and linked to the assigned agent user.
          </p>
          <p>
            <strong>Agent access fee (₦5,000):</strong> When a landlord uses RentalHub NG agents, a one-time
            ₦5,000 fee is charged. ₦2,800 goes to the assigned agent, ₦500 to the landlord's lawyer (if any),
            ₦800 to the super admin, ₦100 to the state admin, and the remainder to the super admin.
          </p>
        </div>
      </div>

      {actionDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-soft bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {actionDialog.action === 'delete'
                    ? 'Delete platform agent'
                    : actionDialog.action === 'activate'
                      ? 'Activate platform agent'
                      : 'Deactivate platform agent'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {actionDialog.entry?.display_name || actionDialog.entry?.full_name} - {actionDialog.entry?.display_email}
                </p>
              </div>
              <button
                type="button"
                onClick={closeActionDialog}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              {actionDialog.action === 'activate'
                ? 'Activation reason'
                : actionDialog.action === 'delete'
                  ? 'Deletion reason'
                  : 'Deactivation reason'}
            </label>
            <textarea
              className="input mt-2 h-32 w-full"
              placeholder={
                actionDialog.action === 'activate'
                  ? 'Explain why this agent is being activated'
                  : actionDialog.action === 'delete'
                    ? 'Explain why this agent is being removed'
                    : 'Explain why this agent is being deactivated'
              }
              value={actionDialog.note}
              onChange={(e) =>
                setActionDialog((prev) => ({ ...prev, note: e.target.value }))
              }
            />
            <p className="mt-2 text-xs text-gray-500">
              This reason is required and will be saved in the governance history.
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeActionDialog}
                disabled={actionSaving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAgentAction}
                disabled={actionSaving}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  actionDialog.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : actionDialog.action === 'activate'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {actionSaving
                  ? 'Saving...'
                  : actionDialog.action === 'delete'
                    ? 'Delete agent'
                    : actionDialog.action === 'activate'
                      ? 'Activate agent'
                      : 'Deactivate agent'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PlatformAgentsTab;
