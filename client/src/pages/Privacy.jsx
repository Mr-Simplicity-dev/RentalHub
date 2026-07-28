import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import {
  FaBalanceScale,
  FaCheckCircle,
  FaChevronRight,
  FaCookieBite,
  FaCreditCard,
  FaDatabase,
  FaEnvelope,
  FaExclamationTriangle,
  FaFileAlt,
  FaFingerprint,
  FaGlobeAfrica,
  FaLock,
  FaMobileAlt,
  FaPhoneAlt,
  FaPrint,
  FaShieldAlt,
  FaUserShield,
  FaUsers,
} from 'react-icons/fa';

const LAST_UPDATED = '28 July 2026';

const tableOfContents = [
  ['scope', 'Who we are and scope'],
  ['summary', 'Privacy at a glance'],
  ['data-map', 'Data we collect and why'],
  ['sources', 'How we collect data'],
  ['lawful-bases', 'Lawful bases and uses'],
  ['sharing', 'Who receives data'],
  ['identity-payments', 'Identity, biometrics and payments'],
  ['cookies', 'Cookies and online services'],
  ['storage-transfers', 'Storage and international transfers'],
  ['retention', 'How long we keep data'],
  ['security', 'How we protect data'],
  ['automated-tools', 'Automated tools and recommendations'],
  ['rights', 'Your choices and rights'],
  ['children', 'Children'],
  ['changes', 'Policy changes'],
  ['contact', 'Contact and complaints'],
];

