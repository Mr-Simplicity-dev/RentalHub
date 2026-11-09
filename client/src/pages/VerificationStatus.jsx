import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaExclamationTriangle, FaUserCircle, FaCamera } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import BackToDashboard from '../components/common/BackToDashboard';
import AppealModal from '../components/common/AppealModal';
import LivePassportCaptureModal from '../components/common/LivePassportCaptureModal';
import { useTranslation } from 'react-i18next';

const INITIAL_FORM = { nin: '', date_of_birth: '', international_passport_number: '', nationality: '' };

const VerificationStatus = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [revalidationRequests, setRevalidationRequests] = useState([]);
  const [revalidationForm, setRevalidationForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submittingRevalidation, setSubmittingRevalidation] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [livePhotoCaptured, setLivePhotoCaptured] = useState(false);
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
      if (profileResult.status === 'rejected') throw profileResult.reason;
      if (revalidationResult.status === 'rejected') throw revalidationResult.reason;
    } catch (err) {
      setError(err?.response?.data?.message || t('verification_status.load_error'));
    }
  }, [updateUser, t]);

  const activeRevalidation = useMemo(
    () => revalidationRequests.find((request) => ['requested', 'rejected', 'submitted'].includes(request.status)) || null,
    [revalidationRequests]
  );

  const existingIdentity = useMemo(() => {
    const baselineSnapshot = activeRevalidation?.baseline_snapshot || {};
    return {
      nin: user?.nin ? `••••••${String(user.nin).slice(-3)}` : (baselineSnapshot?.nin ? `••••••${String(baselineSnapshot.nin).slice(-3)}` : ''),
      passport: user?.international_passport_number || baselineSnapshot?.international_passport_number || '',
      nationality: user?.nationality || baselineSnapshot?.nationality || '',
      documentType: user?.identity_document_type || baselineSnapshot?.identity_document_type || '',
    };
  }, [user, activeRevalidation]);

  const clearFieldErrors = () => setFieldErrors({});

  const validateRevalidation = () => {
    if (!activeRevalidation) return false;
    const errors = {};
    const requestedFields = activeRevalidation.requested_fields || [];

    if (requestedFields.includes('nin')) {
      if (!/^\d{11}$/.test(revalidationForm.nin)) {
        errors.nin = t('verification_status.nin_error');
      }
      if (!revalidationForm.date_of_birth) {
        errors.date_of_birth = t('verification_status.dob_error');
      }
    }
    if (requestedFields.includes('international_passport')) {
      if (!/^[A-Z0-9]{6,20}$/.test(revalidationForm.international_passport_number.trim())) {
        errors.international_passport_number = t('verification_status.passport_number_error');
      }
      if (revalidationForm.nationality.trim().length < 2) {
        errors.nationality = t('verification_status.nationality_error');
      }
      if (!revalidationForm.date_of_birth) {
        errors.date_of_birth = t('verification_status.dob_error');
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitRevalidation = async () => {
    if (!activeRevalidation) return;
    if (!validateRevalidation()) return;

    setSubmittingRevalidation(true);
    setError('');
    setActionMessage('');
    try {
      await api.post(
        `/users/credential-revalidations/${activeRevalidation.id}/submit`,
        revalidationForm
      );
      setRevalidationForm(INITIAL_FORM);
      setFieldErrors({});
      setLivePhotoCaptured(false);
      await loadLatestStatus();
      setActionMessage(t('verification_status.credentials_submitted'));
    } catch (err) {
      setError(err.response?.data?.message || t('verification_status.submit_revalidation_error'));
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
    if (user?.identity_verification_status === 'provider_pending') return 'provider_pending';
    if (user?.identity_verified) return 'verified';
    if (user?.identity_verification_status === 'rejected') return 'rejected';
    if (user?.identity_verification_status === 'revalidation_required') return 'revalidation_required';
    if (user?.identity_verification_status === 'pending' || hasSubmittedVerification) return 'pending';
    return 'not_submitted';
  }, [user?.identity_verification_status, user?.identity_verified, user?.passport_photo_url]);

  const statusDetails = useMemo(() => {
    const statuses = {
      verified: {
        title: t('verification_status.verified_title'),
        description: t('verification_status.verified_desc'),
        icon: <FaCheckCircle className="text-emerald-600 text-3xl" />,
        cardClass: 'bg-emerald-50 border-emerald-200',
        titleClass: 'text-emerald-800',
        textClass: 'text-emerald-700',
      },
      rejected: {
        title: t('verification_status.rejected_title'),
        description: t('verification_status.rejected_desc'),
        icon: <FaExclamationTriangle className="text-red-600 text-3xl" />,
        cardClass: 'bg-red-50 border-red-200',
        titleClass: 'text-red-800',
        textClass: 'text-red-700',
      },
      revalidation_required: {
        title: t('verification_status.revalidation_title'),
        description: t('verification_status.revalidation_desc'),
        icon: <FaExclamationTriangle className="text-amber-600 text-3xl" />,
        cardClass: 'bg-amber-50 border-amber-200',
        titleClass: 'text-amber-800',
        textClass: 'text-amber-700',
      },
      provider_pending: {
        title: t('verification_status.provider_pending_title') || 'Verification in Progress',
        description: t('verification_status.provider_pending_desc') || 'Your credential is being verified by our identity partner. This usually takes a few minutes. Please check back shortly.',
        icon: <FaClock className="text-indigo-600 text-3xl" />,
        cardClass: 'bg-indigo-50 border-indigo-200',
        titleClass: 'text-indigo-800',
        textClass: 'text-indigo-700',
      },
      pending: {
        title: t('verification_status.pending_title'),
        description: activeRevalidation
          ? t('verification_status.pending_desc_revalidation')
          : t('verification_status.pending_desc'),
        icon: <FaClock className="text-blue-600 text-3xl" />,
        cardClass: 'bg-blue-50 border-blue-200',
        titleClass: 'text-blue-800',
        textClass: 'text-blue-700',
      },
      not_submitted: {
        title: t('verification_status.not_submitted_title'),
        description: t('verification_status.not_submitted_desc'),
        icon: <FaUserCircle className="text-yellow-600 text-3xl" />,
        cardClass: 'bg-yellow-50 border-yellow-200',
        titleClass: 'text-yellow-800',
        textClass: 'text-yellow-700',
      },
    };
    return statuses[verificationStatus] || statuses.not_submitted;
  }, [activeRevalidation, verificationStatus, t]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLatestStatus();
    setRefreshing(false);
  };

  const handleLivePhotoCapture = () => {
    setShowLiveCamera(true);
  };

  const handleLiveCameraClose = () => {
    setShowLiveCamera(false);
  };

  const handleLivePhotoCaptured = () => {
    setLivePhotoCaptured(true);
    setShowLiveCamera(false);
  };

  const inputClass = (field) =>
    `input mt-1 ${fieldErrors[field] ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`;

  const requestedFields = activeRevalidation?.requested_fields || [];
  const hasLivePhoto = requestedFields.includes('live_photo');

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t('verification_status.page_title')}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {t('verification_status.page_desc')}
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
                  <h2 className="font-bold text-amber-900">{t('verification_status.revalidation_request')}</h2>
                  <p className="mt-1 text-sm text-amber-800">{activeRevalidation.reason}</p>
                  {activeRevalidation.instructions && (
                    <p className="mt-2 text-sm text-amber-700">{activeRevalidation.instructions}</p>
                  )}
                  {activeRevalidation.due_at && (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      {t('verification_status.due')} {new Date(activeRevalidation.due_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-amber-800">
                  {activeRevalidation.status}
                </span>
              </div>

              {activeRevalidation.review_note && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <strong>{t('verification_status.admin_feedback')}:</strong> {activeRevalidation.review_note}
                </div>
              )}

              {existingIdentity.documentType && activeRevalidation.status !== 'submitted' && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  <strong>Your current credentials on file:</strong>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {existingIdentity.documentType === 'nin' && existingIdentity.nin && (
                      <li>NIN: {existingIdentity.nin}</li>
                    )}
                    {existingIdentity.documentType === 'passport' && existingIdentity.passport && (
                      <li>Passport: {existingIdentity.passport}</li>
                    )}
                    {existingIdentity.nationality && <li>Nationality: {existingIdentity.nationality}</li>}
                  </ul>
                </div>
              )}

              {activeRevalidation.status === 'submitted' ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  {t('verification_status.awaiting_review')}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {requestedFields.includes('nin') && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-gray-700">
                        {t('verification_status.nin_label')}
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={revalidationForm.nin}
                          onChange={(event) => {
                            clearFieldErrors();
                            setRevalidationForm((previous) => ({
                              ...previous,
                              nin: event.target.value.replace(/\D/g, ''),
                            }));
                          }}
                          className={inputClass('nin')}
                          autoComplete="off"
                          placeholder={t('verification_status.nin_placeholder')}
                        />
                        {fieldErrors.nin && <p className="mt-1 text-xs text-red-500">{fieldErrors.nin}</p>}
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        {t('verification_status.date_of_birth')}
                        <input
                          type="date"
                          value={revalidationForm.date_of_birth}
                          onChange={(event) => {
                            clearFieldErrors();
                            setRevalidationForm((previous) => ({
                              ...previous,
                              date_of_birth: event.target.value,
                            }));
                          }}
                          className={inputClass('date_of_birth')}
                        />
                        {fieldErrors.date_of_birth && <p className="mt-1 text-xs text-red-500">{fieldErrors.date_of_birth}</p>}
                      </label>
                    </div>
                  )}

                  {requestedFields.includes('international_passport') && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-sm font-medium text-gray-700">
                        {t('verification_status.passport_label')}
                        <input
                          type="text"
                          maxLength={20}
                          value={revalidationForm.international_passport_number}
                          onChange={(event) => {
                            clearFieldErrors();
                            setRevalidationForm((previous) => ({
                              ...previous,
                              international_passport_number: event.target.value.toUpperCase(),
                            }));
                          }}
                          className={inputClass('international_passport_number')}
                          autoComplete="off"
                          placeholder="e.g. A12345678"
                        />
                        {fieldErrors.international_passport_number && <p className="mt-1 text-xs text-red-500">{fieldErrors.international_passport_number}</p>}
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        {t('verification_status.nationality_label')}
                        <input
                          type="text"
                          maxLength={80}
                          value={revalidationForm.nationality}
                          onChange={(event) => {
                            clearFieldErrors();
                            setRevalidationForm((previous) => ({
                              ...previous,
                              nationality: event.target.value,
                            }));
                          }}
                          className={inputClass('nationality')}
                          placeholder="e.g. Nigeria"
                        />
                        {fieldErrors.nationality && <p className="mt-1 text-xs text-red-500">{fieldErrors.nationality}</p>}
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        {t('verification_status.dob_label')}
                        <input
                          type="date"
                          value={revalidationForm.date_of_birth}
                          onChange={(event) => {
                            clearFieldErrors();
                            setRevalidationForm((previous) => ({
                              ...previous,
                              date_of_birth: event.target.value,
                            }));
                          }}
                          className={inputClass('date_of_birth')}
                        />
                        {fieldErrors.date_of_birth && <p className="mt-1 text-xs text-red-500">{fieldErrors.date_of_birth}</p>}
                      </label>
                    </div>
                  )}

                  {hasLivePhoto && (
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <p className="text-sm font-semibold text-gray-800">{t('verification_status.live_photo_required')}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {livePhotoCaptured
                          ? 'New live photo captured. Ready to submit.'
                          : t('verification_status.live_photo_instruction')}
                      </p>
                      <button type="button" onClick={handleLivePhotoCapture}
                        className={`btn mt-3 inline-flex items-center gap-2 ${livePhotoCaptured ? 'btn-secondary' : 'btn-primary'}`}>
                        <FaCamera />
                        {livePhotoCaptured ? 'Retake live photo' : 'Open Camera (liveness check)'}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={submitRevalidation}
                    disabled={submittingRevalidation}
                    className="btn btn-primary w-full"
                  >
                    {submittingRevalidation ? t('verification_status.submitting') : t('verification_status.submit_credentials')}
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
              {refreshing ? t('verification_status.refreshing') : t('verification_status.refresh')}
            </button>

            {!activeRevalidation && (verificationStatus === 'rejected' || verificationStatus === 'not_submitted') && (
              <button
                onClick={() => navigate('/profile')}
                className="btn btn-primary"
                type="button"
              >
                {t('verification_status.go_to_profile')}
              </button>
            )}

            {verificationStatus === 'rejected' && (
              <button
                onClick={() => setShowAppealModal(true)}
                className="btn btn-warning"
                type="button"
              >
                {t('verification_status.appeal_rejection')}
              </button>
            )}

            <BackToDashboard />
          </div>
        </div>
      </div>

      {showLiveCamera && (
        <LivePassportCaptureModal
          title="Live Passport Capture - Credential Revalidation"
          onCapture={handleLivePhotoCaptured}
          onClose={handleLiveCameraClose}
        />
      )}

      {showAppealModal && (
        <AppealModal
          appealType="verification"
          targetId={user?.id}
          onClose={() => setShowAppealModal(false)}
          onSuccess={() => loadLatestStatus()}
        />
      )}
    </div>
  );
};

export default VerificationStatus;
