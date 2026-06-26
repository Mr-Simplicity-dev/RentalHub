import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const AdminApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState({
    open: false,
    action: '',
    note: '',
    error: '',
  });

  const loadApplication = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/applications/${id}`);
      if (res.data?.success) setApp(res.data.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  const openDecisionDialog = (action) => {
    setDecisionDialog({
      open: true,
      action,
      note: '',
      error: '',
    });
  };

  const closeDecisionDialog = () => {
    setDecisionDialog({
      open: false,
      action: '',
      note: '',
      error: '',
    });
  };

  const submitDecision = async () => {
    const note = decisionDialog.note.trim();
    if (!note) {
      setDecisionDialog((prev) => ({ ...prev, error: 'A decision note is required' }));
      return;
    }

    setWorking(true);
    try {
      await api.post(`/admin/applications/${id}/${decisionDialog.action}`, { note });
      closeDecisionDialog();
      await loadApplication();
    } catch (err) {
      setDecisionDialog((prev) => ({
        ...prev,
        error: err.response?.data?.message || 'Failed to submit decision',
      }));
    } finally {
      setWorking(false);
    }
  };

  const formatOperationLabel = (eventType) =>
    String(eventType || 'updated').replace(/^application_/, '').replace(/_/g, ' ');

  if (loading) return <Loader fullScreen />;
  if (!app) return <div className="card">Application not found</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-600 mb-4 hover:underline"
      >
        ← Back
      </button>

      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <h2 className="text-xl font-bold text-center md:text-left">Application #{app.id}</h2>

          <div className="flex gap-2">
            {app.status === 'pending' && (
              <>
                <button
                  onClick={() => openDecisionDialog('approve')}
                  disabled={working}
                  className="btn btn-sm btn-primary"
                >
                  Approve
                </button>
                <button
                  onClick={() => openDecisionDialog('reject')}
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

      <div className="card mt-6">
        <h3 className="mb-4 text-lg font-semibold text-center">Governance History</h3>
        {Array.isArray(app.operations) && app.operations.length > 0 ? (
          <div className="space-y-3">
            {app.operations.map((operation) => (
              <div key={operation.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold capitalize text-gray-800">
                    {formatOperationLabel(operation.event_type)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(operation.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-gray-600">{operation.note || 'No note recorded'}</p>
                <p className="mt-1 text-xs text-gray-500">By {operation.actor_name || 'Admin'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-500">No application governance actions recorded yet.</p>
        )}
      </div>

      {decisionDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl2 bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                Application governance
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">
                {decisionDialog.action === 'approve' ? 'Approve Application' : 'Reject Application'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                This decision will be recorded against application #{app.id}.
              </p>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Decision note
              <textarea
                value={decisionDialog.note}
                onChange={(event) =>
                  setDecisionDialog((prev) => ({
                    ...prev,
                    note: event.target.value,
                    error: '',
                  }))
                }
                className="input mt-1 min-h-[120px]"
                placeholder="Explain this application decision"
              />
            </label>

            {decisionDialog.error && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {decisionDialog.error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDecisionDialog}
                disabled={working}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecision}
                disabled={working}
                className={decisionDialog.action === 'reject' ? 'btn btn-danger' : 'btn btn-primary'}
              >
                {working ? 'Saving...' : decisionDialog.action === 'reject' ? 'Reject Application' : 'Approve Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApplicationDetail;