const dataGroups = [
  {
    title: 'Account, contact and profile data',
    icon: FaUsers,
    collect:
      'Name, email address, phone number, password hash, account type and role, profile photograph, preferred state/LGA, referral information, account settings, verification status and information about an agent or lawyer you nominate.',
    source: 'You, an authorised inviter or referrer, and account administrators.',
    use:
      'Create and secure your account, authenticate you, personalise the service, connect the correct role and jurisdiction, communicate with you, provide customer support and—where permitted—send campaigns or offers. Some account and lead flows synchronise email/phone details to campaign lists.',
    basis: 'Contract and steps requested before a contract; legitimate interests in account security and service administration; consent where required.',
    share: 'Authorised RentalHub personnel and service providers that support authentication, communications and hosting.',
    retention:
      'While the account is active, then deleted, redacted or anonymised following a valid deletion request, except for records that must remain for legal, transaction, fraud, audit or dispute purposes.',
  },
  {
    title: 'Identity and verification data',
    icon: FaFingerprint,
    collect:
      'NIN, passport number, nationality, date of birth, document type, passport or live-face photograph, liveness result, identity-match result, verification status and revalidation dates.',
    source:
      'You, authorised account workflows and identity-verification providers or official data sources they are permitted to query.',
    use:
      'Verify identity, prevent duplicate or fraudulent accounts, protect property and payment transactions, satisfy compliance requirements and support investigations or disputes.',
    basis:
      'Consent where required for sensitive or biometric-related processing; contract; legal obligations; legitimate interests in fraud prevention and platform safety.',
    share:
      'Prembly and other approved identity-verification processors, restricted authorised staff, and regulators or law-enforcement bodies where legally required. For a property application, the relevant landlord currently receives the applicant’s full NIN or passport number together with name and contact/identity details.',
    retention:
      'Only while needed for identity assurance, fraud prevention, compliance, disputes and applicable legal requirements. Verification results and audit evidence may outlast an active account where justified.',
  },
  {
    title: 'Properties, rentals and applications',
    icon: FaFileAlt,
    collect:
      'Property address and location, ownership/listing details, rent and deposits, amenities, photographs and media, applications, saved properties, views, inspections, tenancy and landlord-agent relationship records, reviews, ratings, public-display choices and an optional testimonial image.',
    source: 'Tenants, landlords, agents, inspectors, administrators and your use of property features.',
    use:
      'Publish and match listings, process applications, manage tenancies and inspections, provide property access, prevent misleading listings and resolve rental issues.',
    basis: 'Contract and pre-contract steps; legitimate interests in operating a trusted marketplace; legal obligations; consent for optional public content.',
    share:
      'The landlord, tenant, agent or professional involved in the transaction; authorised administrators; Cloudinary or other media-storage providers; and professional advisers where a case requires them. An approved public rating can show the selected name format, comment, role/location and—only where the relevant platform setting and user choice permit it—a profile/passport photograph as the testimonial image.',
    retention:
      'For the listing, application or tenancy lifecycle and afterwards for support, fraud, legal, audit and limitation-period needs. Public content is removed or de-identified when it is no longer needed or following an applicable request.',
  },
  {
    title: 'Messages, calls, support and legal evidence',
    icon: FaUserShield,
    collect:
      'In-app messages, delivery/read and typing status, online state, notification history, call signalling and session metadata, support tickets and replies, attachments, disputes, damage reports, photographs, inspection notes, legal authorisations and evidence. During a WebRTC call, live audio/video is processed to connect the participants.',
    source: 'You and the other users, professionals, support staff or administrators participating in the communication or case.',
    use:
      'Deliver real-time communications, provide support, investigate complaints, manage disputes, preserve evidence, protect users and enable authorised lawyers or administrators to perform their duties.',
    basis:
      'Contract; legitimate interests in support, safety and dispute resolution; legal obligations; consent where a device permission or sensitive upload requires it.',
    share:
      'The intended participants, authorised support/admin teams, assigned lawyers or service providers, communications infrastructure providers, courts, regulators or law enforcement when lawfully required.',
    retention:
      'For as long as the conversation, support matter, tenancy or dispute reasonably requires, and longer where evidence, safety, audit or legal claims require preservation. Content may be redacted or access-restricted instead of immediately erased.',
  },
  {
    title: 'Payments, wallet and payout details',
    icon: FaCreditCard,
    collect:
      'Transaction reference, amount, currency, status, purpose, timestamp and related property/service identifiers. For refunds, settlements and withdrawals we may also collect bank name/code, account number and account name.',
    source: 'You, the relevant transaction workflow and Paystack or participating financial institutions.',
    use:
      'Initiate and verify payments, provide subscriptions or paid access, maintain ledgers and wallets, issue refunds or payouts, reconcile transactions, prevent fraud and meet accounting requirements.',
    basis: 'Contract; legal obligations relating to financial records; legitimate interests in reconciliation, fraud prevention and transaction security.',
    share: 'Paystack, participating banks, authorised financial administrators, transaction counterparties where necessary, auditors, regulators and authorities where required.',
    retention:
      'For the transaction lifecycle and the period required for accounting, tax, fraud prevention, audit, chargebacks, disputes and other legal obligations.',
  },
  {
    title: 'Bookings, routes and location information',
    icon: FaGlobeAfrica,
    collect:
      'Transportation pickup and destination, service type and schedule; fumigation or cleaning address, property size/rooms, timing, health or safety notes, provider assignment and booking evidence; map searches and property location.',
    source: 'You, a booking participant, a service provider and mapping/geocoding services.',
    use:
      'Quote, schedule, assign, fulfil and support a booking; show relevant maps or properties; process payment and resolve service complaints.',
    basis: 'Contract and pre-contract steps; consent for precise device location where requested; legitimate interests in safe and efficient service delivery.',
    share: 'The assigned transportation, cleaning or fumigation provider, relevant administrators, Google Maps services, payment processors and professional advisers where a dispute requires them.',
    retention:
      'For the booking and support lifecycle, then as needed for payment, safety, complaints, fraud, audit and legal records.',
  },
  {
    title: 'Recruitment and professional onboarding',
    icon: FaFileAlt,
    collect:
      'Candidate profile, role applied for, CV/resume, qualifications, documents, application answers, browser fingerprint, interview recordings, recording duration, violation log, assessments, scores, reports and related payment or onboarding information.',
    source: 'The candidate, referees or interviewers where authorised, and recruitment administrators.',
    use:
      'Assess candidates, organise interviews, make and document recruitment decisions, communicate outcomes, complete onboarding and defend or investigate recruitment decisions.',
    basis: 'Pre-contract steps; legitimate interests in recruitment administration; legal obligations; consent where required for optional data.',
    share: 'Recruitment administrators, authorised interviewers, relevant hiring managers and processors that host documents or send communications.',
    retention:
      'For the recruitment process and afterwards only as needed for a future opportunity you accepted, recordkeeping, disputes or legal claims, after which it should be deleted or de-identified.',
  },
  {
    title: 'Device, usage, diagnostics and notifications',
    icon: FaMobileAlt,
    collect:
      'IP address, browser/user agent, device platform, app version, route or screen, session identifier, push token, optional device identifier, notification preferences, security/audit events, analytics events, crash message, stack trace and diagnostic metadata.',
    source: 'Your browser or device, the RentalHub apps and configured analytics, crash-reporting and notification services.',
    use:
      'Keep sessions working, deliver requested notifications, detect abuse, diagnose crashes, monitor reliability, measure feature use, protect accounts and improve performance.',
    basis: 'Contract for essential service operation; legitimate interests in security, reliability and product improvement; consent where required for non-essential analytics or notifications.',
    share: 'Expo for push delivery, Google Analytics when configured, hosting/monitoring providers and authorised technical personnel.',
    retention:
      'Only for as long as needed for security, troubleshooting, reliability and measurement. Push tokens remain until logout/unregistration, invalidation or account deletion; essential browser authentication and CSRF cookies default to a seven-day lifetime.',
  },
];

