import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  FaTachometerAlt,
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
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

/* ──────────────────────────────────────────────────────────────
   ShareButton — reusable share sheet
   ────────────────────────────────────────────────────────────── */
const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/landlord-guide';
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
   Quick stats
   ────────────────────────────────────────────────────────────── */
const stats = [
  { label: 'Properties Listed', value: '10,000+' },
  { label: 'Verified Landlords', value: '5,000+' },
  { label: 'Successful Tenancies', value: '8,500+' },
  { label: 'States Covered', value: '36 + FCT' },
];

/* ──────────────────────────────────────────────────────────────
   Best practices checklist
   ────────────────────────────────────────────────────────────── */
const bestPractices = [
  {
    icon: <FaTag className="text-xl text-primary-600" />,
    title: 'Use Clear Titles & Accurate Descriptions',
    desc: 'Write descriptive, honest titles that highlight key features. Include details about room sizes, amenities, nearby landmarks, and utilities. Avoid exaggerations that could lead to tenant disappointment.',
    tips: ['Mention exact room count and floor level', 'Include nearby transport and amenities', 'Be specific about included utilities'],
  },
  {
    icon: <FaCamera className="text-xl text-primary-600" />,
    title: 'Upload High-Quality Photos',
    desc: 'Bright, well-lit photos from multiple angles dramatically increase inquiry rates. Include shots of every room, the building exterior, and surrounding neighborhood.',
    tips: ['Shoot during daylight with good lighting', 'Capture all rooms including kitchen and bathrooms', 'Show storage spaces and closets'],
  },
  {
    icon: <FaMoneyBillWave className="text-xl text-primary-600" />,
    title: 'Set Realistic Rent Prices',
    desc: 'Research comparable properties in your area before setting a price. Competitive pricing attracts more qualified tenants and reduces vacancy periods.',
    tips: ['Research 5+ similar listings in your area', 'Factor in property condition and amenities', 'Consider seasonal demand variations'],
  },
  {
    icon: <FaComments className="text-xl text-primary-600" />,
    title: 'Respond Quickly to Inquiries',
    desc: 'Tenants appreciate fast responses. Aim to reply to messages and applications within 24 hours. Quick communication signals a professional, attentive landlord.',
    tips: ['Enable push notifications for new messages', 'Set up auto-reply for common questions', 'Schedule viewing slots in advance'],
  },
  {
    icon: <FaSyncAlt className="text-xl text-primary-600" />,
    title: 'Keep Your Listing Updated',
    desc: 'Remove listings once rented, update availability status promptly, and refresh your property details periodically to keep them accurate and appealing.',
    tips: ['Update status immediately after tenancy', 'Refresh photos seasonally', 'Remove outdated promotions or offers'],
  },
  {
    icon: <FaShieldAlt className="text-xl text-primary-600" />,
    title: 'Highlight Verification & Safety Features',
    desc: 'Showcase your verified status, security features (CCTV, security guards), and any safety certifications. Verified listings receive significantly more tenant applications.',
    tips: ['Complete your identity verification', 'Mention security features clearly', 'Share safety certificates if available'],
  },
];

/* ──────────────────────────────────────────────────────────────
   Preparation steps
   ────────────────────────────────────────────────────────────── */
