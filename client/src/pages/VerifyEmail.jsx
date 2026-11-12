import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { setAuthSession } from '../services/authStorage';
import { useTranslation } from 'react-i18next';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const token = searchParams.get('token') || params.token;
  const [destination, setDestination] = useState('/login');
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState('');
  const [countdown, setCountdown] = useState(3); // seconds before redirect

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('verify_email.invalid_link'));
      return;
    }

    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${encodeURIComponent(token)}`, { skipAuth: true, skipAuthRefresh: true });

        if (res.data?.success) {
          const { token: authToken, user } = res.data.data || res.data;

          // 🔐 Auto-login
          setAuthSession(authToken, user);
          api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

          setStatus('success');
          setMessage(res.data.message || t('verify_email.success_msg'));
        } else {
          setStatus('error');
          setMessage(res.data?.message || t('verify_email.verification_failed'));
        }
      } catch (err) {
        setStatus('error');
        setMessage(
          err.response?.data?.message ||
          t('verify_email.expired_link')
        );
      }
    };

    verify();
  }, [token, navigate, t]);

  // Countdown + redirect when successful
  useEffect(() => {
    if (status !== 'success') return;

    if (countdown <= 0) {
      navigate(destination);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [status, countdown, navigate, destination]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow text-center">
        {status === 'verifying' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t('verify_email.verifying')}
            </h2>
            <p className="text-gray-600">{t('verify_email.wait')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="text-xl font-semibold text-green-700 mb-2">
              {t('verify_email.success_title')}
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">
              {t('verify_email.redirecting')}{countdown}{t('verify_email.seconds')}
            </p>
          </>
        )}

        {(status === 'error' || status === 'resend') && <form className="mb-6 space-y-3" onSubmit={async event => {
          event.preventDefault(); if (sending) return; setSending(true); setSendMessage('');
          try { await api.post('/auth/resend-verification', { email }, { skipAuth: true, skipAuthRefresh: true }); setSendMessage(t('register.email_sent')); }
          catch (error) { setSendMessage(error.response?.data?.message || t('register.email_send_failed')); }
          finally { setSending(false); }
        }}>
          <label className="block text-sm font-semibold" htmlFor="verification-email">{t('register.email')}</label>
          <input id="verification-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-lg border px-3 py-3" />
          <button className="btn-primary w-full" type="submit" disabled={sending}>{t('register.email_send')}</button>
          {sendMessage ? <p role="status" className="text-sm text-gray-700">{sendMessage}</p> : null}
        </form>}
        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold text-red-700 mb-2">
              {t('verify_email.failed_title')}
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="btn-primary w-full"
              >
                {t('verify_email.go_to_login')}
              </button>

              <button
                onClick={() => navigate('/register')}
                className="btn-outline w-full"
              >
                {t('verify_email.create_account')}
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn btn-outline mt-4"
              >
                {t('verify_email.back')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;

