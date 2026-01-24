import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaFileAlt, FaSearch } from 'react-icons/fa';

const PAGE_SIZE = 20;

const AdminApplications = () => {
  const navigate = useNavigate();

  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
  });

  useEffect(() => {
    const delay = setTimeout(() => {
      loadApplications(1);
    }, 300);

    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadApplications(page);
  }, [page]);

  const loadApplications = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/applications', {
        params: {
          search,
          page: p,
          limit: PAGE_SIZE,
        },
      });

      if (res.data?.success) {
        setApps(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  if (loading && apps.length === 0) return <Loader fullScreen />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No applications'}
          </p>
        </div>

        <div className="relative">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, property, landlord..."
            className="input pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Tenant</th>
              <th className="py-3 px-4">Property</th>
              <th className="py-3 px-4">Landlord</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{a.tenant_name}</td>
                <td className="py-3 px-4 flex items-center">
                  <FaFileAlt className="mr-2 text-primary-600" />
                  {a.property_title}
                </td>
                <td className="py-3 px-4">{a.landlord_name || '—'}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      a.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : a.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => navigate(`/admin/applications/${a.id}`)}
                    className="text-primary-600 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}

            {apps.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500">
                  No applications found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

export default AdminApplications;
