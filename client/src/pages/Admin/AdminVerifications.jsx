import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import { FaCheckCircle, FaTimesCircle, FaIdCard } from 'react-icons/fa';

const AdminVerifications = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/verifications/pending');
      if (res.data?.success) {
        setUsers(res.data.data);
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
      if (res.data?.success) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectUser = async (userId) => {
    setProcessingId(userId);
    try {
      const res = await api.post(`/admin/verifications/${userId}/reject`);
      if (res.data?.success) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error('Rejection failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Identity Verifications</h1>
        <p className="text-gray-600">
          Review users who have completed email, phone, and document steps
        </p>
      </div>

      <div className="space-y-4">
        {users.map((u) => (
          <div key={u.id} className="card flex items-center justify-between">
            <div className="flex items-start space-x-4">
              <div className="text-3xl text-primary-600">
                <FaIdCard />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{u.full_name}</h3>
                <p className="text-sm text-gray-600">{u.email}</p>
                <p className="text-xs text-gray-500 mt-1">
                  NIN: {u.nin} · Role: {u.user_type}
                </p>

                {u.passport_photo_url && (
                  <a
                    href={u.passport_photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary-600 hover:underline inline-block mt-2"
                  >
                    View Passport Photo →
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
        ))}

        {users.length === 0 && (
          <div className="card text-center py-12 text-gray-500">
            No pending verifications
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminVerifications;
