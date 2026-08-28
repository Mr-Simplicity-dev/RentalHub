import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FaSearch,
  FaShieldAlt,
  FaHome,
  FaStar,
  FaCreditCard,
  FaMapMarkerAlt,
  FaCheckCircle,
  FaApple,
  FaGooglePlay,
  FaArrowRight,
  FaUsers,
  FaHeadset,
  FaWhatsapp,
} from 'react-icons/fa';

const features = (t) => [
  {
    icon: FaShieldAlt,
    title: t('app_landing.feature_verified_title', 'Verified Listings'),
    desc: t('app_landing.feature_verified_desc', 'Every property is inspected and verified before it goes live. No fake agents, no scams.'),
  },
  {
    icon: FaCreditCard,
    title: t('app_landing.feature_secure_title', 'Secure Payments'),
    desc: t('app_landing.feature_secure_desc', 'Pay rent, deposits, and service fees directly through the app — fully encrypted.'),
  },
  {
    icon: FaStar,
    title: t('app_landing.feature_reviews_title', 'Real Tenant Reviews'),
    desc: t('app_landing.feature_reviews_desc', 'Read honest reviews from people who actually live in the property.'),
  },
  {
    icon: FaMapMarkerAlt,
    title: t('app_landing.feature_states_title', '36 States Covered'),
    desc: t('app_landing.feature_states_desc', 'From Lagos to Abuja, Rivers to Kano — find properties across Nigeria.'),
  },
  {
    icon: FaHeadset,
    title: t('app_landing.feature_support_title', '24/7 Support'),
    desc: t('app_landing.feature_support_desc', 'Built-in support system with real agents ready to help you at any time.'),
  },
  {
    icon: FaShieldAlt,
    title: t('app_landing.feature_dispute_title', 'Dispute Resolution'),
    desc: t('app_landing.feature_dispute_desc', 'Legal support and dispute resolution built right into the platform.'),
  },
];

const steps = (t) => [
  {
    num: '01',
    title: t('app_landing.step_search', 'Search'),
    desc: t('app_landing.step_search_desc', 'Browse verified listings by location, price, and property type.'),
    icon: FaSearch,
  },
  {
    num: '02',
    title: t('app_landing.step_verify', 'Verify'),
    desc: t('app_landing.step_verify_desc', 'Check tenant reviews, property details, and agent ratings.'),
    icon: FaCheckCircle,
  },
  {
    num: '03',
    title: t('app_landing.step_move_in', 'Move In'),
    desc: t('app_landing.step_move_in_desc', 'Pay securely through the app and get your keys.'),
    icon: FaHome,
  },
];

const stats = (t) => [
  { value: '10,000+', label: t('app_landing.stat_properties', 'Verified Properties') },
  { value: '36', label: t('app_landing.stat_states', 'States Covered') },
  { value: '5,000+', label: t('app_landing.stat_tenants', 'Happy Tenants') },
  { value: '2,000+', label: t('app_landing.stat_landlords', 'Trusted Landlords') },
];

const testimonials = (t) => [
  {
    name: 'Chidinma O.',
    role: t('app_landing.testimonial_role_tenant_lagos', 'Tenant, Lagos'),
    text: t('app_landing.testimonial_1', 'I found my current apartment through RentalHub. The verification badge gave me the confidence to pay — and it was exactly as described.'),
  },
  {
    name: 'Emeka A.',
    role: t('app_landing.testimonial_role_landlord_abuja', 'Landlord, Abuja'),
    text: t('app_landing.testimonial_2', 'As a landlord, I love that only serious tenants reach out. The platform filters out the noise and I get quality applications.'),
  },
  {
    name: 'Amina B.',
    role: t('app_landing.testimonial_role_tenant_rivers', 'Tenant, Rivers'),
    text: t('app_landing.testimonial_3', 'The secure payment system means I never have to worry about handing cash to agents. Everything is tracked and receipts are generated automatically.'),
  },
];

const WHATSAPP_LINK = 'https://wa.me/2348030601238?text=Hi!%20I%20want%20to%20download%20RentalHub';

