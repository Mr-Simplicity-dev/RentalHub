import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { messageService } from '../services/messageService';
import { toast } from 'react-toastify';
import BackToDashboard from '../components/common/BackToDashboard';
import { useTranslation } from 'react-i18next';
import { FaMicrophone, FaPaperclip, FaFile, FaTimes } from 'react-icons/fa';

const PHONE_DIGIT_RE = /(?:\+?234[\s\-.]?0?|0)[789]\d[\s\-.]?\d{3}[\s\-.]?\d{3}[\s\-.]?\d{3,4}|\b0\d{10}\b|\+\d{1,3}[\s\-.]?\d{4,}[\s\-.]?\d{4,}/;
const WORD_NUM = { zero:0,oh:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9 };
const WORD_SET = new Set(Object.keys(WORD_NUM));

const detectPhone = (text) => {
  if (!text) return false;
  if (PHONE_DIGIT_RE.test(text)) return true;
  const tokens = text.toLowerCase().split(/[\s,;:!?()]+/).filter(Boolean);
  let buf = [];
  for (const t of tokens) {
    if (WORD_SET.has(t) || /^\d+$/.test(t)) {
      buf.push(WORD_SET.has(t) ? String(WORD_NUM[t]) : t);
      if (buf.length > 15) buf.shift();
      const s = buf.join('');
      if (/^0[789]\d{9}$/.test(s) || /^\d{11,15}$/.test(s)) return true;
    } else {
      const s = buf.join('');
      if ((/^0[789]\d{9}$/.test(s) || /^\d{11,15}$/.test(s)) && buf.length >= 10) return true;
      buf = [];
    }
  }
  const s = buf.join('');
  return (/^0[789]\d{9}$/.test(s) || /^\d{11,15}$/.test(s)) && buf.length >= 10;
};

const roleLabel = (role, t) => {
  if (role === 'super_admin') return t('messages.roles.super_admin');
  if (role === 'admin' || role === 'lga_admin') return t('messages.roles.lga_admin');
  if (role === 'landlord') return t('messages.roles.landlord');
  if (role === 'tenant') return t('messages.roles.tenant');
  return role || t('messages.roles.user');
};

const formatDateTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString();
};

const ESCALATION_TICKET_OPTIONS = [
  { value: 'approval_pending', labelKey: 'messages.ticket_status.approval_pending' },
  { value: 'under_review', labelKey: 'messages.ticket_status.under_review' },
  { value: 'approved', labelKey: 'messages.ticket_status.approved' },
  { value: 'rejected', labelKey: 'messages.ticket_status.rejected' },
];

