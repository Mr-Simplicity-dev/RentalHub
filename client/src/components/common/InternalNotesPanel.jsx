import { useEffect, useState, useRef, useCallback } from 'react';
import { FaTrash, FaCommentDots, FaEdit, FaCheck, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';

const InternalNotesPanel = ({ ticketId, currentUser, readOnly }) => {
  const { socket } = useSocket();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/support/tickets/${ticketId}/internal-notes`);
      setNotes(res.data?.data || []);
    } catch {
      toast.error('Failed to load internal notes');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (ticketId) loadNotes();
  }, [ticketId, loadNotes]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data.ticketId === ticketId) loadNotes();
    };
    socket.on('ticket:internal_note', handler);
    return () => socket.off('ticket:internal_note', handler);
  }, [socket, ticketId, loadNotes]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [notes]);

  const handleSend = async () => {
    const msg = message.trim();
    if (!msg) return;
    setSending(true);
    try {
      const res = await api.post(`/support/tickets/${ticketId}/internal-notes`, { message: msg });
      setNotes((prev) => [...prev, res.data.data]);
      setMessage('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (noteId) => {
    if (!editText.trim()) return;
    try {
      const res = await api.patch(`/support/tickets/${ticketId}/internal-notes/${noteId}`, { message: editText.trim() });
      setNotes((prev) => prev.map((n) => n.id === noteId ? res.data.data : n));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to edit');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await api.delete(`/support/tickets/${ticketId}/internal-notes/${deleteTarget.id}`);
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-1 py-2 max-h-60">
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">No internal notes yet.</div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <FaCommentDots size={10} className="text-amber-500" />
                  <span className="font-medium text-amber-700">{note.author_name}</span>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">{note.author_role?.replace(/_/g, ' ')}</span>
                  <span>&middot; {new Date(note.created_at).toLocaleString()}</span>
                </div>
                {note.user_id === currentUser?.id && (
                  <div className="flex items-center gap-1">
                    {editingId !== note.id && (
                      <button onClick={() => { setEditingId(note.id); setEditText(note.message); }} className="text-slate-400 hover:text-slate-600"><FaEdit size={10} /></button>
                    )}
                    <button onClick={() => setDeleteTarget(note)} className="text-slate-400 hover:text-red-500"><FaTrash size={10} /></button>
                  </div>
                )}
              </div>
              {editingId === note.id ? (
                <div className="mt-2 flex items-end gap-2">
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="flex-1 resize-none rounded-lg border border-amber-300 p-2 text-sm outline-none focus:border-amber-400" />
                  <button onClick={() => handleEdit(note.id)} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700"><FaCheck size={10} /></button>
                  <button onClick={() => { setEditingId(null); setEditText(''); }} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-slate-300 text-slate-700 hover:bg-slate-400"><FaTimes size={10} /></button>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.message}</p>
              )}
            </div>
          ))
        )}
      </div>

      {!readOnly && (
        <div className="mt-3 flex items-end gap-2 border-t border-slate-200 pt-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Internal note (admins only)..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {sending ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaCommentDots size={12} />}
        </button>
      </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete Internal Note</h3>
            <p className="mt-2 text-sm text-slate-600">
              This removes your internal admin note from the ticket thread.
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-amber-900">
                {deleteTarget.message}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep Note
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalNotesPanel;
