import React, { useState, useEffect, useCallback } from 'react';
import { FaTimes, FaPlus, FaEdit, FaTrash, FaCalculator, FaGlobeAfrica, FaMapMarkerAlt, FaSave, FaSpinner } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

const BLANK_FIELDS = {
  agent_fee_pct: '',
  legal_fee_pct: '',
  caution_months: '',
  agreement_fee: '',
  service_charge: '0',
};

const EMPTY_FORM = {
  state_id: '',
  state_name: '',
  lga_id: '',
  ...BLANK_FIELDS,
  governance_note: '',
};

export default function RentCalculatorFeesAdmin() {
  const [fees, setFees] = useState([]);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    fee: null,
    reason: '',
    loading: false,
    error: '',
  });

  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const loadFees = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/rent-calculator/admin/fees');
      if (data.success) {
        setFees(data.data);
        setScope(data.scope || null);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load calculator fees');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
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

  useEffect(() => { loadFees(); loadLocations(); }, [loadFees, loadLocations]);

  useEffect(() => {
    if (!formData.state_id) {
      setFormData((prev) => ({ ...prev, state_name: '', lga_id: '' }));
      setLgas([]);
      return;
    }
    const selectedState = states.find((s) => String(s.id) === String(formData.state_id));
    const stateName = selectedState?.state_name || selectedState?.name || '';
    setFormData((prev) => ({ ...prev, state_name: stateName }));
    if (!stateName) { setLgas([]); return; }
    const loadLgas = async () => {
      try {
        const { data } = await api.get(`/recruitment/locations/lgas/${encodeURIComponent(stateName)}`);
        if (data.success) {
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

  const scopeLabel = scope
    ? scope.level === 'global'
      ? 'National (all states & LGAs)'
      : scope.level === 'state'
        ? `State scope — ${scope.assigned_state || 'your state'}`
        : `LGA scope — ${scope.assigned_lga || 'your LGA'}, ${scope.assigned_state || ''}`
    : '';

  const rowScopeLabel = (fee) => {
    if (fee.state_id === null || fee.state_id === undefined) return 'Global default';
    if (fee.lga_id) return `${fee.state_name || `State #${fee.state_id}`} — ${fee.lga_name || `LGA #${fee.lga_id}`}`;
    return `${fee.state_name || `State #${fee.state_id}`} (state-wide)`;
  };

  const canEditRow = (fee) => {
    if (!scope) return false;
    if (scope.level === 'global') return true;
    if (fee.state_id === null || fee.state_id === undefined) return false;
    const stateMatches = String(fee.state_name || '').toLowerCase() === String(scope.assigned_state || '').toLowerCase();
    if (scope.level === 'state') return stateMatches;
    return stateMatches && String(fee.lga_name || '').toLowerCase() === String(scope.assigned_lga || '').toLowerCase();
  };

  const openCreate = () => {
    setEditId(null);
    setFormData({
      ...EMPTY_FORM,
      state_id: scope?.level === 'global' ? '' : (scope?.level === 'state' ? '' : ''),
    });
    setShowForm(true);
  };

  const openEdit = (fee) => {
    setEditId(fee.id);
    setFormData({
      state_id: fee.state_id || '',
      state_name: fee.state_name || '',
      lga_id: fee.lga_id || '',
      agent_fee_pct: fee.agent_fee_pct ?? '',
      legal_fee_pct: fee.legal_fee_pct ?? '',
      caution_months: fee.caution_months ?? '',
      agreement_fee: fee.agreement_fee ?? '',
      service_charge: fee.service_charge ?? '0',
      governance_note: '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormData({ ...EMPTY_FORM });
  };

  const canPickGlobalRow = scope?.level === 'global';
  const canPickState = scope?.level === 'global' || scope?.level === 'state';
  const canPickLga = scope?.level === 'global' || scope?.level === 'state';
  const creatingOwnLgaRow = scope?.level === 'lga';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.governance_note.trim()) {
      toast.error('Add a governance note before saving');
      return;
    }
    if (canPickState && !formData.state_id && !creatingOwnLgaRow) {
      toast.error('Select a state, or leave both state and LGA empty to manage the global default');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        state_id: formData.state_id ? parseInt(formData.state_id, 10) : undefined,
        lga_id: formData.lga_id ? parseInt(formData.lga_id, 10) : undefined,
        agent_fee_pct: parseFloat(formData.agent_fee_pct),
        legal_fee_pct: parseFloat(formData.legal_fee_pct),
        caution_months: parseFloat(formData.caution_months),
        agreement_fee: parseFloat(formData.agreement_fee),
        service_charge: parseFloat(formData.service_charge || '0'),
        governance_note: formData.governance_note.trim(),
      };
      const { data } = await api.post('/rent-calculator/admin/fees', payload);
      if (data.success) {
        toast.success(data.message);
        closeForm();
        loadFees();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save calculator fees');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteDialog = (fee) => {
    setDeleteDialog({ open: true, fee, reason: '', loading: false, error: '' });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, fee: null, reason: '', loading: false, error: '' });
  };

  const handleDelete = async () => {
    const reason = deleteDialog.reason.trim();
    if (!reason) {
      setDeleteDialog((prev) => ({ ...prev, error: 'A deletion reason is required' }));
      return;
    }
    setDeleteDialog((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const { data } = await api.delete(`/rent-calculator/admin/fees/${deleteDialog.fee.id}`, {
        data: { reason },
      });
      if (data.success) {
        toast.success(data.message);
        closeDeleteDialog();
        loadFees();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete calculator fees');
      setDeleteDialog((prev) => ({ ...prev, loading: false, error: 'Delete failed. Check the message above and try again.' }));
    }
  };

  const num = (v) => Number(v || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const pct = (v) => `${Number(v || 0)}%`;
  const months = (v) => `${Number(v || 0)} mo`;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <FaCalculator className="text-violet-500 text-xl" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">Rent Calculator Fees</h2>
            {scopeLabel && <p className="text-xs text-gray-500">{scopeLabel}</p>}
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <FaPlus className="text-xs" />
          {scope?.level === 'global' ? 'Add / Edit Fee' : 'Set rates'}
        </button>
      </div>

      {/* Body */}
      <div className="p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">Loading calculator fees…</p>
          </div>
        ) : fees.length === 0 ? (
          <div className="text-center py-12">
            <FaGlobeAfrica className="text-gray-300 text-4xl mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">No Calculator Fees Configured</h3>
            <p className="text-gray-500 text-sm mb-4">
              Set the agent/legal percentages, caution deposit and fees the calculator uses.
            </p>
            <button onClick={openCreate} className="btn btn-primary">
              <FaPlus className="mr-2" /> Configure Fees
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Scope</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Agent</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Legal</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Caution</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Agreement (₦)</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Service (₦)</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee) => {
                  const editable = canEditRow(fee);
                  return (
                    <tr key={fee.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-2">
                        <p className="font-medium text-gray-800">{rowScopeLabel(fee)}</p>
                        {fee.is_default && (
                          <span className="text-[11px] text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full font-semibold">Fallback</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-800">{pct(fee.agent_fee_pct)}</td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-800">{pct(fee.legal_fee_pct)}</td>
                      <td className="py-3 px-2 text-right text-gray-700">{months(fee.caution_months)}</td>
                      <td className="py-3 px-2 text-right text-gray-700">{num(fee.agreement_fee)}</td>
                      <td className="py-3 px-2 text-right text-gray-700">{num(fee.service_charge)}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(fee)}
                            disabled={!editable}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={editable ? 'Edit' : 'Outside your scope'}
                          >
                            <FaEdit className="text-sm" />
                          </button>
                          <button
                            onClick={() => openDeleteDialog(fee)}
                            disabled={!editable}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={editable ? 'Delete' : 'Outside your scope'}
                          >
                            <FaTrash className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <FaEdit className="text-violet-500 text-xl" />
                <h3 className="text-lg font-bold text-gray-800">
                  {editId ? 'Edit Calculator Fees' : 'Configure Calculator Fees'}
                </h3>
              </div>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                <FaTimes className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {(canPickGlobalRow || canPickState) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      value={formData.state_id}
                      onChange={(e) => setFormData((prev) => ({ ...prev, state_id: e.target.value, lga_id: '' }))}
                      className="input w-full"
                      disabled={locationsLoading || !canPickState}
                    >
                      {canPickGlobalRow && <option value="">— Global default (all locations) —</option>}
                      {states.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.state_name || s.name || `State #${s.id}`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {canPickGlobalRow
                        ? 'Leave on "Global default" to set the rates every unconfigured location uses.'
                        : 'Rates apply to your assigned state; pick an LGA below for a local override.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      LGA <span className="text-gray-400 font-normal">(optional — blank = state-wide / global)</span>
                    </label>
                    <select
                      value={formData.lga_id}
                      onChange={(e) => setFormData((prev) => ({ ...prev, lga_id: e.target.value }))}
                      className="input w-full"
                      disabled={!formData.state_id}
                    >
                      <option value="">— All LGAs —</option>
                      {lgas.map((lga) => (
                        <option key={lga.id} value={lga.id}>{lga.name || `LGA #${lga.id}`}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {creatingOwnLgaRow && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3 text-sm text-violet-700 flex items-center gap-2">
                  <FaMapMarkerAlt className="shrink-0" />
                  Rates below will apply to your LGA: <strong>{scope?.assigned_lga}</strong>, {scope?.assigned_state}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agent fee %</label>
                  <input type="number" required min="0" max="100" step="0.01" value={formData.agent_fee_pct}
                    onChange={(e) => setFormData((prev) => ({ ...prev, agent_fee_pct: e.target.value }))}
                    className="input w-full" placeholder="10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legal fee %</label>
                  <input type="number" required min="0" max="100" step="0.01" value={formData.legal_fee_pct}
                    onChange={(e) => setFormData((prev) => ({ ...prev, legal_fee_pct: e.target.value }))}
                    className="input w-full" placeholder="10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Caution (months)</label>
                  <input type="number" required min="0" step="0.5" value={formData.caution_months}
                    onChange={(e) => setFormData((prev) => ({ ...prev, caution_months: e.target.value }))}
                    className="input w-full" placeholder="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agreement fee (₦)</label>
                  <input type="number" required min="0" step="0.01" value={formData.agreement_fee}
                    onChange={(e) => setFormData((prev) => ({ ...prev, agreement_fee: e.target.value }))}
                    className="input w-full" placeholder="5000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service charge (₦)</label>
                  <input type="number" min="0" step="0.01" value={formData.service_charge}
                    onChange={(e) => setFormData((prev) => ({ ...prev, service_charge: e.target.value }))}
                    className="input w-full" placeholder="0" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Governance note <span className="text-red-500">*</span>
                </label>
                <textarea value={formData.governance_note}
                  onChange={(e) => setFormData((prev) => ({ ...prev, governance_note: e.target.value }))}
                  className="input w-full min-h-[80px]" placeholder="Explain this fee change" required />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn w-full" disabled={submitting}>Cancel</button>
                <button type="submit" disabled={submitting}
                  className="btn bg-violet-600 text-white w-full hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><FaSpinner className="animate-spin" /> Saving…</> : <><FaSave /> Save Rates</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Modal ─────────────────────────────── */}
      {deleteDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-800">Delete fee configuration</h3>
              <p className="mt-2 text-sm text-gray-600">{rowScopeLabel(deleteDialog.fee)}</p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deletion reason</label>
            <textarea value={deleteDialog.reason}
              onChange={(e) => setDeleteDialog((prev) => ({ ...prev, reason: e.target.value, error: '' }))}
              className="input w-full min-h-[100px]" placeholder="Explain why these rates are being removed" />
            {deleteDialog.error ? (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteDialog.error}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeDeleteDialog} disabled={deleteDialog.loading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleteDialog.loading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {deleteDialog.loading ? 'Deleting...' : 'Delete Rates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