const prepSteps = [
  {
    step: 1,
    title: 'Gather Property Documents',
    desc: 'Collect all necessary documents including proof of ownership, utility bills, property tax receipts, and any renovation permits.',
    icon: <FaFileContract className="text-2xl text-white" />,
    items: ['Proof of ownership / title deed', 'Recent utility bills', 'Property tax receipts', 'Renovation/improvement records'],
  },
  {
    step: 2,
    title: 'Prepare Your Property',
    desc: 'Ensure your property is in good condition before listing. Make necessary repairs, deep clean, and consider professional photography.',
    icon: <FaTools className="text-2xl text-white" />,
    items: ['Complete minor repairs and touch-ups', 'Deep clean all rooms and common areas', 'Consider professional photography', 'Stage rooms to look spacious and inviting'],
  },
  {
    step: 3,
    title: 'Verify Your Identity',
    desc: 'Complete your landlord verification through RentalHub NG. This builds trust with potential tenants and increases your listing visibility.',
    icon: <FaUserCheck className="text-2xl text-white" />,
    items: ['Submit valid government ID', 'Complete NIN verification', 'Provide proof of property ownership', 'Add profile photo and bio'],
  },
  {
    step: 4,
    title: 'Publish & Promote',
    desc: 'Create a compelling listing with detailed descriptions, high-quality photos, and competitive pricing. Share your listing across platforms.',
    icon: <FaBullhorn className="text-2xl text-white" />,
    items: ['Write detailed property description', 'Upload 10+ high-quality photos', 'Set competitive rental price', 'Share listing on social media'],
  },
];

/* ──────────────────────────────────────────────────────────────
   Tips cards
   ────────────────────────────────────────────────────────────── */
