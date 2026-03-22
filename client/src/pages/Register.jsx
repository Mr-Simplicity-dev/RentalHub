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

    if (requiresRegistrationPayment && !registrationData.state_id) {
      toast.error('Select your state to calculate the registration fee');
      return;
    }

    if (requiresRegistrationPayment && !String(registrationData.lga_name || '').trim()) {
      toast.error('Select your local government area to calculate the registration fee');
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

// //   return (
// //     <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
// //       <div className="max-w-2xl w-full space-y-8">
// //         <div>
// //           <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
// //             Create your account
// //           </h2>
// //           <p className="mt-2 text-center text-sm text-gray-600">
// //             Already have an account?{' '}
// //             <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
// //               Sign in
// //             </Link>
// //           </p>
// //         </div>

// //         <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
// //   {requiresRegistrationPayment && (
// //     <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
// //       {formData.user_type === "tenant" ? "Tenant" : "Landlord"} account creation
// //       requires a one-time general platform payment of N
// //       {displayedRegistrationAmount.toLocaleString()}
// //        before the account is created for this location.
// //       {!registrationPricing.location_complete && (
// //         <div className="mt-2 text-xs text-blue-700">
// //           Select your state and local government area to confirm the exact fee.
// //         </div>
// //       )}
// //     </div>
// //   )}

// //   {!registrationFlags.allow_registration && (
// //     <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
// //       Registration is currently disabled by the platform administrator.
// //     </div>
// //   )}

// //   {/* USER TYPE */}
// //   <div>
// //     <label className="block text-sm font-medium text-gray-700 mb-2">
// //       I am a:
// //     </label>

// //     <div className="grid grid-cols-2 gap-4">
// //       <button
// //         type="button"
// //         onClick={() =>
// //           setFormData((prev) => ({ ...prev, user_type: "tenant" }))
// //         }
// //         className={`p-4 border-2 rounded-lg text-center transition-colors ${
// //           formData.user_type === "tenant"
// //             ? "border-primary-600 bg-primary-50"
// //             : "border-gray-300 hover:border-primary-300"
// //         }`}
// //       >
// //         <div className="font-semibold">Tenant</div>
// //         <div className="text-sm text-gray-600">Looking for a property</div>
// //       </button>

// //       <button
// //         type="button"
// //         onClick={() =>
// //           setFormData((prev) => ({ ...prev, user_type: "landlord" }))
// //         }
// //         className={`p-4 border-2 rounded-lg text-center transition-colors ${
// //           formData.user_type === "landlord"
// //             ? "border-primary-600 bg-primary-50"
// //             : "border-gray-300 hover:border-primary-300"
// //         }`}
// //       >
// //         <div className="font-semibold">Landlord</div>
// //         <div className="text-sm text-gray-600">Listing a property</div>
// //       </button>
// //     </div>
// //   </div>

// //   {/* APPLICANT TYPE */}
// //   <div>
// //     <label className="block text-sm font-medium text-gray-700 mb-2">
// //       Applicant type:
// //     </label>

// //     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
// //       <button
// //         type="button"
// //         onClick={() => setApplicantType(false)}
// //         className={`p-3 border rounded-lg text-sm transition-colors ${
// //           !formData.is_foreigner
// //             ? "border-primary-600 bg-primary-50"
// //             : "border-gray-300 hover:border-primary-300"
// //         }`}
// //       >
// //         Local (Nigeria)
// //       </button>

// //       <button
// //         type="button"
// //         onClick={() => setApplicantType(true)}
// //         className={`p-3 border rounded-lg text-sm transition-colors ${
// //           formData.is_foreigner
// //             ? "border-primary-600 bg-primary-50"
// //             : "border-gray-300 hover:border-primary-300"
// //         }`}
// //       >
// //         Foreign Applicant
// //       </button>
// //     </div>
// //   </div>

// //   {requiresRegistrationPayment && (
// //     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
// //       <div>
// //         <label className="block text-sm font-medium text-gray-700 mb-1">
// //           State *
// //         </label>
// //         <select
// //           name="state_id"
// //           value={formData.state_id}
// //           onChange={handleChange}
// //           className="input"
// //           required={requiresRegistrationPayment}
// //         >
// //           <option value="">Select state</option>
// //           {locationOptions.map((state) => (
// //             <option key={state.id} value={state.id}>
// //               {state.state_name}
// //             </option>
// //           ))}
// //         </select>
// //       </div>

// //       <div>
// //         <label className="block text-sm font-medium text-gray-700 mb-1">
// //           Local Government Area *
// //         </label>
// //         <select
// //           name="lga_name"
// //           value={formData.lga_name}
// //           onChange={handleChange}
// //           className="input"
// //           required={requiresRegistrationPayment}
// //           disabled={!formData.state_id}
// //         >
// //           <option value="">Select local government area</option>
// //           {availableLgas.map((lga) => (
// //             <option key={lga} value={lga}>
// //               {lga}
// //             </option>
// //           ))}
// //         </select>
// //       </div>
// //     </div>
// //   )}

// //   {/* FORM FIELDS */}
// //   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

//     {/* FULL NAME */}
//     <div>
//       <label className="block text-sm font-medium text-gray-700 mb-1">
//         Full Name *
//       </label>

//       <div className="relative">
//         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//           <FaUser className="text-gray-400" />
//         </div>

//         <input
//           name="full_name"
//           type="text"
//           required
//           value={formData.full_name}
//           onChange={handleChange}
//           className="input pl-10"
//           placeholder="John Doe"
//         />
//       </div>
//     </div>

//     {/* EMAIL */}
//     <div>
//       <label className="block text-sm font-medium text-gray-700 mb-1">
//         Email Address *
//       </label>

//       <div className="relative">
//         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//           <FaEnvelope className="text-gray-400" />
//         </div>

//         <input
//           name="email"
//           type="email"
//           required
//           value={formData.email}
//           onChange={handleChange}
//           className="input pl-10"
//           placeholder="john@example.com"
//         />
//       </div>
//     </div>

//     {/* PHONE */}
//     <div>
//       <label className="block text-sm font-medium text-gray-700 mb-1">
//         Phone Number *
//       </label>

//       <div className="relative">
//         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//           <FaPhone className="text-gray-400" />
//         </div>

//         <input
//           name="phone"
//           type="tel"
//           required
//           value={formData.phone}
//           onChange={handleChange}
//           className="input pl-10"
//           placeholder="+2348012345678"
//         />
//       </div>
//     </div>

//     {/* LAWYER EMAIL */}
//     <div>
//       <label className="block text-sm font-medium text-gray-700 mb-1">
//         Lawyer Email *
//       </label>

//       <div className="relative">
//         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//           <FaEnvelope className="text-gray-400" />
//         </div>

//         <input
//           name="lawyer_email"
//           type="email"
//           required
//           value={formData.lawyer_email}
//           onChange={handleChange}
//           className="input pl-10"
//           placeholder="lawyer@example.com"
//         />
//       </div>
//     </div>

// //     {/* PASSWORD */}
// //     <div>
// //       <label className="block text-sm font-medium text-gray-700 mb-1">
// //         Password *
// //       </label>

// //       <div className="relative">
// //         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
// //           <FaLock className="text-gray-400" />
// //         </div>

// //         <input
// //           name="password"
// //           type={showPassword ? "text" : "password"}
// //           required
// //           value={formData.password}
// //           onChange={handleChange}
// //           className="input pl-10 pr-10"
// //         />

// //         <button
// //           type="button"
// //           onClick={() => setShowPassword((p) => !p)}
// //           className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
// //         >
// //           {showPassword ? <FaEyeSlash /> : <FaEye />}
// //         </button>
// //       </div>
// //     </div>

// //     {/* CONFIRM PASSWORD */}
// //     <div>
// //       <label className="block text-sm font-medium text-gray-700 mb-1">
// //         Confirm Password *
// //       </label>

// //       <div className="relative">
// //         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
// //           <FaLock className="text-gray-400" />
// //         </div>

// //         <input
// //           name="confirm_password"
// //           type={showConfirmPassword ? "text" : "password"}
// //           required
// //           value={formData.confirm_password}
// //           onChange={handleChange}
// //           className="input pl-10 pr-10"
// //         />

// //         <button
// //           type="button"
// //           onClick={() => setShowConfirmPassword((p) => !p)}
// //           className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
// //         >
// //           {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
// //         </button>
// //       </div>
// //     </div>

// //   </div>

// //   {/* TERMS */}
// //   <div className="flex items-start">
// //     <input
// //       type="checkbox"
// //       required
// //       className="h-4 w-4 text-primary-600 border-gray-300 rounded mt-1"
// //     />

// //     <label className="ml-2 block text-sm text-gray-900">
// //       I agree to the{" "}
// //       <Link to="/terms" className="text-primary-600 hover:text-primary-500">
// //         Terms of Service
// //       </Link>{" "}
// //       and{" "}
// //       <Link to="/privacy" className="text-primary-600 hover:text-primary-500">
// //         Privacy Policy
// //       </Link>
// //     </label>
// //   </div>

// //   {/* SUBMIT */}
// //   <button
// //     type="submit"
// //     disabled={
// //       loading ||
// //       !registrationFlags.loaded ||
// //       !registrationFlags.allow_registration ||
// //       (requiresRegistrationPayment && !registrationPricing.location_complete)
// //     }
// //     className="w-full btn btn-primary py-3 text-lg"
// //   >
// //       {loading
// //       ? (requiresRegistrationPayment ? "Processing..." : "Creating account...")
// //       : requiresRegistrationPayment
// //       ? `Proceed to N${displayedRegistrationAmount.toLocaleString()} Payment`
// //       : "Create Account"}
// //   </button>
// // </form>
// //       </div>
// //     </div>
// //   );

// // return (
// //   <div className="min-h-screen flex dark:bg-gray-900">

// //     {/* LEFT PANEL */}
// //     <div className="hidden md:flex w-1/2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white items-center justify-center">
// //       <div className="text-center space-y-6 max-w-md px-10">
// //         <div className="flex justify-center">
// //           <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center">
// //             <img src="/logo.png" className="w-12 h-12" />
// //           </div>
// //         </div>

// //         <h1 className="text-4xl font-bold">Create Your Account</h1>
// //         <p className="text-white/80">
// //           Complete a few steps to start managing rentals and legal services.
// //         </p>
// //         <p className="text-sm text-white/60">
// //           Trusted by landlords, tenants, and legal professionals.
// //         </p>
// //       </div>
// //     </div>

// //     {/* RIGHT PANEL */}
// //     <div className="flex w-full md:w-1/2 items-center justify-center px-6">
// //       <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl space-y-6">

// //         {/* PROGRESS */}
// //         <div className="flex gap-2">
// //           {[1,2,3,4].map(s => (
// //             <div key={s} className={`h-2 flex-1 rounded ${step >= s ? 'bg-indigo-600' : 'bg-gray-200'}`} />
// //           ))}
// //         </div>

// //         {/* STEP 1 */}
// //         {step === 1 && (
// //           <div className="space-y-6">
            

// //         {/* STEP 2 */}
// //         {step === 2 && (
// //           <div className="space-y-4">
// //             <h2 className="text-xl font-semibold">Personal Info</h2>

// //             <input name="full_name" className="input" placeholder="Full name" onChange={handleChange} />
// //             <input name="email" className="input" placeholder="Email" onChange={handleChange} />
// //             <input name="phone" className="input" placeholder="Phone" onChange={handleChange} />
// //             <input name="lawyer_email" className="input" placeholder="Lawyer Email" onChange={handleChange} />

// //             <div className="flex gap-2">
// //               <button onClick={() => setStep(1)} className="btn w-full">Back</button>
// //               <button onClick={() => setStep(3)} className="btn btn-primary w-full">Continue</button>
// //             </div>
// //           </div>
// //         )}

// //         {/* STEP 3 */}
// //         {step === 3 && (
// //           <div className="space-y-4">
// //             <h2 className="text-xl font-semibold">Verification & Location</h2>

// //             {!formData.is_foreigner && registrationFlags.nin_number && (
// //               <input name="nin" className="input" placeholder="NIN" onChange={handleChange} />
// //             )}

// //             {formData.is_foreigner && registrationFlags.passport_number && (
// //               <>
// //                 <input name="international_passport_number" className="input" placeholder="Passport" onChange={handleChange} />
// //                 <input name="nationality" className="input" placeholder="Nationality" onChange={handleChange} />
// //               </>
// //             )}

// //             {requiresRegistrationPayment && (
// //               <>
// //                 <select name="state_id" value={formData.state_id} onChange={handleChange} className="input">
// //                   <option value="">Select state</option>
// //                   {locationOptions.map(state => (
// //                     <option key={state.id} value={state.id}>{state.state_name}</option>
// //                   ))}
// //                 </select>

// //                 <select name="lga_name" value={formData.lga_name} onChange={handleChange} className="input">
// //                   <option value="">Select LGA</option>
// //                   {availableLgas.map(lga => (
// //                     <option key={lga}>{lga}</option>
// //                   ))}
// //                 </select>
// //               </>
// //             )}

// //             <div className="flex gap-2">
// //               <button onClick={() => setStep(2)} className="btn w-full">Back</button>
// //               <button onClick={() => setStep(4)} className="btn btn-primary w-full">Continue</button>
// //             </div>
// //           </div>
// //         )}

// //         {/* STEP 4 */}
// //         {step === 4 && (
          

// //             <div className="flex gap-2">
// //               <button type="button" onClick={() => setStep(3)} className="btn w-full">Back</button>

// //               <button
// //                 type="submit"
// //                 disabled={
// //                   loading ||
// //                   !registrationFlags.loaded ||
// //                   !registrationFlags.allow_registration ||
// //                   (requiresRegistrationPayment && !registrationPricing.location_complete)
// //                 }
// //                 className="btn btn-primary w-full"
// //               >
// //                 {loading
// //                   ? "Processing..."
// //                   : requiresRegistrationPayment
// //                   ? `Pay N${displayedRegistrationAmount.toLocaleString()}`
// //                   : "Create Account"}
// //               </button>
// //             </div>
// //           </form>
// //         )}

// //       </div>
// //     </div>
// //   </div>
// // );

const [step, setStep] = useState(1);
const [errors, setErrors] = useState({});

const validateStep = () => {
  let newErrors = {};

  if (step === 2) {
    if (!formData.full_name) newErrors.full_name = "Full name required";
    if (!formData.email) newErrors.email = "Email required";
    if (!formData.phone) newErrors.phone = "Phone required";
    if (!formData.lawyer_email) newErrors.lawyer_email = "Lawyer email required";
  }

  if (step === 3) {
    if (!formData.is_foreigner && registrationFlags.nin_number && !formData.nin) {
      newErrors.nin = "NIN required";
    }

    if (formData.is_foreigner && registrationFlags.passport_number) {
      if (!formData.international_passport_number)
        newErrors.passport = "Passport required";
      if (!formData.nationality)
        newErrors.nationality = "Nationality required";
    }

    if (requiresRegistrationPayment) {
      if (!formData.state_id) newErrors.state = "State required";
      if (!formData.lga_name) newErrors.lga = "LGA required";
    }
  }

  if (step === 4) {
    if (!formData.password) newErrors.password = "Password required";
    if (formData.password.length < 8)
      newErrors.password = "Min 8 characters";
    if (formData.password !== formData.confirm_password)
      newErrors.confirm = "Passwords do not match";
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};


const inputClass = (field) =>
  `input ${errors[field] ? "border-red-500" : ""}`;

return (
  <div className="min-h-screen flex dark:bg-gray-900">

    {/* LEFT PANEL */}
    <div className="hidden md:flex w-1/2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-10">
        <img src="/logo.png" className="w-12 mx-auto" alt="logo" />
        <h1 className="text-4xl font-bold">Create An Account</h1>
        <p className="text-white/80">Secure. Fast. Reliable.</p>
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

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity:0,x:40 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-40 }}>

            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Account Type</h2>

                <div className="grid grid-cols-2 gap-4">
                  {['tenant','landlord'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, user_type: type }))}
                      className={`p-4 border rounded-lg ${
                        formData.user_type === type ? 'border-indigo-600 bg-indigo-50' : ''
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => setApplicantType(false)}
                    className={`p-3 border rounded ${!formData.is_foreigner ? 'bg-indigo-50 border-indigo-600' : ''}`}>
                    Local
                  </button>
                  <button type="button" onClick={() => setApplicantType(true)}
                    className={`p-3 border rounded ${formData.is_foreigner ? 'bg-indigo-50 border-indigo-600' : ''}`}>
                    Foreigner
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn btn-primary w-full"
                >
                  Continue
                </button>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-4">

                <input
                  name="full_name"
                  value={formData.full_name}
                  onChange={(e)=>{handleChange(e); setErrors(p=>({...p,full_name:null}))}}
                  autoFocus
                  className={inputClass("full_name")}
                  placeholder="Full Name"
                />
                {errors.full_name && <p className="text-red-500 text-sm">{errors.full_name}</p>}

                <input
                  name="email"
                  value={formData.email}
                  onChange={(e)=>{handleChange(e); setErrors(p=>({...p,email:null}))}}
                  className={inputClass("email")}
                  placeholder="Email"
                />
                {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}

                <input
                  name="phone"
                  value={formData.phone}
                  onChange={(e)=>{handleChange(e); setErrors(p=>({...p,phone:null}))}}
                  className={inputClass("phone")}
                  placeholder="Phone"
                />
                {errors.phone && <p className="text-red-500 text-sm">{errors.phone}</p>}

                <input
                  name="lawyer_email"
                  value={formData.lawyer_email}
                  onChange={(e)=>{handleChange(e); setErrors(p=>({...p,lawyer_email:null}))}}
                  className={inputClass("lawyer_email")}
                  placeholder="Lawyer Email"
                />
                {errors.lawyer_email && <p className="text-red-500 text-sm">{errors.lawyer_email}</p>}

                <div className="flex gap-2">
                  <button type="button" onClick={()=>setStep(1)} className="btn w-full">Back</button>
                  <button
                    type="button"
                    onClick={()=> validateStep() && setStep(3)}
                    className="btn btn-primary w-full"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-4">

                {!formData.is_foreigner && registrationFlags.nin_number && (
                  <>
                    <input
                      name="nin"
                      value={formData.nin}
                      onChange={(e)=>{handleChange(e); setErrors(p=>({...p,nin:null}))}}
                      className={inputClass("nin")}
                      placeholder="NIN"
                    />
                    {errors.nin && <p className="text-red-500 text-sm">{errors.nin}</p>}
                  </>
                )}

                {formData.is_foreigner && registrationFlags.passport_number && (
                  <>
                    <input
                      name="international_passport_number"
                      value={formData.international_passport_number}
                      onChange={(e)=>{handleChange(e); setErrors(p=>({...p,passport:null}))}}
                      className={inputClass("passport")}
                      placeholder="Passport Number"
                    />
                    {errors.passport && <p className="text-red-500 text-sm">{errors.passport}</p>}

                    <input
                      name="nationality"
                      value={formData.nationality}
                      onChange={(e)=>{handleChange(e); setErrors(p=>({...p,nationality:null}))}}
                      className={inputClass("nationality")}
                      placeholder="Nationality"
                    />
                    {errors.nationality && <p className="text-red-500 text-sm">{errors.nationality}</p>}
                  </>
                )}

                {requiresRegistrationPayment && (
                  <>
                    <select name="state_id" onChange={handleChange} className={inputClass("state")}>
                      <option value="">Select state</option>
                      {locationOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.state_name}</option>
                      ))}
                    </select>
                    {errors.state && <p className="text-red-500 text-sm">{errors.state}</p>}

                    <select name="lga_name" onChange={handleChange} className={inputClass("lga")}>
                      <option value="">Select LGA</option>
                      {availableLgas.map(l => <option key={l}>{l}</option>)}
                    </select>
                    {errors.lga && <p className="text-red-500 text-sm">{errors.lga}</p>}
                  </>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={()=>setStep(2)} className="btn w-full">Back</button>
                  <button
                    type="button"
                    onClick={()=> validateStep() && setStep(4)}
                    className="btn btn-primary w-full"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <form onSubmit={handleSubmit} className="space-y-4">

                {requiresRegistrationPayment && (
                  <div className="text-sm bg-blue-50 p-3 rounded">
                    Payment: ₦{displayedRegistrationAmount.toLocaleString()}
                  </div>
                )}

                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    onChange={(e)=>{handleChange(e); setErrors(p=>({...p,password:null}))}}
                    className={`input pr-10 ${errors.password ? "border-red-500" : ""}`}
                    placeholder="Password"
                    autoFocus
                  />
                  <span onClick={()=>setShowPassword(p=>!p)} className="absolute right-3 top-3 cursor-pointer">
                    {showPassword ? <FaEyeSlash/> : <FaEye/>}
                  </span>
                </div>
                {errors.password && <p className="text-red-500 text-sm">{errors.password}</p>}

                <input
                  name="confirm_password"
                  type={showConfirmPassword ? "text" : "password"}
                  onChange={(e)=>{handleChange(e); setErrors(p=>({...p,confirm:null}))}}
                  className={inputClass("confirm")}
                  placeholder="Confirm Password"
                />
                {errors.confirm && <p className="text-red-500 text-sm">{errors.confirm}</p>}

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" required /> Agree to terms
                </label>

                <div className="flex gap-2">
                  <button type="button" onClick={()=>setStep(3)} className="btn w-full">Back</button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full"
                  >
                    {loading ? "Processing..." : "Create Account"}
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
