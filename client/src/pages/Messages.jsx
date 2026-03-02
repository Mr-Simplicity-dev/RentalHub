import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { messageService } from '../services/messageService';
import { toast } from 'react-toastify';

const roleLabel = (role) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'landlord') return 'Landlord';
  if (role === 'tenant') return 'Tenant';
  return role || 'User';
};

const formatDateTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString();
};

const Messages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [loadingEscalations, setLoadingEscalations] = useState(false);
  const [recipientRoleFilter, setRecipientRoleFilter] = useState('');
  const [compose, setCompose] = useState({
    receiver_id: '',
    subject: '',
    message_text: '',
    message_type: 'general',
  });

  const canCompose = ['admin', 'super_admin'].includes(user?.user_type);
  const canUseEscalation = user?.user_type === 'admin';
  const canViewEscalations = ['admin', 'super_admin'].includes(user?.user_type);

  const roleOptions = useMemo(() => {
    if (!user || !canCompose) return [];
    if (user.user_type === 'super_admin') {
      return ['', 'admin', 'tenant', 'landlord'];
    }
    if (user.user_type === 'admin') {
      return ['', 'tenant', 'landlord', 'super_admin'];
    }
    return [];
  }, [user, canCompose]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await messageService.getConversations();
      setConversations(res.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadConversationMessages = useCallback(async (otherUserId) => {
    if (!otherUserId) return;

    setLoadingMessages(true);
    try {
      const res = await messageService.getConversationWithUser(otherUserId);
      setMessages(res.data || []);
      await messageService.markConversationAsRead(otherUserId);
      setConversations((prev) =>
        prev.map((c) =>
          c.other_user_id === otherUserId ? { ...c, unread_count: 0 } : c
        )
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load conversation');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadRecipients = useCallback(async (role = '') => {
    setLoadingRecipients(true);
    try {
      const res = await messageService.getRecipients({ role });
      setRecipients(res.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load recipients');
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  const loadEscalations = useCallback(async () => {
    if (!canViewEscalations) return;

    setLoadingEscalations(true);
    try {
      const res = await messageService.getEscalations();
      setEscalations(res.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load escalations');
    } finally {
      setLoadingEscalations(false);
    }
  }, [canViewEscalations]);

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
      toast.error('You can only receive messages.');
      return;
    }

    const receiverId =
      Number(compose.receiver_id) || Number(selectedConversation?.other_user_id);

    if (!receiverId) {
      toast.error('Select a recipient');
      return;
    }

    if (!compose.message_text.trim()) {
      toast.error('Message text is required');
      return;
    }

    if (compose.message_type === 'escalation' && !compose.subject.trim()) {
      toast.error('Escalation subject is required');
      return;
    }

    setSending(true);
    try {
      const payload = {
        receiver_id: receiverId,
        message_text: compose.message_text.trim(),
        subject: compose.subject.trim() || null,
        message_type: compose.message_type || 'general',
      };

      const res = await messageService.sendMessage(payload);
      if (!res.success) {
        throw new Error(res.message || 'Failed to send');
      }

      toast.success('Message sent');
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
      toast.error(error?.response?.data?.message || error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Internal Messages</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Conversations</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadConversations}
            >
              Refresh
            </button>
          </div>

          {loadingConversations ? (
            <p className="text-sm text-gray-500">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-500">No conversations yet.</p>
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
                    {roleLabel(c.other_user_type)}
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
              <h2 className="font-semibold mb-4">Compose</h2>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Recipient role</label>
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
                          {role ? roleLabel(role) : 'All allowed roles'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Recipient</label>
                    <select
                      className="input"
                      value={compose.receiver_id}
                      onChange={(e) => setCompose((prev) => ({ ...prev, receiver_id: e.target.value }))}
                    >
                      <option value="">
                        {loadingRecipients ? 'Loading recipients...' : 'Select recipient'}
                      </option>
                      {recipients.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>
                          {recipient.full_name} ({roleLabel(recipient.user_type)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {canUseEscalation && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Message type</label>
                    <select
                      className="input"
                      value={compose.message_type}
                      onChange={(e) => setCompose((prev) => ({ ...prev, message_type: e.target.value }))}
                    >
                      <option value="general">General</option>
                      <option value="escalation">Escalation (to Super Admin)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Subject (optional)</label>
                  <input
                    type="text"
                    className="input"
                    value={compose.subject}
                    onChange={(e) => setCompose((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Subject"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Message</label>
                  <textarea
                    className="input h-28"
                    value={compose.message_text}
                    onChange={(e) => setCompose((prev) => ({ ...prev, message_text: e.target.value }))}
                    placeholder="Type message here..."
                  />
                </div>

                <div className="flex justify-end">
                  <button className="btn btn-primary" type="submit" disabled={sending}>
                    {sending ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card">
              <h2 className="font-semibold mb-2">Inbox</h2>
              <p className="text-sm text-gray-600">
                Your role is receive-only. You can read internal messages here.
              </p>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-4">
              {selectedConversation
                ? `Conversation with ${selectedConversation.other_user_name}`
                : 'Conversation'}
            </h2>

            {!selectedConversation ? (
              <p className="text-sm text-gray-500">
                Select a conversation from the left or send a new message.
              </p>
            ) : loadingMessages ? (
              <p className="text-sm text-gray-500">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500">No messages in this conversation yet.</p>
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
                <h2 className="font-semibold">Escalation Feed</h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={loadEscalations}
                >
                  Refresh
                </button>
              </div>

              {loadingEscalations ? (
                <p className="text-sm text-gray-500">Loading escalations...</p>
              ) : escalations.length === 0 ? (
                <p className="text-sm text-gray-500">No escalations yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {escalations.map((item) => (
                    <li key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-semibold">{item.subject || 'Escalation'}</div>
                      <p className="text-gray-700 mt-1 whitespace-pre-wrap">{item.message_text}</p>
                      <div className="text-xs text-gray-500 mt-2">
                        From {item.sender_name} ({roleLabel(item.sender_role)}) to {item.receiver_name} ({roleLabel(item.receiver_role)}) on {formatDateTime(item.created_at)}
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
