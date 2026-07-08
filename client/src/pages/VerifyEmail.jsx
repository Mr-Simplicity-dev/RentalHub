import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { setAuthSession } from '../services/authStorage';
import { useTranslation } from 'react-i18next';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3); // seconds before redirect

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('verify_email.invalid_link'));
      return;
    }

    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);

        if (res.data?.success) {
          const { token: authToken, user } = res.data;

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
  }, [token, navigate]);

  // Countdown + redirect when successful
  useEffect(() => {
    if (status !== 'success') return;

    if (countdown <= 0) {
      navigate('/verify-phone');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [status, countdown, navigate]);

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

