import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaArrowUp, FaCheckCircle, FaTimesCircle, FaPaperPlane, FaUser, FaShieldAlt, FaPaperclip, FaFile, FaEdit, FaTrash, FaCheck, FaTimes, FaCommentDots, FaUserCheck } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import InternalNotesPanel from './InternalNotesPanel';
import SupportTicketServicePanel from '../admin/SupportTicketServicePanel';
import SupportReplyActionModal from './SupportReplyActionModal';

const THEMES = {
  amber: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800', button: 'bg-amber-600 hover:bg-amber-700', focus: 'focus:border-amber-400 focus:ring-amber-400', tab: 'border-amber-500 text-amber-700' },
  indigo: { border: 'border-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700', badge: 'bg-indigo-200 text-indigo-700', button: 'bg-indigo-600 hover:bg-indigo-700', focus: 'focus:border-indigo-400 focus:ring-indigo-400', tab: 'border-indigo-500 text-indigo-700' },
};

const TicketConversationModal = ({
  ticket,
  user,
  socket,
  onClose,
  onTicketUpdated,
  onAssign,
  onEscalate,
  onResolve,
  accentColor = 'amber',
  adminLabel = 'Support',
}) => {
  const c = THEMES[accentColor] || THEMES.amber;
  const [conversation, setConversation] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimer = useRef(null);
  const [chatTab, setChatTab] = useState('user');
  const [unreadInternalNotes, setUnreadInternalNotes] = useState(0);
  const [replyAction, setReplyAction] = useState({ open: false, action: '', reply: null });

  const fetchUnreadInternalNotes = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets/internal-notes/unread-count');
      setUnreadInternalNotes(res.data?.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchUnreadInternalNotes(); }, [fetchUnreadInternalNotes]);

  const loadConversation = useCallback(async (ticketId) => {
    setLoadingConversation(true);
    try {
      const res = await api.get(`/support/tickets/${ticketId}/conversation?limit=200`);
      setConversation(res.data?.data || []);
    } catch {
      toast.error('Failed to load conversation');
      setConversation([]);
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  useEffect(() => {
    if (ticket?.id) {
      setChatTab('user');
      loadConversation(ticket.id);
    }
  }, [ticket?.id, loadConversation]);

  useEffect(() => {
    if (!socket) return;
    const replyHandler = (data) => {
      if (ticket?.id === data.ticketId) {
        if (data.reply) {
          setConversation((prev) => {
            if (prev.some((r) => r.id === data.reply.id)) return prev;
            return [...prev, data.reply];
          });
        } else {
          loadConversation(data.ticketId);
        }
      }
    };
    const typingHandler = (data) => {
      if (ticket?.id === data.ticketId && !data.isAdmin) {
        setTypingUser(data);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };
    socket.on('ticket:new_reply', replyHandler);
    socket.on('ticket:typing', typingHandler);
    return () => {
      socket.off('ticket:new_reply', replyHandler);
      socket.off('ticket:typing', typingHandler);
    };
  }, [socket, ticket?.id, loadConversation]);

  const handleSendReply = async () => {
    const msg = replyText.trim();
    if (!msg && !attachmentFile) return;
    setSendingReply(true);
    try {
      const formData = new FormData();
      if (msg) formData.append('message', msg);
      if (attachmentFile) formData.append('attachment', attachmentFile);
      const res = await api.post(`/support/tickets/${ticket.id}/reply`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConversation((prev) => [...prev, res.data.data]);
      setReplyText('');
      setAttachmentFile(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const emitTyping = () => {
    if (!socket || !ticket) return;
    socket.emit('ticket:typing', { ticketId: ticket.id });
  };

  const handleEditReply = (replyId, updated) => {
    setConversation((prev) => prev.map((r) => r.id === replyId ? updated : r));
  };

  const handleDeleteReply = (replyId) => {
    setConversation((prev) => prev.filter((r) => r.id !== replyId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{ticket.subject}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500">
              Ticket #{ticket.id} &middot; {ticket.state && `State: ${ticket.state}`}{ticket.lga && ` / LGA: ${ticket.lga}`}
              {ticket.unread_user_replies > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{ticket.unread_user_replies} unread</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAssign && !ticket.assigned_to && (
              <button onClick={() => onAssign(ticket)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700"><FaUserCheck size={12} /> Assign</button>
            )}
            {onEscalate && ticket.status !== 'resolved' && (
              <button onClick={() => onEscalate(ticket)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"><FaArrowUp size={12} /> Escalate</button>
            )}
            {onResolve && ticket.status !== 'resolved' && (
              <button onClick={() => onResolve(ticket)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"><FaCheckCircle size={12} /> Resolve</button>
            )}
            <button onClick={onClose} className="ml-2 rounded-lg p-1.5 text-gray-400 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 hover:text-gray-600 dark:text-gray-300"><FaTimesCircle size={18} /></button>
          </div>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {[
            { key: 'user', label: 'User Conversation', icon: FaPaperPlane },
            { key: 'service', label: 'Service Context' },
            { key: 'timeline', label: 'Timeline' },
            { key: 'internal', label: 'Internal Notes', icon: FaCommentDots },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => { if (tab.key === 'internal') fetchUnreadInternalNotes(); setChatTab(tab.key); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                chatTab === tab.key ? c.tab : 'border-transparent text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon && <tab.icon size={12} />}
              {tab.label}
            </button>
          ))}
          {unreadInternalNotes > 0 && chatTab !== 'internal' && (
            <span className="ml-1 self-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">{unreadInternalNotes}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {chatTab === 'user' ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  <FaUser size={10} /> {ticket.user_name || ticket.user_email || 'Anonymous'}
                  <span>&middot; opened &middot; {new Date(ticket.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{ticket.description}</p>
              </div>
              {loadingConversation ? (
                <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">Loading messages...</div>
              ) : conversation.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">No replies yet.</div>
              ) : (
                conversation.map((reply) => (
                  <div key={reply.id} className={`rounded-lg p-4 ${reply.is_admin ? `ml-6 border-l-4 ${c.border} ${c.bg}` : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                    <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
                      <div className="flex items-center gap-2">
                        {reply.is_admin ? <FaShieldAlt size={10} className={c.text} /> : <FaUser size={10} />}
                        <span className={reply.is_admin ? `font-medium ${c.text}` : ''}>{reply.author_name || reply.user_email || 'User'}</span>
                        {reply.is_admin && <span className={`rounded ${c.badge} px-1.5 py-0.5 text-[10px] font-medium`}>{adminLabel}</span>}
                        <span>&middot; {new Date(reply.created_at).toLocaleString()}</span>
                        {reply.edited_at && <span className="italic">(edited)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!reply.is_admin && reply.read_at && (
                          <span className="flex items-center gap-1 text-[10px] text-green-600"><FaCheck size={8} /> Read {new Date(reply.read_at).toLocaleString()}</span>
                        )}
                        {reply.is_admin && Number(reply.user_id) === Number(user.id) && (
                          <>
                            <button onClick={() => setReplyAction({ open: true, action: 'edit', reply })} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300"><FaEdit size={11} /></button>
                            <button onClick={() => setReplyAction({ open: true, action: 'delete', reply })} className="text-gray-400 dark:text-gray-500 hover:text-red-500"><FaTrash size={11} /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{reply.message}</p>
                    {reply.attachment_url && reply.attachment_type && reply.attachment_type.startsWith('audio/') ? (
                      <div className="mt-2 rounded-lg bg-gray-200 dark:bg-gray-600 p-1">
                        <audio controls className="w-full h-9" src={reply.attachment_url} preload="none" />
                      </div>
                    ) : reply.attachment_url ? (
                      <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-200 dark:bg-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300">
                        <FaFile size={12} /> {reply.attachment_name || 'Attachment'}
                      </a>
                    ) : null}
                  </div>
                ))
              )}
              {typingUser && (
                <div className="text-xs italic text-gray-400 dark:text-gray-500">{typingUser.userName} is typing...</div>
              )}
            </div>
          ) : chatTab === 'service' || chatTab === 'timeline' ? (
            <SupportTicketServicePanel ticket={ticket} onTicketUpdated={onTicketUpdated} />
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Internal Admin Notes</p>
              <InternalNotesPanel ticketId={ticket.id} currentUser={user} readOnly={ticket.status === 'resolved'} />
            </>
          )}
        </div>

        {chatTab === 'user' && ticket.status !== 'resolved' && (
          <div className="border-t border-gray-200 px-6 py-4">
            {attachmentFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                <FaPaperclip size={12} /> {attachmentFile.name}
                <button onClick={() => setAttachmentFile(null)} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={12} /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:bg-gray-700/50">
                <FaPaperclip size={14} />
                <input type="file" className="hidden" onChange={(e) => setAttachmentFile(e.target.files[0])} />
              </label>
              <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); emitTyping(); }}
                placeholder="Type your reply..." rows={2}
                className={`flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 p-3 text-sm outline-none ${c.focus}`}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
              <button onClick={handleSendReply} disabled={(!replyText.trim() && !attachmentFile) || sendingReply}
                className={`flex h-[42px] w-[42px] items-center justify-center rounded-lg ${c.button} text-white disabled:opacity-40`}>
                {sendingReply ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      <SupportReplyActionModal
        isOpen={replyAction.open}
        action={replyAction.action}
        ticketId={ticket?.id}
        reply={replyAction.reply}
        onClose={() => setReplyAction({ open: false, action: '', reply: null })}
        onEdited={handleEditReply}
        onDeleted={handleDeleteReply}
      />
    </div>
  );
};

export default TicketConversationModal;
