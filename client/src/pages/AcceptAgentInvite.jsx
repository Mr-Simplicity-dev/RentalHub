import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { setAuthSession } from '../services/authStorage';
import { useTranslation } from 'react-i18next';

const AcceptAgentInvite = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirm_password: '',
    consent: false,
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      toast.error(t('accept_agent_invite.token_missing'));
      return;
    }

    if (!String(formData.full_name || '').trim()) {
      toast.error(t('accept_agent_invite.name_required'));
      return;
    }

    if (!String(formData.phone || '').trim()) {
      toast.error(t('accept_agent_invite.phone_required'));
      return;
    }

    if (!formData.consent) {
      toast.error(t('accept_agent_invite.consent_required'));
      return;
    }

    if (String(formData.password || '').length < 8) {
      toast.error(t('accept_agent_invite.password_min_length'));
      return;
    }

    if (formData.password !== formData.confirm_password) {
      toast.error(t('accept_agent_invite.password_mismatch'));
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/agent/accept-invite', {
        token,
        full_name: formData.full_name,
        phone: formData.phone,
        password: formData.password,
      });

      if (res.data?.success && res.data?.data?.token) {
        const { token: authToken, user } = res.data.data;
        setAuthSession(authToken, user);
        api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
        toast.success(t('accept_agent_invite.activated'));
        window.location.href = '/agent/dashboard';
        return;
      }

      toast.error(res.data?.message || t('accept_agent_invite.activation_failed'));
    } catch (error) {
      toast.error(
        error.response?.data?.message || t('accept_agent_invite.activation_failed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex dark:bg-gray-900">
      <div className="hidden md:flex w-1/2 bg-gradient-to-br from-sky-600 to-indigo-700 text-white items-center justify-center">
        <div className="max-w-md px-10 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center">
              <img src="/rentalhub-mark.svg" className="h-12 w-12 rounded-xl object-contain shadow-sm" alt={t('accept_agent_invite.alt_logo')} />
            </div>
          </div>
          <h1 className="text-4xl font-bold">{t('accept_agent_invite.title')}</h1>
          <p className="text-white/80">
            {t('accept_agent_invite.subtitle')}
          </p>
        </div>
      </div>

      <div className="flex w-full md:w-1/2 items-center justify-center px-6">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold dark:text-white">{t('accept_agent_invite.heading')}</h2>
            <p className="text-sm text-gray-500">
              {t('accept_agent_invite.desc')}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              className="input w-full"
              placeholder={t('accept_agent_invite.full_name_placeholder')}
            />

            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input w-full"
              placeholder={t('accept_agent_invite.phone_placeholder')}
            />

            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                className="input w-full"
                placeholder={t('accept_agent_invite.password_placeholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-sm text-gray-500"
              >
                {showPassword ? t('accept_agent_invite.hide') : t('accept_agent_invite.show')}
              </button>
            </div>

            <div className="relative">
              <input
                name="confirm_password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirm_password}
                onChange={handleChange}
                className="input w-full"
                placeholder={t('accept_agent_invite.confirm_password_placeholder')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-sm text-gray-500"
              >
                {showConfirmPassword ? t('accept_agent_invite.hide') : t('accept_agent_invite.show')}
              </button>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="consent"
                checked={formData.consent}
                onChange={handleChange}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                {t('accept_agent_invite.agree_prefix')}<Link to="/terms" className="text-indigo-600 hover:underline">{t('accept_agent_invite.terms')}</Link>{t('accept_agent_invite.agree_separator')}<Link to="/privacy" className="text-indigo-600 hover:underline">{t('accept_agent_invite.privacy')}</Link>{t('accept_agent_invite.agree_suffix')}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('accept_agent_invite.activating') : t('accept_agent_invite.submit')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="text-indigo-600 hover:underline">
              {t('accept_agent_invite.back_to_login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcceptAgentInvite;
