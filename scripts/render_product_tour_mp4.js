/**
 * Amana RentalHub NG — Multi-Edition PropTech Commercial Suite Renderer
 *
 * Renders 4 visually distinct corporate commercial editions in BOTH 9:16 vertical
 * (1080x1920) and 16:9 widescreen (1280x720) @ 24fps cinematic H.264 High + AAC Stereo:
 *
 *   - flagship   : Executive Corporate Navy Banner & Gold Lower-Third (6 acts)
 *   - tenant     : Daylight Architectural Split-Canvas Editorial Magazine (5 acts)
 *   - landlord   : Obsidian Navy Institutional Command Showcase (5 acts)
 *   - protection : Deep Forest-Navy Property Registry Dossier (5 acts)
 *
 * Audio engineering:
 *   - Curated preset corporate soundtrack per edition
 *   - Rich audible bed (0.38 base), smooth 2.2s fade-in and 2.8s fade-out
 *   - 650ms narration entrance delay + FFmpeg sidechaincompress ducking under voiceover
 *
 * Usage:
 *   node scripts/render_product_tour_mp4.js --clip=flagship
 *   node scripts/render_product_tour_mp4.js --clip=tenant --regen-vo
 *   node scripts/render_product_tour_mp4.js --clip=landlord --vertical-only
 *   node scripts/render_product_tour_mp4.js --clip=protection --landscape-only
 *   node scripts/render_product_tour_mp4.js --clip=all --resume
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');
const { getCommercialNarration } = require('../services/commercialNarrationService');

const ROOT_DIR = path.join(__dirname, '..');
const PROMO_DIR = path.join(ROOT_DIR, 'client', 'public', 'promo-videos');
const BUILD_PROMO_DIR = path.join(ROOT_DIR, 'client', 'build', 'promo-videos');
const ASSETS_DIR = path.join(ROOT_DIR, 'social-ads', 'assets');
const MUSIC_DIR = path.join(
  ROOT_DIR,
  'Video-Presets_290_Royalty_Free_Background_Music_Tracks',
  'Mp3',
  'Business & Corporate'
);
const TMP_DIR = path.join(require('os').tmpdir(), 'amana_commercial_suite');



const FPS = 24;
const XFADE_SEC = 0.45;

const BRAND = {
  navy: '#071A3D',
  navyDark: '#041129',
  navyCard: '#0B224C',
  obsidian: '#060D1E',
  obsidianCard: '#0E1A35',
  forest: '#062022',
  forestDark: '#041416',
  forestCard: '#0C2D30',
  ivory: '#F8F6F1',
  ivoryBorder: '#E5DFD3',
  gold: '#C89B3C',
  goldSoft: '#E2C275',
  emerald: '#059669',
  emeraldSoft: '#34D399',
  white: '#FFFFFF',
  slateDark: '#1E293B',
  slateText: '#334155',
  slateMuted: '#64748B',
  slateLight: '#CBD5E1',
};

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const EDITIONS = {
  flagship: {
    id: 'flagship',
    layout: 'flagship_banner',
    verticalFile: 'amana-app-tour-commercial.mp4',
    landscapeFile: 'amana-app-tour-landscape.mp4',
    musicTrack: 'Corporate Inspiring.mp3',
    narration:
      'Finding a reliable home in Nigeria deserves structure, clarity, and accountability. ' +
      'Welcome to Amana RentalHub N G. ' +
      'Search residential listings across all thirty-six states and the F C T using structured location and budget filters. ' +
      'Inspect clear property specifications, verification indicators, and estimated move-in costs upfront. ' +
      'Complete identity verification to initiate accountable enquiries and transparent detail unlocks. ' +
      'Track rent payments through escrow clearing and bank transfers with a fourteen-working-day escrow clearing window and auditable wallet ledger. ' +
      'Finalize versioned digital tenancy agreements and access Amana Property Protection records in one unified platform. ' +
      'Discover structured Nigerian property rentals at rentalhub dot com dot n g.',
    scenes: [
      {
        index: '01',
        kicker: 'PROPERTY DISCOVERY',
        headline1: 'Structured Property Search',
        headline2: 'Across 36 States & the FCT',
        caption: 'Filter listings by state, LGA, bedrooms, and annual budget.',
        route: 'rentalhub.com.ng/properties',
        photo: 'hero-terrace.avif',
        zoomMode: 'in',
        uiType: 'flagship_search',
        bullets: [
          'Nationwide coverage across all 36 states and Abuja FCT',
          'Structured filters for state, LGA, property type, and budget',
          'Built-in tenant property request workflow',
        ],
      },
      {
        index: '02',
        kicker: 'LISTING TRANSPARENCY',
        headline1: 'Clear Property Profiles',
        headline2: 'Before You Commit',
        caption: 'Review specs, verification status, and move-in estimates.',
        route: 'rentalhub.com.ng/properties/1042',
        photo: 'photo-1761347604157-3d667ff62778.avif',
        zoomMode: 'out',
        uiType: 'flagship_detail',
        bullets: [
          'Visible listing and landlord verification indicators',
          'Integrated monthly and move-in rent calculator',
          'Structured property features and media previews',
        ],
      },
      {
        index: '03',
        kicker: 'IDENTITY & ACCESS',
        headline1: 'Identity-Verified Enquiries',
        headline2: 'Transparent Detail Unlock',
        caption: 'Account verification supports accountable enquiries & access.',
        route: 'rentalhub.com.ng/verify-identity',
        photo: 'photo-1778166166324-550d324133ea.avif',
        zoomMode: 'in',
        uiType: 'flagship_identity',
        bullets: [
          'Account verification with NIN and live photo checks',
          'Transparent escrow checkout or bank-transfer unlock flow',
          'In-platform messaging and calling after unlock',
        ],
      },
      {
        index: '04',
        kicker: 'ESCROW & LEDGER',
        headline1: 'Escrow-Tracked Payments',
        headline2: '14-Working-Day Clearing',
        caption: 'Auditable wallet ledger separating pending and cleared rent.',
        route: 'rentalhub.com.ng/dashboard',
        photo: 'photo-1746458258536-b9ee5db20a73.avif',
        zoomMode: 'out',
        uiType: 'flagship_escrow',
        bullets: [
          'Pending escrow clearing and cleared balance separation',
          '14-working-day clearing window before landlord withdrawal',
          'Structured receipts and transaction audit history',
        ],
      },
      {
        index: '05',
        kicker: 'AGREEMENTS & PROTECTION',
        headline1: 'Digital Tenancy Leases',
        headline2: '& Property Protection',
        caption: 'Versioned digital agreements alongside property record tools.',
        route: 'rentalhub.com.ng/tenancy-agreements',
        photo: 'photo-1707043697463-e0d8f81d06f3.avif',
        zoomMode: 'in',
        uiType: 'flagship_agreements',
        bullets: [
          'Versioned lease review, signing, and SHA-256 document hash',
          'Free basic Property Protection records and case reporting',
          'Optional priced registry, survey, and inspection workflows',
        ],
      },
      {
        index: '06',
        kicker: 'AMANA RENTALHUB NG',
        headline1: 'Structured Rentals',
        headline2: 'Built for Nigeria',
        caption: 'Explore verified workflows today at rentalhub.com.ng.',
        route: 'rentalhub.com.ng',
        photo: 'photo-1760067537204-fe9b55b2f1b0.avif',
        zoomMode: 'out',
        uiType: 'flagship_finale',
        bullets: [
          'Built for tenants, landlords, accredited agents, and partners',
          'Escrow-tracked rent clearing & transparent workflows',
          'Visit rentalhub.com.ng to get started',
        ],
      },
    ],
  },

  tenant: {
    id: 'tenant',
    layout: 'tenant_magazine',
    verticalFile: 'amana-tenant-commercial-9x16.mp4',
    landscapeFile: 'amana-tenant-commercial-16x9.mp4',
    musicTrack: 'Acoustic Corporate.mp3',
    narration:
      'Searching for a home in Nigeria should feel transparent from the very first click. ' +
      'With Amana RentalHub N G, filter residential properties across all thirty-six states and Abuja by city, budget, and verification status. ' +
      'Review room specs, inspection media availability, and annual move-in estimates clearly before booking. ' +
      'Complete identity verification to unlock exact addresses and message landlords directly inside the platform. ' +
      'Pay rent through escrow-tracked clearing with a fourteen-working-day clearing window for refund review eligibility, then sign your versioned digital tenancy agreement online. ' +
      'Start your next home search at rentalhub dot com dot n g.',
    scenes: [
      {
        index: '01',
        kicker: 'TENANT EDITION · SEARCH',
        headline1: 'Find the Right Home',
        headline2: 'With Real Filters',
        caption: 'Compare homes across 36 states & FCT by budget and specs.',
        route: 'rentalhub.com.ng/properties',
        photo: 'photo-1622015663084-307d19eabbbf.avif',
        zoomMode: 'in',
        uiType: 'flagship_search',
        bullets: [
          'Search verified residential listings across Nigeria',
          'Filter by state, LGA, bedrooms, and annual rent',
          'Submit a structured property request if you need a match',
        ],
      },
      {
        index: '02',
        kicker: 'TENANT EDITION · PLANNING',
        headline1: 'Transparent Specs &',
        headline2: 'Move-In Calculator',
        caption: 'Review annual rent, fees, and property verification badges.',
        route: 'rentalhub.com.ng/properties/1042',
        photo: 'photo-1595243643203-06ba168495ea.avif',
        zoomMode: 'out',
        uiType: 'flagship_detail',
        bullets: [
          'Clear listing and landlord verification status indicators',
          'Built-in rent calculator for realistic budgeting',
          'Inspection media previews before travelling to view',
        ],
      },
      {
        index: '03',
        kicker: 'TENANT EDITION · ACCESS',
        headline1: 'Identity Checked,',
        headline2: 'Direct Communication',
        caption: 'Verify your account and unlock full addresses safely.',
        route: 'rentalhub.com.ng/verify-identity',
        photo: 'photo-1704457031803-2c39a23e9faa.avif',
        zoomMode: 'in',
        uiType: 'flagship_identity',
        bullets: [
          'NIN and live photo verification for accountable enquiries',
          'Clear one-time unlock or tenant plan via escrow checkout',
          'Direct in-platform messaging and recorded calling',
        ],
      },
      {
        index: '04',
        kicker: 'TENANT EDITION · ESCROW',
        headline1: 'Escrow Rent Clearing',
        headline2: '14-Working-Day Window',
        caption: 'Rent enters escrow clearing with refund review eligibility.',
        route: 'rentalhub.com.ng/dashboard',
        photo: 'premium_photo-1724659216000-5d5557f23318.avif',
        zoomMode: 'out',
        uiType: 'flagship_escrow',
        bullets: [
          'Track escrow payments and bank transfers with receipts',
          '14-working-day clearing window before landlord withdrawal',
          'Structured dispute and refund review support if needed',
        ],
      },
      {
        index: '05',
        kicker: 'TENANT EDITION · AGREEMENTS',
        headline1: 'Sign Digitally &',
        headline2: 'Move In With Clarity',
        caption: 'Versioned digital tenancy agreements at rentalhub.com.ng.',
        route: 'rentalhub.com.ng/tenancy-agreements',
        photo: 'premium_photo-1747326386378-e8325dd4b981.avif',
        zoomMode: 'in',
        uiType: 'tenant_finale',
        bullets: [
          'Review and execute versioned leases with timestamped logs',
          'Access optional relocation and fumigation booking tools',
          'Explore homes today at rentalhub.com.ng',
        ],
      },
    ],
  },

  landlord: {
    id: 'landlord',
    layout: 'landlord_command',
    verticalFile: 'amana-landlord-commercial-9x16.mp4',
    landscapeFile: 'amana-landlord-commercial-16x9.mp4',
    musicTrack: 'An Inspiring Corporate.mp3',
    narration:
      'Professional landlords and accredited agents need dependable property operations. ' +
      'Amana RentalHub N G gives you a structured portfolio workspace from listing to lease execution. ' +
      'Publish detailed residential listings with verification indicators and receive identity-checked tenant enquiries. ' +
      'Delegate specific operational permissions to accredited agents while keeping full owner visibility. ' +
      'Monitor escrow rent clearing, cleared balances, and verified bank withdrawals in one auditable ledger, backed by versioned digital tenancy agreements. ' +
      'Manage your portfolio at rentalhub dot com dot n g.',
    scenes: [
      {
        index: '01',
        kicker: 'LANDLORD & AGENT EDITION',
        headline1: 'Present Properties',
        headline2: 'With Institutional Polish',
        caption: 'Publish structured specs, media, and verified owner profiles.',
        route: 'rentalhub.com.ng/dashboard',
        photo: 'photo-1782392230060-be8a3984a58c.avif',
        zoomMode: 'in',
        uiType: 'landlord_portfolio',
        bullets: [
          'Structured multi-property listing and availability controls',
          'Highlight verified landlord status and structured amenities',
          'Track applications and enquiries in one portfolio view',
        ],
      },
      {
        index: '02',
        kicker: 'VERIFIED ENQUIRIES',
        headline1: 'Screen Enquiries',
        headline2: 'Before Opening Access',
        caption: 'Tenants complete identity checks before unlocking contact.',
        route: 'rentalhub.com.ng/messages',
        photo: 'photo-1719887805632-de5be825f72b.avif',
        zoomMode: 'out',
        uiType: 'landlord_enquiries',
        bullets: [
          'Identity-verified tenant enquiries reduce unvetted noise',
          'Full addresses stay protected until access is unlocked',
          'Communicate cleanly through recorded in-platform threads',
        ],
      },
      {
        index: '03',
        kicker: 'AGENT DELEGATION',
        headline1: 'Accredited Agents',
        headline2: 'Scoped Permissions',
        caption: 'Delegate property tasks while retaining owner oversight.',
        route: 'rentalhub.com.ng/agent/dashboard',
        photo: 'photo-1776762893034-c437e452f1be.avif',
        zoomMode: 'in',
        uiType: 'landlord_delegation',
        bullets: [
          'Assign accredited agents with explicit permission scopes',
          'Separate controls for listings, inspections, and dossiers',
          'Audit every update under your landlord dashboard',
        ],
      },
      {
        index: '04',
        kicker: 'ESCROW & WITHDRAWALS',
        headline1: 'Auditable Rent Ledger',
        headline2: 'Verified Bank Payouts',
        caption: 'Track 14-working-day escrow clearing to cleared withdrawals.',
        route: 'rentalhub.com.ng/dashboard',
        photo: 'premium_photo-1748265769172-62e9e2bba756.avif',
        zoomMode: 'out',
        uiType: 'flagship_escrow',
        bullets: [
          'Clear separation of pending escrow and cleared funds',
          'Transparent 14-working-day clearing schedule',
          'Initiate bank withdrawals directly from cleared balance',
        ],
      },
      {
        index: '05',
        kicker: 'PORTFOLIO GOVERNANCE',
        headline1: 'Digital Leases & Oversight',
        headline2: 'Built for Property Owners',
        caption: 'Versioned tenancy agreements & owner tools at rentalhub.com.ng.',
        route: 'rentalhub.com.ng',
        photo: 'photo-1767894862472-99a8667aaad0.avif',
        zoomMode: 'in',
        uiType: 'landlord_finale',
        bullets: [
          'Issue versioned agreements with SHA-256 integrity records',
          'Centralized activity log across applications and payouts',
          'List your properties at rentalhub.com.ng',
        ],
      },
    ],
  },

  protection: {
    id: 'protection',
    layout: 'protection_dossier',
    verticalFile: 'amana-protection-commercial-9x16.mp4',
    landscapeFile: 'amana-protection-commercial-16x9.mp4',
    musicTrack: 'Corporate strings.mp3',
    narration:
      'Property ownership and tenancy disputes require clear documentation, not guesswork. ' +
      'Introducing Amana Property Protection. ' +
      'Create basic property records and submit basic case reports at no cost, including unlisted land and family or company holdings. ' +
      'Where defined and available, request optional priced registry searches, survey reports, and physical inspections. ' +
      'Preserve structured dispute records and verify case evidence publicly through our verification portal. ' +
      'Explore Amana Property Protection at rentalhub dot com dot n g.',
    scenes: [
      {
        index: '01',
        kicker: 'AMANA PROPERTY PROTECTION',
        headline1: 'Document Your Property',
        headline2: 'With Structured Records',
        caption: 'Free basic property records and case reporting on-platform.',
        route: 'rentalhub.com.ng/property-protection',
        photo: 'photo-1777516027356-d43488256f2b.avif',
        zoomMode: 'in',
        uiType: 'protection_records',
        bullets: [
          'Register basic property records at zero cost',
          'Maintain structured documentation in one vault',
          'Clear disclosure: platform checks do not replace land registries',
        ],
      },
      {
        index: '02',
        kicker: 'BROAD COVERAGE CAPACITY',
        headline1: 'Unlisted Land, Family',
        headline2: '& Corporate Holdings',
        caption: 'Record individual, family, or company-held properties.',
        route: 'rentalhub.com.ng/property-protection',
        photo: 'premium_photo-1748283985954-c611c2b25b3e.avif',
        zoomMode: 'out',
        uiType: 'protection_capacity',
        bullets: [
          'Supports unlisted land as well as rental buildings',
          'Register under individual, family, or company capacity',
          'Designed for resident owners and diaspora stakeholders',
        ],
      },
      {
        index: '03',
        kicker: 'OPTIONAL PAID SERVICES',
        headline1: 'Registry, Survey &',
        headline2: 'Inspection Workflows',
        caption: 'Request priced verification services where available.',
        route: 'rentalhub.com.ng/property-protection',
        photo: 'premium_photo-1748729621216-573f9867e6ab.avif',
        zoomMode: 'in',
        uiType: 'protection_services',
        bullets: [
          'Optional priced registry searches and survey reports',
          'Physical inspection and restricted review requests',
          'Time-limited monitoring with explicit renewal only',
        ],
      },
      {
        index: '04',
        kicker: 'EVIDENCE & CASE SUPPORT',
        headline1: 'Case Reporting &',
        headline2: 'Evidence Verification',
        caption: 'Verify dispute evidence integrity at /verify-case.',
        route: 'rentalhub.com.ng/verify-case',
        photo: 'photo-1766603636671-484c4911a84b.avif',
        zoomMode: 'out',
        uiType: 'protection_verify',
        bullets: [
          'Structured dispute case reporting and private threads',
          'Cryptographic evidence hashing and public /verify-case check',
          'Anonymized resolved case summaries published at /cases',
        ],
      },
      {
        index: '05',
        kicker: 'INSTITUTIONAL OVERSIGHT',
        headline1: 'Clarity for Owners,',
        headline2: 'Families & Partners',
        caption: 'Explore Amana Property Protection at rentalhub.com.ng.',
        route: 'rentalhub.com.ng/property-protection',
        photo: 'hero-terrace.avif',
        zoomMode: 'in',
        uiType: 'protection_finale',
        bullets: [
          'Free basic records · transparent optional paid services',
          'Built for landowners, corporate teams, and institutions',
          'Get started at rentalhub.com.ng/property-protection',
        ],
      },
    ],
  },
};

function getMediaDuration(filePath) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    { encoding: 'utf8' }
  ).trim();
  return parseFloat(out);
}

function canReuseAct(file, expectedDuration) {
  try {
    return fs.statSync(file).size > 20000 && Math.abs(getMediaDuration(file) - expectedDuration) <= (2 / FPS);
  } catch { return false; }
}

function resolveMusicTrack(preferredName) {
  const candidates = [
    path.join(MUSIC_DIR, preferredName),
    path.join(MUSIC_DIR, 'Corporate Inspiring.mp3'),
    path.join(MUSIC_DIR, 'Corporate.mp3'),
    path.join(ROOT_DIR, 'video-ads', 'public', 'audio', 'music.wav'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function synthesizeVoiceover(editionId, text, { narrationService = getCommercialNarration, logger = console, force = process.argv.includes('--regen-vo'), cacheDir = TMP_DIR } = {}) {
  try {
    const result = await narrationService({ editionId, text, cacheDir, force });
    logger.log(`   [${editionId}] ${result.cached ? 'Using cached' : 'Generated'} Azure narration (${result.profile}): ${result.file}`);
    return result.file;
  } catch (error) {
    logger.warn(`   [${editionId}] Azure narration unavailable (${error.message}); rendered without generated narration, using the existing instrumental/silent fallback.`);
    return null;
  }
}

const OFFICIAL_MARK_PNG = path.join(ROOT_DIR, 'assets', 'rentalhub-mark.png');
const OFFICIAL_MARK_DATA_URI = fs.existsSync(OFFICIAL_MARK_PNG)
  ? `data:image/png;base64,${fs.readFileSync(OFFICIAL_MARK_PNG).toString('base64')}`
  : null;

function buildBrandMarkSvg(x, y, size, bgFill = '#0C244E', accent = BRAND.gold) {
  if (OFFICIAL_MARK_DATA_URI) {
    const r = Math.round(size * 0.22);
    const clipId = `markClip_${Math.round(x)}_${Math.round(y)}_${Math.round(size)}`;
    return `
      <defs>
        <clipPath id="${clipId}">
          <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" ry="${r}"/>
        </clipPath>
      </defs>
      <image href="${OFFICIAL_MARK_DATA_URI}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="none" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.5"/>
    `;
  }
  const s = size / 48;
  return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <rect x="0" y="0" width="48" height="48" rx="10" fill="${bgFill}" stroke="${accent}" stroke-width="2"/>
    </g>
  `;
}

/**
 * Authentic RentalHub NG UI screen cards (660 x 430 logical coordinate system)
 * All text strictly factual, Escrow-aligned, and NBA-compliant (zero prohibited terms).
 */
