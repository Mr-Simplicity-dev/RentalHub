import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { FaCheckCircle, FaHeadset, FaHome, FaReply, FaSyncAlt, FaTimesCircle, FaUserCheck, FaArrowUp, FaPaperPlane, FaUser, FaShieldAlt, FaPaperclip, FaFile, FaEdit, FaTrash, FaCheck, FaTimes, FaCommentDots } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import PropertyRequestWorkflowPanel from '../../components/admin/PropertyRequestWorkflowPanel';
import TenancyWorkflowPanel from '../../components/admin/TenancyWorkflowPanel';
import InternalNotesPanel from '../../components/common/InternalNotesPanel';
import SupportTicketServicePanel from '../../components/admin/SupportTicketServicePanel';
import SupportTicketWorkspace from '../../components/admin/SupportTicketWorkspace';
import SupportReplyActionModal from '../../components/common/SupportReplyActionModal';

const ChatMessage = ({ reply, isOwn, onEdit, onDelete, ticketId }) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(reply.message);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    try {
      const res = await api.patch(`/support/tickets/${ticketId}/reply/${reply.id}`, { message: editText.trim() });
      onEdit(reply.id, res.data.data);
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to edit');
    }
  };

  return (
    <div className={`rounded-lg p-4 ${reply.is_admin ? 'ml-6 border-l-4 border-amber-400 bg-amber-50' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {reply.is_admin ? <FaShieldAlt size={10} className="text-amber-600" /> : <FaUser size={10} />}
          <span className={reply.is_admin ? 'font-medium text-amber-700' : ''}>{reply.author_name || reply.user_email || 'User'}</span>
          {reply.is_admin && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Support</span>}
          <span>&middot; {new Date(reply.created_at).toLocaleString()}</span>
          {reply.edited_at && <span className="italic">(edited)</span>}
        </div>
        <div className="flex items-center gap-2">
          {!reply.is_admin && reply.read_at && (
            <span className="flex items-center gap-1 text-[10px] text-green-600"><FaCheck size={8} /> Read {new Date(reply.read_at).toLocaleString()}</span>
          )}
          {isOwn && (
            <>
              {!editing && <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600"><FaEdit size={11} /></button>}
              <button onClick={() => setDeleteOpen(true)} className="text-gray-400 hover:text-red-500"><FaTrash size={11} /></button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex items-end gap-2">
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="flex-1 resize-none rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-amber-400" />
          <button onClick={handleSaveEdit} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700"><FaCheck size={12} /></button>
          <button onClick={() => { setEditing(false); setEditText(reply.message); }} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-gray-300 text-gray-700 hover:bg-gray-400"><FaTimes size={12} /></button>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{reply.message}</p>
      )}

      {reply.attachment_url && reply.attachment_type && reply.attachment_type.startsWith('audio/') ? (
        <div className="mt-2 rounded-lg bg-gray-200 p-1">
          <audio controls className="w-full h-9" src={reply.attachment_url} preload="none">
            Your browser does not support audio playback.
          </audio>
        </div>
      ) : reply.attachment_url ? (
        <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300">
          <FaFile size={12} /> {reply.attachment_name || 'Attachment'}
        </a>
      ) : null}
      <SupportReplyActionModal
        isOpen={deleteOpen}
        action="delete"
        ticketId={ticketId}
        reply={reply}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDelete}
      />
    </div>
  );
};

const LgaSupportAdminDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ tickets: [] });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimer = useRef(null);
  const [chatTab, setChatTab] = useState('user');
  const [unreadInternalNotes, setUnreadInternalNotes] = useState(0);
  const activeTab = useMemo(() => {
    const tab = new URLSearchParams(location.search).get('tab') || 'overview';
    return ['overview', 'property_requests', 'tenancy', 'tickets', 'escalations'].includes(tab) ? tab : 'overview';
  }, [location.search]);

  const workspaceTabs = [
    { key: 'overview', label: 'Overview', to: '/admin/lga-support-dashboard?tab=overview' },
    { key: 'property_requests', label: 'Property Requests', to: '/admin/lga-support-dashboard?tab=property_requests' },
    { key: 'tenancy', label: 'Tenancy Actions', to: '/admin/lga-support-dashboard?tab=tenancy' },
    { key: 'tickets', label: 'Support Tickets', to: '/admin/lga-support-dashboard?tab=tickets' },
    { key: 'escalations', label: 'Escalations', to: '/admin/lga-support-dashboard?tab=escalations' },
  ];

  // Fetch unread internal notes count
  const fetchUnreadInternalNotes = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets/internal-notes/unread-count');
      setUnreadInternalNotes(res.data?.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchUnreadInternalNotes(); }, [fetchUnreadInternalNotes]);

  // Socket listener for real-time replies
  useEffect(() => {
    if (!socket) return;
    const refreshTickets = async () => {
      try {
        const ticketsRes = await api.get('/support/tickets');
        setData({ tickets: ticketsRes.data?.data || [] });
      } catch {}
    };
    const handler = (data) => {
      refreshTickets();
      if (selectedTicket?.id === data.ticketId) {
        if (data.reply) {
          setConversation((prev) => {
            if (prev.some((reply) => reply.id === data.reply.id)) return prev;
            return [...prev, data.reply];
          });
        } else {
          loadConversation(data.ticketId);
        }
      }
    };
    socket.on('ticket:new_reply', handler);
    socket.on('ticket:created', refreshTickets);
    socket.on('ticket:updated', refreshTickets);

    const typingHandler = (data) => {
      if (selectedTicket?.id === data.ticketId && !data.isAdmin) {
        setTypingUser(data);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };
    socket.on('ticket:typing', typingHandler);

    const internalNoteHandler = () => { fetchUnreadInternalNotes(); };
    socket.on('ticket:internal_note', internalNoteHandler);

    return () => {
      socket.off('ticket:new_reply', handler);
      socket.off('ticket:created', refreshTickets);
      socket.off('ticket:updated', refreshTickets);
      socket.off('ticket:typing', typingHandler);
      socket.off('ticket:internal_note', internalNoteHandler);
    };
  }, [socket, selectedTicket, fetchUnreadInternalNotes, loadConversation]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const ticketsRes = await api.get('/support/tickets');
      setData({ tickets: ticketsRes.data?.data || [] });
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const ticketStats = useMemo(() => {
    const tickets = data.tickets || [];
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      inProgress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved').length,
      unassigned: tickets.filter((t) => !t.assigned_to).length,
    };
  }, [data.tickets]);

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

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setReplyText('');
    setAttachmentFile(null);
    setChatTab('user');
    loadConversation(ticket.id);
  };

  const closeTicketModal = () => {
    setSelectedTicket(null);
    setConversation([]);
    setAttachmentFile(null);
    setTypingUser(null);
    setChatTab('user');
  };

  const handleQuickAction = async (action, ticket) => {
    try {
      if (action === 'resolve') {
        await api.patch(`/support/tickets/${ticket.id}/resolve`);
        toast.success('Ticket resolved');
      } else if (action === 'assign_me') {
        await api.patch(`/support/tickets/${ticket.id}/assign`, { assigned_to: user.id });
        toast.success('Ticket assigned to you');
      } else if (action === 'escalate') {
        await api.post('/support/tickets/escalate', { ticketId: ticket.id });
        toast.success('Ticket escalated');
      }
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleSendReply = async () => {
    const msg = replyText.trim();
    if (!msg && !attachmentFile) return;
    setSendingReply(true);
    try {
      const formData = new FormData();
      if (msg) formData.append('message', msg);
      if (attachmentFile) formData.append('attachment', attachmentFile);

      const res = await api.post(`/support/tickets/${selectedTicket.id}/reply`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConversation((prev) => [...prev, res.data.data]);
      setReplyText('');
      setAttachmentFile(null);
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const emitTyping = () => {
    if (!socket || !selectedTicket) return;
    socket.emit('ticket:typing', { ticketId: selectedTicket.id });
  };

  const handleEditReply = (replyId, updated) => {
    setConversation((prev) => prev.map((r) => r.id === replyId ? updated : r));
  };

  const handleDeleteReply = (replyId) => {
    setConversation((prev) => prev.filter((r) => r.id !== replyId));
  };

  const handleTicketUpdated = (updatedTicket) => {
    if (!updatedTicket) return;
    setSelectedTicket((prev) => prev?.id === updatedTicket.id ? { ...prev, ...updatedTicket } : prev);
    loadDashboard();
  };

  const conversationModal = selectedTicket && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{selectedTicket.subject}</h3>
            <p className="text-sm text-gray-500">
              Ticket #{selectedTicket.id} &middot; {selectedTicket.state && `State: ${selectedTicket.state}`}{selectedTicket.lga && ` / LGA: ${selectedTicket.lga}`}
              {selectedTicket.unread_user_replies > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{selectedTicket.unread_user_replies} unread</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedTicket.status !== 'resolved' && (
              <>
                {!selectedTicket.assigned_to && (
                  <button onClick={() => handleQuickAction('assign_me', selectedTicket)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"><FaUserCheck size={12} /> Assign</button>
                )}
                <button onClick={() => handleQuickAction('escalate', selectedTicket)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"><FaArrowUp size={12} /> Escalate</button>
                <button onClick={() => handleQuickAction('resolve', selectedTicket)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"><FaCheckCircle size={12} /> Resolve</button>
              </>
            )}
            <button onClick={closeTicketModal} className="ml-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><FaTimesCircle size={18} /></button>
          </div>
        </div>

        {/* Chat tab toggle */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setChatTab('user')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              chatTab === 'user' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FaReply size={12} /> User Conversation
          </button>
          <button
            onClick={() => setChatTab('service')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              chatTab === 'service' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Service Context
          </button>
          <button
            onClick={() => setChatTab('timeline')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              chatTab === 'timeline' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => { setChatTab('internal'); fetchUnreadInternalNotes(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              chatTab === 'internal' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FaCommentDots size={12} /> Internal Notes
            {unreadInternalNotes > 0 && chatTab !== 'internal' && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">{unreadInternalNotes}</span>
            )}
          </button>
        </div>

        {chatTab === 'user' ? (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <FaUser size={10} /> {selectedTicket.user_name || selectedTicket.user_email || 'Anonymous'}
                  <span>&middot; opened &middot; {new Date(selectedTicket.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{selectedTicket.description}</p>
              </div>

              {loadingConversation ? (
                <div className="py-4 text-center text-sm text-gray-400">Loading messages...</div>
              ) : conversation.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">No replies yet.</div>
              ) : (
                conversation.map((reply) => (
                  <ChatMessage key={reply.id} reply={reply} isOwn={reply.is_admin && Number(reply.user_id) === Number(user.id)} ticketId={selectedTicket.id}
                    onEdit={(rid, updated) => handleEditReply(rid, updated)}
                    onDelete={(rid) => handleDeleteReply(rid)} />
                ))
              )}

              {typingUser && (
                <div className="text-xs italic text-gray-400">{typingUser.userName} is typing...</div>
              )}
            </div>

            {selectedTicket.status !== 'resolved' && (
              <div className="border-t border-gray-200 px-6 py-4">
                {attachmentFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
                    <FaPaperclip size={12} /> {attachmentFile.name}
                    <button onClick={() => setAttachmentFile(null)} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={12} /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">
                    <FaPaperclip size={14} />
                    <input type="file" className="hidden" onChange={(e) => setAttachmentFile(e.target.files[0])} />
                  </label>
                  <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); emitTyping(); }}
                    placeholder="Type your reply..." rows={2}
                    className="flex-1 resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
                  <button onClick={handleSendReply} disabled={(!replyText.trim() && !attachmentFile) || sendingReply}
                    className="flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40">
                    {sendingReply ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={14} />}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : chatTab === 'service' || chatTab === 'timeline' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <SupportTicketServicePanel ticket={selectedTicket} onTicketUpdated={handleTicketUpdated} />
          </div>
        ) : (
          <div className="flex-1 px-6 py-4">
            <p className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Internal Admin Notes</p>
            <InternalNotesPanel ticketId={selectedTicket.id} currentUser={user} readOnly={selectedTicket.status === 'resolved'} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-admin-50 via-white to-admin-100/40 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">LGA Support Dashboard</h1>
          <p className="mt-1 text-gray-600">
            Manage property requests, tenancy operations, and support tickets for{' '}
            <span className="font-semibold text-admin-700">{user?.assigned_city || user?.assigned_state || 'your LGA'}</span>.
          </p>
          <div className="mt-4">
            <button onClick={loadDashboard} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><FaSyncAlt /> Refresh</button>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {workspaceTabs.map((tab) => (
            <Link
              key={tab.key}
              to={tab.to}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-admin-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {activeTab === 'overview' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">Open Tickets</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{ticketStats.open}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-medium text-blue-700">In Progress</p>
              <p className="mt-1 text-2xl font-bold text-blue-800">{ticketStats.inProgress}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-medium text-green-700">Resolved</p>
              <p className="mt-1 text-2xl font-bold text-green-800">{ticketStats.resolved}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">Unassigned</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{ticketStats.unassigned}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link to="/admin/lga-support-dashboard?tab=property_requests" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Review property requests
            </Link>
            <Link to="/admin/lga-support-dashboard?tab=tenancy" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Handle tenancy actions
            </Link>
            <Link to="/admin/lga-support-dashboard?tab=tickets" className="rounded-lg border border-gray-200 p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Open support inbox
            </Link>
          </div>
        </div>
        )}

        {activeTab === 'property_requests' && (
        <div className="lga-support-property-requests-section">
          <PropertyRequestWorkflowPanel mode="support" title="Property Requests in Your LGA" />
        </div>
        )}
        {activeTab === 'tenancy' && (
        <div className="lga-support-tenancy-section">
          <TenancyWorkflowPanel title="LGA Support Tenancy Grace and Refund Enablement" />
        </div>
        )}

        {activeTab === 'tickets' && (
        <SupportTicketWorkspace tickets={data.tickets} loading={loading} user={user} onOpenTicket={openTicket} onTicketAction={handleQuickAction} mode="tickets" />
        )}

        {activeTab === 'escalations' && (
        <SupportTicketWorkspace tickets={data.tickets} loading={loading} user={user} onOpenTicket={openTicket} onTicketAction={handleQuickAction} mode="escalations" />
        )}
      </div>

      {conversationModal}
    </div>
  );
};

export default LgaSupportAdminDashboard;
