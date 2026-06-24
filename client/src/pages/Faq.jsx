import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaSearch,
  FaBuilding,
  FaUserCheck,
  FaFileContract,
  FaMoneyBillWave,
  FaStar,
  FaArrowRight,
  FaUsers,
  FaHome,
  FaComments,
  FaSyncAlt,
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
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/faq';
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
   FAQ Categories & Data
   ────────────────────────────────────────────────────────────── */

const categories = [
  {
    id: 'general',
    label: 'General',
    icon: <FaStar className="text-white" />,
    color: 'from-primary-500 to-primary-600',
  },
  {
    id: 'tenants',
    label: 'For Tenants',
    icon: <FaSearch className="text-white" />,
    color: 'from-primary-600 to-primary-700',
  },
  {
    id: 'landlords',
    label: 'For Landlords',
    icon: <FaBuilding className="text-white" />,
    color: 'from-primary-700 to-primary-800',
  },
  {
    id: 'verification',
    label: 'Verification',
    icon: <FaUserCheck className="text-white" />,
    color: 'from-primary-500 to-primary-700',
  },
  {
    id: 'pricing',
    label: 'Pricing & Billing',
    icon: <FaMoneyBillWave className="text-white" />,
    color: 'from-primary-600 to-primary-800',
  },
  {
    id: 'legal',
    label: 'Legal & Disputes',
    icon: <FaFileContract className="text-white" />,
    color: 'from-primary-700 to-primary-900',
  },
  {
    id: 'account',
    label: 'Account & Support',
    icon: <FaUsers className="text-white" />,
    color: 'from-primary-500 to-primary-800',
  },
];