const recipientGroups = [
  {
    name: 'People involved in your request',
    detail:
      'Landlords, tenants, agents, lawyers, inspectors, candidates, interviewers and transportation, cleaning or fumigation providers receive only the information needed for their authorised workflow.',
  },
  {
    name: 'Identity and payment processors',
    detail:
      'Prembly supports identity/liveness checks. Paystack supports checkout, payment verification, bank-account resolution, refunds, settlements and transfers.',
  },
  {
    name: 'Cloud, media and app infrastructure',
    detail:
      'Cloudinary and configured hosting/database providers store or deliver application data and uploaded media. Expo supports mobile push delivery.',
  },
  {
    name: 'Communications and web services',
    detail:
      'Configured email/SMTP or Resend services, Termii or Twilio for SMS, Meta WhatsApp services, Google Maps, Google Analytics and HubSpot chat may process the information required to provide their feature.',
  },
  {
    name: 'AI-assisted damage analysis',
    detail:
      'When the damage-analysis feature is used, the submitted damage photograph is sent to Anthropic’s Claude service for a non-binding analysis. RentalHub stores the resulting assessment with the damage workflow.',
  },
  {
    name: 'Professional and public authorities',
    detail:
      'Auditors, insurers, professional advisers, courts, regulators, tax bodies or law-enforcement authorities may receive data where necessary to protect rights, meet a legal duty or respond to a valid request.',
  },
  {
    name: 'Business restructuring',
    detail:
      'A genuine prospective buyer, investor or successor may receive appropriately protected information during a merger, financing, reorganisation or transfer of the platform, subject to confidentiality and applicable law.',
  },
];

const rights = [
  'Ask whether we process your personal data and obtain access to it.',
  'Correct information that is inaccurate or complete information that is incomplete.',
  'Request deletion, anonymisation or restriction where the law allows it.',
  'Object to processing based on legitimate interests or to direct marketing.',
  'Withdraw consent at any time, without affecting processing already lawfully completed.',
  'Request a portable copy of eligible data in a commonly used format.',
  'Ask for human review of a significant decision made solely by automated means and explain your concerns.',
  'Complain to RentalHub and, if unresolved, to the Nigeria Data Protection Commission.',
];

const SummaryCard = ({ icon: Icon, title, children }) => (
  <article className="group rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:bg-white/15">
    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-300 text-slate-950 shadow-md shadow-amber-950/20">
      <Icon aria-hidden="true" />
    </div>
    <h2 className="text-base font-bold text-white">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-primary-100">{children}</p>
  </article>
);

const PolicySection = ({ id, eyebrow, title, icon: Icon, children }) => (
  <section
    id={id}
    className="scroll-mt-28 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_55px_-35px_rgba(15,23,42,0.45)]"
    aria-labelledby={`${id}-title`}
  >
    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-5 sm:px-7">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-900 text-amber-300 shadow-md">
          <Icon aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-1 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
            {title}
          </h2>
        </div>
      </div>
    </div>
    <div className="px-5 py-6 text-[15px] leading-7 text-slate-700 sm:px-7 sm:text-base">
      {children}
    </div>
  </section>
);

const Detail = ({ label, children }) => (
  <div>
    <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-700">{label}</h4>
    <p className="mt-1.5 text-sm leading-6 text-slate-600">{children}</p>
  </div>
);

