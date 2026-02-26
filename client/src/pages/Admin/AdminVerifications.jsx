import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaCheckCircle, FaTimesCircle, FaIdCard, FaSearch } from 'react-icons/fa';

const PAGE_SIZE = 20;

const AdminVerifications = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  useEffect(() => {
    const delay = setTimeout(() => {
      loadPending(1);
    }, 300);
    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadPending(page);
  }, [page]);

  const loadPending = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/verifications/pending', {
        params: { search, page: p, limit: PAGE_SIZE },
      });
      if (res.data?.success) {
        setUsers(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId) => {
    setProcessingId(userId);
    try {
      const res = await api.post(`/admin/verifications/${userId}/approve`);
      if (res.data?.success) loadPending(page);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectUser = async (userId) => {
    setProcessingId(userId);
    try {
      const res = await api.post(`/admin/verifications/${userId}/reject`);
      if (res.data?.success) loadPending(page);
    } finally {
      setProcessingId(null);
    }
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  if (loading && users.length === 0) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Identity Verifications</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No pending verifications'}
          </p>
        </div>

        <div className="relative">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, NIN, passport..."
            className="input pl-9"
          />
        </div>
      </div>

      <div className="space-y-4">
        {users.map((u) => {
          const docType = (u.identity_document_type || 'nin').toLowerCase();
          return (
            <div key={u.id} className="card flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="text-3xl text-primary-600">
                  <FaIdCard />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{u.full_name}</h3>
                  <p className="text-sm text-gray-600">{u.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    ID Type: {docType.toUpperCase()} | Role: {u.user_type}
                  </p>

                  {docType === 'passport' ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Passport No: {u.international_passport_number || 'N/A'} | Nationality:{' '}
                      {u.nationality || 'N/A'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      NIN: {u.nin || 'N/A'}
                    </p>
                  )}

                  {u.passport_photo_url && (
                    <a
                      href={u.passport_photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary-600 hover:underline inline-block mt-2"
                    >
                      View Passport Photo ->
                    </a>
                  )}
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => approveUser(u.id)}
                  disabled={processingId === u.id}
                  className="btn btn-primary flex items-center"
                >
                  <FaCheckCircle className="mr-2" />
                  Approve
                </button>

                <button
                  onClick={() => rejectUser(u.id)}
                  disabled={processingId === u.id}
                  className="btn btn-secondary flex items-center text-red-600 border-red-200 hover:bg-red-50"
                >
                  <FaTimesCircle className="mr-2" />
                  Reject
                </button>
              </div>
            </div>
          );
        })}

        {users.length === 0 && !loading && (
          <div className="card text-center py-12 text-gray-500">
            No pending verifications
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-between items-center mt-6">
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

export default AdminVerifications;
