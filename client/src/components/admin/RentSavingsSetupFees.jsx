import React, { useState, useEffect, useCallback } from 'react';
import { FaTimes, FaPlus, FaEdit, FaTrash, FaMapMarkerAlt, FaDollarSign, FaSave, FaSpinner } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

/**
 * RentSavingsSetupFees — Super Admin component
 * Manages location-based one-time setup fees for rent savings activation.
 *
 * Fetches all setup fees from: GET /api/rent-savings/admin/setup-fees
 * Creates/updates:              POST /api/rent-savings/admin/setup-fees
 * Deletes:                      DELETE /api/rent-savings/admin/setup-fees/:id
 */
export default function RentSavingsSetupFees() {
  const [fees, setFees]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

    // Form state
  const [showForm, setShowForm]  = useState(false);
  const [editId, setEditId]      = useState(null);
  const [formData, setFormData]  = useState({ state_id: '', state_name: '', lga_id: '', setup_fee: '', governance_note: '' });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    fee: null,
    reason: '',
    loading: false,
    error: '',
  });

  // Locations data for dropdowns
  const [states, setStates]      = useState([]);
  const [lgas, setLgas]          = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  // ── Load data ────────────────────────────────────────
  const loadFees = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/rent-savings/admin/setup-fees');
      if (data.success) setFees(data.data);
    } catch (error) {
      toast.error('Failed to load setup fees');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

        const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      // Fetch states from the property-utils location-options endpoint
      const { data } = await api.get('/property-utils/location-options');
      if (data.success && Array.isArray(data.data)) {
        setStates(data.data);
      }
    } catch (error) {
      console.error('Failed to load locations:', error);
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => { loadFees(); loadLocations(); }, []);

    // Track selected state_name when state_id changes
  useEffect(() => {
    if (!formData.state_id) {
      setFormData(prev => ({ ...prev, state_name: '' }));
      setLgas([]);
      return;
    }
    const selectedState = states.find(s => String(s.id) === String(formData.state_id));
    const stateName = selectedState?.state_name || selectedState?.name || '';
    setFormData(prev => ({ ...prev, state_name: stateName }));
    if (!stateName) { setLgas([]); return; }
    const loadLgas = async () => {
      try {
        // Fetch LGAs for the selected state via recruitment locations endpoint
        const { data } = await api.get(`/recruitment/locations/lgas/${encodeURIComponent(stateName)}`);
        if (data.success) {
          // Map LGA strings to objects with id and name properties
          const lgaList = (data.data || []).map((lga, index) =>
            typeof lga === 'string' ? { id: index + 1, name: lga } : lga
          );
          setLgas(lgaList);
        } else setLgas([]);
      } catch (error) {
        console.error('Failed to load LGAs:', error);
        setLgas([]);
      }
    };
    loadLgas();
  }, [formData.state_id, states]);

  // ── Handlers ─────────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setFormData({ state_id: '', state_name: '', lga_id: '', setup_fee: '', governance_note: '' });
    setShowForm(true);
  };

  const openEdit = (fee) => {
    setEditId(fee.id);
    setFormData({
      state_id: fee.state_id || '',
      state_name: fee.state_name || '',
      lga_id: fee.lga_id || '',
      setup_fee: fee.setup_fee || '',
      governance_note: '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormData({ state_id: '', state_name: '', lga_id: '', setup_fee: '', governance_note: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.state_id || !formData.setup_fee) {
      toast.error('State and setup fee are required');
      return;
    }
    if (!formData.governance_note.trim()) {
      toast.error('Add a governance note before saving this setup fee');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/rent-savings/admin/setup-fees', {
        state_id: parseInt(formData.state_id),
        lga_id: formData.lga_id ? parseInt(formData.lga_id) : null,
        setup_fee: parseFloat(formData.setup_fee),
        governance_note: formData.governance_note.trim(),
      });

      if (data.success) {
        toast.success(data.message);
        closeForm();
        loadFees();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save setup fee');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteDialog = (fee) => {
    setDeleteDialog({
      open: true,
      fee,
      reason: '',
      loading: false,
      error: '',
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      open: false,
      fee: null,
      reason: '',
      loading: false,
      error: '',
    });
  };

  const handleDelete = async () => {
    const reason = deleteDialog.reason.trim();
    if (!reason) {
      setDeleteDialog((prev) => ({ ...prev, error: 'A deletion reason is required' }));
      return;
    }

    try {
      setDeleteDialog((prev) => ({ ...prev, loading: true, error: '' }));
      const { data } = await api.delete(`/rent-savings/admin/setup-fees/${deleteDialog.fee.id}`, {
        data: { reason },
      });
      if (data.success) {
        toast.success(data.message);
        closeDeleteDialog();
        loadFees();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete setup fee');
      setDeleteDialog((prev) => ({
        ...prev,
        loading: false,
        error: 'Delete failed. Check the message above and try again.',
      }));
    }
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <FaDollarSign className="text-purple-500 text-xl" />
          <h2 className="text-lg font-bold text-gray-800">Savings Setup Fees</h2>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          <FaPlus className="text-xs" />
          Add Fee
        </button>
      </div>

      {/* Body */}
      <div className="p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">Loading setup fees…</p>
          </div>
        ) : fees.length === 0 ? (
          <div className="text-center py-12">
            <FaMapMarkerAlt className="text-gray-300 text-4xl mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">No Setup Fees Configured</h3>
            <p className="text-gray-500 text-sm mb-4">
              Add location-based setup fees for tenants activating rent savings plans.
            </p>
            <button onClick={openCreate} className="btn btn-primary">
              <FaPlus className="mr-2" /> Add First Setup Fee
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">State</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">LGA</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Setup Fee (₦)</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Created</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee) => (
                  <tr key={fee.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-2 font-medium text-gray-800">
                      {fee.state_name || `State #${fee.state_id}`}
                    </td>
                    <td className="py-3 px-2 text-gray-600">
                      {fee.lga_name || (fee.lga_id ? `LGA #${fee.lga_id}` : (
                        <span className="text-xs text-gray-400 italic">— State-wide —</span>
                      ))}
                    </td>
                    <td className="py-3 px-2 text-right font-semibold text-gray-800">
                      ₦{Number(fee.setup_fee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-500 text-xs">
                      {new Date(fee.created_at).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(fee)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <FaEdit className="text-sm" />
                        </button>
                        <button
                          onClick={() => openDeleteDialog(fee)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <FaTrash className="text-sm" />
                        </button>
                      </div>
                      {fee.operations?.length ? (
                        <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2 text-left text-xs text-gray-600">
                          <p className="font-semibold text-gray-800">
                            {String(fee.operations[0].event_type || '').replace(/_/g, ' ')}
                            {' '}
                            <span className="font-normal text-gray-500">
                              by {fee.operations[0].actor_name || 'Admin'}
                            </span>
                          </p>
                          <p className="mt-1 line-clamp-2">
                            {fee.operations[0].note || 'No note recorded'}
                          </p>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ─────────────────────────── */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <FaEdit className="text-purple-500 text-xl" />
                <h3 className="text-lg font-bold text-gray-800">
                  {editId ? 'Edit Setup Fee' : 'Add Setup Fee'}
                </h3>
              </div>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                <FaTimes className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* State */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.state_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, state_id: e.target.value, lga_id: '' }))}
                  className="input w-full"
                  disabled={locationsLoading}
                >
                  <option value="">— Select State —</option>
                                    {states.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.state_name || s.name || `State #${s.id}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* LGA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LGA <span className="text-gray-400 font-normal">(optional — leave empty for state-wide)</span>
                </label>
                <select
                  value={formData.lga_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, lga_id: e.target.value }))}
                  className="input w-full"
                  disabled={!formData.state_id}
                >
                  <option value="">— All LGAs (State-wide) —</option>
                  {lgas.map(lga => (
                    <option key={lga.id} value={lga.id}>
                      {lga.name || `LGA #${lga.id}`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Leave empty to apply this fee across the entire state.
                  Specify an LGA to override the state fee for that area.
                </p>
              </div>

              {/* Fee Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setup Fee (₦) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₦</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.setup_fee}
                    onChange={(e) => setFormData(prev => ({ ...prev, setup_fee: e.target.value }))}
                    className="input w-full pl-8"
                    placeholder="e.g. 2000"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  This one-time fee is charged when a tenant activates a rent savings plan.
                </p>
              </div>

              {/* Existing fee warning */}
              {!editId && formData.state_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-amber-700">
                    <strong>Note:</strong> If a fee already exists for this state/LGA combination,
                    it will be updated instead of creating a duplicate.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Governance note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.governance_note}
                  onChange={(e) => setFormData(prev => ({ ...prev, governance_note: e.target.value }))}
                  className="input w-full min-h-[96px]"
                  placeholder="Explain why this setup fee is being created or changed"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn w-full" disabled={submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.state_id || !formData.setup_fee}
                  className="btn bg-purple-600 text-white w-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><FaSpinner className="animate-spin" /> Saving…</>
                  ) : (
                    <><FaSave /> {editId ? 'Update Fee' : 'Create Fee'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                Rent savings governance
              </p>
              <h3 className="mt-1 text-lg font-bold text-gray-800">
                Delete setup fee
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {deleteDialog.fee?.state_name || `State #${deleteDialog.fee?.state_id}`}
                {deleteDialog.fee?.lga_name ? ` - ${deleteDialog.fee.lga_name}` : ' - State-wide'}
              </p>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deletion reason
            </label>
            <textarea
              value={deleteDialog.reason}
              onChange={(e) =>
                setDeleteDialog((prev) => ({
                  ...prev,
                  reason: e.target.value,
                  error: '',
                }))
              }
              className="input w-full min-h-[120px]"
              placeholder="Explain why this setup fee is being removed"
            />

            {deleteDialog.error ? (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteDialog.error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleteDialog.loading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteDialog.loading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleteDialog.loading ? 'Deleting...' : 'Delete Setup Fee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
