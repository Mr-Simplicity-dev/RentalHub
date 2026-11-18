import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

const OTP_DURATION = 10 * 60; // 10 minutes in seconds

const VerifyPhone = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (user?.phone) {
      setPhone(user.phone);
    }
  }, [user?.phone]);

  // Countdown effect
  useEffect(() => {
    if (!sent || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [sent, timeLeft]);

  const activePhone = (user?.phone || phone).trim();

  const sendOtp = async () => {
    if (!activePhone) {
      toast.error(t('verify_phone.enter_phone'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/send-phone-otp', { phone: activePhone });
      if (res.data.success) {
        setSent(true);
        setTimeLeft(OTP_DURATION); // reset timer
        setOtp('');
        toast.success(t('verify_phone.otp_sent'));
      } else {
        toast.error(res.data.message || t('verify_phone.send_failed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('verify_phone.send_failed'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp) {
      toast.error(t('verify_phone.enter_otp'));
      return;
    }

    if (timeLeft <= 0) {
      toast.error(t('verify_phone.otp_expired'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-phone', { otp });
      if (res.data.success) {
        if (user) {
          updateUser({ ...user, phone_verified: true });
        }
        try {
          const latest = await api.get('/auth/me');
          if (latest.data?.success && latest.data?.data) {
            updateUser(latest.data.data);
          }
        } catch {
          // Keep optimistic phone_verified update if /auth/me refresh fails temporarily
        }
        toast.success(t('verify_phone.success'));
        navigate('/profile');
      } else {
        toast.error(res.data.message || t('verify_phone.invalid_otp'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('verify_phone.failed'));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <h1 className="text-2xl font-bold mb-6 text-center">{t('verify_phone.title')}</h1>

      <div className="card space-y-4">
        {user?.phone_verified ? (
          <div className="space-y-4 text-center">
            <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {t('verify_phone.already_verified', 'Your phone number ({{phone}}) is already verified.', {
                phone: user.phone,
              })}
            </p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="btn btn-primary w-full"
            >
              {t('verify_phone.back_to_profile', 'Back to Profile')}
            </button>
          </div>
        ) : (
          <>
            {!sent && (
              <>
                {user?.phone ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">{user.phone}</div>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('verify_phone.saved_number_hint', 'We will send a one-time code to your saved phone number. To use a different number, update it in your Profile first.')}
                    </p>
                  </div>
                ) : (
                  <input
                    className="input"
                    placeholder={t('verify_phone.phone_placeholder')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                )}
                <button
                  onClick={sendOtp}
                  disabled={loading}
                  className="btn btn-primary w-full"
                >
                  {loading ? t('verify_phone.sending') : t('verify_phone.send_otp')}
                </button>
              </>
            )}

            {sent && (
              <>
                <input
                  className="input"
                  placeholder={t('verify_phone.otp_placeholder')}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />

                <button
                  onClick={verifyOtp}
                  disabled={loading}
                  className="btn btn-primary w-full"
                >
                  {loading ? t('verify_phone.verifying') : t('verify_phone.verify')}
                </button>

                <div className="text-center text-sm text-gray-500">
                  {timeLeft > 0 ? (
                    <>{t('verify_phone.expires_in')}{formatTime(timeLeft)}</>
                  ) : (
                    <>{t('verify_phone.expired')}</>
                  )}
                </div>

                <button
                  onClick={sendOtp}
                  disabled={loading || timeLeft > 0}
                  className="btn btn-outline w-full"
                >
                  {t('verify_phone.resend')}
                </button>
              </>
            )}
          </>
        )}
      </div>
      <button
        onClick={() => navigate('/dashboard')}
        className="btn btn-outline mt-4"
      >
        {t('verify_phone.back')}
      </button>
    </div>
  );
};

export default VerifyPhone;
