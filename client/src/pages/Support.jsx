import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaTicketAlt, FaPaperPlane, FaClock, FaCheckCircle, FaExclamationCircle, FaBug, FaLightbulb, FaQuestionCircle, FaSpinner, FaChevronDown, FaChevronUp, FaUser, FaShieldAlt, FaPaperclip, FaFile, FaTrash, FaEdit, FaCheck, FaTimes } from 'react-icons/fa';
import Loader from '../components/common/Loader';
import { useSocket } from '../hooks/useSocket';
import SupportReplyActionModal from '../components/common/SupportReplyActionModal';
import { useTranslation } from 'react-i18next';

const ChatMessage = ({ reply, isOwn, onEdit, onDelete, ticketId }) => {
  const { t } = useTranslation();
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
      toast.error(err.response?.data?.message || t('support.edit_failed'));
    }
  };

  return (
    <div className={`rounded-lg p-4 ${reply.is_admin ? 'ml-6 border-l-4 border-primary-300 bg-primary-50' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {reply.is_admin ? <FaShieldAlt size={10} className="text-primary-600" /> : <FaUser size={10} />}
          <span className={reply.is_admin ? 'font-medium text-primary-700' : ''}>
            {reply.author_name || reply.user_email || t('support.unknown_user')}
          </span>
          {reply.is_admin && <span className="rounded bg-primary-200 px-1.5 py-0.5 text-[10px] font-medium text-primary-800">{t('support.support_badge')}</span>}
          <span>&middot; {new Date(reply.created_at).toLocaleString()}</span>
          {reply.edited_at && <span className="italic">{t('support.edited_indicator')}</span>}
        </div>
        <div className="flex items-center gap-2">
          {reply.read_at && reply.is_admin && (
            <span className="flex items-center gap-1 text-[10px] text-green-600"><FaCheck size={8} /> {t('support.read_prefix')} {new Date(reply.read_at).toLocaleString()}</span>
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
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="flex-1 resize-none rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-primary-400" />
          <button onClick={handleSaveEdit} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700"><FaCheck size={12} /></button>
          <button onClick={() => { setEditing(false); setEditText(reply.message); }} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-gray-300 text-gray-700 hover:bg-gray-400"><FaTimes size={12} /></button>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{reply.message}</p>
      )}

      {reply.attachment_url && (
        <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300">
          <FaFile size={12} /> {reply.attachment_name || t('support.attachment_fallback')}
        </a>
      )}
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

const Support = () => {
  const { t } = useTranslation();
  const priorityOptions = [
    { value: 'low', label: t('support.low'), color: 'bg-gray-100 text-gray-600' },
    { value: 'medium', label: t('support.medium'), color: 'bg-blue-100 text-blue-700' },
    { value: 'high', label: t('support.high'), color: 'bg-orange-100 text-orange-700' },
    { value: 'urgent', label: t('support.urgent'), color: 'bg-red-100 text-red-700' },
  ];

  const statusBadge = (status) => {
    const map = {
      open: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-amber-100 text-amber-700',
      resolved: 'bg-emerald-100 text-emerald-700',
      closed: 'bg-gray-100 text-gray-600',
    };
    const labels = {
      open: t('support.open'),
      in_progress: t('support.in_progress'),
      resolved: t('support.resolved'),
      closed: t('support.closed'),
    };
    return (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status?.replace(/_/g, ' ')}
      </span>
    );
  };
  const { socket } = useSocket();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', category: 'general', related_type: '', related_id: '' });
  const [serviceOptions, setServiceOptions] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState(null);
  const [conversations, setConversations] = useState({});
  const [replyTexts, setReplyTexts] = useState({});
  const [loadingConv, setLoadingConv] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [attachmentFiles, setAttachmentFiles] = useState({});
  const [conversationMeta, setConversationMeta] = useState({});
  const typingTimers = useRef({});

  const loadTickets = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets/my');
      setTickets(res.data?.data || []);
    } catch {
      toast.error(t('support.load_tickets_failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (ticketId) => {
    setLoadingConv((prev) => ({ ...prev, [ticketId]: true }));
    try {
      const offset = conversations[ticketId]?.length || 0;
      const res = await api.get(`/support/tickets/${ticketId}/conversation?limit=100&offset=${offset}`);
      setConversations((prev) => ({ ...prev, [ticketId]: res.data?.data || [] }));
      setConversationMeta((prev) => ({ ...prev, [ticketId]: res.data?.meta }));
    } catch {
      setConversations((prev) => ({ ...prev, [ticketId]: [] }));
    } finally {
      setLoadingConv((prev) => ({ ...prev, [ticketId]: false }));
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      const ticketId = data.ticketId;
      loadTickets();

      if (data.reply) {
        setConversations((prev) => {
          const current = prev[ticketId] || [];
          if (!current.length || current.some((reply) => reply.id === data.reply.id)) return prev;
          return { ...prev, [ticketId]: [...current, data.reply] };
        });
      }

      if (expandedTicket === ticketId && !data.reply) loadConversation(ticketId);
    };
    socket.on('ticket:new_reply', handler);
    socket.on('ticket:updated', loadTickets);
    return () => {
      socket.off('ticket:new_reply', handler);
      socket.off('ticket:updated', loadTickets);
    };
  }, [socket, expandedTicket, loadConversation, loadTickets]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      setTypingUsers((prev) => ({
        ...prev,
        [data.ticketId]: { userName: data.userName, isAdmin: data.isAdmin },
      }));
      clearTimeout(typingTimers.current[data.ticketId]);
      typingTimers.current[data.ticketId] = setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[data.ticketId];
          return next;
        });
      }, 3000);
    };
    socket.on('ticket:typing', handler);
    return () => socket.off('ticket:typing', handler);
  }, [socket]);

  const toggleExpand = (ticketId) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null);
      return;
    }
    setExpandedTicket(ticketId);
    if (!conversations[ticketId]) {
      loadConversation(ticketId);
    }
  };

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    const loadServiceOptions = async () => {
      if (!['transportation', 'fumigation_cleaning'].includes(form.category)) {
        setServiceOptions([]);
        return;
      }

      setLoadingServices(true);
      try {
        const endpoint = form.category === 'transportation' ? '/transportation/bookings' : '/fumigation-cleaning/bookings';
        const res = await api.get(endpoint);
        setServiceOptions(res.data?.data || []);
      } catch {
        setServiceOptions([]);
      } finally {
        setLoadingServices(false);
      }
    };

    loadServiceOptions();
  }, [form.category]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error(t('support.enter_subject'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/support/tickets', form);
      setTickets((prev) => [res.data.data, ...prev]);
      setForm({ subject: '', description: '', priority: 'medium', category: 'general', related_type: '', related_id: '' });
      setShowForm(false);
      toast.success(t('support.ticket_submitted'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('support.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (ticketId) => {
    const msg = (replyTexts[ticketId] || '').trim();
    const file = attachmentFiles[ticketId];
    if (!msg && !file) return;
    setSendingReply(true);
    try {
      const formData = new FormData();
      if (msg) formData.append('message', msg);
      if (file) formData.append('attachment', file);

      const res = await api.post(`/support/tickets/${ticketId}/reply`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConversations((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] || []), res.data.data],
      }));
      setReplyTexts((prev) => ({ ...prev, [ticketId]: '' }));
      setAttachmentFiles((prev) => { const n = { ...prev }; delete n[ticketId]; return n; });
    } catch (err) {
      toast.error(err.response?.data?.message || t('support.reply_failed'));
    } finally {
      setSendingReply(false);
    }
  };

  const emitTyping = (ticketId) => {
    if (!socket) return;
    socket.emit('ticket:typing', { ticketId });
  };

  const handleEditReply = (ticketId, replyId, updated) => {
    setConversations((prev) => ({
      ...prev,
      [ticketId]: (prev[ticketId] || []).map((r) => r.id === replyId ? updated : r),
    }));
  };

  const handleDeleteReply = (ticketId, replyId) => {
    setConversations((prev) => ({
      ...prev,
      [ticketId]: (prev[ticketId] || []).filter((r) => r.id !== replyId),
    }));
  };

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('support.title')}</h1>
            <p className="mt-2 text-sm text-gray-600">{t('support.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowForm((p) => !p)}
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <FaPaperPlane /> {showForm ? t('support.cancel') : t('support.new_ticket')}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{t('support.form_title')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('support.form_desc')}</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('support.subject_label')}</label>
                <input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} className="input w-full" placeholder={t('support.subject_placeholder')} maxLength={255} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('support.description_label')}</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="input w-full min-h-[120px]" placeholder={t('support.description_placeholder')} rows={4} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('support.category_label')}</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, related_type: '', related_id: '' }))}
                  className="input w-full"
                >
                  <option value="general">{t('support.general')}</option>
                  <option value="transportation">{t('support.transportation')}</option>
                  <option value="fumigation_cleaning">{t('support.fumigation_cleaning')}</option>
                  <option value="payment">{t('support.payment')}</option>
                  <option value="property">{t('support.property')}</option>
                  <option value="tenancy">{t('support.tenancy')}</option>
                  <option value="legal">{t('support.legal')}</option>
                  <option value="technical">{t('support.technical')}</option>
                </select>
              </div>
              {['transportation', 'fumigation_cleaning'].includes(form.category) && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('support.related_booking')}</label>
                  <select
                    value={form.related_id}
                    onChange={(e) => setForm((p) => ({
                      ...p,
                      related_id: e.target.value,
                      related_type: p.category === 'transportation' ? 'transportation_booking' : 'fumigation_cleaning_booking',
                    }))}
                    className="input w-full"
                  >
                    <option value="">{loadingServices ? t('support.loading_bookings') : t('support.no_booking')}</option>
                    {serviceOptions.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        #{booking.booking_reference || booking.id} - {booking.service_name || booking.category_name || t('support.booking_fallback')} - {String(booking.booking_status || booking.status || 'pending').replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('support.priority_label')}</label>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setForm((p) => ({ ...p, priority: opt.value }))}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${form.priority === opt.value ? 'ring-2 ring-primary-500 ring-offset-2 ' + opt.color : opt.color + ' hover:ring-1 hover:ring-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary inline-flex items-center gap-2">
                {submitting ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
                {submitting ? t('support.submitting') : t('support.submit_ticket')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn text-gray-600">{t('support.cancel')}</button>
            </div>
          </form>
        )}

        {tickets.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <FaTicketAlt className="mx-auto text-5xl text-gray-300" />
            <h3 className="mt-4 text-xl font-semibold text-gray-900">{t('support.no_tickets')}</h3>
            <p className="mt-2 text-sm text-gray-600">{t('support.no_tickets_desc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const isExpanded = expandedTicket === ticket.id;
              const conv = conversations[ticket.id] || [];
              const convLoading = loadingConv[ticket.id];
              const typing = typingUsers[ticket.id];

              return (
                <div key={ticket.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
                  <button onClick={() => toggleExpand(ticket.id)} className="flex w-full items-start justify-between gap-3 p-5 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{ticket.subject}</h3>
                        {statusBadge(ticket.status)}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityOptions.find((o) => o.value === ticket.priority)?.color || 'bg-gray-100 text-gray-600'}`}>{ticket.priority}</span>
                        {ticket.unread_admin_replies > 0 && !isExpanded && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{t('support.new_replies', { count: ticket.unread_admin_replies })}</span>
                        )}
                      </div>
                      {ticket.description && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{ticket.description}</p>}
                      {(ticket.category || ticket.escalation_status !== 'none') && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize text-gray-700">{String(ticket.category || 'general').replace(/_/g, ' ')}</span>
                          {ticket.escalation_status && ticket.escalation_status !== 'none' && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium capitalize text-amber-700">
                              {String(ticket.escalation_department || 'support').replace(/_/g, ' ')} · {String(ticket.escalation_status).replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-gray-400">{isExpanded ? <FaChevronUp /> : <FaChevronDown />}</div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5">
                      <div className="mt-4 rounded-lg bg-gray-50 p-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <FaUser size={10} /> {t('support.you')} <span>&middot; {t('support.opened')}</span> <span>&middot; {new Date(ticket.created_at).toLocaleString()}</span>
                          {ticket.state && <span>&middot; {ticket.state}{ticket.lga && ` / ${ticket.lga}`}</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{ticket.description}</p>
                      </div>

                      {ticket.escalation_status && ticket.escalation_status !== 'none' && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                            <FaClock /> {t('support.escalation_tracking')}
                          </div>
                          <p className="mt-1 text-sm text-amber-800">
                            {t('support.escalation_desc', { department: String(ticket.escalation_department || 'support').replace(/_/g, ' '), status: String(ticket.escalation_status).replace(/_/g, ' ') })}
                          </p>
                          {ticket.sla_due_at && (
                            <p className="mt-1 text-xs text-amber-700">{t('support.target_response')} {new Date(ticket.sla_due_at).toLocaleString()}</p>
                          )}
                        </div>
                      )}

                      {convLoading ? (
                        <div className="py-4 text-center text-sm text-gray-400">{t('support.loading_messages')}</div>
                      ) : conv.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {conv.map((reply) => (
                            <ChatMessage key={reply.id} reply={reply} isOwn={!reply.is_admin} ticketId={ticket.id}
                              onEdit={(rid, updated) => handleEditReply(ticket.id, rid, updated)}
                              onDelete={(rid) => handleDeleteReply(ticket.id, rid)} />
                          ))}
                        </div>
                      ) : (
                        <div className="py-4 text-center text-sm text-gray-400">{t('support.no_replies')}</div>
                      )}

                      {typing && (
                        <div className="mt-2 text-xs italic text-gray-400">
                          {t('support.typing', { userName: typing.userName, isAdmin: typing.isAdmin })}
                        </div>
                      )}

                      {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                        <div className="mt-4 space-y-2">
                          {attachmentFiles[ticket.id] && (
                            <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
                              <FaPaperclip size={12} /> {attachmentFiles[ticket.id].name}
                              <button onClick={() => setAttachmentFiles((p) => { const n = { ...p }; delete n[ticket.id]; return n; })} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={12} /></button>
                            </div>
                          )}
                          <div className="flex items-end gap-2">
                            <label className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">
                              <FaPaperclip size={14} />
                              <input type="file" className="hidden" onChange={(e) => setAttachmentFiles((p) => ({ ...p, [ticket.id]: e.target.files[0] }))} />
                            </label>
                            <textarea value={replyTexts[ticket.id] || ''}
                              onChange={(e) => { setReplyTexts((prev) => ({ ...prev, [ticket.id]: e.target.value })); emitTyping(ticket.id); }}
                              placeholder={t('support.reply_placeholder')} rows={2}
                              className="flex-1 resize-none rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(ticket.id); } }} />
                            <button onClick={() => handleSendReply(ticket.id)} disabled={!((replyTexts[ticket.id] || '').trim()) && !attachmentFiles[ticket.id] || sendingReply}
                              className="flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40">
                              {sendingReply ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={14} />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t('support.help_topics')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaQuestionCircle className="mt-0.5 text-primary-600" />
              <div><p className="text-sm font-medium text-gray-900">{t('support.how_to_list')}</p><p className="mt-0.5 text-xs text-gray-500">{t('support.how_to_list_desc')}</p></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaBug className="mt-0.5 text-primary-600" />
              <div><p className="text-sm font-medium text-gray-900">{t('support.report_bug')}</p><p className="mt-0.5 text-xs text-gray-500">{t('support.report_bug_desc')}</p></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaLightbulb className="mt-0.5 text-primary-600" />
              <div><p className="text-sm font-medium text-gray-900">{t('support.feature_suggestions')}</p><p className="mt-0.5 text-xs text-gray-500">{t('support.feature_suggestions_desc')}</p></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <FaExclamationCircle className="mt-0.5 text-primary-600" />
              <div><p className="text-sm font-medium text-gray-900">{t('support.account_issues')}</p><p className="mt-0.5 text-xs text-gray-500">{t('support.account_issues_desc')}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
