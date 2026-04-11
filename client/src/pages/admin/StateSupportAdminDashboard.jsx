import React, { useEffect, useMemo, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaCheckCircle, FaSyncAlt, FaTimesCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

const badgeClass = (status) => {
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const StateSupportAdminDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('all');
  const [queue, setQueue] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/state-migrations/support/queue?stage=${stage}&status=pending`);
      setQueue(res.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load migration queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const stats = useMemo(() => {
    let outgoingPending = 0;
    let incomingPending = 0;

    queue.forEach((row) => {
      if (row.can_review_outgoing) outgoingPending += 1;
      if (row.can_review_incoming) incomingPending += 1;
    });

    return {
      total: queue.length,
      outgoingPending,
      incomingPending,
    };
  }, [queue]);

  const reviewRequest = async (requestId, direction, decision) => {
    const note = window.prompt(
      `${decision === 'approved' ? 'Approve' : 'Reject'} ${direction} migration review note (optional):`,
      ''
    );

    try {
      setActionLoadingId(requestId);
      await api.patch(`/state-migrations/${requestId}/support-review`, {
        direction,
        decision,
        review_note: note || undefined,
      });
      toast.success(`Request ${decision} (${direction})`);
      await loadQueue();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to review request');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">State Support Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Outgoing and incoming migration decisions for {user?.assigned_state || 'your assigned state'}.
            </p>
          </div>
          <button
            type="button"
            onClick={loadQueue}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FaSyncAlt /> Refresh
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-white p-5 shadow">
          <p className="text-xs uppercase tracking-wide text-gray-500">Visible Requests</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{stats.total}</p>
        </article>
        <article className="rounded-xl bg-white p-5 shadow">
          <p className="text-xs uppercase tracking-wide text-gray-500">Outgoing Pending</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{stats.outgoingPending}</p>
        </article>
        <article className="rounded-xl bg-white p-5 shadow">
          <p className="text-xs uppercase tracking-wide text-gray-500">Incoming Pending</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{stats.incomingPending}</p>
        </article>
      </section>

      <section className="rounded-xl bg-white p-5 shadow">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${stage === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setStage('all')}
          >
            All Queue
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${stage === 'outgoing' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setStage('outgoing')}
          >
            <span className="inline-flex items-center gap-2"><FaArrowUp /> Outgoing</span>
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${stage === 'incoming' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setStage('incoming')}
          >
            <span className="inline-flex items-center gap-2"><FaArrowDown /> Incoming</span>
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading migration queue...</div>
        ) : (
          <div className="space-y-3">
            {queue.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                No migration requests in this queue.
              </div>
            )}

            {queue.map((row) => (
              <article key={row.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{row.user_name} ({row.user_type})</h3>
                    <p className="text-sm text-gray-600">{row.from_state} to {row.to_state}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(row.status)}`}>Final: {row.status}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(row.outgoing_status)}`}>Outgoing: {row.outgoing_status}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(row.incoming_status)}`}>Incoming: {row.incoming_status}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {row.can_review_outgoing && (
                    <>
                      <button
                        type="button"
                        disabled={actionLoadingId === row.id}
                        onClick={() => reviewRequest(row.id, 'outgoing', 'approved')}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        <FaCheckCircle /> Approve Outgoing
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === row.id}
                        onClick={() => reviewRequest(row.id, 'outgoing', 'rejected')}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        <FaTimesCircle /> Reject Outgoing
                      </button>
                    </>
                  )}

                  {row.can_review_incoming && (
                    <>
                      <button
                        type="button"
                        disabled={actionLoadingId === row.id}
                        onClick={() => reviewRequest(row.id, 'incoming', 'approved')}
                        className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
                      >
                        <FaCheckCircle /> Approve Incoming
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === row.id}
                        onClick={() => reviewRequest(row.id, 'incoming', 'rejected')}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-600 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <FaTimesCircle /> Reject Incoming
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default StateSupportAdminDashboard;
