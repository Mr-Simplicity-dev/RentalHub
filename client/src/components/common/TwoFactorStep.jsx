import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { FaShieldAlt, FaTimes } from 'react-icons/fa';

/**
 * Shared 2FA verification step for withdrawals and financial approvals.
 * method: 'totp' (authenticator code) or 'sms' (SMS code, auto-sent).
 * onVerified(code): called with the entered code; the parent re-submits the
 * original request including totp_code/otp and closes this step on success.
 */
export default function TwoFactorStep({ method, onVerified, onCancel, title }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sendSmsCode = async () => {
    setSending(true);
    setError('');
    try {
      await api.post('/auth/2fa/send-withdrawal-otp');
      toast.success(t('two_factor.sms_sent', 'Verification code sent to your phone.'));
    } catch (sendError) {
      setError(sendError?.response?.data?.message || t('two_factor.sms_send_failed', 'Could not send the code. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (method === 'sms') {
      sendSmsCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.trim().length < 6) {
      setError(t('two_factor.code_required', 'Enter the 6-digit verification code.'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onVerified(code.trim());
    } catch (verifyError) {
      setError(verifyError?.response?.data?.message || t('two_factor.verify_failed', 'Verification failed. Please try again.'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FaShieldAlt className="text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {title || t('two_factor.title', 'Security Check')}
              </h3>
              <p className="text-xs text-gray-500">
                {method === 'totp'
                  ? t('two_factor.totp_hint', 'Two-factor authentication is required for this action.')
                  : t('two_factor.sms_hint', 'Two-factor authentication is required for this action.')}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label={t('two_factor.close', 'Close')}>
            <FaTimes className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <p className="text-sm text-gray-600">
            {method === 'totp'
              ? t('two_factor.totp_body', 'Enter the 6-digit code from your authenticator app (e.g. Google Authenticator).')
              : t('two_factor.sms_body', 'We sent a verification code to your phone. Enter it below to continue.')}
          </p>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            placeholder="••••••"
            autoFocus
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {method === 'sms' && (
            <button
              type="button"
              disabled={sending}
              onClick={sendSmsCode}
              className="block w-full py-1 text-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              {sending
                ? t('two_factor.sending', 'Sending code...')
                : t('two_factor.resend', 'Resend code')}
            </button>
          )}

          <button
            type="submit"
            disabled={submitting || code.length < 6}
            className="block w-full rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting
              ? t('two_factor.verifying', 'Verifying...')
              : t('two_factor.verify', 'Verify & Continue')}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="block w-full py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            {t('two_factor.cancel', 'Cancel')}
          </button>
        </form>
      </div>
    </div>
  );
}
