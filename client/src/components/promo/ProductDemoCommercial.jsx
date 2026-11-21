import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  FaPlay,
  FaPause,
  FaRedo,
  FaVolumeUp,
  FaVolumeMute,
  FaExpand,
  FaCompress,
  FaSearch,
  FaMapMarkerAlt,
  FaShieldAlt,
  FaCheckCircle,
  FaFileContract,
  FaWallet,
  FaUserCheck,
  FaBed,
  FaBath,
  FaCalculator,
  FaLock,
  FaChevronLeft,
  FaChevronRight,
  FaArrowRight,
  FaBuilding,
  FaClipboardCheck,
} from 'react-icons/fa';

const BRAND = {
  navy: '#071A3D',
  navyElevated: '#0C244E',
  gold: '#C89B3C',
  goldSoft: '#E2C275',
  slateBorder: 'rgba(148, 163, 184, 0.22)',
};

const AUDIO_MODES = [
  { id: 'executive', label: 'Ambient Score' },
  { id: 'minimal', label: 'Soft Pulse' },
];

const SCENES = [
  {
    id: 0,
    duration: 7000,
    indexLabel: '01',
    route: '/properties',
    category: 'Property Discovery',
    title: 'Structured Search Across Nigeria',
    summary:
      'Filter rental listings by state, LGA, bedroom count, and annual budget—or submit a guided property request when sourcing specific accommodation.',
    highlights: [
      'State and LGA coverage across all 36 states and the FCT',
      'Structured rent, bedroom, and property-type filters',
      'Built-in tenant property request submission',
    ],
  },
  {
    id: 1,
    duration: 7500,
    indexLabel: '02',
    route: '/properties/1042',
    category: 'Listing Transparency',
    title: 'Clear Property Profiles & Verification Status',
    summary:
      'Inspect property specifications, landlord verification indicators, structured amenities, and move-in cost estimates before committing.',
    highlights: [
      'Visible listing and landlord verification indicators',
      'Integrated monthly and move-in rent calculator',
      'Structured property features and tenant review summaries',
    ],
  },
  {
    id: 2,
    duration: 7500,
    indexLabel: '03',
    route: '/verify-identity',
    category: 'Identity & Access',
    title: 'Identity-Verified Enquiries & Detail Unlock',
    summary:
      'Account identity verification helps establish accountable enquiries before unlocking full addresses, property videos, and direct landlord communication.',
    highlights: [
      'Account identity verification (NIN & live photo checks)',
      'Transparent platform unlock workflow via escrow checkout or bank transfer',
      'In-platform messaging and calling once access is unlocked',
    ],
  },
  {
    id: 3,
    duration: 7500,
    indexLabel: '04',
    route: '/dashboard',
    category: 'Payments & Ledger',
    title: 'Tracked Rent Payments & Wallet Clearing',
    summary:
      'Monitor escrow-tracked rent payments and bank-transfer transactions through an auditable wallet ledger with a structured 14-working-day escrow clearing window before landlord withdrawal.',
    highlights: [
      'Pending-clearing and cleared balance separation',
      '14-working-day clearing period for refund review eligibility',
      'Dedicated payment history, receipts, and wallet controls',
    ],
  },
  {
    id: 4,
    duration: 7500,
    indexLabel: '05',
    route: '/tenancy-agreements',
    category: 'Tenancy Documentation',
    title: 'Versioned Digital Tenancy Agreements',
    summary:
      'Track agreements from draft through landlord and tenant review, with timestamped signature events, revision history, and cryptographic document hashing.',
    highlights: [
      'Structured Draft → Review → Executed status lifecycle',
      'SHA-256 document hash and immutable signature event log',
      'Jurisdiction metadata and amendment version tracking',
    ],
  },
  {
    id: 5,
    duration: 7500,
    indexLabel: '06',
    route: '/property-protection',
    category: 'Protection & Support',
    title: 'Property Protection & Multi-Role Oversight',
    summary:
      'Register basic property records or report cases at no cost, request optional priced verification services where available, and verify dispute evidence on-platform.',
    highlights: [
      'Free basic property record registration and case reporting',
      'Optional priced registry, survey, and inspection services where available',
      'Public dispute evidence verification and dedicated role dashboards',
    ],
  },
];

const TOTAL_DURATION = SCENES.reduce((acc, s) => acc + s.duration, 0);

