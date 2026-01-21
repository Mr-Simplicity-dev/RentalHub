import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const VerifyEmail = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);
        if (res.data.success) {
          setStatus('success');
          setMessage('Email verified successfully. Redirecting to phone verification...');
          setTimeout(() => navigate('/verify-phone'), 2000);
        } else {
          setStatus('error');
          setMessage(res.data.message || 'Verification failed');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Invalid or expired verification link');
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <div className="container mx-auto px-4 py-16 max-w-md text-center">
      {status === 'verifying' && (
        <>
          <h1 className="text-2xl font-bold mb-4">Verifying Email…</h1>
          <p className="text-gray-600">Please wait while we confirm your email address.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold mb-4 text-green-600">Email Verified</h1>
          <p className="text-gray-700">{message}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold mb-4 text-red-600">Verification Failed</h1>
          <p className="text-gray-700">{message}</p>
        </>
      )}
    </div>
  );
};

export default VerifyEmail;
