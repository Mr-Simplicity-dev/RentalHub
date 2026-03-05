import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';

const AcceptLawyerInvite = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      toast.error('Invite token is missing');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/lawyer/accept-invite', {
        token,
        full_name: formData.full_name,
        phone: formData.phone,
        password: formData.password,
      });

      if (response.data?.success) {
        const user = response.data?.data?.user;
        const authToken = response.data?.data?.token;

        if (authToken && user) {
          localStorage.setItem('token', authToken);
          localStorage.setItem('user', JSON.stringify(user));
          api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
          window.location.href = '/lawyer';
          return;
        }

        toast.success('Invite accepted. Please login.');
        navigate('/login');
      } else {
        toast.error(response.data?.message || 'Failed to accept invite');
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.errors?.[0]?.msg ||
        'Failed to accept invite';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4">
      <form onSubmit={handleSubmit} className="card max-w-md w-full p-6 space-y-4">
        <h1 className="text-xl font-bold">Activate Lawyer Access</h1>
        <p className="text-sm text-gray-600">
          Set your password to activate your invited lawyer account.
        </p>

        {!token && (
          <p className="text-sm text-red-600">
            Invite link is invalid. Contact super admin for a new invite.
          </p>
        )}

        <input
          name="full_name"
          type="text"
          className="input w-full"
          placeholder="Full name"
          value={formData.full_name}
          onChange={handleChange}
          required
        />

        <input
          name="phone"
          type="tel"
          className="input w-full"
          placeholder="+2348012345678"
          value={formData.phone}
          onChange={handleChange}
          required
        />

        <input
          name="password"
          type="password"
          className="input w-full"
          placeholder="Password (min 8 chars)"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <input
          name="confirm_password"
          type="password"
          className="input w-full"
          placeholder="Confirm password"
          value={formData.confirm_password}
          onChange={handleChange}
          required
        />

        <button
          type="submit"
          disabled={loading || !token}
          className="btn btn-primary w-full"
        >
          {loading ? 'Activating...' : 'Activate Lawyer Account'}
        </button>

        <div className="text-center text-sm">
          <Link to="/login" className="text-primary-600 hover:text-primary-500">
            Back to login
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AcceptLawyerInvite;
