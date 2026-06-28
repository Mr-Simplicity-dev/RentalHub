import React, { useCallback, useEffect, useState } from 'react';
import { FaCheckCircle, FaEye, FaSyncAlt, FaTimesCircle, FaGavel } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const statusBadge = (status) => {
  const map = {
    pending: 'bg-amber-100 text-amber-800',
    under_review: 'bg-blue-100 text-blue-800',
    upheld: 'bg-green-100 text-green-800',
    dismissed: 'bg-red-100 text-red-800',
  };
  return `rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`;
};

const AppealsTab = () => {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ status: 'pending', type: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionId, setActionId] = useState('');
  const limit = 20;

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (filter.status) params.status = filter.status;
      if (filter.type) params.appeal_type = filter.type;
      const res = await api.get('/admin/appeals', { params });
      setAppeals(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load appeals');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { loadAppeals(); }, [loadAppeals]);

  const openReview = (appeal) => {
    setSelected(appeal);
    setReviewNote('');
  };

  const handleReview = async (status) => {
    if (!reviewNote.trim()) {
      toast.error('Please provide a review note');
      return;
    }
    setActionId(status);
    try {
      await api.post(`/admin/appeals/${selected.id}/review`, { status, review_note: reviewNote.trim() });
      toast.success(`Appeal ${status}`);
      setSelected(null);
      setReviewNote('');
      await loadAppeals();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to review appeal');
    } finally {
      setActionId('');
    }
  };

  const handleMarkUnderReview = async (appeal) => {
    try {
      await api.patch(`/admin/appeals/${appeal.id}/status`, { status: 'under_review' });
      toast.success('Marked as under review');
      await loadAppeals();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Admin Appeals</h2>
          <p className="text-sm text-gray-500">Review appeals against property and verification rejections.</p>
        </div>
        <button onClick={loadAppeals} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <FaSyncAlt /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: 'Pending', value: 'pending' },
          { label: 'Under Review', value: 'under_review' },
          { label: 'Upheld', value: 'upheld' },
          { label: 'Dismissed', value: 'dismissed' },
          { label: 'All', value: '' },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => { setFilter((f) => ({ ...f, status: s.value })); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter.status === s.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {['', 'property', 'verification'].map((t) => (
            <button
              key={t}
              onClick={() => { setFilter((f) => ({ ...f, type: t })); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter.type === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t || 'All Types'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading appeals...</div>
      ) : appeals.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No appeals found.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {appeals.map((appeal) => (
            <div key={appeal.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <FaGavel size={10} /> Appeal #{appeal.id} · {appeal.appeal_type}
                    {appeal.property_id && <span>· Property #{appeal.property_id}</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {appeal.appellant_name || appeal.appellant_email || 'Anonymous'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{appeal.appeal_reason}</p>
                  {appeal.property_title && (
                    <p className="mt-0.5 text-xs text-gray-400">Property: {appeal.property_title}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={statusBadge(appeal.status)}>{appeal.status}</span>
                  <button
                    onClick={() => openReview(appeal)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <FaEye size={11} /> Review
                  </button>
                  {appeal.status === 'pending' && (
                    <button
                      onClick={() => handleMarkUnderReview(appeal)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Mark Under Review
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium ${
                    page === i + 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Review Appeal #{selected.id}
              </h3>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <FaTimesCircle size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Type:</span>{' '}
                <span className="text-gray-600 capitalize">{selected.appeal_type}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Appellant:</span>{' '}
                <span className="text-gray-600">{selected.appellant_name || selected.appellant_email}</span>
              </div>
              {selected.appeal_type === 'property' && (
                <>
                  <div>
                    <span className="font-medium text-gray-700">Property:</span>{' '}
                    <span className="text-gray-600">{selected.property_title || `#${selected.property_id}`}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Location:</span>{' '}
                    <span className="text-gray-600">{selected.property_state}{selected.lga_name ? ` / ${selected.lga_name}` : ''}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Type:</span>{' '}
                    <span className="text-gray-600">{selected.property_type} · {selected.bedrooms}bd · {selected.bathrooms}ba · ₦{Number(selected.rent_amount || 0).toLocaleString()}</span>
                  </div>
                </>
              )}
              <div>
                <span className="font-medium text-gray-700">Original Reason for Rejection:</span>
                <p className="mt-0.5 rounded-lg bg-red-50 p-2 text-gray-700">{selected.original_rejection_reason || 'Not provided'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Appeal Reason:</span>
                <p className="mt-0.5 rounded-lg bg-amber-50 p-2 text-gray-700">{selected.appeal_reason}</p>
              </div>
              {selected.additional_info && (
                <div>
                  <span className="font-medium text-gray-700">Additional Info:</span>
                  <p className="mt-0.5 rounded-lg bg-gray-50 p-2 text-gray-700">{selected.additional_info}</p>
                </div>
              )}
              {selected.original_admin_name && (
                <div>
                  <span className="font-medium text-gray-700">Original Decision By:</span>{' '}
                  <span className="text-gray-600">{selected.original_admin_name}</span>
                </div>
              )}
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">Review Note *</label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Explain your decision..."
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setSelected(null)}
                disabled={Boolean(actionId)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReview('dismissed')}
                disabled={Boolean(actionId) || !reviewNote.trim()}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <FaTimesCircle /> {actionId === 'dismissed' ? 'Processing...' : 'Dismiss'}
              </button>
              <button
                onClick={() => handleReview('upheld')}
                disabled={Boolean(actionId) || !reviewNote.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <FaCheckCircle /> {actionId === 'upheld' ? 'Processing...' : 'Uphold & Reinstate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AppealsTab;
