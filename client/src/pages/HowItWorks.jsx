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
   Tenant Steps
   ────────────────────────────────────────────────────────────── */
const tenantSteps = [
  {
    icon: <FaUserPlus className="text-2xl text-white" />,
    title: 'Create Your Account',
    desc: 'Sign up as a tenant and complete your identity verification using your NIN. This ensures a safe community for everyone.',
    highlights: ['Free registration', 'NIN-linked verification', 'Profile management'],
  },
  {
    icon: <FaSearch className="text-2xl text-white" />,
    title: 'Browse Properties',
    desc: 'Search through thousands of verified properties across all 36 states + FCT. Use filters to find exactly what you need.',
    highlights: ['Filter by location & budget', 'Virtual property tours', 'Save favorites'],
  },
  {
    icon: <FaLock className="text-2xl text-white" />,
    title: 'Unlock Full Details',
    desc: 'Make a one-time payment to unlock full property details, including the landlord contact information and premium media.',
    highlights: ['Full address revealed', 'Landlord contact info', 'HD photos & video'],
  },
  {
    icon: <FaHeart className="text-2xl text-white" />,
    title: 'Apply & Connect',
    desc: 'Submit applications to your preferred properties, chat with landlords directly, and secure your new home.',
    highlights: ['One-click application', 'In-app messaging', 'Move-in support'],
  },
];

/* ──────────────────────────────────────────────────────────────
   Landlord Steps
   ────────────────────────────────────────────────────────────── */
const landlordSteps = [
  {
    icon: <FaUserPlus className="text-2xl text-white" />,
    title: 'Register & Verify',
    desc: 'Create a landlord or agent account and complete profile verification to start listing your properties.',
    highlights: ['Quick registration', 'Identity verification', 'Agent onboarding'],
  },
  {
    icon: <FaCamera className="text-2xl text-white" />,
    title: 'List Your Property',
    desc: 'Add your property with detailed descriptions, high-quality photos, and set your rental terms.',
    highlights: ['Detailed listings', 'Photo & video upload', 'Flexible pricing'],
  },
  {
    icon: <FaCreditCard className="text-2xl text-white" />,
    title: 'Choose a Plan',
    desc: 'Select a listing plan that suits your needs — from free basic listings to premium featured placements.',
    highlights: ['Free plan available', 'From ₦5,000/year', 'Featured badges'],
  },
  {
    icon: <FaComments className="text-2xl text-white" />,
    title: 'Manage & Connect',
    desc: 'Review applications, chat with prospective tenants, and manage all your properties from one dashboard.',
    highlights: ['Application management', 'Tenant messaging', 'Analytics dashboard'],
  },
];

/* ──────────────────────────────────────────────────────────────
   Platform Features
   ────────────────────────────────────────────────────────────── */
const platformFeatures = [
  {
    icon: <FaShieldAlt className="text-3xl text-primary-500" />,
    title: 'Identity Verification',
    desc: 'Every user — tenant, landlord, and agent — goes through NIN-linked identity verification for a trusted ecosystem.',
  },
  {
    icon: <FaHandshake className="text-3xl text-primary-500" />,
    title: 'Secure Transactions',
    desc: 'Applications and communications are handled securely within the platform. Clear terms protect all parties.',
  },
  {
    icon: <FaClipboardCheck className="text-3xl text-primary-500" />,
    title: 'Legal Support',
    desc: 'Access qualified lawyers, evidence verification, and structured dispute resolution when you need it.',
  },
  {
    icon: <FaStar className="text-3xl text-primary-500" />,
    title: 'Ratings & Reviews',
    desc: 'Transparent ratings and verified reviews help tenants and landlords make informed decisions.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Video Walkthrough Section Data
   ────────────────────────────────────────────────────────────── */
const walkthroughSteps = [
  {
    step: '01',
    title: 'Sign Up',
    desc: 'Register as a tenant or landlord in under 2 minutes.',
    color: 'from-primary-500 to-primary-600',
  },
  {
    step: '02',
    title: 'Verify',
    desc: 'Complete NIN verification to unlock full access.',
    color: 'from-primary-600 to-primary-700',
  },
  {
    step: '03',
    title: 'Browse or List',
    desc: 'Tenants search, landlords list — both with powerful tools.',
    color: 'from-primary-700 to-primary-800',
  },
  {
    step: '04',
    title: 'Connect',
    desc: 'Apply, chat, and close your deal with confidence.',
    color: 'from-primary-800 to-primary-900',
  },
];

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
  const [openFaq, setOpenFaq] = useState(null);

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
              How{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                RentalHub NG
              </span>{' '}
              Works
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Whether you are looking for your next home or listing a property for rent,
              RentalHub NG makes the process simple, secure, and transparent.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaSearch />
                Browse Properties
              </Link>
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaBuilding />
                List Your Property
              </Link>
              <ShareButton
                section="How It Works"
                title="How RentalHub NG Works"
                description="Whether you are looking for your next home or listing a property for rent, RentalHub NG makes it simple, secure, and transparent."
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
              <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Quick Overview</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">
                Your Journey in 4 Simple Steps
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">For Tenants</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Find Your Perfect Home
              </h2>
              <ShareButton
                section="For Tenants"
                title="RentalHub NG for Tenants — Find Your Perfect Home"
                description="Create an account, browse verified properties, unlock full details, and apply to your dream home."
              />
            </div>
            <p className="text-gray-600">
              From search to move-in, here is how tenants find their next home on RentalHub NG.
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
                    section={`Tenant Step ${idx + 1}`}
                    title={`RentalHub NG — ${step.title}`}
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
              Get Started as a Tenant
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
            Both tenants and landlords use RentalHub NG
          </span>
        </div>
      </div>

      {/* ===================== FOR LANDLORDS ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">For Landlords & Agents</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                List & Manage Properties
              </h2>
              <ShareButton
                section="For Landlords"
                title="RentalHub NG for Landlords — List & Manage Properties"
                description="Register, list your property, choose a plan, and connect with verified tenants through your dashboard."
              />
            </div>
            <p className="text-gray-600">
              From registration to tenant connection, here is how landlords succeed on RentalHub NG.
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
                    section={`Landlord Step ${idx + 1}`}
                    title={`RentalHub NG — ${step.title}`}
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
              Start Listing Your Property
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== PLATFORM FEATURES ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Platform Features</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                What Makes the Platform Work
              </h2>
              <ShareButton
                section="Platform Features"
                title="RentalHub NG Platform Features"
                description="Identity verification, secure transactions, legal support, and transparent ratings — the pillars of RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              These features ensure every interaction on RentalHub NG is safe and trustworthy.
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
                    title={`RentalHub NG — ${feature.title}`}
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
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">FAQ</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Frequently Asked Questions
              </h2>
              <ShareButton
                section="FAQ"
                title="How It Works FAQ — RentalHub NG"
                description="Common questions about how RentalHub NG works for tenants and landlords."
              />
            </div>
            <p className="text-gray-600">
              Everything you need to know about using RentalHub NG.
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
              Ready to Get Started?
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              Join thousands of Nigerians using RentalHub NG to find homes and list properties.
              Your journey starts here.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                Create Free Account
              </Link>
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaSearch />
                Browse Properties
              </Link>
              <ShareButton
                section="Call to Action"
                title="Get Started on RentalHub NG"
                description="Join thousands of Nigerians using RentalHub NG to find homes and list properties. Create your free account today."
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
              Still Have Questions?
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Our support team is always ready to help you navigate the platform.
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG Support"
                description="Have questions about how RentalHub NG works? Contact us at support@rentalhub.com.ng or call +234 803 060 1238."
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

export default HowItWorks;
