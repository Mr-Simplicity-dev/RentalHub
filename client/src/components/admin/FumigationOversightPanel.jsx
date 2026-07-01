import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaChartLine,
  FaCheckCircle,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-NG');
};

const statusClass = (status) => {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'cancelled') return 'bg-red-100 text-red-700';
  if (['in_progress', 'scheduled', 'confirmed'].includes(status)) {
    return 'bg-blue-100 text-blue-700';
  }
  return 'bg-amber-100 text-amber-700';
};

const FumigationOversightPanel = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({});
  const [bookings, setBookings] = useState([]);
  const [providers, setProviders] = useState([]);

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [statsRes, bookingsRes, providersRes] = await Promise.all([
        api.get('/fumigation-cleaning/admin/stats'),
        api.get('/fumigation-cleaning/admin/bookings'),
        api.get('/fumigation-cleaning/admin/providers'),
      ]);

      setStats(statsRes.data?.data || {});
      setBookings(Array.isArray(bookingsRes.data?.data) ? bookingsRes.data.data : []);
      setProviders(Array.isArray(providersRes.data?.data) ? providersRes.data.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load fumigation oversight');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const operations = useMemo(() => {
    const activeStatuses = new Set(['confirmed', 'scheduled', 'in_progress']);
    return {
      pending: bookings.filter((booking) => booking.booking_status === 'pending').length,
      active: bookings.filter((booking) => activeStatuses.has(booking.booking_status)).length,
      completed: bookings.filter((booking) => booking.booking_status === 'completed').length,
      cancelled: bookings.filter((booking) => booking.booking_status === 'cancelled').length,
    };
  }, [bookings]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading national fumigation oversight...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-gradient-to-r from-emerald-700 to-teal-600 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">National oversight</p>
            <h1 className="mt-2 text-2xl font-bold">Fumigation & Cleaning Oversight</h1>
            <p className="mt-1 max-w-3xl text-sm text-emerald-50">
              Read-only platform health, booking outcomes, provider coverage, and revenue visibility.
              Operational booking changes remain with scoped fumigation administrators.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm disabled:opacity-60"
          >
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total bookings', value: stats.total_bookings || bookings.length, icon: FaCalendarAlt, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Revenue', value: formatCurrency(stats.total_revenue), icon: FaMoneyBillWave, tone: 'text-green-600 bg-green-50' },
          { label: 'Active providers', value: stats.active_providers || providers.length, icon: FaUsers, tone: 'text-purple-600 bg-purple-50' },
          { label: 'Completion rate', value: `${Number(stats.completion_rate) || 0}%`, icon: FaChartLine, tone: 'text-orange-600 bg-orange-50' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{metric.value}</p>
              </div>
              <div className={`rounded-lg p-3 ${metric.tone}`}><metric.icon /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Awaiting action', value: operations.pending, icon: FaExclamationTriangle, tone: 'bg-amber-50 text-amber-700' },
          { label: 'Active operations', value: operations.active, icon: FaChartLine, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Completed', value: operations.completed, icon: FaCheckCircle, tone: 'bg-green-50 text-green-700' },
          { label: 'Cancelled', value: operations.cancelled, icon: FaExclamationTriangle, tone: 'bg-red-50 text-red-700' },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl p-4 ${item.tone}`}>
            <item.icon />
            <p className="mt-2 text-xs font-medium">{item.label}</p>
            <p className="text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Recent national bookings</h2>
          <p className="text-xs text-slate-500">Visibility only—no provider assignment or status controls.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No bookings recorded.</td></tr>
              ) : bookings.slice(0, 15).map((booking) => (
                <tr key={booking.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-slate-900">{booking.booking_reference || `FC-${booking.id}`}</td>
                  <td className="px-5 py-3 text-slate-600">{booking.service_name || '—'}</td>
                  <td className="max-w-xs truncate px-5 py-3 text-slate-600" title={booking.property_address}>{booking.property_address || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(booking.booking_date)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(booking.booking_status)}`}>
                      {String(booking.booking_status || 'pending').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{formatCurrency(booking.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Provider coverage</h2>
          <p className="text-xs text-slate-500">Active provider quality and completed-job visibility.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {providers.length === 0 ? (
            <p className="text-sm text-slate-500">No active providers found.</p>
          ) : providers.slice(0, 12).map((provider) => (
            <div key={provider.id} className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">{provider.company_name || provider.full_name || `Provider ${provider.id}`}</p>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>Rating: {Number(provider.avg_rating || provider.rating || 0).toFixed(1)}</span>
                <span>Jobs: {provider.total_jobs_completed || 0}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default FumigationOversightPanel;
