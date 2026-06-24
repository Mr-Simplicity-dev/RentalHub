import React, { useEffect, useState, useCallback } from 'react';
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

/* ──────────────────────────────────────────────────────────────
   ShareButton
   ────────────────────────────────────────────────────────────── */
const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/list-property';
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
   Plan card
   ────────────────────────────────────────────────────────────── */
const plans = [
  {
    name: 'Free',
    price: '₦0',
    period: 'per listing',
    popular: false,
    features: [
      'List 1 property',
      'Basic property details',
      'Up to 3 photos',
      'Standard visibility',
      'Email support',
    ],
    cta: 'Get Started Free',
  },
  {
    name: 'Basic',
    price: '₦5,000',
    period: 'per listing / year',
    popular: true,
    features: [
      'List up to 5 properties',
      'Detailed property description',
      'Up to 10 photos',
      'Priority visibility',
      'Basic analytics',
      'Email & WhatsApp support',
    ],
    cta: 'Choose Basic',
  },
  {
    name: 'Premium',
    price: '₦15,000',
    period: 'per listing / year',
    popular: false,
    features: [
      'Unlimited properties',
      'Premium property listing',
      'Up to 30 photos + video tour',
      'Featured badge & top placement',
      'Advanced analytics dashboard',
      'Dedicated agent support',
      'Legal support access',
    ],
    cta: 'Choose Premium',
  },
];

/* ──────────────────────────────────────────────────────────────
   Steps
   ────────────────────────────────────────────────────────────── */
