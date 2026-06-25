import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaCheckCircle, FaSyncAlt, FaTimesCircle, FaReply, FaPaperPlane, FaUser, FaShieldAlt, FaPaperclip, FaFile, FaEdit, FaTrash, FaCheck, FaTimes, FaCommentDots } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import InputDialog from '../../components/common/InputDialog';
import ApprovalTimeline from '../../components/common/ApprovalTimeline';
import useRetryableAction from '../../hooks/useRetryableAction';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import api from '../../services/api';
import CommissionWithdrawalBanner from '../../components/admin/CommissionWithdrawalBanner';
import PropertyRequestWorkflowPanel from '../../components/admin/PropertyRequestWorkflowPanel';
import TenancyWorkflowPanel from '../../components/admin/TenancyWorkflowPanel';
import InternalNotesPanel from '../../components/common/InternalNotesPanel';
import SupportTicketServicePanel from '../../components/admin/SupportTicketServicePanel';
import SupportTicketWorkspace from '../../components/admin/SupportTicketWorkspace';

const badgeClass = (status) => {
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const queueSteps = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'outgoing', label: 'Outgoing Review' },
  { key: 'incoming', label: 'Incoming Review' },
];

const resolveCurrentStep = (row) => {
  if (row?.status && row.status !== 'pending') return 'incoming';
  if (row?.outgoing_status && row.outgoing_status !== 'pending') return 'incoming';
  return 'outgoing';
};

const StateSupportAdminDashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('all');
  const [queue, setQueue] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewDialogValues, setReviewDialogValues] = useState({ review_note: '' });
  const [pendingReview, setPendingReview] = useState(null);

  // Support tickets state
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
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
    return ['overview', 'queue', 'property_requests', 'tenancy', 'tickets', 'escalations'].includes(tab) ? tab : 'overview';
  }, [location.search]);

  const workspaceTabs = [
    { key: 'overview', label: 'Overview', to: '/admin/state-support-dashboard?tab=overview' },
    { key: 'queue', label: 'Migration Queue', to: '/admin/state-support-dashboard?tab=queue' },
    { key: 'property_requests', label: 'Property Requests', to: '/admin/state-support-dashboard?tab=property_requests' },
    { key: 'tenancy', label: 'Tenancy Actions', to: '/admin/state-support-dashboard?tab=tenancy' },
    { key: 'tickets', label: 'Support Tickets', to: '/admin/state-support-dashboard?tab=tickets' },
    { key: 'escalations', label: 'Escalations', to: '/admin/state-support-dashboard?tab=escalations' },
  ];

  const fetchUnreadInternalNotes = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets/internal-notes/unread-count');
      setUnreadInternalNotes(res.data?.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchUnreadInternalNotes(); }, [fetchUnreadInternalNotes]);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await api.get('/support/tickets');
      setTickets(res.data?.data || []);
    } catch {
      toast.error('Failed to load support tickets');
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Socket listeners for real-time ticket updates
  useEffect(() => {
    if (!socket) return;
    const refreshTickets = async () => {
      try {
        const res = await api.get('/support/tickets');
        setTickets(res.data?.data || []);
      } catch {}
    };
    const replyHandler = (data) => {
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
    const typingHandler = (data) => {
      if (selectedTicket?.id === data.ticketId && !data.isAdmin) {
        setTypingUser(data);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };
    socket.on('ticket:new_reply', replyHandler);
    socket.on('ticket:created', refreshTickets);
    socket.on('ticket:updated', refreshTickets);
    socket.on('ticket:typing', typingHandler);
    const internalNoteHandler = () => { fetchUnreadInternalNotes(); };
    socket.on('ticket:internal_note', internalNoteHandler);
    return () => {
      socket.off('ticket:new_reply', replyHandler);
      socket.off('ticket:created', refreshTickets);
      socket.off('ticket:updated', refreshTickets);
      socket.off('ticket:typing', typingHandler);
      socket.off('ticket:internal_note', internalNoteHandler);
    };
  }, [socket, selectedTicket, fetchUnreadInternalNotes]);

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
    setReplyText('');
    setAttachmentFile(null);
    setTypingUser(null);
    setChatTab('user');
  };

  const handleTicketAction = async (action, ticket) => {
    try {
      if (action === 'assign_me') {
        await api.patch(`/support/tickets/${ticket.id}/assign`, { assigned_to: user.id });
        toast.success('Ticket assigned to you');
      } else if (action === 'escalate') {
        await api.post('/support/tickets/escalate', { ticketId: ticket.id });
        toast.success('Ticket escalated');
      } else if (action === 'resolve') {
        await api.patch(`/support/tickets/${ticket.id}/resolve`);
        toast.success('Ticket resolved');
      }
      loadTickets();
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
      loadTickets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
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
    loadTickets();
  };

  const emitTyping = () => {
    if (!socket || !selectedTicket) return;
    socket.emit('ticket:typing', { ticketId: selectedTicket.id });
  };

  const reviewAction = useRetryableAction(
    async ({ requestId, direction, decision, review_note }) => {
      await api.patch(`/state-migrations/${requestId}/support-review`, {
        direction,
        decision,
        review_note: review_note || undefined,
      });
    },
    {
      maxRetries: 2,
      context: 'state_admin',
      onSuccess: async (_result, args) => {
        toast.success(`Request ${args?.[0]?.decision} (${args?.[0]?.direction})`);
        setShowReviewDialog(false);
        setPendingReview(null);
        setReviewDialogValues({ review_note: '' });
        await loadQueue();
      },
      onError: (error) => {
        toast.error(error?.message || 'Failed to review request');
      },
    }
  );

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

  const reviewRequest = (requestId, direction, decision) => {
    setPendingReview({ requestId, direction, decision });
    setReviewDialogValues({ review_note: '' });
    setShowReviewDialog(true);
  };

  const submitReview = async (values) => {
    if (!pendingReview) return;
    setActionLoadingId(pendingReview.requestId);
    setReviewDialogValues(values);
    try {
      await reviewAction.execute({
        requestId: pendingReview.requestId,
        direction: pendingReview.direction,
        decision: pendingReview.decision,
        review_note: String(values?.review_note || '').trim(),
      });
    } finally {
      setActionLoadingId(null);
    }
  };

    return (
    <div className="min-h-screen bg-gradient-to-br from-admin-50 via-white to-admin-100/40 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-6">
      <section className="state-support-stats-section">
        <div className="mb-8 text-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">State Support Admin Dashboard</h1>
            <p className="mt-1 text-gray-600">
              Outgoing and incoming migration decisions for {user?.assigned_state || 'your assigned state'}.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={loadQueue}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Refresh Workspace
              </button>
            </div>
            <div className="mx-auto mt-4 max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-amber-800">
                  Withdrawal Access: Review Only. This role handles migration/support decisions and withdrawal tickets, not personal commission withdrawal requests.
                </p>
                <button
                  type="button"
                  onClick={() => setStage('incoming')}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Open Incoming Reviews
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        {workspaceTabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'overview' && (stats.incomingPending > 0 || stats.outgoingPending > 0) && (
        <section className="rounded-xl border-l-4 border-red-500 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-800">
                {stats.incomingPending + stats.outgoingPending} migration request action{stats.incomingPending + stats.outgoingPending === 1 ? '' : 's'} pending
              </p>
              <p className="mt-1 text-xs text-red-700">
                Review pending outgoing and incoming stages to avoid escalation delays.
              </p>
            </div>
            <Link
              to="/admin/state-support-dashboard?tab=queue"
              onClick={() => setStage('incoming')}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Review Pending
            </Link>
          </div>
        </section>
      )}

      {activeTab === 'overview' && (
      <>
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

            {/* Commission Withdrawal Banner */}
      <div className="mb-6">
        <CommissionWithdrawalBanner />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Link to="/admin/state-support-dashboard?tab=queue" className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
          Review migration queue
        </Link>
        <Link to="/admin/state-support-dashboard?tab=property_requests" className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
          Review property requests
        </Link>
        <Link to="/admin/state-support-dashboard?tab=tenancy" className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
          Handle tenancy actions
        </Link>
        <Link to="/admin/state-support-dashboard?tab=tickets" className="rounded-lg border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
          Open support inbox
        </Link>
      </div>
      </>
      )}

      {activeTab === 'property_requests' && (
      <div className="state-support-property-requests-section">
        <PropertyRequestWorkflowPanel
          mode="support"
          title="Tenant Property Requests in Your State"
        />
      </div>
      )}

      {activeTab === 'tenancy' && (
      <TenancyWorkflowPanel title="State Support Tenancy Grace and Refund Enablement" />
      )}

      {activeTab === 'queue' && (
      <section className="state-support-migration-section rounded-xl bg-white p-5 shadow">
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

                <ApprovalTimeline
                  steps={queueSteps}
                  currentStepKey={resolveCurrentStep(row)}
                  finalStatus={row.status}
                />

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
      )}

      {/* Support Tickets Section */}
      {activeTab === 'tickets' && (
        <SupportTicketWorkspace tickets={tickets} loading={ticketsLoading} user={user} onOpenTicket={openTicket} onTicketAction={handleTicketAction} mode="tickets" />
      )}

      {activeTab === 'escalations' && (
        <SupportTicketWorkspace tickets={tickets} loading={ticketsLoading} user={user} onOpenTicket={openTicket} onTicketAction={handleTicketAction} mode="escalations" />
      )}

      {/* Ticket Conversation Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedTicket.subject}</h3>
                <p className="text-sm text-gray-500">
                  Ticket #{selectedTicket.id} &middot; {selectedTicket.state && `State: ${selectedTicket.state}`}{selectedTicket.lga && ` / LGA: ${selectedTicket.lga}`}
                </p>
              </div>
              <button onClick={closeTicketModal} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><FaTimesCircle size={18} /></button>
            </div>

            {/* Tab toggle */}
            <div className="flex border-b border-gray-200 px-6">
              <button onClick={() => setChatTab('user')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${chatTab === 'user' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><FaReply size={12} /> User Conversation</button>
              <button onClick={() => setChatTab('service')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${chatTab === 'service' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Service Context</button>
              <button onClick={() => setChatTab('timeline')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${chatTab === 'timeline' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Timeline</button>
              <button onClick={() => { setChatTab('internal'); fetchUnreadInternalNotes(); }} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${chatTab === 'internal' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
                      <div key={reply.id} className={`rounded-lg p-3 shadow-sm ${reply.is_admin ? 'ml-4 border-l-4 border-indigo-400 bg-indigo-50' : 'bg-white'}`}>
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                          <div className="flex items-center gap-2">
                            {reply.is_admin ? <FaShieldAlt size={10} className="text-indigo-600" /> : <FaUser size={10} />}
                            <span className={reply.is_admin ? 'font-medium text-indigo-700' : ''}>{reply.author_name || reply.user_email || 'User'}</span>
                            {reply.is_admin && <span className="rounded bg-indigo-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">Support</span>}
                            <span>&middot; {new Date(reply.created_at).toLocaleString()}</span>
                            {reply.edited_at && <span className="italic">(edited)</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {reply.is_admin && (
                              <>
                                <button onClick={async () => {
                                  const newMsg = prompt('Edit message:', reply.message);
                                  if (newMsg && newMsg.trim()) {
                                    try { const res = await api.patch(`/support/tickets/${selectedTicket.id}/reply/${reply.id}`, { message: newMsg.trim() }); handleEditReply(reply.id, res.data.data); }
                                    catch (e) { toast.error('Failed to edit'); }
                                  }
                                }} className="text-gray-400 hover:text-gray-600"><FaEdit size={11} /></button>
                                <button onClick={async () => {
                                  if (!window.confirm('Delete this message?')) return;
                                  try { await api.delete(`/support/tickets/${selectedTicket.id}/reply/${reply.id}`); handleDeleteReply(reply.id); }
                                  catch (e) { toast.error('Failed to delete'); }
                                }} className="text-gray-400 hover:text-red-500"><FaTrash size={11} /></button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{reply.message}</p>
                        {reply.attachment_url && reply.attachment_type && reply.attachment_type.startsWith('audio/') ? (
                          <div className="mt-2 rounded-lg bg-gray-200 p-1">
                            <audio controls className="w-full h-9" src={reply.attachment_url} preload="none" />
                          </div>
                        ) : reply.attachment_url ? (
                          <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300">
                            <FaFile size={12} /> {reply.attachment_name || 'Attachment'}
                          </a>
                        ) : null}
                      </div>
                    ))
                  )}

                  {typingUser && (
                    <div className="text-xs italic text-slate-400">{typingUser.userName} is typing...</div>
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
                      <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); emitTyping(); }} placeholder="Type your reply..." rows={2}
                        className="flex-1 resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
                      <button onClick={handleSendReply} disabled={(!replyText.trim() && !attachmentFile) || sendingReply}
                        className="flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
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

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-3">
              <button onClick={closeTicketModal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      <InputDialog
        isOpen={showReviewDialog}
        onConfirm={submitReview}
        onCancel={() => {
          setShowReviewDialog(false);
          setPendingReview(null);
        }}
        title={pendingReview?.decision === 'approved' ? 'Approve Migration Review' : 'Reject Migration Review'}
        message={`Add an optional note for ${pendingReview?.direction || 'this'} review action.`}
        type={pendingReview?.decision === 'approved' ? 'info' : 'warning'}
        confirmText={pendingReview?.decision === 'approved' ? 'Approve' : 'Reject'}
        cancelText="Cancel"
        isLoading={reviewAction.isLoading}
        initialValues={reviewDialogValues}
        inputs={[
          {
            name: 'review_note',
            label: 'Review Note (Optional)',
            type: 'textarea',
            placeholder: 'Enter optional context for this review decision',
            rows: 3,
          },
        ]}
            />
        </div>
      </div>
    </div>
  );
};

export default StateSupportAdminDashboard;
