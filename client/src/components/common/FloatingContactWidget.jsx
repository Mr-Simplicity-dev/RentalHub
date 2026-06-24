import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FaTimes, FaPaperPlane, FaCommentAlt, FaPaperclip, FaFile, FaArrowLeft, FaCheckCircle, FaHeadset, FaGlobeAfrica } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';

const LS_EMAIL = 'contact_widget_email';
const LS_TICKET_ID = 'contact_widget_ticket_id';
const LS_NAME = 'contact_widget_name';

const ChatBubble = ({ msg, isOwn }) => (
  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isOwn ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
      {!isOwn && msg.author_name && (
        <p className="mb-0.5 text-[10px] font-semibold text-indigo-600">{msg.author_name}</p>
      )}
      <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
      {msg.attachment_url && (
        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${isOwn ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'} hover:underline`}>
          <FaFile size={10} /> {msg.attachment_name || 'Attachment'}
        </a>
      )}
      <p className={`mt-0.5 text-[10px] ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  </div>
);

const FloatingContactWidget = () => {
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('form'); // 'form' | 'tickets' | 'conversation' | 'success' | 'check-status'
  const [form, setForm] = useState({ name: '', email: '', state: '', lga: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const listRef = useRef(null);
  const widgetRef = useRef(null);
  const typingTimer = useRef(null);

  // Restore identity
  useEffect(() => {
    const savedEmail = localStorage.getItem(LS_EMAIL);
    const savedName = localStorage.getItem(LS_NAME);
    if (isAuthenticated && user) {
      setForm((p) => ({ ...p, name: user.full_name || '', email: user.email || '' }));
    } else if (savedEmail) {
      setForm((p) => ({ ...p, email: savedEmail, name: savedName || '' }));
    }
  }, [isAuthenticated, user]);

  // Click-outside close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) handleClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Load locations
  useEffect(() => {
    if (!open || locationsLoaded) return;
    api.get('/property-utils/location-options').then((res) => {
      if (res.data?.success) setLocations(res.data.data || []);
    }).catch(() => {}).finally(() => setLocationsLoaded(true));
  }, [open, locationsLoaded]);

  const states = useMemo(() => {
    if (locations.length > 0) return locations.map((l) => l.state_name).filter(Boolean);
    return [];
  }, [locations]);

  const selectedState = useMemo(() => {
    const s = String(form.state || '').trim().toLowerCase();
    return locations.find((l) => String(l.state_name || '').trim().toLowerCase() === s);
  }, [locations, form.state]);

  const lgas = selectedState?.lgas || [];

  // Fetch tickets on open for authenticated users
  const fetchMyTickets = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingTickets(true);
    try {
      const res = await api.get('/support/tickets/my');
      setTickets(res.data?.data || []);
    } catch {} finally { setLoadingTickets(false); }
  }, [isAuthenticated]);

  useEffect(() => {
    if (open && isAuthenticated) fetchMyTickets();
  }, [open, isAuthenticated, fetchMyTickets]);

  // Unread count polling for authenticated
  useEffect(() => {
    if (!isAuthenticated || !open) return;
    const fetchUnread = async () => {
      try {
        const res = await api.get('/support/tickets/unread/count');
        setUnreadCount(res.data?.count || 0);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, open]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const replyHandler = (data) => {
      if (activeTicket?.id === data.ticketId) loadConversation(data.ticketId);
    };
    socket.on('ticket:new_reply', replyHandler);
    const typingHandler = (data) => {
      if (activeTicket?.id === data.ticketId && data.isAdmin) {
        setTypingUser(data);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };
    socket.on('ticket:typing', typingHandler);
    return () => {
      socket.off('ticket:new_reply', replyHandler);
      socket.off('ticket:typing', typingHandler);
    };
  }, [socket, isAuthenticated, activeTicket]);

  const loadConversation = useCallback(async (ticketId) => {
    setLoadingConv(true);
    try {
      const res = await api.get(`/support/tickets/${ticketId}/conversation?limit=200`);
      setConversation(res.data?.data || []);
    } catch { setConversation([]); } finally { setLoadingConv(false); }
  }, []);

  const openTicketChat = (ticket) => {
    setActiveTicket(ticket);
    setView('conversation');
    loadConversation(ticket.id);
  };

  const reset = () => {
    setForm({ name: '', email: '', state: '', lga: '', subject: '', message: '' });
    setError('');
    setView('form');
    setActiveTicket(null);
    setConversation([]);
    setReplyText('');
    setAttachmentFile(null);
    setTypingUser(null);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(reset, 300);
  };

  // Auto-scroll conversation
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [conversation]);

  // ── Contact form submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.state || !form.message.trim()) {
      setError('Please fill in name, email, state, and message.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await api.post('/support/contact', form);
      localStorage.setItem(LS_EMAIL, form.email.trim());
      localStorage.setItem(LS_NAME, form.name.trim());
      localStorage.setItem(LS_TICKET_ID, String(res.data?.data?.ticketId || ''));
      setView('success');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send message.');
    } finally { setSending(false); }
  };

  // ── Send reply (authenticated) ──
  const handleSendReply = async () => {
    const msg = replyText.trim();
    if (!msg && !attachmentFile) return;
    setSendingReply(true);
    try {
      const fd = new FormData();
      if (msg) fd.append('message', msg);
      if (attachmentFile) fd.append('attachment', attachmentFile);
      const res = await api.post(`/support/tickets/${activeTicket.id}/reply`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConversation((prev) => [...prev, res.data.data]);
      setReplyText('');
      setAttachmentFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send');
    } finally { setSendingReply(false); }
  };

  const emitTyping = () => {
    if (!socket || !activeTicket) return;
    socket.emit('ticket:typing', { ticketId: activeTicket.id });
  };

  // ── Contact lookup (anonymous) ──
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupTickets, setLookupTickets] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [contactConv, setContactConv] = useState([]);
  const [viewingContactTicket, setViewingContactTicket] = useState(null);

  const handleLookup = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    try {
      const res = await api.post('/support/tickets/contact-lookup', { email: lookupEmail.trim() });
      setLookupTickets(res.data?.data || []);
    } catch {} finally { setLookupLoading(false); }
  };

  const viewContactConversation = async (ticket) => {
    setViewingContactTicket(ticket);
    try {
      const res = await api.post('/support/tickets/contact-conversation', { ticketId: ticket.id, email: lookupEmail.trim() });
      setContactConv(res.data?.data || []);
    } catch {}
  };

  // ── Render ──
  const renderHeader = (title) => (
    <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 text-white">
      <div className="flex items-center gap-2">
        {view !== 'form' && view !== 'success' && (
          <button onClick={() => { setView(isAuthenticated ? 'tickets' : 'form'); setActiveTicket(null); setConversation([]); setContactConv([]); setViewingContactTicket(null); }} className="text-white/80 hover:text-white p-0.5">
            <FaArrowLeft size={14} />
          </button>
        )}
        <FaHeadset size={16} />
        <div>
          <p className="text-sm font-semibold">RentalHub Support</p>
          <p className="text-[10px] text-indigo-200">We typically reply within minutes</p>
        </div>
      </div>
      <button onClick={handleClose} className="text-white/80 hover:text-white p-1"><FaTimes /></button>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen((p) => !p)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all duration-300 hover:scale-110 hover:shadow-xl"
        aria-label="Contact support"
      >
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{unreadCount}</span>
        )}
        <FaCommentAlt className="w-5 h-5" />
      </button>

      {open && (
        <div ref={widgetRef} className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: '560px', animation: 'slideUp 0.25s ease-out' }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {renderHeader()}

          <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={listRef}>
            {/* ─── FORM VIEW (anonymous/fallback) ─── */}
            {view === 'form' && !isAuthenticated && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className="text-xs text-slate-500">Fill this form and we'll get back to you via email.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                    <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                      placeholder="Your name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                      placeholder="you@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State *</label>
                  <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, lga: '' }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    <option value="">Select state</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {lgas.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">LGA</label>
                    <select value={form.lga} onChange={(e) => setForm((p) => ({ ...p, lga: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                      <option value="">Select LGA</option>
                      {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                  <input type="text" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    placeholder="How can we help?" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none"
                    placeholder="Tell us more..." />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button type="submit" disabled={sending}
                  className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition">
                  {sending ? 'Sending...' : <><FaPaperPlane className="w-3.5 h-3.5" /> Send message</>}
                </button>
                <button type="button" onClick={() => { setView('check-status'); setLookupEmail(localStorage.getItem(LS_EMAIL) || ''); }}
                  className="w-full text-center text-xs text-indigo-600 hover:underline">
                  Already contacted us? Check your ticket status
                </button>
              </form>
            )}

            {/* ─── FORM VIEW (authenticated, no tickets) ─── */}
            {view === 'form' && isAuthenticated && (
              <div className="py-2 text-left">
                <p className="text-sm text-slate-600 mb-3 font-medium">Start a new conversation</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                      <span className="text-slate-400">Name</span>
                      <p className="text-slate-800 font-medium truncate">{user?.full_name || form.name}</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                      <span className="text-slate-400">Email</span>
                      <p className="text-slate-800 truncate">{user?.email || form.email}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">State *</label>
                    <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, lga: '' }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                      <option value="">Select state</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {lgas.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">LGA</label>
                      <select value={form.lga} onChange={(e) => setForm((p) => ({ ...p, lga: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                        <option value="">Select LGA</option>
                        {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  )}
                  <input type="text" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="Subject (optional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                  <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} rows={3}
                    placeholder="How can we help you?"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none" />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <button onClick={async () => {
                    if (!form.state) { setError('Please select your state.'); return; }
                    if (!form.message.trim()) { setError('Please write a message.'); return; }
                    setSending(true); setError('');
                    try {
                      const payload = {
                        subject: form.subject?.trim() || 'Support request',
                        description: form.message.trim(),
                        state: form.state,
                        lga: form.lga || undefined,
                      };
                      const res = await api.post('/support/tickets', payload);
                      localStorage.setItem(LS_TICKET_ID, String(res.data?.data?.id || ''));
                      openTicketChat(res.data?.data);
                    } catch (err) { setError(err.response?.data?.message || 'Failed to create ticket'); }
                    finally { setSending(false); }
                  }} disabled={sending}
                    className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                    {sending ? 'Creating...' : <><FaPaperPlane className="w-3.5 h-3.5" /> Start conversation</>}
                  </button>
                </div>
              </div>
            )}

            {/* ─── SUCCESS VIEW ─── */}
            {view === 'success' && (
              <div className="flex flex-col items-center py-4 text-center">
                <FaCheckCircle className="text-green-500 text-4xl mb-3" />
                <p className="font-semibold text-slate-900">Message sent!</p>
                <p className="text-sm text-slate-600 mt-1">We'll get back to you shortly.</p>
                {localStorage.getItem(LS_TICKET_ID) && (
                  <p className="mt-2 text-xs text-slate-400">Ticket #<span className="font-mono">{localStorage.getItem(LS_TICKET_ID)}</span></p>
                )}
                <button onClick={handleClose} className="mt-4 text-sm text-indigo-600 hover:underline">Close</button>
              </div>
            )}

            {/* ─── TICKET LIST (authenticated) ─── */}
            {view === 'tickets' && isAuthenticated && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Tickets</p>
                {loadingTickets ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading...</p>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-500 mb-3">No tickets yet.</p>
                    <button onClick={() => setView('form')} className="text-sm text-indigo-600 hover:underline">Start a new conversation</button>
                  </div>
                ) : (
                  tickets.map((ticket) => (
                    <button key={ticket.id} onClick={() => openTicketChat(ticket)}
                      className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900 truncate flex-1">{ticket.subject}</p>
                        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          ticket.status === 'open' ? 'bg-amber-100 text-amber-700' :
                          ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>{ticket.status?.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">#{ticket.id} &middot; {new Date(ticket.created_at).toLocaleDateString()}</p>
                      {ticket.unread_admin_replies > 0 && (
                        <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{ticket.unread_admin_replies} new</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ─── CONVERSATION VIEW (authenticated) ─── */}
            {view === 'conversation' && activeTicket && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 truncate">{activeTicket.subject}</p>
                {loadingConv ? (
                  <div className="py-4 text-center text-sm text-slate-400">Loading messages...</div>
                ) : (
                  <>
                    {conversation.map((reply) => (
                      <ChatBubble key={reply.id} msg={reply} isOwn={!reply.is_admin} />
                    ))}
                    {typingUser && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400 italic">
                          {typingUser.userName} is typing...
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ─── CHECK STATUS (anonymous) ─── */}
            {view === 'check-status' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Enter the email you used to contact us.</p>
                <input type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                <button onClick={handleLookup} disabled={lookupLoading}
                  className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                  {lookupLoading ? 'Searching...' : 'Look up my tickets'}
                </button>
                {lookupTickets.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Your tickets</p>
                    {lookupTickets.map((t) => (
                      <div key={t.id}>
                        <button onClick={() => viewContactConversation(t)}
                          className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-indigo-300 transition">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-900 truncate">{t.subject}</p>
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              t.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>{t.status}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">{new Date(t.created_at).toLocaleDateString()}</p>
                        </button>
                        {viewingContactTicket?.id === t.id && (
                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-indigo-300">
                            {contactConv.length === 0 ? <p className="text-xs text-slate-400">No replies yet.</p> : (
                              contactConv.map((r) => (
                                <div key={r.id} className={`rounded-xl px-3 py-2 text-sm ${r.is_admin ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50'}`}>
                                  {r.is_admin && <p className="text-[10px] font-semibold text-indigo-600 mb-0.5">{r.author_name || 'Support'}</p>}
                                  <p className="text-slate-700">{r.message}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(r.created_at).toLocaleString()}</p>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {lookupTickets.length === 0 && !lookupLoading && lookupEmail.trim() && (
                  <p className="text-xs text-slate-400 text-center">No tickets found for this email.</p>
                )}
                <button onClick={() => setView('form')} className="w-full text-center text-xs text-indigo-600 hover:underline">Start a new conversation</button>
              </div>
            )}
          </div>

          {/* ─── REPLY INPUT (conversation view only) ─── */}
          {view === 'conversation' && activeTicket && activeTicket.status !== 'resolved' && (
            <div className="border-t border-slate-200 p-3">
              {attachmentFile && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
                  <FaPaperclip size={10} /> {attachmentFile.name}
                  <button onClick={() => setAttachmentFile(null)} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={10} /></button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0">
                  <FaPaperclip size={12} />
                  <input type="file" className="hidden" onChange={(e) => setAttachmentFile(e.target.files[0])} />
                </label>
                <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); emitTyping(); }}
                  placeholder="Type your message..." rows={1}
                  className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
                <button onClick={handleSendReply} disabled={(!replyText.trim() && !attachmentFile) || sendingReply}
                  className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                  {sendingReply ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default FloatingContactWidget;
