import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaHeadset, FaHome, FaReply, FaSyncAlt, FaTimesCircle, FaUserCheck, FaArrowUp, FaPaperPlane, FaUser, FaShieldAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import PropertyRequestWorkflowPanel from '../../components/admin/PropertyRequestWorkflowPanel';
import TenancyWorkflowPanel from '../../components/admin/TenancyWorkflowPanel';

const LgaSupportAdminDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ tickets: [] });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);

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

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
      const res = await api.get(`/support/tickets/${ticketId}/conversation`);
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
    loadConversation(ticket.id);
  };

  const closeTicketModal = () => {
    setSelectedTicket(null);
    setConversation([]);
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
        toast.success('Ticket escalated to state support');
      }
      loadDashboard();
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket((prev) => prev ? { ...prev, assigned_to: user.id, status: 'in_progress' } : prev);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      const res = await api.post(`/support/tickets/${selectedTicket.id}/reply`, { message: replyText.trim() });
      setConversation((prev) => [...prev, res.data.data]);
      setReplyText('');
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const conversationModal = selectedTicket && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{selectedTicket.subject}</h3>
            <p className="text-sm text-gray-500">
              Ticket #{selectedTicket.id} &middot; {selectedTicket.state && `State: ${selectedTicket.state}`}{selectedTicket.lga && ` / LGA: ${selectedTicket.lga}`}
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

        {/* Conversation */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {/* Original ticket description */}
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              <FaUser size={10} /> {selectedTicket.user_name || selectedTicket.user_email || 'Anonymous'}
              <span>&middot; opened</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{selectedTicket.description}</p>
            <p className="mt-1 text-xs text-gray-400">{new Date(selectedTicket.created_at).toLocaleString()}</p>
          </div>

          {/* Replies */}
          {loadingConversation ? (
            <div className="py-4 text-center text-sm text-gray-400">Loading messages...</div>
          ) : conversation.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">No replies yet.</div>
          ) : (
            conversation.map((reply) => (
              <div key={reply.id} className={`rounded-lg p-4 ${reply.is_admin ? 'ml-6 border-l-4 border-amber-400 bg-amber-50' : 'bg-gray-50'}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  {reply.is_admin ? <FaShieldAlt size={10} className="text-amber-600" /> : <FaUser size={10} />}
                  <span className={reply.is_admin ? 'font-medium text-amber-700' : ''}>
                    {reply.author_name || reply.user_email || 'User'}
                  </span>
                  {reply.is_admin && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Support</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{reply.message}</p>
                <p className="mt-1 text-xs text-gray-400">{new Date(reply.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>

        {/* Reply form */}
        <div className="border-t border-gray-200 px-6 py-4">
          <div className="flex items-end gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your reply..."
              rows={2}
              className="flex-1 resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sendingReply}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
            >
              {sendingReply ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-100/40 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">LGA Support Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage property requests, tenancy operations, and support tickets for{' '}
                <span className="font-semibold text-amber-700">
                  {user?.assigned_city || user?.assigned_state || 'your LGA'}
                </span>
                .
              </p>
            </div>
            <button
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FaSyncAlt /> Refresh
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-700">Open Tickets</p>
              <p className="mt-1 text-2xl font-bold text-amber-800">{ticketStats.open}</p>
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
        </div>

        <div className="lga-support-property-requests-section">
          <PropertyRequestWorkflowPanel mode="support" title="Property Requests in Your LGA" />
        </div>
        <div className="lga-support-tenancy-section">
          <TenancyWorkflowPanel title="LGA Support Tenancy Grace and Refund Enablement" />
        </div>

        <div className="lga-support-tickets-section rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
                <FaHeadset className="text-lg" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Support Tickets</h2>
                <p className="text-sm text-gray-500">All tickets in your LGA — view, reply, assign, or escalate.</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 py-10 text-center text-sm text-gray-500">Loading tickets...</div>
          ) : data.tickets.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              No support tickets found.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data.tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <code className="text-sm font-medium text-gray-900">#{ticket.id}</code>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-900">{ticket.subject}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {ticket.user_name || ticket.user_email || '\u2014'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ticket.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          ticket.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          ticket.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{ticket.priority}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ticket.status === 'open' ? 'bg-amber-100 text-amber-700' :
                          ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          ticket.status === 'resolved' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{ticket.status?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openTicket(ticket)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <FaReply size={12} /> View
                          </button>
                          <button
                            onClick={() => handleQuickAction('assign_me', ticket)}
                            disabled={ticket.assigned_to === user.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                          >
                            <FaUserCheck size={12} /> Assign
                          </button>
                          {ticket.status !== 'resolved' && (
                            <>
                              <button
                                onClick={() => handleQuickAction('escalate', ticket)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                              >
                                <FaArrowUp size={12} /> Escalate
                              </button>
                              <button
                                onClick={() => handleQuickAction('resolve', ticket)}
                                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                              >
                                <FaCheckCircle size={12} /> Resolve
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {conversationModal}
    </div>
  );
};

export default LgaSupportAdminDashboard;
