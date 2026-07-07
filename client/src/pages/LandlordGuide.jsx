import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FaUserCheck,
  FaHome,
  FaCamera,
  FaTag,
  FaComments,
  FaSyncAlt,
  FaShieldAlt,
  FaCheckCircle,
  FaFileContract,
  FaChartLine,
  FaUsers,
  FaMoneyBillWave,
  FaBalanceScale,
  FaPhoneAlt,
  FaEnvelope,
  FaShareAlt,
  FaWhatsapp,
  FaFacebook,
  FaTwitter,
  FaLink,
  FaArrowRight,
  FaCheckDouble,
  FaLightbulb,
  FaTools,
  FaLock,
  FaBullhorn,
  FaHandshake,
} from 'react-icons/fa';
import { toast } from 'react-toastify';

const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/landlord-guide';
  const shareText = `${title}\n\n${description}\n\n${pageUrl}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(pageUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success(t('landlord_guide.share_copied'));
    } catch {
      toast.error(t('landlord_guide.share_copy_error'));
    }
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 transition-all duration-200 shadow-sm"
        title={`${t('landlord_guide.share')} ${section}`}
      >
        <FaShareAlt className="text-[10px]" />
        {t('landlord_guide.share')}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 origin-top-right animate-scaleIn rounded-xl border border-gray-100 bg-white py-2 shadow-elevated-lg">
            <div className="px-4 pb-2 mb-1 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">{t('landlord_guide.share')} {section}</p>
            </div>

            <a
              href={`https://wa.me/?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaWhatsapp className="text-lg text-green-600" />
              {t('landlord_guide.share_whatsapp')}
            </a>

            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaFacebook className="text-lg text-blue-600" />
              {t('landlord_guide.share_facebook')}
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaTwitter className="text-lg text-sky-500" />
              {t('landlord_guide.share_twitter')}
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FaLink className="text-lg text-gray-500" />
              {t('landlord_guide.share_copy')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const LandlordGuide = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const stats = [
    { label: t('landlord_guide.stats_properties_listed'), value: '10,000+' },
    { label: t('landlord_guide.stats_verified_landlords'), value: '5,000+' },
    { label: t('landlord_guide.stats_successful_tenancies'), value: '8,500+' },
    { label: t('landlord_guide.stats_states_covered'), value: '36 + FCT' },
  ];

  const bestPractices = [
    {
      icon: <FaTag className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_1_title'),
      desc: t('landlord_guide.practice_1_desc'),
      tips: [t('landlord_guide.practice_1_tip_1'), t('landlord_guide.practice_1_tip_2'), t('landlord_guide.practice_1_tip_3')],
    },
    {
      icon: <FaCamera className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_2_title'),
      desc: t('landlord_guide.practice_2_desc'),
      tips: [t('landlord_guide.practice_2_tip_1'), t('landlord_guide.practice_2_tip_2'), t('landlord_guide.practice_2_tip_3')],
    },
    {
      icon: <FaMoneyBillWave className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_3_title'),
      desc: t('landlord_guide.practice_3_desc'),
      tips: [t('landlord_guide.practice_3_tip_1'), t('landlord_guide.practice_3_tip_2'), t('landlord_guide.practice_3_tip_3')],
    },
    {
      icon: <FaComments className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_4_title'),
      desc: t('landlord_guide.practice_4_desc'),
      tips: [t('landlord_guide.practice_4_tip_1'), t('landlord_guide.practice_4_tip_2'), t('landlord_guide.practice_4_tip_3')],
    },
    {
      icon: <FaSyncAlt className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_5_title'),
      desc: t('landlord_guide.practice_5_desc'),
      tips: [t('landlord_guide.practice_5_tip_1'), t('landlord_guide.practice_5_tip_2'), t('landlord_guide.practice_5_tip_3')],
    },
    {
      icon: <FaShieldAlt className="text-xl text-primary-600" />,
      title: t('landlord_guide.practice_6_title'),
      desc: t('landlord_guide.practice_6_desc'),
      tips: [t('landlord_guide.practice_6_tip_1'), t('landlord_guide.practice_6_tip_2'), t('landlord_guide.practice_6_tip_3')],
    },
  ];

  const prepSteps = [
    {
      step: 1,
      title: t('landlord_guide.prep_step_1_title'),
      desc: t('landlord_guide.prep_step_1_desc'),
      icon: <FaFileContract className="text-2xl text-white" />,
      items: [t('landlord_guide.prep_step_1_item_1'), t('landlord_guide.prep_step_1_item_2'), t('landlord_guide.prep_step_1_item_3'), t('landlord_guide.prep_step_1_item_4')],
    },
    {
      step: 2,
      title: t('landlord_guide.prep_step_2_title'),
      desc: t('landlord_guide.prep_step_2_desc'),
      icon: <FaTools className="text-2xl text-white" />,
      items: [t('landlord_guide.prep_step_2_item_1'), t('landlord_guide.prep_step_2_item_2'), t('landlord_guide.prep_step_2_item_3'), t('landlord_guide.prep_step_2_item_4')],
    },
    {
      step: 3,
      title: t('landlord_guide.prep_step_3_title'),
      desc: t('landlord_guide.prep_step_3_desc'),
      icon: <FaUserCheck className="text-2xl text-white" />,
      items: [t('landlord_guide.prep_step_3_item_1'), t('landlord_guide.prep_step_3_item_2'), t('landlord_guide.prep_step_3_item_3'), t('landlord_guide.prep_step_3_item_4')],
    },
    {
      step: 4,
      title: t('landlord_guide.prep_step_4_title'),
      desc: t('landlord_guide.prep_step_4_desc'),
      icon: <FaBullhorn className="text-2xl text-white" />,
      items: [t('landlord_guide.prep_step_4_item_1'), t('landlord_guide.prep_step_4_item_2'), t('landlord_guide.prep_step_4_item_3'), t('landlord_guide.prep_step_4_item_4')],
    },
  ];

  const proTips = [
    {
      icon: <FaLightbulb className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_1_title'),
      desc: t('landlord_guide.protip_1_desc'),
    },
    {
      icon: <FaUsers className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_2_title'),
      desc: t('landlord_guide.protip_2_desc'),
    },
    {
      icon: <FaLock className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_3_title'),
      desc: t('landlord_guide.protip_3_desc'),
    },
    {
      icon: <FaChartLine className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_4_title'),
      desc: t('landlord_guide.protip_4_desc'),
    },
    {
      icon: <FaHandshake className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_5_title'),
      desc: t('landlord_guide.protip_5_desc'),
    },
    {
      icon: <FaBalanceScale className="text-2xl text-primary-500" />,
      title: t('landlord_guide.protip_6_title'),
      desc: t('landlord_guide.protip_6_desc'),
    },
  ];

  const mistakes = [
    {
      title: t('landlord_guide.mistake_1_title'),
      desc: t('landlord_guide.mistake_1_desc'),
      fix: t('landlord_guide.mistake_1_fix'),
    },
    {
      title: t('landlord_guide.mistake_2_title'),
      desc: t('landlord_guide.mistake_2_desc'),
      fix: t('landlord_guide.mistake_2_fix'),
    },
    {
      title: t('landlord_guide.mistake_3_title'),
      desc: t('landlord_guide.mistake_3_desc'),
      fix: t('landlord_guide.mistake_3_fix'),
    },
    {
      title: t('landlord_guide.mistake_4_title'),
      desc: t('landlord_guide.mistake_4_desc'),
      fix: t('landlord_guide.mistake_4_fix'),
    },
  ];

  const faqs = [
    { q: t('landlord_guide.faq_1_q'), a: t('landlord_guide.faq_1_a') },
    { q: t('landlord_guide.faq_2_q'), a: t('landlord_guide.faq_2_a') },
    { q: t('landlord_guide.faq_3_q'), a: t('landlord_guide.faq_3_a') },
    { q: t('landlord_guide.faq_4_q'), a: t('landlord_guide.faq_4_a') },
    { q: t('landlord_guide.faq_5_q'), a: t('landlord_guide.faq_5_a') },
    { q: t('landlord_guide.faq_6_q'), a: t('landlord_guide.faq_6_a') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 py-20 md:py-28 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              {t('landlord_guide.hero_title_before')}{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                {t('landlord_guide.hero_title_highlight')}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              {t('landlord_guide.hero_desc')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaHome />
                {t('landlord_guide.hero_cta_list')}
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaMoneyBillWave />
                {t('landlord_guide.hero_cta_pricing')}
              </Link>
              <ShareButton
                section="Landlord Guide"
                title="RentalHub NG — Landlord Guide: Tips for Successful Property Listing"
                description="Everything you need to know about listing, managing, and renting your properties successfully on RentalHub NG."
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

      <section className="py-16 bg-primary-600">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center text-white group">
                <div className="text-3xl md:text-4xl font-extrabold mb-2">{stat.value}</div>
                <div className="text-primary-200 text-sm md:text-base font-medium mb-2">{stat.label}</div>
                <ShareButton
                  section={stat.label}
                  title={`RentalHub NG — ${stat.value} ${stat.label}`}
                  description={`RentalHub NG has ${stat.value} ${stat.label}. Join thousands of successful landlords.`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('landlord_guide.started_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('landlord_guide.started_heading')}
              </h2>
              <ShareButton
                section="Getting Started"
                title="RentalHub NG — How to Prepare Your Property Listing"
                description="Follow these 4 simple steps to prepare, verify, and publish your property listing on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              {t('landlord_guide.started_desc')}
            </p>
          </div>

          <div className="max-w-5xl mx-auto space-y-12">
            {prepSteps.map((step, idx) => (
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
                    {step.step}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{step.desc}</p>
                  <ul className="flex flex-wrap gap-3">
                    {step.items.map((item, i) => (
                      <li key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-medium rounded-lg">
                        <FaCheckCircle className="text-primary-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="shrink-0">
                  <ShareButton
                    section={`Step ${step.step}`}
                    title={`RentalHub NG — ${step.title}`}
                    description={step.desc}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('landlord_guide.practices_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('landlord_guide.practices_heading')}
              </h2>
              <ShareButton
                section="Best Practices"
                title="RentalHub NG — Best Practices for Property Listing Success"
                description="Proven tips and best practices to create compelling listings and attract quality tenants faster."
              />
            </div>
            <p className="text-gray-600">
              {t('landlord_guide.practices_desc')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {bestPractices.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <ShareButton
                    section={item.title}
                    title={`RentalHub NG — ${item.title}`}
                    description={item.desc}
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">{item.desc}</p>
                <ul className="space-y-2">
                  {item.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                      <FaCheckDouble className="text-green-400 mt-0.5 shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('landlord_guide.protips_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('landlord_guide.protips_heading')}
              </h2>
              <ShareButton
                section="Pro Tips"
                title="RentalHub NG — Expert Advice for Landlords"
                description="Professional tips on first impressions, tenant screening, contracts, and building successful landlord-tenant relationships."
              />
            </div>
            <p className="text-gray-600">
              {t('landlord_guide.protips_desc')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {proTips.map((tip, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                    {tip.icon}
                  </div>
                  <ShareButton
                    section={tip.title}
                    title={`RentalHub NG — ${tip.title}`}
                    description={tip.desc}
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{tip.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{tip.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('landlord_guide.mistakes_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('landlord_guide.mistakes_heading')}
              </h2>
              <ShareButton
                section="Common Mistakes"
                title="RentalHub NG — Common Landlord Mistakes to Avoid"
                description="Learn from common listing mistakes including poor photos, incomplete information, overpricing, and slow response times."
              />
            </div>
            <p className="text-gray-600">
              {t('landlord_guide.mistakes_desc')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {mistakes.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                    <FaCheckCircle className="text-red-400 text-lg" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="ml-14 p-4 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">{t('landlord_guide.fix_label')}:</span> {item.fix}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('landlord_guide.faq_badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('landlord_guide.faq_heading')}
              </h2>
              <ShareButton
                section="FAQ"
                title="Landlord Guide FAQ — RentalHub NG"
                description="Answers to common questions about listing and managing properties on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              {t('landlord_guide.faq_desc')}
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

      <section className="py-16 md:py-20 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              {t('landlord_guide.cta_heading')}
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              {t('landlord_guide.cta_desc')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaHome />
                {t('landlord_guide.cta_list')}
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                {t('landlord_guide.cta_create')}
              </Link>
              <ShareButton
                section="Call to Action"
                title="List Your Property on RentalHub NG Today"
                description="Join over 5,000 successful landlords on RentalHub NG. List your property and find verified tenants."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              {t('landlord_guide.contact_heading')}
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              {t('landlord_guide.contact_desc')}
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG Landlord Support"
                description="Need help with your property listing? Contact RentalHub NG at support@rentalhub.com.ng or call +234 803 060 1238."
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
                  <p className="text-sm text-gray-500">{t('landlord_guide.contact_email')}</p>
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
                  <p className="text-sm text-gray-500">{t('landlord_guide.contact_call')}</p>
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

export default LandlordGuide;
