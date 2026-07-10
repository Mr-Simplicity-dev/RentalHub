import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { io as socketIO } from 'socket.io-client';
import { FaTimes, FaPaperPlane, FaCommentAlt, FaPaperclip, FaFile, FaArrowLeft, FaCheckCircle, FaHeadset, FaMicrophone, FaStopCircle, FaCheck } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import useVoiceRecorder from '../../hooks/useVoiceRecorder';
import WidgetErrorBoundary from './WidgetErrorBoundary';

const LS_EMAIL = 'contact_widget_email';
const LS_TICKET_ID = 'contact_widget_ticket_id';
const LS_NAME = 'contact_widget_name';
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg'];

const formatTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ChatBubble = ({ msg, isOwn }) => {
  const isAudio = msg.attachment_type && msg.attachment_type.startsWith('audio/');
  const readAt = msg.read_at ? new Date(msg.read_at) : null;
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isOwn ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
        {!isOwn && msg.author_name && (
          <p className="mb-0.5 text-[10px] font-semibold text-indigo-600">{msg.author_name}</p>
        )}
        {msg.message && <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>}
        {isAudio ? (
          <div className={`mt-1.5 rounded-lg p-1 ${isOwn ? 'bg-indigo-500' : 'bg-slate-200'}`}>
            <audio controls className="w-full h-9" src={msg.attachment_url} preload="none">
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : msg.attachment_url ? (
          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${isOwn ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'} hover:underline`}>
            <FaFile size={10} /> {msg.attachment_name || 'Attachment'}
          </a>
        ) : null}
        <div className={`mt-0.5 flex items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <p className={`text-[10px] ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>
            {formatTime(new Date(msg.created_at))}
          </p>
          {isOwn && readAt && (
            <span className="text-[9px] text-indigo-200" title={`Read ${formatTime(readAt)}`}>
              <FaCheck className="w-2.5 h-2.5" />
            </span>
          )}
          {isOwn && msg._temp && (
            <span className="text-[10px] text-indigo-200 italic">Sending...</span>
          )}
        </div>
      </div>
    </div>
  );
};

const FloatingContactWidget = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  const authRecorder = useVoiceRecorder();
  const contactRecorder = useVoiceRecorder();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState('form');
  const [form, setForm] = useState({ name: '', email: '', state: '', lga: '', subject: '', message: '', priority: 'medium' });
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
  const [sentConfirm, setSentConfirm] = useState(null);
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupTickets, setLookupTickets] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [contactConv, setContactConv] = useState([]);
  const [viewingContactTicket, setViewingContactTicket] = useState(null);

  const listRef = useRef(null);
  const widgetRef = useRef(null);
  const typingTimer = useRef(null);
  const typingThrottleRef = useRef(null);
  const guestTypingThrottleRef = useRef(null);
  const guestSocketRef = useRef(null);
  const activeTicketRef = useRef(null);
  const viewingContactRef = useRef(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const prefersReducedMotion = useReducedMotion();
  const playNotification = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, []);
  // Focus trap
  useEffect(() => {
    if (!open) return;
    const el = widgetRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [open]);
  useEffect(() => {
    return () => {
      clearTimeout(resetTimerRef.current);
      clearTimeout(typingTimer.current);
    };
  }, []);

  const [showGreeting, setShowGreeting] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Greeting bubble: appears while WhatsApp bubble fades out
  useEffect(() => {
    if (open) { setShowGreeting(false); return; }
    const showTimer = setTimeout(() => {
      if (!open) setShowGreeting(true);
    }, 9000); // appears as WhatsApp bubble fades out (fades in at 6s + 3s visible)
    const hideTimer = setTimeout(() => {
      setShowGreeting(false);
    }, 16000); // disappears 7s after appearing
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [open]);

  // Scroll management
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll only if near bottom
  useEffect(() => {
    if (listRef.current && isNearBottom) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [conversation, isNearBottom, contactConv]);

  // Keep ref in sync
  activeTicketRef.current = activeTicket;

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

  // Keyboard accessibility
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Click-outside close
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const handler = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) handleClose();
    };
    const timer = setTimeout(() => { if (mounted) document.addEventListener('mousedown', handler); }, 0);
    return () => { mounted = false; clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [open]);

  // Close other widget on mobile when this opens
  const widgetInstanceId = useRef(`fcw-${Date.now()}`);
  useEffect(() => {
    if (!open) return;
    if (window.innerWidth < 640) {
      window.dispatchEvent(new CustomEvent('widget:close-other', { detail: { id: widgetInstanceId.current } }));
    }
  }, [open]);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id !== widgetInstanceId.current) setOpen(false);
    };
    window.addEventListener('widget:close-other', handler);
    return () => window.removeEventListener('widget:close-other', handler);
  }, []);

  // Load locations
  useEffect(() => {
    if (!open || locationsLoaded) return;
    api.get('/property-utils/location-options').then((res) => {
      if (res.data?.success) setLocations(res.data.data || []);
    }).catch(() => { console.warn('Failed to load locations for contact widget'); }).finally(() => setLocationsLoaded(true));
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

  // Socket listeners — using ref to avoid stale closure + race condition
  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const replyHandler = (data) => {
      fetchMyTickets();
      if (!openRef.current) playNotification();
      if (activeTicketRef.current?.id === data.ticketId && data.reply) {
        setConversation((prev) => {
          if (prev.some((r) => r.id === data.reply.id)) return prev;
          return [...prev, data.reply];
        });
      }
    };
    const ticketListHandler = () => {
      fetchMyTickets();
    };
    const typingHandler = (data) => {
      if (activeTicketRef.current?.id === data.ticketId && data.isAdmin) {
        setTypingUser(data);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };
    socket.on('ticket:new_reply', replyHandler);
    socket.on('ticket:created', ticketListHandler);
    socket.on('ticket:updated', ticketListHandler);
    socket.on('ticket:typing', typingHandler);
    return () => {
      socket.off('ticket:new_reply', replyHandler);
      socket.off('ticket:created', ticketListHandler);
      socket.off('ticket:updated', ticketListHandler);
      socket.off('ticket:typing', typingHandler);
    };
  }, [socket, isAuthenticated, fetchMyTickets]);

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

  const validateFile = (file) => {
    if (!file) return null;
    if (file.size > MAX_FILE_SIZE) return t('widget.file_too_large', 'File must be under 15MB');
    if (!ALLOWED_TYPES.includes(file.type)) return t('widget.file_type_not_allowed', 'File type not supported');
    return null;
  };

  const reset = () => {
    authRecorder.reset();
    contactRecorder.reset();
    if (guestSocketRef.current) {
      guestSocketRef.current.disconnect();
      guestSocketRef.current = null;
    }
    setForm({ name: '', email: '', state: '', lga: '', subject: '', message: '', priority: 'medium' });
    setError('');
    setView('form');
    setActiveTicket(null);
    setConversation([]);
    setReplyText('');
    setAttachmentFile(null);
    setTypingUser(null);
    setSentConfirm(null);
    setContactReplyText('');
    setContactReplyFile(null);
    setLookupEmail('');
    setLookupTickets([]);
    setContactConv([]);
    setViewingContactTicket(null);
    setAdminTypingName(null);
    setAdminViewingName(null);
    if (typingPollRef.current) clearInterval(typingPollRef.current);
  };

  const resetTimerRef = useRef(null);
  const handleClose = () => {
    setOpen(false);
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(reset, 300);
  };

  // ── Contact form submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.state || !form.message.trim()) {
      setError(t('widget.fill_required', 'Please fill in name, email, state, and message.'));
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
      setError(err.response?.data?.message || t('widget.send_failed', 'Could not send message.'));
    } finally { setSending(false); }
  };

  // ── Send reply (authenticated) with optimistic update ──
  const handleSendReply = async () => {
    const msg = replyText.trim();
    if (!msg && !attachmentFile) return;
    const tempId = `temp_${Date.now()}`;
    const voiceFile = authRecorder.recordedFile;
    const fileToSend = attachmentFile || voiceFile;
    const optimist = { id: tempId, message: msg, is_admin: false, author_name: user?.full_name, created_at: new Date().toISOString(), _temp: true };
    if (fileToSend) optimist.attachment_name = fileToSend.name;
    setConversation((prev) => [...prev, optimist]);
    setReplyText('');
    setAttachmentFile(null);
    authRecorder.reset();
    setSendingReply(true);
    try {
      const fd = new FormData();
      if (msg) fd.append('message', msg);
      if (fileToSend) fd.append('attachment', fileToSend);
      const res = await api.post(`/support/tickets/${activeTicket.id}/reply`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConversation((prev) => prev.map((r) => r.id === tempId ? { ...res.data.data, _temp: false } : r));
      setSentConfirm('sent');
      setTimeout(() => setSentConfirm(null), 2000);
    } catch (err) {
      setConversation((prev) => prev.filter((r) => r.id !== tempId));
      setError(err.response?.data?.message || t('widget.send_failed', 'Failed to send'));
    } finally { setSendingReply(false); }
  };

  // Throttled typing emit
  const emitTyping = () => {
    if (!socket || !activeTicket) return;
    if (typingThrottleRef.current) return;
    typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null; }, 2000);
    socket.emit('ticket:typing', { ticketId: activeTicket.id });
  };

  // ── Contact lookup (anonymous) ──
  viewingContactRef.current = viewingContactTicket;

  const handleLookup = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    try {
      const res = await api.post('/support/tickets/contact-lookup', { email: lookupEmail.trim() });
      setLookupTickets(res.data?.data || []);
    } catch { setError(t('widget.lookup_failed', 'Could not find tickets. Please check your email.')); } finally { setLookupLoading(false); }
  };

  const viewContactConversation = async (ticket) => {
    setViewingContactTicket(ticket);
    try {
      const res = await api.post('/support/tickets/contact-conversation', { ticketId: ticket.id, email: lookupEmail.trim() });
      setContactConv(res.data?.data || []);
    } catch { setError(t('widget.conversation_failed', 'Could not load conversation.')); }
  };

  const [contactReplyText, setContactReplyText] = useState('');
  const [contactReplyFile, setContactReplyFile] = useState(null);
  const [sendingContactReply, setSendingContactReply] = useState(false);
  const [adminTypingName, setAdminTypingName] = useState(null);
  const [adminViewingName, setAdminViewingName] = useState(null);
  const typingPollRef = useRef(null);

  // Poll admin typing/viewing status for anonymous contact conversation
  useEffect(() => {
    if (!viewingContactTicket || !lookupEmail.trim()) {
      setAdminTypingName(null);
      setAdminViewingName(null);
      return;
    }
    const poll = async () => {
      try {
        const res = await api.get(`/support/tickets/${viewingContactTicket.id}/typing-status`, {
          params: { email: lookupEmail.trim() },
        });
        setAdminTypingName(res.data?.typing?.userName || null);
        setAdminViewingName(res.data?.viewing?.userName || null);
      } catch {}
    };
    poll();
    typingPollRef.current = setInterval(poll, 3000);
    return () => { clearInterval(typingPollRef.current); };
  }, [viewingContactTicket, lookupEmail]);

  // Guest socket — stable deps using ref
  useEffect(() => {
    if (!viewingContactTicket || !lookupEmail.trim()) {
      if (guestSocketRef.current) {
        guestSocketRef.current.disconnect();
        guestSocketRef.current = null;
      }
      return;
    }
    const baseUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '').replace(/\/api\/?$/, '') || undefined;
    const gs = socketIO(baseUrl ? `${baseUrl}/guest` : '/guest', {
      auth: { ticketId: viewingContactTicket.id, email: lookupEmail.trim() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    guestSocketRef.current = gs;
    gs.on('ticket:new_reply', (data) => {
      if (!data.reply || !data.reply.is_admin) return;
      setContactConv((prev) => {
        if (prev.some((r) => r.id === data.reply.id)) return prev;
        return [...prev, data.reply];
      });
    });
    gs.on('ticket:typing', (data) => {
      if (!data.isAdmin) return;
      setAdminTypingName(data.userName || t('widget.support_team', 'Support'));
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setAdminTypingName(null), 3000);
    });
    return () => {
      gs.disconnect();
      if (guestSocketRef.current === gs) guestSocketRef.current = null;
    };
  }, [viewingContactTicket?.id, lookupEmail]);

  const handleContactReply = async () => {
    const msg = contactReplyText.trim();
    const voiceFile = contactRecorder.recordedFile;
    const fileToSend = contactReplyFile || voiceFile;
    if (!msg && !fileToSend) return;
    setSendingContactReply(true);
    try {
      const fd = new FormData();
      fd.append('ticketId', viewingContactTicket.id);
      fd.append('email', lookupEmail.trim());
      if (msg) fd.append('message', msg);
      if (fileToSend) fd.append('attachment', fileToSend);
      const res = await api.post('/support/tickets/contact-reply', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setContactConv((prev) => [...prev, res.data.data]);
      setContactReplyText('');
      setContactReplyFile(null);
      contactRecorder.reset();
    } catch (err) {
      setError(err.response?.data?.message || t('widget.send_failed', 'Failed to send'));
    } finally { setSendingContactReply(false); }
  };

  // ── Render ──
  const renderHeader = () => (
    <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 text-white">
      <div className="flex items-center gap-2">
        {view !== 'form' && view !== 'success' && (
          <button onClick={() => { setView(isAuthenticated ? 'tickets' : 'form'); setActiveTicket(null); setConversation([]); setContactConv([]); setViewingContactTicket(null); }} className="text-white/80 hover:text-white p-0.5" aria-label={t('widget.back', 'Back')}>
            <FaArrowLeft size={14} />
          </button>
        )}
        <FaHeadset size={16} />
        <div>
          <p className="text-sm font-semibold">{t('widget.support_title', 'RentalHub Support')}</p>
          <p className="text-[10px] text-indigo-200">{t('widget.reply_minutes', 'We typically reply within minutes')}</p>
        </div>
      </div>
      <button onClick={handleClose} className="text-white/80 hover:text-white p-1" aria-label={t('widget.close', 'Close')}><FaTimes /></button>
    </div>
  );

  const fileInput = (onFile, currentFile, isRecording) => (
    <>
      {currentFile && !isRecording && (
        <div className="mb-1 flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
          <FaPaperclip size={8} /> {currentFile.name}
          <button onClick={() => onFile(null)} className="ml-auto text-red-500"><FaTimes size={8} /></button>
        </div>
      )}
      <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0">
        <FaPaperclip size={12} />
        <input type="file" className="hidden" onChange={(e) => {
          const f = e.target.files[0];
          const err = validateFile(f);
          if (err) { setError(err); return; }
          onFile(f);
        }} />
      </label>
    </>
  );

  const voiceButton = (recorder, onFile) => {
    if (recorder.isRecording) {
      return (
        <button onClick={recorder.stop}
          className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 shrink-0">
          <FaStopCircle size={14} />
        </button>
      );
    }
    return (
      <button onClick={async () => {
        try {
          await recorder.start();
        } catch (err) {
          setError(err.message);
        }
      }}
        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0"
        title={t('widget.record_voice', 'Record voice message')}>
        <FaMicrophone size={12} />
      </button>
    );
  };

  const replyInput = (value, onChange, onSend, sending, recorder, file, setFile) => (
    <div className="border-t border-slate-200 p-3">
      {recorder.isRecording && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          {t('widget.recording', 'Recording...')} {recorder.formatDuration(recorder.duration)}
          <button onClick={recorder.stop} className="ml-auto flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 text-white hover:bg-red-600">
            <FaStopCircle size={10} /> {t('widget.stop', 'Stop')}
          </button>
        </div>
      )}
      {file && !recorder.isRecording && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
          <FaPaperclip size={10} /> {file.name}
          <button onClick={() => setFile(null)} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={10} /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {!file && <>{fileInput(setFile, file, recorder.isRecording)}</>}
        {!recorder.isRecording && !file && (
          <textarea value={value} onChange={(e) => { onChange(e.target.value); if (emitTyping) emitTyping(); }}
            placeholder={t('widget.type_message', 'Type your message...')} rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
        )}
        {recorder.isRecording && <div className="flex-1" />}
        {voiceButton(recorder, setFile)}
        <button onClick={onSend} disabled={(!value.trim() && !file && !recorder.recordedFile) || sending}
          className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shrink-0">
          {sending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={12} />}
        </button>
      </div>
    </div>
  );

  return (
    <WidgetErrorBoundary name="FloatingContactWidget">
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {!open && showGreeting && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative bg-white rounded-xl shadow-xl p-3 max-w-[220px]"
            >
              <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-white rotate-45" />
              <p className="text-sm text-gray-700 font-medium">{t('widget.need_help', 'Need help? Chat with us!')}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => { setOpen((p) => !p); setShowGreeting(false); }}
          className={`tour-support-widget flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 ${!open ? 'animate-bounce' : ''}`}
          aria-label={t('widget.contact_support', 'Contact support')}
        >
          {unreadCount > 0 && !open && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{unreadCount}</span>
          )}
          {open ? <FaTimes className="w-5 h-5" /> : <FaCommentAlt className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={widgetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('widget.support_title', 'RentalHub Support')}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            style={{ maxHeight: '480px' }}
          >
          {renderHeader()}

          <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={listRef}>
            {/* ─── FORM VIEW (anonymous/fallback) ─── */}
            {view === 'form' && !isAuthenticated && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className="text-xs text-slate-500">{t('widget.fill_form', "Fill this form and we'll get back to you via email.")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.name', 'Name')} *</label>
                    <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                      placeholder={t('widget.your_name', 'Your name')} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.email', 'Email')} *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                      placeholder="you@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.state', 'State')} *</label>
                  <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, lga: '' }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    <option value="">{t('widget.select_state', 'Select state')}</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {lgas.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">LGA</label>
                    <select value={form.lga} onChange={(e) => setForm((p) => ({ ...p, lga: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                      <option value="">{t('widget.select_lga', 'Select LGA')}</option>
                      {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.subject', 'Subject')}</label>
                  <input type="text" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    placeholder={t('widget.how_can_we_help', 'How can we help?')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.priority', 'Priority')}</label>
                  <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                    <option value="medium">{t('widget.medium', 'Medium')}</option>
                    <option value="low">{t('widget.low', 'Low')}</option>
                    <option value="high">{t('widget.high', 'High')}</option>
                    <option value="urgent">{t('widget.urgent', 'Urgent')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.message', 'Message')} *</label>
                  <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none"
                    placeholder={t('widget.tell_us_more', 'Tell us more...')} />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button type="submit" disabled={sending}
                  className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition">
                  {sending ? t('widget.sending', 'Sending...') : <><FaPaperPlane className="w-3.5 h-3.5" /> {t('widget.send_message', 'Send message')}</>}
                </button>
                <button type="button" onClick={() => { setView('check-status'); setLookupEmail(localStorage.getItem(LS_EMAIL) || ''); }}
                  className="w-full text-center text-xs text-indigo-600 hover:underline">
                  {t('widget.check_status', 'Already contacted us? Check your ticket status')}
                </button>
              </form>
            )}

            {/* ─── FORM VIEW (authenticated, no tickets) ─── */}
            {view === 'form' && isAuthenticated && (
              <div className="py-2 text-left">
                <p className="text-sm text-slate-600 mb-3 font-medium">{t('widget.start_conversation', 'Start a new conversation')}</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                      <span className="text-slate-400">{t('widget.name', 'Name')}</span>
                      <p className="text-slate-800 font-medium truncate">{user?.full_name || form.name}</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                      <span className="text-slate-400">{t('widget.email', 'Email')}</span>
                      <p className="text-slate-800 truncate">{user?.email || form.email}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.state', 'State')} *</label>
                    <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, lga: '' }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                      <option value="">{t('widget.select_state', 'Select state')}</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {lgas.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">LGA</label>
                      <select value={form.lga} onChange={(e) => setForm((p) => ({ ...p, lga: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                        <option value="">{t('widget.select_lga', 'Select LGA')}</option>
                        {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  )}
                  <input type="text" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder={t('widget.subject_optional', 'Subject (optional)')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                  <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} rows={3}
                    placeholder={t('widget.how_can_we_help', 'How can we help you?')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none" />
                  <div className="pt-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('widget.priority', 'Priority')}</label>
                    <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                      <option value="medium">{t('widget.medium', 'Medium')}</option>
                      <option value="low">{t('widget.low', 'Low')}</option>
                      <option value="high">{t('widget.high', 'High')}</option>
                      <option value="urgent">{t('widget.urgent', 'Urgent')}</option>
                    </select>
                  </div>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <button onClick={async () => {
                    if (!form.state) { setError(t('widget.select_state_error', 'Please select your state.')); return; }
                    if (!form.message.trim()) { setError(t('widget.write_message_error', 'Please write a message.')); return; }
                    setSending(true); setError('');
                    try {
                      const payload = {
                        subject: form.subject?.trim() || 'Support request',
                        description: form.message.trim(),
                        state: form.state,
                        lga: form.lga || undefined,
                        priority: form.priority,
                      };
                      const res = await api.post('/support/tickets', payload);
                      localStorage.setItem(LS_TICKET_ID, String(res.data?.data?.id || ''));
                      openTicketChat(res.data?.data);
                    } catch (err) { setError(err.response?.data?.message || t('widget.create_failed', 'Failed to create ticket')); }
                    finally { setSending(false); }
                  }} disabled={sending}
                    className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                    {sending ? t('widget.creating', 'Creating...') : <><FaPaperPlane className="w-3.5 h-3.5" /> {t('widget.start_conversation_btn', 'Start conversation')}</>}
                  </button>
                </div>
              </div>
            )}

            {/* ─── SUCCESS VIEW ─── */}
            {view === 'success' && (
              <div className="flex flex-col items-center py-4 text-center">
                <FaCheckCircle className="text-green-500 text-4xl mb-3" />
                <p className="font-semibold text-slate-900">{t('widget.message_sent', 'Message sent!')}</p>
                <p className="text-sm text-slate-600 mt-1">{t('widget.will_reply', "We'll get back to you shortly.")}</p>
                {localStorage.getItem(LS_TICKET_ID) && (
                  <p className="mt-2 text-xs text-slate-400">{t('widget.ticket', 'Ticket')} #<span className="font-mono">{localStorage.getItem(LS_TICKET_ID)}</span></p>
                )}
                <button onClick={handleClose} className="mt-4 text-sm text-indigo-600 hover:underline">{t('widget.close_btn', 'Close')}</button>
                {sentConfirm && (
                  <p className="mt-2 text-xs text-green-600 flex items-center gap-1"><FaCheck size={10} /> {t('widget.sent', 'Sent!')}</p>
                )}
              </div>
            )}

            {/* ─── TICKET LIST (authenticated) ─── */}
            {view === 'tickets' && isAuthenticated && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('widget.your_tickets', 'Your Tickets')}</p>
                {loadingTickets ? (
                  <div className="space-y-2 py-2">
                    {[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-500 mb-3">{t('widget.no_tickets', 'No tickets yet.')}</p>
                    <button onClick={() => setView('form')} className="text-sm text-indigo-600 hover:underline">{t('widget.start_new', 'Start a new conversation')}</button>
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
                        <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{ticket.unread_admin_replies} {t('widget.new', 'new')}</span>
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
                  <div className="space-y-3 py-2">
                    {[1,2].map((i) => <div key={i} className={`h-12 rounded-xl bg-slate-100 animate-pulse ${i % 2 === 0 ? 'ml-12' : 'mr-12'}`} />)}
                  </div>
                ) : (
                  <>
                    {conversation.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('widget.no_messages', 'No messages yet.')}</p>}
                    {conversation.map((reply) => (
                      <ChatBubble key={reply.id} msg={reply} isOwn={!reply.is_admin} />
                    ))}
                    {typingUser && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400 italic">
                          {typingUser.userName} {t('widget.is_typing', 'is typing...')}
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
                <p className="text-xs text-slate-500">{t('widget.enter_email', 'Enter the email you used to contact us.')}</p>
                <input type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                <button onClick={handleLookup} disabled={lookupLoading}
                  className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                  {lookupLoading ? t('widget.searching', 'Searching...') : t('widget.lookup', 'Check Tickets Status')}
                </button>
                {lookupTickets.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase">{t('widget.your_tickets', 'Your tickets')}</p>
                    {lookupTickets.map((ticket) => (
                      <div key={ticket.id}>
                        <button onClick={() => viewContactConversation(ticket)}
                          className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-indigo-300 transition">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-900 truncate">{ticket.subject}</p>
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              ticket.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>{ticket.status}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">{new Date(ticket.created_at).toLocaleDateString()}</p>
                        </button>
                        {viewingContactTicket?.id === ticket.id && (
                          <div className="mt-2 space-y-2 pl-2 border-l-2 border-indigo-300">
                            {contactConv.length === 0 ? <p className="text-xs text-slate-400">{t('widget.no_replies', 'No replies yet.')}</p> : (
                              contactConv.map((r) => (
                                <div key={r.id} className={`rounded-xl px-3 py-2 text-sm ${r.is_admin ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50'}`}>
                                  {r.is_admin && <p className="text-[10px] font-semibold text-indigo-600 mb-0.5">{r.author_name || 'Support'}</p>}
                                  <p className="text-slate-700">{r.message}</p>
                                  {r.attachment_url && r.attachment_type && r.attachment_type.startsWith('audio/') ? (
                                    <div className="mt-1 rounded-lg bg-slate-200 p-1">
                                      <audio controls className="w-full h-8" src={r.attachment_url} preload="none" />
                                    </div>
                                  ) : r.attachment_url ? (
                                    <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300">
                                      <FaFile size={10} /> {r.attachment_name || 'Attachment'}
                                    </a>
                                  ) : null}
                                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(r.created_at).toLocaleString()}</p>
                                </div>
                              ))
                            )}
                            {adminViewingName && (
                              <p className="text-[10px] text-green-600 italic flex items-center gap-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                                {adminViewingName} {t('widget.is_viewing', 'is viewing this conversation')}
                              </p>
                            )}
                            {adminTypingName && (
                              <p className="text-[10px] text-indigo-600 italic flex items-center gap-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                {adminTypingName} {t('widget.is_typing', 'is typing...')}
                              </p>
                            )}
                            {/* Reply input for anonymous contact */}
                            <div className="mt-2 border-t border-indigo-200 pt-2">
                              {contactRecorder.isRecording && (
                                <div className="mb-1 flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                  {t('widget.recording', 'Recording...')} {contactRecorder.formatDuration(contactRecorder.duration)}
                                  <button onClick={contactRecorder.stop} className="ml-auto flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-white hover:bg-red-600">
                                    <FaStopCircle size={8} /> {t('widget.stop', 'Stop')}
                                  </button>
                                </div>
                              )}
                              {contactReplyFile && !contactRecorder.isRecording && (
                                <div className="mb-1 flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                  <FaPaperclip size={8} /> {contactReplyFile.name}
                                  <button onClick={() => setContactReplyFile(null)} className="ml-auto text-red-500"><FaTimes size={8} /></button>
                                </div>
                              )}
                              <div className="flex items-end gap-1.5">
                                <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded border border-slate-300 text-slate-400 hover:bg-slate-50 shrink-0">
                                  <FaPaperclip size={10} />
                                  <input type="file" className="hidden" onChange={(e) => {
                                    const f = e.target.files[0];
                                    const err = validateFile(f);
                                    if (err) { setError(err); return; }
                                    setContactReplyFile(f);
                                  }} />
                                </label>
                                <textarea value={contactReplyText} onChange={(e) => { setContactReplyText(e.target.value); if (!guestTypingThrottleRef.current) { guestTypingThrottleRef.current = setTimeout(() => { guestTypingThrottleRef.current = null; }, 2000); guestSocketRef.current?.emit('ticket:typing', { ticketId: viewingContactTicket?.id, email: lookupEmail }); } }}
                                  placeholder={t('widget.type_reply', 'Type a reply...')} rows={1}
                                  className="flex-1 resize-none rounded border border-slate-300 px-2 py-2 text-xs outline-none focus:border-indigo-400"
                                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleContactReply(); } }} />
                                {contactRecorder.isRecording ? (
                                  <button onClick={contactRecorder.stop}
                                    className="flex h-[36px] w-[36px] items-center justify-center rounded bg-red-500 text-white hover:bg-red-600 shrink-0">
                                    <FaStopCircle size={10} />
                                  </button>
                                ) : (
                                  <button onClick={async () => {
                                    try { await contactRecorder.start(); }
                                    catch (err) { setError(err.message); }
                                  }}
                                    className="flex h-[36px] w-[36px] items-center justify-center rounded border border-slate-300 text-slate-400 hover:bg-slate-50 shrink-0"
                                    title={t('widget.record_voice', 'Record voice message')}>
                                    <FaMicrophone size={10} />
                                  </button>
                                )}
                                <button onClick={handleContactReply} disabled={(!contactReplyText.trim() && !contactReplyFile && !contactRecorder.recordedFile) || sendingContactReply}
                                  className="flex h-[36px] w-[36px] items-center justify-center rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                                  {sendingContactReply ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={10} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {lookupTickets.length === 0 && !lookupLoading && lookupEmail.trim() && (
                  <p className="text-xs text-slate-400 text-center">{t('widget.no_tickets_email', 'No tickets found for this email.')}</p>
                )}
                <button onClick={() => setView('form')} className="w-full text-center text-xs text-indigo-600 hover:underline">{t('widget.start_new', 'Start a new conversation')}</button>
              </div>
            )}
          </div>

          {/* ─── REPLY INPUT (authenticated conversation) ─── */}
          {view === 'conversation' && activeTicket && activeTicket.status !== 'resolved' && (
            <div className="border-t border-slate-200 p-3">
              {authRecorder.isRecording && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  {t('widget.recording', 'Recording...')} {authRecorder.formatDuration(authRecorder.duration)}
                  <button onClick={authRecorder.stop} className="ml-auto flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 text-white hover:bg-red-600">
                    <FaStopCircle size={10} /> {t('widget.stop', 'Stop')}
                  </button>
                </div>
              )}
              {attachmentFile && !authRecorder.isRecording && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
                  <FaPaperclip size={10} /> {attachmentFile.name}
                  <button onClick={() => setAttachmentFile(null)} className="ml-auto text-red-500 hover:text-red-700"><FaTimes size={10} /></button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0">
                  <FaPaperclip size={12} />
                  <input type="file" className="hidden" onChange={(e) => {
                    const f = e.target.files[0];
                    const err = validateFile(f);
                    if (err) { setError(err); return; }
                    setAttachmentFile(f);
                  }} />
                </label>
                {authRecorder.isRecording ? (
                  <div className="flex-1" />
                ) : (
                  <textarea value={replyText} onChange={(e) => { setReplyText(e.target.value); emitTyping(); }}
                    placeholder={t('widget.type_message', 'Type your message...')} rows={1}
                    className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} />
                )}
                {authRecorder.isRecording ? (
                  <button onClick={authRecorder.stop}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 shrink-0">
                    <FaStopCircle size={14} />
                  </button>
                ) : (
                  <button onClick={async () => {
                    try { await authRecorder.start(); }
                    catch (err) { setError(err.message); }
                  }}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 shrink-0"
                    title={t('widget.record_voice', 'Record voice message')}>
                    <FaMicrophone size={12} />
                  </button>
                )}
                <button onClick={handleSendReply} disabled={(!replyText.trim() && !attachmentFile && !authRecorder.recordedFile) || sendingReply}
                  className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                  {sendingReply ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FaPaperPlane size={12} />}
                </button>
              </div>
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </WidgetErrorBoundary>
  );
};

export default FloatingContactWidget;
