import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

const VerifyPhone = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

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
            <button onClick={sendOtp} disabled={loading} className="btn btn-primary w-full">
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
            <button onClick={verifyOtp} disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyPhone;
