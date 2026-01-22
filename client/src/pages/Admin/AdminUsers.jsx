import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaUserShield, FaUserTie, FaUser } from 'react-icons/fa';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      if (res.data?.success) {
        setUsers(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (id) => {
    if (!window.confirm('Disable this user? They will no longer access the system.')) return;

    try {
      await api.delete(`/admin/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.error('Failed to disable user:', err);
      alert('Failed to disable user');
    }
  };

  const filteredUsers =
    filter === 'all'
      ? users
      : users.filter((u) => u.user_type === filter);

  if (loading) return <Loader fullScreen />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Manage all platform users</p>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input max-w-xs"
        >
          <option value="all">All Users</option>
          <option value="tenant">Tenants</option>
          <option value="landlord">Landlords</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Phone</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Phone</th>
              <th className="py-3 px-4">Identity</th>
              <th className="py-3 px-4">Joined</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{u.full_name}</td>
                <td className="py-3 px-4">{u.email}</td>
                <td className="py-3 px-4">{u.phone}</td>
                <td className="py-3 px-4">
                  <RoleBadge role={u.user_type} />
                </td>
                <td className="py-3 px-4">
                  <StatusBadge ok={u.email_verified} />
                </td>
                <td className="py-3 px-4">
                  <StatusBadge ok={u.phone_verified} />
                </td>
                <td className="py-3 px-4">
                  <StatusBadge ok={u.identity_verified} />
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleDisable(u.id)}
                    className="text-red-600 hover:underline"
                  >
                    Disable
                  </button>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="9" className="py-6 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RoleBadge = ({ role }) => {
  const map = {
    admin: {
      label: 'Admin',
      class: 'bg-purple-100 text-purple-700',
      icon: <FaUserShield className="mr-1" />,
    },
    landlord: {
      label: 'Landlord',
      class: 'bg-blue-100 text-blue-700',
      icon: <FaUserTie className="mr-1" />,
    },
    tenant: {
      label: 'Tenant',
      class: 'bg-green-100 text-green-700',
      icon: <FaUser className="mr-1" />,
    },
  };

  const cfg = map[role] || map.tenant;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${cfg.class}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

const StatusBadge = ({ ok }) => (
  <span
    className={`px-2 py-1 rounded-full text-xs font-semibold ${
      ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}
  >
    {ok ? 'Yes' : 'No'}
  </span>
);

export default AdminUsers;