// Restrained corporate WebAudio synthesizer (silent until unmuted & playing)
function createCorporateAudioEngine() {
  let ctx = null;
  let masterGain = null;
  let intervalId = null;
  let step = 0;

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (masterGain && ctx) {
      try {
        masterGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      } catch {
        // Ignore audio context teardown error
      }
    }
  };

  const start = (mode = 'executive') => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!ctx) {
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.0001;
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      stop();
      masterGain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.25);

      const chords =
        mode === 'minimal'
          ? [
              [220.0, 261.63, 329.63],
              [196.0, 246.94, 293.66],
              [174.61, 220.0, 261.63],
              [196.0, 246.94, 329.63],
            ]
          : [
              [261.63, 329.63, 392.0, 493.88],
              [220.0, 261.63, 329.63, 392.0],
              [174.61, 220.0, 261.63, 329.63],
              [196.0, 246.94, 293.66, 392.0],
            ];

      const playChord = () => {
        if (!ctx || !masterGain) return;
        const now = ctx.currentTime;
        const freqs = chords[step % chords.length];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          osc.type = idx === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now);
          noteGain.gain.setValueAtTime(0.0001, now);
          noteGain.gain.linearRampToValueAtTime(0.18 / freqs.length, now + 0.35);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
          osc.connect(noteGain);
          noteGain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 2.3);
        });
        step += 1;
      };

      playChord();
      intervalId = setInterval(playChord, 2400);
    } catch {
      // Audio playback blocked or unavailable
    }
  };

  const destroy = () => {
    stop();
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
    ctx = null;
    masterGain = null;
  };

  return { start, stop, destroy };
}

