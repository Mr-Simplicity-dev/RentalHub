import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const VerifyEmail = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);
        if (res.data?.success) {
          setStatus('success');
          setMessage(res.data.message || 'Your email has been verified successfully.');
        } else {
          setStatus('error');
          setMessage(res.data?.message || 'Verification failed.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(
          err.response?.data?.message ||
            'Invalid or expired verification link.'
        );
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow text-center">
        {status === 'verifying' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Verifying your email…
            </h2>
            <p className="text-gray-600">Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="text-xl font-semibold text-green-700 mb-2">
              Email Verified
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/verify-phone')}
                className="btn-primary w-full"
              >
                Continue to Phone Verification
              </button>

              <button
                onClick={() => navigate('/login')}
                className="btn-outline w-full"
              >
                Go to Login
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold text-red-700 mb-2">
              Verification Failed
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="btn-primary w-full"
              >
                Go to Login
              </button>

              <button
                onClick={() => navigate('/register')}
                className="btn-outline w-full"
              >
                Create New Account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
