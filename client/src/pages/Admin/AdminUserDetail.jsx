import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

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
      if (res.data?.success) setUser(res.data.data);
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
      await api.delete(`/admin/users/${id}`);
      navigate('/admin/users');
    } finally {
      setWorking(false);
    }
  };

  const verifyUser = async () => {
    setWorking(true);
    try {
      await api.post(`/admin/verifications/${id}/approve`);
      loadUser();
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Loader fullScreen />;
  if (!user) return <div className="card">User not found</div>;

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-600 mb-4 hover:underline">
        ← Back
      </button>

      <div className="card space-y-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">{user.full_name}</h2>

          <div className="flex gap-2">
            {!user.identity_verified && (
              <button
                onClick={verifyUser}
                disabled={working}
                className="btn btn-sm btn-primary"
              >
                Verify
              </button>
            )}

            <button
              onClick={disableUser}
              disabled={working}
              className="btn btn-sm btn-danger"
            >
              Disable
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><strong>Email:</strong> {user.email}</div>
          <div><strong>Phone:</strong> {user.phone}</div>
          <div><strong>Role:</strong> {user.user_type}</div>
          <div><strong>Joined:</strong> {new Date(user.created_at).toLocaleString()}</div>
          <div><strong>Email Verified:</strong> {user.email_verified ? 'Yes' : 'No'}</div>
          <div><strong>Phone Verified:</strong> {user.phone_verified ? 'Yes' : 'No'}</div>
          <div><strong>Identity Verified:</strong> {user.identity_verified ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetail;