function AuthenticScreenView({ sceneId }) {
  if (sceneId === 0) {
    return (
      <div className="space-y-4">
        {/* Search Bar modelled on Properties.jsx */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              <FaSearch className="shrink-0 text-slate-400" size={13} aria-hidden="true" />
              <span className="truncate font-medium">Maitama, Abuja FCT · 3 Bedroom</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600">
                36 States + FCT
              </span>
              <span className="rounded-lg bg-[#071A3D] px-3.5 py-2 text-xs font-semibold text-white">
                Search
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            <span className="font-medium text-slate-900">Filters:</span>
            <span>State: Abuja FCT</span>
            <span className="text-slate-300">|</span>
            <span>Type: Apartment / Terrace</span>
            <span className="text-slate-300">|</span>
            <span>Status: Available</span>
          </div>
        </div>

        {/* Authentic Listing Results Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="relative h-32 w-full bg-slate-100">
              <img
                src="/hero-main.avif"
                alt="Illustrative residential terrace in Maitama, Abuja"
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2.5 top-2.5 rounded bg-[#071A3D]/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                Verified Listing
              </span>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-slate-900">3 Bedroom Residence</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <FaMapMarkerAlt size={10} className="text-slate-400" aria-hidden="true" />
                Maitama, Abuja FCT
              </p>
              <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-100 pt-2">
                <span className="text-sm font-bold tabular-nums text-[#071A3D]">₦4,500,000</span>
                <span className="text-[11px] text-slate-500">per year</span>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="relative h-32 w-full bg-slate-100">
              <img
                src="/login-terrace.avif"
                alt="Illustrative duplex property in Nasarawa GRA, Kano"
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2.5 top-2.5 rounded bg-[#071A3D]/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                Verified Listing
              </span>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-slate-900">4 Bedroom Terrace</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <FaMapMarkerAlt size={10} className="text-slate-400" aria-hidden="true" />
                Nasarawa GRA, Kano
              </p>
              <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-100 pt-2">
                <span className="text-sm font-bold tabular-nums text-[#071A3D]">₦3,200,000</span>
                <span className="text-[11px] text-slate-500">per year</span>
              </div>
            </div>
          </article>
        </div>

        {/* Property Request strip matching real Properties.jsx */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
          <span className="text-slate-600">
            Can&apos;t find a specific location? Submit a tenant property request for support review.
          </span>
          <span className="shrink-0 font-semibold text-[#0284C7]">Request Form →</span>
        </div>
      </div>
    );
  }

  if (sceneId === 1) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-40 w-full bg-slate-100">
            <img
              src="/hero-main.avif"
              alt="Illustrative residential property detail view"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/30 to-transparent p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">3 Bedroom Serviced Residence</p>
                  <p className="text-xs text-slate-200">Maitama District, Abuja FCT</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#071A3D]">
                  <FaCheckCircle className="text-emerald-600" size={11} aria-hidden="true" />
                  Landlord Verified
                </span>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-xl font-bold tabular-nums text-[#071A3D]">₦4,500,000</p>
                <p className="text-xs text-slate-500">Annual rent · illustrative example</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
                <FaCalculator size={11} aria-hidden="true" />
                What&apos;s this per month &amp; move-in?
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-3 text-center">
              <div>
                <FaBed className="mx-auto text-slate-400" size={14} aria-hidden="true" />
                <p className="mt-1 text-xs font-semibold text-slate-900">3 Bedrooms</p>
              </div>
              <div>
                <FaBath className="mx-auto text-slate-400" size={14} aria-hidden="true" />
                <p className="mt-1 text-xs font-semibold text-slate-900">4 Bathrooms</p>
              </div>
              <div>
                <FaBuilding className="mx-auto text-slate-400" size={14} aria-hidden="true" />
                <p className="mt-1 text-xs font-semibold text-slate-900">Gated Compound</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                <FaCheckCircle className="shrink-0 text-emerald-600" size={11} aria-hidden="true" />
                <span>Structured landlord features</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                <FaCheckCircle className="shrink-0 text-emerald-600" size={11} aria-hidden="true" />
                <span>Photo &amp; video media support</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sceneId === 2) {
    return (
      <div className="space-y-3.5">
        {/* Identity Verification card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#071A3D] text-white">
                <FaUserCheck size={15} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Account Identity Verification</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Tenants verify identity before unlocking full property details or initiating payments.
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
              Verified
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-slate-700">
              <span className="block text-[10px] uppercase tracking-wider text-slate-400">Step 1</span>
              <span className="font-medium text-slate-900">Email &amp; Phone Check</span>
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-slate-700">
              <span className="block text-[10px] uppercase tracking-wider text-slate-400">Step 2</span>
              <span className="font-medium text-slate-900">NIN &amp; Live Photo</span>
            </div>
            <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-slate-700">
              <span className="block text-[10px] uppercase tracking-wider text-slate-400">Step 3</span>
              <span className="font-medium text-slate-900">Enquiry &amp; Unlock</span>
            </div>
          </div>
        </div>

        {/* Property Unlock workflow matching PropertyDetail.jsx */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
          <div className="flex items-start gap-3">
            <FaLock className="mt-0.5 shrink-0 text-[#9A7221]" size={14} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Unlock Full Property Details</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                Complete the one-time property unlock or active tenant subscription via escrow checkout or bank transfer to reveal full address, inspection video, and direct landlord contact.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#071A3D] px-3 py-1.5 text-xs font-semibold text-white">
                  Pay to Unlock Details
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                  In-Platform Messaging &amp; Calling
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sceneId === 3) {
    return (
      <div className="space-y-3.5">
        {/* Wallet Ledger overview matching walletLedgerService.js & Dashboard.jsx */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#071A3D] text-white">
                <FaWallet size={13} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Wallet &amp; Rent Ledger</p>
                <p className="text-[11px] text-slate-500">Illustrative dashboard balance view</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Escrow &amp; Bank Transfer</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Pending Escrow Clearing
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[#071A3D]">₦4,387,500</p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                14-working-day clearing window for refund review
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Cleared Balance
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">₦1,850,000</p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Available for verified bank withdrawal
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">Rent Payment · Reference #RH-40219</span>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                Pending Escrow Clearing
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">Property Unlock · Escrow Recorded</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                Recorded
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sceneId === 4) {
    return (
      <div className="space-y-3.5">
        {/* Tenancy Agreement Lifecycle matching tenancyAgreementService.js */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#071A3D] text-white">
                <FaFileContract size={13} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Residential Tenancy Agreement · v1</p>
                <p className="text-[11px] text-slate-500">Versioned digital review &amp; signature trail</p>
              </div>
            </div>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
              Fully Executed
            </span>
          </div>

          <ol className="mt-3.5 space-y-2.5 text-xs">
            {[
              { step: 'Draft Prepared', meta: 'Property terms & jurisdiction metadata attached', done: true },
              { step: 'Landlord Review & Signature', meta: 'Consent recorded with timestamp & signature event ID', done: true },
              { step: 'Tenant Review & Signature', meta: 'Authenticated acceptance locked to Version 1', done: true },
            ].map((item) => (
              <li key={item.step} className="flex items-start gap-2.5">
                <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-600" size={12} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-900">{item.step}</p>
                  <p className="text-slate-500">{item.meta}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
            Document Hash (SHA-256): 8f4c…e91a · Audit log immutable
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Property Protection & Ecosystem matching PropertyProtection.jsx */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#071A3D] text-white">
            <FaShieldAlt size={13} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Amana Property Protection &amp; Oversight</p>
            <p className="text-[11px] text-slate-500">Property records, case reporting &amp; dispute verification</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Basic Property Records</p>
            <p className="mt-1 text-slate-600">
              Free basic property registration and case reporting, including unlisted land and family or company capacity.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Optional Paid Services</p>
            <p className="mt-1 text-slate-600">
              Registry searches, survey reports, and physical inspections available where defined and priced.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#071A3D] px-3.5 py-2.5 text-xs text-white">
          <span className="flex items-center gap-2 font-medium">
            <FaClipboardCheck className="text-[#E2C275]" size={13} aria-hidden="true" />
            Verify Dispute Evidence · /verify-case
          </span>
          <span className="text-[11px] text-slate-300">Role-based dashboards · 8 languages</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          to="/properties"
          className="inline-flex items-center gap-2 rounded-lg bg-[#071A3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0C244E]"
        >
          Browse Properties <FaArrowRight size={10} aria-hidden="true" />
        </Link>
        <Link
          to="/property-protection"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
        >
          Explore Property Protection
        </Link>
      </div>
    </div>
  );
}

export default function ProductDemoCommercial() {
  const prefersReducedMotion = useReducedMotion();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(() => !prefersReducedMotion);
  const [isMuted, setIsMuted] = useState(true);
  const [audioMode, setAudioMode] = useState('executive');
  const [elapsedInScene, setElapsedInScene] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const audioRef = useRef(null);

  const currentScene = SCENES[sceneIndex];

  useEffect(() => {
    audioRef.current = createCorporateAudioEngine();
    return () => {
      audioRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsPlaying(false);
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (isPlaying && !isMuted) {
      audioRef.current?.start(audioMode);
    } else {
      audioRef.current?.stop();
    }
  }, [isPlaying, isMuted, audioMode]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    const tickMs = 100;
    const timer = window.setInterval(() => {
      setElapsedInScene((prev) => {
        const next = prev + tickMs;
        if (next >= currentScene.duration) {
          setSceneIndex((idx) => (idx + 1) % SCENES.length);
          return 0;
        }
        return next;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, currentScene.duration]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectScene = useCallback((index) => {
    const bounded = (index + SCENES.length) % SCENES.length;
    setSceneIndex(bounded);
    setElapsedInScene(0);
  }, []);

  const handleRestart = useCallback(() => {
    setSceneIndex(0);
    setElapsedInScene(0);
    setIsPlaying(true);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const elapsedTotal =
    SCENES.slice(0, sceneIndex).reduce((sum, s) => sum + s.duration, 0) + elapsedInScene;
  const totalProgressPct = Math.min(100, (elapsedTotal / TOTAL_DURATION) * 100);

  const handleScrub = (e) => {
    const targetMs = (parseFloat(e.target.value) / 100) * TOTAL_DURATION;
    let accum = 0;
    for (let i = 0; i < SCENES.length; i += 1) {
      if (targetMs <= accum + SCENES[i].duration || i === SCENES.length - 1) {
        setSceneIndex(i);
        setElapsedInScene(Math.max(0, targetMs - accum));
        break;
      }
      accum += SCENES[i].duration;
    }
  };

  const motionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] };

  return (
    <section
      ref={containerRef}
      aria-label="Amana RentalHub interactive product walkthrough"
      className="w-full overflow-hidden rounded-2xl border bg-[#071A3D] text-white shadow-xl"
      style={{ borderColor: BRAND.slateBorder }}
    >
      {/* Top Executive Brand Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <img
            src="/rentalhub-mark.svg"
            alt="Amana RentalHub NG"
            className="h-8 w-8 rounded-lg border border-white/15 bg-white/5 p-0.5"
          />
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: BRAND.goldSoft }}
            >
              Amana RentalHub NG · Interactive Walkthrough
            </p>
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Platform Architecture &amp; Core Workflows
            </h2>
          </div>
        </div>

        {/* Playback & Audio Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#C89B3C]"
          >
            {isPlaying ? <FaPause size={11} aria-hidden="true" /> : <FaPlay size={11} aria-hidden="true" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart walkthrough"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C89B3C]"
            title="Restart"
          >
            <FaRedo size={12} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? 'Enable ambient audio' : 'Mute ambient audio'}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C89B3C]"
          >
            {isMuted ? <FaVolumeMute size={12} aria-hidden="true" /> : <FaVolumeUp size={12} aria-hidden="true" />}
            <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Audio On'}</span>
          </button>

          {!isMuted && (
            <select
              aria-label="Audio score style"
              value={audioMode}
              onChange={(e) => setAudioMode(e.target.value)}
              className="h-9 rounded-lg border border-white/15 bg-[#0C244E] px-2.5 text-xs font-medium text-slate-200 focus:border-[#C89B3C] focus:outline-none"
            >
              {AUDIO_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C89B3C]"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <FaCompress size={12} aria-hidden="true" /> : <FaExpand size={12} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Main Two-Column Executive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Editorial Column */}
        <div className="flex flex-col justify-between border-b border-white/10 p-5 sm:p-7 lg:col-span-5 lg:border-b-0 lg:border-r">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-semibold uppercase tracking-[0.14em]"
                style={{ color: BRAND.goldSoft }}
              >
                {currentScene.indexLabel} / 0{SCENES.length} · {currentScene.category}
              </span>
              <span className="font-mono text-[11px] text-slate-400">{currentScene.route}</span>
            </div>

            <div className="mt-2 h-0.5 w-12" style={{ backgroundColor: BRAND.gold }} />

            <AnimatePresence mode="wait">
              <motion.div
                key={currentScene.id}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={motionTransition}
                className="mt-4"
              >
                <h3 className="text-2xl font-semibold leading-snug tracking-tight text-white">
                  {currentScene.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {currentScene.summary}
                </p>

                <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-4">
                  {currentScene.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-xs leading-5 text-slate-200">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: BRAND.gold }}
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Step Prev / Next & Chapter List */}
          <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
              {SCENES.map((scene, idx) => {
                const active = idx === sceneIndex;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => selectScene(idx)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#C89B3C] ${
                      active
                        ? 'border-[#C89B3C]/70 bg-white/10 font-semibold text-white'
                        : 'border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: active ? BRAND.goldSoft : '#94A3B8' }}
                    >
                      {scene.indexLabel}
                    </span>
                    <span className="truncate">{scene.category}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => selectScene(sceneIndex - 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <FaChevronLeft size={10} aria-hidden="true" /> Previous
              </button>
              <button
                type="button"
                onClick={() => selectScene(sceneIndex + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Next <FaChevronRight size={10} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Application Viewport Stage */}
        <div className="bg-[#0B224C] p-5 sm:p-7 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-200/20 bg-slate-50 text-slate-900 shadow-lg">
            {/* Clean Application Window Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src="/rentalhub-mark.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5 rounded"
                />
                <span className="truncate font-mono text-xs text-slate-600">
                  rentalhub.com.ng{currentScene.route}
                </span>
              </div>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Illustrative preview · not a live transaction
              </span>
            </div>

            {/* Authentic Interface Canvas */}
            <div className="min-h-[370px] p-4 sm:p-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentScene.id}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={motionTransition}
                >
                  <AuthenticScreenView sceneId={currentScene.id} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Scrubber Bar */}
      <div className="border-t border-white/10 bg-[#051430] px-5 py-3 sm:px-7">
        <div className="flex items-center gap-4">
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-300">
            0:{String(Math.floor(elapsedTotal / 1000)).padStart(2, '0')} / 0:
            {String(Math.floor(TOTAL_DURATION / 1000)).padStart(2, '0')}
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="0.5"
            value={totalProgressPct}
            onChange={handleScrub}
            aria-label="Walkthrough timeline progress"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#C89B3C]"
          />
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            Interactive presentation · real platform workflows
          </span>
        </div>
      </div>
    </section>
  );
}
