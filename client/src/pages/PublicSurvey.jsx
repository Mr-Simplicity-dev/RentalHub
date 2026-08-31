import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FaBell, FaCheckCircle } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import SurveyWizard from '../components/survey/SurveyWizard';

const RESUME_KEY = 'rentalhub_survey_resume';
const TYPE_KEY = 'rentalhub_survey_type';

/**
 * Public survey page: rentalhub.com.ng/survey
 * - Anonymous respondents (online self-completion)
 * - Marketing agents conducting surveys (logged-in, /survey?agent=1)
 * - Draft resume via localStorage resume token + browser notifications.
 */
const PublicSurveyPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [notifState, setNotifState] = useState('default');
  const [hasDraft, setHasDraft] = useState(false);

  const isMarketingAgent = user?.user_type === 'marketing_agent';
  const agentMode = isMarketingAgent && searchParams.get('agent') === '1';

  useEffect(() => {
    document.title = 'RentalHub NG Survey';
    const savedType = localStorage.getItem(TYPE_KEY);
    if (savedType && localStorage.getItem(RESUME_KEY)) {
      setHasDraft(true);
    }
    if (savedType && savedType !== type) {
      setType(savedType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify once when the user returns with an unfinished draft.
  useEffect(() => {
    if (hasDraft && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(t('public_survey.notif_title', 'Finish your RentalHub survey'), {
          body: t('public_survey.notif_body', 'You have an unfinished survey. Continue where you left off.'),
          icon: '/rentalhub-mark.svg',
        });
      } catch {
        // some browsers require a user gesture
      }
    }
  }, [hasDraft, t]);

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotifState('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifState(permission);
    if (permission === 'granted') {
      try {
        new Notification(t('public_survey.notif_ok', 'Reminders on!'), {
          body: t('public_survey.notif_ok_body', "We'll remind you to finish your survey."),
        });
      } catch {
        // ignore
      }
    }
  };

  const pickType = (nextType) => {
    localStorage.setItem(TYPE_KEY, nextType);
    setType(nextType);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <FaCheckCircle className="text-2xl text-emerald-600" />
          </div>
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
          collectContacts
          agentMode={agentMode}
          onComplete={() => {
            localStorage.removeItem(TYPE_KEY);
            setSubmitted(true);
          }}
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

          {hasDraft && (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              <p className="font-semibold">{t('public_survey.draft_found', 'You have an unfinished survey')}</p>
              <button
                type="button"
                onClick={() => {
                  const savedType = localStorage.getItem(TYPE_KEY) || 'tenant';
                  setType(savedType);
                }}
                className="mt-1 font-semibold text-indigo-700 underline"
              >
                {t('public_survey.continue', 'Continue where you left off →')}
              </button>
            </div>
          )}

          <p className="mt-6 text-sm font-semibold text-gray-700">
            {agentMode
              ? t('public_survey.agent_choose', 'Conducting as an agent — who is the respondent?')
              : t('public_survey.choose', 'Who are you?')}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => pickType('tenant')}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500"
            >
              <p className="font-bold text-gray-900">{t('public_survey.tenant', 'Tenant / Rent Seeker')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.tenant_desc', 'Currently renting, looking for a home, or rented within the last 24 months.')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => pickType('landlord')}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500"
            >
              <p className="font-bold text-gray-900">{t('public_survey.landlord', 'Landlord / Property Owner')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.landlord_desc', 'Own or manage residential rental property in Nigeria.')}
              </p>
            </button>
          </div>

          {!hasDraft && (
            <button
              type="button"
              onClick={enableNotifications}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <FaBell className="text-gray-400" />
              {notifState === 'granted'
                ? t('public_survey.notif_on', 'Reminders on')
                : notifState === 'denied'
                  ? t('public_survey.notif_denied', 'Notifications blocked in browser')
                  : notifState === 'unsupported'
                    ? t('public_survey.notif_unsupported', 'Notifications not supported')
                    : t('public_survey.notif_cta', 'Remind me to finish later')}
            </button>
          )}

          <p className="mt-6 text-xs text-gray-400">
            {t('public_survey.privacy', 'Anonymous · Voluntary · Your identity is never linked to your answers')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicSurveyPage;
