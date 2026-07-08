import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

const OTP_DURATION = 10 * 60; // 10 minutes in seconds

const VerifyPhone = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Countdown effect
  useEffect(() => {
    if (!sent || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [sent, timeLeft]);

  const sendOtp = async () => {
    if (!phone) {
      toast.error(t('verify_phone.enter_phone'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/send-phone-otp', { phone });
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
        {!sent && (
          <>
            <input
              className="input"
              placeholder={t('verify_phone.phone_placeholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
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

