import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaHome,
  FaShieldAlt,
  FaBullhorn,
  FaChartLine,
  FaUsers,
  FaCheckCircle,
  FaCamera,
  FaFileContract,
  FaTachometerAlt,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaEnvelope,
  FaShareAlt,
  FaWhatsapp,
  FaFacebook,
  FaTwitter,
  FaLink,
  FaStar,
  FaArrowRight,
  FaCheckDouble,
  FaBalanceScale,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';

const ShareButton = ({ section, title, description }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/list-property';
  const shareText = `${title}\n\n${description}\n\n${pageUrl}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(pageUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success(t('list_property.share_copied'));
    } catch {
      toast.error(t('list_property.share_copy_failed'));
    }
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 transition-all duration-200 shadow-sm"
        title={`${t('list_property.share')} ${section}`}
      >
        <FaShareAlt className="text-[10px]" />
        {t('list_property.share')}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 origin-top-right animate-scaleIn rounded-xl border border-gray-100 bg-white py-2 shadow-elevated-lg">
            <div className="px-4 pb-2 mb-1 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">{t('list_property.share')} {section}</p>
            </div>

            <a
              href={`https://wa.me/?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaWhatsapp className="text-lg text-green-600" />
              {t('list_property.share_whatsapp')}
            </a>

            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaFacebook className="text-lg text-blue-600" />
              {t('list_property.share_facebook')}
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <FaTwitter className="text-lg text-sky-500" />
              {t('list_property.share_twitter')}
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FaLink className="text-lg text-gray-500" />
              {t('list_property.share_copy_link')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const ListProperty = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);

  const plans = [
    {
      name: t('list_property.plan.free.name'),
      price: '₦0',
      period: t('list_property.plan.free.period'),
      popular: false,
      features: [
        t('list_property.plan.free.feature_1'),
        t('list_property.plan.free.feature_2'),
        t('list_property.plan.free.feature_3'),
        t('list_property.plan.free.feature_4'),
        t('list_property.plan.free.feature_5'),
      ],
      cta: t('list_property.plan.free.cta'),
    },
    {
      name: t('list_property.plan.basic.name'),
      price: '₦5,000',
      period: t('list_property.plan.basic.period'),
      popular: true,
      features: [
        t('list_property.plan.basic.feature_1'),
        t('list_property.plan.basic.feature_2'),
        t('list_property.plan.basic.feature_3'),
        t('list_property.plan.basic.feature_4'),
        t('list_property.plan.basic.feature_5'),
        t('list_property.plan.basic.feature_6'),
      ],
      cta: t('list_property.plan.basic.cta'),
    },
    {
      name: t('list_property.plan.premium.name'),
      price: '₦15,000',
      period: t('list_property.plan.premium.period'),
      popular: false,
      features: [
        t('list_property.plan.premium.feature_1'),
        t('list_property.plan.premium.feature_2'),
        t('list_property.plan.premium.feature_3'),
        t('list_property.plan.premium.feature_4'),
        t('list_property.plan.premium.feature_5'),
        t('list_property.plan.premium.feature_6'),
        t('list_property.plan.premium.feature_7'),
      ],
      cta: t('list_property.plan.premium.cta'),
    },
  ];

  const steps = [
    {
      icon: <FaFileContract className="text-3xl text-white" />,
      title: t('list_property.step_1.title'),
      desc: t('list_property.step_1.desc'),
    },
    {
      icon: <FaCamera className="text-3xl text-white" />,
      title: t('list_property.step_2.title'),
      desc: t('list_property.step_2.desc'),
    },
    {
      icon: <FaCheckCircle className="text-3xl text-white" />,
      title: t('list_property.step_3.title'),
      desc: t('list_property.step_3.desc'),
    },
    {
      icon: <FaUsers className="text-3xl text-white" />,
      title: t('list_property.step_4.title'),
      desc: t('list_property.step_4.desc'),
    },
  ];

  const benefits = [
    {
      icon: <FaShieldAlt className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_1.title'),
      desc: t('list_property.benefit_1.desc'),
    },
    {
      icon: <FaBullhorn className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_2.title'),
      desc: t('list_property.benefit_2.desc'),
    },
    {
      icon: <FaChartLine className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_3.title'),
      desc: t('list_property.benefit_3.desc'),
    },
    {
      icon: <FaTachometerAlt className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_4.title'),
      desc: t('list_property.benefit_4.desc'),
    },
    {
      icon: <FaMoneyBillWave className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_5.title'),
      desc: t('list_property.benefit_5.desc'),
    },
    {
      icon: <FaBalanceScale className="text-2xl text-primary-600" />,
      title: t('list_property.benefit_6.title'),
      desc: t('list_property.benefit_6.desc'),
    },
  ];

  const testimonials = [
    {
      name: 'Chukwudi Okonkwo',
      role: t('list_property.testimonial_1.role'),
      text: t('list_property.testimonial_1.text'),
      rating: 5,
    },
    {
      name: 'Folashade Adeyemi',
      role: t('list_property.testimonial_2.role'),
      text: t('list_property.testimonial_2.text'),
      rating: 5,
    },
    {
      name: 'Ibrahim Musa',
      role: t('list_property.testimonial_3.role'),
      text: t('list_property.testimonial_3.text'),
      rating: 4,
    },
  ];

  const faqs = [
    {
      q: t('list_property.faq_1.q'),
      a: t('list_property.faq_1.a'),
    },
    {
      q: t('list_property.faq_2.q'),
      a: t('list_property.faq_2.a'),
    },
    {
      q: t('list_property.faq_3.q'),
      a: t('list_property.faq_3.a'),
    },
    {
      q: t('list_property.faq_4.q'),
      a: t('list_property.faq_4.a'),
    },
    {
      q: t('list_property.faq_5.q'),
      a: t('list_property.faq_5.a'),
    },
    {
      q: t('list_property.faq_6.q'),
      a: t('list_property.faq_6.a'),
    },
  ];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleGetStarted = useCallback(() => {
    if (isAuthenticated && ['landlord', 'agent'].includes(user?.user_type)) {
      navigate('/add-property');
    } else if (isAuthenticated) {
      toast.info(t('list_property.toast.needs_landlord_account'));
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  }, [isAuthenticated, user, navigate, t]);

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
              {t('list_property.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              {t('list_property.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer"
              >
                <FaHome />
                {t('list_property.hero.list_now')}
              </button>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaMoneyBillWave />
                {t('list_property.hero.view_pricing')}
              </Link>
              <ShareButton
                section={t('list_property.hero.title')}
                title={t('list_property.hero.title')}
                description={t('list_property.hero.subtitle')}
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

      {/* ===================== STATS ===================== */}
      <section className="py-16 bg-primary-600">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { value: '10,000+', label: t('list_property.stat_1.label') },
              { value: '50,000+', label: t('list_property.stat_2.label') },
              { value: '36 + FCT', label: t('list_property.stat_3.label') },
              { value: '5,000+', label: t('list_property.stat_4.label') },
            ].map((stat, idx) => (
              <div key={idx} className="text-center text-white group">
                <div className="text-3xl md:text-4xl font-extrabold mb-2">{stat.value}</div>
                <div className="text-primary-200 text-sm md:text-base font-medium mb-2">{stat.label}</div>
                <ShareButton
                  section={stat.label}
                  title={`RentalHub NG — ${stat.value} ${stat.label}`}
                  description={`RentalHub NG has ${stat.value} ${stat.label.toLowerCase()}. List your property and reach verified tenants today.`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('list_property.how_it_works.badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('list_property.how_it_works.title')}
              </h2>
              <ShareButton
                section={t('list_property.how_it_works.title')}
                title={t('list_property.how_it_works.title')}
                description={t('list_property.how_it_works.subtitle')}
              />
            </div>
            <p className="text-gray-600">
              {t('list_property.how_it_works.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {steps.map((step, idx) => (
              <div key={idx} className="text-center group">
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    {step.icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary-200 text-primary-800 text-sm font-bold flex items-center justify-center shadow">
                    {idx + 1}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== BENEFITS ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('list_property.benefits.badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('list_property.benefits.title')}
              </h2>
              <ShareButton
                section={t('list_property.benefits.title')}
                title={t('list_property.benefits.title')}
                description={t('list_property.benefits.subtitle')}
              />
            </div>
            <p className="text-gray-600">
              {t('list_property.benefits.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {benefits.map((benefit, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
                    {benefit.icon}
                  </div>
                  <ShareButton
                    section={benefit.title}
                    title={`RentalHub NG — ${benefit.title}`}
                    description={benefit.desc}
                  />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PRICING ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('list_property.pricing.badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('list_property.pricing.title')}
              </h2>
              <ShareButton
                section={t('list_property.pricing.title')}
                title={t('list_property.pricing.title')}
                description={t('list_property.pricing.subtitle')}
              />
            </div>
            <p className="text-gray-600">
              {t('list_property.pricing.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, idx) => (
              <div
                key={idx}
                className={`relative rounded-2xl p-8 border-2 transition-all duration-300 hover:-translate-y-1 ${
                  plan.popular
                    ? 'border-primary-500 bg-white shadow-xl scale-105 md:scale-110'
                    : 'border-gray-100 bg-white shadow-sm hover:shadow-lg'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-4 py-1 bg-primary-600 text-white text-xs font-bold rounded-full shadow">
                    <FaStar className="text-[10px]" />
                    {t('list_property.plan.popular_badge')}
                  </div>
                )}

                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 text-sm ml-1">{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                      <FaCheckDouble className="text-green-500 mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={handleGetStarted}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 cursor-pointer ${
                    plan.popular
                      ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== TESTIMONIALS ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('list_property.testimonials.badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('list_property.testimonials.title')}
              </h2>
              <ShareButton
                section={t('list_property.testimonials.title')}
                title={t('list_property.testimonials.title')}
                description={t('list_property.testimonials.subtitle')}
              />
            </div>
            <p className="text-gray-600">
              {t('list_property.testimonials.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <FaStar
                      key={i}
                      className={`text-sm ${i < item.rating ? 'text-amber-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6 italic">"{item.text}"</p>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                  <p className="text-gray-500 text-xs">{item.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">{t('list_property.faq.badge')}</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t('list_property.faq.title')}
              </h2>
              <ShareButton
                section={t('list_property.faq.title')}
                title={t('list_property.faq.title')}
                description={t('list_property.faq.subtitle')}
              />
            </div>
            <p className="text-gray-600">
              {t('list_property.faq.subtitle')}
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-2xl overflow-hidden transition-all duration-300"
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
              {t('list_property.cta.title')}
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              {t('list_property.cta.subtitle')}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer"
              >
                <FaHome />
                {t('list_property.cta.list_now')}
              </button>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                {t('list_property.cta.create_account')}
              </Link>
              <ShareButton
                section={t('list_property.cta.title')}
                title={t('list_property.cta.title')}
                description={t('list_property.cta.subtitle')}
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
              {t('list_property.contact.title')}
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              {t('list_property.contact.subtitle')}
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section={t('list_property.contact.title')}
                title={t('list_property.contact.title')}
                description={t('list_property.contact.subtitle')}
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
                  <p className="text-sm text-gray-500">{t('list_property.contact.email_label')}</p>
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
                  <p className="text-sm text-gray-500">{t('list_property.contact.phone_label')}</p>
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

export default ListProperty;
