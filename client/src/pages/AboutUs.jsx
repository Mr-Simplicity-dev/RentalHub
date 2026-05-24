import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaBuilding,
  FaShieldAlt,
  FaHandshake,
  FaUsers,
  FaBalanceScale,
  FaMapMarkerAlt,
  FaCheckCircle,
  FaPhoneAlt,
  FaEnvelope,
  FaShareAlt,
  FaWhatsapp,
  FaFacebook,
  FaTwitter,
  FaLink,
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

/* ──────────────────────────────────────────────────────────────
   ShareButton — opens a floating share sheet with social options
   ────────────────────────────────────────────────────────────── */
const ShareButton = ({ section, title, description }) => {
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://rentalhub.com.ng/about';
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
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* sheet */}
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

const stats = [
  { label: 'Properties Listed', value: '10,000+' },
  { label: 'Active Users', value: '50,000+' },
  { label: 'States Covered', value: '36 + FCT' },
  { label: 'Verified Landlords', value: '5,000+' },
];

const values = [
  {
    icon: <FaShieldAlt className="text-3xl text-primary-500" />,
    title: 'Trust & Verification',
    desc: 'Every landlord, property, and agent undergoes a rigorous verification process to ensure your peace of mind.',
  },
  {
    icon: <FaBalanceScale className="text-3xl text-primary-500" />,
    title: 'Fairness & Transparency',
    desc: 'Clear pricing, no hidden fees, and honest communication between all parties on our platform.',
  },
  {
    icon: <FaUsers className="text-3xl text-primary-500" />,
    title: 'Community First',
    desc: 'We build a supportive ecosystem where tenants, landlords, agents, and legal professionals thrive together.',
  },
  {
    icon: <FaMapMarkerAlt className="text-3xl text-primary-500" />,
    title: 'Nationwide Reach',
    desc: 'From bustling Lagos to serene rural areas, we connect people with homes across every region of Nigeria.',
  },
  {
    icon: <FaHandshake className="text-3xl text-primary-500" />,
    title: 'Integrity',
    desc: 'We uphold the highest ethical standards, ensuring every transaction and interaction is conducted with honesty.',
  },
  {
    icon: <FaCheckCircle className="text-3xl text-primary-500" />,
    title: 'Innovation',
    desc: 'Leveraging cutting-edge technology including property verification, digital evidence, and legal support tools.',
  },
];

const teamMembers = [
  {
    name: 'Zubair Onimisi',
    role: 'Founder & CEO',
    bio: 'With over 15 years in real estate and technology, Zubair leads RentalHub NG with a vision to revolutionize property access in Nigeria.',
  },
  {
    name: 'Chioma Eze',
    role: 'Chief Operating Officer',
    bio: 'Chioma brings operational excellence from her background in property management and large-scale logistics coordination.',
  },
  {
    name: 'Emeka Okonkwo',
    role: 'Chief Technology Officer',
    bio: 'Emeka architects the RentalHub NG platform, driving innovation in property tech, digital verification, and secure transactions.',
  },
  {
    name: 'Fatima Bello',
    role: 'Head of Legal Services',
    bio: 'A seasoned legal professional, Fatima ensures that all property transactions comply with Nigerian law and protects all parties involved.',
  },
];

const milestones = [
  { year: '2020', event: 'RentalHub NG was founded with a vision to transform the Nigerian rental market.' },
  { year: '2021', event: 'Launched property listing framework to ackwonledge onboarding landlords across Lagos and Abuja by creating a platform.' },
  { year: '2022', event: 'Expanded the framework to all 36 states + FCT; introduced identity verification for landlords and tenants.' },
  { year: '2023', event: 'Launched legal framework support services, dispute resolution, and fumigation/cleaning marketplace.' },
  { year: '2024', event: 'Introduced Rental Platform, transportation services, evidence verification, and virtual property tours.' },
  { year: '2025', event: 'Harnessed and reaching 50,000+ active users; launched mobile app with real-time chat and notifications.' },
];

