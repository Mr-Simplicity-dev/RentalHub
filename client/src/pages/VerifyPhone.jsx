import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

const OTP_DURATION = 10 * 60; // 10 minutes in seconds

const VerifyPhone = () => {
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
      toast.error('Enter your phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/send-phone-otp', { phone });
      if (res.data.success) {
        setSent(true);
        setTimeLeft(OTP_DURATION); // reset timer
        setOtp('');
        toast.success('OTP sent to your phone');
      } else {
        toast.error(res.data.message || 'Failed to send OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp) {
      toast.error('Enter the OTP');
      return;
    }

    if (timeLeft <= 0) {
      toast.error('OTP has expired. Please request a new one.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-phone', { otp });
      if (res.data.success) {
        toast.success('Phone verified successfully');
        navigate('/profile');
      } else {
        toast.error(res.data.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
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
      <h1 className="text-2xl font-bold mb-6 text-center">Verify Phone</h1>

      <div className="card space-y-4">
        {!sent && (
          <>
            <input
              className="input"
              placeholder="Enter phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              onClick={sendOtp}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
          </>
        )}

        {sent && (
          <>
            <input
              className="input"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />

            <button
              onClick={verifyOtp}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>

            <div className="text-center text-sm text-gray-500">
              {timeLeft > 0 ? (
                <>Code expires in {formatTime(timeLeft)}</>
              ) : (
                <>OTP expired</>
              )}
            </div>

            <button
              onClick={sendOtp}
              disabled={loading || timeLeft > 0}
              className="btn btn-outline w-full"
            >
              Resend OTP
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyPhone;
