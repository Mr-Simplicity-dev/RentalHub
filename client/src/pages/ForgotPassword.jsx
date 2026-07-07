import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { toast } from 'react-toastify';

const ForgotPassword = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      toast.success(t('forgot_password.toast.success'));
    } catch {
      toast.error(t('forgot_password.toast.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-4">{t('forgot_password.title')}</h1>
        <input
          className="input mb-4"
          placeholder={t('forgot_password.email_placeholder')}
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? t('forgot_password.sending') : t('forgot_password.send_reset_link')}</button>
      </form>
    </div>
  );
};

export default ForgotPassword;
