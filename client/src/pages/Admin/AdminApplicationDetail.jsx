import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const AdminApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    loadApplication();
  }, [id]);

  const loadApplication = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/applications/${id}`);
      if (res.data?.success) setApp(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!window.confirm('Approve this application?')) return;
    setWorking(true);
    try {
      await api.post(`/admin/applications/${id}/approve`);
      loadApplication();
    } finally {
      setWorking(false);
    }
  };

  const reject = async () => {
    if (!window.confirm('Reject this application?')) return;
    setWorking(true);
    try {
      await api.post(`/admin/applications/${id}/reject`);
      loadApplication();
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Loader fullScreen />;
  if (!app) return <div className="card">Application not found</div>;

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-600 mb-4 hover:underline"
      >
        ← Back
      </button>

      <div className="card space-y-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">Application #{app.id}</h2>

          <div className="flex gap-2">
            {app.status === 'pending' && (
              <>
                <button
                  onClick={approve}
                  disabled={working}
                  className="btn btn-sm btn-primary"
                >
                  Approve
                </button>
                <button
                  onClick={reject}
                  disabled={working}
                  className="btn btn-sm btn-danger"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><strong>Tenant:</strong> {app.tenant_name}</div>
          <div><strong>Tenant Email:</strong> {app.tenant_email}</div>
          <div><strong>Property:</strong> {app.property_title}</div>
          <div><strong>Landlord:</strong> {app.landlord_name}</div>
          <div><strong>Status:</strong> {app.status}</div>
          <div><strong>Submitted:</strong> {new Date(app.created_at).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

export default AdminApplicationDetail;
