import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import api from '../services/api';
import { setAuthSession } from '../services/authStorage';
import { useTranslation } from 'react-i18next';

const getPasswordStrength = (password) => {
  let score = 0;
  if (password.length > 7) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
};

const AcceptLawyerInvite = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const mode = useMemo(() => searchParams.get('mode') || 'client', [searchParams]);
  const isPlatformInvite = mode === 'platform';

  const [step, setStep] = useState('form'); // form | otp
  const [otp, setOtp] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    chamber_name: '',
    chamber_phone: '',
    phone: '',
    password: '',
    confirm_password: '',
    consent: false,
    nationality: 'Nigeria',
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = getPasswordStrength(formData.password);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) return toast.error(t('accept_lawyer_invite.token_missing'));
    if (!formData.full_name.trim()) return toast.error(t('accept_lawyer_invite.name_required'));
    if (!formData.chamber_name.trim()) return toast.error(t('accept_lawyer_invite.chamber_name_required'));
    if (!formData.chamber_phone.trim()) return toast.error(t('accept_lawyer_invite.chamber_phone_required'));
    if (!formData.phone.trim()) return toast.error(t('accept_lawyer_invite.phone_required'));
    if (!formData.consent) return toast.error(t('accept_lawyer_invite.consent_required'));
    if (formData.password.length < 8)
      return toast.error(t('accept_lawyer_invite.password_min_length'));
    if (formData.password !== formData.confirm_password)
      return toast.error(t('accept_lawyer_invite.password_mismatch'));

    setLoading(true);
    try {
      const endpoint = isPlatformInvite
        ? '/auth/lawyer/accept-platform-invite'
        : '/auth/lawyer/accept-invite';

      const res = await api.post(endpoint, {
        token,
        full_name: formData.full_name,
        chamber_name: formData.chamber_name,
        chamber_phone: formData.chamber_phone,
        phone: formData.phone,
        password: formData.password,
        nationality: formData.nationality,
      });

      if (res.data.success) {
        toast.success(t('accept_lawyer_invite.otp_sent'));
        setStep('otp');
      } else {
        toast.error('Failed to send OTP');
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          (isPlatformInvite
            ? 'Error processing platform lawyer invite'
            : 'Error processing lawyer invite')
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return toast.error('OTP is required');

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone: formData.phone,
        otp,
      });

      if (res.data.success && res.data.data?.token) {
        const { token: authToken, user } = res.data.data;
        setAuthSession(authToken, user);
        api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
        toast.success('Lawyer account activated successfully!');
        window.location.href = '/lawyer';
      } else {
        toast.error('Authentication failed after OTP verification');
      }
    } catch (err) {
      toast.error('Invalid OTP - please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex dark:bg-gray-900">
      
      {/* LEFT PANEL */}
      <div className="hidden md:flex w-1/2 relative bg-gradient-to-br from-indigo-600 to-purple-600 text-white overflow-hidden">
      <motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  className="relative w-full h-full flex items-center justify-center"
>
  {/* FLOATING ANIMATED BLOBS */}
  <motion.div
    animate={{
      x: [0, 40, -30, 0],
      y: [0, -30, 40, 0],
    }}
    transition={{
      duration: 12,
      repeat: Infinity,
      ease: "easeInOut",
    }}
    className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-white/10 rounded-full blur-3xl"
  />

  <motion.div
    animate={{
      x: [0, -50, 30, 0],
      y: [0, 40, -20, 0],
    }}
    transition={{
      duration: 14,
      repeat: Infinity,
      ease: "easeInOut",
    }}
    className="absolute bottom-[-120px] right-[-100px] w-96 h-96 bg-purple-400/20 rounded-full blur-3xl"
  />

  <motion.div
    animate={{
      x: [0, 20, -20, 0],
      y: [0, 30, -30, 0],
    }}
    transition={{
      duration: 18,
      repeat: Infinity,
      ease: "easeInOut",
    }}
    className="absolute top-[30%] left-[20%] w-60 h-60 bg-indigo-300/10 rounded-full blur-2xl"
  />

  {/* MAIN CONTENT */}
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
    className="relative z-10 flex flex-col items-center text-center px-10 space-y-6 max-w-md"
  >
    {/* LOGO */}
    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl shadow-xl border border-white/20">
      <img src="/rentalhub-mark.svg" alt={t('accept_lawyer_invite.alt_logo')} className="h-12 w-12 rounded-xl object-contain shadow-sm" />
    </div>

    {/* BRAND */}
    <div className="text-lg font-semibold tracking-wide text-white/90">
      {t('accept_lawyer_invite.brand')}
    </div>

    {/* TITLE */}
    <h1 className="text-4xl font-bold leading-tight text-white">
      {t('accept_lawyer_invite.title')}
    </h1>

    {/* DESCRIPTION */}
    <p className="text-lg text-white/80 leading-relaxed">
      {t('accept_lawyer_invite.subtitle')}
    </p>

    {/* TRUST */}
    <p className="text-sm text-white/60">
      {t('accept_lawyer_invite.trust_text')}
    </p>
  </motion.div>
</motion.div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex w-full md:w-1/2 items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl space-y-4"
        >
          {step === 'form' && (
            <>
              <div className="text-center">
                <h2 className="text-xl font-semibold dark:text-white">
                  {isPlatformInvite ? t('accept_lawyer_invite.activate_platform') : t('accept_lawyer_invite.activate_lawyer')}
                </h2>
                <p className="text-xs text-gray-500">
                  {isPlatformInvite ? t('accept_lawyer_invite.platform_subtitle') : t('accept_lawyer_invite.client_subtitle')}
                </p>
              </div>

              <div className="text-center mb-4">
                <h3 className="text-lg font-medium dark:text-white">
                  {t('accept_lawyer_invite.lawyer_details')}
                </h3>
              </div>

              <input
                name="full_name"
                placeholder={t('accept_lawyer_invite.full_name_placeholder')}
                value={formData.full_name}
                onChange={handleChange}
                className="input w-full text-sm"
              />

              <select
                name="nationality"
                value={formData.nationality}
                onChange={handleChange}
                className="input w-full text-sm"
              >
                <option value="Nigeria">Nigeria</option>
                <option value="Ghana">Ghana</option>
                <option value="Kenya">Kenya</option>
                <option value="South Africa">South Africa</option>
                <option value="Egypt">Egypt</option>
                <option value="Morocco">Morocco</option>
                <option value="Ethiopia">Ethiopia</option>
                <option value="Tanzania">Tanzania</option>
                <option value="Uganda">Uganda</option>
                <option value="Rwanda">Rwanda</option>
                <option value="Zimbabwe">Zimbabwe</option>
                <option value="Zambia">Zambia</option>
                <option value="Botswana">Botswana</option>
                <option value="Namibia">Namibia</option>
                <option value="Mozambique">Mozambique</option>
                <option value="Angola">Angola</option>
                <option value="Cameroon">Cameroon</option>
                <option value="Senegal">Senegal</option>
                <option value="Ivory Coast">Ivory Coast</option>
                <option value="Mali">Mali</option>
                <option value="Burkina Faso">Burkina Faso</option>
                <option value="Niger">Niger</option>
                <option value="Chad">Chad</option>
                <option value="Sudan">Sudan</option>
                <option value="Libya">Libya</option>
                <option value="Tunisia">Tunisia</option>
                <option value="Algeria">Algeria</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Canada">Canada</option>
                <option value="Australia">Australia</option>
                <option value="Other">Other</option>
              </select>

              <input
                name="chamber_name"
                placeholder={t('accept_lawyer_invite.chamber_name_placeholder')}
                value={formData.chamber_name}
                onChange={handleChange}
                className="input w-full text-sm"
              />

              <input
                name="chamber_phone"
                placeholder={t('accept_lawyer_invite.chamber_phone_placeholder')}
                value={formData.chamber_phone}
                onChange={handleChange}
                className="input w-full text-sm"
              />

              <input
                name="phone"
                placeholder={t('accept_lawyer_invite.phone_placeholder')}
                value={formData.phone}
                onChange={handleChange}
                className="input w-full text-sm"
              />

              {/* PASSWORD */}
              <div className="space-y-1">
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('accept_lawyer_invite.password_placeholder')}
                    value={formData.password}
                    onChange={handleChange}
                    className="input w-full text-sm"
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-2 text-xs cursor-pointer hover:underline"
                  >
                    {showPassword ? t('accept_lawyer_invite.hide') : t('accept_lawyer_invite.show')}
                  </span>
                </div>

                {/* STRENGTH BAR */}
                <div className="h-1.5 bg-gray-200 rounded">
                  <div
                    className={`h-1.5 rounded transition-all ${
                      strength === 1
                        ? 'w-1/4 bg-red-500'
                        : strength === 2
                        ? 'w-2/4 bg-yellow-500'
                        : strength === 3
                        ? 'w-3/4 bg-blue-500'
                        : strength === 4
                        ? 'w-full bg-green-500'
                        : ''
                    }`}
                  />
                </div>
              </div>

              <div className="relative">
                <input
                  name="confirm_password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder={t('accept_lawyer_invite.confirm_password_placeholder')}
                  value={formData.confirm_password}
                  onChange={handleChange}
                  className="input w-full text-sm"
                />
                <span
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-2 text-xs cursor-pointer hover:underline"
                >
                  {showConfirm ? t('accept_lawyer_invite.hide') : t('accept_lawyer_invite.show')}
                </span>
              </div>

              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  name="consent"
                  checked={formData.consent}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, consent: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  {t('accept_lawyer_invite.agree_prefix')}<Link to="/terms" className="text-indigo-600 underline">{t('accept_lawyer_invite.terms')}</Link>{t('accept_lawyer_invite.agree_separator')}<Link to="/privacy" className="text-indigo-600 underline">{t('accept_lawyer_invite.privacy')}</Link>{t('accept_lawyer_invite.agree_suffix')}
                </span>
              </label>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white py-2 rounded-lg font-medium transition text-sm"
              >
                {loading ? t('accept_lawyer_invite.sending_otp') : t('accept_lawyer_invite.continue')}
              </button>
            </>
          )}

          {/* OTP VERIFICATION STEP */}
          {step === 'otp' && (
            <>
              <div className="text-center">
                <h2 className="text-xl font-semibold dark:text-white">
                  {t('accept_lawyer_invite.verify_phone_title')}
                </h2>
                <p className="text-xs text-gray-500">
                  {t('accept_lawyer_invite.otp_sent_to')} {formData.phone}
                </p>
              </div>

              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder={t('accept_lawyer_invite.otp_placeholder')}
                maxLength="6"
                className="input w-full text-center text-base tracking-widest font-bold"
              />

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>{t('accept_lawyer_invite.verification_details')}:</strong>
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  ✓ {t('accept_lawyer_invite.lawyer_label')} <strong>{formData.full_name}</strong><br/>
                  ✓ {t('accept_lawyer_invite.chamber_label')} <strong>{formData.chamber_name}</strong><br/>
                  ✓ {t('accept_lawyer_invite.chamber_phone_label')} <strong>{formData.chamber_phone}</strong>
                </p>
              </div>

              <button
                onClick={verifyOtp}
                disabled={loading || !otp}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-2 rounded-lg font-medium transition text-sm"
              >
                {loading ? t('accept_lawyer_invite.verifying') : t('accept_lawyer_invite.verify_activate')}
              </button>

              <button
                onClick={() => {
                  setStep('form');
                  setOtp('');
                }}
                className="w-full text-indigo-600 hover:text-indigo-700 py-1 text-xs"
              >
                {t('accept_lawyer_invite.back_to_edit')}
              </button>
            </>
          )}

          <p className="text-center text-xs text-gray-500">
            <Link to="/login" className="text-indigo-600 hover:underline">
              {t('accept_lawyer_invite.back_to_login')}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default AcceptLawyerInvite;
