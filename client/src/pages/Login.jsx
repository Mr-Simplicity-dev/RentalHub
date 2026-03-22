import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import { FaEnvelope, FaEye, FaEyeSlash, FaLock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const Login = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await login(email, password);
      if (response.success) {
  toast.success(t('login.success'));

  // const user = response.data?.user;
  const role = response.data?.user?.user_type;

        if (role === 'super_admin') {
          navigate('/super-admin');
        } else if (role === 'admin') {
          navigate('/admin');
        } else if (role === 'lawyer') {
          navigate('/lawyer');
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
          <img src="/logo.png" alt="RentPro" className="w-12 h-12" />
        </div>

        {/* BRAND */}
        <div className="text-lg font-semibold text-white/90">
          RentPro
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
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={t('login.email_placeholder')}
            />
          </div>

          {/* PASSWORD */}
          <div className="relative">
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            <label className="flex items-center gap-2">
              <input type="checkbox" />
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
  </div>
);
};

export default Login;
