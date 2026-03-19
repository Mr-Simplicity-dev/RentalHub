import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

const defaultForm = {
  applies_to: 'tenant_registration',
  state_id: '',
  lga_name: '',
  amount: '',
  is_active: true,
};

const PricingRulesTab = () => {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [targets, setTargets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const loadPricingData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/super/pricing-rules');
      const payload = response.data?.data || {};

      setRules(payload.rules || []);
      setTargets(payload.targets || []);
      setLocations(payload.locations || []);
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message || 'Failed to load pricing rules'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPricingData();
  }, []);

  const selectedState = useMemo(
    () => locations.find((item) => String(item.id) === String(form.state_id)),
    [locations, form.state_id]
  );

  const availableLgas = selectedState?.lgas || [];

  const resetForm = () => {
    setEditingRuleId(null);
    setForm(defaultForm);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'state_id' ? { lga_name: '' } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.state_id) {
      toast.error('Select a state');
      return;
    }

    if (!form.amount) {
      toast.error('Enter the amount to charge');
      return;
    }

    const payload = {
      applies_to: form.applies_to,
      state_id: Number(form.state_id),
      lga_name: form.lga_name || undefined,
      amount: Number(form.amount),
      is_active: form.is_active,
    };

    try {
      setLoading(true);

      if (editingRuleId) {
        await api.patch(`/super/pricing-rules/${editingRuleId}`, payload);
        toast.success('Pricing rule updated');
      } else {
        await api.post('/super/pricing-rules', payload);
        toast.success('Pricing rule created');
      }

      resetForm();
      await loadPricingData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message || 'Failed to save pricing rule'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rule) => {
    setEditingRuleId(rule.id);
    setForm({
      applies_to: rule.applies_to,
      state_id: String(rule.state_id),
      lga_name: rule.lga_name || '',
      amount: String(rule.amount),
      is_active: rule.is_active === true,
    });
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this pricing rule?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/super/pricing-rules/${ruleId}`);
      toast.success('Pricing rule deleted');

      if (editingRuleId === ruleId) {
        resetForm();
      }

      await loadPricingData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message || 'Failed to delete pricing rule'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (rule) => {
    try {
      setLoading(true);
      await api.patch(`/super/pricing-rules/${rule.id}`, {
        applies_to: rule.applies_to,
        state_id: rule.state_id,
        lga_name: rule.lga_name || undefined,
        amount: rule.amount,
        is_active: !rule.is_active,
      });
      toast.success(
        `Pricing rule ${rule.is_active ? 'disabled' : 'enabled'}`
      );
      await loadPricingData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message || 'Failed to update pricing rule'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-left">
      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="text-lg font-semibold text-gray-900">
          Location Pricing Rules
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Configure the final amount to charge by state or local government area.
          LGA rules override state rules. If no rule exists, the base platform fee
          is used.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {targets.map((target) => (
            <div
              key={target.key}
              className="rounded-lg border border-soft bg-gray-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-gray-900">
                {target.label}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Base fee: N{Number(target.base_amount || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-gray-900">
              {editingRuleId ? 'Edit Pricing Rule' : 'Create Pricing Rule'}
            </h4>
            <p className="text-sm text-gray-500">
              Leave LGA empty to apply the amount to the whole state.
            </p>
          </div>

          {editingRuleId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-soft px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Applies To
            </label>
            <select
              name="applies_to"
              value={form.applies_to}
              onChange={handleChange}
              className="input"
            >
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount (NGN)
            </label>
            <input
              name="amount"
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={handleChange}
              className="input"
              placeholder="Enter final amount"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              State
            </label>
            <select
              name="state_id"
              value={form.state_id}
              onChange={handleChange}
              className="input"
            >
              <option value="">Select state</option>
              {locations.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.state_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Local Government Area
            </label>
            <select
              name="lga_name"
              value={form.lga_name}
              onChange={handleChange}
              className="input"
              disabled={!form.state_id}
            >
              <option value="">Whole state</option>
              {availableLgas.map((lga) => (
                <option key={lga} value={lga}>
                  {lga}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 text-sm text-gray-700 md:col-span-2">
            <input
              name="is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={handleChange}
            />
            Rule is active
          </label>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary md:col-span-2"
          >
            {loading
              ? 'Saving...'
              : editingRuleId
                ? 'Update Pricing Rule'
                : 'Create Pricing Rule'}
          </button>
        </form>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-gray-900">Existing Rules</h4>
            <p className="text-sm text-gray-500">
              Rules are applied by target, then LGA, then state.
            </p>
          </div>

          <button
            type="button"
            onClick={loadPricingData}
            disabled={loading}
            className="rounded-lg border border-soft px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3 text-left">Target</th>
                <th className="p-3 text-left">State</th>
                <th className="p-3 text-left">LGA</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-gray-500">
                    No pricing rules configured yet.
                  </td>
                </tr>
              )}

              {rules.map((rule) => {
                const target = targets.find((item) => item.key === rule.applies_to);

                return (
                  <tr key={rule.id} className="border-t border-soft">
                    <td className="p-3">{target?.label || rule.applies_to}</td>
                    <td className="p-3">{rule.state_name}</td>
                    <td className="p-3">{rule.lga_name || 'Whole state'}</td>
                    <td className="p-3">N{Number(rule.amount || 0).toLocaleString()}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          rule.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(rule)}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white transition hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(rule)}
                          className="rounded-lg bg-amber-600 px-3 py-1 text-xs text-white transition hover:bg-amber-700"
                        >
                          {rule.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule.id)}
                          className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white transition hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PricingRulesTab;
