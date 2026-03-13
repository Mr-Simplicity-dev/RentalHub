import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
import api from '../services/api';

const Register = () => {
  const [searchParams] = useSearchParams();
  const registrationReference =
    searchParams.get('registration_ref') ||
    searchParams.get('reference') ||
    searchParams.get('trxref');
  const [formData, setFormData] = useState({
    user_type: 'tenant',
    full_name: '',
    email: '',
    lawyer_email: '',
    phone: '',
    password: '',
    confirm_password: '',
    is_foreigner: false,
    nin: '',
    international_passport_number: '',
    nationality: '',
  });
  const [loading, setLoading] = useState(false);
  const [registrationFlags, setRegistrationFlags] = useState({
    loaded: false,
    allow_registration: true,
    nin_number: true,
    passport_number: true,
    tenant_registration_payment: false,
    landlord_registration_payment: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const buildRegistrationData = () => {
    const { confirm_password, ...registrationData } = formData;
    registrationData.identity_document_type = registrationData.is_foreigner
      ? (registrationFlags.passport_number ? 'passport' : undefined)
      : (registrationFlags.nin_number ? 'nin' : undefined);
    registrationData.nationality = registrationData.is_foreigner
      ? registrationData.nationality
      : 'Nigeria';

    if (registrationData.is_foreigner) {
      registrationData.nin = '';
      if (!registrationFlags.passport_number) {
        registrationData.international_passport_number = '';
      }
    } else {
      registrationData.international_passport_number = '';
      if (!registrationFlags.nin_number) {
        registrationData.nin = '';
      }
    }

    if (!registrationData.identity_document_type) {
      delete registrationData.identity_document_type;
    }

    return registrationData;
  };

  const paymentAmountByRole = {
    tenant: 2500,
    landlord: 5000,
  };

  const requiresRegistrationPayment =
    (formData.user_type === 'tenant' && registrationFlags.tenant_registration_payment) ||
    (formData.user_type === 'landlord' && registrationFlags.landlord_registration_payment);

  useEffect(() => {
    let mounted = true;

    const loadRegistrationFlags = async () => {
      try {
        const res = await api.get('/auth/registration-flags');
        const data = res.data?.data || {};

        if (!mounted) return;

        setRegistrationFlags({
          loaded: true,
          allow_registration: data.allow_registration !== false,
          nin_number: data.nin_number !== false,
          passport_number: data.passport_number !== false,
          tenant_registration_payment: data.tenant_registration_payment === true,
          landlord_registration_payment: data.landlord_registration_payment === true,
        });

        setFormData((prev) => ({
          ...prev,
          nin: data.nin_number === false ? '' : prev.nin,
          international_passport_number:
            data.passport_number === false
              ? ''
              : prev.international_passport_number,
        }));
      } catch (error) {
        console.error('Failed to load registration flags', error);

        if (mounted) {
          setRegistrationFlags((prev) => ({
            ...prev,
            loaded: true,
          }));
        }
      }
    };

    loadRegistrationFlags();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const completeRegistration = async () => {
      if (!registrationReference) return;

      setLoading(true);

      try {
        const response = await api.post(
          `/auth/register/payment/complete/${registrationReference}`
        );

        if (!active) return;

        if (response.data?.success) {
          const { token, user } = response.data.data;

          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          toast.success('Registration successful. Verify email and phone next.');
          window.location.assign(
            user?.user_type === 'tenant'
              ? '/tenant/dashboard'
              : '/dashboard'
          );
        }
      } catch (error) {
        if (!active) return;

        const serverError = error.response?.data;
        toast.error(
          serverError?.message ||
          'Failed to complete registration after payment'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    completeRegistration();

    return () => {
      active = false;
    };
  }, [registrationReference]);

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

  if (!registrationFlags.allow_registration) {
    toast.error("Registration is currently disabled");
    return;
  }

  if (formData.password !== formData.confirm_password) {
    toast.error("Passwords do not match");
    return;
  }

  if (formData.password.length < 8) {
    toast.error("Password must be at least 8 characters");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.lawyer_email || "")) {
    toast.error("Enter one valid lawyer email");
    return;
  }

  // Nigerian verification
  if (!formData.is_foreigner && registrationFlags.nin_number) {
    if (!/^\d{11}$/.test(formData.nin || "")) {
      toast.error("NIN must be exactly 11 digits");
      return;
    }
  }

  // Foreigner verification
  if (formData.is_foreigner && registrationFlags.passport_number) {
    if (!/^[A-Za-z0-9]{6,20}$/.test(formData.international_passport_number || "")) {
      toast.error("Enter a valid international passport number");
      return;
    }

    if (!String(formData.nationality || "").trim()) {
      toast.error("Nationality is required for passport verification");
      return;
    }
  }

  setLoading(true);

  try {
    // Build cleaned payload
    const registrationData = buildRegistrationData();

    // Payment-required roles must complete payment before account creation
    if (requiresRegistrationPayment) {
      const paymentResponse = await api.post(
        "/auth/register/payment",
        registrationData
      );

      if (
        paymentResponse.data?.success &&
        paymentResponse.data?.data?.authorization_url
      ) {
        window.location.href = paymentResponse.data.data.authorization_url;
        return;
      }

      toast.error(
        paymentResponse.data?.message ||
        "Failed to initialize registration payment"
      );
      return;
    }

    // Roles without registration payment create the account immediately
    const response = await register(registrationData);

    if (response.success) {
      toast.success("Registration successful. Verify email and phone next.");

      const role =
        response.data?.user?.user_type || registrationData.user_type;

      navigate(role === "tenant" ? "/tenant/dashboard" : "/dashboard");
    } else {
      const firstError = response.errors?.[0];

      toast.error(
        firstError?.msg ||
        response.message ||
        "Registration failed"
      );
    }

  } catch (error) {
    const serverError = error.response?.data;
    const firstError = serverError?.errors?.[0];

    toast.error(
      firstError?.msg ||
      serverError?.message ||
      "Registration failed"
    );

    console.error(
      "Registration error response:",
      serverError || error.message
    );
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
  {requiresRegistrationPayment && (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      {formData.user_type === "tenant" ? "Tenant" : "Landlord"} account creation
      requires a one-time general platform payment of N
      {(paymentAmountByRole?.[formData.user_type] || 0).toLocaleString()}
      before the account is created.
    </div>
  )}

  {!registrationFlags.allow_registration && (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Registration is currently disabled by the platform administrator.
    </div>
  )}

  {/* USER TYPE */}
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      I am a:
    </label>

    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() =>
          setFormData((prev) => ({ ...prev, user_type: "tenant" }))
        }
        className={`p-4 border-2 rounded-lg text-center transition-colors ${
          formData.user_type === "tenant"
            ? "border-primary-600 bg-primary-50"
            : "border-gray-300 hover:border-primary-300"
        }`}
      >
        <div className="font-semibold">Tenant</div>
        <div className="text-sm text-gray-600">Looking for a property</div>
      </button>

      <button
        type="button"
        onClick={() =>
          setFormData((prev) => ({ ...prev, user_type: "landlord" }))
        }
        className={`p-4 border-2 rounded-lg text-center transition-colors ${
          formData.user_type === "landlord"
            ? "border-primary-600 bg-primary-50"
            : "border-gray-300 hover:border-primary-300"
        }`}
      >
        <div className="font-semibold">Landlord</div>
        <div className="text-sm text-gray-600">Listing a property</div>
      </button>
    </div>
  </div>

  {/* APPLICANT TYPE */}
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
            ? "border-primary-600 bg-primary-50"
            : "border-gray-300 hover:border-primary-300"
        }`}
      >
        Local (Nigeria)
      </button>

      <button
        type="button"
        onClick={() => setApplicantType(true)}
        className={`p-3 border rounded-lg text-sm transition-colors ${
          formData.is_foreigner
            ? "border-primary-600 bg-primary-50"
            : "border-gray-300 hover:border-primary-300"
        }`}
      >
        Foreign Applicant
      </button>
    </div>
  </div>

  {/* FORM FIELDS */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

    {/* FULL NAME */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Full Name *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaUser className="text-gray-400" />
        </div>

        <input
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

    {/* EMAIL */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Email Address *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaEnvelope className="text-gray-400" />
        </div>

        <input
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

    {/* PHONE */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Phone Number *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaPhone className="text-gray-400" />
        </div>

        <input
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

    {/* LAWYER EMAIL */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Lawyer Email *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaEnvelope className="text-gray-400" />
        </div>

        <input
          name="lawyer_email"
          type="email"
          required
          value={formData.lawyer_email}
          onChange={handleChange}
          className="input pl-10"
          placeholder="lawyer@example.com"
        />
      </div>
    </div>

    {/* PASSWORD */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Password *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaLock className="text-gray-400" />
        </div>

        <input
          name="password"
          type={showPassword ? "text" : "password"}
          required
          value={formData.password}
          onChange={handleChange}
          className="input pl-10 pr-10"
        />

        <button
          type="button"
          onClick={() => setShowPassword((p) => !p)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
    </div>

    {/* CONFIRM PASSWORD */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Confirm Password *
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaLock className="text-gray-400" />
        </div>

        <input
          name="confirm_password"
          type={showConfirmPassword ? "text" : "password"}
          required
          value={formData.confirm_password}
          onChange={handleChange}
          className="input pl-10 pr-10"
        />

        <button
          type="button"
          onClick={() => setShowConfirmPassword((p) => !p)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
        >
          {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
    </div>

  </div>

  {/* TERMS */}
  <div className="flex items-start">
    <input
      type="checkbox"
      required
      className="h-4 w-4 text-primary-600 border-gray-300 rounded mt-1"
    />

    <label className="ml-2 block text-sm text-gray-900">
      I agree to the{" "}
      <Link to="/terms" className="text-primary-600 hover:text-primary-500">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link to="/privacy" className="text-primary-600 hover:text-primary-500">
        Privacy Policy
      </Link>
    </label>
  </div>

  {/* SUBMIT */}
  <button
    type="submit"
    disabled={
      loading ||
      !registrationFlags.loaded ||
      !registrationFlags.allow_registration
    }
    className="w-full btn btn-primary py-3 text-lg"
  >
      {loading
      ? (requiresRegistrationPayment ? "Processing..." : "Creating account...")
      : requiresRegistrationPayment
      ? `Proceed to N${(paymentAmountByRole?.[formData.user_type] || 0).toLocaleString()} Payment`
      : "Create Account"}
  </button>
</form>
      </div>
    </div>
  );
};

export default Register;