const faqData = {
  general: [
    {
      q: 'What is RentalHub NG?',
      a: 'RentalHub NG is Nigeria\'s most trusted property technology platform. We connect tenants, landlords, agents, and legal professionals across all 36 states and the Federal Capital Territory. Our platform offers verified property listings, identity verification, legal support, dispute resolution, and additional services like fumigation/cleaning and transportation.',
    },
    {
      q: 'Is RentalHub NG free to use?',
      a: 'Yes! Browsing properties and creating an account is completely free. Tenants can search and view listings at no cost. Landlords can start with a Free plan to list 1 property. Paid plans (Basic ₦5,000/year, Premium ₦15,000/year) unlock additional features and enhanced visibility.',
    },
    {
      q: 'How does RentalHub NG ensure trust and safety?',
      a: 'Every user — tenant, landlord, and agent — undergoes NIN-linked identity verification. Properties are reviewed before listing approval. We also provide legal support, evidence verification, and structured dispute resolution to protect all parties on the platform.',
    },
    {
      q: 'Which states does RentalHub NG cover?',
      a: 'RentalHub NG covers all 36 states in Nigeria plus the Federal Capital Territory (FCT), Abuja. You can find properties and list in any state regardless of your location.',
    },
    {
      q: 'Is there a mobile app available?',
      a: 'Yes! RentalHub NG offers a mobile app for both Android and iOS devices. You can search properties, send messages, manage listings, and access all platform features on the go.',
    },
  ],
  tenants: [
    {
      q: 'How do I find a property on RentalHub NG?',
      a: 'Simply create a free account, complete your identity verification, and start searching. Use filters to narrow down by location, property type, budget, and more. Browse through thousands of verified properties across all 36 states + FCT.',
    },
    {
      q: 'Do I need to pay to contact a landlord?',
      a: 'You can browse listings freely. To unlock full property details — including landlord contact information, full address, and premium media — you may need to make a one-time payment or have an active tenant subscription depending on the listing.',
    },
    {
      q: 'How are tenants verified on the platform?',
      a: 'All tenants undergo NIN-linked identity verification before they can apply for properties or contact landlords. This ensures a safe community for everyone and guarantees that landlords are dealing with genuine, verified individuals.',
    },
    {
      q: 'Can I save properties and apply later?',
      a: 'Yes! Use the save/bookmark feature to keep track of properties you are interested in. You can submit applications when you are ready, right from your saved list or directly from any property page.',
    },
    {
      q: 'How do I know if a property listing is genuine?',
      a: 'Every property on RentalHub NG goes through a verification process before approval. Landlords are identity-verified, and listings are reviewed for accuracy. Look for the verified badge on listings for added confidence.',
    },
    {
      q: 'Can I schedule property viewings through the platform?',
      a: 'Yes! Once you connect with a landlord, you can schedule viewings directly through the in-app messaging system. Many landlords provide available viewing slots for easy scheduling.',
    },
  ],
  landlords: [
    {
      q: 'How do I become a verified landlord on RentalHub NG?',
      a: 'Register as a landlord, complete your profile with valid identification (NIN, passport, or driver\'s license), provide proof of property ownership, and submit for verification. Our team typically verifies within 24-48 hours.',
    },
    {
      q: 'How many properties can I list?',
      a: 'The Free plan allows 1 property listing. Basic (₦5,000/year) allows up to 5 properties. Premium (₦15,000/year) allows unlimited properties with premium placement, featured badges, and dedicated support.',
    },
    {
      q: 'How are tenants verified before contacting me?',
      a: 'All tenants undergo NIN-linked identity verification before they can apply or message you. This ensures you only interact with verified, genuine individuals — no more wasting time with unqualified leads.',
    },
    {
      q: 'What happens after my listing is approved?',
      a: 'Your property appears in search results and becomes visible to all tenants. You will receive applications and inquiries through your dashboard, where you can review tenant profiles, chat, and schedule viewings.',
    },
    {
      q: 'Can I edit my listing after it is published?',
      a: 'Yes! You can edit your listing anytime from your landlord dashboard. Update photos, change pricing, modify descriptions, mark properties as rented, or refresh details seasonally.',
    },
    {
      q: 'What if my listing is rejected?',
      a: 'Our team provides specific feedback on why a listing was rejected. Common reasons include incomplete information or poor photo quality. Simply revise and resubmit — we are happy to help you improve your listing.',
    },
    {
      q: 'How do I get paid for rentals?',
      a: 'Rental payments and deposits are handled directly between you and the tenant. The platform facilitates applications, verification, and secure communication, while payments are arranged privately.',
    },
    {
      q: 'What kind of support do landlords get?',
      a: 'Free and Basic plan users get email and WhatsApp support. Premium plan users receive dedicated agent support for personalized assistance. All users have access to our knowledge base and FAQ resources.',
    },
  ],
  verification: [
    {
      q: 'Do I need to verify my identity before using the platform?',
      a: 'Yes. Identity verification helps reduce fraud and protects both tenants and landlords. All users — tenants, landlords, and agents — must complete NIN-linked verification before accessing full platform features.',
    },
    {
      q: 'How long does verification take?',
      a: 'Identity verification is usually processed within 24-48 hours after you submit your NIN and passport photograph. Some cases may take longer if additional checks are needed. Premium landlords enjoy priority verification.',
    },
    {
      q: 'What documents do I need for verification?',
      a: 'Tenants need a valid NIN (National Identification Number). Landlords need a valid government ID (NIN, passport, or driver\'s license), proof of property ownership, and a profile photo.',
    },
    {
      q: 'How does property verification work?',
      a: 'Admin staff review new listings and submitted identity documents before approving properties for public visibility. This ensures that all listings on the platform are genuine and belong to verified individuals.',
    },
    {
      q: 'Is my personal information safe during verification?',
      a: 'Yes. Your data is encrypted and securely stored. We only use verification information to confirm identity and prevent fraud. Your information is never shared without your consent.',
    },
  ],
  pricing: [
    {
      q: 'Do I need to pay to list a property?',
      a: 'No! We offer a Free plan that allows you to list 1 property with basic details and up to 3 photos. Paid plans unlock additional features, more listings, and enhanced search visibility.',
    },
    {
      q: 'What payment methods are accepted?',
      a: 'We accept major Nigerian bank cards (Visa, Mastercard, Verve), USSD banking, bank transfers, and mobile money. All payments are processed securely through our integrated payment gateway.',
    },
    {
      q: 'Can I upgrade or downgrade my plan?',
      a: 'Yes! You can upgrade at any time. If you upgrade mid-year, the remaining balance on your current plan will be prorated toward the new plan. Downgrades take effect at the next billing cycle.',
    },
    {
      q: 'Is there a discount for multi-year plans?',
      a: 'Yes! We offer a 15% discount on 2-year plans and a 25% discount on 3-year plans. Contact our sales team for customized enterprise pricing for large portfolios.',
    },
    {
      q: 'What happens when my plan expires?',
      a: 'Your listings remain active but revert to standard visibility. You will receive email reminders before expiration so you can renew without interruption to your service.',
    },
    {
      q: 'Can I get a refund if I am not satisfied?',
      a: 'We offer a 14-day money-back guarantee for all paid plans. If you are not satisfied with the service, contact our support team for a full refund — no questions asked.',
    },
  ],
  legal: [
    {
      q: 'What legal support does RentalHub NG offer?',
      a: 'RentalHub NG provides access to qualified lawyers, evidence verification tools, and structured dispute resolution processes. Premium plan users get direct legal support access.',
    },
    {
      q: 'How are disputes resolved on the platform?',
      a: 'RentalHub NG offers a structured dispute resolution process. You can submit evidence through our platform, request legal support, and our admin team will help mediate between parties to find a fair resolution.',
    },
    {
      q: 'Does RentalHub NG provide tenancy agreements?',
      a: 'Yes! We provide access to legally reviewed tenancy agreement templates. For customized contracts, Premium users can access lawyer support to ensure all agreements comply with Nigerian tenancy laws.',
    },
    {
      q: 'What are my rights as a landlord under Nigerian law?',
      a: 'Nigerian tenancy laws vary by state. Generally, landlords have the right to receive rent, enforce lease terms, and take legal action for breach of contract. We recommend consulting with our legal partners for state-specific guidance.',
    },
    {
      q: 'What are my rights as a tenant under Nigerian law?',
      a: 'Tenants have the right to habitable premises, privacy, and protection against illegal eviction. Nigerian law requires proper notice before eviction and prohibits arbitrary rent increases during a lease term.',
    },
  ],
  account: [
    {
      q: 'How do I create an account on RentalHub NG?',
      a: 'Click "Sign Up" or "Create Account", choose your account type (Tenant, Landlord, or Agent), fill in your details, and verify your email address. Then complete identity verification to unlock full platform access.',
    },
    {
      q: 'Can I have both a tenant and landlord account?',
      a: 'Yes, you can have separate accounts if you want to both list properties and search as a tenant. Each account type has its own dashboard and features tailored to your role.',
    },
    {
      q: 'What if I forget my password?',
      a: 'Click the "Forgot Password" link on the login page, enter your registered email address, and follow the password reset link sent to your inbox. The link expires after 1 hour for security.',
    },
    {
      q: 'How do I contact customer support?',
      a: 'You can reach us via email at support@rentalhub.com.ng, call us at +234 803 060 1238, or use the live chat feature on our website. Our support team is available Monday to Saturday, 8 AM to 6 PM.',
    },
    {
      q: 'How do I delete my account?',
      a: 'To delete your account, please contact our support team. We will process your request within 48 hours. Note that deleting your account will remove all your listings and data from the platform.',
    },
    {
      q: 'Can I use RentalHub NG as both a tenant and landlord?',
      a: 'Yes, you can have separate accounts if you want to both list properties and search as a tenant. Each account type has its own dashboard and features. Just use different email addresses for each account.',
    },
  ],
};

