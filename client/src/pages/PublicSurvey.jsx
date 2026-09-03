import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FaBell, FaCheckCircle, FaEnvelope, FaShieldAlt, FaTimes } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import SurveyWizard from '../components/survey/SurveyWizard';
import TurnstileWidget from '../components/common/TurnstileWidget';

const RESUME_KEY = 'rentalhub_survey_resume';
const TYPE_KEY = 'rentalhub_survey_type';
const REMIND_KEY = 'rentalhub_survey_remind';
const GOOGLE_KEY = 'rentalhub_survey_google';
const EMAIL_KEY = 'rentalhub_survey_email';
const EMAIL_GATE_KEY = 'rentalhub_survey_email_gate';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';

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

// Resolve GPS coordinates to { state, lga } names via the Google Maps
// Geocoder (admin enables surveys by state + LGA, so names are required).
const geocodeToStateAndLga = (lat, lng) =>
  new Promise((resolve) => {
    const loadMaps = () =>
      new Promise((res) => {
        if (window.google?.maps?.Geocoder) return res(true);
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&loading=async`;
        script.async = true;
        script.onload = () => res(true);
        script.onerror = () => res(false);
        document.body.appendChild(script);
        setTimeout(() => res(Boolean(window.google?.maps?.Geocoder)), 8000);
      });

    loadMaps().then((ok) => {
      if (!ok) return resolve(null);
      try {
        new window.google.maps.Geocoder().geocode(
          { location: { lat, lng } },
          (results) => {
            if (!results || !results.length) return resolve(null);
            let state = '';
            let lga = '';
            for (const component of results[0].address_components || []) {
              const types = component.types || [];
              if (types.includes('administrative_area_level_1')) {
                state = component.long_name || '';
              }
              if (types.includes('administrative_area_level_2')) {
                lga = component.long_name || '';
              }
            }
            // Fallback for places where the LGA surfaces as the locality.
            if (!lga) {
              for (const component of results[0].address_components || []) {
                if ((component.types || []).includes('locality')) {
                  lga = component.long_name || '';
                }
              }
            }
            resolve({ state, lga });
          }
        );
      } catch {
        resolve(null);
      }
    });
  });

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
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [gateEmail, setGateEmail] = useState('');
  const [notifState, setNotifState] = useState('default');
  const [hasDraft, setHasDraft] = useState(false);
  const [prefillContact, setPrefillContact] = useState(null);
  const [locationState, setLocationState] = useState('checking'); // checking | ok | blocked
  const [locationBlockReason, setLocationBlockReason] = useState('');
  const [locationInfo, setLocationInfo] = useState(null); // { state, lga }
const [doorPassed, setDoorPassed] = useState(false);
const [doorBusy, setDoorBusy] = useState(false);
const [doorError, setDoorError] = useState('');
const gateTurnstileRef = useRef(null);
const [surveyEnabled, setSurveyEnabled] = useState(null); // null = loading
  const googleButtonRef = useRef(null);
  const googleReady = useRef(false);

  const isMarketingAgent = user?.user_type === 'marketing_agent';
  const agentMode = isMarketingAgent && searchParams.get('agent') === '1';
  const agentModeRef = useRef(agentMode);
  agentModeRef.current = agentMode;

  // Location gate: resolve GPS -> state+LGA names (enabled per state/LGA),
  // then ask the server. VPNs are blocked server-side (consensus).
  useEffect(() => {
    let active = true;

    const runLocationGate = async () => {
      let gateOn = false;
      try {
        const configRes = await api.get('/survey/location-config');
        const config = configRes.data?.data || {};
        gateOn = Boolean(config.gate_enabled) && config.scope === 'lga_list';
        if (!gateOn) {
          if (active) {
            if (agentModeRef.current) {
              setLocationState('ok');
            } else {
              // Gate OFF = the public self-serve survey is closed. Marketing
              // agents (field/paper entry) are exempt.
              setLocationBlockReason('survey_closed');
              setLocationState('closed');
            }
          }
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

        if (!coords) {
          if (active) {
            setLocationBlockReason('location_required');
            setLocationState('blocked');
          }
          return;
        }

        const namesFor = (res) => ({
          state: String(res.state_name || res.device_state || '').trim(),
          lga: String(res.lga_name || res.device_lga || '').trim(),
        });

        let result;
        let names;
        if (config.boundary_available) {
          // Preferred: the server tests the raw GPS fix against official LGA
          // boundary polygons (covers the whole area council, e.g. anyone in
          // Zuba/Dobi inside the Gwagwalada polygon).
          const verifyRes = await api.post('/survey/location-verify', {
            lat: coords.lat,
            lng: coords.lng,
          });
          result = verifyRes.data?.data || {};
          names = namesFor(result);
          // Server claims boundary support but the file is absent — fall back
          // to the Google name-based check.
          if (result.boundary_available === false) {
            const place = await geocodeToStateAndLga(coords.lat, coords.lng);
            names = { state: place?.state || '', lga: place?.lga || '' };
            const checkRes = await api.get(
              `/survey/location-check?state=${encodeURIComponent(names.state)}&lga=${encodeURIComponent(names.lga)}`
            );
            result = checkRes.data?.data || {};
          }
        } else {
          const place = await geocodeToStateAndLga(coords.lat, coords.lng);
          names = { state: place?.state || '', lga: place?.lga || '' };
          if (!names.lga) {
            if (active) {
              setLocationBlockReason('location_required');
              setLocationState('blocked');
            }
            return;
          }
          const checkRes = await api.get(
            `/survey/location-check?state=${encodeURIComponent(names.state)}&lga=${encodeURIComponent(names.lga)}`
          );
          result = checkRes.data?.data || {};
        }

        if (!result.allowed) {
          if (active) {
            if (result.reason === 'survey_closed') {
              setLocationBlockReason('survey_closed');
              setLocationState('closed');
            } else {
              setLocationBlockReason(result.reason || 'lga_not_allowed');
              setLocationState('blocked');
            }
          }
          return;
        }

        const location = { state: names.state, lga: names.lga };
        if (active) {
          setLocationInfo(location);
          localStorage.setItem('rentalhub_survey_location', JSON.stringify(location));
          setLocationState('ok');
        }
      } catch {
        // If the availability check itself fails we cannot confirm the survey
        // is open, so the public sees it as closed (never fail open). Marketing
        // agents keep their field/paper entry path.
        if (active) {
          if (agentModeRef.current) {
            setLocationState('ok');
          } else {
            setLocationBlockReason('survey_closed');
            setLocationState('closed');
          }
        }
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
              setGateEmail(profile.email);
              localStorage.setItem(GOOGLE_KEY, JSON.stringify(profile));
              localStorage.setItem(EMAIL_KEY, profile.email);
              setShowEmailGate(false);
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

  // The email is now collected on the entry card (see below) — no separate
  // auto-popup, so a visitor is never asked twice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return;
  }, [locationState, showReminder, hasDraft, agentMode]);

  const acceptEmailGate = () => {
    const normalizedEmail = String(gateEmail || '').trim();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return;
    }
    if (normalizedEmail) localStorage.setItem(EMAIL_KEY, normalizedEmail);
    localStorage.setItem(EMAIL_GATE_KEY, '1');
    if (normalizedEmail) {
      setPrefillContact((prev) => ({ name: prev?.name || '', email: normalizedEmail }));
    }
    setShowEmailGate(false);
  };

  const skipEmailGate = () => {
    localStorage.setItem(EMAIL_GATE_KEY, '1');
    setShowEmailGate(false);
  };

  // "Door guard": verify the Turnstile challenge before the survey starts so
  // automated bots are stopped at the entrance (server verifies the token via
  // POST /survey/public/gate with action rentalhub_survey_entry).
  // #4 Respect the "Public Survey" on/off flag (agents may still capture).
  useEffect(() => {
    let mounted = true;
    api
      .get('/survey/public-flags')
      .then((res) => { if (mounted) setSurveyEnabled(res.data?.data?.survey_public_enabled === true); })
      .catch(() => { if (mounted) setSurveyEnabled(true); });
    return () => { mounted = false; };
  }, []);

  const verifyDoor = async (token) => {
    if (!token || doorBusy) return;
    const email = String(gateEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDoorError(t('public_survey.gate_email_required', 'An email address is required to continue.'));
      gateTurnstileRef.current?.reset();
      return;
    }
    setDoorBusy(true);
    setDoorError('');
    try {
      const res = await api.post('/survey/public/gate', { turnstile_token: token });
      if (res.data?.success) {
        // Persist the captured identity so the survey's contact step is prefilled.
        localStorage.setItem(EMAIL_KEY, email);
        setPrefillContact((prev) => ({
          name: String(prev?.name || '').trim() ? prev.name : email.split('@')[0],
          email,
        }));
        setDoorPassed(true);
      } else {
        setDoorError(res.data?.message || t('public_survey.door_failed', 'Security check failed. Please try again.'));
      }
    } catch (err) {
      setDoorError(err.response?.data?.message || t('public_survey.door_failed', 'Security check failed. Please try again.'));
    } finally {
      setDoorBusy(false);
    }
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
    // Carry the email provided at the access gate (or by Google) into the
    // wizard so the optional contact email field arrives pre-filled.
    const storedEmail = localStorage.getItem(EMAIL_KEY) || '';
    if (storedEmail && (!prefillContact?.email || prefillContact.email === storedEmail)) {
      setPrefillContact((prev) => ({ name: prev?.name || '', email: storedEmail }));
    }
    setShowEmailGate(false);
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

  if (surveyEnabled === false && !agentMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-2xl">
            <FaShieldAlt className="text-xl" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('public_survey.disabled_title', 'This survey is currently closed')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('public_survey.disabled_body', 'The survey is not accepting responses right now. Please check back later.')}
          </p>
        </div>
      </div>
    );
  }

  // The public self-serve survey is closed when the location gate is OFF.
  if (locationState === 'closed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('public_survey.closed_title', 'Survey closed')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('public_survey.closed_body', 'This survey is not currently open. Please check back later.')}
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
          locationInfo={locationInfo}
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
    lga_not_allowed: t('public_survey.loc_lga', 'The survey is not available yet for you in this local government area.'),
    boundary_out: t(
      'public_survey.loc_boundary',
      'Your device is outside the enabled survey boundary. Eligibility is checked against official local-government lines — if you are right on the boundary, normal GPS error can place you just outside. Retry from a clearer spot, or contact the survey team if you believe you qualify.'
    ),
    vpn_detected: t('public_survey.loc_vpn', 'VPN connections are not allowed for this survey. Please turn off your VPN and try again.'),
    outside_nigeria: t('public_survey.loc_country', 'This survey is only available to respondents in Nigeria.'),
    survey_closed: t('public_survey.closed_body', 'This survey is not currently open. Please check back later.'),
  };

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

  // Door guard: one Turnstile challenge before the survey can begin.
  if (locationState === 'ok' && !type && !agentMode && !doorPassed) {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(gateEmail || '').trim());
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <FaShieldAlt className="text-2xl" />
          </div>
          <h1 className="text-center text-xl font-bold text-gray-900">
            {t('public_survey.gate_title2', 'Let’s start with your email')}
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('public_survey.gate_body2', 'Your email is required and lets us send you the results. Use your Google account and we’ll fill it in for you.')}
          </p>

          {GOOGLE_CLIENT_ID && (
            <div className="mt-5 flex justify-center">
              <div ref={googleButtonRef} />
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">{t('public_survey.gate_name', 'Full name')}</span>
              <input
                type="text"
                value={prefillContact?.name || ''}
                onChange={(e) => setPrefillContact((p) => ({ ...(p || {}), name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                placeholder={t('public_survey.gate_name_ph', 'Your name')}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">{t('public_survey.gate_email_label', 'Email address')} *</span>
              <input
                type="email"
                value={gateEmail || ''}
                onChange={(e) => { setGateEmail(e.target.value.trim()); setDoorError(''); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-center">
            <TurnstileWidget
              ref={gateTurnstileRef}
              action="rentalhub_survey_entry"
              onToken={verifyDoor}
              onExpire={() => setDoorError(t('public_survey.door_expired', 'The security check expired. Please tick the box again.'))}
            />
          </div>
          {doorBusy && (
            <p className="mt-3 text-center text-sm text-gray-500">{t('public_survey.door_checking', 'Checking...')}</p>
          )}
          {doorError && (
            <p className="mt-3 text-center text-sm text-red-600" role="alert">{doorError}</p>
          )}
          {emailValid && doorPassed && (
            <p className="mt-3 text-center text-sm text-emerald-600">
              {t('public_survey.gate_ok', 'You’re all set — choose your account type to begin.')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      {/* Blocking reminder popup — appears after location passes, before choosing */}
      {locationState === 'ok' && showReminder && (
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

      {/* Email access gate — collect an email before starting the survey so
          the optional contact field is pre-filled (Google fills this too) */}
      {locationState === 'ok' && showEmailGate && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <FaEnvelope className="text-xl" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {t('public_survey.gate_title', 'Access the survey with your email')}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {t('public_survey.gate_sub', 'Tell us where to send your survey access and results — the field is optional in the survey itself.')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={skipEmailGate}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t('public_survey.gate_close', 'Close')}
              >
                <FaTimes className="text-xl" />
              </button>
            </div>

            <div className="mt-5">
              <label htmlFor="survey-gate-email" className="mb-1 block text-sm font-medium text-gray-700">
                {t('public_survey.gate_email_label', 'Email address')}
              </label>
              <input
                id="survey-gate-email"
                type="email"
                value={gateEmail}
                onChange={(e) => setGateEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    acceptEmailGate();
                  }
                }}
                placeholder={t('public_survey.gate_email_ph', 'you@example.com')}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              {gateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gateEmail.trim()) && (
                <p className="mt-1 text-xs text-red-600">
                  {t('public_survey.gate_email_invalid', 'Please enter a valid email address.')}
                </p>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={acceptEmailGate}
                className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t('public_survey.gate_start', 'Start the survey')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('public_survey.title', 'RentalHub NG Research Survey')}
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

          {locationState === 'checking' && (
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-400">
              <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-indigo-600" />
              {t('public_survey.loc_checking', 'Confirming your local government area…')}
            </p>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => pickType('tenant')}
              disabled={locationState === 'checking'}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="font-bold text-gray-900">{t('public_survey.tenant', 'Tenant / Rent Seeker')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.tenant_desc', 'Currently renting, looking for a home, or rented within the last 24 months.')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => pickType('landlord')}
              disabled={locationState === 'checking'}
              className="rounded-xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="font-bold text-gray-900">{t('public_survey.landlord', 'Landlord / Property Owner')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {t('public_survey.landlord_desc', 'Own or manage residential rental property in Nigeria.')}
              </p>
            </button>
          </div>

          {!agentMode && locationState === 'ok' && (
            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {t(
                'public_survey.boundary_note',
                'Location note: eligibility is verified with GPS against official local-government boundaries. If you are near an area boundary, normal phone GPS error can put you just outside and lock you out — step away from the line and retry.'
              )}
            </p>
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
