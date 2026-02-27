import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaHome, FaSearch } from 'react-icons/fa';

const PAGE_SIZE = 20;

const AdminProperties = () => {
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
  });

  const loadProperties = useCallback(async (p = 1, query = '') => {
    setLoading(true);
    try {
      const res = await api.get('/admin/properties', {
        params: {
          search: query,
          page: p,
          limit: PAGE_SIZE,
        },
      });

      if (res.data?.success) {
        setProperties(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load properties:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadProperties(page, debouncedSearch);
  }, [page, debouncedSearch, loadProperties]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  if (loading && properties.length === 0) return <Loader fullScreen />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Properties</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No properties'}
          </p>
        </div>

        <div className="relative">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, landlord, city..."
            className="input pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Owner</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Rent</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Created</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium flex items-center">
                  <FaHome className="mr-2 text-primary-600" />
                  {p.title}
                </td>
                <td className="py-3 px-4">{p.landlord_name || '—'}</td>
                <td className="py-3 px-4">
                  {p.city || '—'}{p.state ? `, ${p.state}` : ''}
                </td>
                <td className="py-3 px-4">
                  ₦{Number(p.rent_amount || 0).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      p.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => navigate(`/admin/properties/${p.id}`)}
                    className="text-primary-600 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}

            {properties.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="py-8 text-center text-gray-500">
                  No properties found
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

export default AdminProperties;
