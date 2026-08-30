import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
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

const LAST_UPDATED = '29 July 2026';

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
    className="privacy-policy-section scroll-mt-28 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_55px_-35px_rgba(15,23,42,0.45)]"
    aria-labelledby={`${id}-title`}
  >
    <div className="privacy-section-heading border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-5 sm:px-7">
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
    <div className="privacy-section-content px-5 py-6 text-[15px] leading-7 text-slate-700 sm:px-7 sm:text-base">
      {children}
    </div>
  </section>
);

const Detail = ({ label, children }) => (
  <div className="privacy-detail">
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
  const { t } = useTranslation();

  const tableOfContents = [
    ['scope', t('privacy.toc.scope', 'Who we are and scope')],
    ['summary', t('privacy.toc.summary', 'Privacy at a glance')],
    ['data-map', t('privacy.toc.data_map', 'Data we collect and why')],
    ['sources', t('privacy.toc.sources', 'How we collect data')],
    ['lawful-bases', t('privacy.toc.lawful_bases', 'Lawful bases and uses')],
    ['sharing', t('privacy.toc.sharing', 'Who receives data')],
    ['identity-payments', t('privacy.toc.identity_payments', 'Identity, biometrics and payments')],
    ['cookies', t('privacy.toc.cookies', 'Cookies and online services')],
    ['storage-transfers', t('privacy.toc.storage', 'Storage and international transfers')],
    ['retention', t('privacy.toc.retention', 'How long we keep data')],
    ['security', t('privacy.toc.security', 'How we protect data')],
    ['automated-tools', t('privacy.toc.automated', 'Automated tools and recommendations')],
    ['rights', t('privacy.toc.rights', 'Your choices and rights')],
    ['children', t('privacy.toc.children', 'Children')],
    ['changes', t('privacy.toc.changes', 'Policy changes')],
    ['contact', t('privacy.toc.contact', 'Contact and complaints')],
  ];

  const dataGroups = [
    {
      title: t('privacy.data.account.title', 'Account, contact and profile data'),
      icon: FaUsers,
      collect: t('privacy.data.account.collect', 'Name, email address, phone number, password hash, account type and role, profile photograph, preferred state/LGA, referral information, account settings, verification status and information about an agent or lawyer you nominate.'),
      source: t('privacy.data.account.source', 'You, an authorised inviter or referrer, and account administrators.'),
      use: t('privacy.data.account.use', 'Create and secure your account, authenticate you, personalise the service, connect the correct role and jurisdiction, communicate with you, provide customer support and—where permitted—send campaigns or offers. Some account and lead flows synchronise email/phone details to campaign lists.'),
      basis: t('privacy.data.account.basis', 'Contract and steps requested before a contract; legitimate interests in account security and service administration; consent where required.'),
      share: t('privacy.data.account.share', 'Authorised RentalHub personnel and service providers that support authentication, communications and hosting.'),
      retention: t('privacy.data.account.retention', 'While the account is active, then deleted, redacted or anonymised following a valid deletion request, except for records that must remain for legal, transaction, fraud, audit or dispute purposes.'),
    },
    {
      title: t('privacy.data.identity.title', 'Identity and verification data'),
      icon: FaFingerprint,
      collect: t('privacy.data.identity.collect', 'NIN, passport number, nationality, date of birth, document type, passport or live-face photograph, liveness result, identity-match result, verification status and revalidation dates.'),
      source: t('privacy.data.identity.source', 'You, authorised account workflows and identity-verification providers or official data sources they are permitted to query.'),
      use: t('privacy.data.identity.use', 'Verify identity, prevent duplicate or fraudulent accounts, protect property and payment transactions, satisfy compliance requirements and support investigations or disputes.'),
      basis: t('privacy.data.identity.basis', 'Consent where required for sensitive or biometric-related processing; contract; legal obligations; legitimate interests in fraud prevention and platform safety.'),
      share: t('privacy.data.identity.share', 'Prembly and other approved identity-verification processors, restricted authorised staff, and regulators or law-enforcement bodies where legally required. For a property application, the relevant landlord receives the applicant’s name, permitted contact and application details, nationality where relevant, identity-document type and verification status—not the stored NIN or passport number.'),
      retention: t('privacy.data.identity.retention', 'Only while needed for identity assurance, fraud prevention, compliance, disputes and applicable legal requirements. Verification results and audit evidence may outlast an active account where justified.'),
    },
    {
      title: t('privacy.data.properties.title', 'Properties, rentals and applications'),
      icon: FaFileAlt,
      collect: t('privacy.data.properties.collect', 'Property address and location, ownership/listing details, rent and deposits, amenities, photographs and media, applications, saved properties, views, inspections, tenancy and landlord-agent relationship records, reviews, ratings, public-display choices and an optional testimonial image.'),
      source: t('privacy.data.properties.source', 'Tenants, landlords, agents, inspectors, administrators and your use of property features.'),
      use: t('privacy.data.properties.use', 'Publish and match listings, process applications, manage tenancies and inspections, provide property access, prevent misleading listings and resolve rental issues.'),
      basis: t('privacy.data.properties.basis', 'Contract and pre-contract steps; legitimate interests in operating a trusted marketplace; legal obligations; consent for optional public content.'),
      share: t('privacy.data.properties.share', 'The landlord, tenant, agent or professional involved in the transaction; authorised administrators; Cloudinary or other media-storage providers; and professional advisers where a case requires them. An approved public rating can show the selected name format, comment, role/location and—only where the relevant platform setting and user choice permit it—a profile/passport photograph as the testimonial image.'),
      retention: t('privacy.data.properties.retention', 'For the listing, application or tenancy lifecycle and afterwards for support, fraud, legal, audit and limitation-period needs. Public content is removed or de-identified when it is no longer needed or following an applicable request.'),
    },
    {
      title: t('privacy.data.messages.title', 'Messages, calls, support and legal evidence'),
      icon: FaUserShield,
      collect: t('privacy.data.messages.collect', 'In-app messages, delivery/read and typing status, online state, notification history, call signalling and session metadata, support tickets and replies, attachments, disputes, damage reports, photographs, inspection notes, legal authorisations and evidence. During a WebRTC call, live audio/video is processed to connect the participants.'),
      source: t('privacy.data.messages.source', 'You and the other users, professionals, support staff or administrators participating in the communication or case.'),
      use: t('privacy.data.messages.use', 'Deliver real-time communications, provide support, investigate complaints, manage disputes, preserve evidence, protect users and enable authorised lawyers or administrators to perform their duties.'),
      basis: t('privacy.data.messages.basis', 'Contract; legitimate interests in support, safety and dispute resolution; legal obligations; consent where a device permission or sensitive upload requires it.'),
      share: t('privacy.data.messages.share', 'The intended participants, authorised support/admin teams, assigned lawyers or service providers, communications infrastructure providers, courts, regulators or law enforcement when lawfully required.'),
      retention: t('privacy.data.messages.retention', 'For as long as the conversation, support matter, tenancy or dispute reasonably requires, and longer where evidence, safety, audit or legal claims require preservation. Content may be redacted or access-restricted instead of immediately erased.'),
    },
    {
      title: t('privacy.data.payments.title', 'Payments, wallet and payout details'),
      icon: FaCreditCard,
      collect: t('privacy.data.payments.collect', 'Transaction reference, amount, currency, status, purpose, timestamp and related property/service identifiers. For refunds, settlements and withdrawals we may also collect bank name/code, account number and account name.'),
      source: t('privacy.data.payments.source', 'You, the relevant transaction workflow and Paystack or participating financial institutions.'),
      use: t('privacy.data.payments.use', 'Initiate and verify payments, provide subscriptions or paid access, maintain ledgers and wallets, issue refunds or payouts, reconcile transactions, prevent fraud and meet accounting requirements.'),
      basis: t('privacy.data.payments.basis', 'Contract; legal obligations relating to financial records; legitimate interests in reconciliation, fraud prevention and transaction security.'),
      share: t('privacy.data.payments.share', 'Paystack, participating banks, authorised financial administrators, transaction counterparties where necessary, auditors, regulators and authorities where required.'),
      retention: t('privacy.data.payments.retention', 'For the transaction lifecycle and the period required for accounting, tax, fraud prevention, audit, chargebacks, disputes and other legal obligations.'),
    },
    {
      title: t('privacy.data.bookings.title', 'Bookings, routes and location information'),
      icon: FaGlobeAfrica,
      collect: t('privacy.data.bookings.collect', 'Transportation pickup and destination, service type and schedule; fumigation or cleaning address, property size/rooms, timing, health or safety notes, provider assignment and booking evidence; map searches and property location.'),
      source: t('privacy.data.bookings.source', 'You, a booking participant, a service provider and mapping/geocoding services.'),
      use: t('privacy.data.bookings.use', 'Quote, schedule, assign, fulfil and support a booking; show relevant maps or properties; process payment and resolve service complaints.'),
      basis: t('privacy.data.bookings.basis', 'Contract and pre-contract steps; consent for precise device location where requested; legitimate interests in safe and efficient service delivery.'),
      share: t('privacy.data.bookings.share', 'The assigned transportation, cleaning or fumigation provider, relevant administrators, Google Maps services, payment processors and professional advisers where a dispute requires them.'),
      retention: t('privacy.data.bookings.retention', 'For the booking and support lifecycle, then as needed for payment, safety, complaints, fraud, audit and legal records.'),
    },
    {
      title: t('privacy.data.recruitment.title', 'Recruitment and professional onboarding'),
      icon: FaFileAlt,
      collect: t('privacy.data.recruitment.collect', 'Candidate profile, role applied for, CV/resume, qualifications, documents, application answers, browser fingerprint, interview recordings, recording duration, violation log, assessments, scores, reports and related payment or onboarding information.'),
      source: t('privacy.data.recruitment.source', 'The candidate, referees or interviewers where authorised, and recruitment administrators.'),
      use: t('privacy.data.recruitment.use', 'Assess candidates, organise interviews, make and document recruitment decisions, communicate outcomes, complete onboarding and defend or investigate recruitment decisions.'),
      basis: t('privacy.data.recruitment.basis', 'Pre-contract steps; legitimate interests in recruitment administration; legal obligations; consent where required for optional data.'),
      share: t('privacy.data.recruitment.share', 'Recruitment administrators, authorised interviewers, relevant hiring managers and processors that host documents or send communications.'),
      retention: t('privacy.data.recruitment.retention', 'For the recruitment process and afterwards only as needed for a future opportunity you accepted, recordkeeping, disputes or legal claims, after which it should be deleted or de-identified.'),
    },
    {
      title: t('privacy.data.device.title', 'Device, usage, diagnostics and notifications'),
      icon: FaMobileAlt,
      collect: t('privacy.data.device.collect', 'IP address, browser/user agent, device platform, app version, route or screen, session identifier, push token, optional device identifier, notification preferences, security/audit events, analytics events, crash message, stack trace and diagnostic metadata.'),
      source: t('privacy.data.device.source', 'Your browser or device, the RentalHub apps and configured analytics, crash-reporting and notification services.'),
      use: t('privacy.data.device.use', 'Keep sessions working, deliver requested notifications, detect abuse, diagnose crashes, monitor reliability, measure feature use, protect accounts and improve performance.'),
      basis: t('privacy.data.device.basis', 'Contract for essential service operation; legitimate interests in security, reliability and product improvement; consent where required for non-essential analytics or notifications.'),
      share: t('privacy.data.device.share', 'Expo for push delivery, Google Analytics when configured, hosting/monitoring providers and authorised technical personnel.'),
      retention: t('privacy.data.device.retention', 'Only for as long as needed for security, troubleshooting, reliability and measurement. Push tokens remain until logout/unregistration, invalidation or account deletion; essential browser authentication and CSRF cookies default to a seven-day lifetime.'),
    },
  ];

  const recipientGroups = [
    {
      name: t('privacy.recipients.people.title', 'People involved in your request'),
      detail: t('privacy.recipients.people.detail', 'Landlords, tenants, agents, lawyers, inspectors, candidates, interviewers and transportation, cleaning or fumigation providers receive only the information needed for their authorised workflow.'),
    },
    {
      name: t('privacy.recipients.processors.title', 'Identity and payment processors'),
      detail: t('privacy.recipients.processors.detail', 'Prembly supports identity/liveness checks. Paystack supports checkout, payment verification, bank-account resolution, refunds, settlements and transfers.'),
    },
    {
      name: t('privacy.recipients.infrastructure.title', 'Cloud, media and app infrastructure'),
      detail: t('privacy.recipients.infrastructure.detail', 'Cloudinary and configured hosting/database providers store or deliver application data and uploaded media. Expo supports mobile push delivery.'),
    },
    {
      name: t('privacy.recipients.comms.title', 'Communications and web services'),
      detail: t('privacy.recipients.comms.detail', 'Configured email/SMTP or Resend services, Termii for SMS, Twilio for voice calls, Meta WhatsApp services, Google Maps and Google Analytics may process the information required to provide their feature. Support chat is provided in-house by RentalHub and stored in RentalHub’s own systems.'),
    },
    {
      name: t('privacy.recipients.ai.title', 'AI-assisted damage analysis'),
      detail: t('privacy.recipients.ai.detail', 'When the damage-analysis feature is used, the submitted damage photograph is sent to Anthropic’s Claude service for a non-binding analysis. RentalHub stores the resulting assessment with the damage workflow.'),
    },
    {
      name: t('privacy.recipients.authorities.title', 'Professional and public authorities'),
      detail: t('privacy.recipients.authorities.detail', 'Auditors, insurers, professional advisers, courts, regulators, tax bodies or law-enforcement authorities may receive data where necessary to protect rights, meet a legal duty or respond to a valid request.'),
    },
    {
      name: t('privacy.recipients.restructuring.title', 'Business restructuring'),
      detail: t('privacy.recipients.restructuring.detail', 'A genuine prospective buyer, investor or successor may receive appropriately protected information during a merger, financing, reorganisation or transfer of the platform, subject to confidentiality and applicable law.'),
    },
  ];

  const rights = [
    t('privacy.rights.1', 'Ask whether we process your personal data and obtain access to it.'),
    t('privacy.rights.2', 'Correct information that is inaccurate or complete information that is incomplete.'),
    t('privacy.rights.3', 'Request deletion, anonymisation or restriction where the law allows it.'),
    t('privacy.rights.4', 'Object to processing based on legitimate interests or to direct marketing.'),
    t('privacy.rights.5', 'Withdraw consent at any time, without affecting processing already lawfully completed.'),
    t('privacy.rights.6', 'Request a portable copy of eligible data in a commonly used format.'),
    t('privacy.rights.7', 'Ask for human review of a significant decision made solely by automated means and explain your concerns.'),
    t('privacy.rights.8', 'Complain to RentalHub and, if unresolved, to the Nigeria Data Protection Commission.'),
  ];

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

      <div className="privacy-document min-h-screen bg-slate-50 text-slate-900">
        <a
          href="#privacy-content"
          className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-semibold text-primary-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {t('privacy.skip', 'Skip to privacy policy')}
        </a>

        <header className="privacy-screen-hero relative isolate overflow-hidden bg-slate-950 text-white">
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
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">{t('privacy.hero_tagline', 'Privacy, explained clearly')}</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{t('privacy.hero_title', 'Your data. Your rights.')}</h1>
              <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-primary-100 sm:text-lg sm:leading-8">
                {t('privacy.hero_sub', 'This policy explains exactly what RentalHub NG collects, where it comes from, why we use it, who may receive it, how long we keep it and the controls available to you.')}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm">
                <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 font-semibold">
                  {t('privacy.effective', 'Effective and last updated {date}', { date: LAST_UPDATED })}
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
                  {t('privacy.print_or_save', 'Print or save')}
                </button>
              </div>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard icon={FaDatabase} title={t('privacy.summary.collect.title', 'We collect what the service needs')}>
                {t('privacy.summary.collect.body', 'This includes account, identity, property, booking, payment, communication and technical data described below.')}
              </SummaryCard>
              <SummaryCard icon={FaBalanceScale} title={t('privacy.summary.reason.title', 'Every use needs a reason')}>
                {t('privacy.summary.reason.body', 'We rely on contract, consent, legal duties or carefully balanced legitimate interests—not an unspecified blanket permission.')}
              </SummaryCard>
              <SummaryCard icon={FaLock} title={t('privacy.summary.protection.title', 'Protection is layered')}>
                {t('privacy.summary.protection.body', 'We use access controls, hashing, encryption for NIN data, secure session controls, upload checks, audit trails and monitoring.')}
              </SummaryCard>
              <SummaryCard icon={FaUserShield} title={t('privacy.summary.control.title', 'You remain in control')}>
                {t('privacy.summary.control.body', 'You can ask for access, correction, deletion, restriction, portability, objection, consent withdrawal and human review.')}
              </SummaryCard>
            </div>
          </div>
        </header>

        <div className="privacy-print-header hidden">
          <p>RENTALHUB NG</p>
          <h1>{t('privacy.title', 'Privacy Policy')}</h1>
          <span>{t('privacy.effective_url', 'Effective and last updated {date} · rentalhub.com.ng/privacy', { date: LAST_UPDATED })}</span>
        </div>

        <main id="privacy-content" className="privacy-main mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="privacy-screen-notice mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-1 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                {t('privacy.language_notice', 'This policy is currently published in English. It applies to the RentalHub website, mobile applications, support channels and services that link to it. A third-party website or app you open from RentalHub has its own privacy terms.')}
              </p>
            </div>
          </div>

          <div className="privacy-content-grid grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
            <aside className="privacy-toc hidden lg:block">
              <nav
                aria-label="Privacy policy contents"
                className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="px-3 pb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">{t('privacy.on_this_page', 'On this page')}</p>
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

            <div className="privacy-policy-stack min-w-0 space-y-7">
              <PolicySection id="scope" eyebrow="01 · Controller" title={t('privacy.scope.title', 'Who we are and what this policy covers')} icon={FaShieldAlt}>
                <p>
                  {t('privacy.scope.1', 'RentalHub NG (“RentalHub”, “we”, “us” or “our”) operates rentalhub.com.ng and the RentalHub mobile applications from Nigeria. RentalHub is the controller of personal data it decides how and why to process. Where a landlord, agent, lawyer, employer, service provider or other user independently decides how to use information they receive, that person may also have their own responsibilities under data-protection law.')}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <a href="mailto:support@rentalhub.com.ng" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('privacy.scope.privacy_email', 'Privacy email')}</span>
                    <span className="mt-1 block break-all font-bold text-primary-800">support@rentalhub.com.ng</span>
                  </a>
                  <a href="tel:+2348030601238" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('privacy.scope.telephone', 'Telephone')}</span>
                    <span className="mt-1 block font-bold text-primary-800">+234 803 060 1238</span>
                  </a>
                  <a href="https://rentalhub.com.ng" className="rounded-xl bg-slate-50 p-4 transition hover:bg-primary-50">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{t('privacy.scope.website', 'Website')}</span>
                    <span className="mt-1 block font-bold text-primary-800">rentalhub.com.ng</span>
                  </a>
                </div>
              </PolicySection>

              <PolicySection id="summary" eyebrow="02 · Overview" title={t('privacy.summary_section.title', 'Privacy at a glance')} icon={FaCheckCircle}>
                <CheckList
                  items={[
                    t('privacy.summary_section.1', 'We use personal data to provide property, rental, professional, support, recruitment, booking, payment and safety features—not simply because we have collected it.'),
                    t('privacy.summary_section.2', 'Some features cannot work without required data. Optional permissions, marketing and certain sensitive processing depend on your choice or another lawful basis explained at the point of collection.'),
                    t('privacy.summary_section.3', 'We disclose data to authorised participants and processors only when their role or the law requires it. Access is role- and workflow-based.'),
                    t('privacy.summary_section.4', 'The mobile biometric prompt unlocks a saved session through your phone’s operating system; RentalHub does not receive your fingerprint or Face ID template.'),
                    t('privacy.summary_section.5', 'You may exercise your rights through the available account controls or by contacting support. We may need to verify that the request is really yours.'),
                  ]}
                />
              </PolicySection>

              <PolicySection id="data-map" eyebrow="03 · Data map" title={t('privacy.data_map.title', 'What we collect, use, share and retain')} icon={FaDatabase}>
                <p className="mb-6">
                  {t('privacy.data_map.intro', 'The cards below are the detailed data map for the current RentalHub product. “Retention” describes the period or decision criteria used because one universal period would be inaccurate for very different records.')}
                </p>
                <div className="space-y-4">
                  {dataGroups.map(({ title, icon: Icon, collect, source, use, basis, share, retention }, index) => (
                    <article key={title} className="privacy-data-card rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
                      <div className="mb-5 flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-800">
                          <Icon aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('privacy.data_map.category', 'Category {number}', { number: index + 1 })}</p>
                          <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">{title}</h3>
                        </div>
                      </div>
                      <div className="grid gap-5 md:grid-cols-2">
                        <Detail label={t('privacy.labels.collect', 'What we collect')}>{collect}</Detail>
                        <Detail label={t('privacy.labels.source', 'Where it comes from')}>{source}</Detail>
                        <Detail label={t('privacy.labels.use', 'Why we use it')}>{use}</Detail>
                        <Detail label={t('privacy.labels.basis', 'Lawful basis')}>{basis}</Detail>
                        <Detail label={t('privacy.labels.share', 'Who may receive it')}>{share}</Detail>
                        <Detail label={t('privacy.labels.retention', 'How long we keep it')}>{retention}</Detail>
                      </div>
                    </article>
                  ))}
                </div>
              </PolicySection>

              <PolicySection id="sources" eyebrow="04 · Collection" title={t('privacy.sources.title', 'How information reaches RentalHub')} icon={FaDatabase}>
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    [t('privacy.sources.direct.title', 'Directly from you'), t('privacy.sources.direct.detail', 'When you register, verify identity, create a listing, apply, book, pay, message, upload a file, contact support, apply for a role, change settings or exercise a right.')],
                    [t('privacy.sources.user.title', 'From another authorised user'), t('privacy.sources.user.detail', 'For example, an agent or lawyer invitation, a landlord reviewing an application, a service provider updating a booking, or another party supplying evidence in a dispute.')],
                    [t('privacy.sources.auto.title', 'Automatically from the service'), t('privacy.sources.auto.detail', 'Browser/device details, IP address, session and security events, feature use, notification token, diagnostic information and transaction status are generated as the website or app operates.')],
                    [t('privacy.sources.providers.title', 'From providers and lawful sources'), t('privacy.sources.providers.detail', 'Payment and bank-resolution results, identity-verification results, map/geocoding information, communication delivery status and records supplied by an authority or professional where permitted.')],
                  ].map(([title, detail]) => (
                    <article key={title} className="rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-extrabold text-slate-900">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-5">
                  {t('privacy.sources.note', 'Please provide accurate information and do not upload another person’s data unless you are authorised to do so. If we need data for a contract or legal requirement and you do not provide it, the relevant account, verification, payment, property, support or booking feature may not be available.')}
                </p>
              </PolicySection>

              <PolicySection id="lawful-bases" eyebrow="05 · Purpose limitation" title={t('privacy.bases.title', 'How and why we use personal data')} icon={FaBalanceScale}>
                <div className="space-y-5">
                  <Detail label={t('privacy.bases.contract', 'Contract and requested pre-contract steps')}>
                    {t('privacy.bases.contract.body', 'To create an account, show and manage properties, process applications and tenancies, deliver messages and support, fulfil bookings, process payments, provide professional features and respond before you enter a transaction.')}
                  </Detail>
                  <Detail label={t('privacy.bases.legal', 'Legal obligation')}>
                    {t('privacy.bases.legal.body', 'To keep required financial and audit records, respond to lawful authorities, manage legal claims and meet identity, fraud, court, regulatory or data-protection duties that apply to a transaction.')}
                  </Detail>
                  <Detail label={t('privacy.bases.legitimate', 'Legitimate interests')}>
                    {t('privacy.bases.legitimate.body', 'To secure accounts, prevent fraud and abuse, improve reliability, administer the marketplace, investigate complaints, reconcile transactions and protect RentalHub and its users. We must balance those interests against your rights and reasonable expectations.')}
                  </Detail>
                  <Detail label={t('privacy.bases.consent', 'Consent')}>
                    {t('privacy.bases.consent.body', 'For optional device permissions, direct marketing, public profile/photo choices, sensitive identity or liveness processing and non-essential tracking where consent is legally required. You may withdraw consent, but that does not invalidate processing already completed lawfully.')}
                  </Detail>
                  <Detail label={t('privacy.bases.vital', 'Vital interests or public interest')}>
                    {t('privacy.bases.vital.body', 'In a genuine emergency or where a specific law authorises processing for an important public purpose. These bases are exceptional, not routine.')}
                  </Detail>
                </div>
                <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50 p-5">
                  <h3 className="font-extrabold text-slate-950">{t('privacy.bases.comms.title', 'Service and safety communications')}</h3>
                  <p className="mt-2 text-sm leading-6 text-primary-900">
                    {t('privacy.bases.comms.body', 'We may send account, security, payment, application, booking, dispute and support notices needed to operate the service. Some account and lead flows also synchronise email and phone details to email/SMS campaign lists. Email campaigns provide an unsubscribe route. Mobile notification preferences control native push categories only; to stop SMS or WhatsApp marketing, contact us. Promotional messages must only be sent where consent or another applicable legal basis permits them.')}
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="sharing" eyebrow="06 · Recipients" title={t('privacy.sharing.title', 'Who may receive your data')} icon={FaUsers}>
                <p>
                  {t('privacy.sharing.intro', 'We do not make every record visible to every role. Information is disclosed according to the feature, relationship, jurisdiction and permissions involved. Current recipient categories include:')}
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
                  {t('privacy.sharing.note', 'Provider names can change as the platform evolves. A provider is permitted to process only the information needed for its service and must be assessed and governed as required by applicable law. Sponsored content may record aggregate impression or click counts; opening a sponsor’s link takes you to a service with its own privacy policy.')}
                </p>
              </PolicySection>

              <PolicySection id="identity-payments" eyebrow="07 · Sensitive workflows" title={t('privacy.identity.title', 'Identity, biometrics and payments')} icon={FaFingerprint}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">{t('privacy.identity.verification.title', 'Identity verification and face/liveness checks')}</h3>
                    <p className="mt-2">
                      {t('privacy.identity.verification.body', 'Current Prembly validation sends NIN, name and date of birth for a Nigerian identity check, or passport number, name, nationality and date of birth for a passport check. RentalHub may separately collect an identity/passport photograph. If a face/liveness feature is enabled and presented to you, the notice at that step will explain any face image sent for liveness processing. Within RentalHub, NIN values are protected using authenticated encryption and a separate one-way lookup hash used to detect duplicates. A verification result can be used to approve, reject, revalidate or investigate an account, subject to the rights below.')}
                    </p>
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                      <strong>{t('privacy.identity.app_access.title', 'Property-application access:')}</strong>{' '}
                      {t('privacy.identity.app_access.body', 'the relevant landlord can review the applicant’s name, permitted contact and application details, nationality where relevant, identity-document type and verification status. RentalHub does not include the stored NIN or passport number in the landlord’s application response.')}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">{t('privacy.identity.phone_biometrics.title', 'Phone biometrics')}</h3>
                    <p className="mt-2">
                      {t('privacy.identity.phone_biometrics.body', 'Fingerprint or Face ID sign-in is different from identity liveness. The mobile app asks Android or iOS to confirm a biometric match before unlocking a locally saved session. RentalHub does not receive or store the fingerprint/Face ID template; your operating system manages it. The app also keeps session and account information in device application storage, using device-protected credential storage for supported secrets. Protect your phone with a screen lock and sign out on a shared device.')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">{t('privacy.identity.paystack.title', 'Paystack checkout and bank details')}</h3>
                    <p className="mt-2">
                      {t('privacy.identity.paystack.body', 'Card, bank or USSD checkout is handled through Paystack. RentalHub’s application does not collect or store your full card number or CVV. We do store transaction references, amount, status, purpose and related records needed to provide and reconcile the purchase. For a refund, withdrawal, settlement or payout, RentalHub may store the bank name/code, account number and resolved account name and send them to Paystack or a participating bank.')}
                    </p>
                  </div>
                </div>
              </PolicySection>

              <PolicySection id="cookies" eyebrow="08 · Web and device storage" title={t('privacy.cookies.title', 'Cookies, analytics, chat and permissions')} icon={FaCookieBite}>
                <p>
                  {t('privacy.cookies.1', 'RentalHub uses essential browser cookies and local/device storage to keep you signed in, prevent cross-site request forgery, remember preferences and operate app sessions. Production authentication cookies are configured with HttpOnly, Secure and SameSite protections; the separate CSRF cookie must be readable by the web app to submit its protection token. Their default lifetime is seven days, although logout, expiry or security actions can end a session earlier.')}
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Detail label={t('privacy.cookies.analytics.title', 'Analytics')}>
                    {t('privacy.cookies.analytics.body', 'When a Google Analytics identifier is configured, the website sends usage and device/browser events to Google to understand traffic and feature use. Mobile diagnostics and analytics can send app version, platform, session/screen, event and crash information to RentalHub’s API.')}
                  </Detail>
                  <Detail label={t('privacy.cookies.chat.title', 'Live chat')}>
                    {t('privacy.cookies.chat.body', 'The Home page can load HubSpot Conversations to provide live chat. HubSpot may set its own cookies or receive browser and chat information under its own privacy terms.')}
                  </Detail>
                  <Detail label={t('privacy.cookies.maps.title', 'Maps and external media')}>
                    {t('privacy.cookies.maps.body', 'Google Maps/geocoding and hosted media receive the technical requests needed to display a map, locate a place or deliver an image/document. External links are governed by the destination’s policy.')}
                  </Detail>
                  <Detail label={t('privacy.cookies.permissions.title', 'Mobile permissions')}>
                    {t('privacy.cookies.permissions.body', 'Camera, photo/media, microphone, notification and location access are requested only when a feature needs them. Device settings can revoke a permission, but the related upload, call, alert or location feature may then stop working.')}
                  </Detail>
                </div>
                <p className="mt-5">
                  {t('privacy.cookies.note', 'You can block or delete browser cookies through browser controls and manage mobile permissions in your device settings. Blocking essential storage can prevent login or other core functions. Where law requires a choice before non-essential tracking, RentalHub must obtain that choice at the relevant collection point.')}
                </p>
              </PolicySection>

              <PolicySection id="storage-transfers" eyebrow="09 · Location of processing" title={t('privacy.storage.title', 'Storage and international transfers')} icon={FaGlobeAfrica}>
                <p>
                  {t('privacy.storage.1', 'RentalHub data is held in the application database, authenticated server file storage, configured cloud media storage and the systems of the processors identified above. Some mobile session, preference and cached information is also stored on your device. Data is not necessarily kept in one country.')}
                </p>
                <p className="mt-4">
                  {t('privacy.storage.2', 'Paystack, Prembly, Cloudinary, Expo, Google, HubSpot, Meta and communications or hosting providers may operate infrastructure or support teams in more than one country. Before making a restricted international transfer, RentalHub must use a transfer permitted by applicable law—for example an adequacy decision, approved contractual safeguards, another authorised mechanism, or a specific exception—and assess the protection available at the destination. Contact us for information about the safeguard relevant to your data.')}
                </p>
              </PolicySection>

              <PolicySection id="retention" eyebrow="10 · Data lifecycle" title={t('privacy.retention.title', 'How long we keep personal data')} icon={FaDatabase}>
                <p>
                  {t('privacy.retention.intro', 'We keep data only for as long as it is reasonably needed for the purpose described in this policy, then delete, de-identify, redact or restrict it. We decide the period using:')}
                </p>
                <div className="mt-5">
                  <CheckList
                    items={[
                      t('privacy.retention.1', 'Whether your account, property, tenancy, application, booking, support ticket or professional relationship remains active.'),
                      t('privacy.retention.2', 'The amount, sensitivity and risk of the information and whether it remains necessary for security or fraud prevention.'),
                      t('privacy.retention.3', 'Accounting, tax, audit, court, regulatory, transaction and limitation-period obligations.'),
                      t('privacy.retention.4', 'An unresolved payment, chargeback, complaint, dispute, damage report, legal claim or investigation.'),
                      t('privacy.retention.5', 'Whether the record can be safely aggregated, anonymised or redacted instead of retained in identifiable form.'),
                    ]}
                  />
                </div>
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <h3 className="font-extrabold text-amber-950">{t('privacy.retention.deletion.title', 'What account deletion means')}</h3>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    {t('privacy.retention.deletion.body', 'We may ask for your password or other proof before acting. Active properties, disputes or pending payments can delay a purge. Records required for transactions, fraud prevention, audit, legal claims or another person’s rights may be retained with access restricted, or anonymised/redacted rather than erased. A deletion request therefore does not always remove every transaction or case record immediately.')}
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="security" eyebrow="11 · Safeguards" title={t('privacy.security.title', 'How we protect personal data')} icon={FaLock}>
                <p>
                  {t('privacy.security.intro', 'RentalHub applies technical and organisational safeguards appropriate to the data and risk. The current application includes:')}
                </p>
                <div className="mt-5">
                  <CheckList
                    items={[
                      t('privacy.security.1', 'Bcrypt password hashing and authenticated encryption plus a separate one-way lookup hash for NIN data.'),
                      t('privacy.security.2', 'Secure/HttpOnly/SameSite browser-session controls in production, CSRF protection, CORS/CSP/HSTS/Helmet protections, request throttling and input sanitisation.'),
                      t('privacy.security.3', 'Role, relationship and jurisdiction checks so administrators, lawyers, agents and providers access only authorised workflows.'),
                      t('privacy.security.4', 'Authentication on protected uploads, file type/signature and size checks, evidence hashes and operational audit logs.'),
                      t('privacy.security.5', 'OS biometric gates and device credential storage for supported mobile secrets, alongside application storage needed for sessions and preferences.'),
                      t('privacy.security.6', 'Monitoring and diagnostic records used to investigate suspicious activity, errors and service failures.'),
                    ]}
                  />
                </div>
                <p className="mt-5">
                  {t('privacy.security.note', 'No website, app or transmission is completely secure. Keep your password and device private, use a screen lock, and report a suspected compromise promptly. We assess personal-data incidents and notify the Nigeria Data Protection Commission and affected people when applicable law requires it.')}
                </p>
              </PolicySection>

              <PolicySection id="automated-tools" eyebrow="12 · Fairness" title={t('privacy.automated.title', 'Automated checks, rankings and recommendations')} icon={FaBalanceScale}>
                <p>
                  {t('privacy.automated.1', 'RentalHub may use rules, scores or automated services to assist identity/liveness verification, duplicate detection, fraud and risk alerts, location or property recommendations, candidate filtering, damage or evidence analysis, and prioritisation of administrative work. These tools can use account, transaction, location, behaviour, verification or case information relevant to the task.')}
                </p>
                <p className="mt-4">
                  {t('privacy.automated.2', 'Automated output is a signal, not permission to ignore fairness or accuracy. Where a decision is made solely by automated processing and has a legal or similarly significant effect, you may ask for meaningful information about the logic involved, express your view, contest the outcome and request human review, subject to applicable law.')}
                </p>
              </PolicySection>

              <PolicySection id="rights" eyebrow="13 · Your control" title={t('privacy.rights.title', 'Your privacy choices and legal rights')} icon={FaUserShield}>
                <CheckList items={rights} />
                <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-primary-50 sm:p-6">
                  <h3 className="text-lg font-extrabold text-white">{t('privacy.rights.how.title', 'How to exercise a right')}</h3>
                  <p className="mt-2 text-sm leading-6 text-primary-100">
                    {t('privacy.rights.how.body', 'Use an available profile/account control or email support@rentalhub.com.ng with the subject “Privacy request”. Describe the account and request, but do not email a password, full NIN, full payment-card details or unnecessary identity documents. We may securely verify identity and authority before disclosing or changing data. Account controls differ by platform, so contact us if an export, correction or deletion control is not visible and we will assess the full request.')}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-primary-100">
                    {t('privacy.rights.how.note', 'A right may have lawful limits—for example, another person’s privacy, an active transaction or dispute, fraud prevention, legal privilege, or a record we must retain. If we cannot fulfil a request, we will explain the applicable reason and complaint route.')}
                  </p>
                </div>
              </PolicySection>

              <PolicySection id="children" eyebrow="14 · Age" title={t('privacy.children.title', 'Children’s privacy')} icon={FaUsers}>
                <p>
                  {t('privacy.children.body', 'RentalHub’s property, payment and professional services are designed for adults who can enter binding transactions. The current registration code does not provide a comprehensive age-verification gate. A parent or guardian who believes a child under 18 supplied personal data without appropriate authority should contact us so we can investigate, restrict the account and delete data where the law permits.')}
                </p>
              </PolicySection>

              <PolicySection id="changes" eyebrow="15 · Version control" title={t('privacy.changes.title', 'When this policy changes')} icon={FaFileAlt}>
                <p>
                  {t('privacy.changes.body', 'We may update this policy when features, providers, legal requirements or data practices change. The latest version will appear at this URL with a new “Last updated” date. For a material change, we may also provide an in-app, website, push or email notice appropriate to the impact. A new purpose that requires consent will not be treated as accepted merely because the policy changed.')}
                </p>
              </PolicySection>

              <PolicySection id="contact" eyebrow="16 · Help and complaints" title={t('privacy.contact.title', 'Contact RentalHub or the regulator')} icon={FaEnvelope}>
                <p>
                  {t('privacy.contact.intro', 'Start with RentalHub so we can investigate and respond. Include enough information to locate your account or transaction, but avoid sending sensitive identifiers in an unsecured message.')}
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <a
                    href="mailto:support@rentalhub.com.ng?subject=Privacy%20request"
                    className="group rounded-2xl border border-primary-100 bg-primary-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-primary-200"
                  >
                    <FaEnvelope className="text-xl text-primary-700" aria-hidden="true" />
                    <span className="mt-3 block text-xs font-bold uppercase tracking-wider text-primary-600">{t('privacy.contact.email', 'Email RentalHub')}</span>
                    <span className="mt-1 block break-all font-extrabold text-slate-950">support@rentalhub.com.ng</span>
                  </a>
                  <a
                    href="tel:+2348030601238"
                    className="group rounded-2xl border border-primary-100 bg-primary-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-primary-200"
                  >
                    <FaPhoneAlt className="text-xl text-primary-700" aria-hidden="true" />
                    <span className="mt-3 block text-xs font-bold uppercase tracking-wider text-primary-600">{t('privacy.contact.call', 'Call RentalHub')}</span>
                    <span className="mt-1 block font-extrabold text-slate-950">+234 803 060 1238</span>
                  </a>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-extrabold text-slate-950">{t('privacy.contact.ndpc.title', 'Nigeria Data Protection Commission (NDPC)')}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t('privacy.contact.ndpc.body', 'If you believe your complaint has not been resolved, you may lodge a complaint with the NDPC through its official website.')}
                  </p>
                  <a
                    href="https://ndpc.gov.ng/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 font-bold text-primary-700 hover:text-primary-900 hover:underline"
                  >
                    {t('privacy.contact.ndpc.link', 'Visit the NDPC website')}
                    <FaChevronRight className="text-xs" aria-hidden="true" />
                  </a>
                </div>
              </PolicySection>
            </div>
          </div>
        </main>
      </div>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm 14mm 17mm; }
          html, body, #root { background: #fff !important; }
          body { color: #111827 !important; font-family: Arial, Helvetica, sans-serif !important; }
          .privacy-screen-hero, .privacy-screen-notice, .privacy-toc,
          .app-public-header, .app-language-switcher, .app-public-footer,
          .Toastify, [data-floating-widget], button { display: none !important; }
          .privacy-print-header { display: block !important; margin: 0 0 9mm; padding-bottom: 5mm; border-bottom: 2px solid #0f172a; }
          .privacy-print-header p { margin: 0 0 2mm; font-size: 9pt; font-weight: 800; letter-spacing: .16em; }
          .privacy-print-header h1 { margin: 0; font-size: 23pt; line-height: 1.1; }
          .privacy-print-header span { display: block; margin-top: 2mm; color: #475569; font-size: 9pt; }
          .privacy-main { max-width: none !important; padding: 0 !important; }
          .privacy-content-grid, .privacy-policy-stack { display: block !important; }
          .privacy-policy-section { display: block !important; overflow: visible !important; margin: 0 0 7mm !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-inside: auto; page-break-inside: auto; }
          .privacy-section-heading { padding: 3mm 0 2.5mm !important; border-bottom: 1px solid #cbd5e1 !important; background: #fff !important; break-after: avoid-page; page-break-after: avoid; }
          .privacy-section-heading > div > div:first-child { display: none !important; }
          .privacy-section-heading p { margin: 0; font-size: 8pt !important; }
          .privacy-section-heading h2 { margin: 1mm 0 0 !important; font-size: 14pt !important; }
          .privacy-section-content { padding: 3mm 0 0 !important; font-size: 9.5pt !important; line-height: 1.48 !important; }
          .privacy-section-content p { orphans: 3; widows: 3; }
          .privacy-data-card { overflow: visible !important; margin-bottom: 4mm !important; padding: 4mm !important; border: 1px solid #cbd5e1 !important; border-radius: 2mm !important; background: #fff !important; break-inside: auto; page-break-inside: auto; }
          .privacy-data-card > div:first-child, .privacy-detail, .privacy-section-content li,
          .privacy-section-content table tr { break-inside: avoid; page-break-inside: avoid; }
          .privacy-detail { margin-bottom: 2.5mm; }
          h1, h2, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
          p, li { orphans: 3; widows: 3; }
          a { color: inherit !important; text-decoration: none !important; }
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </>
  );
};

export default Privacy;