const CheckList = ({ items }) => (
  <ul className="space-y-3">
    {items.map((item) => (
      <li key={item} className="flex items-start gap-3">
        <FaCheckCircle className="mt-1 shrink-0 text-emerald-600" aria-hidden="true" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const Privacy = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const printPolicy = () => window.print();

  return (
    <>
      <Helmet>
        <title>Privacy Policy | RentalHub NG</title>
        <meta
          name="description"
          content="How RentalHub NG collects, uses, shares, stores and protects personal data across its website and mobile applications."
        />
        <link rel="canonical" href="https://rentalhub.com.ng/privacy" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 text-slate-900">
        <a
          href="#privacy-content"
          className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-semibold text-primary-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to privacy policy
        </a>

        <header className="relative isolate overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 -z-10">
            <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-primary-500/25 blur-3xl" />
            <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.75) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.75) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
          </div>

          <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200/40 bg-amber-300 text-2xl text-slate-950 shadow-2xl shadow-black/25">
                <FaShieldAlt aria-hidden="true" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Privacy, explained clearly</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Your data. Your rights.</h1>
              <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-primary-100 sm:text-lg sm:leading-8">
                This policy explains exactly what RentalHub NG collects, where it comes from, why we use it,
                who may receive it, how long we keep it and the controls available to you.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm">
                <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 font-semibold">
                  Effective and last updated {LAST_UPDATED}
                </span>
                <span className="rounded-full border border-amber-200/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-100">
                  Website + Android + iOS
                </span>
                <button
                  type="button"
                  onClick={printPolicy}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-4 py-2 font-bold text-slate-950 transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-200/40"
                >
                  <FaPrint aria-hidden="true" />
                  Print or save
                </button>
              </div>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard icon={FaDatabase} title="We collect what the service needs">
                This includes account, identity, property, booking, payment, communication and technical data described below.
              </SummaryCard>
              <SummaryCard icon={FaBalanceScale} title="Every use needs a reason">
                We rely on contract, consent, legal duties or carefully balanced legitimate interests—not an unspecified blanket permission.
              </SummaryCard>
              <SummaryCard icon={FaLock} title="Protection is layered">
                We use access controls, hashing, encryption for NIN data, secure session controls, upload checks, audit trails and monitoring.
              </SummaryCard>
              <SummaryCard icon={FaUserShield} title="You remain in control">
                You can ask for access, correction, deletion, restriction, portability, objection, consent withdrawal and human review.
              </SummaryCard>
            </div>
          </div>
        </header>

        <main id="privacy-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-1 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                This policy is currently published in English. It applies to the RentalHub website, mobile applications,
                support channels and services that link to it. A third-party website or app you open from RentalHub has
                its own privacy terms.
              </p>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
            <aside className="hidden lg:block">
              <nav
                aria-label="Privacy policy contents"
                className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="px-3 pb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">On this page</p>
                <ol className="space-y-0.5">
                  {tableOfContents.map(([id, label], index) => (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-primary-50 hover:text-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                      >
                        <span className="w-5 text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                        <span className="flex-1">{label}</span>
                        <FaChevronRight className="text-[10px] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <div className="min-w-0 space-y-7">
              <PolicySection id="scope" eyebrow="01 · Controller" title="Who we are and what this policy covers" icon={FaShieldAlt}>
                <p>
                  <strong className="text-slate-900">RentalHub NG</strong> (“RentalHub”, “we”, “us” or “our”) operates
                  rentalhub.com.ng and the RentalHub mobile applications from Nigeria. RentalHub is the controller of
                  personal data it decides how and why to process. Where a landlord, agent, lawyer, employer, service
                  provider or other user independently decides how to use information they receive, that person may also
                  have their own responsibilities under data-protection law.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <a href="mailto:support@rentalhub.com.ng" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Privacy email</span>
                    <span className="mt-1 block break-all font-bold text-primary-800">support@rentalhub.com.ng</span>
                  </a>
                  <a href="tel:+2348030601238" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Telephone</span>
                    <span className="mt-1 block font-bold text-primary-800">+234 803 060 1238</span>
                  </a>
                  <a href="https://rentalhub.com.ng" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Website</span>
                    <span className="mt-1 block font-bold text-primary-800">rentalhub.com.ng</span>
                  </a>
                </div>
              </PolicySection>

              <PolicySection id="summary" eyebrow="02 · Overview" title="Privacy at a glance" icon={FaCheckCircle}>
                <CheckList
                  items={[
                    'We use personal data to provide property, rental, professional, support, recruitment, booking, payment and safety features—not simply because we have collected it.',
                    'Some features cannot work without required data. Optional permissions, marketing and certain sensitive processing depend on your choice or another lawful basis explained at the point of collection.',
                    'We disclose data to authorised participants and processors only when their role or the law requires it. Access is role- and workflow-based.',
                    'The mobile biometric prompt unlocks a saved session through your phone’s operating system; RentalHub does not receive your fingerprint or Face ID template.',
                    'You may exercise your rights through the available account controls or by contacting support. We may need to verify that the request is really yours.',
                  ]}
                />
              </PolicySection>

              <PolicySection id="data-map" eyebrow="03 · Data map" title="What we collect, use, share and retain" icon={FaDatabase}>
                <p className="mb-6">
                  The cards below are the detailed data map for the current RentalHub product. “Retention” describes the
                  period or decision criteria used because one universal period would be inaccurate for very different
                  records.
                </p>
                <div className="space-y-4">
                  {dataGroups.map(({ title, icon: Icon, collect, source, use, basis, share, retention }, index) => (
                    <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
                      <div className="mb-5 flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-800">
                          <Icon aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Category {index + 1}</p>
                          <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">{title}</h3>
                        </div>
                      </div>
                      <div className="grid gap-5 md:grid-cols-2">
                        <Detail label="What we collect">{collect}</Detail>
                        <Detail label="Where it comes from">{source}</Detail>
                        <Detail label="Why we use it">{use}</Detail>
                        <Detail label="Lawful basis">{basis}</Detail>
                        <Detail label="Who may receive it">{share}</Detail>
                        <Detail label="How long we keep it">{retention}</Detail>
                      </div>
                    </article>
                  ))}
                </div>
              </PolicySection>

              <PolicySection id="sources" eyebrow="04 · Collection" title="How information reaches RentalHub" icon={FaDatabase}>
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    ['Directly from you', 'When you register, verify identity, create a listing, apply, book, pay, message, upload a file, contact support, apply for a role, change settings or exercise a right.'],
                    ['From another authorised user', 'For example, an agent or lawyer invitation, a landlord reviewing an application, a service provider updating a booking, or another party supplying evidence in a dispute.'],
                    ['Automatically from the service', 'Browser/device details, IP address, session and security events, feature use, notification token, diagnostic information and transaction status are generated as the website or app operates.'],
                    ['From providers and lawful sources', 'Payment and bank-resolution results, identity-verification results, map/geocoding information, communication delivery status and records supplied by an authority or professional where permitted.'],
                  ].map(([title, detail]) => (
                    <article key={title} className="rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-extrabold text-slate-900">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-5">
                  Please provide accurate information and do not upload another person’s data unless you are authorised
                  to do so. If we need data for a contract or legal requirement and you do not provide it, the relevant
                  account, verification, payment, property, support or booking feature may not be available.
                </p>
              </PolicySection>

              <PolicySection id="lawful-bases" eyebrow="05 · Purpose limitation" title="How and why we use personal data" icon={FaBalanceScale}>
                <div className="space-y-5">
                  <Detail label="Contract and requested pre-contract steps">
                    To create an account, show and manage properties, process applications and tenancies, deliver messages
                    and support, fulfil bookings, process payments, provide professional features and respond before you
                    enter a transaction.
                  </Detail>
                  <Detail label="Legal obligation">
                    To keep required financial and audit records, respond to lawful authorities, manage legal claims and
                    meet identity, fraud, court, regulatory or data-protection duties that apply to a transaction.
                  </Detail>
                  <Detail label="Legitimate interests">
                    To secure accounts, prevent fraud and abuse, improve reliability, administer the marketplace,
                    investigate complaints, reconcile transactions and protect RentalHub and its users. We must balance
                    those interests against your rights and reasonable expectations.
                  </Detail>
                  <Detail label="Consent">
                    For optional device permissions, direct marketing, public profile/photo choices, sensitive identity
                    or liveness processing and non-essential tracking where consent is legally required. You may withdraw
                    consent, but that does not invalidate processing already completed lawfully.
                  </Detail>
                  <Detail label="Vital interests or public interest">
                    In a genuine emergency or where a specific law authorises processing for an important public purpose.
                    These bases are exceptional, not routine.
                  </Detail>
                </div>
                <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50 p-5">
                  <h3 className="font-extrabold text-slate-950">Service and safety communications</h3>
                  <p className="mt-2 text-sm leading-6 text-primary-900">
                    We may send account, security, payment, application, booking, dispute and support notices needed to
                    operate the service. Some account and lead flows also synchronise email and phone details to email/SMS
                    campaign lists. Email campaigns provide an unsubscribe route. Mobile notification preferences control
                    native push categories only; to stop SMS or WhatsApp marketing, contact us. Promotional messages must
                    only be sent where consent or another applicable legal basis permits them.
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="sharing" eyebrow="06 · Recipients" title="Who may receive your data" icon={FaUsers}>
                <p>
                  We do not make every record visible to every role. Information is disclosed according to the feature,
                  relationship, jurisdiction and permissions involved. Current recipient categories include:
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {recipientGroups.map(({ name, detail }) => (
                    <article key={name} className="rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-extrabold text-slate-900">{name}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-5">
                  Provider names can change as the platform evolves. A provider is permitted to process only the
                  information needed for its service and must be assessed and governed as required by applicable law.
                  Sponsored content may record aggregate impression or click counts; opening a sponsor’s link takes you
                  to a service with its own privacy policy.
                </p>
              </PolicySection>

              <PolicySection id="identity-payments" eyebrow="07 · Sensitive workflows" title="Identity, biometrics and payments" icon={FaFingerprint}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">Identity verification and face/liveness checks</h3>
                    <p className="mt-2">
                      Current Prembly validation sends NIN, name and date of birth for a Nigerian identity check, or
                      passport number, name, nationality and date of birth for a passport check. RentalHub may separately
                      collect an identity/passport photograph. If a face/liveness feature is enabled and presented to
                      you, the notice at that step will explain any face image sent for liveness processing. Within
                      RentalHub, NIN values are protected using authenticated encryption and a separate one-way lookup
                      hash used to detect duplicates. A verification result can be used to approve, reject, revalidate or
                      investigate an account, subject to the rights below.
                    </p>
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                      <strong>Property-application disclosure:</strong> when an application is submitted, the relevant
                      landlord currently receives the applicant’s full decrypted NIN (for a Nigerian identity) or
                      plaintext passport number (for a foreign identity), together with name, phone, email and applicable
                      nationality information. Do not submit an application unless you understand this disclosure.
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">Phone biometrics</h3>
                    <p className="mt-2">
                      Fingerprint or Face ID sign-in is different from identity liveness. The mobile app asks Android or
                      iOS to confirm a biometric match before unlocking a locally saved session. RentalHub does not
                      receive or store the fingerprint/Face ID template; your operating system manages it. The app also
                      keeps session and account information in device application storage, using device-protected
                      credential storage for supported secrets. Protect your phone with a screen lock and sign out on a
                      shared device.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">Paystack checkout and bank details</h3>
                    <p className="mt-2">
                      Card, bank or USSD checkout is handled through Paystack. RentalHub’s application does not collect or
                      store your full card number or CVV. We do store transaction references, amount, status, purpose and
                      related records needed to provide and reconcile the purchase. For a refund, withdrawal, settlement
                      or payout, RentalHub may store the bank name/code, account number and resolved account name and send
                      them to Paystack or a participating bank.
                    </p>
                  </div>
                </div>
              </PolicySection>

              <PolicySection id="cookies" eyebrow="08 · Web and device storage" title="Cookies, analytics, chat and permissions" icon={FaCookieBite}>
                <p>
                  RentalHub uses essential browser cookies and local/device storage to keep you signed in, prevent
                  cross-site request forgery, remember preferences and operate app sessions. Production authentication
                  cookies are configured with HttpOnly, Secure and SameSite protections; the separate CSRF cookie must be
                  readable by the web app to submit its protection token. Their default lifetime is seven days, although
                  logout, expiry or security actions can end a session earlier.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Detail label="Analytics">
                    When a Google Analytics identifier is configured, the website sends usage and device/browser events
                    to Google to understand traffic and feature use. Mobile diagnostics and analytics can send app
                    version, platform, session/screen, event and crash information to RentalHub’s API.
                  </Detail>
                  <Detail label="Live chat">
                    The Home page can load HubSpot Conversations to provide live chat. HubSpot may set its own cookies or
                    receive browser and chat information under its own privacy terms.
                  </Detail>
                  <Detail label="Maps and external media">
                    Google Maps/geocoding and hosted media receive the technical requests needed to display a map, locate
                    a place or deliver an image/document. External links are governed by the destination’s policy.
                  </Detail>
                  <Detail label="Mobile permissions">
                    Camera, photo/media, microphone, notification and location access are requested only when a feature
                    needs them. Device settings can revoke a permission, but the related upload, call, alert or location
                    feature may then stop working.
                  </Detail>
                </div>
                <p className="mt-5">
                  You can block or delete browser cookies through browser controls and manage mobile permissions in your
                  device settings. Blocking essential storage can prevent login or other core functions. Where law
                  requires a choice before non-essential tracking, RentalHub must obtain that choice at the relevant
                  collection point.
                </p>
              </PolicySection>

              <PolicySection id="storage-transfers" eyebrow="09 · Location of processing" title="Storage and international transfers" icon={FaGlobeAfrica}>
                <p>
                  RentalHub data is held in the application database, authenticated server file storage, configured cloud
                  media storage and the systems of the processors identified above. Some mobile session, preference and
                  cached information is also stored on your device. Data is not necessarily kept in one country.
                </p>
                <p className="mt-4">
                  Paystack, Prembly, Cloudinary, Expo, Google, HubSpot, Meta and communications or hosting providers may
                  operate infrastructure or support teams in more than one country. Before making a restricted
                  international transfer, RentalHub must use a transfer permitted by applicable law—for example an
                  adequacy decision, approved contractual safeguards, another authorised mechanism, or a specific
                  exception—and assess the protection available at the destination. Contact us for information about the
                  safeguard relevant to your data.
                </p>
              </PolicySection>

              <PolicySection id="retention" eyebrow="10 · Data lifecycle" title="How long we keep personal data" icon={FaDatabase}>
                <p>
                  We keep data only for as long as it is reasonably needed for the purpose described in this policy, then
                  delete, de-identify, redact or restrict it. We decide the period using:
                </p>
                <div className="mt-5">
                  <CheckList
                    items={[
                      'Whether your account, property, tenancy, application, booking, support ticket or professional relationship remains active.',
                      'The amount, sensitivity and risk of the information and whether it remains necessary for security or fraud prevention.',
                      'Accounting, tax, audit, court, regulatory, transaction and limitation-period obligations.',
                      'An unresolved payment, chargeback, complaint, dispute, damage report, legal claim or investigation.',
                      'Whether the record can be safely aggregated, anonymised or redacted instead of retained in identifiable form.',
                    ]}
                  />
                </div>
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <h3 className="font-extrabold text-amber-950">What account deletion means</h3>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    We may ask for your password or other proof before acting. Active properties, disputes or pending
                    payments can delay a purge. Records required for transactions, fraud prevention, audit, legal claims
                    or another person’s rights may be retained with access restricted, or anonymised/redacted rather than
                    erased. A deletion request therefore does not always remove every transaction or case record
                    immediately.
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="security" eyebrow="11 · Safeguards" title="How we protect personal data" icon={FaLock}>
                <p>
                  RentalHub applies technical and organisational safeguards appropriate to the data and risk. The current
                  application includes:
                </p>
                <div className="mt-5">
                  <CheckList
                    items={[
                      'Bcrypt password hashing and authenticated encryption plus a separate one-way lookup hash for NIN data.',
                      'Secure/HttpOnly/SameSite browser-session controls in production, CSRF protection, CORS/CSP/HSTS/Helmet protections, request throttling and input sanitisation.',
                      'Role, relationship and jurisdiction checks so administrators, lawyers, agents and providers access only authorised workflows.',
                      'Authentication on protected uploads, file type/signature and size checks, evidence hashes and operational audit logs.',
                      'OS biometric gates and device credential storage for supported mobile secrets, alongside application storage needed for sessions and preferences.',
                      'Monitoring and diagnostic records used to investigate suspicious activity, errors and service failures.',
                    ]}
                  />
                </div>
                <p className="mt-5">
                  No website, app or transmission is completely secure. Keep your password and device private, use a
                  screen lock, and report a suspected compromise promptly. We assess personal-data incidents and notify
                  the Nigeria Data Protection Commission and affected people when applicable law requires it.
                </p>
              </PolicySection>

              <PolicySection id="automated-tools" eyebrow="12 · Fairness" title="Automated checks, rankings and recommendations" icon={FaBalanceScale}>
                <p>
                  RentalHub may use rules, scores or automated services to assist identity/liveness verification, duplicate
                  detection, fraud and risk alerts, location or property recommendations, candidate filtering, damage or
                  evidence analysis, and prioritisation of administrative work. These tools can use account, transaction,
                  location, behaviour, verification or case information relevant to the task.
                </p>
                <p className="mt-4">
                  Automated output is a signal, not permission to ignore fairness or accuracy. Where a decision is made
                  solely by automated processing and has a legal or similarly significant effect, you may ask for
                  meaningful information about the logic involved, express your view, contest the outcome and request
                  human review, subject to applicable law.
                </p>
              </PolicySection>

              <PolicySection id="rights" eyebrow="13 · Your control" title="Your privacy choices and legal rights" icon={FaUserShield}>
                <CheckList items={rights} />
                <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-primary-50 sm:p-6">
                  <h3 className="text-lg font-extrabold text-white">How to exercise a right</h3>
                  <p className="mt-2 text-sm leading-6 text-primary-100">
                    Use an available profile/account control or email support@rentalhub.com.ng with the subject
                    “Privacy request”. Describe the account and request, but do not email a password, full NIN, full
                    payment-card details or unnecessary identity documents. We may securely verify identity and authority
                    before disclosing or changing data. Account controls differ by platform, so contact us if an export,
                    correction or deletion control is not visible and we will assess the full request.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-primary-100">
                    A right may have lawful limits—for example, another person’s privacy, an active transaction or
                    dispute, fraud prevention, legal privilege, or a record we must retain. If we cannot fulfil a request,
                    we will explain the applicable reason and complaint route.
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="children" eyebrow="14 · Age" title="Children’s privacy" icon={FaUsers}>
                <p>
                  RentalHub’s property, payment and professional services are designed for adults who can enter binding
                  transactions. The current registration code does not provide a comprehensive age-verification gate. A
                  parent or guardian who believes a child under 18 supplied personal data without appropriate authority
                  should contact us so we can investigate, restrict the account and delete data where the law permits.
                </p>
              </PolicySection>

              <PolicySection id="changes" eyebrow="15 · Version control" title="When this policy changes" icon={FaFileAlt}>
                <p>
                  We may update this policy when features, providers, legal requirements or data practices change. The
                  latest version will appear at this URL with a new “Last updated” date. For a material change, we may also
                  provide an in-app, website, push or email notice appropriate to the impact. A new purpose that requires
                  consent will not be treated as accepted merely because the policy changed.
                </p>
              </PolicySection>

              <PolicySection id="contact" eyebrow="16 · Help and complaints" title="Contact RentalHub or the regulator" icon={FaEnvelope}>
                <p>
                  Start with RentalHub so we can investigate and respond. Include enough information to locate your
                  account or transaction, but avoid sending sensitive identifiers in an unsecured message.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <a
                    href="mailto:support@rentalhub.com.ng?subject=Privacy%20request"
                    className="group rounded-2xl border border-primary-100 bg-primary-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-primary-200"
                  >
                    <FaEnvelope className="text-xl text-primary-700" aria-hidden="true" />
                    <span className="mt-3 block text-xs font-bold uppercase tracking-wider text-primary-600">Email RentalHub</span>
                    <span className="mt-1 block break-all font-extrabold text-slate-950">support@rentalhub.com.ng</span>
                  </a>
                  <a
                    href="tel:+2348030601238"
                    className="group rounded-2xl border border-primary-100 bg-primary-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-primary-200"
                  >
                    <FaPhoneAlt className="text-xl text-primary-700" aria-hidden="true" />
                    <span className="mt-3 block text-xs font-bold uppercase tracking-wider text-primary-600">Call RentalHub</span>
                    <span className="mt-1 block font-extrabold text-slate-950">+234 803 060 1238</span>
                  </a>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-extrabold text-slate-950">Nigeria Data Protection Commission (NDPC)</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    If you believe your complaint has not been resolved, you may lodge a complaint with the NDPC through
                    its official website.
                  </p>
                  <a
                    href="https://ndpc.gov.ng/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 font-bold text-primary-700 hover:text-primary-900 hover:underline"
                  >
                    Visit the NDPC website
                    <FaChevronRight className="text-xs" aria-hidden="true" />
                  </a>
                </div>
              </PolicySection>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Privacy;
