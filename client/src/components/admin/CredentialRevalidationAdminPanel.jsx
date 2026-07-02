import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

const fieldLabels = {
  nin: 'NIN',
  international_passport: 'International passport',
  live_photo: 'New live passport photo',
};

const CredentialRevalidationAdminPanel = ({ onReviewed }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/super/credential-revalidations');
      setRequests(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load credential revalidation requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const submitReview = async (decision) => {
    if (!reviewing) return;
    if (decision === 'rejected' && reviewNote.trim().length < 5) {
      toast.error('Add a clear reason before returning credentials');
      return;
    }
    setReviewSubmitting(true);
    try {
      await api.patch(`/super/credential-revalidations/${reviewing.id}/review`, {
        decision,
        review_note: reviewNote.trim(),
      });
      toast.success(decision === 'approved' ? 'Credentials approved' : 'Credentials returned for correction');
      setReviewing(null);
      setReviewNote('');
      await loadRequests();
      onReviewed?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to review credentials');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const viewLivePhoto = async (rawUrl) => {
    const filename = String(rawUrl || '').replace(/\\/g, '/').split('/').pop();
    if (!filename) return;
    const preview = window.open('', '_blank', 'noopener,noreferrer');
    try {
      const response = await api.get(`/users/passport-photo/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      if (preview) preview.location = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (preview) preview.close();
      toast.error(error.response?.data?.message || 'Failed to open live photo');
    }
  };

  const submitted = requests.filter((request) => request.status === 'submitted');
  const active = requests.filter((request) => ['requested', 'rejected'].includes(request.status));

  return (
    <section className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-indigo-950">Credential Revalidation Queue</h2>
          <p className="text-sm text-indigo-700">
            {submitted.length} submitted for review · {active.length} awaiting user action
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={loadRequests} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Queue'}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {loading && requests.length === 0 ? (
          <p className="rounded-lg bg-white p-5 text-center text-sm text-gray-500">Loading revalidation queue...</p>
        ) : requests.length === 0 ? (
          <p className="rounded-lg bg-white p-5 text-center text-sm text-gray-500">No credential revalidation requests.</p>
        ) : requests.slice(0, 20).map((request) => (
          <div key={request.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{request.full_name} <span className="font-normal text-gray-500">({request.email})</span></p>
                <p className="mt-1 text-sm text-gray-600">{request.reason}</p>
                {request.instructions && (
                  <p className="mt-1 text-xs text-gray-500">Instructions: {request.instructions}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Requested by {request.requested_by_name || 'Super Admin'}
                  {request.due_at ? ` · due ${new Date(request.due_at).toLocaleDateString()}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(request.requested_fields || []).map((field) => (
                    <span key={field} className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                      {fieldLabels[field] || field}
                    </span>
                  ))}
                </div>
                {request.submitted_summary && Object.keys(request.submitted_summary).length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Submitted: {Object.entries(request.submitted_summary).map(([key, value]) => `${fieldLabels[key] || key}: ${value}`).join(' · ')}
                  </p>
                )}
                {request.verification_metadata?.provider && (
                  <p className="mt-2 text-xs font-semibold text-green-700">
                    Provider verification: {request.verification_metadata.provider} · {request.verification_metadata.status}
                  </p>
                )}
                {request.review_note && request.status !== 'submitted' && (
                  <p className="mt-2 text-xs text-gray-600">
                    Review note: {request.review_note}
                  </p>
                )}
                {(request.requested_fields || []).includes('live_photo') &&
                  request.submitted_at &&
                  request.passport_photo_url && (
                  <button
                    type="button"
                    onClick={() => viewLivePhoto(request.passport_photo_url)}
                    className="mt-2 inline-block text-xs font-semibold text-indigo-700 hover:underline"
                  >
                    View submitted live photo
                  </button>
                )}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                request.status === 'submitted'
                  ? 'bg-blue-100 text-blue-700'
                  : request.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : request.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
              }`}>
                {request.status}
              </span>
            </div>
            {request.status === 'submitted' && (
              <button
                type="button"
                onClick={() => {
                  setReviewing(request);
                  setReviewNote('');
                }}
                className="btn btn-primary mt-3"
              >
                Review Submission
              </button>
            )}
          </div>
        ))}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Review Credential Revalidation</h3>
              <p className="text-sm text-gray-500">{reviewing.full_name} · {reviewing.email}</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                {Object.entries(reviewing.submitted_summary || {}).map(([key, value]) => (
                  <p key={key}><strong>{fieldLabels[key] || key}:</strong> {value}</p>
                ))}
              </div>
              {(reviewing.requested_fields || []).includes('live_photo') && reviewing.passport_photo_url && (
                <button
                  type="button"
                  onClick={() => viewLivePhoto(reviewing.passport_photo_url)}
                  className="btn btn-secondary"
                >
                  Open Submitted Live Photo
                </button>
              )}
              <label className="block text-sm font-medium text-gray-700">
                Review note
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  className="input mt-1 min-h-[100px]"
                  placeholder="Required when returning credentials for correction"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
              <button type="button" className="btn btn-secondary" onClick={() => setReviewing(null)} disabled={reviewSubmitting}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => submitReview('rejected')} disabled={reviewSubmitting}>
                {reviewSubmitting ? 'Saving...' : 'Return for Correction'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => submitReview('approved')} disabled={reviewSubmitting}>
                {reviewSubmitting ? 'Saving...' : 'Approve Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default CredentialRevalidationAdminPanel;
