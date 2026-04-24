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
  const [formData, setFormData]  = useState({ state_id: '', lga_id: '', setup_fee: '' });

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
      // Fetch states - these are locations where type = 'state' or parent_id IS NULL
      const { data } = await api.get('/locations?type=state');
      if (data.success) {
        setStates(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load locations:', error);
      // Fallback: try the /api/locations endpoint
      try {
        const { data } = await api.get('/locations');
        if (data.success || Array.isArray(data)) {
          const locs = Array.isArray(data) ? data : (data.data || []);
          const stateLocs = locs.filter(l => !l.parent_id || l.type === 'state');
          setStates(stateLocs);
        }
      } catch (err2) {
        console.error('Fallback location load failed:', err2);
      }
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => { loadFees(); loadLocations(); }, []);

  // Load LGAs when state changes
  useEffect(() => {
    if (!formData.state_id) { setLgas([]); return; }
    const loadLgas = async () => {
      try {
        // Fetch LGAs for the selected state
        const { data } = await api.get(`/locations/${formData.state_id}/lgas`);
        if (data.success) setLgas(data.data || []);
        else setLgas([]);
      } catch (error) {
        console.error('Failed to load LGAs:', error);
        setLgas([]);
      }
    };
    loadLgas();
  }, [formData.state_id]);

  // ── Handlers ─────────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setFormData({ state_id: '', lga_id: '', setup_fee: '' });
    setShowForm(true);
  };

  const openEdit = (fee) => {
    setEditId(fee.id);
    setFormData({
      state_id: fee.state_id || '',
      lga_id: fee.lga_id || '',
      setup_fee: fee.setup_fee || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormData({ state_id: '', lga_id: '', setup_fee: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.state_id || !formData.setup_fee) {
      toast.error('State and setup fee are required');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/rent-savings/admin/setup-fees', {
        state_id: parseInt(formData.state_id),
        lga_id: formData.lga_id ? parseInt(formData.lga_id) : null,
        setup_fee: parseFloat(formData.setup_fee),
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

  const handleDelete = async (id, stateName, lgaName) => {
    if (!window.confirm(
      `Delete setup fee for ${stateName}${lgaName ? ` - ${lgaName}` : ''}? This action cannot be undone.`
    )) return;

    try {
      const { data } = await api.delete(`/rent-savings/admin/setup-fees/${id}`);
      if (data.success) {
        toast.success(data.message);
        loadFees();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete setup fee');
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
                          onClick={() => handleDelete(fee.id, fee.state_name, fee.lga_name)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <FaTrash className="text-sm" />
                        </button>
                      </div>
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
                      {s.name || `State #${s.id}`}
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
    </div>
  );
}
