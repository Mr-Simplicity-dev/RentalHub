import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaUserPlus,
  FaSearch,
  FaLock,
  FaHeart,
  FaCamera,
  FaCreditCard,
  FaComments,
  FaShieldAlt,
  FaHandshake,
  FaClipboardCheck,
  FaCheckCircle,
  FaArrowRight,
  FaBuilding,
  FaUsers,
  FaShareAlt,
  FaWhatsapp,
  FaFacebook,
  FaTwitter,
  FaLink,
  FaStar,
  FaPhoneAlt,
  FaEnvelope,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

/* ──────────────────────────────────────────────────────────────
   ShareButton
   ────────────────────────────────────────────────────────────── */
const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/how-it-works';
  const shareText = `${title}\n\n${description}\n\n${pageUrl}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(pageUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 transition-all duration-200 shadow-sm"
        title={`Share ${section}`}
      >
        <FaShareAlt className="text-[10px]" />
        Share
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 origin-top-right animate-scaleIn rounded-xl border border-gray-100 bg-white py-2 shadow-elevated-lg">
            <div className="px-4 pb-2 mb-1 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">Share {section}</p>
            </div>

            <a
              href={`https://wa.me/?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaWhatsapp className="text-lg text-green-600" />
              WhatsApp
            </a>

            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaFacebook className="text-lg text-blue-600" />
              Facebook
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaTwitter className="text-lg text-sky-500" />
              Twitter / X
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FaLink className="text-lg text-gray-500" />
              Copy Link
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   FAQ Data
   ────────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'How long does verification take?',
    a: 'Identity verification is usually processed within 24–48 hours after you submit your NIN and passport photograph. Some cases may take longer if additional checks are needed.',
  },
  {
    q: 'Can I use RentalHub NG as both a tenant and landlord?',
    a: 'Yes, you can have separate accounts if you want to both list properties and search as a tenant. Each account type has its own dashboard and features.',
  },
  {
    q: 'Is there a mobile app available?',
    a: 'Yes, RentalHub NG offers a mobile app for both Android and iOS devices. You can search properties, send messages, and manage listings on the go.',
  },
  {
    q: 'How are disputes resolved?',
    a: 'RentalHub NG provides a structured dispute resolution process. You can submit evidence, request legal support, and our admin team will help mediate.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept major Nigerian bank cards, USSD banking, and bank transfers. All payments are processed securely through our integrated payment gateway.',
  },
  {
    q: 'Can I list properties in multiple states?',
    a: 'Absolutely! RentalHub NG covers all 36 states + FCT. You can list properties anywhere in Nigeria from your single landlord dashboard.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Page Component
   ────────────────────────────────────────────────────────────── */
const HowItWorks = () => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);

  const walkthroughSteps = [
    {
      step: '01',
      title: t('how_it_works.walkthrough_signup'),
      desc: t('how_it_works.walkthrough_signup_desc'),
      color: 'from-primary-500 to-primary-600',
    },
    {
      step: '02',
      title: t('how_it_works.walkthrough_verify'),
      desc: t('how_it_works.walkthrough_verify_desc'),
      color: 'from-primary-600 to-primary-700',
    },
    {
      step: '03',
      title: t('how_it_works.walkthrough_browse'),
      desc: t('how_it_works.walkthrough_browse_desc'),
      color: 'from-primary-700 to-primary-800',
    },
    {
      step: '04',
      title: t('how_it_works.walkthrough_connect'),
      desc: t('how_it_works.walkthrough_connect_desc'),
      color: 'from-primary-800 to-primary-900',
    },
  ];

  const tenantSteps = [
    {
      icon: <FaUserPlus className="text-2xl text-white" />,
      title: t('how_it_works.tenants_step_1_title'),
      desc: t('how_it_works.tenants_step_1_desc'),
      highlights: [t('how_it_works.tenants_step_1_hl_1'), t('how_it_works.tenants_step_1_hl_2'), t('how_it_works.tenants_step_1_hl_3')],
    },
    {
      icon: <FaSearch className="text-2xl text-white" />,
      title: t('how_it_works.tenants_step_2_title'),
      desc: t('how_it_works.tenants_step_2_desc'),
      highlights: [t('how_it_works.tenants_step_2_hl_1'), t('how_it_works.tenants_step_2_hl_2'), t('how_it_works.tenants_step_2_hl_3')],
    },
    {
      icon: <FaLock className="text-2xl text-white" />,
      title: t('how_it_works.tenants_step_3_title'),
      desc: t('how_it_works.tenants_step_3_desc'),
      highlights: [t('how_it_works.tenants_step_3_hl_1'), t('how_it_works.tenants_step_3_hl_2'), t('how_it_works.tenants_step_3_hl_3')],
    },
    {
      icon: <FaHeart className="text-2xl text-white" />,
      title: t('how_it_works.tenants_step_4_title'),
      desc: t('how_it_works.tenants_step_4_desc'),
      highlights: [t('how_it_works.tenants_step_4_hl_1'), t('how_it_works.tenants_step_4_hl_2'), t('how_it_works.tenants_step_4_hl_3')],
    },
  ];

  const landlordSteps = [
    {
      icon: <FaUserPlus className="text-2xl text-white" />,
      title: t('how_it_works.landlords_step_1_title'),
      desc: t('how_it_works.landlords_step_1_desc'),
      highlights: [t('how_it_works.landlords_step_1_hl_1'), t('how_it_works.landlords_step_1_hl_2'), t('how_it_works.landlords_step_1_hl_3')],
    },
    {
      icon: <FaCamera className="text-2xl text-white" />,
      title: t('how_it_works.landlords_step_2_title'),
      desc: t('how_it_works.landlords_step_2_desc'),
      highlights: [t('how_it_works.landlords_step_2_hl_1'), t('how_it_works.landlords_step_2_hl_2'), t('how_it_works.landlords_step_2_hl_3')],
    },
    {
      icon: <FaCreditCard className="text-2xl text-white" />,
      title: t('how_it_works.landlords_step_3_title'),
      desc: t('how_it_works.landlords_step_3_desc'),
      highlights: [t('how_it_works.landlords_step_3_hl_1'), t('how_it_works.landlords_step_3_hl_2'), t('how_it_works.landlords_step_3_hl_3')],
    },
    {
      icon: <FaComments className="text-2xl text-white" />,
      title: t('how_it_works.landlords_step_4_title'),
      desc: t('how_it_works.landlords_step_4_desc'),
      highlights: [t('how_it_works.landlords_step_4_hl_1'), t('how_it_works.landlords_step_4_hl_2'), t('how_it_works.landlords_step_4_hl_3')],
    },
  ];

  const platformFeatures = [
    {
      icon: <FaShieldAlt className="text-3xl text-primary-500" />,
      title: t('how_it_works.features_verification_title'),
      desc: t('how_it_works.features_verification_desc'),
    },
    {
      icon: <FaHandshake className="text-3xl text-primary-500" />,
      title: t('how_it_works.features_secure_title'),
      desc: t('how_it_works.features_secure_desc'),
    },
    {
      icon: <FaClipboardCheck className="text-3xl text-primary-500" />,
      title: t('how_it_works.features_legal_title'),
      desc: t('how_it_works.features_legal_desc'),
    },
    {
      icon: <FaStar className="text-3xl text-primary-500" />,
      title: t('how_it_works.features_ratings_title'),
      desc: t('how_it_works.features_ratings_desc'),
    },
  ];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 py-20 md:py-28 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              {t('how_it_works.hero_title_before')}{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                {t('how_it_works.hero_title_highlight')}
              </span>{' '}
              {t('how_it_works.hero_title_after')}
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              {t('how_it_works.hero_desc')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaSearch />
                {t('how_it_works.hero_cta_browse')}
              </Link>
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaBuilding />
                {t('how_it_works.hero_cta_list')}
              </Link>
              <ShareButton
                section={t('how_it_works.hero_title_before') + t('how_it_works.hero_title_highlight') + t('how_it_works.hero_title_after')}
                title={t('how_it_works.hero_title_before') + t('how_it_works.hero_title_highlight') + t('how_it_works.hero_title_after')}
                description={t('how_it_works.hero_desc')}
              />
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path d="M0 60V30C240 0 480 0 720 30C960 60 1200 60 1440 30V60H0Z" fill="#F9FAFB" />
          </svg>
        </div>
      </section>

      {/* ===================== QUICK WALKTHROUGH STRIP ===================== */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('how_it_works.overview_badge')}</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">
                {t('how_it_works.overview_heading')}
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {walkthroughSteps.map((item, idx) => (
                <div key={idx} className="text-center group">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <span className="text-white text-xl font-bold">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-500 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOR TENANTS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('how_it_works.tenants_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('how_it_works.tenants_heading')}
              </h2>
              <ShareButton
                section={t('how_it_works.tenants_badge')}
                title={t('how_it_works.tenants_badge') + ' — ' + t('how_it_works.tenants_heading')}
                description={t('how_it_works.tenants_desc')}
              />
            </div>
            <p className="text-gray-600">
              {t('how_it_works.tenants_desc')}
            </p>
          </div>

          <div className="max-w-5xl mx-auto space-y-12">
            {tenantSteps.map((step, idx) => (
              <div
                key={idx}
                className={`flex flex-col md:flex-row gap-8 items-center ${
                  idx % 2 === 1 ? 'md:flex-row-reverse' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-xl">
                    {step.icon}
                  </div>
                  <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-primary-200 text-primary-800 text-base font-bold flex items-center justify-center shadow-md border-2 border-white">
                    {idx + 1}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{step.desc}</p>
                  <ul className="flex flex-wrap gap-3">
                    {step.highlights.map((h, i) => (
                      <li key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-lg">
                        <FaCheckCircle className="text-primary-500" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="shrink-0">
                  <ShareButton
                    section={`${t('how_it_works.tenants_badge')} ${idx + 1}`}
                    title={`${t('how_it_works.tenants_heading')} — ${step.title}`}
                    description={step.desc}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-600 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-700 hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              <FaUserPlus />
              {t('how_it_works.tenants_cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== DIVIDER ===================== */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-gray-50 px-6 py-2 text-sm font-semibold text-gray-400 rounded-full border border-gray-200">
            {t('how_it_works.divider_label')}
          </span>
        </div>
      </div>

      {/* ===================== FOR LANDLORDS ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('how_it_works.landlords_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('how_it_works.landlords_heading')}
              </h2>
              <ShareButton
                section={t('how_it_works.landlords_badge')}
                title={t('how_it_works.landlords_badge') + ' — ' + t('how_it_works.landlords_heading')}
                description={t('how_it_works.landlords_desc')}
              />
            </div>
            <p className="text-gray-600">
              {t('how_it_works.landlords_desc')}
            </p>
          </div>

          <div className="max-w-5xl mx-auto space-y-12">
            {landlordSteps.map((step, idx) => (
              <div
                key={idx}
                className={`flex flex-col md:flex-row gap-8 items-center ${
                  idx % 2 === 1 ? 'md:flex-row-reverse' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-xl">
                    {step.icon}
                  </div>
                  <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-primary-200 text-primary-800 text-base font-bold flex items-center justify-center shadow-md border-2 border-white">
                    {idx + 1}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{step.desc}</p>
                  <ul className="flex flex-wrap gap-3">
                    {step.highlights.map((h, i) => (
                      <li key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-lg">
                        <FaCheckCircle className="text-primary-500" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="shrink-0">
                  <ShareButton
                    section={`${t('how_it_works.landlords_badge')} ${idx + 1}`}
                    title={`${t('how_it_works.landlords_heading')} — ${step.title}`}
                    description={step.desc}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              to="/list-property"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-600 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-700 hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              <FaBuilding />
              {t('how_it_works.landlords_cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== PLATFORM FEATURES ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('how_it_works.features_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('how_it_works.features_heading')}
              </h2>
              <ShareButton
                section={t('how_it_works.features_badge')}
                title={t('how_it_works.features_badge') + ' — ' + t('how_it_works.features_heading')}
                description={t('how_it_works.features_desc')}
              />
            </div>
            <p className="text-gray-600">
              {t('how_it_works.features_desc')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {platformFeatures.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <ShareButton
                    section={feature.title}
                    title={`${t('how_it_works.features_heading')} — ${feature.title}`}
                    description={feature.desc}
                  />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('how_it_works.faq_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('how_it_works.faq_heading')}
              </h2>
              <ShareButton
                section={t('how_it_works.faq_badge')}
                title={t('how_it_works.faq_heading') + ' — ' + t('how_it_works.hero_title_highlight')}
                description={t('how_it_works.faq_desc')}
              />
            </div>
            <p className="text-gray-600">
              {t('how_it_works.faq_desc')}
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-2xl overflow-hidden bg-white transition-all duration-300"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-gray-900 font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <FaArrowRight
                    className={`text-primary-500 shrink-0 transition-transform duration-300 ${
                      openFaq === idx ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === idx ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <p className="px-6 pb-5 text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              {t('how_it_works.cta_heading')}
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              {t('how_it_works.cta_desc')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                {t('how_it_works.cta_create')}
              </Link>
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaSearch />
                {t('how_it_works.cta_browse')}
              </Link>
              <ShareButton
                section={t('how_it_works.cta_heading')}
                title={t('how_it_works.cta_heading') + ' — ' + t('how_it_works.hero_title_highlight')}
                description={t('how_it_works.cta_desc')}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CONTACT ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              {t('how_it_works.contact_heading')}
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              {t('how_it_works.contact_desc')}
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section={t('how_it_works.contact_heading')}
                title={t('how_it_works.contact_heading') + ' — ' + t('how_it_works.hero_title_highlight') + ' ' + t('how_it_works.faq_badge')}
                description={t('how_it_works.contact_desc')}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <a
                href="mailto:support@rentalhub.com.ng"
                className="flex items-center gap-4 p-6 rounded-2xl bg-gray-50 hover:bg-primary-50 border border-gray-100 hover:border-primary-200 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <FaEnvelope className="text-xl text-primary-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-gray-500">{t('how_it_works.contact_email')}</p>
                  <p className="text-gray-900 font-semibold">support@rentalhub.com.ng</p>
                </div>
              </a>
              <a
                href="tel:+2348030601238"
                className="flex items-center gap-4 p-6 rounded-2xl bg-gray-50 hover:bg-primary-50 border border-gray-100 hover:border-primary-200 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <FaPhoneAlt className="text-xl text-primary-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-gray-500">{t('how_it_works.contact_call')}</p>
                  <p className="text-gray-900 font-semibold">+234 803 060 1238</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HowItWorks;
