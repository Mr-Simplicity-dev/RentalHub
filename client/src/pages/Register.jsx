import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaLock, FaEye, FaEyeSlash, FaGift } from 'react-icons/fa';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import FloatingContactWidget from '../components/common/FloatingContactWidget';
import WhatsAppBotWidget from '../components/common/WhatsAppBotWidget';
import { setAuthSession } from '../services/authStorage';

const LAWYER_ACCESS_FEE = 2000; // Fee for using RentalHub NG lawyers during registration
const AGENT_ACCESS_FEE = 5000; // Fee for using RentalHub NG agents during registration
const TENANT_REGISTRATION_FEE = 3000;
const LANDLORD_REGISTRATION_FEE = 5000;

const buildInitialRegistrationForm = (referralCode = '') => ({
  user_type: 'tenant',
  full_name: '',
  email: '',
  lawyer_email: '',
  use_rentalhub_lawyers: false,
  use_rentalhub_agents: false,
  phone: '',
  add_agent: false,
  agent_full_name: '',
  agent_email: '',
  agent_phone: '',
  password: '',
  confirm_password: '',
  is_foreigner: false,
  nin: '',
  international_passport_number: '',
  nationality: '',
  state_id: '',
  lga_name: '',
  referral_code: referralCode,
});

const initialRegistrationFlags = {
  loaded: false,
  allow_registration: true,
  registration_allowed: true,
  registration_global_allowed: true,
  registration_master_enabled: true,
  registration_location_restricted: false,
  registration_access_message: null,
  nin_number: true,
  passport_number: true,
  tenant_registration_payment: false,
  landlord_registration_payment: false,
};

const buildInitialRegistrationPricing = (userType = 'tenant') => {
  const amount = userType === 'landlord'
    ? LANDLORD_REGISTRATION_FEE
    : TENANT_REGISTRATION_FEE;

  return {
    amount,
    base_amount: amount,
    location_required: false,
    location_complete: false,
    rule_scope: 'base',
  };
};

const formatNaira = (amount) => `₦${Number(amount || 0).toLocaleString()}`;