const proTips = [
  {
    icon: <FaLightbulb className="text-2xl text-primary-500" />,
    title: 'First Impressions Matter',
    desc: 'The first photo in your listing is the most important. Choose a bright, well-composed hero shot that showcases your property at its best.',
  },
  {
    icon: <FaUsers className="text-2xl text-primary-500" />,
    title: 'Screen Tenants Thoroughly',
    desc: 'Use RentalHub NG verification tools to confirm tenant identities and check references before accepting applications.',
  },
  {
    icon: <FaLock className="text-2xl text-primary-500" />,
    title: 'Use Secure Contracts',
    desc: 'Always use legally reviewed tenancy agreements. RentalHub NG provides access to legal templates and lawyer support.',
  },
  {
    icon: <FaChartLine className="text-2xl text-primary-500" />,
    title: 'Monitor Your Performance',
    desc: 'Use your landlord dashboard to track views, inquiries, and application rates. Optimize your listing based on performance data.',
  },
  {
    icon: <FaHandshake className="text-2xl text-primary-500" />,
    title: 'Build Tenant Relationships',
    desc: 'Professional, responsive communication leads to positive reviews and referrals. Happy tenants stay longer and take better care of your property.',
  },
  {
    icon: <FaBalanceScale className="text-2xl text-primary-500" />,
    title: 'Know Your Rights & Responsibilities',
    desc: 'Familiarize yourself with Nigerian tenancy laws in your state. Understanding legal requirements protects you and your tenants.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Common mistakes
   ────────────────────────────────────────────────────────────── */
const mistakes = [
  {
    title: 'Poor Quality Photos',
    desc: 'Dark, blurry, or limited photos deter potential tenants. Always use well-lit, high-resolution images from multiple angles.',
    fix: 'Hire a professional photographer or use natural daylight and a quality smartphone camera.',
  },
  {
    title: 'Incomplete Information',
    desc: 'Missing details about utilities, parking, or house rules leads to repetitive questions and fewer applications.',
    fix: 'Fill out all property fields completely. Include details about water, electricity, parking, and pet policies.',
  },
  {
    title: 'Overpricing',
    desc: 'Setting rent above market rate results in longer vacancies and fewer qualified applicants.',
    fix: 'Research comparable listings in your area and price competitively to attract quality tenants faster.',
  },
  {
    title: 'Slow Response Times',
    desc: 'Delayed responses frustrate tenants and make you appear unprofessional.',
    fix: 'Set up notifications and aim to respond to all inquiries within 24 hours.',
  },
];

/* ──────────────────────────────────────────────────────────────
   FAQ
   ────────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'How do I become a verified landlord on RentalHub NG?',
    a: 'Register as a landlord, complete your profile with valid identification (NIN, passport, or driver\'s license), provide proof of property ownership, and submit for verification. Our team typically verifies within 24-48 hours.',
  },
  {
    q: 'How many properties can I list?',
    a: 'The Free plan allows 1 property listing. Basic (₦5,000/year) allows up to 5 properties. Premium (₦15,000/year) allows unlimited properties with premium placement.',
  },
  {
    q: 'What happens after my listing is approved?',
    a: 'Your property appears in search results and becomes visible to all tenants. You will receive applications and inquiries through your dashboard, where you can review tenant profiles, chat, and schedule viewings.',
  },
  {
    q: 'How are tenants verified?',
    a: 'All tenants undergo NIN-linked identity verification before they can apply or message you. This ensures you only interact with verified, genuine individuals.',
  },
  {
    q: 'What if my listing is rejected?',
    a: 'Our team provides specific feedback on why a listing was rejected. Common reasons include incomplete information or poor photo quality. Simply revise and resubmit — we are happy to help you improve your listing.',
  },
  {
    q: 'Can I edit my listing after it\'s published?',
    a: 'Yes! You can edit your listing anytime from your landlord dashboard. Update photos, change pricing, modify descriptions, or mark properties as rented.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Page Component
   ────────────────────────────────────────────────────────────── */
const LandlordGuide = () => {
  const { t } = useTranslation();
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
              Landlord{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                Guide
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Everything you need to know about listing, managing, and renting your properties
              successfully on RentalHub NG — from preparation to tenant move-in.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaHome />
                List Your Property
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaMoneyBillWave />
                View Pricing Plans
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

      {/* ===================== STATS ===================== */}
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
                  description={`RentalHub NG has ${stat.value} ${stat.label.toLowerCase()}. Join thousands of successful landlords.`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== QUICK START STEPS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Getting Started</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                How to Prepare Your Listing
              </h2>
              <ShareButton
                section="Getting Started"
                title="RentalHub NG — How to Prepare Your Property Listing"
                description="Follow these 4 simple steps to prepare, verify, and publish your property listing on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Follow these steps to create a listing that attracts quality tenants quickly.
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

      {/* ===================== BEST PRACTICES ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Best Practices</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Tips for Successful Listings
              </h2>
              <ShareButton
                section="Best Practices"
                title="RentalHub NG — Best Practices for Property Listing Success"
                description="Proven tips and best practices to create compelling listings and attract quality tenants faster."
              />
            </div>
            <p className="text-gray-600">
              Proven strategies to help your property stand out and attract the right tenants.
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

      {/* ===================== PRO TIPS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Pro Tips</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Expert Advice for Landlords
              </h2>
              <ShareButton
                section="Pro Tips"
                title="RentalHub NG — Expert Advice for Landlords"
                description="Professional tips on first impressions, tenant screening, contracts, and building successful landlord-tenant relationships."
              />
            </div>
            <p className="text-gray-600">
              Level up your landlord game with these expert insights.
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

      {/* ===================== COMMON MISTAKES ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Avoid These</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Common Mistakes to Avoid
              </h2>
              <ShareButton
                section="Common Mistakes"
                title="RentalHub NG — Common Landlord Mistakes to Avoid"
                description="Learn from common listing mistakes including poor photos, incomplete information, overpricing, and slow response times."
              />
            </div>
            <p className="text-gray-600">
              Avoid these pitfalls to ensure a smooth and successful property listing experience.
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
                    <span className="font-semibold">Fix:</span> {item.fix}
                  </p>
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
                title="Landlord Guide FAQ — RentalHub NG"
                description="Answers to common questions about listing and managing properties on RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Everything you need to know about listing on RentalHub NG.
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
              Ready to List Your Property?
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              Join over 5,000 successful landlords on RentalHub NG. List your property today
              and start connecting with verified, qualified tenants across Nigeria.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaHome />
                List Your Property Now
              </Link>
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
                description="Join over 5,000 successful landlords on RentalHub NG. List your property and find verified tenants."
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
              Need Help With Your Listing?
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Our support team is here to help you every step of the way — from setting up your
              account to publishing your first listing.
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

export default LandlordGuide;