const AppLanding = () => {
  const { t } = useTranslation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_title: 'App Landing',
        page_location: window.location.href,
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-64 h-64 bg-yellow-400 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-20 md:py-32 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-white/15 text-white/90 text-sm font-semibold px-4 py-1.5 rounded-full mb-6 backdrop-blur-sm border border-white/20">
                {t('app_landing.badge', "Nigeria's #1 Property Platform")}
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                {t('app_landing.hero_prefix', 'Rent with')}{' '}
                <span className="text-yellow-300">{t('app_landing.hero_confidence', 'Confidence.')}</span>
              </h1>
              <p className="text-lg sm:text-xl text-white/80 mb-8 max-w-lg leading-relaxed">
                {t('app_landing.hero_sub', 'Find verified properties, pay securely, and settle into your next home — all from one trusted app.')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href="https://play.google.com/store/apps/details?id=com.rentalhub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-black text-white px-6 py-3.5 rounded-xl hover:bg-gray-800 transition-all duration-300 hover:scale-105 shadow-lg"
                >
                  <FaGooglePlay className="text-2xl" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider opacity-80">{t('app_landing.get_it_on', 'Get it on')}</div>
                    <div className="text-base font-semibold -mt-0.5">{t('app_landing.google_play', 'Google Play')}</div>
                  </div>
                </a>
                <a
                  href="https://apps.apple.com/app/rentalhub-ng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-black text-white px-6 py-3.5 rounded-xl hover:bg-gray-800 transition-all duration-300 hover:scale-105 shadow-lg"
                >
                  <FaApple className="text-2xl" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider opacity-80">{t('app_landing.download_on', 'Download on the')}</div>
                    <div className="text-base font-semibold -mt-0.5">{t('app_landing.app_store', 'App Store')}</div>
                  </div>
                </a>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#25D366] text-white px-6 py-3.5 rounded-xl hover:bg-[#1da851] transition-all duration-300 hover:scale-105 shadow-lg"
                >
                  <FaWhatsapp className="text-2xl" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider opacity-80">{t('app_landing.chat_on', 'Chat on')}</div>
                    <div className="text-base font-semibold -mt-0.5">{t('app_landing.whatsapp', 'WhatsApp')}</div>
                  </div>
                </a>
              </div>

              <div className="flex items-center gap-6 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <FaCheckCircle className="text-yellow-300" />
                  <span>{t('app_landing.free_download', 'Free to download')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FaCheckCircle className="text-yellow-300" />
                  <span>{t('app_landing.no_hidden_fees', 'No hidden fees')}</span>
                </div>
              </div>
            </div>

            <div className="hidden md:flex justify-center">
              <div className="relative">
                <div className="w-72 h-72 lg:w-96 lg:h-96 bg-white/10 rounded-3xl rotate-6 absolute -top-4 -right-4" />
                <div className="w-72 h-72 lg:w-96 lg:h-96 bg-gradient-to-br from-yellow-400/20 to-green-400/20 rounded-3xl -rotate-3 relative z-10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                  <img
                    src="/rentalhub-mark.svg"
                    alt="RentalHub NG"
                    className="w-48 h-48 lg:w-64 lg:h-64 drop-shadow-2xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary-50 border-b border-primary-100">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats(t).map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl sm:text-4xl font-extrabold text-primary-700">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-wider">{t('app_landing.why_rentalhub', 'Why RentalHub')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              {t('app_landing.why_heading', 'Everything you need to rent safely')}
            </h2>
            <p className="text-gray-500 mt-4 max-w-2xl mx-auto text-lg">
              {t('app_landing.why_sub', 'We built RentalHub to solve the biggest problems Nigerians face when renting homes.')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features(t).map((feat) => (
              <div
                key={feat.title}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-gray-100 group"
              >
                <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-primary-600 transition-colors duration-300">
                  <feat.icon className="text-2xl text-primary-600 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-wider">{t('app_landing.how_it_works', 'How It Works')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              {t('app_landing.how_heading', 'Three steps to your next home')}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            {steps(t).map((step, i) => (
              <div key={step.num} className="text-center relative">
                {i < steps(t).length - 1 && (
                  <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-primary-100" />
                )}
                <div className="relative z-10 w-24 h-24 mx-auto bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg mb-6">
                  <step.icon className="text-3xl text-white" />
                </div>
                <div className="text-xs font-bold text-primary-400 uppercase tracking-widest mb-2">{t('app_landing.step', 'Step')} {step.num}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-wider">{t('app_landing.what_people_say', 'What People Say')}</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              {t('app_landing.testimonials_heading', 'Trusted by thousands')}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials(t).map((testimonial) => (
              <div key={testimonial.name} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <FaStar key={i} className="text-yellow-400 text-sm" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <FaUsers className="text-primary-600 text-sm" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{testimonial.name}</div>
                    <div className="text-xs text-gray-400">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-6">
            {t('app_landing.cta_heading', 'Ready to find your next home?')}
          </h2>
          <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto">
            {t('app_landing.cta_sub', 'Join thousands of Nigerians who are already renting smarter with RentalHub.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://play.google.com/store/apps/details?id=com.rentalhub"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white text-primary-700 px-8 py-4 rounded-xl hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg font-semibold"
            >
              <FaGooglePlay className="text-xl" />
              {t('app_landing.google_play', 'Google Play')}
            </a>
            <a
              href="https://apps.apple.com/app/rentalhub-ng"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white text-primary-700 px-8 py-4 rounded-xl hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg font-semibold"
            >
              <FaApple className="text-xl" />
              {t('app_landing.app_store', 'App Store')}
            </a>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-[#25D366] text-white px-8 py-4 rounded-xl hover:bg-[#1da851] transition-all duration-300 hover:scale-105 shadow-lg font-semibold"
            >
              <FaWhatsapp className="text-xl" />
              {t('app_landing.chat_on_whatsapp', 'Chat on WhatsApp')}
            </a>
            <Link
              to="/register"
              className="flex items-center gap-2 border-2 border-white/40 text-white px-8 py-4 rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('app_landing.sign_up_free', 'Sign Up Free')}
              <FaArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AppLanding;
