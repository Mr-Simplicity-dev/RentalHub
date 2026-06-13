import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaExclamationTriangle, FaSearch, FaTimes, FaCheckCircle, FaClock, FaLock, FaSpinner, FaBalanceScale } from 'react-icons/fa';
import Loader from '../components/common/Loader';

const STATUS_COLORS = {
  open: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  under_review: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  dismissed: 'bg-gray-100 text-gray-700 border-gray-200',
};

const PRIORITY_COLORS = {
  low: 'text-gray-500',
  normal: 'text-blue-600',
  high: 'text-orange-600',
  urgent: 'text-red-600',
};

const MyDisputes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });

  const fetchDisputes = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get('/api/disputes/me', { params });
      setDisputes(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error('Failed to load disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDisputes(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Disputes</h1>
            <p className="mt-2 text-sm text-gray-600">
              View and manage disputes you are involved in
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by dispute or property title..."
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-600"
            />
          </form>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-primary-600"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>

        {loading ? (
          <Loader />
        ) : disputes.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <FaBalanceScale className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">No disputes found</h3>
            <p className="mt-2 text-sm text-gray-600">
              {search || statusFilter
                ? 'Try adjusting your search or filter'
                : 'You have not been involved in any disputes yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute) => (
              <div
                key={dispute.id}
                onClick={() => navigate(`/dispute/${dispute.id}`)}
                className="cursor-pointer rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {dispute.title || `Dispute #${dispute.id}`}
                      </h3>
                      <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_COLORS[dispute.status] || 'bg-gray-100 text-gray-700'}`}>
                        {dispute.status?.replace(/_/g, ' ')}
                      </span>
                      {dispute.is_legally_sealed && (
                        <span className="rounded-full border border-purple-200 bg-purple-100 px-3 py-0.5 text-xs font-semibold text-purple-700">
                          <FaLock className="mr-1 inline-block" />
                          Sealed
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{dispute.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500">
                      <span>
                        <span className="font-medium text-gray-700">Property:</span> {dispute.property_title || '-'}
                      </span>
                      <span>
                        <span className="font-medium text-gray-700">Opened by:</span> {dispute.opened_by_name}
                      </span>
                      <span>
                        <span className="font-medium text-gray-700">Against:</span> {dispute.against_name}
                      </span>
                      <span>
                        <span className="font-medium text-gray-700">Priority:</span>{' '}
                        <span className={PRIORITY_COLORS[dispute.priority] || ''}>
                          {dispute.priority}
                        </span>
                      </span>
                      <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <FaBalanceScale className="mt-1 text-2xl text-primary-600 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchDisputes(pagination.page - 1)}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchDisputes(pagination.page + 1)}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDisputes;
