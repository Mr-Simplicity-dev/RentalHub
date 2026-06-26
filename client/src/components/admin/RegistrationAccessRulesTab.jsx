import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

const defaultForm = {
  applies_to: 'tenant',
  state_id: '',
  lga_name: '',
  is_active: true,
};

const RegistrationAccessRulesTab = () => {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [targets, setTargets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [ruleAction, setRuleAction] = useState({
    open: false,
    rule: null,
    action: '',
    reason: '',
    loading: false,
    error: '',
  });

  const loadRegistrationAccessData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/super/registration-access-rules');
      const payload = response.data?.data || {};

      setRules(payload.rules || []);
      setTargets(payload.targets || []);
      setLocations(payload.locations || []);
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message ||
          'Failed to load registration access rules'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegistrationAccessData();
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

    const payload = {
      applies_to: form.applies_to,
      state_id: Number(form.state_id),
      lga_name: form.lga_name || undefined,
      is_active: form.is_active,
    };

    try {
      setLoading(true);

      if (editingRuleId) {
        await api.patch(
          `/super/registration-access-rules/${editingRuleId}`,
          payload
        );
        toast.success('Registration access rule updated');
      } else {
        await api.post('/super/registration-access-rules', payload);
        toast.success('Registration access rule created');
      }

      resetForm();
      await loadRegistrationAccessData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message ||
          'Failed to save registration access rule'
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
      is_active: rule.is_active === true,
    });
  };

  const openRuleAction = (rule, action) => {
    setRuleAction({
      open: true,
      rule,
      action,
      reason: '',
      loading: false,
      error: '',
    });
  };

  const closeRuleAction = () => {
    setRuleAction({
      open: false,
      rule: null,
      action: '',
      reason: '',
      loading: false,
      error: '',
    });
  };

  const handleDelete = async (rule, reason) => {
    try {
      setLoading(true);
      await api.delete(`/super/registration-access-rules/${rule.id}`, {
        data: { reason },
      });
      toast.success('Registration access rule deleted');

      if (editingRuleId === rule.id) {
        resetForm();
      }

      await loadRegistrationAccessData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message ||
          'Failed to delete registration access rule'
      );
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (rule, reason) => {
    try {
      setLoading(true);
      await api.patch(`/super/registration-access-rules/${rule.id}`, {
        applies_to: rule.applies_to,
        state_id: rule.state_id,
        lga_name: rule.lga_name || undefined,
        is_active: !rule.is_active,
        reason,
      });
      toast.success(
        `Registration access rule ${rule.is_active ? 'disabled' : 'enabled'}`
      );
      await loadRegistrationAccessData();
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message ||
          'Failed to update registration access rule'
      );
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const submitRuleAction = async () => {
    const reason = ruleAction.reason.trim();
    if (!reason) {
      setRuleAction((prev) => ({ ...prev, error: 'A reason is required' }));
      return;
    }

    try {
      setRuleAction((prev) => ({ ...prev, loading: true, error: '' }));
      if (ruleAction.action === 'delete') {
        await handleDelete(ruleAction.rule, reason);
      } else {
        await toggleActive(ruleAction.rule, reason);
      }
      closeRuleAction();
    } catch {
      setRuleAction((prev) => ({
        ...prev,
        loading: false,
        error: 'Action failed. Check the message above and try again.',
      }));
    }
  };

  const formatOperationLabel = (eventType) => {
    const labels = {
      registration_access_rule_created: 'Created',
      registration_access_rule_updated: 'Updated',
      registration_access_rule_enabled: 'Enabled',
      registration_access_rule_disabled: 'Disabled',
      registration_access_rule_deleted: 'Deleted',
    };
    return labels[eventType] || String(eventType || 'Updated').replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6 animate-fadeIn text-left">
      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <h3 className="text-lg font-semibold text-gray-900">
          Registration Access Rules
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Limit tenant or landlord registration to specific states and local
          government areas. When active rules exist for a role, registration is
          only allowed in those locations. Leave LGA empty to allow an entire
          state. Global role switches on the Flags tab must also be enabled.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {targets.map((target) => (
            <div
              key={target.key}
              className="rounded-lg border border-soft bg-gray-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-gray-900">{target.label}</p>
              <p className="mt-1 text-sm text-gray-600">
                Whitelist locations when rules are configured.
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-gray-900">
              {editingRuleId ? 'Edit Access Rule' : 'Create Access Rule'}
            </h4>
            <p className="text-sm text-gray-500">
              Leave LGA empty to allow registration across the whole state.
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

          <div className="md:col-span-2">
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
                ? 'Update Access Rule'
                : 'Create Access Rule'}
          </button>
        </form>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-gray-900">Existing Rules</h4>
            <p className="text-sm text-gray-500">
              LGA rules are checked before whole-state rules.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRegistrationAccessData}
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
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">State</th>
                <th className="p-3 text-left">LGA</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">
                    No registration access rules configured yet.
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
                          onClick={() => openRuleAction(rule, rule.is_active ? 'disable' : 'enable')}
                          className="rounded-lg bg-amber-600 px-3 py-1 text-xs text-white transition hover:bg-amber-700"
                        >
                          {rule.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openRuleAction(rule, 'delete')}
                          className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white transition hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                      {Array.isArray(rule.operations) && rule.operations.length > 0 && (
                        <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2 text-left text-xs text-gray-600">
                          <p className="font-semibold text-gray-800">
                            {formatOperationLabel(rule.operations[0].event_type)}
                            {' '}
                            <span className="font-normal text-gray-500">
                              by {rule.operations[0].actor_name || 'Admin'}
                            </span>
                          </p>
                          <p className="mt-1 line-clamp-2">
                            {rule.operations[0].note || 'No note recorded'}
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {ruleAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl2 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                Registration access governance
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">
                {ruleAction.action === 'delete'
                  ? 'Delete access rule'
                  : ruleAction.action === 'disable'
                    ? 'Disable access rule'
                    : 'Enable access rule'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                This can change where users are allowed to create accounts.
              </p>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Reason
              <textarea
                value={ruleAction.reason}
                onChange={(event) =>
                  setRuleAction((prev) => ({
                    ...prev,
                    reason: event.target.value,
                    error: '',
                  }))
                }
                className="input mt-1 min-h-[120px]"
                placeholder="Explain the registration access decision"
              />
            </label>

            {ruleAction.error && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {ruleAction.error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeRuleAction}
                disabled={ruleAction.loading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRuleAction}
                disabled={ruleAction.loading}
                className={ruleAction.action === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
              >
                {ruleAction.loading
                  ? 'Saving...'
                  : ruleAction.action === 'delete'
                    ? 'Delete Rule'
                    : ruleAction.action === 'disable'
                      ? 'Disable Rule'
                      : 'Enable Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistrationAccessRulesTab;
