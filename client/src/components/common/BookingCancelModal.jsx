import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const BookingCancelModal = ({
  isOpen,
  title,
  message,
  warning,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError(t('booking_cancel.reason_required', 'Cancellation reason is required.'));
      return;
    }
    onConfirm(trimmedReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">{title || t('booking_cancel.title', 'Cancel Booking')}</h3>
        <p className="mt-2 text-sm text-gray-600">{message || t('booking_cancel.message', 'Please tell us why you are cancelling this booking.')}</p>
        {warning && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        )}

        <label className="mt-5 block text-sm font-medium text-gray-700">
          {t('booking_cancel.reason_label', 'Cancellation Reason')}
        </label>
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          rows={4}
          className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
          placeholder={t('booking_cancel.reason_placeholder', 'Explain why you need to cancel...')}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('booking_cancel.keep', 'Keep Booking')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? t('booking_cancel.cancelling', 'Cancelling...') : t('booking_cancel.cancel', 'Cancel Booking')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BookingCancelModal;
