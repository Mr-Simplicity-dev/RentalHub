import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaSearch, FaShieldAlt, FaCheckCircle, FaTimesCircle, FaClock } from 'react-icons/fa';

const PAGE_SIZE = 20;

const AdminEvidenceVerifications = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const loadLogs = useCallback(async (p = 1, query = '') => {
    setLoading(true);
    try {
      const res = await api.get('/admin/evidence-verifications', {
        params: { search: query, page: p, limit: PAGE_SIZE },
      });
      if (res.data?.success) {
        setLogs(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load evidence verifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadLogs(page, debouncedSearch);
  }, [page, debouncedSearch, loadLogs]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  const statusIcon = (status) => {
    if (status === 'completed') return <FaCheckCircle className="text-green-500" />;
    if (status === 'pending') return <FaClock className="text-yellow-500" />;
    return <FaTimesCircle className="text-red-500" />;
  };

  if (loading && logs.length === 0) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Evidence Verifications</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No verification records'}
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search dispute, email, reference..."
            className="input pl-9"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="px-4 py-3">Dispute</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FaShieldAlt className="shrink-0 text-primary-600" />
                    <span className="font-medium">{log.dispute_title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {log.opened_by_name} vs {log.against_name}
                    <span className="ml-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {log.dispute_status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{log.payer_name || '—'}</div>
                  <div className="text-xs text-gray-500">{log.payer_email}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {log.transaction_reference}
                </td>
                <td className="px-4 py-3">₦{Number(log.amount).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(log.payment_status)}
                    <span className={`text-xs font-semibold ${
                      log.payment_status === 'completed' ? 'text-green-700' :
                      log.payment_status === 'pending' ? 'text-yellow-700' :
                      'text-red-700'
                    }`}>
                      {log.payment_status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  <div>{new Date(log.created_at).toLocaleDateString()}</div>
                  {log.completed_at && (
                    <div className="text-xs text-gray-400">
                      completed: {new Date(log.completed_at).toLocaleDateString()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500">
                  No evidence verification records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn btn-sm"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {pagination.pages}
          </span>
          <button
            disabled={page === pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminEvidenceVerifications;