function buildUiCardInner(uiType, route) {
  const chromeBg = uiType.startsWith('landlord_')
    ? '#0A152C'
    : uiType.startsWith('protection_')
      ? '#082426'
      : '#0B224C';
  const bodyBg = uiType.startsWith('landlord_') ? '#0F1D3A' : '#F8FAFC';

  const chrome = `
    <rect x="0" y="0" width="660" height="430" rx="18" fill="${bodyBg}" stroke="${BRAND.gold}" stroke-opacity="0.45" stroke-width="1.5"/>
    <rect x="0" y="0" width="660" height="44" rx="18" fill="${chromeBg}"/>
    <rect x="0" y="24" width="660" height="20" fill="${chromeBg}"/>
    <circle cx="22" cy="22" r="5" fill="#475569"/>
    <circle cx="38" cy="22" r="5" fill="#475569"/>
    <circle cx="54" cy="22" r="5" fill="#475569"/>
    <rect x="120" y="10" width="380" height="24" rx="6" fill="#071A3D" stroke="#334155" stroke-width="1"/>
    <text x="310" y="26" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#CBD5E1">${esc(route)}</text>
    <rect x="524" y="12" width="118" height="20" rx="5" fill="${BRAND.gold}" fill-opacity="0.18"/>
    <text x="583" y="25.5" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="9.5" font-weight="700" fill="${BRAND.goldSoft}">PLATFORM PREVIEW</text>
  `;

  if (uiType === 'flagship_search') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="56" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="42" y="84" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">STATE / CITY</text>
      <text x="42" y="103" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.navy}">Lagos · Lekki Phase 1</text>
      <line x1="230" y1="72" x2="230" y2="108" stroke="#E2E8F0"/>
      <text x="248" y="84" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">PROPERTY TYPE</text>
      <text x="248" y="103" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.navy}">3-Bed Terrace</text>
      <line x1="415" y1="72" x2="415" y2="108" stroke="#E2E8F0"/>
      <rect x="434" y="74" width="186" height="32" rx="7" fill="${BRAND.navy}"/>
      <text x="527" y="94.5" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">Search 36 States + FCT</text>

      <rect x="24" y="136" width="296" height="270" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <rect x="24" y="136" width="296" height="106" rx="12" fill="#0F2A5A"/>
      <rect x="24" y="218" width="296" height="24" fill="#0F2A5A"/>
      <rect x="40" y="152" width="126" height="24" rx="5" fill="#065F46"/>
      <text x="103" y="168" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ECFDF5">VERIFIED LISTING</text>
      <text x="40" y="226" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#CBD5E1">Lekki Phase 1, Lagos</text>
      <text x="40" y="268" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="${BRAND.navy}">3-Bed Contemporary Terrace</text>
      <text x="40" y="294" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="${BRAND.navy}">₦4,500,000 / yr</text>
      <text x="40" y="320" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">3 Beds · 4 Baths · Serviced Estate</text>
      <rect x="40" y="346" width="264" height="42" rx="8" fill="#F1F5F9" stroke="#CBD5E1"/>
      <text x="172" y="371" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.navy}">View Structured Property Profile</text>

      <rect x="340" y="136" width="296" height="270" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <rect x="340" y="136" width="296" height="106" rx="12" fill="#173873"/>
      <rect x="340" y="218" width="296" height="24" fill="#173873"/>
      <rect x="356" y="152" width="144" height="24" rx="5" fill="${BRAND.navy}" stroke="${BRAND.gold}"/>
      <text x="428" y="168" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="${BRAND.goldSoft}">VERIFIED LANDLORD</text>
      <text x="356" y="226" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#CBD5E1">Wuse II, Abuja FCT</text>
      <text x="356" y="268" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="${BRAND.navy}">2-Bed Executive Apartment</text>
      <text x="356" y="294" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="${BRAND.navy}">₦3,800,000 / yr</text>
      <text x="356" y="320" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">2 Beds · 3 Baths · 24/7 Power Backup</text>
      <rect x="356" y="346" width="264" height="42" rx="8" fill="${BRAND.navy}"/>
      <text x="488" y="371" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">Compare &amp; Estimate Move-In</text>
    `;
  }

  if (uiType === 'flagship_detail') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="46" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="${BRAND.navy}">3-Bedroom Terrace · Lekki Phase 1, Lagos</text>
      <rect x="46" y="108" width="136" height="24" rx="5" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="114" y="124" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#065F46">Platform Verified</text>
      <rect x="192" y="108" width="150" height="24" rx="5" fill="#FEF3C7" stroke="#FDE68A"/>
      <text x="267" y="124" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#92400E">Verified Landlord ID</text>

      <rect x="46" y="150" width="176" height="72" rx="9" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="62" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">ANNUAL RENT</text>
      <text x="62" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="${BRAND.navy}">₦4,500,000</text>

      <rect x="238" y="150" width="180" height="72" rx="9" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="254" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">MONTHLY ESTIMATE</text>
      <text x="254" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="700" fill="${BRAND.navy}">₦375,000 / mo</text>

      <rect x="434" y="150" width="180" height="72" rx="9" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="450" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">INSPECTION MEDIA</text>
      <text x="450" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="#065F46">Video &amp; Photos Ready</text>

      <rect x="46" y="242" width="568" height="142" rx="10" fill="#071A3D"/>
      <text x="68" y="274" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.goldSoft}">RENT CALCULATOR &amp; MOVE-IN BREAKDOWN</text>
      <text x="68" y="302" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#E2E8F0">• Annual Rent, Service Charge &amp; Applicable Platform Fees Shown Upfront</text>
      <text x="68" y="328" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#E2E8F0">• Clear Landlord Profile, Property Specifications &amp; Availability Status</text>
      <text x="68" y="354" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">• Full Street Address &amp; Direct Contact Unlocked After Identity Verification</text>
    `;
  }

  if (uiType === 'flagship_identity') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="162" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="48" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="${BRAND.navy}">Identity Verification &amp; Account Readiness</text>
      <rect x="48" y="116" width="174" height="84" rx="9" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="64" y="146" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#065F46">STEP 01 · COMPLETE</text>
      <text x="64" y="172" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="${BRAND.navy}">NIN Verification</text>
      <rect x="242" y="116" width="174" height="84" rx="9" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="258" y="146" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#065F46">STEP 02 · COMPLETE</text>
      <text x="258" y="172" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="${BRAND.navy}">Live Photo Check</text>
      <rect x="436" y="116" width="176" height="84" rx="9" fill="#FEF3C7" stroke="#FDE68A"/>
      <text x="452" y="146" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#92400E">STEP 03 · READY</text>
      <text x="452" y="172" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="${BRAND.navy}">Detail Unlock</text>

      <rect x="24" y="242" width="612" height="164" rx="12" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1.5"/>
      <text x="48" y="276" font-family="DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="700" fill="${BRAND.navy}">Transparent Property Detail Unlock</text>
      <text x="48" y="304" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#334155">Complete the one-time property unlock or active tenant plan via escrow checkout</text>
      <text x="48" y="325" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#334155">or bank transfer to reveal the full street address, video, and direct landlord line.</text>
      <rect x="48" y="346" width="236" height="40" rx="8" fill="${BRAND.navy}"/>
      <text x="166" y="370" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">Proceed via Escrow Checkout</text>
      <rect x="298" y="346" width="248" height="40" rx="8" fill="#FFFFFF" stroke="#CBD5E1"/>
      <text x="422" y="370" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.navy}">In-Platform Messaging &amp; Calling</text>
    `;
  }

  if (uiType === 'flagship_escrow') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="46" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="${BRAND.navy}">Wallet &amp; Escrow Rent Ledger</text>
      <rect x="444" y="76" width="170" height="26" rx="6" fill="#071A3D"/>
      <text x="529" y="93" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="${BRAND.goldSoft}">ESCROW &amp; BANK TRANSFER</text>

      <rect x="46" y="118" width="274" height="104" rx="10" fill="#FEF3C7" stroke="#FDE68A"/>
      <text x="64" y="144" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#92400E">PENDING ESCROW CLEARING</text>
      <text x="64" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="${BRAND.navy}">₦4,387,500</text>
      <text x="64" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#78350F">14-working-day escrow clearing window</text>

      <rect x="340" y="118" width="274" height="104" rx="10" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="358" y="144" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#065F46">CLEARED BALANCE</text>
      <text x="358" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="#065F46">₦1,850,000</text>
      <text x="358" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#047857">Ready for verified bank withdrawal</text>

      <line x1="46" y1="244" x2="614" y2="244" stroke="#E2E8F0"/>
      <text x="46" y="272" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#64748B">RECENT AUDITABLE LEDGER ENTRIES</text>

      <rect x="46" y="286" width="568" height="44" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="64" y="313" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${BRAND.navy}">Rent Escrow · Ref #RH-40219</text>
      <rect x="444" y="296" width="154" height="24" rx="5" fill="#FEF3C7" stroke="#FDE68A"/>
      <text x="521" y="312" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#92400E">Escrow Clearing (14d)</text>

      <rect x="46" y="340" width="568" height="44" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="64" y="367" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${BRAND.navy}">Property Unlock · Escrow Recorded</text>
      <rect x="480" y="350" width="118" height="24" rx="5" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="539" y="366" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#065F46">Receipt Issued</text>
    `;
  }

  if (uiType === 'flagship_agreements' || uiType === 'tenant_finale') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="196" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="48" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="16.5" font-weight="700" fill="${BRAND.navy}">Versioned Digital Tenancy Agreement</text>
      <rect x="466" y="76" width="146" height="26" rx="6" fill="#071A3D"/>
      <text x="539" y="93" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="${BRAND.goldSoft}">SHA-256 INTEGRITY</text>
      <text x="48" y="128" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#334155">• Draft → Tenant Review → Landlord &amp; Tenant Counter-Execution → Active Lease</text>
      <text x="48" y="156" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#334155">• Version history, signed PDF archival, and timestamped audit trail</text>
      <rect x="48" y="178" width="268" height="58" rx="9" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="64" y="202" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#065F46">TENANT SIGNATURE</text>
      <text x="64" y="223" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${BRAND.navy}">Recorded · Timestamped</text>
      <rect x="334" y="178" width="278" height="58" rx="9" fill="#ECFDF5" stroke="#A7F3D0"/>
      <text x="350" y="202" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#065F46">LANDLORD COUNTER-SIGN</text>
      <text x="350" y="223" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${BRAND.navy}">Archived · Version 1.0</text>

      <rect x="24" y="276" width="612" height="130" rx="12" fill="#071A3D"/>
      <text x="48" y="308" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.goldSoft}">${uiType === 'tenant_finale' ? 'MOVE-IN &amp; TENANT SERVICES' : 'AMANA PROPERTY PROTECTION MODULE'}</text>
      <text x="48" y="338" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#E2E8F0">${uiType === 'tenant_finale' ? '• Optional relocation transport &amp; move-in fumigation bookings on-platform' : '• Free basic property records &amp; case reporting (including unlisted land)'}</text>
      <text x="48" y="366" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">${uiType === 'tenant_finale' ? '• Start your verified home search today at rentalhub.com.ng' : '• Optional priced registry, survey &amp; physical inspection requests'}</text>
    `;
  }

  if (uiType === 'landlord_portfolio' || uiType === 'landlord_enquiries') {
    const isEnq = uiType === 'landlord_enquiries';
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#132447" stroke="${BRAND.gold}" stroke-opacity="0.35" stroke-width="1.2"/>
      <text x="48" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">${isEnq ? 'Identity-Screened Tenant Enquiries' : 'Landlord &amp; Agent Portfolio Workspace'}</text>
      <rect x="454" y="76" width="160" height="26" rx="6" fill="${BRAND.gold}" fill-opacity="0.2" stroke="${BRAND.gold}"/>
      <text x="534" y="93" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="${BRAND.goldSoft}">${isEnq ? 'VERIFIED ENQUIRIES' : 'PORTFOLIO ACTIVE'}</text>

      <rect x="48" y="122" width="176" height="84" rx="9" fill="#0B1730" stroke="#334155"/>
      <text x="64" y="148" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#94A3B8">ACTIVE LISTINGS</text>
      <text x="64" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">14 Units</text>

      <rect x="242" y="122" width="176" height="84" rx="9" fill="#0B1730" stroke="#334155"/>
      <text x="258" y="148" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#94A3B8">VERIFIED ENQUIRIES</text>
      <text x="258" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="${BRAND.goldSoft}">28 Checked</text>

      <rect x="436" y="122" width="176" height="84" rx="9" fill="#0B1730" stroke="#334155"/>
      <text x="452" y="148" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#94A3B8">ESCROW CLEARED</text>
      <text x="452" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="${BRAND.emeraldSoft}">₦6.23M</text>

      <rect x="48" y="226" width="564" height="68" rx="9" fill="#0B1730" stroke="#1E3A5F"/>
      <text x="66" y="254" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="#FFFFFF">${isEnq ? 'Enquiry · Verified Tenant ID #NG-8841' : 'Lekki Phase 1 Terrace · 3-Bed · Published'}</text>
      <text x="66" y="278" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#CBD5E1">${isEnq ? 'NIN &amp; Live Photo Verified · Address Protected Until Unlock' : 'Availability: Active · Inspection Media Attached · ₦4.5M/yr'}</text>

      <rect x="48" y="308" width="564" height="68" rx="9" fill="#0B1730" stroke="#1E3A5F"/>
      <text x="66" y="336" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="#FFFFFF">${isEnq ? 'In-Platform Thread · Scheduled Inspection Request' : 'Wuse II Executive Flat · 2-Bed · Published'}</text>
      <text x="66" y="360" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#CBD5E1">${isEnq ? 'All messages &amp; call logs recorded inside your owner workspace' : 'Accredited Agent Assigned · Escrow Clearing Enabled'}</text>
    `;
  }

  if (uiType === 'landlord_delegation' || uiType === 'landlord_finale') {
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#132447" stroke="${BRAND.gold}" stroke-opacity="0.35" stroke-width="1.2"/>
      <text x="48" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">Accredited Agent Permissions &amp; Owner Audit</text>
      <text x="48" y="124" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Grant explicit operational scopes while retaining full landlord ownership &amp; payout control.</text>

      <rect x="48" y="146" width="272" height="106" rx="10" fill="#0B1730" stroke="#334155"/>
      <text x="66" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="${BRAND.goldSoft}">SCOPED PERMISSIONS</text>
      <text x="66" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#FFFFFF">✓ Listing &amp; Media Updates</text>
      <text x="66" y="230" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#FFFFFF">✓ Inspection Coordination</text>

      <rect x="340" y="146" width="272" height="106" rx="10" fill="#0B1730" stroke="#334155"/>
      <text x="358" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="${BRAND.emeraldSoft}">OWNER CONTROLS</text>
      <text x="358" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#FFFFFF">✓ Direct Bank Payout Approval</text>
      <text x="358" y="230" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#FFFFFF">✓ Final Lease Counter-Sign</text>

      <rect x="48" y="272" width="564" height="108" rx="10" fill="#081327" stroke="${BRAND.gold}" stroke-opacity="0.4"/>
      <text x="66" y="302" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="${BRAND.goldSoft}">CENTRALIZED ACTIVITY LOG</text>
      <text x="66" y="328" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Every delegated task—listing edits, condition updates, and dossier</text>
      <text x="66" y="350" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">records—remains visible under your verified landlord dashboard.</text>
    `;
  }

  if (uiType === 'protection_records' || uiType === 'protection_capacity') {
    const isCap = uiType === 'protection_capacity';
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1.2"/>
      <text x="48" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="16.5" font-weight="700" fill="${BRAND.navy}">${isCap ? 'Property Capacity &amp; Holding Types' : 'Basic Property Record Vault'}</text>
      <rect x="448" y="76" width="164" height="26" rx="6" fill="#065F46"/>
      <text x="530" y="93" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#ECFDF5">FREE BASIC RECORDS</text>

      <rect x="48" y="124" width="272" height="114" rx="10" fill="#F8FAFC" stroke="#CBD5E1"/>
      <text x="64" y="156" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.navy}">${isCap ? 'Unlisted Land &amp; Estates' : 'Structured Asset Profile'}</text>
      <text x="64" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">${isCap ? 'Register land parcels &amp; residential plots' : 'Document location, title refs &amp; photos'}</text>
      <text x="64" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">${isCap ? 'Not required to be listed for rent' : 'Zero-cost onboarding for property owners'}</text>

      <rect x="336" y="124" width="276" height="114" rx="10" fill="#F8FAFC" stroke="#CBD5E1"/>
      <text x="352" y="156" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.navy}">${isCap ? 'Family &amp; Company Capacity' : 'Basic Case Reporting'}</text>
      <text x="352" y="182" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">${isCap ? 'Individual, family, or corporate holdings' : 'Log dispute timelines &amp; supporting files'}</text>
      <text x="352" y="204" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" fill="#475569">${isCap ? 'Built for local &amp; diaspora owners' : 'Private threads with structured tracking'}</text>

      <rect x="48" y="258" width="564" height="122" rx="10" fill="${BRAND.forest}"/>
      <text x="66" y="290" font-family="DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="${BRAND.goldSoft}">TRANSPARENT PLATFORM DISCLOSURE</text>
      <text x="66" y="318" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#E2E8F0">• Basic property records and basic case reports are free on-platform.</text>
      <text x="66" y="344" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#CBD5E1">• Platform documentation assists clarity and does not replace land registries.</text>
    `;
  }

  if (uiType === 'protection_services' || uiType === 'protection_verify' || uiType === 'protection_finale') {
    const isVerify = uiType === 'protection_verify';
    return `${chrome}
      <rect x="24" y="62" width="612" height="344" rx="12" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1.2"/>
      <text x="48" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="16.5" font-weight="700" fill="${BRAND.navy}">${isVerify ? 'Public Case &amp; Evidence Verification Portal' : 'Optional Priced Verification Workflows'}</text>
      <rect x="444" y="76" width="168" height="26" rx="6" fill="${BRAND.forest}"/>
      <text x="528" y="93" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="${BRAND.goldSoft}">${isVerify ? 'PORTAL · /verify-case' : 'OPTIONAL · PRICED'}</text>

      <rect x="48" y="124" width="564" height="118" rx="10" fill="#F8FAFC" stroke="#CBD5E1"/>
      <text x="66" y="156" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.navy}">${isVerify ? 'Case Integrity Check · Reference #PP-2026-041' : 'Registry Search, Survey &amp; Physical Inspection'}</text>
      <text x="66" y="184" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#334155">${isVerify ? 'SHA-256 Evidence Hash: 8f4c...91d2 · Timestamp Verified' : '• Request priced registry searches or survey reports where defined'}</text>
      <text x="66" y="210" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#334155">${isVerify ? 'Anonymized resolved summaries published transparently at /cases' : '• Time-limited monitoring periods with explicit renewal only'}</text>

      <rect x="48" y="262" width="564" height="118" rx="10" fill="${BRAND.forest}"/>
      <text x="66" y="294" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.goldSoft}">AMANA PROPERTY PROTECTION · RENTALHUB.COM.NG</text>
      <text x="66" y="324" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#FFFFFF">Built for Nigerian landowners, families, corporate teams &amp; partners.</text>
      <text x="66" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Service availability and applicable fees are displayed clearly before confirmation.</text>
    `;
  }

  // Flagship / general finale card
  return `${chrome}
    <rect x="24" y="62" width="612" height="344" rx="12" fill="${BRAND.navy}"/>
    ${buildBrandMarkSvg(294, 96, 72)}
    <text x="330" y="206" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">Amana RentalHub NG</text>
    <text x="330" y="236" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="${BRAND.goldSoft}">STRUCTURED NIGERIAN PROPTECH PLATFORM</text>
    <line x1="170" y1="258" x2="490" y2="258" stroke="${BRAND.gold}" stroke-opacity="0.5"/>
    <text x="330" y="290" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#E2E8F0">Search · Identity Verification · Escrow Clearing · Digital Leases · Protection</text>
    <rect x="200" y="318" width="260" height="46" rx="9" fill="${BRAND.gold}"/>
    <text x="330" y="346" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="${BRAND.navy}">rentalhub.com.ng</text>
  `;
}