const Messages = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [escalations, setEscalations] = useState([]);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loadingEscalations, setLoadingEscalations] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingEscalationId, setUpdatingEscalationId] = useState('');

  const [recipientRoleFilter, setRecipientRoleFilter] = useState('');
  const [compose, setCompose] = useState({
    receiver_id: '',
    subject: '',
    message_text: '',
    message_type: 'general',
  });
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const userRole = String(user?.user_type || '').trim().toLowerCase();
  const isLgaAdmin = ['admin', 'lga_admin'].includes(userRole);
  const isTenantOrLandlord = ['tenant', 'landlord'].includes(userRole);
  const canCompose = isLgaAdmin || userRole === 'super_admin' || isTenantOrLandlord;
  const canUseEscalation = isLgaAdmin;
  const canViewEscalations = isLgaAdmin || userRole === 'super_admin';

  const roleOptions = useMemo(() => {
    if (!userRole || !canCompose) return [];
    if (userRole === 'super_admin') {
      return ['', 'admin', 'lga_admin', 'tenant', 'landlord'];
    }
    if (isLgaAdmin) {
      return ['', 'tenant', 'landlord', 'super_admin'];
    }
    if (isTenantOrLandlord) {
      return ['', 'admin', 'lga_admin', 'super_admin'];
    }
    return [];
  }, [canCompose, isLgaAdmin, userRole, isTenantOrLandlord]);

  /* ---------------- LOADERS ---------------- */

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await messageService.getConversations();
      setConversations(res?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('messages.load_conversations_failed'));
    } finally {
      setLoadingConversations(false);
    }
  }, [t]);

  const loadConversationMessages = useCallback(async (otherUserId) => {
    if (!otherUserId) return;

    setLoadingMessages(true);
    try {
      const res = await messageService.getConversationWithUser(otherUserId);
      setMessages(res?.data || []);
      await messageService.markConversationAsRead(otherUserId);

      setConversations((prev) =>
        prev.map((c) =>
          c.other_user_id === otherUserId ? { ...c, unread_count: 0 } : c
        )
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || t('messages.load_conversation_failed'));
    } finally {
      setLoadingMessages(false);
    }
  }, [t]);

  const loadRecipients = useCallback(async (role = '') => {
    setLoadingRecipients(true);
    try {
      const res = await messageService.getRecipients({ role });
      setRecipients(res?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('messages.load_recipients_failed'));
      setRecipients([]);
    } finally {
      setLoadingRecipients(false);
    }
  }, [t]);

  const loadEscalations = useCallback(async () => {
    if (!canViewEscalations) return;

    setLoadingEscalations(true);
    try {
      const res = await messageService.getEscalations();
      setEscalations(res?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('messages.load_escalations_failed'));
    } finally {
      setLoadingEscalations(false);
    }
  }, [canViewEscalations, t]);

  /* ---------------- EFFECTS ---------------- */

  useEffect(() => {
    loadConversations();
    if (canCompose) {
      loadRecipients(recipientRoleFilter);
    } else {
      setRecipients([]);
    }
    loadEscalations();
  }, [loadConversations, loadRecipients, loadEscalations, recipientRoleFilter, canCompose]);

  useEffect(() => {
    if (!canUseEscalation || compose.message_type !== 'escalation') return;
    if (recipientRoleFilter !== 'super_admin') {
      setRecipientRoleFilter('super_admin');
    }
  }, [canUseEscalation, compose.message_type, recipientRoleFilter]);

  /* ---------------- ACTIONS ---------------- */

  const handleSelectConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setCompose((prev) => ({
      ...prev,
      receiver_id: String(conversation.other_user_id),
    }));
    await loadConversationMessages(conversation.other_user_id);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!canCompose) {
      toast.error(t('messages.receive_only_error'));
      return;
    }

    const receiverId =
      Number(compose.receiver_id) || Number(selectedConversation?.other_user_id);

    if (!receiverId) return toast.error(t('messages.select_recipient_error'));
    if (!compose.message_text.trim()) return toast.error(t('messages.message_required'));
    if (compose.message_type === 'escalation' && !compose.subject.trim())
      return toast.error(t('messages.escalation_subject_required'));

    if (detectPhone(compose.message_text) || detectPhone(compose.subject)) {
      return toast.error('Messages cannot contain phone numbers for security reasons.');
    }

    setSending(true);

    try {
      const payload = {
        receiver_id: receiverId,
        message_text: compose.message_text.trim(),
        subject: compose.subject.trim() || null,
        message_type: compose.message_type,
      };

      const res = await messageService.sendMessage(payload);

      if (!res.success) throw new Error(res.message);

      toast.success(t('messages.sent_success'));

      setCompose((prev) => ({
        ...prev,
        message_text: '',
        subject: prev.message_type === 'escalation' ? '' : prev.subject,
      }));

      if (selectedConversation?.other_user_id === receiverId) {
        await loadConversationMessages(receiverId);
      } else {
        await loadConversations();
      }

      await loadEscalations();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || t('messages.send_failed'));
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files].slice(0, 3));
    e.target.value = '';
  };

  const removeAttachedFile = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Microphone access denied or unavailable.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleOpenEscalationThread = async (item) => {
    if (!item?.sender_id) {
      toast.error(t('messages.open_thread_failed'));
      return;
    }

    const matchingConversation = conversations.find(
      (c) => Number(c.other_user_id) === Number(item.sender_id)
    );

    if (matchingConversation) {
      await handleSelectConversation(matchingConversation);
      return;
    }

    const fallbackConversation = {
      other_user_id: Number(item.sender_id),
      other_user_name: item.sender_name || 'User',
      other_user_type: item.sender_role || 'admin',
    };
    await handleSelectConversation(fallbackConversation);
  };

  const handleMarkEscalationHandled = async (item) => {
    try {
      setUpdatingEscalationId(`handled-${item.id}`);
      await messageService.markEscalationHandled(item.id);
      setEscalations((prev) => prev.map((row) => (
        Number(row.id) === Number(item.id)
          ? { ...row, is_read: true, is_handled: true, handled_at: new Date().toISOString() }
          : row
      )));
      toast.success(t('messages.escalation_handled_success'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('messages.escalation_handled_failed'));
    } finally {
      setUpdatingEscalationId(null);
    }
  };

  const handleConvertEscalationToTicket = (item) => {
    if (item.ticket_status) {
      toast.info(t('messages.escalation_already_tracked'));
      return;
    }

    const persist = async () => {
      try {
        setUpdatingEscalationId(`ticket-${item.id}`);
        const res = await messageService.convertEscalationToTicket(item.id);
        const nextStatus = res?.data?.ticket_status || 'approval_pending';
        setEscalations((prev) => prev.map((row) => (
          Number(row.id) === Number(item.id)
            ? { ...row, ticket_status: nextStatus }
            : row
        )));
        toast.success(t('messages.escalation_converted_success'));
      } catch (error) {
        toast.error(error?.response?.data?.message || t('messages.escalation_convert_failed'));
      } finally {
        setUpdatingEscalationId('');
      }
    };

    persist();
  };

  const handleEscalationTicketStatusChange = (item, status) => {
    const persist = async () => {
      try {
        setUpdatingEscalationId(`ticket-${item.id}`);
        await messageService.updateEscalationTicketStatus(item.id, status);
        setEscalations((prev) => prev.map((row) => (
          Number(row.id) === Number(item.id)
            ? { ...row, ticket_status: status }
            : row
        )));
      } catch (error) {
        toast.error(error?.response?.data?.message || t('messages.ticket_update_failed'));
      } finally {
        setUpdatingEscalationId('');
      }
    };

    persist();
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('messages.title')}</h1>
        <BackToDashboard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('messages.conversations')}</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadConversations}
            >
              {t('common.refresh')}
            </button>
          </div>

          {loadingConversations ? (
            <p className="text-sm text-gray-500">{t('messages.loading_conversations')}</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-500">{t('messages.no_conversations')}</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectConversation(c)}
                  className={`w-full text-left rounded-lg border p-3 ${
                    Number(selectedConversation?.other_user_id) === Number(c.other_user_id)
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.other_user_name}</span>
                    {Number(c.unread_count) > 0 && (
                      <span className="text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {roleLabel(c.other_user_type, t)}
                  </div>
                  <div className="text-sm text-gray-700 truncate mt-1">{c.message_text}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {canCompose ? (
            <div className="card">
              <h2 className="font-semibold mb-4">{t('messages.compose')}</h2>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('messages.recipient_role')}</label>
                    <select
                      className="input"
                      value={recipientRoleFilter}
                      onChange={(e) => {
                        setRecipientRoleFilter(e.target.value);
                        setCompose((prev) => ({ ...prev, receiver_id: '' }));
                      }}
                    >
                      {roleOptions.map((role) => (
                        <option key={role || 'all'} value={role}>
                          {role ? roleLabel(role, t) : t('messages.all_allowed_roles')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">{t('messages.recipient')}</label>
                    <select
                      className="input"
                      value={compose.receiver_id}
                      onChange={(e) => setCompose((prev) => ({ ...prev, receiver_id: e.target.value }))}
                    >
                      <option value="">
                        {loadingRecipients ? t('messages.loading_recipients') : t('messages.select_recipient')}
                      </option>
                      {recipients.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>
                          {recipient.full_name} ({roleLabel(recipient.user_type, t)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {canUseEscalation && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('messages.message_type')}</label>
                    <select
                      className="input"
                      value={compose.message_type}
                      onChange={(e) => setCompose((prev) => ({ ...prev, message_type: e.target.value }))}
                    >
                      <option value="general">{t('messages.general')}</option>
                      <option value="escalation">{t('messages.escalation_to_super')}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">{t('messages.subject_optional')}</label>
                  <input
                    type="text"
                    className="input"
                    value={compose.subject}
                    onChange={(e) => setCompose((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder={t('messages.subject')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('messages.message')}</label>
                  <textarea
                    className="input h-28"
                    value={compose.message_text}
                    onChange={(e) => setCompose((prev) => ({ ...prev, message_text: e.target.value }))}
                    placeholder={t('messages.type_message')}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Attach file"
                    >
                      <FaPaperclip size={16} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={handleStartRecording}
                      onMouseUp={handleStopRecording}
                      onMouseLeave={recording ? handleStopRecording : undefined}
                      className={`p-2 rounded-lg transition-colors ${
                        recording ? 'text-red-600 bg-red-50 animate-pulse' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                      }`}
                      title={recording ? 'Release to stop recording' : 'Hold to record audio'}
                    >
                      <FaMicrophone size={16} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    {recording && <span className="text-xs text-red-600">Recording... release to stop</span>}
                    {audioBlob && <span className="text-xs text-green-600">Audio recorded</span>}
                  </div>
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {attachedFiles.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">
                          <FaFile size={12} />
                          {file.name.length > 20 ? file.name.slice(0, 17) + '...' : file.name}
                          <button type="button" onClick={() => removeAttachedFile(i)} className="text-gray-400 hover:text-red-500 ml-1">
                            <FaTimes size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button className="btn btn-primary" type="submit" disabled={sending}>
                    {sending ? t('messages.sending') : t('messages.send_message')}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card">
              <h2 className="font-semibold mb-2">{t('messages.inbox')}</h2>
              <p className="text-sm text-gray-600">
                {t('messages.receive_only')}
              </p>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-4">
              {selectedConversation
                ? t('messages.conversation_with', { name: selectedConversation.other_user_name })
                : t('messages.conversation')}
            </h2>

            {!selectedConversation ? (
              <p className="text-sm text-gray-500">
                {t('messages.select_conversation_hint')}
              </p>
            ) : loadingMessages ? (
              <p className="text-sm text-gray-500">{t('messages.loading_messages')}</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500">{t('messages.no_messages')}</p>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto">
                {messages.map((m) => {
                  const own = Number(m.sender_id) === Number(user?.id);
                  return (
                    <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg p-3 ${own ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                        {m.subject && (
                          <div className={`text-xs font-semibold mb-1 ${own ? 'text-primary-100' : 'text-gray-600'}`}>
                            {m.subject}
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{m.message_text}</p>
                        <div className={`text-[11px] mt-1 ${own ? 'text-primary-100' : 'text-gray-500'}`}>
                          {formatDateTime(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canViewEscalations && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{t('messages.escalation_feed')}</h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={loadEscalations}
                >
                  {t('common.refresh')}
                </button>
              </div>

              {loadingEscalations ? (
                <p className="text-sm text-gray-500">{t('messages.loading_escalations')}</p>
              ) : escalations.length === 0 ? (
                <p className="text-sm text-gray-500">{t('messages.no_escalations')}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {escalations.map((item) => (
                    <li key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-semibold">{item.subject || t('messages.escalation')}</div>
                      <p className="text-gray-700 mt-1 whitespace-pre-wrap">{item.message_text}</p>
                      <div className="text-xs text-gray-500 mt-2">
                        {t('messages.escalation_meta', {
                          sender: item.sender_name,
                          senderRole: roleLabel(item.sender_role, t),
                          receiver: item.receiver_name,
                          receiverRole: roleLabel(item.receiver_role, t),
                          date: formatDateTime(item.created_at),
                        })}
                      </div>
                      {(item.ticket_updated_at || item.handled_at) && (
                        <div className="text-[11px] text-gray-500 mt-1">
                          {item.ticket_updated_at && (
                            <>
                              {t('messages.ticket_updated_by', {
                                name: item.ticket_updated_by_name || t('common.unknown'),
                                date: formatDateTime(item.ticket_updated_at),
                              })}
                            </>
                          )}
                          {item.ticket_updated_at && item.handled_at ? ' · ' : ''}
                          {item.handled_at && (
                            <>
                              {t('messages.handled_by', {
                                name: item.handled_by_name || t('common.unknown'),
                                date: formatDateTime(item.handled_at),
                              })}
                            </>
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEscalationThread(item)}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        >
                          {t('messages.open_full_thread')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkEscalationHandled(item)}
                          disabled={Boolean(item.is_handled || item.handled_at || item.is_read) || updatingEscalationId === `handled-${item.id}`}
                          className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {item.is_handled || item.handled_at || item.is_read ? t('messages.handled') : updatingEscalationId === `handled-${item.id}` ? t('common.saving') : t('messages.mark_handled')}
                        </button>
                        {!item.ticket_status ? (
                          <button
                            type="button"
                            onClick={() => handleConvertEscalationToTicket(item)}
                            disabled={updatingEscalationId === `ticket-${item.id}`}
                            className="rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updatingEscalationId === `ticket-${item.id}` ? t('common.saving') : t('messages.convert_ticket')}
                          </button>
                        ) : (
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            {t('messages.ticket_status_label')}
                            <select
                              value={item.ticket_status}
                              onChange={(event) => handleEscalationTicketStatusChange(item, event.target.value)}
                              disabled={updatingEscalationId === `ticket-${item.id}`}
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              {ESCALATION_TICKET_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;