/* ──────────────────────────────────────────────────────────────
   Quick link cards
   ────────────────────────────────────────────────────────────── */
const quickLinks = [
  {
    icon: <FaHome className="text-xl text-primary-600" />,
    title: 'List Your Property',
    desc: 'Reach thousands of verified tenants across Nigeria.',
    link: '/list-property',
    label: 'Start Listing',
  },
  {
    icon: <FaSearch className="text-xl text-primary-600" />,
    title: 'Browse Properties',
    desc: 'Find verified properties in all 36 states + FCT.',
    link: '/properties',
    label: 'Search Now',
  },
  {
    icon: <FaMoneyBillWave className="text-xl text-primary-600" />,
    title: 'View Pricing Plans',
    desc: 'Free, Basic, and Premium plans available.',
    link: '/pricing',
    label: 'See Plans',
  },
  {
    icon: <FaFileContract className="text-xl text-primary-600" />,
    title: 'Landlord Guide',
    desc: 'Tips and best practices for successful listings.',
    link: '/landlord-guide',
    label: 'Read Guide',
  },
];

/* ──────────────────────────────────────────────────────────────
   Stats
   ────────────────────────────────────────────────────────────── */
const stats = [
  { label: 'Properties Listed', value: '10,000+' },
  { label: 'Active Users', value: '50,000+' },
  { label: 'States Covered', value: '36 + FCT' },
  { label: 'Verified Landlords', value: '5,000+' },
];

/* ──────────────────────────────────────────────────────────────
   Page Component
   ────────────────────────────────────────────────────────────── */