const steps = [
  {
    icon: <FaFileContract className="text-3xl text-white" />,
    title: 'Create Your Account',
    desc: 'Sign up as a landlord or agent and complete identity verification to get started.',
  },
  {
    icon: <FaCamera className="text-3xl text-white" />,
    title: 'Add Your Property',
    desc: 'Fill in property details, upload high-quality photos, and set your rental price.',
  },
  {
    icon: <FaCheckCircle className="text-3xl text-white" />,
    title: 'Get Verified',
    desc: 'Your property undergoes verification to ensure authenticity. This builds trust with tenants.',
  },
  {
    icon: <FaUsers className="text-3xl text-white" />,
    title: 'Connect with Tenants',
    desc: 'Receive applications, chat with prospective tenants, and manage bookings — all from your dashboard.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Benefits
   ────────────────────────────────────────────────────────────── */
const benefits = [
  {
    icon: <FaShieldAlt className="text-2xl text-primary-600" />,
    title: 'Verified Tenant Pool',
    desc: 'All prospective tenants go through NIN-linked identity verification, so you know who you are dealing with.',
  },
  {
    icon: <FaBullhorn className="text-2xl text-primary-600" />,
    title: 'Massive Exposure',
    desc: 'Your properties reach thousands of active tenants searching across all 36 states + FCT.',
  },
  {
    icon: <FaChartLine className="text-2xl text-primary-600" />,
    title: 'Smart Analytics',
    desc: 'Track views, inquiries, and applications in real-time with your landlord dashboard.',
  },
  {
    icon: <FaTachometerAlt className="text-2xl text-primary-600" />,
    title: 'Easy Management',
    desc: 'Manage all your properties, applications, and tenant communication from one central dashboard.',
  },
  {
    icon: <FaMoneyBillWave className="text-2xl text-primary-600" />,
    title: 'Secure Payments',
    desc: 'Process rental applications, deposits, and subscription payments securely through the platform.',
  },
  {
    icon: <FaBalanceScale className="text-2xl text-primary-600" />,
    title: 'Dispute Protection',
    desc: 'Access legal support and structured dispute resolution if any issues arise with tenants.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Testimonials
   ────────────────────────────────────────────────────────────── */
const testimonials = [
  {
    name: 'Chukwudi Okonkwo',
    role: 'Landlord, Lagos',
    text: 'I listed my three-bedroom flat on RentalHub NG and had a qualified tenant within a week. The verification process gave me confidence.',
    rating: 5,
  },
  {
    name: 'Folashade Adeyemi',
    role: 'Property Agent, Abuja',
    text: 'Managing multiple properties has never been easier. The dashboard is intuitive and my clients love the professional presentation.',
    rating: 5,
  },
  {
    name: 'Ibrahim Musa',
    role: 'Landlord, Kano',
    text: 'The legal support feature is a game-changer. I had a dispute resolved quickly without the usual stress.',
    rating: 4,
  },
];

/* ──────────────────────────────────────────────────────────────
   FAQ data
   ────────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'Who can list properties on RentalHub NG?',
    a: 'Verified landlords and registered agents can list properties. You need to complete identity verification and be approved before listing.',
  },
  {
    q: 'Is there a fee to list a property?',
    a: 'We offer a free plan for a single basic listing. Paid plans start at ₦5,000 per listing per year with additional features and visibility.',
  },
  {
    q: 'How are tenants verified?',
    a: 'All tenants undergo NIN-linked identity verification before they can apply or contact you. This ensures you only deal with genuine, verified individuals.',
  },
  {
    q: 'Can I list properties in multiple states?',
    a: 'Yes! RentalHub NG covers all 36 states + FCT. You can list properties anywhere in Nigeria regardless of your location.',
  },
  {
    q: 'How do I get paid?',
    a: 'Rental payments and deposits are handled directly between you and the tenant. The platform facilitates applications and secure communication.',
  },
  {
    q: 'What if I need help with my listing?',
    a: 'We offer email and WhatsApp support for all users. Premium plan users get dedicated agent support for personalized assistance.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Page Component
   ────────────────────────────────────────────────────────────── */
const ListProperty = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleGetStarted = useCallback(() => {
    if (isAuthenticated && ['landlord', 'agent'].includes(user?.user_type)) {
      navigate('/add-property');
    } else if (isAuthenticated) {
      toast.info('You need a landlord or agent account to list properties.');
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  }, [isAuthenticated, user, navigate]);

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
              List Your Property on{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                RentalHub NG
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Reach thousands of verified tenants across Nigeria. List your property in minutes
              and start receiving qualified applications from genuine tenants.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer"
              >
                <FaHome />
                List Your Property Now
              </button>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaMoneyBillWave />
                View Pricing Plans
              </Link>
              <ShareButton
                section="List Property"
                title="List Your Property on RentalHub NG"
                description="Reach thousands of verified tenants across Nigeria. List your property in minutes on RentalHub NG."
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
              { value: '10,000+', label: 'Properties Listed' },
              { value: '50,000+', label: 'Active Tenants' },
              { value: '36 + FCT', label: 'States Covered' },
              { value: '5,000+', label: 'Landlords & Agents' },
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Simple Process</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                How It Works
              </h2>
              <ShareButton
                section="How It Works"
                title="List Your Property on RentalHub NG — How It Works"
                description="Create an account, add your property, get verified, and connect with verified tenants in 4 simple steps."
              />
            </div>
            <p className="text-gray-600">
              Getting your property listed and in front of qualified tenants takes just a few steps.
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Why List With Us</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Benefits of Listing on RentalHub NG
              </h2>
              <ShareButton
                section="Benefits"
                title="Benefits of Listing Your Property on RentalHub NG"
                description="Verified tenants, massive exposure, smart analytics, easy management, secure payments, and dispute protection."
              />
            </div>
            <p className="text-gray-600">
              Thousands of landlords and agents already trust us. Here is why.
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Pricing</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Choose Your Plan
              </h2>
              <ShareButton
                section="Pricing Plans"
                title="RentalHub NG — List Property Pricing Plans"
                description="Choose from Free, Basic (₦5,000), or Premium (₦15,000) plans to list your property on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Start with a free listing or unlock more features with our affordable paid plans.
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
                    Most Popular
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Testimonials</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                What Landlords Say
              </h2>
              <ShareButton
                section="Testimonials"
                title="What Landlords Say About RentalHub NG"
                description="Hear from landlords and agents who list their properties on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Join thousands of satisfied landlords who have found great tenants through our platform.
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">FAQ</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Frequently Asked Questions
              </h2>
              <ShareButton
                section="FAQ"
                title="List Property FAQ — RentalHub NG"
                description="Answers to common questions about listing properties on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Got questions? We have answers.
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
              Ready to List Your Property?
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              Join over 5,000 landlords and agents already using RentalHub NG to find qualified tenants.
              List your property today and start receiving applications.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer"
              >
                <FaHome />
                List Your Property Now
              </button>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                Create Free Account
              </Link>
              <ShareButton
                section="Call to Action"
                title="List Your Property on RentalHub NG Today"
                description="Join over 5,000 landlords and agents. List your property and find verified tenants on RentalHub NG."
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
              Need Help?
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Our team is ready to help you get your property listed. Reach out anytime.
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG About Listing"
                description="Need help listing your property? Contact RentalHub NG at support@rentalhub.com.ng or call +234 803 060 1238."
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
                  <p className="text-sm text-gray-500">Email us</p>
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
                  <p className="text-sm text-gray-500">Call us</p>
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