const AboutUs = () => {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 py-20 md:py-28 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
              About{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-400 bg-clip-text text-transparent">
                RentalHub NG
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary-100 max-w-3xl mx-auto leading-relaxed">
              Nigeria's most trusted property technology platform — connecting tenants, landlords,
              agents, and legal professionals across all 36 states and the Federal Capital Territory.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaBuilding />
                Browse Properties
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                <FaUsers />
                Join RentalHub NG
              </Link>
              <ShareButton
                section="About Us"
                title="RentalHub NG — Nigeria's Most Trusted Property Platform"
                description="Nigeria's most trusted property technology platform — connecting tenants, landlords, agents, and legal professionals across all 36 states and the Federal Capital Territory."
              />
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path d="M0 60V30C240 0 480 0 720 30C960 60 1200 60 1440 30V60H0Z" fill="#F9FAFB" />
          </svg>
        </div>
      </section>

      {/* ===================== OUR MISSION SECTION ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Our Mission</span>
              <div className="flex items-center justify-between gap-4 mt-3 mb-6">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                  Transforming Nigeria's Rental Landscape
                </h2>
                <ShareButton
                  section="Our Mission"
                  title="RentalHub NG Mission — Transforming Nigeria's Rental Landscape"
                  description="At RentalHub NG, we believe everyone deserves a safe, transparent, and hassle-free experience when finding a home."
                />
              </div>
              <p className="text-gray-600 leading-relaxed mb-4">
                At RentalHub NG, we believe everyone deserves a safe, transparent, and hassle-free
                experience when finding a home. Our mission is to eliminate the friction,
                fraud, and frustration from the Nigerian rental market.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                By combining technology with rigorous verification processes, legal support,
                and nationwide coverage, we empower tenants to find verified properties and
                landlords to connect with qualified tenants — all in one trusted ecosystem.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <FaCheckCircle className="text-green-500" />
                  <span>Verified properties</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <FaCheckCircle className="text-green-500" />
                  <span>Secure payments</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <FaCheckCircle className="text-green-500" />
                  <span>Legal protection</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <FaCheckCircle className="text-green-500" />
                  <span>Dispute resolution</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="w-full aspect-[4/3] rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 overflow-hidden shadow-xl">
                <div className="w-full h-full flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary-600 flex items-center justify-center">
                      <FaBuilding className="text-3xl text-white" />
                    </div>
                    <p className="text-primary-800 font-bold text-lg">10,000+ Properties</p>
                    <p className="text-primary-600 text-sm">Across all 36 states + FCT</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== STATS SECTION ===================== */}
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
                  description={`RentalHub NG has ${stat.value} ${stat.label.toLowerCase()}. Join Nigeria's most trusted property platform.`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== OUR STORY / TIMELINE ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Our Journey</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                From Vision to Reality
              </h2>
              <ShareButton
                section="Our Journey"
                title="RentalHub NG Journey — From Vision to Reality"
                description="See how RentalHub NG grew from a vision into Nigeria's most trusted property marketplace since 2020."
              />
            </div>
            <p className="text-gray-600">
              Every great platform starts with a simple idea. Here is the story of how RentalHub NG
              grew from a vision into Nigeria's most trusted property marketplace.
            </p>
          </div>

          <div className="max-w-4xl mx-auto relative">
            {/* Timeline line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-primary-200 transform md:-translate-x-1/2"></div>

            {milestones.map((milestone, idx) => (
              <div
                key={idx}
                className={`relative flex items-start gap-6 md:gap-0 mb-12 md:mb-16 ${
                  idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Timeline dot */}
                <div className="absolute left-8 md:left-1/2 w-4 h-4 bg-primary-600 rounded-full border-4 border-white shadow transform -translate-x-1/2 translate-y-1 z-10"></div>

                {/* Content */}
                <div
                  className={`ml-14 md:ml-0 md:w-1/2 ${
                    idx % 2 === 0 ? 'md:pr-16 md:text-right' : 'md:pl-16'
                  }`}
                >
                  <span className="inline-block px-4 py-1.5 bg-primary-100 text-primary-800 font-bold text-sm rounded-full mb-3">
                    {milestone.year}
                  </span>
                  <p className="text-gray-700 text-base leading-relaxed mb-3">{milestone.event}</p>
                  <ShareButton
                    section={`Milestone ${milestone.year}`}
                    title={`RentalHub NG in ${milestone.year}: ${milestone.event}`}
                    description={`${milestone.event} — Part of the RentalHub NG journey.`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== OUR VALUES ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">What We Stand For</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Our Core Values
              </h2>
              <ShareButton
                section="Our Core Values"
                title="RentalHub NG Core Values"
                description="Trust, transparency, community, nationwide reach, integrity, and innovation — the principles guiding RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              These principles guide every decision we make and every feature we build.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {values.map((value, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-100 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
                    {value.icon}
                  </div>
                  <ShareButton
                    section={value.title}
                    title={`RentalHub NG — ${value.title}`}
                    description={value.desc}
                  />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{value.title}</h3>
                <p className="text-gray-600 leading-relaxed">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== WHAT MAKES US DIFFERENT ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Why Choose Us</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                What Makes RentalHub NG Different
              </h2>
              <ShareButton
                section="Why Choose Us"
                title="Why Choose RentalHub NG"
                description="Verified ecosystem, legal support, full-service marketplace, and nationwide coverage — see what makes RentalHub NG different."
              />
            </div>
            <p className="text-gray-600">
              We don't just list properties — we build an end-to-end ecosystem for secure, transparent
              property transactions.
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10">
            <div className="flex gap-5 group">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <FaShieldAlt className="text-xl text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Verified Ecosystem</h3>
                  <ShareButton
                    section="Verified Ecosystem"
                    title="RentalHub NG — Verified Ecosystem"
                    description="Every landlord, tenant, and property goes through identity verification. Our superb verification system ensures only genuine participants on the platform."
                  />
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Every landlord, tenant, and property goes through identity verification.
                  Our superb verification system ensures only genuine participants on the platform.
                </p>
              </div>
            </div>

            <div className="flex gap-5 group">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <FaBalanceScale className="text-xl text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Legal Support & Dispute Resolution</h3>
                  <ShareButton
                    section="Legal Support"
                    title="RentalHub NG — Legal Support & Dispute Resolution"
                    description="Access to qualified lawyers, evidence verification, and structured dispute resolution processes to protect all parties."
                  />
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Access to qualified lawyers, evidence verification, and structured dispute
                  resolution processes to protect all parties.
                </p>
              </div>
            </div>

            <div className="flex gap-5 group">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <FaBuilding className="text-xl text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Full-Service Marketplace</h3>
                  <ShareButton
                    section="Full-Service Marketplace"
                    title="RentalHub NG — Full-Service Marketplace"
                    description="Beyond rentals, we offer fumigation/cleaning services, transportation support, and virtual property tours — all in one platform."
                  />
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Beyond rentals, we offer fumigation/cleaning services, transportation support,
                  and virtual property tours — all in one platform.
                </p>
              </div>
            </div>

            <div className="flex gap-5 group">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <FaUsers className="text-xl text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Nationwide Coverage</h3>
                  <ShareButton
                    section="Nationwide Coverage"
                    title="RentalHub NG — Nationwide Coverage"
                    description="From Lagos to Maiduguri, Calabar to Sokoto — our platform serves all 36 states and the FCT with localized admin support."
                  />
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  From Lagos to Maiduguri, Calabar to Sokoto — our platform serves all 36 states
                  and the FCT with localized admin support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TEAM SECTION ===================== */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="text-primary-600 font-semibold text-sm uppercase tracking-widest">Leadership</span>
            <div className="flex items-center justify-center gap-4 mt-3 mb-4">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Meet Our Team
              </h2>
              <ShareButton
                section="Leadership Team"
                title="RentalHub NG Leadership Team"
                description="Meet the passionate professionals dedicated to transforming the Nigerian property experience at RentalHub NG."
              />
            </div>
            <p className="text-gray-600">
              Passionate professionals dedicated to transforming the Nigerian property experience.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {teamMembers.map((member, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 text-center group relative"
              >
                <div className="absolute top-3 right-3">
                  <ShareButton
                    section={member.name}
                    title={`RentalHub NG — ${member.name}, ${member.role}`}
                    description={`${member.bio} Learn more about the RentalHub NG leadership team.`}
                  />
                </div>
                <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-2xl font-bold shadow-md group-hover:scale-110 transition-transform duration-300">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{member.name}</h3>
                <p className="text-primary-600 text-sm font-medium mb-3">{member.role}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA SECTION ===================== */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Find Your Perfect Home?
            </h2>
            <p className="text-primary-100 text-lg mb-10 leading-relaxed">
              Join over 50,000 Nigerians who trust RentalHub NG for their property needs.
              Browse verified properties, connect with trusted landlords, and enjoy peace of mind.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/properties"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-primary-800 font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                <FaBuilding />
                Browse Properties
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-500 text-white font-semibold rounded-xl shadow-lg hover:bg-primary-400 hover:scale-105 transition-all duration-300"
              >
                <FaUsers />
                Create Account
              </Link>
              <ShareButton
                section="Call to Action"
                title="Join 50,000+ Nigerians on RentalHub NG"
                description="Find your perfect home on RentalHub NG — Nigeria's most trusted property platform with verified properties across all 36 states + FCT."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CONTACT SECTION ===================== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Get In Touch
            </h2>
            <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
              Have questions, feedback, or partnership ideas? We would love to hear from you.
            </p>
            <div className="flex justify-center mb-10">
              <ShareButton
                section="Contact"
                title="Contact RentalHub NG"
                description="Have questions, feedback, or partnership ideas? Contact RentalHub NG at support@rentalhub.com.ng or call +234 803 060 1238."
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

export default AboutUs;
