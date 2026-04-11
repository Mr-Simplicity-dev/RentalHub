import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaChartLine,
  FaDownload,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaSearch,
  FaShieldAlt,
  FaUsers,
} from 'react-icons/fa';
import AdminLayout from './AdminLayout';
import api from '../../services/api';

const currency = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const dateLabel = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const SuperFinancialAdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [frozenFunds, setFrozenFunds] = useState([]);
  const [statePerformance, setStatePerformance] = useState([]);
  const [filters, setFilters] = useState({
    reference: '',
    txType: '',
    state: '',
    fromDate: '',
    toDate: '',
  });

  useEffect(() => {
    const boot = async () => {
      try {
        const me = await api.get('/api/users/me');
        if (me?.data?.data?.user_type !== 'super_financial_admin') {
          navigate('/admin/dashboard', { replace: true });
          return;
        }

        const [statsRes, transactionsRes, frozenRes, performanceRes] = await Promise.all([
          api.get('/api/financial-admin/stats/realtime'),
          api.get('/api/financial-admin/transactions?limit=20&page=1'),
          api.get('/api/financial-admin/funds/frozen'),
          api.get('/api/financial-admin/performance/state-admins'),
        ]);

        setStats(statsRes?.data?.data || null);
        setRecentTransactions(transactionsRes?.data?.data || []);
        setFrozenFunds(frozenRes?.data?.data || []);
        setStatePerformance(performanceRes?.data?.data?.admin_performance || performanceRes?.data?.data || []);
      } catch (error) {
        console.error('Super financial dashboard init error:', error);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [navigate]);

  const totals = useMemo(() => {
    const todayCount = (stats?.today || []).reduce((sum, item) => sum + Number(item.today_count || 0), 0);
    const todayAmount = (stats?.today || []).reduce((sum, item) => sum + Number(item.today_amount || 0), 0);
    const weekAmount = Number(stats?.week?.week_amount || 0);
    const monthAmount = Number(stats?.month?.month_amount || 0);
    const frozenAmount = (frozenFunds || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      todayCount,
      todayAmount,
      weekAmount,
      monthAmount,
      frozenAmount,
    };
  }, [stats, frozenFunds]);

  const monthlyTrend = useMemo(() => {
    const source = Array.isArray(stats?.month) ? stats.month : [];
    const normalized = source
      .map((item) => ({
        label: item.date || item.month || 'N/A',
        amount: Number(item.month_amount || item.amount || 0),
      }))
      .slice(-8);

    const max = normalized.reduce((m, item) => Math.max(m, item.amount), 0);
    return normalized.map((item) => ({
      ...item,
      widthPct: max > 0 ? Math.max(8, Math.round((item.amount / max) * 100)) : 8,
    }));
  }, [stats]);

  const filteredTransactions = useMemo(() => {
    return recentTransactions.filter((tx) => {
      const ref = String(tx.reference || tx.id || '').toLowerCase();
      const type = String(tx.payment_type || tx.type || '').toLowerCase();
      const createdAt = tx.created_at || tx.date;
      const createdTime = createdAt ? new Date(createdAt).getTime() : null;

      const byReference = !filters.reference || ref.includes(filters.reference.toLowerCase());
      const byType = !filters.txType || type === filters.txType.toLowerCase();
      const byFrom = !filters.fromDate || (createdTime && createdTime >= new Date(filters.fromDate).getTime());
      const byTo = !filters.toDate || (createdTime && createdTime <= new Date(filters.toDate).getTime() + 86399999);

      return byReference && byType && byFrom && byTo;
    });
  }, [recentTransactions, filters.reference, filters.txType, filters.fromDate, filters.toDate]);

  const filteredStatePerformance = useMemo(() => {
    return statePerformance.filter((row) => {
      const stateName = String(row.assigned_state || '').toLowerCase();
      const matchesState = !filters.state || stateName.includes(filters.state.toLowerCase());
      return matchesState;
    });
  }, [statePerformance, filters.state]);

  const commissionHealth = useMemo(() => {
    const pendingTotal = filteredStatePerformance.reduce(
      (sum, row) => sum + Number(row.pending_commissions || row.total_pending || 0),
      0
    );
    const withdrawnTotal = filteredStatePerformance.reduce(
      (sum, row) => sum + Number(row.total_withdrawn || 0),
      0
    );
    const denominator = pendingTotal + withdrawnTotal;
    const pendingRatio = denominator > 0 ? (pendingTotal / denominator) * 100 : 0;

    let label = 'Commission Check: Healthy';
    let chipClass = 'bg-green-100 text-green-700';
    if (pendingRatio >= 35) {
      label = 'Commission Check: Needs Attention';
      chipClass = 'bg-red-100 text-red-700';
    } else if (pendingRatio >= 15) {
      label = 'Commission Check: Monitor';
      chipClass = 'bg-amber-100 text-amber-700';
    }

    return {
      label,
      chipClass,
      pendingTotal,
      withdrawnTotal,
    };
  }, [filteredStatePerformance]);

  const exportCsv = (filename, rows) => {
    if (!rows || rows.length === 0) return;

    const keys = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row || {}).forEach((key) => set.add(key));
        return set;
      }, new Set())
    );

    const csv = [
      keys.join(','),
      ...rows.map((row) =>
        keys
          .map((key) => {
            const raw = row?.[key];
            const value = raw === null || raw === undefined ? '' : String(raw);
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <section className="rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Super Financial Admin Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">Nationwide financial oversight across all states and all payout lanes.</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <FaShieldAlt className="h-6 w-6 text-blue-700" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl bg-white p-5 shadow">
            <p className="text-xs uppercase tracking-wide text-gray-500">Today Transactions</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{totals.todayCount}</p>
          </article>

          <article className="rounded-xl bg-white p-5 shadow">
            <p className="text-xs uppercase tracking-wide text-gray-500">Today Volume</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{currency(totals.todayAmount)}</p>
          </article>

          <article className="rounded-xl bg-white p-5 shadow">
            <p className="text-xs uppercase tracking-wide text-gray-500">7 Day Volume</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{currency(totals.weekAmount)}</p>
          </article>

          <article className="rounded-xl bg-white p-5 shadow">
            <p className="text-xs uppercase tracking-wide text-gray-500">Month Volume</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{currency(totals.monthAmount)}</p>
          </article>

          <article className="rounded-xl bg-white p-5 shadow">
            <p className="text-xs uppercase tracking-wide text-gray-500">Frozen Funds</p>
            <p className="mt-2 text-2xl font-bold text-red-700">{currency(totals.frozenAmount)}</p>
          </article>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Commission Health</p>
              <p className="mt-1 text-sm text-blue-800">Global payout pressure based on pending commissions vs withdrawn amounts.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${commissionHealth.chipClass}`}>
                {commissionHealth.label}
              </span>
              <button
                type="button"
                onClick={() =>
                  exportCsv(
                    'commission-withdrawal-snapshot.csv',
                    filteredStatePerformance.map((row) => ({
                      state: row.assigned_state || 'Unknown',
                      pending_commissions: Number(row.pending_commissions || row.total_pending || 0),
                      total_withdrawn: Number(row.total_withdrawn || 0),
                      transaction_count: Number(row.total_commissions || row.transaction_count || 0),
                    }))
                  )
                }
                className="rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                Export Withdrawal Snapshot
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-gray-500">Pending Commissions</p>
              <p className="mt-1 font-semibold text-gray-900">{currency(commissionHealth.pendingTotal)}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-gray-500">Total Withdrawn</p>
              <p className="mt-1 font-semibold text-gray-900">{currency(commissionHealth.withdrawnTotal)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Executive Filters</h2>
            <FaSearch className="text-gray-500" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              type="text"
              value={filters.reference}
              onChange={(e) => setFilters((prev) => ({ ...prev, reference: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Filter by reference"
            />
            <select
              value={filters.txType}
              onChange={(e) => setFilters((prev) => ({ ...prev, txType: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All transaction types</option>
              <option value="rent_payment">Rent payment</option>
              <option value="wallet_funding">Wallet funding</option>
              <option value="tenant_subscription">Tenant subscription</option>
              <option value="landlord_listing">Landlord listing</option>
              <option value="property_unlock">Property unlock</option>
            </select>
            <input
              type="text"
              value={filters.state}
              onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Filter by state"
            />
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Monthly Trend Snapshot</h2>
            <FaChartLine className="text-gray-500" />
          </div>
          <div className="space-y-3">
            {monthlyTrend.length === 0 && <p className="text-sm text-gray-500">No monthly trend data yet</p>}
            {monthlyTrend.map((item, idx) => (
              <div key={`${item.label}-${idx}`} className="grid grid-cols-12 items-center gap-3">
                <p className="col-span-3 text-xs text-gray-600">{dateLabel(item.label)}</p>
                <div className="col-span-7 h-2 rounded bg-gray-100">
                  <div
                    className="h-2 rounded bg-blue-600"
                    style={{ width: `${item.widthPct}%` }}
                  />
                </div>
                <p className="col-span-2 text-right text-xs font-medium text-gray-700">{currency(item.amount)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <article className="rounded-xl bg-white p-5 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => exportCsv('super-financial-transactions.csv', filteredTransactions)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FaDownload />
                  Export CSV
                </button>
                <FaMoneyBillWave className="text-gray-500" />
              </div>
            </div>
            <p className="mb-3 text-xs text-gray-500">Showing {filteredTransactions.length} transactions</p>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="py-2">Reference</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td className="py-3 text-gray-500" colSpan={4}>No transactions yet</td>
                    </tr>
                  )}
                  {filteredTransactions.map((tx) => (
                    <tr className="border-b" key={tx.id || tx.reference}>
                      <td className="py-2 font-medium text-gray-800">{tx.reference || tx.id}</td>
                      <td className="py-2 text-gray-600">{tx.payment_type || tx.type || 'N/A'}</td>
                      <td className="py-2 text-gray-800">{currency(tx.amount)}</td>
                      <td className="py-2 text-gray-600">{dateLabel(tx.created_at || tx.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-xl bg-white p-5 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">State Financial Performance</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => exportCsv('super-financial-state-performance.csv', filteredStatePerformance)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FaDownload />
                  Export CSV
                </button>
                <FaUsers className="text-gray-500" />
              </div>
            </div>
            <p className="mb-3 text-xs text-gray-500">Showing {filteredStatePerformance.length} state entries</p>
            <div className="space-y-3">
              {filteredStatePerformance.length === 0 && <p className="text-sm text-gray-500">No state performance data yet</p>}
              {filteredStatePerformance.slice(0, 10).map((state, idx) => (
                <div key={`${state.assigned_state || 'state'}-${idx}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{state.assigned_state || 'Unknown State'}</p>
                    <p className="text-sm font-semibold text-blue-700">{currency(state.pending_commissions || state.total_pending || 0)}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                    <span>Transactions: {Number(state.total_commissions || state.transaction_count || 0)}</span>
                    <span>Withdrawn: {currency(state.total_withdrawn || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Active Frozen Funds</h2>
            <FaExclamationTriangle className="text-red-500" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {frozenFunds.length === 0 && <p className="text-sm text-gray-500">No active frozen balances</p>}
            {frozenFunds.map((fund) => (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3" key={fund.id || `${fund.user_id}-${fund.created_at}`}>
                <p className="text-sm font-semibold text-gray-900">User #{fund.user_id}</p>
                <p className="mt-1 text-sm text-red-700">{currency(fund.amount)}</p>
                <p className="mt-1 text-xs text-gray-600">Reason: {fund.reason || 'N/A'}</p>
                <p className="mt-1 text-xs text-gray-500">{dateLabel(fund.created_at)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-blue-800">
            <FaChartLine />
            <p className="text-sm font-semibold">Super financial controls</p>
          </div>
          <p className="mt-1 text-sm text-blue-700">
            Use this dashboard for nationwide finance monitoring and open the state dashboard only for state-bounded operations.
          </p>
        </section>
      </div>
    </AdminLayout>
  );
};

export default SuperFinancialAdminDashboard;
