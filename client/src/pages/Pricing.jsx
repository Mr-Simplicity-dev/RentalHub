import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaHome,
  FaStar,
  FaCheckCircle,
  FaCheckDouble,
  FaArrowRight,
  FaUsers,
  FaBuilding,
  FaShieldAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaShareAlt,
  FaWhatsapp,
  FaFacebook,
  FaTwitter,
  FaLink,
} from 'react-icons/fa';
import { toast } from 'react-toastify';

/* ──────────────────────────────────────────────────────────────
   ShareButton
   ────────────────────────────────────────────────────────────── */
const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/pricing';
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
   Pricing Plans
   ────────────────────────────────────────────────────────────── */
const plans = [
  {
    name: 'Free',
    subtitle: 'Perfect for trying out',
    price: '₦0',
    period: 'per listing',
    popular: false,
    description: 'Get started with a basic listing and see what RentalHub NG has to offer.',
    features: [
      { text: 'List 1 property', included: true },
      { text: 'Basic property details', included: true },
      { text: 'Up to 3 photos', included: true },
      { text: 'Standard search visibility', included: true },
      { text: 'Email support', included: true },
      { text: 'Priority customer support', included: false },
      { text: 'Featured badge & premium placement', included: false },
      { text: 'Advanced analytics', included: false },
    ],
    cta: 'Get Started Free',
    ctaLink: '/register',
  },
  {
    name: 'Basic',
    subtitle: 'Best value for most landlords',
    price: '₦5,000',
    period: 'per listing / year',
    popular: true,
    description: 'List multiple properties with enhanced visibility and dedicated support.',
    features: [
      { text: 'List up to 5 properties', included: true },
      { text: 'Detailed property description', included: true },
      { text: 'Up to 10 photos per listing', included: true },
      { text: 'Priority search visibility', included: true },
      { text: 'Basic analytics dashboard', included: true },
      { text: 'Email & WhatsApp support', included: true },
      { text: 'Featured badge', included: false },
      { text: 'Advanced analytics', included: false },
    ],
    cta: 'Choose Basic',
    ctaLink: '/register',
  },
  {
    name: 'Premium',
    subtitle: 'For serious landlords & agents',
    price: '₦15,000',
    period: 'per listing / year',
    popular: false,
    description: 'Unlimited listings with premium placement, video tours, and dedicated agent support.',
    features: [
      { text: 'Unlimited properties', included: true },
      { text: 'Premium property listing', included: true },
      { text: 'Up to 30 photos + video tour', included: true },
      { text: 'Featured badge & top placement', included: true },
      { text: 'Advanced analytics dashboard', included: true },
      { text: 'Dedicated agent support', included: true },
      { text: 'Legal support access', included: true },
      { text: 'Priority listing reviews', included: true },
    ],
    cta: 'Choose Premium',
    ctaLink: '/register',
  },
];

/* ──────────────────────────────────────────────────────────────
   Add-ons
   ────────────────────────────────────────────────────────────── */