const Faq = () => {
  const [activeCategory, setActiveCategory] = useState('general');
  const [openFaq, setOpenFaq] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Get all FAQs flattened for search
  const allFaqs = Object.entries(faqData).flatMap(([category, items]) =>
    items.map((item) => ({ ...item, category }))
  );

  // Filter FAQs based on search and active category
  const filteredFaqs = searchQuery.trim()
    ? allFaqs.filter(
        (item) =>
          item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.a.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : faqData[activeCategory] || [];

  const currentCategoryLabel = categories.find((c) => c.id === activeCategory)?.label || 'General';

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
              Frequently Asked{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                Questions
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Everything you need to know about RentalHub NG. Find answers to common questions
              about listing properties, finding rentals, verification, pricing, and more.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                Create Free Account
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaComments />
                Contact Support
              </Link>
              <ShareButton
                section="FAQ"
                title="RentalHub NG — Frequently Asked Questions"
                description="Everything you need to know about RentalHub NG. Find answers about property listings, rentals, verification, pricing, and more."
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
                  description={`RentalHub NG has ${stat.value} ${stat.label.toLowerCase()}.`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SEARCH ===================== */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setOpenFaq(null);
                }}
                placeholder="Search frequently asked questions..."
                className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none transition-all duration-300 text-base"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-medium cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FAQ CONTENT ===================== */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* Category tabs */}
            {!searchQuery.trim() && (
              <div className="flex flex-wrap justify-center gap-3 mb-12">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setOpenFaq(null);
                    }}
                    className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                      activeCategory === cat.id
                        ? `bg-gradient-to-r ${cat.color} text-white shadow-md`
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300 hover:text-primary-600 shadow-sm'
                    }`}
                  >
                    <span className="text-base">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Results header */}
            <div className="max-w-3xl mx-auto mb-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  {searchQuery.trim() ? (
                    <p className="text-gray-500 text-sm">
                      {filteredFaqs.length} result{filteredFaqs.length !== 1 ? 's' : ''} for "{searchQuery}"
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="ml-2 text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
                      >
                        Clear search
                      </button>
                    </p>
                  ) : (
                    <>
                      <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">
                        {currentCategoryLabel}
                      </span>
                      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                        {activeCategory === 'general' && 'General Questions'}
                        {activeCategory === 'tenants' && 'Tenant Questions'}
                        {activeCategory === 'landlords' && 'Landlord Questions'}
                        {activeCategory === 'verification' && 'Verification Questions'}
                        {activeCategory === 'pricing' && 'Pricing & Billing Questions'}
                        {activeCategory === 'legal' && 'Legal & Dispute Questions'}
                        {activeCategory === 'account' && 'Account & Support Questions'}
                      </h2>
                    </>
                  )}
                </div>
                <ShareButton
                  section={currentCategoryLabel}
                  title={`RentalHub NG FAQ — ${currentCategoryLabel}`}
                  description={`Frequently asked questions about ${currentCategoryLabel.toLowerCase()} on RentalHub NG.`}
                />
              </div>
            </div>

            {/* FAQ accordion list */}
            {filteredFaqs.length > 0 ? (
              <div className="max-w-3xl mx-auto space-y-4">
                {filteredFaqs.map((faq, idx) => {
                  const uniqueId = `${searchQuery ? 'search' : activeCategory}-${idx}`;
                  return (
                    <div
                      key={uniqueId}
                      className="border border-gray-200 rounded-2xl overflow-hidden bg-white transition-all duration-300 hover:shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaq(openFaq === uniqueId ? null : uniqueId)}
                        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-gray-900 font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <span className="flex-1">{faq.q}</span>
                        <FaArrowRight
                          className={`text-primary-500 shrink-0 transition-transform duration-300 ${
                            openFaq === uniqueId ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          openFaq === uniqueId ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        <div className="px-6 pb-5">
                          {searchQuery.trim() && (
                            <span className="inline-block mb-3 px-3 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700 capitalize">
                              {faq.category}
                            </span>
                          )}
                          <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <FaSearch className="text-3xl text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-500 mb-6">
                  We could not find any FAQs matching "{searchQuery}". Try a different search term.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all duration-300 cursor-pointer"
                >
                  <FaSyncAlt />
                  Clear Search
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===================== QUICK LINKS ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Quick Links</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 mb-4">
              Still Have Questions?
            </h2>
            <p className="text-gray-600">
              Explore these helpful resources or contact our support team directly.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {quickLinks.map((link, idx) => (
              <Link
                key={idx}
                to={link.link}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group text-center"
              >
                <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                  {link.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{link.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">{link.desc}</p>
                <span className="inline-flex items-center gap-1 text-primary-600 font-semibold text-sm group-hover:gap-2 transition-all">
                  {link.label} <FaArrowRight className="text-xs" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Still Can not Find What You Are Looking For?
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              Our support team is ready to help you with any questions. Reach out and we
              will get back to you within 24 hours.
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
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaComments />
                Contact Support
              </Link>
              <ShareButton
                section="Call to Action"
                title="Need Help? Contact RentalHub NG Support"
                description="Our support team is ready to help. Contact RentalHub NG at support@rentalhub.com.ng or call +234 803 060 1238."
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
              Get In Touch
            </h2>

            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Have a question that is not covered here? Our support team is always happy to help.
            </p>

            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG Support"
                description="Have questions about RentalHub NG? Contact us at support@rentalhub.com.ng or call +234 803 060 1238."
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <a
                href="mailto:support@rentalhub.com.ng"
                className="flex items-center gap-4 p-6 rounded-2xl bg-gray-50 hover:bg-primary-50 border border-gray-100 hover:border-primary-200 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <FaEnvelope className="text-xl text-primary-600" />
                </div>

                <div className="text-left">
                  <p className="text-sm text-gray-500">Email us</p>
                  <p className="text-gray-900 font-semibold">
                    support@rentalhub.com.ng
                  </p>
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
                  <p className="text-gray-900 font-semibold">
                    +234 803 060 1238
                  </p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Faq;
