import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaLock, FaIdCard } from 'react-icons/fa';

const Register = () => {
  const [formData, setFormData] = useState({
    user_type: 'tenant',
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    is_foreigner: false,
    nin: '',
    international_passport_number: '',
    nationality: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const setApplicantType = (isForeigner) => {
    setFormData((prev) => ({
      ...prev,
      is_foreigner: isForeigner,
      nin: isForeigner ? '' : prev.nin,
      international_passport_number: isForeigner ? prev.international_passport_number : '',
      nationality: isForeigner ? prev.nationality : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (!formData.is_foreigner) {
      if (!/^\d{11}$/.test(formData.nin || '')) {
        toast.error('NIN must be exactly 11 digits');
        return;
      }
    } else {
      if (!/^[A-Za-z0-9]{6,20}$/.test(formData.international_passport_number || '')) {
        toast.error('Enter a valid international passport number');
        return;
      }
      if (!String(formData.nationality || '').trim()) {
        toast.error('Nationality is required for passport verification');
        return;
      }
    }

    setLoading(true);

    try {
      const { confirm_password, ...registrationData } = formData;
      registrationData.identity_document_type = registrationData.is_foreigner ? 'passport' : 'nin';
      registrationData.nationality = registrationData.is_foreigner
        ? registrationData.nationality
        : 'Nigeria';

      const response = await register(registrationData);

      if (response.success) {
        toast.success('Registration successful. Verify email and phone next.');
        navigate('/dashboard');
      } else {
        toast.error(response.message || 'Registration failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Sign in
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              I am a:
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, user_type: 'tenant' }))}
                className={`p-4 border-2 rounded-lg text-center transition-colors ${
                  formData.user_type === 'tenant'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300'
                }`}
              >
                <div className="font-semibold">Tenant</div>
                <div className="text-sm text-gray-600">Looking for a property</div>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, user_type: 'landlord' }))}
                className={`p-4 border-2 rounded-lg text-center transition-colors ${
                  formData.user_type === 'landlord'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300'
                }`}
              >
                <div className="font-semibold">Landlord</div>
                <div className="text-sm text-gray-600">Listing a property</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Applicant type:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setApplicantType(false)}
                className={`p-3 border rounded-lg text-sm transition-colors ${
                  !formData.is_foreigner
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300'
                }`}
              >
                Local (Nigeria)
              </button>
              <button
                type="button"
                onClick={() => setApplicantType(true)}
                className={`p-3 border rounded-lg text-sm transition-colors ${
                  formData.is_foreigner
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300'
                }`}
              >
                Foreign Applicant
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaUser className="text-gray-400" />
                </div>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaEnvelope className="text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaPhone className="text-gray-400" />
                </div>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="+2348012345678"
                />
              </div>
            </div>

            {!formData.is_foreigner ? (
              <div>
                <label htmlFor="nin" className="block text-sm font-medium text-gray-700 mb-1">
                  NIN (National ID Number) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FaIdCard className="text-gray-400" />
                  </div>
                  <input
                    id="nin"
                    name="nin"
                    type="text"
                    required
                    maxLength="11"
                    value={formData.nin}
                    onChange={handleChange}
                    className="input pl-10"
                    placeholder="12345678901"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">11 digits required</p>
              </div>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="international_passport_number"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    International Passport No. *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" />
                    </div>
                    <input
                      id="international_passport_number"
                      name="international_passport_number"
                      type="text"
                      required
                      value={formData.international_passport_number}
                      onChange={handleChange}
                      className="input pl-10"
                      placeholder="A12345678"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="nationality" className="block text-sm font-medium text-gray-700 mb-1">
                    Nationality *
                  </label>
                  <input
                    id="nationality"
                    name="nationality"
                    type="text"
                    required
                    value={formData.nationality}
                    onChange={handleChange}
                    className="input"
                    placeholder="Ghanaian"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="Min. 8 characters"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaLock className="text-gray-400" />
                </div>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  value={formData.confirm_password}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
          </div>

          <div className="flex items-start">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-900">
              I agree to the{' '}
              <Link to="/terms" className="text-primary-600 hover:text-primary-500">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-primary-600 hover:text-primary-500">
                Privacy Policy
              </Link>
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 text-lg"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