const addOns = [
  {
    name: 'Professional Photography',
    price: '₦25,000',
    desc: 'Professional photo shoot for your property with 20+ edited high-resolution images.',
  },
  {
    name: 'Video Tour Production',
    price: '₦50,000',
    desc: 'Professional video walkthrough of your property, edited and optimized for the platform.',
  },
  {
    name: 'Featured Promotion',
    price: '₦10,000',
    desc: 'Boost your listing to the top of search results for 30 days with a featured badge.',
  },
  {
    name: 'Legal Document Review',
    price: '₦15,000',
    desc: 'Professional legal review of your tenancy agreement and lease documents.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Compare Section
   ────────────────────────────────────────────────────────────── */
const compareFeatures = [
  { name: 'Number of properties', free: '1', basic: 'Up to 5', premium: 'Unlimited' },
  { name: 'Photos per listing', free: '3', basic: '10', premium: '30 + Video' },
  { name: 'Search visibility', free: 'Standard', basic: 'Priority', premium: 'Top Placement' },
  { name: 'Featured badge', free: '—', basic: '—', premium: '✓' },
  { name: 'Analytics', free: 'Basic', basic: 'Basic', premium: 'Advanced' },
  { name: 'Support', free: 'Email', basic: 'Email & WhatsApp', premium: 'Dedicated Agent' },
  { name: 'Legal support', free: '—', basic: '—', premium: '✓' },
  { name: 'Listing reviews', free: 'Standard', basic: 'Standard', premium: 'Priority' },
];

/* ──────────────────────────────────────────────────────────────
   Testimonials
   ────────────────────────────────────────────────────────────── */
const testimonials = [
  {
    name: 'Chukwudi Okonkwo',
    role: 'Landlord, Lagos',
    text: 'The Premium plan paid for itself within the first week. I had multiple qualified tenants inquiring about my property.',
    rating: 5,
    plan: 'Premium',
  },
  {
    name: 'Folashade Adeyemi',
    role: 'Property Agent, Abuja',
    text: 'The Basic plan gives me everything I need to manage my properties. The analytics help me understand what tenants are looking for.',
    rating: 5,
    plan: 'Basic',
  },
  {
    name: 'Ibrahim Musa',
    role: 'Landlord, Kano',
    text: 'Started with the Free plan and upgraded within a month. The visibility and support are well worth the investment.',
    rating: 4,
    plan: 'Basic',
  },
];

/* ──────────────────────────────────────────────────────────────
   FAQ
   ────────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: 'Do I need to pay to list a property?',
    a: 'No! We offer a Free plan that allows you to list 1 property with basic details and up to 3 photos. Paid plans unlock additional features, more listings, and enhanced visibility.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept major Nigerian bank cards (Visa, Mastercard, Verve), USSD banking, bank transfers, and mobile money. All payments are processed securely.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes! You can upgrade at any time. If you upgrade mid-year, the remaining balance on your current plan will be prorated toward the new plan.',
  },
  {
    q: 'Is there a discount for multi-year plans?',
    a: 'Yes! We offer a 15% discount on 2-year plans and a 25% discount on 3-year plans. Contact our sales team for customized enterprise pricing.',
  },
  {
    q: 'What happens when my plan expires?',
    a: 'Your listings remain active but revert to standard visibility. You will receive reminders before expiration so you can renew without interruption.',
  },
  {
    q: 'Can I get a refund if I am not satisfied?',
    a: 'We offer a 14-day money-back guarantee for all paid plans. If you are not satisfied, contact our support team for a full refund.',
  },
];

/* ──────────────────────────────────────────────────────────────
   Page Component
   ────────────────────────────────────────────────────────────── */
const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
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
              Simple, Transparent{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                Pricing
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Choose the plan that fits your needs. Start for free, upgrade when you are ready.
              No hidden fees, no surprises.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaHome />
                Get Started Free
              </Link>
              <Link
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaBuilding />
                List Your Property
              </Link>
              <ShareButton
                section="Pricing"
                title="RentalHub NG — Simple, Transparent Pricing Plans"
                description="Choose from Free, Basic (₦5,000/year), or Premium (₦15,000/year) plans. Start free, upgrade anytime."
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

      {/* ===================== PRICING CARDS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-6">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Pricing Plans</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 mb-4">
              Choose the Right Plan for You
            </h2>
            <p className="text-gray-600">
              All plans include access to verified tenants, secure messaging, and landlord dashboard.
            </p>
          </div>

          {/* Toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center gap-3 bg-gray-100 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => setIsAnnual(true)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  isAnnual
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pay Yearly
              </button>
              <button
                type="button"
                onClick={() => setIsAnnual(false)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  !isAnnual
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pay Monthly
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, idx) => {
              const monthlyPrice = plan.name === 'Free' ? '₦0' : plan.name === 'Basic' ? '₦500' : '₦1,500';
              const monthlyPeriod = '/ month';

              return (
                <div
                  key={idx}
                  className={`relative rounded-3xl p-8 border-2 transition-all duration-300 hover:-translate-y-1 flex flex-col ${
                    plan.popular
                      ? 'border-primary-500 bg-white shadow-xl scale-105 md:scale-110 z-10'
                      : 'border-gray-100 bg-white shadow-sm hover:shadow-lg hover:border-gray-200'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-4 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-full shadow-lg">
                      <FaStar className="text-[10px]" />
                      Most Popular
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-gray-500 text-sm mt-1">{plan.subtitle}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl md:text-5xl font-extrabold text-gray-900">
                        {isAnnual ? plan.price : monthlyPrice}
                      </span>
                      <span className="text-gray-500 text-sm">
                        {isAnnual ? plan.period : monthlyPeriod}
                      </span>
                    </div>
                    {plan.name !== 'Free' && isAnnual && (
                      <p className="text-xs text-green-600 font-medium mt-1">
                        Save 15% with annual billing
                      </p>
                    )}
                  </div>

                  <p className="text-gray-600 text-sm leading-relaxed mb-8">
                    {plan.description}
                  </p>

                  <div className="flex-1">
                    <ul className="space-y-3.5 mb-8">
                      {plan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          {feat.included ? (
                            <FaCheckDouble className="text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 mt-0.5 shrink-0 block rounded-full border-2 border-gray-200" />
                          )}
                          <span className={feat.included ? 'text-gray-700' : 'text-gray-400'}>
                            {feat.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to={plan.ctaLink}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm text-center transition-all duration-300 ${
                      plan.popular
                        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg hover:-translate-y-0.5'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:-translate-y-0.5'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap justify-center gap-8 text-center">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FaShieldAlt className="text-primary-500" />
              <span>Secure payments</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FaCheckCircle className="text-green-500" />
              <span>14-day money-back guarantee</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FaUsers className="text-primary-500" />
              <span>5,000+ happy landlords</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== COMPARISON TABLE ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Compare Plans</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Side-by-Side Comparison
              </h2>
              <ShareButton
                section="Compare Plans"
                title="RentalHub NG — Side-by-Side Plan Comparison"
                description="Compare Free, Basic, and Premium plans to find the right fit for your property listing needs."
              />
            </div>
            <p className="text-gray-600">
              See exactly what each plan includes to make an informed decision.
            </p>
          </div>

          <div className="max-w-5xl mx-auto overflow-x-auto">
            <table className="w-full bg-white rounded-2xl shadow-sm border border-gray-100">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-5 text-sm font-semibold text-gray-900">Features</th>
                  <th className="text-center px-6 py-5 text-sm font-semibold text-gray-900">Free</th>
                  <th className="text-center px-6 py-5 text-sm font-semibold text-primary-600 bg-primary-50/50">Basic</th>
                  <th className="text-center px-6 py-5 text-sm font-semibold text-primary-600">Premium</th>
                </tr>
              </thead>
              <tbody>
                {compareFeatures.map((feat, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-700">{feat.name}</td>
                    <td className="px-6 py-4 text-sm text-center text-gray-500">{feat.free}</td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700 bg-primary-50/30 font-medium">{feat.basic}</td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700 font-medium">{feat.premium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===================== ADD-ONS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Add-On Services</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Enhance Your Listing
              </h2>
              <ShareButton
                section="Add-On Services"
                title="RentalHub NG — Add-On Services for Your Listing"
                description="Professional photography, video tours, featured promotion, and legal document review services to enhance your listing."
              />
            </div>
            <p className="text-gray-600">
              Optional services to make your property stand out and attract more tenants.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {addOns.map((addon, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group text-center"
              >
                <div className="text-4xl font-extrabold text-primary-600 mb-3">{addon.price}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{addon.name}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">{addon.desc}</p>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 text-primary-600 font-semibold text-sm hover:text-primary-700 transition-colors"
                >
                  Inquire Now <FaArrowRight className="text-xs" />
                </Link>
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
                What Our Landlords Say
              </h2>
              <ShareButton
                section="Testimonials"
                title="RentalHub NG Pricing — What Landlords Say"
                description="Hear from landlords who use RentalHub NG plans to list and manage their properties."
              />
            </div>
            <p className="text-gray-600">
              Join thousands of satisfied landlords who found the perfect plan for their needs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {testimonials.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <FaStar
                        key={i}
                        className={`text-sm ${i < item.rating ? 'text-amber-400' : 'text-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary-50 text-primary-700">
                    {item.plan}
                  </span>
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
                title="Pricing FAQ — RentalHub NG"
                description="Answers to common questions about RentalHub NG pricing plans, billing, and guarantees."
              />
            </div>
            <p className="text-gray-600">
              Everything you need to know about our pricing and billing.
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
              Start Listing for Free Today
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              No credit card required. No risk. Join thousands of landlords who trust
              RentalHub NG to connect them with verified, quality tenants.
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
                to="/list-property"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaBuilding />
                List Your Property
              </Link>
              <ShareButton
                section="Call to Action"
                title="Start Listing on RentalHub NG — Free Plan Available"
                description="No credit card required. Join thousands of landlords who trust RentalHub NG to find quality tenants."
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
              Questions About Pricing?
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Our sales team is happy to help you find the perfect plan or create a custom
              enterprise solution for your portfolio.
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG About Pricing"
                description="Have questions about RentalHub NG pricing? Contact us at support@rentalhub.com.ng or call +234 803 060 1238."
              />
            </div>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <a
                href="mailto:sales@rentalhub.com.ng"
                className="flex items-center gap-4 p-6 rounded-2xl bg-gray-50 hover:bg-primary-50 border border-gray-100 hover:border-primary-200 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <FaEnvelope className="text-xl text-primary-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-gray-500">Email sales</p>
                  <p className="text-gray-900 font-semibold">sales@rentalhub.com.ng</p>
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

export default Pricing;
