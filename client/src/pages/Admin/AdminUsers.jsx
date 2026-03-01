import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaSearch } from 'react-icons/fa';

const PAGE_SIZE = 20;

const AdminUsers = () => {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [debouncedStateSearch, setDebouncedStateSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
  });

  const loadUsers = useCallback(async (p = 1, query = '', roleFilter = 'all', stateQuery = '') => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users', {
        params: {
          search: query,
          state: stateQuery,
          role: roleFilter,
          page: p,
          limit: PAGE_SIZE,
        },
      });

      if (res.data?.success) {
        setUsers(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
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
    const delay = setTimeout(() => {
      setDebouncedStateSearch(stateSearch);
    }, 300);

    return () => clearTimeout(delay);
  }, [stateSearch]);

  useEffect(() => {
    loadUsers(page, debouncedSearch, role, debouncedStateSearch);
  }, [page, debouncedSearch, role, debouncedStateSearch, loadUsers]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  if (loading && users.length === 0) return <Loader fullScreen />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No users'}
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative">
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
            <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone..."
            className="input pl-9"
          />
          </div>

          <input
            value={stateSearch}
            onChange={(e) => {
              setStateSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by state..."
            className="input"
          />

          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="all">All</option>
            <option value="tenant">Tenants</option>
            <option value="landlord">Landlords</option>
            <option value="admin">Admins</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Phone</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Verified</th>
              <th className="py-3 px-4">Joined</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{u.full_name}</td>
                <td className="py-3 px-4">{u.email}</td>
                <td className="py-3 px-4">{u.phone}</td>
                <td className="py-3 px-4">{u.state || '—'}</td>
                <td className="py-3 px-4 capitalize">{u.user_type}</td>
                <td className="py-3 px-4">
                  {u.identity_verified ? 'Yes' : 'No'}
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="text-primary-600 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}

            {users.length === 0 && !loading && (
              <tr>
                <td colSpan="8" className="py-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
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

export default AdminUsers;
