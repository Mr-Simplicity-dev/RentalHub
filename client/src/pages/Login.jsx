import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import FloatingContactWidget from '../components/common/FloatingContactWidget';
import WhatsAppBotWidget from '../components/common/WhatsAppBotWidget';
import TurnstileWidget from '../components/common/TurnstileWidget';
import { toast } from 'react-toastify';
import { FaEnvelope, FaEye, FaEyeSlash, FaLock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const LOGIN_EMAIL_HISTORY_KEY = 'loginEmailHistory';
const MAX_LOGIN_EMAIL_SUGGESTIONS = 8;
const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

const getStoredLoginEmails = () => {
  try {
    const rawEmails = JSON.parse(localStorage.getItem(LOGIN_EMAIL_HISTORY_KEY) || '[]');
    const legacyEmail = localStorage.getItem('rememberedEmail');
    const emails = Array.isArray(rawEmails) ? rawEmails : [];

    if (legacyEmail) {
      emails.unshift(legacyEmail);
    }

    return [...new Set(
      emails
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    )].slice(0, MAX_LOGIN_EMAIL_SUGGESTIONS);
  } catch {
    return [];
  }
};

const saveLoginEmailSuggestion = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return [];
  }

  try {
    const nextEmails = [
      normalizedEmail,
      ...getStoredLoginEmails().filter((item) => item !== normalizedEmail),
    ].slice(0, MAX_LOGIN_EMAIL_SUGGESTIONS);

    localStorage.setItem(LOGIN_EMAIL_HISTORY_KEY, JSON.stringify(nextEmails));
    return nextEmails;
  } catch {
    return [];
  }
};

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginEmailSuggestions, setLoginEmailSuggestions] = useState([]);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Load saved email if user previously checked Remember Me
  useEffect(() => {
    setLoginEmailSuggestions(getStoredLoginEmails());

    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const matchingEmailSuggestions = email.trim()
    ? loginEmailSuggestions.filter((item) =>
        item.toLowerCase().startsWith(email.trim().toLowerCase())
      )
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!turnstileToken && process.env.REACT_APP_TURNSTILE_SITE_KEY) {
      toast.error('Please complete the security check.');
      setLoading(false);
      return;
    }

    try {
      const response = await login(email, password, turnstileToken);
      if (response.success) {
        toast.success(t('login.success'));

        // Persist or clear remembered email
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
          setLoginEmailSuggestions(saveLoginEmailSuggestion(email));
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }

        const user = response.data?.user || {};
        const role = user.user_type;
        const isRecruitmentAdmin = role === 'recruitment_admin' || user.is_recruitment_admin === true;
        const redirectParam = searchParams.get('redirect');
        const allowedPaths = ['/dashboard', '/tenant/dashboard', '/super-admin', '/profile', '/applications', '/messages', '/saved-properties', '/payment-history', '/my-properties', '/verification-status', '/subscribe', '/my-disputes', '/my-damage-reports', '/subscribed-properties'];
        const safeRedirect = redirectParam && redirectParam.startsWith('/') && !redirectParam.includes('//') && allowedPaths.some(p => redirectParam === p || redirectParam.startsWith(p + '/')) ? redirectParam : '';

        if (safeRedirect) {
          navigate(safeRedirect);
          return;
        }

        if (role === 'super_admin') {
          navigate('/super-admin');
        } else if (role === 'super_support_admin') {
          navigate('/admin/super-support-dashboard');
        } else if (isRecruitmentAdmin) {
          navigate('/admin/recruitment');
        } else if (role === 'state_support_admin') {
          navigate('/admin/state-support-dashboard');
        } else if (role === 'lga_support_admin') {
          navigate('/admin/lga-support-dashboard');
        } else if (role === 'super_financial_admin') {
          navigate('/admin/super-financial-dashboard');
        } else if (role === 'financial_admin' || role === 'lga_financial_admin') {
          navigate('/admin/financial-dashboard');
        } else if (role === 'state_admin' || role === 'state_financial_admin') {
          navigate('/admin');
        } else if (role === 'admin' || role === 'lga_admin') {
          navigate('/admin');
        } else if (role === 'super_fumigation_admin') {
                    navigate('/super-admin/fumigation-cleaning');
        } else if (role === 'state_fumigation_admin') {
          navigate('/admin/fumigation-cleaning/state');
        } else if (role === 'fumigation_admin' || role === 'lga_fumigation_admin') {
          navigate('/admin/fumigation-cleaning');
        } else if (role === 'super_transportation_admin') {
                    navigate('/super-admin/transportation');
        } else if (role === 'state_transportation_admin') {
          navigate('/admin/transportation/state');
        } else if (role === 'transportation_admin' || role === 'lga_transportation_admin') {
          navigate('/admin/transportation');
        } else if (role === 'super_lawyer') {
          navigate('/lawyer/super');
        } else if (role === 'state_lawyer') {
          navigate('/lawyer/state');
        } else if (role === 'lawyer') {
          navigate('/lawyer');
        } else if (role === 'agent') {
          navigate('/agent/dashboard');
        } else if (role === 'landlord') {
          navigate('/dashboard');
        } else {
          navigate('/tenant/dashboard');
        }
      } else {
        toast.error(response.message || t('login.failed'));
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    } catch (error) {
  const status = error.response?.status;
  const serverError = error.response?.data;

  console.error('Login request failed:', {
    status,
    message: serverError?.message || error.message,
    code: serverError?.code,
    errors: serverError?.errors,
    response: serverError,
  });

  toast.error(
    serverError?.message ||
      error.message ||
      t('login.failed')
  );

  setTurnstileToken(null);
  turnstileRef.current?.reset();
} finally {
  setLoading(false);
}
  };

 return (
  <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">

    {/* LEFT PANEL */}
    <div className="relative hidden w-1/2 overflow-hidden bg-slate-950 text-white md:flex">

      {/* BACKGROUND IMAGE + OVERLAY */}
      <img
        src="/login-terrace.avif"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-primary-900/80 to-primary-700/80" />

      {/* ANIMATED BACKGROUND */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary-500/20 blur-3xl"></div>
        <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full bg-state-500/10 blur-3xl"></div>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center space-y-6 px-10 text-center">

        {/* LOGO */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-xl backdrop-blur-xl">
          <img src="/rentalhub-mark.svg" alt="RentalHub NG" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
        </div>

        {/* BRAND */}
        <div className="text-lg font-bold text-white">
          RentalHub NG
        </div>

        {/* TITLE */}
        <h1 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">
          {t('login.welcome_back')}
        </h1>

        {/* DESCRIPTION */}
        <p className="max-w-md text-lg text-primary-100">
          {t('login.left_panel_desc')}
        </p>

        <p className="text-sm text-white/60">
          {t('login.trusted')}
        </p>
      </div>
    </div>

    {/* RIGHT PANEL */}
    <div className="flex w-full items-center justify-center px-6 py-12 md:w-1/2">

      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-elevated ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">

        {/* HEADER */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('login.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('login.or')}{' '}
            <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              {t('login.create')}
            </Link>
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>

          {/* EMAIL */}
          <div className="relative">
            <FaEnvelope className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              list="login-email-suggestions"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder={t('login.email_placeholder')}
            />
            <datalist id="login-email-suggestions">
              {matchingEmailSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          {/* PASSWORD */}
          <div className="relative">
            <FaLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-slate-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder={t('login.password_placeholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          {/* REMEMBER + FORGOT */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex cursor-pointer select-none items-center gap-2 text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              {t('login.remember')}
            </label>

            <Link to="/forgot-password" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              {t('login.forgot')}
            </Link>
          </div>

          {/* TURNSTILE */}
          <TurnstileWidget
            ref={turnstileRef}
            action="rentalhub_login"
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />

          {/* BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white shadow-elevated transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {loading ? t('login.signing') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
      <FloatingContactWidget />
      <WhatsAppBotWidget />
  </div>
);
};

export default Login;
