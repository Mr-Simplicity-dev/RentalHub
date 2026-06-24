import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import DisputeQRCode from '../components/DisputeQRCode';

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getEvidenceStatusBadge = (status) => {
  if (status === 'verified') return 'bg-emerald-100 text-emerald-700';
  if (status === 'flagged') return 'bg-orange-100 text-orange-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

export default function DisputeDetails() {
  const { disputeId } = useParams();
  const { user } = useAuth();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0] || null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      await api.post(`/disputes/${disputeId}/evidence`, formData);
      toast.success('Evidence uploaded');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const res = await api.get(`/disputes/${disputeId}`);
      setPayload(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      await api.post(`/disputes/${disputeId}/messages`, { message: newMessage.trim() });
      setNewMessage('');
      const res = await api.get(`/disputes/${disputeId}`);
      setPayload(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const startEditing = (msg) => {
    setEditingMessageId(msg.id);
    setEditMessageText(msg.message);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditMessageText('');
  };

  const handleSaveEdit = async (messageId) => {
    if (!editMessageText.trim()) return;
    setSavingEdit(true);
    try {
      await api.patch(`/disputes/${disputeId}/messages/${messageId}`, { message: editMessageText.trim() });
      setEditingMessageId(null);
      setEditMessageText('');
      const res = await api.get(`/disputes/${disputeId}`);
      setPayload(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to edit message');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) return <div className="p-6">Loading dispute...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!payload?.dispute) return <div className="p-6">Dispute not found.</div>;

  const {
    dispute,
    messages = [],
    evidence = [],
    case_notes = [],
    audit_logs = [],
    authorized_lawyers = [],
    timeline = [],
  } = payload;

  return (
    <div className="min-h-screen bg-gray-50">
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
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">{dispute.description}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Status:</span> {dispute.status}
              </div>
              <div className="mt-2">
                <span className="font-semibold text-gray-900">Opened:</span> {formatDateTime(dispute.created_at)}
              </div>
              <div className="mt-2">
                <span className="font-semibold text-gray-900">Sealed:</span> {dispute.is_legally_sealed ? 'Yes' : 'No'}
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
                        {typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}
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
              <h2 className="text-2xl font-semibold text-gray-900">Lawyer Work Progress</h2>
              {dispute.lawyer_summary ? (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-900">Lawyer Summary</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-blue-900">{dispute.lawyer_summary}</p>
                  <p className="mt-2 text-xs text-blue-700">
                    Updated by {dispute.lawyer_summary_by_name || 'lawyer'} on {formatDateTime(dispute.lawyer_summary_at)}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">No lawyer summary yet.</p>
              )}

              <div className="mt-5">
                <h3 className="text-base font-semibold text-gray-900">Client-visible lawyer notes</h3>
                {case_notes.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No client-visible notes yet.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {case_notes.map((note) => (
                      <div key={note.id} className="rounded-xl border border-gray-200 p-3">
                        <p className="font-semibold text-gray-900">{note.title || 'Lawyer note'}</p>
                        <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{note.content}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          {note.lawyer_name || 'Lawyer'} • {formatDateTime(note.updated_at || note.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-gray-900">Evidence verification</h2>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Use the QR code or direct verification screen to validate dispute integrity.
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
            {!dispute.is_legally_sealed && (
              <form onSubmit={handleSendMessage} className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-primary-600"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !newMessage.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {sendingMsg ? 'Sending...' : 'Send'}
                </button>
              </form>
            )}
            {messages.length === 0 ? (
              <p className="mt-4 text-gray-500">No messages recorded yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{message.sender_name || 'Unknown user'}</p>
                      <div className="flex items-center gap-3">
                        {(message.edit_count > 0) && (
                          <span className="text-xs text-gray-400 italic">edited ({message.edit_count}/2)</span>
                        )}
                        <p className="text-sm text-gray-500">{formatDateTime(message.created_at)}</p>
                      </div>
                    </div>
                    {editingMessageId === message.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={editMessageText}
                          onChange={(e) => setEditMessageText(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-primary-600"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(message.id)}
                            disabled={savingEdit || !editMessageText.trim()}
                            className="rounded-full bg-primary-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {savingEdit ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-gray-700 whitespace-pre-wrap">{message.message}</p>
                    )}
                    {user?.id === message.sender_id && editingMessageId !== message.id && !dispute.is_legally_sealed && (message.edit_count || 0) < 2 && (
                      <button
                        onClick={() => startEditing(message)}
                        className="mt-2 text-xs text-primary-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
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
                    {entry.route ? (
                      <p className="mt-2 text-xs text-gray-500">{entry.method || 'ACTION'} {entry.route}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-gray-900">Evidence files</h2>
            {!dispute.is_legally_sealed && (
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.avi,.zip,.doc,.docx"
                  onChange={handleFileSelect}
                  className="max-w-48 text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                />
                {selectedFile && (
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                )}
              </div>
            )}
          </div>
          {evidence.length === 0 ? (
            <p className="mt-4 text-gray-500">No evidence uploaded yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {evidence.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">{item.file_name}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getEvidenceStatusBadge(item.verification_status)}`}>
                      {item.verification_status || 'pending'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">Uploaded by {item.uploaded_by_name || 'Unknown'}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(item.created_at || item.uploaded_at)}</p>
                  {item.verified_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Verified by {item.verified_by_name || 'Lawyer'} on {formatDateTime(item.verified_at)}
                    </p>
                  ) : null}
                  {item.lawyer_notes ? (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs leading-6 text-gray-700">
                      {item.lawyer_notes}
                    </p>
                  ) : null}
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
