import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaExclamationTriangle, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import BackToDashboard from '../components/common/BackToDashboard';
import AppealModal from '../components/common/AppealModal';

const VerificationStatus = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [revalidationRequests, setRevalidationRequests] = useState([]);
  const [revalidationForm, setRevalidationForm] = useState({
    nin: '',
    date_of_birth: '',
    international_passport_number: '',
    nationality: '',
  });
  const [submittingRevalidation, setSubmittingRevalidation] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const hasLoadedOnMount = useRef(false);

  const loadLatestStatus = useCallback(async () => {
    setError('');
    try {
      const [profileResult, revalidationResult] = await Promise.allSettled([
        api.get('/auth/me'),
        api.get('/users/credential-revalidations'),
      ]);
      if (profileResult.status === 'fulfilled' && profileResult.value?.data?.success) {
        updateUser(profileResult.value.data.data);
      }
      if (revalidationResult.status === 'fulfilled') {
        setRevalidationRequests(
          Array.isArray(revalidationResult.value?.data?.data)
            ? revalidationResult.value.data.data
            : []
        );
      }
      if (profileResult.status === 'rejected') {
        throw profileResult.reason;
      }
      if (revalidationResult.status === 'rejected') {
        throw revalidationResult.reason;
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load verification status right now.');
    }
  }, [updateUser]);

  const activeRevalidation = useMemo(
    () => revalidationRequests.find((request) => ['requested', 'rejected', 'submitted'].includes(request.status)) || null,
    [revalidationRequests]
  );

  const submitRevalidation = async () => {
    if (!activeRevalidation) return;
    const requestedFields = activeRevalidation.requested_fields || [];
    if (requestedFields.includes('nin') && !/^\d{11}$/.test(revalidationForm.nin)) {
      setError('Enter the complete 11-digit NIN requested by the administrator.');
      return;
    }
    if (
      requestedFields.includes('international_passport') &&
      !/^[A-Z0-9]{6,20}$/.test(revalidationForm.international_passport_number.trim())
    ) {
      setError('Enter a valid 6–20 character international passport number.');
      return;
    }
    if (
      requestedFields.includes('international_passport') &&
      revalidationForm.nationality.trim().length < 2
    ) {
      setError('Enter the nationality associated with the international passport.');
      return;
    }
    if (
      requestedFields.some((field) => ['nin', 'international_passport'].includes(field)) &&
      !revalidationForm.date_of_birth
    ) {
      setError('Enter the date of birth associated with the credential.');
      return;
    }

    setSubmittingRevalidation(true);
    setError('');
    setActionMessage('');
    try {
      await api.post(
        `/users/credential-revalidations/${activeRevalidation.id}/submit`,
        revalidationForm
      );
      setRevalidationForm({
        nin: '',
        date_of_birth: '',
        international_passport_number: '',
        nationality: '',
      });
      await loadLatestStatus();
      setActionMessage('Credentials submitted securely. They are now awaiting super-admin review.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to submit credential revalidation.');
    } finally {
      setSubmittingRevalidation(false);
    }
  };

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

    if (verificationStatus === 'revalidation_required') {
      return {
        title: 'Credential Revalidation Required',
        description: 'An administrator requested specific identity credentials from you. Complete the request below.',
        icon: <FaExclamationTriangle className="text-amber-600 text-3xl" />,
        cardClass: 'bg-amber-50 border-amber-200',
        titleClass: 'text-amber-800',
        textClass: 'text-amber-700',
      };
    }

    if (verificationStatus === 'pending') {
      return {
        title: 'Pending Review',
        description: activeRevalidation
          ? 'Your updated credentials were submitted successfully and are waiting for super-admin review.'
          : 'Your passport was submitted successfully and is waiting for admin review.',
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
  }, [activeRevalidation, verificationStatus]);

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
          {actionMessage && (
            <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {actionMessage}
            </p>
          )}

          {activeRevalidation && (
            <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-left">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-amber-900">Credential Revalidation Request</h2>
                  <p className="mt-1 text-sm text-amber-800">{activeRevalidation.reason}</p>
                  {activeRevalidation.instructions && (
                    <p className="mt-2 text-sm text-amber-700">{activeRevalidation.instructions}</p>
                  )}
                  {activeRevalidation.due_at && (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      Due {new Date(activeRevalidation.due_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-amber-800">
                  {activeRevalidation.status}
                </span>
              </div>

              {activeRevalidation.review_note && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <strong>Administrator feedback:</strong> {activeRevalidation.review_note}
                </div>
              )}

              {activeRevalidation.status === 'submitted' ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  Your credentials were submitted and are awaiting super-admin review.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {(activeRevalidation.requested_fields || []).includes('nin') && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-gray-700">
                        New 11-digit NIN
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={revalidationForm.nin}
                          onChange={(event) => setRevalidationForm((previous) => ({
                            ...previous,
                            nin: event.target.value.replace(/\D/g, ''),
                          }))}
                          className="input mt-1"
                          autoComplete="off"
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Date of birth
                        <input
                          type="date"
                          value={revalidationForm.date_of_birth}
                          onChange={(event) => setRevalidationForm((previous) => ({
                            ...previous,
                            date_of_birth: event.target.value,
                          }))}
                          className="input mt-1"
                        />
                      </label>
                    </div>
                  )}

                  {(activeRevalidation.requested_fields || []).includes('international_passport') && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-sm font-medium text-gray-700">
                        International passport number
                        <input
                          type="text"
                          maxLength={20}
                          value={revalidationForm.international_passport_number}
                          onChange={(event) => setRevalidationForm((previous) => ({
                            ...previous,
                            international_passport_number: event.target.value.toUpperCase(),
                          }))}
                          className="input mt-1"
                          autoComplete="off"
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Nationality
                        <input
                          type="text"
                          maxLength={80}
                          value={revalidationForm.nationality}
                          onChange={(event) => setRevalidationForm((previous) => ({
                            ...previous,
                            nationality: event.target.value,
                          }))}
                          className="input mt-1"
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Date of birth
                        <input
                          type="date"
                          value={revalidationForm.date_of_birth}
                          onChange={(event) => setRevalidationForm((previous) => ({
                            ...previous,
                            date_of_birth: event.target.value,
                          }))}
                          className="input mt-1"
                        />
                      </label>
                    </div>
                  )}

                  {(activeRevalidation.requested_fields || []).includes('live_photo') && (
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <p className="text-sm font-semibold text-gray-800">A new live passport photo is required.</p>
                      <p className="mt-1 text-xs text-gray-600">Use the live camera in Profile, then return here to submit this request.</p>
                      <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary mt-3">
                        Open Live Camera in Profile
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={submitRevalidation}
                    disabled={submittingRevalidation}
                    className="btn btn-primary w-full"
                  >
                    {submittingRevalidation ? 'Submitting securely...' : 'Submit Credentials for Review'}
                  </button>
                </div>
              )}
            </section>
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

            {!activeRevalidation && (verificationStatus === 'rejected' || verificationStatus === 'not_submitted') && (
              <button
                onClick={() => navigate('/profile')}
                className="btn btn-primary"
                type="button"
              >
                Go to Profile to Submit
              </button>
            )}

            {verificationStatus === 'rejected' && (
              <button
                onClick={() => setShowAppealModal(true)}
                className="btn btn-warning"
                type="button"
              >
                Appeal Rejection
              </button>
            )}

            <BackToDashboard />
          </div>
        </div>
      </div>

      {showAppealModal && (
        <AppealModal
          appealType="verification"
          targetId={user.id}
          onClose={() => setShowAppealModal(false)}
          onSuccess={() => loadLatestStatus()}
        />
      )}
    </div>
  );
};

export default VerificationStatus;
