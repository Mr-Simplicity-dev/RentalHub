import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FaEdit, FaPlus, FaTrash, FaUniversity } from 'react-icons/fa';
import api from '../../services/api';

const emptyForm = {
  bank_name: '',
  account_name: '',
  account_number: '',
  sort_code: '',
  instructions: '',
  sort_order: 0,
  is_active: true,
};

export default function BankAccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/bank-transfers/accounts');
      setAccounts(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load bank accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.bank_name.trim() || !form.account_name.trim() || !form.account_number.trim()) {
      toast.error('Bank name, account name and account number are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        bank_name: form.bank_name.trim(),
        account_name: form.account_name.trim(),
        account_number: form.account_number.trim(),
        sort_code: form.sort_code.trim() || null,
        instructions: form.instructions.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };

      if (editingId) {
        await api.patch(`/admin/bank-transfers/accounts/${editingId}`, payload);
        toast.success('Bank account updated');
      } else {
        await api.post('/admin/bank-transfers/accounts', payload);
        toast.success('Bank account added');
      }

      resetForm();
      await loadAccounts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save bank account');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingId(account.id);
    setForm({
      bank_name: account.bank_name || '',
      account_name: account.account_name || '',
      account_number: account.account_number || '',
      sort_code: account.sort_code || '',
      instructions: account.instructions || '',
      sort_order: account.sort_order || 0,
      is_active: account.is_active !== false,
    });
  };

  const handleToggle = async (account) => {
    try {
      await api.patch(`/admin/bank-transfers/accounts/${account.id}`, {
        is_active: !account.is_active,
      });
      await loadAccounts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update the account');
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Remove ${account.bank_name} • ${account.account_number}?`)) return;
    try {
      await api.delete(`/admin/bank-transfers/accounts/${account.id}`);
      toast.success('Bank account removed');
      if (editingId === account.id) resetForm();
      await loadAccounts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not remove the account');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
        These accounts are shown to users who choose <strong>Bank transfer</strong> at registration or
        when funding their wallet. Add every account you want payers to be able to transfer into.
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <FaUniversity className="text-teal-600" /> Receiving accounts
            </h3>
            <span className="text-xs text-gray-500">{accounts.length} total</span>
          </div>

          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No receiving account yet. Add the first one on the right.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map((account) => (
                <div key={account.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {account.bank_name}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${account.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {account.is_active ? 'active' : 'hidden'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-700">{account.account_name}</p>
                      <p className="font-mono text-sm text-gray-900">{account.account_number}</p>
                      {account.instructions ? (
                        <p className="mt-1 text-xs text-gray-500">{account.instructions}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(account)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {account.is_active ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(account)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                        aria-label="Edit account"
                      >
                        <FaEdit />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(account)}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                        aria-label="Delete account"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <FaPlus className="text-teal-600" /> {editingId ? 'Edit account' : 'Add account'}
          </h3>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Bank name</label>
            <input
              className="input w-full"
              value={form.bank_name}
              onChange={(event) => setForm({ ...form, bank_name: event.target.value })}
              placeholder="Moniepoint / OPay / PalmPay"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Account name</label>
            <input
              className="input w-full"
              value={form.account_name}
              onChange={(event) => setForm({ ...form, account_name: event.target.value })}
              placeholder="Amana RentalHub NG"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Account number</label>
            <input
              className="input w-full font-mono"
              value={form.account_number}
              onChange={(event) => setForm({ ...form, account_number: event.target.value })}
              placeholder="0123456789"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Sort code</label>
              <input
                className="input w-full"
                value={form.sort_code}
                onChange={(event) => setForm({ ...form, sort_code: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Order</label>
              <input
                type="number"
                className="input w-full"
                value={form.sort_order}
                onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Instructions (optional)</label>
            <textarea
              className="input w-full"
              rows={3}
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
              placeholder="Use your reference as the transfer narration"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
            />
            Show this account to payers
          </label>

          <div className="flex gap-2">
            {editingId ? (
              <button type="button" onClick={resetForm} className="btn w-full">
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving} className="btn btn-primary w-full disabled:opacity-50">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
