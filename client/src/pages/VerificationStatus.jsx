import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaExclamationTriangle, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const VerificationStatus = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedOnMount = useRef(false);

  const loadLatestStatus = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/auth/me');
      if (response?.data?.success && response?.data?.data) {
        updateUser(response.data.data);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load verification status right now.');
    }
  }, [updateUser]);

  useEffect(() => {
    if (hasLoadedOnMount.current) return;
    hasLoadedOnMount.current = true;
    loadLatestStatus();
  }, [loadLatestStatus]);

  const verificationStatus = useMemo(() => {
    const hasSubmittedVerification = !!user?.passport_photo_url;
    return (
      user?.identity_verification_status ||
      (user?.identity_verified
        ? 'verified'
        : hasSubmittedVerification
          ? 'pending'
          : 'not_submitted')
    );
  }, [user?.identity_verification_status, user?.identity_verified, user?.passport_photo_url]);

  const statusDetails = useMemo(() => {
    if (verificationStatus === 'verified') {
      return {
        title: 'Verified',
        description: 'Your identity has been verified. You can continue using full platform features.',
        icon: <FaCheckCircle className="text-emerald-600 text-3xl" />,
        cardClass: 'bg-emerald-50 border-emerald-200',
        titleClass: 'text-emerald-800',
        textClass: 'text-emerald-700',
      };
    }

    if (verificationStatus === 'rejected') {
      return {
        title: 'Rejected',
        description: 'Your verification request was rejected. Upload a new live passport photo to submit again.',
        icon: <FaExclamationTriangle className="text-red-600 text-3xl" />,
        cardClass: 'bg-red-50 border-red-200',
        titleClass: 'text-red-800',
        textClass: 'text-red-700',
      };
    }

    if (verificationStatus === 'pending') {
      return {
        title: 'Pending Review',
        description: 'Your passport was submitted successfully and is waiting for admin review.',
        icon: <FaClock className="text-blue-600 text-3xl" />,
        cardClass: 'bg-blue-50 border-blue-200',
        titleClass: 'text-blue-800',
        textClass: 'text-blue-700',
      };
    }

    return {
      title: 'Not Submitted',
      description: 'You have not submitted a verification passport photo yet.',
      icon: <FaUserCircle className="text-yellow-600 text-3xl" />,
      cardClass: 'bg-yellow-50 border-yellow-200',
      titleClass: 'text-yellow-800',
      textClass: 'text-yellow-700',
    };
  }, [verificationStatus]);

  const goToDashboard = () => {
    if (user?.user_type === 'tenant') {
      navigate('/tenant/dashboard');
      return;
    }
    navigate('/dashboard');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLatestStatus();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Verification Status</h1>
            <p className="mt-1 text-sm text-gray-600">
              Check whether your identity verification has been approved, is pending, or needs resubmission.
            </p>
          </div>

          <div className={`mt-6 border rounded-lg p-5 ${statusDetails.cardClass}`}>
            <div className="flex items-start gap-4">
              <div>{statusDetails.icon}</div>
              <div>
                <h2 className={`text-lg font-semibold ${statusDetails.titleClass}`}>{statusDetails.title}</h2>
                <p className={`mt-1 text-sm ${statusDetails.textClass}`}>{statusDetails.description}</p>
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={handleRefresh}
              className="btn btn-secondary"
              type="button"
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Status'}
            </button>

            {(verificationStatus === 'rejected' || verificationStatus === 'not_submitted') && (
              <button
                onClick={() => navigate('/profile')}
                className="btn btn-primary"
                type="button"
              >
                Go to Profile to Submit
              </button>
            )}

            <button
              onClick={goToDashboard}
              className="btn btn-secondary"
              type="button"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificationStatus;
