import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import FloatingContactWidget from '../components/common/FloatingContactWidget';
import WhatsAppBotWidget from '../components/common/WhatsAppBotWidget';
import { toast } from 'react-toastify';
import { FaEnvelope, FaEye, FaEyeSlash, FaLock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const LOGIN_EMAIL_HISTORY_KEY = 'loginEmailHistory';
const MAX_LOGIN_EMAIL_SUGGESTIONS = 8;

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
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Load saved email if user previously checked Remember Me
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    setLoginEmailSuggestions(getStoredLoginEmails());

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

    try {
      const response = await login(email, password);
      if (response.success) {
        toast.success(t('login.success'));

        // Persist or clear remembered email
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        setLoginEmailSuggestions(saveLoginEmailSuggestion(email));

        const user = response.data?.user || {};
        const role = user.user_type;
        const isRecruitmentAdmin = role === 'recruitment_admin' || user.is_recruitment_admin === true;
        const redirectParam = searchParams.get('redirect');
        const safeRedirect = redirectParam && redirectParam.startsWith('/') ? redirectParam : '';

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
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

 return (
  <div className="min-h-screen flex dark:bg-gray-900">
    
    {/* LEFT PANEL */}
    <div className="hidden md:flex w-1/2 relative bg-gradient-to-br from-indigo-600 to-purple-600 text-white overflow-hidden">
      
      {/* ANIMATED BACKGROUND */}
      <div className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-120px] right-[-100px] w-96 h-96 bg-purple-400/20 rounded-full blur-3xl"></div>

      <div className="relative w-full flex flex-col items-center justify-center text-center px-10 space-y-6">
        
        {/* LOGO */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl shadow-xl border border-white/20">
          <img src="/rentalhub-mark.svg" alt="RentalHub NG" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
        </div>

        {/* BRAND */}
        <div className="text-lg font-bold text-white">
          RentalHub NG
        </div>

        {/* TITLE */}
        <h1 className="text-4xl font-bold">
          Welcome Back
        </h1>

        {/* DESCRIPTION */}
        <p className="text-lg text-white/80 max-w-md">
          Sign in to manage your properties, tenants, and legal activities securely.
        </p>

        <p className="text-sm text-white/60">
          Trusted by landlords, tenants, and legal professionals.
        </p>
      </div>
    </div>

    {/* RIGHT PANEL */}
    <div className="flex w-full md:w-1/2 items-center justify-center px-6">
      
      <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl space-y-6">

        {/* HEADER */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold dark:text-white">
            {t('login.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('login.or')}{' '}
            <Link to="/register" className="text-indigo-600 hover:underline">
              {t('login.create')}
            </Link>
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          
          {/* EMAIL */}
          <div className="relative">
            <FaEnvelope className="absolute left-3 top-3 text-gray-400" />
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              list="login-email-suggestions"
              className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={t('login.password_placeholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-3 text-gray-500"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          {/* REMEMBER + FORGOT */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer"
              />
              {t('login.remember')}
            </label>

            <Link to="/forgot-password" className="text-indigo-600 hover:underline">
              {t('login.forgot')}
            </Link>
          </div>

          {/* BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition"
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
