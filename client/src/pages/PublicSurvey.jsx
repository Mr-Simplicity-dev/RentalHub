import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FaBell, FaCheckCircle, FaTimes } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import SurveyWizard from '../components/survey/SurveyWizard';

const RESUME_KEY = 'rentalhub_survey_resume';
const TYPE_KEY = 'rentalhub_survey_type';
const REMIND_KEY = 'rentalhub_survey_remind';
const GOOGLE_KEY = 'rentalhub_survey_google';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64Url);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
};

const decodeGoogleCredential = (credential) => {
  try {
    const base64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(window.atob(base64));
    return {
      email: payload.email || '',
      name: payload.name || payload.given_name || '',
    };
  } catch {
    return null;
  }
};

/**
 * Public survey page: rentalhub.com.ng/survey
 * - Blocking "Remind me to finish later" popup (attended before type choice)
 * - Google sign-in prefill (name editable) when available on the phone
 * - Marketing agent mode (?agent=1), draft resume, Web Push reminders
 */
const PublicSurveyPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [notifState, setNotifState] = useState('default');
  const [hasDraft, setHasDraft] = useState(false);
  const [prefillContact, setPrefillContact] = useState(null);
  const [locationState, setLocationState] = useState('checking'); // checking | ok | blocked
  const [locationBlockReason, setLocationBlockReason] = useState('');
  const [locationCoords, setLocationCoords] = useState(null);
  const googleButtonRef = useRef(null);
  const googleReady = useRef(false);

  const isMarketingAgent = user?.user_type === 'marketing_agent';
  const agentMode = isMarketingAgent && searchParams.get('agent') === '1';

  // Location/VPN gate: verify the device is inside the allowed area BEFORE
  // the reminder popup and any survey activity.
  useEffect(() => {
    let active = true;

    const runLocationGate = async () => {
      try {
        const configRes = await api.get('/survey/location-config');
        const config = configRes.data?.data || {};
        if (!config.gate_enabled) {
          if (active) setLocationState('ok');
          return;
        }

        const coords = await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: Number(pos.coords.latitude),
                lng: Number(pos.coords.longitude),
              }),
            () => resolve(null),
            { timeout: 8000, maximumAge: 60000 }
          );
        });

        // No GPS? Still ask the server — with the Nigeria scope a clean
        // Nigerian IP is enough (GPS-denied phones should not be blocked).
        const checkRes = await api.get(
          coords
            ? `/survey/location-check?lat=${coords.lat}&lng=${coords.lng}`
            : `/survey/location-check`
        );
        const result = checkRes.data?.data || {};
        if (!result.allowed) {
          if (active) {
            setLocationBlockReason(result.reason || 'not_in_area');
            setLocationState('blocked');
          }
          return;
        }

        if (active) {
          if (coords) {
            setLocationCoords(coords);
            localStorage.setItem('rentalhub_survey_coords', JSON.stringify(coords));
          }
          setLocationState('ok');
        }
      } catch {
        if (active) setLocationState('ok');
      }
    };

    runLocationGate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.title = 'RentalHub NG Survey';

    const savedType = localStorage.getItem(TYPE_KEY);
    const hasResume = Boolean(localStorage.getItem(RESUME_KEY));
    if (hasResume) {
      setHasDraft(true);
      if (savedType && savedType !== type) setType(savedType);
      return;
    }

    // Reminder popup: must be attended before choosing tenant/landlord.
    if (!localStorage.getItem(REMIND_KEY)) {
      setShowReminder(true);
    }

    const savedGoogle = localStorage.getItem(GOOGLE_KEY);
    if (savedGoogle) {
      try {
        setPrefillContact(JSON.parse(savedGoogle));
      } catch {
        // ignore malformed
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      return reg;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, [registerServiceWorker]);

  // Google Identity Services: render "Sign in with Google" button once.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleReady.current) return;
    if (typeof window.google?.accounts !== 'undefined') {
      renderGoogleButton();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.body.appendChild(script);

    function renderGoogleButton() {
      if (googleReady.current) return;
      googleReady.current = true;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const profile = decodeGoogleCredential(response.credential);
            if (profile && profile.email) {
              setPrefillContact({ name: profile.name || '', email: profile.email });
              localStorage.setItem(GOOGLE_KEY, JSON.stringify(profile));
            }
          },
          auto_select: false,
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
          });
        }
      } catch {
        // GIS failed to initialise — Google sign-in just won't show.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push subscription (only after the user opts in via the reminder popup).
  const enablePushReminders = async () => {
    setNotifState('requesting');
    if (typeof Notification === 'undefined') {
      setNotifState('unsupported');
      localStorage.setItem(REMIND_KEY, 'yes');
      setShowReminder(false);
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifState(permission);

    if (permission === 'granted') {
      const reg = await registerServiceWorker();
      if (reg) {
        try {
          const keyRes = await api.get('/survey/push/public-key');
          const publicKey = keyRes.data?.data?.public_key;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          await api.post('/survey/push/subscribe', {
            endpoint: sub.endpoint,
            keys: sub.toJSON().keys,
            resume_token: localStorage.getItem(RESUME_KEY) || '',
          });
        } catch {
          // push failed — fall back to in-page notification only
        }
      }
      try {
        new Notification(t('public_survey.notif_ok', 'Reminders on!'), {
          body: t('public_survey.notif_ok_body', "We'll remind you to finish your survey."),
        });
      } catch {
        // ignore
      }
    }

    localStorage.setItem(REMIND_KEY, permission === 'granted' ? 'yes' : 'no');
    setShowReminder(false);
  };

  const skipReminder = () => {
    localStorage.setItem(REMIND_KEY, 'no');
    setShowReminder(false);
  };

  // In-page nudge when returning with a draft (Web Push covers closed tabs).
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
          prefillContact={prefillContact}
          locationCoords={locationCoords}
          onComplete={() => {
            localStorage.removeItem(TYPE_KEY);
            setSubmitted(true);
          }}
        />
      </div>
    );
  }

  const LOCATION_MESSAGES = {
    location_required: t('public_survey.loc_required', 'We could not confirm your location. Please enable location access and try again.'),
    not_in_area: t('public_survey.loc_area', 'The survey is only available in the allowed survey area right now.'),
    vpn_detected: t('public_survey.loc_vpn', 'VPN connections are not allowed for this survey. Please turn off your VPN and try again.'),
    outside_nigeria: t('public_survey.loc_country', 'This survey is only available to respondents in Nigeria.'),
  };

  if (locationState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (locationState === 'blocked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl">
            ⛔
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('public_survey.loc_blocked_title', 'Survey not available here')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {LOCATION_MESSAGES[locationBlockReason] || t('public_survey.loc_generic', 'The survey is not available at your current location.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      {/* Blocking reminder popup — attended before choosing tenant/landlord */}
      {showReminder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <FaBell className="text-xl" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {t('public_survey.remind_title', 'Remind you to finish later?')}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {t('public_survey.remind_sub', 'The survey takes 15–20 minutes. If you get busy, we can send a reminder so you never lose your answers.')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={skipReminder}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t('public_survey.remind_close', 'Close')}
              >
                <FaTimes className="text-xl" />
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={enablePushReminders}
                disabled={notifState === 'requesting'}
                className="block w-full rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {notifState === 'requesting'
                  ? t('public_survey.remind_requesting', 'Asking your browser...')
                  : t('public_survey.remind_yes', 'Yes, remind me')}
              </button>
              <button
                type="button"
                onClick={skipReminder}
                className="block w-full rounded-xl border border-gray-300 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('public_survey.remind_no', "No, I'll finish now")}
              </button>
            </div>

            {notifState === 'denied' && (
              <p className="mt-3 text-center text-xs text-red-600">
                {t('public_survey.notif_denied', 'Notifications blocked in browser — you can still finish now or continue later from this page.')}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          {/* Google sign-in is the FIRST thing on the page */}
          {!agentMode && GOOGLE_CLIENT_ID && (
            <div className="mb-6 flex flex-col items-center gap-2">
              <div ref={googleButtonRef} />
              <p className="text-xs text-gray-400">
                {t('public_survey.google_hint', 'Start with Google — we fill in your name and email (you can still edit them).')}
              </p>
            </div>
          )}

          <h1 className="text-2xl font-bold text-gray-900">
            {t('public_survey.title', 'RentalHub NG SurveyResearch Survey')}
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

          <p className="mt-6 text-xs text-gray-400">
            {t('public_survey.privacy', 'Anonymous · Voluntary · Your identity is never linked to your answers')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicSurveyPage;
