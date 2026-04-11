import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { setAuthSession } from '../services/authStorage';

const AcceptAgentInvite = () => {
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
      toast.error('Agent invite token is missing');
      return;
    }

    if (!String(formData.full_name || '').trim()) {
      toast.error('Full name is required');
      return;
    }

    if (!String(formData.phone || '').trim()) {
      toast.error('Phone number is required');
      return;
    }

    if (!formData.consent) {
      toast.error('You must agree to the terms and privacy policy');
      return;
    }

    if (String(formData.password || '').length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      toast.error('Passwords do not match');
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
        toast.success('Agent access activated successfully');
        window.location.href = '/agent/dashboard';
        return;
      }

      toast.error(res.data?.message || 'Failed to activate agent access');
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to activate agent access'
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
              <img src="/logo.png" className="w-12 h-12" alt="logo" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">Activate Agent Access</h1>
          <p className="text-white/80">
            Complete your details to start helping a landlord manage listings and other approved property tasks on RentalHub NG.
          </p>
        </div>
      </div>

      <div className="flex w-full md:w-1/2 items-center justify-center px-6">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold dark:text-white">Accept Agent Invite</h2>
            <p className="text-sm text-gray-500">
              Create your password and activate your agent dashboard.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              className="input w-full"
              placeholder="Full name"
            />

            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input w-full"
              placeholder="Phone number (+234...)"
            />

            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                className="input w-full"
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-sm text-gray-500"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="relative">
              <input
                name="confirm_password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirm_password}
                onChange={handleChange}
                className="input w-full"
                placeholder="Confirm password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-sm text-gray-500"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
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
                I agree to the <Link to="/terms" className="text-indigo-600 hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Activating...' : 'Activate Agent Access'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="text-indigo-600 hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcceptAgentInvite;
