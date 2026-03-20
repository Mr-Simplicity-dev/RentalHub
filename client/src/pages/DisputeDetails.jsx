import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import DisputeQRCode from '../components/DisputeQRCode';

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

export default function DisputeDetails() {
  const { disputeId } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDispute = async () => {
      try {
        const res = await api.get(`/disputes/${disputeId}`);
        if (!cancelled) {
          setPayload(res.data?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load dispute');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDispute();

    return () => {
      cancelled = true;
    };
  }, [disputeId]);

  if (loading) return <div className="p-6">Loading dispute...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!payload?.dispute) return <div className="p-6">Dispute not found.</div>;

  const { dispute, messages = [], evidence = [], audit_logs = [], authorized_lawyers = [], timeline = [] } = payload;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-700">
                Dispute Traceability
              </p>
              <h1 className="mt-3 text-3xl font-bold text-gray-900">
                {dispute.title || `Dispute #${dispute.id}`}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
                {dispute.description}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Status:</span> {dispute.status}
              </div>
              <div className="mt-2">
                <span className="font-semibold text-gray-900">Opened:</span>{' '}
                {formatDateTime(dispute.created_at)}
              </div>
              <div className="mt-2">
                <span className="font-semibold text-gray-900">Sealed:</span>{' '}
                {dispute.is_legally_sealed ? 'Yes' : 'No'}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Opened By</p>
              <p className="mt-2 font-semibold text-gray-900">{dispute.opened_by_name || '-'}</p>
              <p className="text-sm text-gray-600">{dispute.opened_by_email || '-'}</p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Against</p>
              <p className="mt-2 font-semibold text-gray-900">{dispute.against_name || '-'}</p>
              <p className="text-sm text-gray-600">{dispute.against_email || '-'}</p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Property</p>
              <p className="mt-2 font-semibold text-gray-900">{dispute.property_title || '-'}</p>
              <p className="text-sm text-gray-600">
                {[dispute.area, dispute.city, dispute.state].filter(Boolean).join(', ') || '-'}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Audit Entries</p>
              <p className="mt-2 font-semibold text-gray-900">{audit_logs.length}</p>
              <p className="text-sm text-gray-600">Evidence items: {evidence.length}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">Dispute timeline</h2>
            {timeline.length === 0 ? (
              <p className="text-gray-500">No trace data yet.</p>
            ) : (
              <div className="space-y-4">
                {timeline.map((item, index) => (
                  <div key={`${item.type}-${item.happened_at}-${index}`} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{item.summary}</p>
                        <p className="text-sm text-gray-500">
                          {item.actor_name || 'System'}{item.actor_role ? ` • ${item.actor_role}` : ''}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">{formatDateTime(item.happened_at)}</p>
                    </div>
                    {item.details && (
                      <p className="mt-3 text-sm leading-7 text-gray-700">
                        {typeof item.details === 'string'
                          ? item.details
                          : JSON.stringify(item.details)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-gray-900">Assigned lawyers</h2>
              {authorized_lawyers.length === 0 ? (
                <p className="mt-4 text-gray-500">No lawyer assignment found for this dispute.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {authorized_lawyers.map((lawyer) => (
                    <div key={`${lawyer.id}-${lawyer.email}`} className="rounded-2xl border border-gray-200 p-4">
                      <p className="font-semibold text-gray-900">{lawyer.full_name || lawyer.email}</p>
                      <p className="text-sm text-gray-600">{lawyer.email}</p>
                      <p className="mt-2 text-sm text-gray-500">
                        Assigned by {lawyer.assigned_by_name || lawyer.client_name || 'Unknown'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-gray-900">Evidence verification</h2>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Use the QR code or the direct verification screen to validate the integrity of this dispute record.
              </p>
              <div className="mt-5">
                <DisputeQRCode disputeId={dispute.id} />
              </div>
              <Link
                to={`/verify-case?dispute=${dispute.id}`}
                className="mt-5 inline-flex rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white"
              >
                Verify dispute evidence
              </Link>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">Messages</h2>
            {messages.length === 0 ? (
              <p className="mt-4 text-gray-500">No messages recorded yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{message.sender_name || 'Unknown user'}</p>
                      <p className="text-sm text-gray-500">{formatDateTime(message.created_at)}</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-gray-700">{message.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">Legal audit logs</h2>
            {audit_logs.length === 0 ? (
              <p className="mt-4 text-gray-500">No audit log entries recorded for this dispute yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {audit_logs.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{entry.action}</p>
                      <p className="text-sm text-gray-500">
                        {formatDateTime(entry.created_at || entry.timestamp || entry.logged_at)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {entry.actor_name || 'System'}
                      {entry.actor_role ? ` • ${entry.actor_role}` : ''}
                    </p>
                    {entry.route && (
                      <p className="mt-2 text-xs text-gray-500">
                        {entry.method || 'ACTION'} {entry.route}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900">Evidence files</h2>
          {evidence.length === 0 ? (
            <p className="mt-4 text-gray-500">No evidence uploaded yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {evidence.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{item.file_name}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Uploaded by {item.uploaded_by_name || 'Unknown'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDateTime(item.created_at)}
                  </p>
                  <div className="mt-4 flex gap-3 text-sm">
                    <a
                      href={`/api/disputes/evidence/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-700 hover:underline"
                    >
                      Open file
                    </a>
                    <a
                      href={`/api/disputes/evidence/${item.id}/verify`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-700 hover:underline"
                    >
                      Verify hash
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
