import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SurveyWizard from '../components/survey/SurveyWizard';

/**
 * Public survey page: rentalhub.com.ng/survey
 * Lets potential users (no account needed) answer the market research survey.
 */
const PublicSurveyPage = () => {
  const { t } = useTranslation();
  const [type, setType] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = 'RentalHub NG Survey';
  }, []);

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-emerald-700">
            {t('public_survey.thanks_title', 'Thank you!')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('public_survey.thanks_body', 'Your answers have been recorded. They will help improve rental services in Nigeria.')}
          </p>
        </div>
      </div>
    );
  }

  if (type) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <SurveyWizard
          surveyType={type}
          mode="full"
          publicMode
          onComplete={() => setSubmitted(true)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('public_survey.title', 'RentalHub NG Market Research Survey')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('public_survey.subtitle', 'Help us understand how Nigerians find and pay for rental homes. Your answers are anonymous and used only for research. Estimated time: 15–20 minutes.')}
          </p>

          <p className="mt-6 text-sm font-semibold text-gray-700">
            {t('public_survey.choose', 'Who are you?')}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setType('tenant')}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500"
            >
              <p className="font-bold text-gray-900">{t('public_survey.tenant', 'Tenant / Rent Seeker')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.tenant_desc', 'Currently renting, looking for a home, or rented within the last 24 months.')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setType('landlord')}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500"
            >
              <p className="font-bold text-gray-900">{t('public_survey.landlord', 'Landlord / Property Owner')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.landlord_desc', 'Own or manage residential rental property in Nigeria.')}
              </p>
            </button>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            {t('public_survey.privacy', 'Anonymous · Voluntary · Your identity is never linked to your answers')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicSurveyPage;
