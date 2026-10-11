import React, { useState, useEffect, useCallback } from 'react';
import { FaDollarSign, FaChartLine, FaSyncAlt, FaDownload } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import AdminWithdrawalModal from '../../components/admin/AdminWithdrawalModal';
import RentCalculatorFeesAdmin from '../../components/admin/RentCalculatorFeesAdmin';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

const ZonalFinancialAdminDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [withdrawable, setWithdrawable] = useState({ withdrawable_amount: 0, total_earned: 0 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [overview, setOverview] = useState(null);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [withdrawableRes, withdrawalsRes, overviewRes] = await Promise.all([
        api.get('/financial-admin/commissions/withdrawable'),
        api.get('/financial-admin/withdrawals/history'),
        api.get('/zonal-financial-admin/overview'),
      ]);
      setWithdrawable(withdrawableRes.data?.data || { withdrawable_amount: 0, total_earned: 0 });
      setWithdrawals(withdrawalsRes.data?.data || []);
      setOverview(overviewRes.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load zonal finance dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const withdrawalTotal = withdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingCount = withdrawals.filter((item) => String(item.status || '').toLowerCase() === 'pending').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Zonal Financial Admin Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Monitor finance activity across your zone and manage your commission withdrawals.
              </p>
              <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {user?.assigned_zone || 'Unassigned Zone'} Zone
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWithdrawDialog(true)}
              className="zonal-finance-withdrawal-action rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Request Withdrawal
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500">Loading finance data…</div>
        ) : (
          <>
            <div id="zonal-finance-personal" className="fin-admin-payments-section grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-white p-5 shadow">
                <p className="text-sm font-medium text-gray-600">Withdrawable Balance</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(withdrawable.withdrawable_amount)}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow">
                <p className="text-sm font-medium text-gray-600">Total Earned</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(withdrawable.total_earned)}</p>
              </div>
              <div className="rounded-lg bg-white p-5 shadow">
                <p className="text-sm font-medium text-gray-600">Withdrawal Requests</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{withdrawals.length}</p>
                <p className="mt-1 text-xs text-amber-700">{pendingCount} pending</p>
              </div>
            </div>

            {overview && (
              <div id="zonal-finance-zone-overview" className="fin-admin-reports-section rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Zone Finance Overview</h2>
                  <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <FaSyncAlt /> Refresh
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-medium text-gray-600">Zone Revenue</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(overview.totalRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-700">Completed Payments</p>
                    <p className="mt-1 text-xl font-bold text-emerald-800">{overview.completedPayments}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-700">Pending Withdrawals</p>
                    <p className="mt-1 text-xl font-bold text-amber-800">{overview.withdrawals?.pending || 0}</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-medium text-blue-700">Paid Out</p>
                    <p className="mt-1 text-xl font-bold text-blue-800">{formatCurrency(overview.withdrawals?.paidOut || 0)}</p>
                  </div>
                </div>

                {overview.stateBreakdown?.length > 0 && (
                  <div className="mt-6 overflow-x-auto">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">State Breakdown</h3>
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">State</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Revenue</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Payments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {overview.stateBreakdown.map((row) => (
                          <tr key={row.state_name}>
                            <td className="px-4 py-3 text-gray-700">{row.state_name}</td>
                            <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(row.revenue)}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{row.payments}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div id="zonal-finance-withdrawals" className="fin-admin-reports-section rounded-lg bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Withdrawal History</h2>
                  <p className="text-sm text-gray-500">Total requested: {formatCurrency(withdrawalTotal)}</p>
                </div>
                <FaDownload className="text-gray-400" />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Bank</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {withdrawals.length === 0 ? (
                      <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">No withdrawal requests yet.</td></tr>
                    ) : withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td className="px-4 py-3 text-gray-600">{formatDate(w.requested_at || w.created_at)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(w.amount)}</td>
                        <td className="px-4 py-3 text-gray-600">{w.bank_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold capitalize text-gray-700">{w.status || 'pending'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="zonal-finance-calculator-fees" className="mt-4">
              <RentCalculatorFeesAdmin />
            </div>
          </>
        )}
      </div>

      <AdminWithdrawalModal
        isOpen={showWithdrawDialog}
        onClose={() => setShowWithdrawDialog(false)}
        isLoading={submittingWithdrawal}
        confirmLabel="Submit Withdrawal Request"
        onSubmit={async (formData) => {
          setSubmittingWithdrawal(true);
          try {
            await api.post('/financial-admin/withdraw/request', {
              amount: parseFloat(formData.amount),
              bank_name: String(formData.bank_name || '').trim(),
              bank_code: String(formData.bank_code || '').trim(),
              account_number: String(formData.account_number || '').trim(),
              account_name: String(formData.account_name || '').trim(),
            });
            toast.success('Withdrawal request submitted');
            setShowWithdrawDialog(false);
            load();
          } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit withdrawal request');
          } finally {
            setSubmittingWithdrawal(false);
          }
        }}
      />
    </div>
  );
};

export default ZonalFinancialAdminDashboard;
