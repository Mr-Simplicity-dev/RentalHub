import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

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
    state_id: '',
    lga_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [registrationFlags, setRegistrationFlags] = useState({
    loaded: false,
    allow_registration: true,
    nin_number: true,
    passport_number: true,
    tenant_registration_payment: false,
    landlord_registration_payment: false,
  });
  const [registrationPricing, setRegistrationPricing] = useState({
    amount: 2500,
    base_amount: 2500,
    location_required: false,
    location_complete: false,
    rule_scope: 'base',
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

  const requiresRegistrationPayment =
    (formData.user_type === 'tenant' && registrationFlags.tenant_registration_payment) ||
    (formData.user_type === 'landlord' && registrationFlags.landlord_registration_payment);

  const selectedStateOption = locationOptions.find(
    (item) => String(item.id) === String(formData.state_id)
  );
  const availableLgas = selectedStateOption?.lgas || [];
  const displayedRegistrationAmount =
    registrationPricing.amount ||
    (formData.user_type === 'tenant' ? 2500 : 5000);

  useEffect(() => {
    let mounted = true;

    const loadRegistrationFlags = async () => {
      try {
        const res = await api.get('/auth/registration-flags', {
          params: {
            user_type: formData.user_type,
            state_id: formData.state_id || undefined,
            lga_name: formData.lga_name || undefined,
          },
        });
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

        setRegistrationPricing(
          data.pricing || {
            amount: formData.user_type === 'tenant' ? 2500 : 5000,
            base_amount: formData.user_type === 'tenant' ? 2500 : 5000,
            location_required:
              data?.[`${formData.user_type}_registration_payment`] === true,
            location_complete: false,
            rule_scope: 'base',
          }
        );
      } catch (error) {
        console.error('Failed to load registration flags', error);

        if (mounted) {
          setRegistrationFlags((prev) => ({
            ...prev,
            loaded: true,
          }));

          setRegistrationPricing({
            amount: formData.user_type === 'tenant' ? 2500 : 5000,
            base_amount: formData.user_type === 'tenant' ? 2500 : 5000,
            location_required: false,
            location_complete: false,
            rule_scope: 'base',
          });
        }
      }
    };

    loadRegistrationFlags();

    return () => {
      mounted = false;
    };
  }, [formData.user_type, formData.state_id, formData.lga_name]);

  useEffect(() => {
    let active = true;

    const loadLocationOptions = async () => {
      try {
        const response = await api.get('/property-utils/location-options');

        if (active && response.data?.success) {
          setLocationOptions(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to load location options', error);
        if (active) {
          setLocationOptions([]);
        }
      }
    };

    loadLocationOptions();

    return () => {
      active = false;
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
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'state_id' ? { lga_name: '' } : {}),
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

  if (!registrationFlags.loaded) {
    toast.error("Registration settings are still loading");
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

  if (!termsAccepted) {
    toast.error("You must agree to the terms and privacy policy");
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

    if (requiresRegistrationPayment && !registrationData.state_id) {
      toast.error('Select your state to calculate the registration fee');
      return;
    }

    if (requiresRegistrationPayment && !String(registrationData.lga_name || '').trim()) {
      toast.error('Select your local government area to calculate the registration fee');
      return;
    }

    if (requiresRegistrationPayment && !registrationPricing.location_complete) {
      toast.error('Complete your location selection to confirm the exact registration fee');
      return;
    }

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


const [step, setStep] = useState(1);
const [errors, setErrors] = useState({});
const [termsAccepted, setTermsAccepted] = useState(false);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passportPattern = /^[A-Za-z0-9]{6,20}$/;

const getPasswordStrength = (pwd) => {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { label: 'Weak',   bar: 'w-1/4',  color: 'bg-red-500',    text: 'text-red-500'    };
  if (score <= 2) return { label: 'Fair',   bar: 'w-2/4',  color: 'bg-orange-400', text: 'text-orange-400' };
  if (score <= 3) return { label: 'Good',   bar: 'w-3/4',  color: 'bg-yellow-400', text: 'text-yellow-500' };
                  return { label: 'Strong', bar: 'w-full', color: 'bg-green-500',  text: 'text-green-600'  };
};

const validateStep = () => {
  let newErrors = {};

  if (step === 2) {
    if (!String(formData.full_name || "").trim()) newErrors.full_name = "Full name required";
    if (!String(formData.email || "").trim()) {
      newErrors.email = "Email required";
    } else if (!emailPattern.test(String(formData.email || "").trim())) {
      newErrors.email = "Enter a valid email";
    }
    if (!String(formData.phone || "").trim()) newErrors.phone = "Phone required";
    if (!String(formData.lawyer_email || "").trim()) {
      newErrors.lawyer_email = "Lawyer email required";
    } else if (!emailPattern.test(String(formData.lawyer_email || "").trim())) {
      newErrors.lawyer_email = "Enter a valid lawyer email";
    }
  }

  if (step === 3) {
    if (!registrationFlags.loaded) {
      newErrors.verification = "Loading registration requirements";
    }

    if (!formData.is_foreigner && registrationFlags.nin_number) {
      if (!String(formData.nin || "").trim()) {
        newErrors.nin = "NIN required";
      } else if (!/^\d{11}$/.test(formData.nin || "")) {
        newErrors.nin = "NIN must be exactly 11 digits";
      }
    }

    if (formData.is_foreigner && registrationFlags.passport_number) {
      if (!String(formData.international_passport_number || "").trim())
        newErrors.passport = "Passport required";
      else if (!passportPattern.test(formData.international_passport_number || "")) {
        newErrors.passport = "Enter a valid passport number";
      }
      if (!String(formData.nationality || "").trim())
        newErrors.nationality = "Nationality required";
    }

    if (requiresRegistrationPayment) {
      if (!formData.state_id) newErrors.state = "State required";
      if (!String(formData.lga_name || "").trim()) newErrors.lga = "LGA required";
      if (
        formData.state_id &&
        String(formData.lga_name || "").trim() &&
        !registrationPricing.location_complete
      ) {
        newErrors.lga = "Complete your location selection to confirm the exact fee";
      }
    }
  }

  if (step === 4) {
    if (!formData.password) newErrors.password = "Password required";
    if (formData.password.length < 8)
      newErrors.password = "Min 8 characters";
    if (formData.password !== formData.confirm_password)
      newErrors.confirm = "Passwords do not match";
    if (!termsAccepted) newErrors.terms = "You must agree to continue";
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const isStepTwoComplete =
  String(formData.full_name || "").trim() &&
  emailPattern.test(String(formData.email || "").trim()) &&
  String(formData.phone || "").trim() &&
  emailPattern.test(String(formData.lawyer_email || "").trim());

const isStepThreeComplete = (() => {
  if (!registrationFlags.loaded) {
    return false;
  }

  if (!formData.is_foreigner && registrationFlags.nin_number) {
    if (!/^\d{11}$/.test(formData.nin || "")) {
      return false;
    }
  }

  if (formData.is_foreigner && registrationFlags.passport_number) {
    if (!passportPattern.test(formData.international_passport_number || "")) {
      return false;
    }

    if (!String(formData.nationality || "").trim()) {
      return false;
    }
  }

  if (requiresRegistrationPayment) {
    if (!formData.state_id || !String(formData.lga_name || "").trim()) {
      return false;
    }

    if (!registrationPricing.location_complete) {
      return false;
    }
  }

  return true;
})();

const isStepFourComplete =
  String(formData.password || "").length >= 8 &&
  formData.password === formData.confirm_password &&
  termsAccepted;

const submitDisabled =
  loading ||
  !registrationFlags.loaded ||
  !registrationFlags.allow_registration ||
  (requiresRegistrationPayment && !registrationPricing.location_complete) ||
  !isStepFourComplete;


const inputClass = (field) =>
  `input ${errors[field] ? "border-red-500" : ""}`;

return (
  <div className="min-h-screen flex dark:bg-gray-900">

    {/* LEFT PANEL */}
    <div className="hidden md:flex w-1/2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-10">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center">
            <img src="/logo.png" className="w-12 h-12" alt="logo" />
          </div>
        </div>
        <h1 className="text-4xl font-bold">Create Your Account</h1>
        <p className="text-white/80">
          Complete a few steps to start managing rentals and legal services.
        </p>
        <p className="text-sm text-white/60">
          Trusted by landlords, tenants, and legal professionals.
        </p>
      </div>
    </div>

    {/* RIGHT PANEL */}
    <div className="flex w-full md:w-1/2 items-center justify-center px-6">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl space-y-6">

        {/* STEP BAR */}
        <div className="flex gap-2">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-2 flex-1 rounded ${step >= s ? 'bg-indigo-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="space-y-3 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
            </Link>
          </p>

          {requiresRegistrationPayment && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm text-blue-800">
              {formData.user_type === "tenant" ? "Tenant" : "Landlord"} account creation
              requires a one-time general platform payment of N
              {displayedRegistrationAmount.toLocaleString()} before the account is created
              for this location.
              {!registrationPricing.location_complete && (
                <div className="mt-2 text-xs text-blue-700">
                  Select your state and local government area to confirm the exact fee.
                </div>
              )}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity:0,x:40 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-40 }}>

            {/* STEP 1 — Account Type */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-center">Account Type</h2>

                {/* Registration disabled banner */}
                {!registrationFlags.allow_registration && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Registration is currently disabled by the platform administrator.
                  </div>
                )}

                {/* User type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">I am a:</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, user_type: 'tenant' }))}
                      className={`p-4 border-2 rounded-lg text-center transition-colors ${
                        formData.user_type === 'tenant'
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      <div className="font-semibold">Tenant</div>
                      <div className="text-sm text-gray-600">Looking for a property</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, user_type: 'landlord' }))}
                      className={`p-4 border-2 rounded-lg text-center transition-colors ${
                        formData.user_type === 'landlord'
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      <div className="font-semibold">Landlord</div>
                      <div className="text-sm text-gray-600">Listing a property</div>
                    </button>
                  </div>
                </div>

                {/* Applicant type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Applicant type:</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setApplicantType(false)}
                      className={`p-3 border rounded-lg text-sm transition-colors ${
                        !formData.is_foreigner
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      Local (Nigeria)
                    </button>

                    <button
                      type="button"
                      onClick={() => setApplicantType(true)}
                      className={`p-3 border rounded-lg text-sm transition-colors ${
                        formData.is_foreigner
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      Foreign Applicant
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!registrationFlags.allow_registration}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            )}

            {/* STEP 2 — Personal Info */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-center">Personal Info</h2>

                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaUser className="text-gray-400" />
                    </div>
                    <input
                      name="full_name"
                      type="text"
                      autoComplete="name"
                      value={formData.full_name}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, full_name: null })); }}
                      autoFocus
                      className={`input pl-10 ${errors.full_name ? 'border-red-500' : ''}`}
                      placeholder="Abdulkareem Ali"
                    />
                  </div>
                  {errors.full_name && <p className="text-red-500 text-sm mt-1">{errors.full_name}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="text-gray-400" />
                    </div>
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, email: null })); }}
                      className={`input pl-10 ${errors.email ? 'border-red-500' : ''}`}
                      placeholder="Abdlkal@example.com"
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaPhone className="text-gray-400" />
                    </div>
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, phone: null })); }}
                      className={`input pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                      placeholder="+2348012345678"
                    />
                  </div>
                  {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                </div>

                {/* Lawyer Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lawyer Email *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="text-gray-400" />
                    </div>
                    <input
                      name="lawyer_email"
                      type="email"
                      autoComplete="off"
                      value={formData.lawyer_email}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, lawyer_email: null })); }}
                      className={`input pl-10 ${errors.lawyer_email ? 'border-red-500' : ''}`}
                      placeholder="lawyer@example.com"
                    />
                  </div>
                  {errors.lawyer_email && <p className="text-red-500 text-sm mt-1">{errors.lawyer_email}</p>}
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="btn w-full">Back</button>
                  <button
                    type="button"
                    onClick={() => validateStep() && setStep(3)}
                    disabled={!isStepTwoComplete}
                    className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 — Verification & Location */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-center">Verification & Location</h2>

                {errors.verification && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {errors.verification}
                  </div>
                )}

                {/* NIN (local applicants) */}
                {!formData.is_foreigner && registrationFlags.nin_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NIN *</label>
                    <input
                      name="nin"
                      value={formData.nin}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, nin: null })); }}
                      className={inputClass('nin')}
                      placeholder="11-digit NIN"
                    />
                    {errors.nin && <p className="text-red-500 text-sm mt-1">{errors.nin}</p>}
                  </div>
                )}

                {/* Passport + Nationality (foreigners) */}
                {formData.is_foreigner && registrationFlags.passport_number && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Passport Number *</label>
                      <input
                        name="international_passport_number"
                        value={formData.international_passport_number}
                        onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, passport: null })); }}
                        className={inputClass('passport')}
                        placeholder="Passport Number"
                      />
                      {errors.passport && <p className="text-red-500 text-sm mt-1">{errors.passport}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nationality *</label>
                      <input
                        name="nationality"
                        value={formData.nationality}
                        onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, nationality: null })); }}
                        className={inputClass('nationality')}
                        placeholder="Nationality"
                      />
                      {errors.nationality && <p className="text-red-500 text-sm mt-1">{errors.nationality}</p>}
                    </div>
                  </>
                )}

                {/* State & LGA (payment-required) */}
                {requiresRegistrationPayment && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <select
                        name="state_id"
                        value={formData.state_id}
                        onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, state: null })); }}
                        className={inputClass('state')}
                      >
                        <option value="">Select state</option>
                        {locationOptions.map(s => (
                          <option key={s.id} value={s.id}>{s.state_name}</option>
                        ))}
                      </select>
                      {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Local Government Area *</label>
                      <select
                        name="lga_name"
                        value={formData.lga_name}
                        onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, lga: null })); }}
                        className={inputClass('lga')}
                        disabled={!formData.state_id}
                      >
                        <option value="">Select local government area</option>
                        {availableLgas.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                      {!registrationPricing.location_complete && formData.state_id && formData.lga_name && (
                        <p className="text-xs text-blue-600 mt-1">
                          Confirming location pricing...
                        </p>
                      )}
                      {errors.lga && <p className="text-red-500 text-sm mt-1">{errors.lga}</p>}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(2)} className="btn w-full">Back</button>
                  <button
                    type="button"
                    onClick={() => validateStep() && setStep(4)}
                    disabled={!isStepThreeComplete}
                    className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4 — Password & Submit */}
            {step === 4 && (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Payment notice */}
                {requiresRegistrationPayment && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    {formData.user_type === 'tenant' ? 'Tenant' : 'Landlord'} account creation
                    requires a one-time general platform payment of ₦
                    {displayedRegistrationAmount.toLocaleString()}
                    {' '}before the account is created for this location.
                    {!registrationPricing.location_complete && (
                      <div className="mt-2 text-xs text-blue-700">
                        Select your state and local government area to confirm the exact fee.
                      </div>
                    )}
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaLock className="text-gray-400" />
                    </div>
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, password: null })); }}
                      className={`input pl-10 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                      placeholder="Min. 8 characters"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
                  {/* Password strength indicator */}
                  {formData.password && (() => {
                    const strength = getPasswordStrength(formData.password);
                    return (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${strength.bar} ${strength.color}`} />
                        </div>
                        <p className={`text-xs font-medium ${strength.text}`}>
                          Password strength: {strength.label}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaLock className="text-gray-400" />
                    </div>
                    <input
                      name="confirm_password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={formData.confirm_password}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, confirm: null })); }}
                      className={`input pl-10 pr-10 ${
                        formData.confirm_password && formData.password !== formData.confirm_password
                          ? 'border-red-500'
                          : formData.confirm_password && formData.password === formData.confirm_password
                          ? 'border-green-500'
                          : errors.confirm ? 'border-red-500' : ''
                      }`}
                      placeholder="Re-enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(p => !p)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {/* Live mismatch / match feedback */}
                  {formData.confirm_password && (
                    formData.password !== formData.confirm_password
                      ? <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                      : <p className="text-green-600 text-xs mt-1">Passwords match ✓</p>
                  )}
                  {errors.confirm && !formData.confirm_password && (
                    <p className="text-red-500 text-sm mt-1">{errors.confirm}</p>
                  )}
                </div>

                {/* Terms */}
                <div className="flex items-start">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      setErrors((prev) => ({ ...prev, terms: null }));
                    }}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded mt-1 cursor-pointer"
                  />
                  <label htmlFor="terms" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                    I agree to the{' '}
                    <Link to="/terms" className="text-indigo-600 hover:text-indigo-500">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-indigo-600 hover:text-indigo-500">Privacy Policy</Link>
                  </label>
                </div>
                {errors.terms && <p className="text-red-500 text-sm mt-1">{errors.terms}</p>}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(3)} className="btn w-full">Back</button>

                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? (requiresRegistrationPayment ? 'Processing...' : 'Creating account...')
                      : requiresRegistrationPayment
                      ? `Pay ₦${displayedRegistrationAmount.toLocaleString()}`
                      : 'Create Account'}
                  </button>
                </div>

              </form>
            )}

          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  </div>
);

};

export default Register;
