import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { toast } from 'react-toastify';

const AdminUserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${id}`);
      if (res.data?.success) {
        setUser(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const disableUser = async () => {
    if (!window.confirm('Disable this user?')) return;

    setWorking(true);
    try {
      const res = await api.delete(`/admin/users/${id}`);
      toast.success(res.data?.message || 'User disabled successfully');
      navigate('/admin/users');
    } catch (err) {
      console.error('Failed to disable user:', err);
      toast.error(err.response?.data?.message || 'Failed to disable user');
    } finally {
      setWorking(false);
    }
  };

  const verifyUser = async () => {
    if (!['tenant', 'landlord'].includes(user?.user_type)) return;

    setWorking(true);
    try {
      const res = await api.patch(`/admin/users/${id}/verify`);
      toast.success(res.data?.message || 'User verified successfully');
      await loadUser();
    } catch (err) {
      console.error('Verification failed:', err);
      toast.error(err.response?.data?.message || 'Verification failed');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Loader fullScreen />;
  if (!user) return <div className="p-6">User not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-500 mb-6 hover:text-black"
      >
        ← Back to Users
      </button>

      <div className="bg-white shadow-lg rounded-xl p-6 border">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center border-b pb-4 mb-6 gap-3">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-gray-800">
              {user.full_name}
            </h2>
            <p className="text-gray-500 text-sm">{user.email}</p>
          </div>

          <div className="flex gap-3">
            {!user.identity_verified &&
              ['tenant', 'landlord'].includes(user.user_type) && (
                <button
                  onClick={verifyUser}
                  disabled={working}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Verify User
                </button>
              )}

            <button
              onClick={disableUser}
              disabled={working}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              Disable User
            </button>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <Info label="Phone" value={user.phone} />
          <Info label="Role" value={user.user_type} />
          <Info
            label="Joined"
            value={new Date(user.created_at).toLocaleString()}
          />
          <Status label="Email Verified" status={user.email_verified} />
          <Status label="Phone Verified" status={user.phone_verified} />
          <Status label="Identity Verified" status={user.identity_verified} />
        </div>
      </div>
    </div>
  );
};

/* ---------------- Reusable Components ---------------- */

const Info = ({ label, value }) => (
  <div className="bg-gray-50 p-4 rounded-lg border">
    <p className="text-gray-500 text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="mt-1 font-medium text-gray-800">
      {value || 'N/A'}
    </p>
  </div>
);

const Status = ({ label, status }) => (
  <div className="bg-gray-50 p-4 rounded-lg border">
    <p className="text-gray-500 text-xs uppercase tracking-wide">
      {label}
    </p>
    <p
      className={`mt-1 font-semibold ${
        status ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {status ? 'Yes' : 'No'}
    </p>
  </div>
);

export default AdminUserDetail;