/**
 * 4 GENUINELY DISTINCT STATIC OVERLAY FRAME LAYOUTS
 * (Separates chrome/typography PNG from delayed fade-in UI card PNG)
 */
function buildFrameChromeSvg(layout, scene, totalScenes, width, height) {
  const isVertical = height > width;
  const progressRatio = (parseInt(scene.index, 10) || 1) / totalScenes;

  // =========================================================================
  // LAYOUT 1: FLAGSHIP BANNER (Corporate Navy Top Banner + Gold Lower-Third)
  // =========================================================================
  if (layout === 'flagship_banner') {
    if (isVertical) {
      return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#041129" stop-opacity="0.96"/>
            <stop offset="68%" stop-color="#071A3D" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="#071A3D" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#041129" stop-opacity="0"/>
            <stop offset="35%" stop-color="#041129" stop-opacity="0.88"/>
            <stop offset="100%" stop-color="#041129" stop-opacity="0.98"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="430" fill="url(#topGrad)"/>
        <rect x="0" y="1380" width="${width}" height="540" fill="url(#botGrad)"/>

        <!-- Top Corporate Header Bar -->
        <rect x="0" y="0" width="${width}" height="122" fill="#051430" fill-opacity="0.92"/>
        <line x1="0" y1="122" x2="${width}" y2="122" stroke="${BRAND.gold}" stroke-opacity="0.5" stroke-width="2"/>
        ${buildBrandMarkSvg(56, 36, 52)}
        <text x="126" y="61" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
        <text x="126" y="87" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" letter-spacing="2.2" fill="${BRAND.goldSoft}">CORPORATE PROPTECH PLATFORM</text>
        <text x="${width - 56}" y="72" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.index)} / 0${totalScenes}</text>

        <!-- Headline Block -->
        <text x="64" y="198" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="3" fill="${BRAND.goldSoft}">${esc(scene.kicker)}</text>
        <text x="64" y="264" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
        <text x="64" y="324" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

        <!-- Bottom Left-Gold-Bar Lower-Third Caption -->
        <rect x="64" y="1596" width="8" height="170" rx="4" fill="${BRAND.gold}"/>
        <text x="92" y="1632" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
        <text x="92" y="1674" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#CBD5E1">• ${esc(scene.bullets[0])}</text>
        <text x="92" y="1708" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#CBD5E1">• ${esc(scene.bullets[1])}</text>
        <text x="92" y="1742" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#CBD5E1">• ${esc(scene.bullets[2])}</text>

        <!-- Subtle Progress Bar & Domain -->
        <rect x="64" y="1828" width="${width - 128}" height="5" rx="2.5" fill="#FFFFFF" fill-opacity="0.18"/>
        <rect x="64" y="1828" width="${Math.round((width - 128) * progressRatio)}" height="5" rx="2.5" fill="${BRAND.gold}"/>
        <text x="64" y="1872" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#E2E8F0">rentalhub.com.ng</text>
        <text x="${width - 64}" y="1872" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#94A3B8">36 States &amp; FCT · Escrow-Tracked Workflows</text>
      </svg>`;
    }

    // 16:9 Flagship
    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="leftScrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#041129" stop-opacity="0.96"/>
          <stop offset="52%" stop-color="#071A3D" stop-opacity="0.86"/>
          <stop offset="100%" stop-color="#071A3D" stop-opacity="0.28"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#leftScrim)"/>
      <rect x="0" y="0" width="${width}" height="64" fill="#051430" fill-opacity="0.94"/>
      <line x1="0" y1="64" x2="${width}" y2="64" stroke="${BRAND.gold}" stroke-opacity="0.45" stroke-width="1.5"/>
      ${buildBrandMarkSvg(36, 12, 40)}
      <text x="90" y="34" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
      <text x="90" y="51" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" letter-spacing="1.8" fill="${BRAND.goldSoft}">FLAGSHIP OVERVIEW · NIGERIAN PROPTECH</text>
      <text x="${width - 36}" y="38" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="${BRAND.goldSoft}">CHAPTER ${esc(scene.index)} / 0${totalScenes}</text>

      <!-- Left Editorial Column (width 520px, safe spacing from right UI card at x=575) -->
      <text x="44" y="138" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="2.4" fill="${BRAND.goldSoft}">${esc(scene.kicker)}</text>
      <text x="44" y="188" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
      <text x="44" y="232" font-family="DejaVu Sans, Arial, sans-serif" font-size="31" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

      <rect x="44" y="262" width="5" height="190" rx="2.5" fill="${BRAND.gold}"/>
      <text x="64" y="294" font-family="DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
      <text x="64" y="336" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" fill="#CBD5E1">• ${esc(scene.bullets[0])}</text>
      <text x="64" y="370" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" fill="#CBD5E1">• ${esc(scene.bullets[1])}</text>
      <text x="64" y="404" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" fill="#CBD5E1">• ${esc(scene.bullets[2])}</text>

      <rect x="44" y="652" width="${width - 88}" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.18"/>
      <rect x="44" y="652" width="${Math.round((width - 88) * progressRatio)}" height="4" rx="2" fill="${BRAND.gold}"/>
      <text x="44" y="688" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">rentalhub.com.ng</text>
      <text x="${width - 44}" y="688" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" fill="#CBD5E1">36 States &amp; FCT · Escrow-Tracked Workflows</text>
    </svg>`;
  }

  // =========================================================================
  // LAYOUT 2: TENANT EDITORIAL MAGAZINE (Daylight Split-Canvas Ivory + Navy)
  // =========================================================================
  if (layout === 'tenant_magazine') {
    if (isVertical) {
      return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="magTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#071A3D" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="#071A3D" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- Top light scrim over warm daylight architectural photo (top 760px visible) -->
        <rect x="0" y="0" width="${width}" height="210" fill="url(#magTop)"/>
        ${buildBrandMarkSvg(52, 40, 48)}
        <text x="116" y="62" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
        <text x="116" y="84" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" letter-spacing="2" fill="${BRAND.goldSoft}">TENANT EDITORIAL EDITION</text>
        <rect x="${width - 156}" y="44" width="104" height="36" rx="6" fill="#F8F6F1" fill-opacity="0.94"/>
        <text x="${width - 104}" y="68" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="${BRAND.navy}">${esc(scene.index)} / 0${totalScenes}</text>

        <!-- Warm Ivory Editorial Magazine Sheet (Lower Split Canvas) -->
        <path d="M 0 760 Q 540 732 1080 760 L 1080 1920 L 0 1920 Z" fill="${BRAND.ivory}"/>
        <line x1="64" y1="816" x2="176" y2="816" stroke="${BRAND.gold}" stroke-width="5"/>
        <text x="196" y="822" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2.4" fill="${BRAND.navy}">${esc(scene.kicker)}</text>

        <text x="64" y="886" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700" fill="${BRAND.navy}">${esc(scene.headline1)}</text>
        <text x="64" y="942" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="#8C6214">${esc(scene.headline2)}</text>

        <text x="64" y="1682" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="700" fill="${BRAND.navy}">${esc(scene.caption)}</text>
        <text x="64" y="1724" font-family="DejaVu Sans, Arial, sans-serif" font-size="19.5" fill="${BRAND.slateText}">• ${esc(scene.bullets[0])}</text>
        <text x="64" y="1758" font-family="DejaVu Sans, Arial, sans-serif" font-size="19.5" fill="${BRAND.slateText}">• ${esc(scene.bullets[1])}</text>

        <rect x="64" y="1822" width="${width - 128}" height="5" rx="2.5" fill="#CBD5E1"/>
        <rect x="64" y="1822" width="${Math.round((width - 128) * progressRatio)}" height="5" rx="2.5" fill="${BRAND.navy}"/>
        <text x="64" y="1868" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="${BRAND.navy}">rentalhub.com.ng</text>
        <text x="${width - 64}" y="1868" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="${BRAND.slateMuted}">Tenant Edition · Escrow-Tracked Rentals</text>
      </svg>`;
    }

    // 16:9 Tenant Split-Canvas (Left 44% Photo visible, Right 56% Crisp Ivory Editorial Panel)
    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="magPhotoTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#071A3D" stop-opacity="0.78"/>
          <stop offset="100%" stop-color="#071A3D" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="magPhotoBot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#071A3D" stop-opacity="0"/>
          <stop offset="100%" stop-color="#071A3D" stop-opacity="0.88"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="540" height="160" fill="url(#magPhotoTop)"/>
      <rect x="0" y="540" width="540" height="180" fill="url(#magPhotoBot)"/>
      ${buildBrandMarkSvg(32, 26, 40)}
      <text x="84" y="45" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
      <text x="84" y="62" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" letter-spacing="1.8" fill="${BRAND.goldSoft}">TENANT EDITION</text>
      <text x="32" y="660" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">rentalhub.com.ng</text>
      <text x="32" y="684" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Transparent Nigerian Home Search</text>

      <!-- Right Crisp Ivory Magazine Editorial Panel -->
      <rect x="520" y="0" width="760" height="720" fill="${BRAND.ivory}"/>
      <line x1="520" y1="0" x2="520" y2="720" stroke="${BRAND.gold}" stroke-width="4"/>
      <text x="560" y="50" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2.2" fill="#8C6214">${esc(scene.kicker)}</text>
      <text x="1240" y="50" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="${BRAND.navy}">${esc(scene.index)} / 0${totalScenes}</text>

      <text x="560" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="31" font-weight="700" fill="${BRAND.navy}">${esc(scene.headline1)} — ${esc(scene.headline2)}</text>
      <text x="560" y="128" font-family="DejaVu Sans, Arial, sans-serif" font-size="14.5" fill="${BRAND.slateText}">${esc(scene.caption)}</text>

      <text x="560" y="626" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="${BRAND.slateText}">• ${esc(scene.bullets[0])}   • ${esc(scene.bullets[1])}</text>
      <rect x="560" y="656" width="680" height="5" rx="2.5" fill="#CBD5E1"/>
      <rect x="560" y="656" width="${Math.round(680 * progressRatio)}" height="5" rx="2.5" fill="${BRAND.navy}"/>
    </svg>`;
  }

  // =========================================================================
  // LAYOUT 3: LANDLORD COMMAND SHOWCASE (Obsidian Navy Gold-Framed Institutional)
  // =========================================================================
  if (layout === 'landlord_command') {
    if (isVertical) {
      return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="obsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#060D1E" stop-opacity="0.96"/>
            <stop offset="28%" stop-color="#060D1E" stop-opacity="0.30"/>
            <stop offset="56%" stop-color="#060D1E" stop-opacity="0.84"/>
            <stop offset="100%" stop-color="#060D1E" stop-opacity="0.99"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#obsGrad)"/>

        <!-- Crisp Gold Institutional Perimeter Frame -->
        <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="14" fill="none" stroke="${BRAND.gold}" stroke-opacity="0.62" stroke-width="2"/>
        <rect x="40" y="40" width="${width - 80}" height="82" rx="10" fill="#0A142B" stroke="#1E3A5F"/>
        ${buildBrandMarkSvg(58, 57, 46, '#060D1E')}
        <text x="120" y="78" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
        <text x="120" y="102" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" letter-spacing="2.2" fill="${BRAND.goldSoft}">LANDLORD &amp; ACCREDITED AGENT COMMAND</text>
        <text x="${width - 66}" y="88" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="${BRAND.goldSoft}">0${parseInt(scene.index, 10)} / 0${totalScenes}</text>

        <!-- Centered Institutional Title Block above Photo Window -->
        <rect x="64" y="152" width="320" height="32" rx="6" fill="${BRAND.gold}" fill-opacity="0.18" stroke="${BRAND.gold}"/>
        <text x="224" y="173" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" letter-spacing="2" fill="${BRAND.goldSoft}">${esc(scene.kicker)}</text>
        <text x="64" y="242" font-family="DejaVu Sans, Arial, sans-serif" font-size="50" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
        <text x="64" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

        <!-- Bottom Dark Institutional Spec Strip -->
        <rect x="60" y="1590" width="${width - 120}" height="184" rx="12" fill="#0B162F" stroke="${BRAND.gold}" stroke-opacity="0.45"/>
        <text x="88" y="1632" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
        <text x="88" y="1674" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#CBD5E1">▪ ${esc(scene.bullets[0])}</text>
        <text x="88" y="1708" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#CBD5E1">▪ ${esc(scene.bullets[1])}</text>
        <text x="88" y="1742" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#CBD5E1">▪ ${esc(scene.bullets[2])}</text>

        <rect x="64" y="1814" width="${width - 128}" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.15"/>
        <rect x="64" y="1814" width="${Math.round((width - 128) * progressRatio)}" height="4" rx="2" fill="${BRAND.gold}"/>
        <text x="64" y="1858" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="${BRAND.goldSoft}">rentalhub.com.ng</text>
        <text x="${width - 64}" y="1858" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#94A3B8">Landlord &amp; Accredited Agent Portfolio Suite</text>
      </svg>`;
    }

    // 16:9 Landlord Command
    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="obsWide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#060D1E" stop-opacity="0.97"/>
          <stop offset="50%" stop-color="#060D1E" stop-opacity="0.84"/>
          <stop offset="100%" stop-color="#060D1E" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#obsWide)"/>
      <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="10" fill="none" stroke="${BRAND.gold}" stroke-opacity="0.6" stroke-width="1.8"/>

      ${buildBrandMarkSvg(40, 34, 38, '#060D1E')}
      <text x="90" y="52" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">AMANA RENTALHUB NG</text>
      <text x="90" y="68" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" letter-spacing="1.8" fill="${BRAND.goldSoft}">LANDLORD &amp; ACCREDITED AGENT EDITION</text>
      <text x="${width - 42}" y="56" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.goldSoft}">MODULE ${esc(scene.index)} / 0${totalScenes}</text>

      <rect x="44" y="114" width="248" height="26" rx="5" fill="${BRAND.gold}" fill-opacity="0.16" stroke="${BRAND.gold}"/>
      <text x="168" y="131" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1.8" fill="${BRAND.goldSoft}">${esc(scene.kicker)}</text>

      <text x="44" y="186" font-family="DejaVu Sans, Arial, sans-serif" font-size="33" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
      <text x="44" y="228" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

      <rect x="44" y="256" width="496" height="210" rx="10" fill="#0B162F" fill-opacity="0.92" stroke="#1E3A5F"/>
      <text x="64" y="292" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
      <text x="64" y="334" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">▪ ${esc(scene.bullets[0])}</text>
      <text x="64" y="368" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">▪ ${esc(scene.bullets[1])}</text>
      <text x="64" y="402" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">▪ ${esc(scene.bullets[2])}</text>

      <rect x="44" y="644" width="${width - 88}" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.16"/>
      <rect x="44" y="644" width="${Math.round((width - 88) * progressRatio)}" height="4" rx="2" fill="${BRAND.gold}"/>
      <text x="44" y="678" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.goldSoft}">rentalhub.com.ng</text>
      <text x="${width - 44}" y="678" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Institutional Portfolio Management · Escrow Payouts</text>
    </svg>`;
  }

  // =========================================================================
  // LAYOUT 4: PROTECTION DOSSIER (Deep Forest-Navy Property Protection Registry)
  // =========================================================================
  if (isVertical) {
    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="forTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#041416" stop-opacity="0.96"/>
          <stop offset="72%" stop-color="#062022" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="#062022" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="forBot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#041416" stop-opacity="0"/>
          <stop offset="30%" stop-color="#041416" stop-opacity="0.92"/>
          <stop offset="100%" stop-color="#041416" stop-opacity="0.99"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="460" fill="url(#forTop)"/>
      <rect x="0" y="1360" width="${width}" height="560" fill="url(#forBot)"/>

      <!-- Top Property Protection Registry Status Strip -->
      <rect x="0" y="0" width="${width}" height="118" fill="#041416" fill-opacity="0.95"/>
      <line x1="0" y1="118" x2="${width}" y2="118" stroke="${BRAND.emeraldSoft}" stroke-opacity="0.5" stroke-width="2"/>
      ${buildBrandMarkSvg(56, 34, 50, '#0C2D30', BRAND.emeraldSoft)}
      <text x="124" y="58" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">AMANA PROPERTY PROTECTION</text>
      <text x="124" y="84" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" letter-spacing="2" fill="${BRAND.emeraldSoft}">PROPERTY RECORDS &amp; CASE VERIFICATION DOSSIER</text>
      <rect x="${width - 150}" y="38" width="96" height="40" rx="6" fill="#0C2D30" stroke="${BRAND.emeraldSoft}"/>
      <text x="${width - 102}" y="64" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#ECFDF5">${esc(scene.index)} / 0${totalScenes}</text>

      <!-- Left Vertical Emerald Registry Rail -->
      <rect x="44" y="164" width="6" height="170" rx="3" fill="${BRAND.emeraldSoft}"/>
      <text x="70" y="196" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2.6" fill="${BRAND.emeraldSoft}">${esc(scene.kicker)}</text>
      <text x="70" y="256" font-family="DejaVu Sans, Arial, sans-serif" font-size="50" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
      <text x="70" y="314" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

      <!-- Dossier Footer Card -->
      <rect x="56" y="1592" width="${width - 112}" height="186" rx="12" fill="#082426" stroke="${BRAND.emeraldSoft}" stroke-opacity="0.45"/>
      <text x="84" y="1634" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
      <text x="84" y="1676" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#D1FAE5">✓ ${esc(scene.bullets[0])}</text>
      <text x="84" y="1710" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#D1FAE5">✓ ${esc(scene.bullets[1])}</text>
      <text x="84" y="1744" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#CBD5E1">✓ ${esc(scene.bullets[2])}</text>

      <rect x="56" y="1824" width="${width - 112}" height="5" rx="2.5" fill="#FFFFFF" fill-opacity="0.18"/>
      <rect x="56" y="1824" width="${Math.round((width - 112) * progressRatio)}" height="5" rx="2.5" fill="${BRAND.emeraldSoft}"/>
      <text x="56" y="1868" font-family="DejaVu Sans, Arial, sans-serif" font-size="17.5" font-weight="700" fill="#ECFDF5">rentalhub.com.ng/property-protection</text>
      <text x="${width - 56}" y="1868" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="15.5" fill="#94A3B8">Verify Evidence · /verify-case</text>
    </svg>`;
  }

  // 16:9 Protection Dossier
  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="forWide" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#041416" stop-opacity="0.97"/>
        <stop offset="52%" stop-color="#062022" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="#062022" stop-opacity="0.35"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#forWide)"/>
    <rect x="0" y="0" width="${width}" height="64" fill="#041416" fill-opacity="0.95"/>
    <line x1="0" y1="64" x2="${width}" y2="64" stroke="${BRAND.emeraldSoft}" stroke-opacity="0.5" stroke-width="1.5"/>
    ${buildBrandMarkSvg(34, 12, 40, '#0C2D30', BRAND.emeraldSoft)}
    <text x="88" y="34" font-family="DejaVu Sans, Arial, sans-serif" font-size="16.5" font-weight="700" fill="#FFFFFF">AMANA PROPERTY PROTECTION</text>
    <text x="88" y="51" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" letter-spacing="1.8" fill="${BRAND.emeraldSoft}">STRUCTURED RECORDS &amp; EVIDENCE VERIFICATION</text>
    <text x="${width - 36}" y="39" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="${BRAND.emeraldSoft}">DOSSIER ${esc(scene.index)} / 0${totalScenes}</text>

    <rect x="40" y="114" width="5" height="330" rx="2.5" fill="${BRAND.emeraldSoft}"/>
    <text x="60" y="138" font-family="DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="700" letter-spacing="2.2" fill="${BRAND.emeraldSoft}">${esc(scene.kicker)}</text>
    <text x="60" y="186" font-family="DejaVu Sans, Arial, sans-serif" font-size="33" font-weight="700" fill="#FFFFFF">${esc(scene.headline1)}</text>
    <text x="60" y="228" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="${BRAND.goldSoft}">${esc(scene.headline2)}</text>

    <text x="60" y="274" font-family="DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="700" fill="#FFFFFF">${esc(scene.caption)}</text>
    <text x="60" y="318" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#D1FAE5">✓ ${esc(scene.bullets[0])}</text>
    <text x="60" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#D1FAE5">✓ ${esc(scene.bullets[1])}</text>
    <text x="60" y="386" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">✓ ${esc(scene.bullets[2])}</text>

    <rect x="40" y="652" width="${width - 80}" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.18"/>
    <rect x="40" y="652" width="${Math.round((width - 80) * progressRatio)}" height="4" rx="2" fill="${BRAND.emeraldSoft}"/>
    <text x="40" y="688" font-family="DejaVu Sans, Arial, sans-serif" font-size="13.5" font-weight="700" fill="#ECFDF5">rentalhub.com.ng/property-protection</text>
    <text x="${width - 40}" y="688" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Free Basic Records · Optional Priced Services · /verify-case</text>
  </svg>`;
}

function buildUiOverlaySvg(layout, scene, width, height) {
  const isVertical = height > width;
  let tx;
  let ty;
  let scale;

  if (isVertical) {
    scale = 1.44;
    tx = Math.round((width - 660 * scale) / 2);
    if (layout === 'tenant_magazine') {
      ty = 986;
    } else {
      ty = 918;
    }
  } else {
    if (layout === 'tenant_magazine') {
      scale = 1.03;
      tx = 560;
      ty = 152;
    } else {
      scale = 1.01;
      tx = 576;
      ty = 136;
    }
  }

  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="125%">
        <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#020817" flood-opacity="0.48"/>
      </filter>
    </defs>
    <g transform="translate(${tx}, ${ty}) scale(${scale})" filter="url(#cardShadow)">
      ${buildUiCardInner(scene.uiType, scene.route)}
    </g>
  </svg>`;
}

async function renderFormatForEdition(edition, formatKey, actDurationSec, voFile, musicFile) {
  const isVertical = formatKey === 'vertical_9x16';
  const width = isVertical ? 1080 : 1280;
  const height = isVertical ? 1920 : 720;
  const maxrate = isVertical ? '1450k' : '1200k';
  const bufsize = isVertical ? '2900k' : '2400k';
  const outName = isVertical ? edition.verticalFile : edition.landscapeFile;
  const finalOut = path.join(PROMO_DIR, outName);

  const workDir = path.join(TMP_DIR, edition.id, formatKey);
  fs.mkdirSync(workDir, { recursive: true });

  console.log(
    `   Rendering ${edition.id} [${formatKey}] (${width}x${height} @ ${FPS}fps, ${actDurationSec.toFixed(2)}s/act)...`
  );

  const resumeMode = process.argv.includes('--resume');
  const actClips = [];
  const framesPerAct = Math.round(actDurationSec * FPS);

  for (let i = 0; i < edition.scenes.length; i += 1) {
    const scene = edition.scenes[i];
    const actMp4 = path.join(workDir, `act_${scene.index}.mp4`);
    if (resumeMode && canReuseAct(actMp4, actDurationSec)) {
      console.log(`     Act ${scene.index}/0${edition.scenes.length}: [cached] ${scene.kicker}`);
      actClips.push(actMp4);
      continue;
    }

    console.log(`     Act ${scene.index}/0${edition.scenes.length}: ${scene.kicker}`);

    const photoSrc = path.join(ASSETS_DIR, scene.photo);
    const bgPng = path.join(workDir, `bg_${scene.index}.png`);
    const chromePng = path.join(workDir, `chrome_${scene.index}.png`);
    const uiPng = path.join(workDir, `ui_${scene.index}.png`);

    // 1. High-res architectural backdrop cropped cleanly to target aspect ratio
    await sharp(photoSrc)
      .resize(Math.round(width * 1.12), Math.round(height * 1.12), {
        fit: 'cover',
        position: 'center',
      })
      .modulate({ brightness: edition.layout === 'tenant_magazine' ? 1.02 : 0.88, saturation: 1.04 })
      .png()
      .toFile(bgPng);

    // 2. Rasterize static corporate chrome overlay + delayed-reveal authentic UI card
    await sharp(Buffer.from(buildFrameChromeSvg(edition.layout, scene, edition.scenes.length, width, height)))
      .png()
      .toFile(chromePng);

    await sharp(Buffer.from(buildUiOverlaySvg(edition.layout, scene, width, height)))
      .png()
      .toFile(uiPng);

    // 3. Smooth native FFmpeg Ken Burns zoompan + clean delayed UI card fade-in
    const zoomExpr =
      scene.zoomMode === 'in'
        ? `min(zoom+0.00055,1.09)`
        : `if(eq(on,1),1.09,max(zoom-0.00055,1.00))`;

    const filterComplex = [
      `[0:v]zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${framesPerAct}:s=${width}x${height}:fps=${FPS},format=rgba[bg]`,
      `[1:v]format=rgba[chrome]`,
      `[2:v]format=rgba,fade=t=in:st=0.45:d=0.55:alpha=1[ui]`,
      `[bg][chrome]overlay=0:0:shortest=1[step1]`,
      `[step1][ui]overlay=0:0:shortest=1,format=yuv420p[vout]`,
    ].join(';');

    execSync(
      `ffmpeg -y -loop 1 -i "${bgPng}" -loop 1 -i "${chromePng}" -loop 1 -i "${uiPng}" ` +
        `-filter_complex "${filterComplex}" -map "[vout]" -t ${actDurationSec.toFixed(3)} ` +
        `-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -r ${FPS} "${actMp4}"`,
      { stdio: 'pipe' }
    );

    actClips.push(actMp4);
  }

  // 4. Chain all acts with restrained corporate xfade cross-dissolves
  const visualMaster = path.join(TMP_DIR, `${edition.id}_${formatKey}_visual.mp4`);
  const inputsArg = actClips.map((c) => `-i "${c}"`).join(' ');
  const xfadeSteps = [];
  let prevLabel = '[0:v]';
  for (let i = 1; i < actClips.length; i += 1) {
    const offset = (i * (actDurationSec - XFADE_SEC)).toFixed(3);
    const outLabel = i === actClips.length - 1 ? '[vfinal]' : `[vx${i}]`;
    xfadeSteps.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE_SEC}:offset=${offset}${outLabel}`
    );
    prevLabel = outLabel;
  }

  execSync(
    `ffmpeg -y ${inputsArg} -filter_complex "${xfadeSteps.join(';')}" ` +
      `-map "[vfinal]" -c:v libx264 -profile:v high -level 4.1 -preset medium -crf 23 ` +
      `-maxrate ${maxrate} -bufsize ${bufsize} -pix_fmt yuv420p -r ${FPS} "${visualMaster}"`,
    { stdio: 'pipe' }
  );

  const totalDur = getMediaDuration(visualMaster);
  const fadeOutStart = Math.max(0, totalDur - 2.8).toFixed(2);

  // 5. Master Audio Mix: Preset corporate score (0.38 base, 2.2s fade-in, 2.8s fade-out)
  //    + sidechaincompress dynamic ducking under narration (650ms entrance delay)
  if (voFile && musicFile) {
    const audioFilter = [
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.50,afade=t=in:st=0:d=2.2,afade=t=out:st=${fadeOutStart}:d=2.8[mus]`,
      `[2:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=650|650,apad,asplit=2[vo_sc][vo_mix]`,
      `[mus][vo_sc]sidechaincompress=threshold=0.04:ratio=4.5:attack=45:release=320:makeup=1[mus_duck]`,
      `[mus_duck][vo_mix]amix=inputs=2:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95:level=0[aout]`,
    ].join(';');

    execSync(
      `ffmpeg -y -i "${visualMaster}" -stream_loop -1 -i "${musicFile}" -i "${voFile}" ` +
        `-filter_complex "${audioFilter}" -map 0:v:0 -map "[aout]" -t ${totalDur.toFixed(3)} ` +
        `-c:v copy -c:a aac -b:a 128k -ar 48000 -movflags +faststart "${finalOut}"`,
      { stdio: 'pipe' }
    );
  } else if (voFile) {
    const voiceFilter = '[1:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=650|650,apad,alimiter=limit=0.95:level=0[aout]';
    execSync(
      `ffmpeg -y -i "${visualMaster}" -i "${voFile}" -filter_complex "${voiceFilter}" -map 0:v:0 -map "[aout]" -t ${totalDur.toFixed(3)} -c:v copy -c:a aac -b:a 128k -ar 48000 -movflags +faststart "${finalOut}"`,
      { stdio: 'pipe' }
    );
  } else if (musicFile) {
    const audioFilter = `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.58,afade=t=in:st=0:d=2.2,afade=t=out:st=${fadeOutStart}:d=2.8,alimiter=limit=0.95:level=0[aout]`;
    execSync(
      `ffmpeg -y -i "${visualMaster}" -stream_loop -1 -i "${musicFile}" ` +
        `-filter_complex "${audioFilter}" -map 0:v:0 -map "[aout]" -t ${totalDur.toFixed(3)} ` +
        `-c:v copy -c:a aac -b:a 128k -ar 48000 -movflags +faststart "${finalOut}"`,
      { stdio: 'pipe' }
    );
  } else {
    fs.copyFileSync(visualMaster, finalOut);
  }

  if (fs.existsSync(BUILD_PROMO_DIR)) {
    fs.copyFileSync(finalOut, path.join(BUILD_PROMO_DIR, outName));
  }

  const postersDir = path.join(PROMO_DIR, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const posterFile = path.join(postersDir, `${edition.id}-${isVertical ? '9x16' : '16x9'}.jpg`);
  const posterScale = isVertical ? '540:-2' : '800:-2';
  execSync(
    `ffmpeg -y -ss 5.5 -i "${finalOut}" -vf "scale=${posterScale}" -frames:v 1 -q:v 4 "${posterFile}"`,
    { stdio: 'pipe' }
  );

  const sizeMb = (fs.statSync(finalOut).size / (1024 * 1024)).toFixed(2);
  console.log(`   Published ${outName} (${sizeMb} MB)`);
}

async function renderEdition(edition) {
  console.log(`\n=== EDITION: ${edition.id.toUpperCase()} (${edition.layout}) ===`);
  const voFile = await synthesizeVoiceover(edition.id, edition.narration);
  const musicFile = resolveMusicTrack(edition.musicTrack);
  console.log(`   Preset score: ${musicFile ? path.basename(musicFile) : 'none'}`);

  const voDur = voFile ? getMediaDuration(voFile) : edition.scenes.length * 7.8;
  // Smooth music intro (0.65s) + full voiceover + 2.8s branded music outro tail
  const targetTotalSec = Math.max(edition.scenes.length * 7.5, voDur + 3.8);
  const actDurationSec =
    (targetTotalSec + (edition.scenes.length - 1) * XFADE_SEC) / edition.scenes.length;

  console.log(
    `   Calibrated duration: ${targetTotalSec.toFixed(1)}s (${actDurationSec.toFixed(2)}s per act)`
  );

  const verticalOnly = process.argv.includes('--vertical-only');
  const landscapeOnly = process.argv.includes('--landscape-only');

  if (!landscapeOnly) {
    await renderFormatForEdition(edition, 'vertical_9x16', actDurationSec, voFile, musicFile);
  }
  if (!verticalOnly) {
    await renderFormatForEdition(edition, 'landscape_16x9', actDurationSec, voFile, musicFile);
  }
  return { editionId: edition.id, narrated: Boolean(voFile) };
}

async function main() {
  fs.mkdirSync(PROMO_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const results = [];
  const clipArg = process.argv.find((a) => a.startsWith('--clip='));
  const target = clipArg ? clipArg.split('=')[1].trim().toLowerCase() : 'all';

  const keys = target === 'all' ? Object.keys(EDITIONS) : [target];
  for (const key of keys) {
    if (!EDITIONS[key]) {
      throw new Error(`Unknown --clip="${key}". Expected one of: ${Object.keys(EDITIONS).join(', ')}, all`);
    }
    results.push(await renderEdition(EDITIONS[key]));
  }
  const missing = results.filter(result => !result.narrated).map(result => result.editionId);
  console.log(missing.length ? `Commercial rendering complete. WITHOUT generated narration: ${missing.join(', ')}.` : 'Commercial rendering complete. All requested editions include Azure narration.');
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(ROOT_DIR, '.env'), quiet: true });
  main().catch((error) => {
    console.error('Commercial render failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { EDITIONS, synthesizeVoiceover, canReuseAct, main };
