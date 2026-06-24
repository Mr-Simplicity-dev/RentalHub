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
};

const PlatformAgentsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [entriesPage, setEntriesPage] = useState(1);

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

  const toggleEntry = async (entry) => {
    try {
      await api.patch(`/super/platform-agents/${entry.id}`, {
        is_active: !entry.is_active,
      });
      toast.success(
        entry.is_active ? 'Agent removed from public directory' : 'Agent activated in public directory'
      );
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update agent record');
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete ${entry.display_name || entry.full_name}?`)) {
      return;
    }

    try {
      await api.delete(`/super/platform-agents/${entry.id}`);
      toast.success('Platform agent record deleted');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete agent record');
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
                      onClick={() => toggleEntry(entry)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {entry.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
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
    </div>
  );
};

export default PlatformAgentsTab;