const Register = () => {
  const [searchParams] = useSearchParams();
  const registrationReference =
    searchParams.get('registration_ref') ||
    searchParams.get('reference') ||
    searchParams.get('trxref');
  const referralCode = (
    searchParams.get('ref') ||
    searchParams.get('referral') ||
    searchParams.get('invite') ||
    ''
  ).trim().replace(/\s+/g, '').toUpperCase();
  const restartToken = searchParams.get('restart') || '';
  const [formData, setFormData] = useState(() =>
    buildInitialRegistrationForm(referralCode)
  );
  const [loading, setLoading] = useState(false);
  const [locationOptions, setLocationOptions] = useState([]);
  const [registrationFlags, setRegistrationFlags] = useState(initialRegistrationFlags);
  const [registrationPricing, setRegistrationPricing] = useState(() =>
    buildInitialRegistrationPricing('tenant')
  );
  const [locationPreviewProperties, setLocationPreviewProperties] = useState([]);
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false);
  const [locationPreviewNote, setLocationPreviewNote] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRegistrationFeeModal, setShowRegistrationFeeModal] = useState(!registrationReference);
  const [premblyPending, setPremblyPending] = useState(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const buildRegistrationData = () => {
    const { confirm_password, add_agent, ...registrationData } = formData;
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

        if (registrationData.user_type !== 'landlord' || (add_agent !== true && !registrationData.use_rentalhub_agents)) {
      registrationData.agent_full_name = '';
      registrationData.agent_email = '';
      registrationData.agent_phone = '';
    }

    if (registrationData.use_rentalhub_agents) {
      registrationData.agent_full_name = '';
      registrationData.agent_email = '';
      registrationData.agent_phone = '';
    }

    const cleanReferralCode = String(registrationData.referral_code || '').trim();
    if (cleanReferralCode) {
      registrationData.referral_code = cleanReferralCode;
    } else {
      delete registrationData.referral_code;
    }

    return registrationData;
  };

    const requiresRegistrationPayment =
    (formData.user_type === 'tenant' && registrationFlags.tenant_registration_payment) ||
    (formData.user_type === 'landlord' && registrationFlags.landlord_registration_payment);
    const requiresLawyerPayment = formData.use_rentalhub_lawyers;
  const requiresAgentPayment = formData.use_rentalhub_agents;
  const requiresPayment = requiresRegistrationPayment || requiresLawyerPayment || requiresAgentPayment;

  const selectedStateOption = locationOptions.find(
    (item) => String(item.id) === String(formData.state_id)
  );
  const availableLgas = selectedStateOption?.lgas || [];
    const baseAmount = registrationPricing.amount || (formData.user_type === 'tenant' ? TENANT_REGISTRATION_FEE : LANDLORD_REGISTRATION_FEE);
    const displayedRegistrationAmount = (requiresRegistrationPayment ? baseAmount : 0) + (requiresLawyerPayment ? LAWYER_ACCESS_FEE : 0) + (requiresAgentPayment ? AGENT_ACCESS_FEE : 0);
  const registrationLocationBrowseUrl = formData.state_id
    ? `/properties?state_id=${encodeURIComponent(formData.state_id)}${
        formData.lga_name
          ? `&lga_name=${encodeURIComponent(formData.lga_name)}`
          : ''
      }`
    : '/properties';

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
          allow_registration: data.registration_allowed !== false,
          registration_allowed: data.registration_allowed !== false,
          registration_global_allowed: data.registration_global_allowed !== false,
          registration_master_enabled: data.registration_master_enabled !== false,
          registration_location_restricted:
            data.registration_location_restricted === true,
          registration_access_message: data.registration_access_message || null,
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
            amount: formData.user_type === 'tenant' ? TENANT_REGISTRATION_FEE : LANDLORD_REGISTRATION_FEE,
            base_amount: formData.user_type === 'tenant' ? TENANT_REGISTRATION_FEE : LANDLORD_REGISTRATION_FEE,
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
            amount: formData.user_type === 'tenant' ? TENANT_REGISTRATION_FEE : LANDLORD_REGISTRATION_FEE,
            base_amount: formData.user_type === 'tenant' ? TENANT_REGISTRATION_FEE : LANDLORD_REGISTRATION_FEE,
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

    if (formData.user_type !== 'tenant' || !formData.state_id) {
      setLocationPreviewProperties([]);
      setLocationPreviewNote('');
      setLocationPreviewLoading(false);

      return () => {
        active = false;
      };
    }

    const loadLocationPreview = async () => {
      setLocationPreviewLoading(true);
      setLocationPreviewNote('');

      try {
        const exactParams = {
          state_id: formData.state_id,
          limit: 4,
        };

        if (formData.lga_name) {
          exactParams.lga_name = formData.lga_name;
        }

        const exactResponse = await api.get('/properties/search', {
          params: exactParams,
        });

        let nextProperties = exactResponse.data?.data || [];
        let nextNote = '';

        if (!nextProperties.length && formData.lga_name) {
          const fallbackResponse = await api.get('/properties/search', {
            params: {
              state_id: formData.state_id,
              limit: 4,
            },
          });

          nextProperties = fallbackResponse.data?.data || [];

          if (nextProperties.length) {
            nextNote = `No live listings are matched to ${formData.lga_name} yet. Showing available properties in ${selectedStateOption?.state_name || 'the selected state'} instead.`;
          }
        }

        if (!active) return;

        setLocationPreviewProperties(nextProperties);
        setLocationPreviewNote(nextNote);
      } catch (error) {
        if (!active) return;

        console.error('Failed to load registration location preview', error);
        setLocationPreviewProperties([]);
        setLocationPreviewNote('Unable to load available properties for this location right now.');
      } finally {
        if (active) {
          setLocationPreviewLoading(false);
        }
      }
    };

    loadLocationPreview();

    return () => {
      active = false;
    };
  }, [formData.user_type, formData.state_id, formData.lga_name, selectedStateOption?.state_name]);

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

          setAuthSession(token, user);
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

    if (['nin', 'international_passport_number', 'email', 'phone'].includes(name)) {
      setPremblyPending(null);
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'state_id' ? { lga_name: '' } : {}),
    }));
  };

  useEffect(() => {
    const attemptId = premblyPending?.attempt_id;
    if (!attemptId || premblyPending.status !== 'pending') return undefined;

    let cancelled = false;
    let timer;
    const checkStatus = async () => {
      try {
        const response = await api.get(`/prembly/attempts/${encodeURIComponent(attemptId)}`);
        const result = response.data?.data;
        if (cancelled || !result) return;

        if (result.status === 'verified') {
          setPremblyPending((previous) => ({
            ...previous,
            status: 'verified',
            message: 'Prembly verification completed. Continue registration; RentalHub will reuse this result without another paid check.',
          }));
          toast.success('Identity verification completed. You can continue registration.');
          return;
        }
        if (result.status === 'not_verified') {
          setPremblyPending((previous) => ({
            ...previous,
            status: 'not_verified',
            message: result.message || 'Prembly could not verify this credential. Check the number before continuing.',
          }));
          return;
        }
      } catch (error) {
        console.error('Prembly status check failed:', error.response?.data || error.message);
      }

      if (!cancelled) {
        timer = window.setTimeout(checkStatus, 15000);
      }
    };

    timer = window.setTimeout(checkStatus, 5000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [premblyPending?.attempt_id, premblyPending?.status]);

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

 if (!registrationFlags.registration_master_enabled) {
    toast.error("Registration is currently disabled");
    return;
  }

  if (!registrationFlags.registration_global_allowed) {
    toast.error(
      formData.user_type === "landlord"
        ? "Landlord registration is currently disabled"
        : "Tenant registration is currently disabled"
    );
    return;
  }

  if (!registrationFlags.registration_allowed) {
    toast.error(
      registrationFlags.registration_access_message ||
        "Registration is not available for the selected location"
    );
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

 if (!formData.use_rentalhub_lawyers && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.lawyer_email || "")) {
    toast.error("Enter one valid lawyer email or check the box to use RentalHub NG lawyers");
    return;
  }

    if (formData.user_type === 'landlord' && formData.add_agent && !formData.use_rentalhub_agents) {
      if (!String(formData.agent_full_name || '').trim()) {
        toast.error('Agent full name is required');
        return;
      }
  
      if (!emailPattern.test(String(formData.agent_email || '').trim())) {
        toast.error('Enter a valid agent email');
        return;
      }
  
      if (!String(formData.agent_phone || '').trim()) {
        toast.error('Agent phone number is required');
        return;
      }
  
      if (
        String(formData.agent_email || '').trim().toLowerCase() ===
        String(formData.email || '').trim().toLowerCase()
      ) {
        toast.error('Agent email must be different from landlord email');
        return;
      }
  
      if (
        String(formData.agent_phone || '').replace(/\s+/g, '') ===
        String(formData.phone || '').replace(/\s+/g, '')
      ) {
        toast.error('Agent phone must be different from landlord phone');
        return;
      }
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

    if (requiresPayment && !registrationData.state_id) {
      toast.error('Select your state to calculate the fee');
      return;
    }

    if (requiresPayment && !String(registrationData.lga_name || '').trim()) {
      toast.error('Select your local government area to calculate the fee');
      return;
    }

    if (requiresPayment && !registrationPricing.location_complete) {
      toast.error('Complete your location selection to confirm the exact fee');
      return;
    }

    // Payment-required roles must complete payment before account creation
    if (requiresPayment) {
      const paymentResponse = await api.post(
        "/auth/register/payment",
        registrationData
      );

      if (paymentResponse.data?.code === 'PREMBLY_VERIFICATION_PENDING') {
        setPremblyPending({
          attempt_id: paymentResponse.data?.data?.attempt_id,
          status: 'pending',
          message: paymentResponse.data?.message,
        });
        toast.info('Prembly is still processing. RentalHub will check the same transaction automatically.');
        return;
      }

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
    } else if (response.code === 'PREMBLY_VERIFICATION_PENDING') {
      setPremblyPending({
        attempt_id: response.data?.attempt_id,
        status: 'pending',
        message: response.message,
      });
      toast.info('Prembly is still processing. RentalHub will check the same transaction automatically.');
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

    if (serverError?.code === 'PREMBLY_VERIFICATION_PENDING') {
      setPremblyPending({
        attempt_id: serverError.data?.attempt_id,
        status: 'pending',
        message: serverError.message,
      });
      toast.info('Prembly is still processing. RentalHub will check the same transaction automatically.');
      return;
    }

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

useEffect(() => {
  if (!restartToken || registrationReference) {
    return;
  }

  setFormData(buildInitialRegistrationForm(referralCode));
  setRegistrationFlags(initialRegistrationFlags);
  setRegistrationPricing(buildInitialRegistrationPricing('tenant'));
  setLocationPreviewProperties([]);
  setLocationPreviewLoading(false);
  setLocationPreviewNote('');
  setShowPassword(false);
  setShowConfirmPassword(false);
  setShowRegistrationFeeModal(true);
  setStep(1);
  setErrors({});
  setTermsAccepted(false);
}, [restartToken, registrationReference, referralCode]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const referralCodePattern = /^[A-Za-z0-9_-]+$/;
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
    if (
      String(formData.referral_code || "").trim() &&
      !referralCodePattern.test(String(formData.referral_code || "").trim())
    ) {
      newErrors.referral_code = "Referral code can only contain letters, numbers, - or _";
    }
    if (!formData.use_rentalhub_lawyers) {
      if (!String(formData.lawyer_email || "").trim()) {
        newErrors.lawyer_email = "Enter a lawyer email or check to use RentalHub NG lawyers";
      } else if (!emailPattern.test(String(formData.lawyer_email || "").trim())) {
        newErrors.lawyer_email = "Enter a valid lawyer email";
      }
    }

        if (formData.user_type === 'landlord' && formData.add_agent && !formData.use_rentalhub_agents) {
        if (!String(formData.agent_full_name || '').trim()) {
          newErrors.agent_full_name = 'Agent full name required';
        }
  
        if (!String(formData.agent_email || '').trim()) {
          newErrors.agent_email = 'Agent email required';
        } else if (!emailPattern.test(String(formData.agent_email || '').trim())) {
          newErrors.agent_email = 'Enter a valid agent email';
        } else if (
          String(formData.agent_email || '').trim().toLowerCase() ===
          String(formData.email || '').trim().toLowerCase()
        ) {
          newErrors.agent_email = 'Agent email must be different from landlord email';
        }
  
        if (!String(formData.agent_phone || '').trim()) {
          newErrors.agent_phone = 'Agent phone required';
        } else if (
          String(formData.agent_phone || '').replace(/\s+/g, '') ===
          String(formData.phone || '').replace(/\s+/g, '')
        ) {
          newErrors.agent_phone = 'Agent phone must be different from landlord phone';
        }
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

        if (requiresPayment) {
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
  (
    !String(formData.referral_code || "").trim() ||
    referralCodePattern.test(String(formData.referral_code || "").trim())
  ) &&
  (formData.use_rentalhub_lawyers || emailPattern.test(String(formData.lawyer_email || "").trim())) &&
  (
        formData.user_type !== 'landlord' ||
      (!formData.add_agent && !formData.use_rentalhub_agents) ||
      formData.use_rentalhub_agents ||
      (
        String(formData.agent_full_name || '').trim() &&
        emailPattern.test(String(formData.agent_email || '').trim()) &&
        String(formData.agent_phone || '').trim() &&
        String(formData.agent_email || '').trim().toLowerCase() !==
          String(formData.email || '').trim().toLowerCase() &&
        String(formData.agent_phone || '').replace(/\s+/g, '') !==
          String(formData.phone || '').replace(/\s+/g, '')
      )
  );

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

    if (requiresPayment) {
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
  premblyPending?.status === 'pending' ||
  !registrationFlags.loaded ||
  !registrationFlags.registration_allowed ||
  (requiresPayment && !registrationPricing.location_complete) ||
  !isStepFourComplete;

const canContinueAccountTypeStep =
  registrationFlags.registration_master_enabled &&
  registrationFlags.registration_global_allowed;


const inputClass = (field) =>
  `input ${errors[field] ? "border-red-500" : ""}`;

return (
  <div className="min-h-screen flex dark:bg-gray-900">
    {showRegistrationFeeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                Before You Register
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                Possible registration payments
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowRegistrationFeeModal(false)}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close registration payment information"
            >
              ×
            </button>
          </div>

          <div className="mt-5 space-y-3 text-sm text-gray-700">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="font-semibold text-blue-900">Tenant account</p>
              <p className="mt-1">
                Tenant account creation payment: <strong>{formatNaira(TENANT_REGISTRATION_FEE)}</strong>.
              </p>
            </div>

            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <p className="font-semibold text-purple-900">Landlord account</p>
              <p className="mt-1">
                Landlord account creation payment: <strong>{formatNaira(LANDLORD_REGISTRATION_FEE)}</strong>.
              </p>
            </div>

            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="font-semibold text-amber-900">Optional access fees</p>
              <p className="mt-1">
                RentalHub NG lawyers: <strong>{formatNaira(LAWYER_ACCESS_FEE)}</strong>.
                Landlords using RentalHub NG agents: <strong>{formatNaira(AGENT_ACCESS_FEE)}</strong>.
              </p>
            </div>

            <p className="text-xs text-gray-500">
              Exact payment is confirmed by your selected state and local government area before account creation.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowRegistrationFeeModal(false)}
              className="btn w-full sm:flex-1"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => setShowRegistrationFeeModal(false)}
              className="btn btn-primary w-full sm:flex-1"
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    )}

    {/* LEFT PANEL */}
    <div className="hidden md:flex w-1/2 bg-gradient-to-br from-indigo-600 to-purple-600 text-white items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-10">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center">
            <img src="/rentalhub-mark.svg" className="h-12 w-12 rounded-xl object-contain shadow-sm" alt="RentalHub NG" />
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

          {referralCode && formData.referral_code && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Invite link applied</p>
                  <p className="mt-0.5 text-emerald-700">
                    Complete registration to reward the person who invited you.
                  </p>
                </div>
                <span className="w-fit rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-emerald-700 shadow-sm">
                  {formData.referral_code}
                </span>
              </div>
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
                {!registrationFlags.registration_master_enabled && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Registration is currently disabled by the platform administrator.
                  </div>
                )}

                {registrationFlags.registration_master_enabled &&
                  !registrationFlags.registration_global_allowed && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formData.user_type === "landlord"
                      ? "Landlord registration is currently disabled by the platform administrator."
                      : "Tenant registration is currently disabled by the platform administrator."}
                  </div>
                )}

                {registrationFlags.registration_global_allowed &&
                  registrationFlags.registration_location_restricted &&
                  !registrationFlags.registration_allowed &&
                  registrationFlags.registration_access_message && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {registrationFlags.registration_access_message}
                    </div>
                  )}

                {/* User type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">I am a:</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData(prev => ({
                          ...prev,
                          user_type: 'tenant',
                          add_agent: false,
                          agent_full_name: '',
                          agent_email: '',
                          agent_phone: '',
                        }))
                      }
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
                  disabled={!canContinueAccountTypeStep}
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

                {/* Referral Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Referral Code <span className="text-gray-400">(Optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaGift className="text-gray-400" />
                    </div>
                    <input
                      name="referral_code"
                      type="text"
                      autoComplete="off"
                      value={formData.referral_code}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\s+/g, '').toUpperCase();
                        setFormData((prev) => ({ ...prev, referral_code: value }));
                        setErrors((prev) => ({ ...prev, referral_code: null }));
                      }}
                      className={`input pl-10 ${errors.referral_code ? 'border-red-500' : ''}`}
                      placeholder="RH123ABC"
                      maxLength={64}
                    />
                  </div>
                  {errors.referral_code ? (
                    <p className="text-red-500 text-sm mt-1">{errors.referral_code}</p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      Invite links fill this automatically, but you can paste a code here.
                    </p>
                  )}
                </div>

                {/* Lawyer Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lawyer Email {formData.use_rentalhub_lawyers ? '' : '*'}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="text-gray-400" />
                    </div>
                    <input
                      name="lawyer_email"
                      type="email"
                      autoComplete="off"
                      value={formData.lawyer_email}
                      disabled={formData.use_rentalhub_lawyers}
                      onChange={(e) => { handleChange(e); setErrors(p => ({ ...p, lawyer_email: null })); }}
                      className={`input pl-10 ${errors.lawyer_email ? 'border-red-500' : ''} ${formData.use_rentalhub_lawyers ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      placeholder={formData.use_rentalhub_lawyers ? 'Using RentalHub NG lawyers' : "lawyer@example.com"}
                    />
                  </div>
                  {errors.lawyer_email && <p className="text-red-500 text-sm mt-1">{errors.lawyer_email}</p>}
                  <div className="mt-2 flex items-start">
                    <input
                      id="use_rentalhub_lawyers"
                      type="checkbox"
                      checked={formData.use_rentalhub_lawyers}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          use_rentalhub_lawyers: checked,
                          ...(checked ? { lawyer_email: '' } : {}),
                        }));
                        setErrors((prev) => ({ ...prev, lawyer_email: null }));
                      }}
                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded mt-0.5 cursor-pointer"
                    />
                    <label htmlFor="use_rentalhub_lawyers" className="ml-2 text-sm text-gray-700 cursor-pointer">
                      <span>Legal Protection Coverage — <span className="font-semibold">₦2,000 (one-time)</span></span>
                      <p className="text-xs text-gray-500 mt-1">
                        Get access to qualified legal assistance anytime you need it. No upfront lawyer search needed — we assign one from your area when you submit a request.
                      </p>
                    </label>
                  </div>
                </div>

                {formData.user_type === 'landlord' && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Use your Agent Now</h3>
                        <p className="text-xs text-gray-600 mt-1">
                          Optional. An agent can help the landlord handle property listing, property updates, and other difficult day-to-day tasks later.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.add_agent}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData((prev) => ({
                              ...prev,
                              add_agent: checked,
                              ...(checked
                                ? {}
                                : {
                                    agent_full_name: '',
                                    agent_email: '',
                                    agent_phone: '',
                                  }),
                            }));
                            if (!checked) {
                              setErrors((prev) => ({
                                ...prev,
                                agent_full_name: null,
                                agent_email: null,
                                agent_phone: null,
                              }));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Add agent
                      </label>
                    </div>

                    {formData.add_agent && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Full Name *</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <FaUser className="text-gray-400" />
                            </div>
                            <input
                              name="agent_full_name"
                              type="text"
                              value={formData.agent_full_name}
                              onChange={(e) => {
                                handleChange(e);
                                setErrors((prev) => ({ ...prev, agent_full_name: null }));
                              }}
                              className={`input pl-10 ${errors.agent_full_name ? 'border-red-500' : ''}`}
                              placeholder="Agent full name"
                            />
                          </div>
                          {errors.agent_full_name && <p className="text-red-500 text-sm mt-1">{errors.agent_full_name}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Email *</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <FaEnvelope className="text-gray-400" />
                            </div>
                            <input
                              name="agent_email"
                              type="email"
                              value={formData.agent_email}
                              onChange={(e) => {
                                handleChange(e);
                                setErrors((prev) => ({ ...prev, agent_email: null }));
                              }}
                              className={`input pl-10 ${errors.agent_email ? 'border-red-500' : ''}`}
                              placeholder="agent@example.com"
                            />
                          </div>
                          {errors.agent_email && <p className="text-red-500 text-sm mt-1">{errors.agent_email}</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Phone *</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <FaPhone className="text-gray-400" />
                            </div>
                            <input
                              name="agent_phone"
                              type="tel"
                              value={formData.agent_phone}
                              onChange={(e) => {
                                handleChange(e);
                                setErrors((prev) => ({ ...prev, agent_phone: null }));
                              }}
                              className={`input pl-10 ${errors.agent_phone ? 'border-red-500' : ''}`}
                              placeholder="+2348012345678"
                            />
                          </div>
                          {errors.agent_phone && <p className="text-red-500 text-sm mt-1">{errors.agent_phone}</p>}
                        </div>
                      </div>
                    )}
                                    </div>
                )}

                {formData.user_type === 'landlord' && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Use RentalHub NG Agents</h3>
                        <p className="text-xs text-gray-600 mt-1">
                          Opt in to have a platform agent automatically assigned to help manage your properties
                          and handle day-to-day tasks. A one-time agent access fee of {formatNaira(AGENT_ACCESS_FEE)} applies.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          id="use_rentalhub_agents"
                          type="checkbox"
                          checked={formData.use_rentalhub_agents}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData((prev) => ({
                              ...prev,
                              use_rentalhub_agents: checked,
                              ...(checked ? { add_agent: false, agent_full_name: '', agent_email: '', agent_phone: '' } : {}),
                            }));
                            if (checked) {
                              setErrors((prev) => ({
                                ...prev,
                                agent_full_name: null,
                                agent_email: null,
                                agent_phone: null,
                              }));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Use Our agents
                      </label>
                    </div>
                    {formData.use_rentalhub_agents && (
                      <div className="mt-2 text-xs text-purple-700">
                        A platform agent will be auto-assigned to you. No need to manually add an agent.
                        {!registrationPricing.location_complete && (
                          <div className="mt-1">
                            Select your state and local government area to confirm the agent access fee.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Registration Location</h3>
                    <p className="mt-1 text-xs text-gray-600">
                      {formData.user_type === 'tenant'
                        ? 'Choose your preferred registration location so the system can show you available properties in that area.'
                        : 'Choose your registration location now. It will prefill your property posting flow after signup, and you can still change it later per listing.'}
                    </p>
                  </div>

                  {registrationFlags.registration_location_restricted &&
                    !registrationFlags.registration_allowed &&
                    registrationFlags.registration_access_message && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {registrationFlags.registration_access_message}
                      </div>
                    )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State{requiresRegistrationPayment ? ' *' : ''}
                      </label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Local Government Area{requiresRegistrationPayment ? ' *' : ''}
                      </label>
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
                      {requiresRegistrationPayment && !registrationPricing.location_complete && formData.state_id && formData.lga_name && (
                        <p className="text-xs text-blue-600 mt-1">
                          Confirming location pricing...
                        </p>
                      )}
                      {errors.lga && <p className="text-red-500 text-sm mt-1">{errors.lga}</p>}
                    </div>
                  </div>

                  {requiresPayment && formData.state_id && formData.lga_name && registrationPricing.location_complete && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      Exact total fee for this location: {formatNaira(displayedRegistrationAmount)}.
                    </div>
                  )}

                  {formData.user_type === 'tenant' && formData.state_id && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-emerald-900">
                            Available Properties Near This Location
                          </h4>
                          <p className="mt-1 text-xs text-emerald-800">
                            {formData.lga_name
                              ? `Showing live inventory for ${formData.lga_name}, ${selectedStateOption?.state_name || ''}.`
                              : `Showing live inventory in ${selectedStateOption?.state_name || 'your selected state'}.`}
                          </p>
                        </div>
                        <Link
                          to={registrationLocationBrowseUrl}
                          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          Browse all
                        </Link>
                      </div>

                      {locationPreviewLoading ? (
                        <p className="mt-3 text-sm text-emerald-800">Loading available properties...</p>
                      ) : locationPreviewProperties.length > 0 ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {locationPreviewProperties.map((property) => (
                            <Link
                              key={property.id}
                              to={`/properties/${property.id}`}
                              className="rounded-lg border border-emerald-200 bg-white p-3 transition hover:border-emerald-300"
                            >
                              <p className="font-medium text-gray-900">{property.title}</p>
                              <p className="mt-1 text-xs text-gray-600">
                                {[property.area, property.city, property.state_name].filter(Boolean).join(', ')}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-emerald-700">
                                ₦{Number(property.rent_amount || 0).toLocaleString()} / {property.payment_frequency || 'yearly'}
                              </p>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-emerald-800">
                          No live properties are attached to this location yet.
                        </p>
                      )}

                      {locationPreviewNote && (
                        <p className="mt-3 text-xs text-amber-700">{locationPreviewNote}</p>
                      )}
                    </div>
                  )}
                </div>

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
                {requiresPayment && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    <p className="font-semibold text-blue-900">Registration payment summary</p>
                    <div className="mt-2 space-y-1">
                      {requiresRegistrationPayment && (
                        <div className="flex justify-between gap-3">
                          <span>{formData.user_type === 'tenant' ? 'Tenant' : 'Landlord'} account creation</span>
                          <span className="font-semibold">{formatNaira(baseAmount)}</span>
                        </div>
                      )}
                      {requiresLawyerPayment && (
                        <div className="flex justify-between gap-3">
                          <span>RentalHub NG lawyer access</span>
                          <span className="font-semibold">{formatNaira(LAWYER_ACCESS_FEE)}</span>
                        </div>
                      )}
                      {requiresAgentPayment && (
                        <div className="flex justify-between gap-3">
                          <span>RentalHub NG agent access</span>
                          <span className="font-semibold">{formatNaira(AGENT_ACCESS_FEE)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex justify-between border-t border-blue-200 pt-2 font-semibold text-blue-900">
                      <span>Total due before account creation</span>
                      <span>{formatNaira(displayedRegistrationAmount)}</span>
                    </div>
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
                      ? 'Processing...'
                      : requiresPayment
                      ? `Pay ${formatNaira(displayedRegistrationAmount)}`
                      : 'Create Account'}
                  </button>
                </div>

              </form>
            )}

          </motion.div>
        </AnimatePresence>

      </div>
    </div>
      <FloatingContactWidget />
      <WhatsAppBotWidget />
  </div>
);
};

export default Register;
