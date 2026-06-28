import React, { useState } from 'react';
import { FaTimesCircle, FaGavel } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';

const AppealModal = ({ appealType, targetId, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please provide a reason for your appeal');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        appeal_type: appealType,
        appeal_reason: reason.trim(),
        additional_info: additionalInfo.trim() || undefined,
      };
      if (appealType === 'property') body.property_id = targetId;
      if (appealType === 'verification') body.target_user_id = targetId;

      await api.post('/appeals', body);
      toast.success('Appeal submitted. A state admin will review your case.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit appeal');
    } finally {
      setSubmitting(false);
    }
  };

  const title = appealType === 'property' ? 'Appeal Property Rejection' : 'Appeal Verification Rejection';
  const desc = appealType === 'property'
    ? 'If you believe your property was incorrectly rejected, explain why it should be reinstated.'
    : 'If you believe your identity verification was incorrectly rejected, explain why it should be reinstated.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-2.5">
              <FaGavel className="text-amber-700" size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <FaTimesCircle size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason for Appeal *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
              placeholder="Explain why the decision was incorrect..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Additional Information (optional)</label>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
              placeholder="Any supporting details or context..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Appeal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppealModal;
