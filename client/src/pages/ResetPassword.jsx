import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import TurnstileWidget from '../components/common/TurnstileWidget';

const ResetPassword = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!turnstileToken && process.env.REACT_APP_TURNSTILE_SITE_KEY)
      return toast.error('Please complete the security check.');

    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { password, turnstile_token: turnstileToken });
      toast.success(t('reset_password.toast.success'));
      navigate('/login');
    } catch {
      toast.error(t('reset_password.toast.error'));
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-4">{t('reset_password.title')}</h1>
        <input
          type="password"
          className="input mb-4"
          placeholder={t('reset_password.new_password_placeholder')}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? t('reset_password.resetting') : t('reset_password.reset_button')}</button>

        <div className="flex justify-center mt-3">
          <TurnstileWidget
            ref={turnstileRef}
            action="rentalhub_reset_password"
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />
        </div>
      </form>
    </div>
  );
};

export default ResetPassword;
