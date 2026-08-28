import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  FaBalanceScale,
  FaCheckCircle,
  FaChevronRight,
  FaCreditCard,
  FaEnvelope,
  FaExclamationTriangle,
  FaFileContract,
  FaHome,
  FaLock,
  FaMobileAlt,
  FaPrint,
  FaShieldAlt,
  FaUserCheck,
  FaUsers,
} from 'react-icons/fa';

const LAST_UPDATED = '1 August 2026';

const Terms = () => {
  const { t } = useTranslation();

  const sections = [
    {
      id: 'acceptance',
      icon: FaFileContract,
      title: t('terms.acceptance.title', 'Acceptance and scope'),
      body: [
        t('terms.acceptance.1', 'These Terms of Service (the “Terms”) form a binding agreement between you and RentalHub NG (“RentalHub”, “we”, “us” or “our”) when you access rentalhub.com.ng, install or use a RentalHub mobile application, create an account, submit information, make a payment, or use a service that links to these Terms.'),
        t('terms.acceptance.2', 'If you do not agree, do not create an account or continue using the service. Additional terms shown before a particular payment, booking, subscription, recruitment application, professional service or promotion form part of these Terms for that transaction. If they conflict, the more specific terms apply to that transaction.'),
      ],
    },
    {
      id: 'eligibility',
      icon: FaUserCheck,
      title: t('terms.eligibility.title', 'Eligibility, accounts and authority'),
      body: [
        t('terms.eligibility.1', 'You must be at least 18 years old and legally able to enter the transaction you request. You must provide accurate, current information, keep it updated, protect your password and device, and promptly report suspected unauthorised access.'),
        t('terms.eligibility.2', 'You may act for another person, landlord, company or organisation only when you have authority to bind them. You are responsible for activity performed through your account unless it results from a security failure attributable to RentalHub.'),
        t('terms.eligibility.3', 'Account roles and administrator permissions are limited to their assigned purpose and jurisdiction. You must not share an administrator account, misuse elevated access, or attempt to access another user’s records without authorisation.'),
      ],
    },
    {
      id: 'marketplace',
      icon: FaHome,
      title: t('terms.marketplace.title', 'RentalHub’s role and marketplace relationships'),
      body: [
        t('terms.marketplace.1', 'RentalHub provides technology for property discovery, listings, applications, communications, payments, bookings, support and related workflows. Unless a screen expressly says otherwise, RentalHub is not the landlord, tenant, property owner, estate agent, lawyer, bank, transporter, cleaner, fumigator, insurer or employer in a transaction between users.'),
        t('terms.marketplace.2', 'A landlord, agent, lawyer, service provider or other professional remains responsible for their representations, licences, advice, work, property and legal obligations. Verification badges and administrative review reduce risk but are not a guarantee of identity, title, professional competence, property condition, availability or future conduct.'),
      ],
    },
    {
      id: 'listings',
      icon: FaCheckCircle,
      title: t('terms.listings.title', 'Listings, applications and tenancy activity'),
      body: [
        t('terms.listings.1', 'Listings, applications, prices, photographs, ownership information and availability must be truthful and lawful. A user must not advertise a property without authority, conceal material defects, impersonate another person, discriminate unlawfully, or manipulate reviews or application decisions.'),
        t('terms.listings.2', 'Tenants should inspect a property, confirm the counterparty and review the applicable tenancy documents before committing funds. Landlords and agents must keep availability and charges current and must handle deposits, notices, maintenance, access and tenancy decisions in accordance with applicable law.'),
        t('terms.listings.3', 'Submitting an application does not guarantee acceptance or create a tenancy. A tenancy or professional engagement arises only through the applicable agreement and required confirmations between the relevant parties.'),
      ],
    },
    {
      id: 'verification',
      icon: FaShieldAlt,
      title: t('terms.verification.title', 'Identity checks and credential revalidation'),
      body: [
        t('terms.verification.1', 'RentalHub may require email, phone, identity-document, live-photo, liveness, role, ownership or professional verification. We may ask you to revalidate a credential where information expires, changes, conflicts, is incomplete, or presents a fraud or safety concern.'),
        t('terms.verification.2', 'You must submit only your own authentic information through the requested secure workflow. Pending, rejected or expired verification may limit features. A verification decision may be reviewed, corrected or appealed through the available support or appeal process.'),
        t('terms.verification.3', 'How identity and biometric-related data is handled is explained in the Privacy Policy. A device biometric prompt used to unlock the app is controlled by your phone’s operating system; RentalHub does not receive the fingerprint or face template stored by your device.'),
      ],
    },
    {
      id: 'fees',
      icon: FaCreditCard,
      title: t('terms.fees.title', 'Prices, payments, wallets and payouts'),
      body: [
        t('terms.fees.1', 'The amount, purpose, taxes (if any), and material conditions of a paid feature are shown before confirmation. Charges may include registration access, property access, rent, subscriptions, applications, inspections, bookings, professional services or other clearly identified services.'),
        t('terms.fees.2', 'Payments may be processed by Paystack, a participating bank or another approved provider. RentalHub does not ask you to place full payment-card details in messages or support tickets. Payment success is subject to provider confirmation and may be delayed while a transaction is reconciled.'),
        t('terms.fees.3', 'A RentalHub wallet, savings view, balance or ledger is a platform record for eligible transactions; it is not a bank account and RentalHub does not promise interest unless a specific regulated product expressly says so. Withdrawals, refunds and settlements may require verification, available funds, fraud review, valid destination details and any disclosed reserve or processing rule.'),
      ],
    },
    {
      id: 'refunds',
      icon: FaBalanceScale,
      title: t('terms.refunds.title', 'Cancellations, refunds and payment disputes'),
      body: [
        t('terms.refunds.1', 'Cancellation and refund eligibility depends on the service, work already performed, counterparty obligations, disclosed cancellation window and applicable law. The checkout or booking screen may provide specific conditions before payment.'),
        t('terms.refunds.2', 'If a payment fails, is duplicated, is charged but not reflected, or the promised service is not supplied, use the payment-recovery or support workflow with the transaction reference. Do not initiate contradictory recovery requests or knowingly seek a chargeback after receiving the service.'),
        t('terms.refunds.3', 'Nothing in these Terms removes a refund, remedy, warranty or cancellation right that cannot lawfully be excluded under the Federal Competition and Consumer Protection Act or other applicable law. Where a contractual rule conflicts with a non-excludable consumer right, the legal right prevails.'),
      ],
    },
    {
      id: 'services',
      icon: FaUsers,
      title: t('terms.services.title', 'Bookings, agents, lawyers and other services'),
      body: [
        t('terms.services.1', 'Transportation, cleaning, fumigation, inspections, legal support, agents and other service workflows may involve independent providers. You must give accurate addresses, timing, safety information and instructions and provide safe, lawful access where required.'),
        t('terms.services.2', 'A lawyer-client, agency, service or employment relationship is created only under the applicable engagement or appointment—not merely because a directory profile, invitation or matching tool appears on RentalHub. Emergency, medical or time-critical services should be obtained from the appropriate public authority or qualified provider, not ordinary platform support.'),
      ],
    },
    {
      id: 'communications',
      icon: FaMobileAlt,
      title: t('terms.communications.title', 'Messages, calls, notifications and evidence'),
      body: [
        t('terms.communications.1', 'You may receive account, security, transaction, application, booking, support and administrative communications through the website, app, email, SMS, push notification or another channel you enable. You are responsible for keeping contact details current and reviewing important notices.'),
        t('terms.communications.2', 'Do not use messages, calls, files or evidence tools to threaten, harass, defraud, distribute malware, expose another person’s private data, or create false evidence. Messages, transaction records and submitted evidence may be preserved and made available to authorised participants, administrators, lawyers, regulators or courts where the workflow or law requires it.'),
        t('terms.communications.3', 'Typing, presence, delivery and read indicators are operational signals and may be delayed or inaccurate because of connectivity or device restrictions.'),
      ],
    },
    {
      id: 'acceptable-use',
      icon: FaLock,
      title: t('terms.acceptable_use.title', 'Acceptable use and prohibited conduct'),
      bullets: [
        t('terms.acceptable_use.1', 'Do not break the law, infringe rights, facilitate fraud, money laundering, unsafe housing or prohibited discrimination.'),
        t('terms.acceptable_use.2', 'Do not bypass platform fees, payment safeguards, verification, access controls, rate limits, app signing, or a suspension.'),
        t('terms.acceptable_use.3', 'Do not scrape, reverse engineer, probe, overload, automate abusive requests, introduce malicious code, or test security without written authorisation.'),
        t('terms.acceptable_use.4', 'Do not sell accounts, falsify reviews, impersonate RentalHub personnel, or use another person’s identity, bank account, documents or content without authority.'),
        t('terms.acceptable_use.5', 'Do not upload unlawful, deceptive, defamatory, obscene, dangerous or rights-infringing material.'),
      ],
    },
    {
      id: 'content',
      icon: FaFileContract,
      title: t('terms.content.title', 'Your content and RentalHub intellectual property'),
      body: [
        t('terms.content.1', 'You keep ownership of content you lawfully submit. You grant RentalHub a non-exclusive, worldwide, royalty-free licence to host, copy, format, display, transmit and moderate that content only as reasonably necessary to operate, secure, promote and improve the service and fulfil the transaction you requested. This licence ends when the content is deleted, except for lawful backups, evidence, disputes and records that must be retained.'),
        t('terms.content.2', 'RentalHub’s software, branding, designs, databases, text and other platform materials are protected by intellectual-property law. These Terms grant only a limited, revocable, non-transferable right to use the service for its intended purpose. They do not transfer ownership or permit use of RentalHub marks without written permission.'),
      ],
    },
    {
      id: 'third-parties',
      icon: FaMobileAlt,
      title: t('terms.third_parties.title', 'Third-party services and external links'),
      body: [
        t('terms.third_parties.1', 'Maps, payment processors, identity providers, communications services, cloud storage, analytics, app stores and external websites operate under their own terms and privacy practices. RentalHub is responsible for selecting and integrating providers with reasonable care, but is not responsible for an independent third party’s service outside RentalHub’s control.'),
        t('terms.third_parties.2', 'Downloading an Android package outside an app store may require your device to allow installation from the selected source. Install only the file linked from rentalhub.com.ng, review the version and signing information, and do not install a file received from an unknown person.'),
      ],
    },
    {
      id: 'availability',
      icon: FaMobileAlt,
      title: t('terms.availability.title', 'Availability, updates and changes to features'),
      body: [
        t('terms.availability.1', 'We aim to keep RentalHub reliable but do not promise uninterrupted availability. Maintenance, weak networks, provider outages, safety incidents, legal requirements or events beyond reasonable control may interrupt a feature.'),
        t('terms.availability.2', 'We may update the website or app to fix defects, improve security, meet legal requirements or change a feature. A mandatory security update may be required before continued use. Sideloaded Android installations normally require the user to approve installation of a new package; app-store behaviour is controlled by the store and device settings.'),
      ],
    },
    {
      id: 'suspension',
      icon: FaShieldAlt,
      title: t('terms.suspension.title', 'Moderation, suspension and termination'),
      body: [
        t('terms.suspension.1', 'We may remove content, pause a transaction, restrict a feature, suspend or terminate an account where reasonably necessary to address fraud, safety, legal obligations, non-payment, serious or repeated breaches, or risk to users or the platform. Where appropriate, we will give notice, a reason and an opportunity to correct or appeal.'),
        t('terms.suspension.2', 'You may stop using RentalHub and request account deletion through available settings or support. Deletion does not cancel a completed transaction, erase another person’s lawful record, or require deletion of information that must be retained for payments, tax, fraud, evidence, disputes, legal claims or regulatory duties.'),
      ],
    },
    {
      id: 'disclaimers',
      icon: FaExclamationTriangle,
      title: t('terms.disclaimers.title', 'Fair disclaimers and responsibility'),
      body: [
        t('terms.disclaimers.1', 'RentalHub provides the platform with reasonable care and skill. User-generated listings, advice and representations remain the responsibility of the person who supplied them. You should make proportionate checks before a property, payment or professional decision.'),
        t('terms.disclaimers.2', 'To the maximum extent permitted by law, RentalHub is not liable for indirect or consequential loss that was not reasonably foreseeable when you accepted these Terms, or for loss caused solely by a user or independent provider outside our reasonable control. RentalHub remains responsible where liability cannot lawfully be excluded, including applicable liability for fraud, wilful misconduct, death or personal injury caused by negligence, and non-excludable consumer rights.'),
        t('terms.disclaimers.3', 'Nothing in this section limits a payment or service remedy expressly offered in the applicable workflow. Any assessment of responsibility will take account of the nature of the service, the amount paid, the parties’ conduct and applicable law.'),
      ],
    },
    {
      id: 'disputes',
      icon: FaBalanceScale,
      title: t('terms.disputes.title', 'Complaints, disputes and governing law'),
      body: [
        t('terms.disputes.1', 'Please first use the relevant support, payment-recovery, appeal or dispute workflow so the record can be investigated. We may ask for transaction details and evidence and may facilitate communication, but we are not required to decide a private legal dispute unless the applicable service expressly assigns us that role.'),
        t('terms.disputes.2', 'These Terms are governed by the laws of the Federal Republic of Nigeria. The parties should attempt good-faith resolution before court proceedings. Nothing prevents either party from seeking urgent relief or using a regulator, consumer-protection body, court or other remedy available under applicable law.'),
      ],
    },
    {
      id: 'privacy',
      icon: FaLock,
      title: t('terms.privacy.title', 'Privacy and security'),
      body: [
        t('terms.privacy.1', 'The RentalHub Privacy Policy explains what personal data we collect, why we use it, who receives it, retention, safeguards and your rights. You must use personal data obtained through RentalHub only for the transaction and lawful purpose for which it was provided and must protect it from unauthorised access or disclosure.'),
        t('terms.privacy.2', 'Report a suspected account compromise, privacy incident or platform vulnerability promptly. Do not publicly disclose sensitive exploit details before RentalHub has had a reasonable opportunity to investigate and protect users.'),
      ],
    },
    {
      id: 'changes-contact',
      icon: FaEnvelope,
      title: t('terms.changes_contact.title', 'Changes, notices and contact'),
      body: [
        t('terms.changes_contact.1', 'We may revise these Terms when the product, law, risk or providers change. The current version will remain at this URL with its effective date. For a material change, we will provide notice appropriate to the impact before the change takes effect where reasonably possible. Continued use after the effective date means you accept the revised Terms; if you do not, you may stop using the service and close your account subject to outstanding obligations.'),
        t('terms.changes_contact.2', 'Questions, complaints and legal notices can be sent to support@rentalhub.com.ng or +234 803 060 1238. Do not include passwords, complete card details or unnecessary identity numbers in an ordinary email.'),
      ],
    },
  ];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <>
      <Helmet>
        <title>Terms of Service | RentalHub NG</title>
        <meta
          name="description"
          content="RentalHub NG Terms of Service for property, payment, verification, booking, professional, website and mobile-app services."
        />
        <link rel="canonical" href="https://rentalhub.com.ng/terms" />
      </Helmet>

      <div className="terms-document min-h-screen bg-slate-50 text-slate-900">
        <header className="terms-screen-hero relative isolate overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,.25),transparent_38%)]" />
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200/40 bg-amber-300 text-2xl text-slate-950 shadow-2xl">
              <FaFileContract aria-hidden="true" />
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.25em] text-amber-300">{t('terms.hero_tagline', 'Clear rules. Fair treatment.')}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{t('terms.title', 'Terms of Service')}</h1>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
              {t('terms.hero_sub', 'The agreement governing RentalHub’s property, verification, payment, booking, professional, website and mobile-app services.')}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm">
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 font-semibold">{t('terms.effective', 'Effective {date}', { date: LAST_UPDATED })}</span>
              <span className="rounded-full border border-amber-200/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-100">Website + Android + iOS</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-bold text-slate-950 transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-200/40"
              >
                <FaPrint aria-hidden="true" /> {t('terms.print_or_save', 'Print or save')}
              </button>
            </div>
          </div>
        </header>

        <div className="terms-print-header hidden">
          <p>RENTALHUB NG</p>
          <h1>{t('terms.title', 'Terms of Service')}</h1>
          <span>{t('terms.effective_last_updated', 'Effective and last updated {date} · rentalhub.com.ng/terms', { date: LAST_UPDATED })}</span>
        </div>

        <main className="terms-main mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="terms-notice mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            <FaExclamationTriangle className="mt-1 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              {t('terms.notice_prefix', 'Please read these Terms together with the')}{' '}
              <a className="font-bold underline" href="/privacy">{t('terms.notice_privacy', 'Privacy Policy')}</a>{' '}
              {t('terms.notice_suffix', 'and any price, cancellation or service condition shown before you confirm a transaction.')}
            </p>
          </div>

          <div className="terms-content-grid grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
            <aside className="terms-toc hidden lg:block">
              <nav aria-label="Terms of Service contents" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="px-3 pb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">{t('terms.on_this_page', 'On this page')}</p>
                <ol className="space-y-0.5">
                  {sections.map((section, index) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`} className="group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-primary-50 hover:text-primary-800">
                        <span className="w-5 text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                        <span className="flex-1">{section.title}</span>
                        <FaChevronRight className="text-[10px] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <div className="terms-section-stack min-w-0 space-y-7">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="terms-section" aria-labelledby={`${section.id}-title`}>
                  <div className="terms-section-heading">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-amber-300">
                      <section.icon aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary-600">
                        {String(index + 1).padStart(2, '0')} · {t('terms.title', 'Terms')}
                      </p>
                      <h2 id={`${section.id}-title`} className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                        {section.title}
                      </h2>
                    </div>
                  </div>
                  <div className="terms-section-body">
                    {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {section.bullets ? (
                      <ul className="space-y-3">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex items-start gap-3">
                            <FaCheckCircle className="mt-1 shrink-0 text-emerald-600" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}

              <section className="terms-contact rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-300 text-slate-950"><FaEnvelope /></div>
                  <div>
                    <h2 className="text-xl font-black">{t('terms.contact_heading', 'Need help understanding a transaction?')}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{t('terms.contact_sub', 'Contact RentalHub before sending sensitive identifiers or making a payment outside an approved workflow.')}</p>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
                      <a className="rounded-full bg-white px-4 py-2 text-slate-950" href="mailto:support@rentalhub.com.ng">support@rentalhub.com.ng</a>
                      <a className="rounded-full border border-white/20 px-4 py-2" href="tel:+2348030601238">+234 803 060 1238</a>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        .terms-section {
          scroll-margin-top: 7rem;
          overflow: hidden;
          border: 1px solid rgba(203, 213, 225, .8);
          border-radius: 1.5rem;
          background: white;
          box-shadow: 0 18px 55px -35px rgba(15, 23, 42, .45);
        }
        .terms-section-heading { display: flex; align-items: flex-start; gap: 1rem; border-bottom: 1px solid #f1f5f9; padding: 1.25rem 1.5rem; background: linear-gradient(90deg,#f8fafc,#fff); }
        .terms-section-body { display: grid; gap: 1rem; padding: 1.5rem; color: #334155; font-size: 1rem; line-height: 1.75; }
        @media print {
          @page { size: A4 portrait; margin: 15mm 14mm 17mm; }
          html, body, #root { background: #fff !important; }
          body { color: #111827 !important; font-family: Arial, Helvetica, sans-serif !important; }
          .terms-screen-hero, .terms-notice, .terms-toc, .terms-contact,
          .app-public-header, .app-language-switcher, .app-public-footer,
          .Toastify, [data-floating-widget] { display: none !important; }
          .terms-print-header { display: block !important; margin: 0 0 9mm; padding-bottom: 5mm; border-bottom: 2px solid #0f172a; }
          .terms-print-header p { margin: 0 0 2mm; font-size: 9pt; font-weight: 800; letter-spacing: .16em; }
          .terms-print-header h1 { margin: 0; font-size: 23pt; line-height: 1.1; }
          .terms-print-header span { display: block; margin-top: 2mm; color: #475569; font-size: 9pt; }
          .terms-main { max-width: none !important; padding: 0 !important; }
          .terms-content-grid, .terms-section-stack { display: block !important; }
          .terms-section { display: block !important; overflow: visible !important; margin: 0 0 7mm !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-inside: auto; page-break-inside: auto; }
          .terms-section-heading { padding: 3mm 0 2.5mm !important; border-bottom: 1px solid #cbd5e1 !important; background: #fff !important; break-after: avoid-page; page-break-after: avoid; }
          .terms-section-heading > div:first-child { display: none !important; }
          .terms-section-heading p { margin: 0; font-size: 8pt !important; }
          .terms-section-heading h2 { margin: 1mm 0 0 !important; font-size: 14pt !important; }
          .terms-section-body { display: block !important; padding: 3mm 0 0 !important; font-size: 9.5pt !important; line-height: 1.48 !important; }
          .terms-section-body p { margin: 0 0 3mm; orphans: 3; widows: 3; }
          .terms-section-body li { margin-bottom: 2mm; break-inside: avoid; page-break-inside: avoid; }
          h1, h2, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
          p, li { orphans: 3; widows: 3; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>
    </>
  );
};

export default Terms;
