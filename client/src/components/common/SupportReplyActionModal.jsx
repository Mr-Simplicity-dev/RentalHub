import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';

const SupportReplyActionModal = ({
  isOpen,
  action,
  ticketId,
  reply,
  onClose,
  onEdited,
  onDeleted,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = action === 'edit';

  useEffect(() => {
    if (isOpen) {
      setMessage(reply?.message || '');
    }
  }, [isOpen, reply]);

  if (!isOpen || !reply || !ticketId) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isEdit && !message.trim()) {
      toast.error(t('support_reply.message_required', 'Message is required'));
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const res = await api.patch(`/support/tickets/${ticketId}/reply/${reply.id}`, {
          message: message.trim(),
        });
        onEdited?.(reply.id, res.data.data);
        toast.success(t('support_reply.reply_updated', 'Reply updated'));
      } else {
        await api.delete(`/support/tickets/${ticketId}/reply/${reply.id}`);
        onDeleted?.(reply.id);
        toast.success(t('support_reply.reply_deleted', 'Reply deleted'));
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || (isEdit ? t('support_reply.edit_failed', 'Failed to edit reply') : t('support_reply.delete_failed', 'Failed to delete reply')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? t('support_reply.edit_title', 'Edit Reply') : t('support_reply.delete_title', 'Delete Reply')}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {isEdit
              ? t('support_reply.edit_desc', 'Update this support message. The conversation will show it was edited.')
              : t('support_reply.delete_desc', 'This removes the message from the ticket conversation.')}
          </p>
        </div>

        {isEdit ? (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="mt-5 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder={t('support_reply.edit_placeholder', 'Write the updated reply...')}
          />
        ) : (
          <div className="mt-5 rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-sm text-red-800 line-clamp-4">
              {reply.message || t('support_reply.no_message', 'No message body')}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('support_reply.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || (isEdit && !message.trim())}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              isEdit ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving ? t('support_reply.saving', 'Saving...') : isEdit ? t('support_reply.save_reply', 'Save Reply') : t('support_reply.delete_reply', 'Delete Reply')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SupportReplyActionModal;
