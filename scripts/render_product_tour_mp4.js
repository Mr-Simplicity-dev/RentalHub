/**
 * Amana RentalHub NG — Executive PropTech Commercial Renderer
 *
 * Renders broadcast-grade 9:16 vertical (1080x1920) and 16:9 widescreen (1280x720)
 * commercials pairing architectural cinematography (native FFmpeg Ken Burns motion +
 * cross-dissolve transitions) with authentic RentalHub NG application interfaces.
 *
 * Usage:
 *   node scripts/render_product_tour_mp4.js
 *   node scripts/render_product_tour_mp4.js --vertical-only
 *   node scripts/render_product_tour_mp4.js --landscape-only
 *   node scripts/render_product_tour_mp4.js --regen-vo
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT_DIR = path.join(__dirname, '..');
const PROMO_DIR = path.join(ROOT_DIR, 'client', 'public', 'promo');
const BUILD_PROMO_DIR = path.join(ROOT_DIR, 'client', 'build', 'promo');
const ASSETS_DIR = path.join(ROOT_DIR, 'social-ads', 'assets');
const PUBLIC_DIR = path.join(ROOT_DIR, 'client', 'public');
const TMP_DIR = path.join('/tmp', 'amana_commercial_render');

fs.mkdirSync(PROMO_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const FPS = 30;
const XFADE_SEC = 0.45;

const BRAND = {
  navy: '#071A3D',
  navyDark: '#041129',
  navyCard: '#0B224C',
  gold: '#C89B3C',
  goldSoft: '#E2C275',
  white: '#FFFFFF',
  slateLight: '#CBD5E1',
  slateMuted: '#94A3B8',
  emerald: '#059669',
};

const SCENES = [
  {
    id: 1,
    index: '01',
    kicker: 'PROPERTY DISCOVERY',
    headline1: 'Structured Property Search',
    headline2: 'Across 36 States & the FCT',
    caption: 'Filter by state, LGA, bedrooms, and annual budget nationwide.',
    route: 'rentalhub.com.ng/properties',
    photo: path.join(ASSETS_DIR, 'hero-terrace.avif'),
    zoomMode: 'in',
    bullets: [
      'Nationwide coverage across all 36 states and Abuja FCT',
      'Structured filters for state, LGA, property type, and budget',
      'Built-in tenant property request workflow',
    ],
  },
  {
    id: 2,
    index: '02',
    kicker: 'LISTING TRANSPARENCY',
    headline1: 'Clear Property Profiles',
    headline2: 'Before You Commit',
    caption: 'Review specs, verification status, and move-in estimates.',
    route: 'rentalhub.com.ng/properties/1042',
    photo: path.join(ASSETS_DIR, 'photo-1761347604157-3d667ff62778.avif'),
    zoomMode: 'out',
    bullets: [
      'Visible listing and landlord verification indicators',
      'Integrated monthly and move-in rent calculator',
      'Structured property features and media previews',
    ],
  },
  {
    id: 3,
    index: '03',
    kicker: 'IDENTITY & ACCESS',
    headline1: 'Identity-Verified Enquiries',
    headline2: 'Transparent Detail Unlock',
    caption: 'Identity verification supports accountable enquiries & access.',
    route: 'rentalhub.com.ng/verify-identity',
    photo: path.join(ASSETS_DIR, 'photo-1778166166324-550d324133ea.avif'),
    zoomMode: 'in',
    bullets: [
      'Account verification with NIN and live photo checks',
      'Transparent Paystack or bank-transfer unlock flow',
      'In-platform messaging and calling once unlocked',
    ],
  },
  {
    id: 4,
    index: '04',
    kicker: 'PAYMENTS & LEDGER',
    headline1: 'Tracked Rent Payments',
    headline2: 'Structured Wallet Clearing',
    caption: 'Paystack & bank-transfer ledger with 14-working-day clearing.',
    route: 'rentalhub.com.ng/dashboard',
    photo: path.join(ASSETS_DIR, 'photo-1767894862472-99a8667aaad0.avif'),
    zoomMode: 'out',
    bullets: [
      'Separated Pending Clearing and Cleared wallet balances',
      '14-working-day hold for structured refund review eligibility',
      'Dedicated payment history and downloadable receipts',
    ],
  },
  {
    id: 5,
    index: '05',
    kicker: 'TENANCY & PROTECTION',
    headline1: 'Digital Tenancy Agreements',
    headline2: '& Property Protection',
    caption: 'Versioned agreements, SHA-256 hashes & Property Protection.',
    route: 'rentalhub.com.ng/tenancy-agreements',
    photo: path.join(ASSETS_DIR, 'photo-1595243643203-06ba168495ea.avif'),
    zoomMode: 'in',
    bullets: [
      'Draft → Landlord Sign → Tenant Sign → Executed lifecycle',
      'SHA-256 document hash and immutable signature event log',
      'Free basic Property Protection records & optional services',
    ],
  },
  {
    id: 6,
    index: '06',
    kicker: 'AMANA RENTALHUB NG',
    headline1: 'Structured Property Rentals',
    headline2: 'Built for Trust & Clarity',
    caption: 'Built for tenants, landlords, agents, and institutions.',
    route: 'rentalhub.com.ng',
    photo: path.join(PUBLIC_DIR, 'hero-main.avif'),
    zoomMode: 'out',
    bullets: [
      'Dedicated dashboards for tenants, landlords, and agents',
      'Available in 8 languages across web and mobile',
      'Visit rentalhub.com.ng to get started',
    ],
  },
];

// Tight, executive ~44-47 second factual narration script
const NARRATION_SCRIPT =
  'Renting property in Nigeria deserves structure and clarity. ' +
  'Meet Amana RentalHub NG. ' +
  'Search residential listings across all thirty-six states and Abuja by location, bedrooms, and annual budget. ' +
  'Review property specifications, landlord verification indicators, and move-in cost estimates in one view. ' +
  'Account identity verification supports accountable enquiries before unlocking full property details and direct messaging. ' +
  'Track Paystack and bank-transfer rent payments through an auditable wallet ledger with a fourteen-working-day clearing window. ' +
  'Manage versioned digital tenancy agreements with timestamped signature logs, plus Property Protection records. ' +
  'Visit rentalhub dot com dot n g today.';

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function findCorporateMusicTrack() {
  const candidates = [
    path.join(
      ROOT_DIR,
      'Video-Presets_290_Royalty_Free_Background_Music_Tracks',
      'Mp3',
      'Business & Corporate',
      'Corporate Inspiring.mp3'
    ),
    path.join(
      ROOT_DIR,
      'Video-Presets_290_Royalty_Free_Background_Music_Tracks',
      'Mp3',
      'Business & Corporate',
      'Corporate.mp3'
    ),
    path.join(
      ROOT_DIR,
      'Video-Presets_290_Royalty_Free_Background_Music_Tracks',
      'Mp3',
      'Business & Corporate',
      'An Inspiring Corporate.mp3'
    ),
    path.join(ROOT_DIR, 'video-ads', 'public', 'audio', 'music.wav'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function synthesizeVoiceover(text, outFile) {
  if (fs.existsSync(outFile) && !process.argv.includes('--regen-vo')) {
    console.log('   Using cached narration audio:', outFile);
    return outFile;
  }

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunkFiles = [];

  try {
    for (let i = 0; i < sentences.length; i += 1) {
      const chunkText = sentences[i].trim();
      if (!chunkText) continue;
      const url =
        'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
        encodeURIComponent(chunkText) +
        '&tl=en-GB&client=tw-ob';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 512) throw new Error('TTS returned empty audio');
      const chunkFile = path.join(TMP_DIR, `vo_tight_${i}.mp3`);
      fs.writeFileSync(chunkFile, buf);
      chunkFiles.push(chunkFile);
      await new Promise((r) => setTimeout(r, 80));
    }

    const concatList = path.join(TMP_DIR, 'vo_tight_concat.txt');
    fs.writeFileSync(concatList, chunkFiles.map((f) => `file '${f}'`).join('\n'));
    const rawFile = path.join(TMP_DIR, 'vo_tight_raw.mp3');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${rawFile}"`, {
      stdio: 'pipe',
    });
    // Slightly crisper broadcast pacing (1.06x) + warm studio EQ
    execSync(
      `ffmpeg -y -i "${rawFile}" -af "atempo=1.06,highpass=f=90,equalizer=f=3000:t=q:w=1.2:g=2.2,acompressor=threshold=-18dB:ratio=2.8:attack=6:release=60,volume=1.28" "${outFile}"`,
      { stdio: 'pipe' }
    );
    console.log('   Synthesized executive voiceover:', outFile);
    return outFile;
  } catch (err) {
    console.warn(`   Voiceover unavailable (${err.message}); using corporate instrumental master.`);
    return null;
  }
}

function buildBrandMarkSvg(x, y, size) {
  const s = size / 48;
  return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <rect x="0" y="0" width="48" height="48" rx="10" fill="#0C244E" stroke="${BRAND.gold}" stroke-width="2"/>
      <path d="M24 10 L38 22 L34.5 22 L34.5 36 L13.5 36 L13.5 22 L10 22 Z" fill="none" stroke="${BRAND.white}" stroke-width="2.4" stroke-linejoin="round"/>
      <rect x="20.5" y="25" width="7" height="11" rx="1.2" fill="${BRAND.gold}"/>
    </g>
  `;
}

function buildAuthenticUiCardSvg(sceneId, cardWidth, cardHeight) {
  const scale = Math.min(cardWidth / 640, cardHeight / 440);
  let body = '';

  if (sceneId === 1) {
    body = `
      <rect x="24" y="64" width="592" height="46" rx="8" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2"/>
      <circle cx="46" cy="87" r="7" fill="none" stroke="#64748B" stroke-width="2"/>
      <line x1="51" y1="92" x2="56" y2="97" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
      <text x="68" y="92" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="600" fill="#0F172A">Maitama, Abuja FCT  ·  3 Bedroom</text>
      <rect x="498" y="71" width="108" height="32" rx="6" fill="${BRAND.navy}"/>
      <text x="552" y="92" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF" text-anchor="middle">Search</text>

      <text x="24" y="132" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#475569">Coverage: 36 States + FCT   |   Type: Apartment / Terrace   |   Status: Available</text>

      <rect x="24" y="150" width="286" height="202" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <rect x="24" y="150" width="286" height="86" rx="10" fill="#0C244E"/>
      <rect x="24" y="220" width="286" height="16" fill="#0C244E"/>
      <rect x="38" y="164" width="112" height="24" rx="4" fill="${BRAND.navy}" stroke="${BRAND.gold}" stroke-width="1"/>
      <text x="94" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="${BRAND.goldSoft}" text-anchor="middle">VERIFIED LISTING</text>
      <text x="38" y="216" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Maitama District, Abuja FCT</text>
      <text x="38" y="262" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A">3 Bedroom Residence</text>
      <text x="38" y="284" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B">3 Beds · 4 Baths · Gated Compound</text>
      <line x1="38" y1="302" x2="296" y2="302" stroke="#F1F5F9" stroke-width="1"/>
      <text x="38" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="${BRAND.navy}">₦4,500,000</text>
      <text x="296" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B" text-anchor="end">per year</text>

      <rect x="330" y="150" width="286" height="202" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <rect x="330" y="150" width="286" height="86" rx="10" fill="#102B5C"/>
      <rect x="330" y="220" width="286" height="16" fill="#102B5C"/>
      <rect x="344" y="164" width="112" height="24" rx="4" fill="${BRAND.navy}" stroke="${BRAND.gold}" stroke-width="1"/>
      <text x="400" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="${BRAND.goldSoft}" text-anchor="middle">VERIFIED LISTING</text>
      <text x="344" y="216" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Nasarawa GRA, Kano</text>
      <text x="344" y="262" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A">4 Bedroom Terrace</text>
      <text x="344" y="284" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B">4 Beds · 5 Baths · Borehole Water</text>
      <line x1="344" y1="302" x2="602" y2="302" stroke="#F1F5F9" stroke-width="1"/>
      <text x="344" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="${BRAND.navy}">₦3,200,000</text>
      <text x="602" y="330" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B" text-anchor="end">per year</text>

      <rect x="24" y="368" width="592" height="44" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="40" y="395" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#475569">Need a specific neighbourhood? Submit a guided tenant property request.</text>
      <text x="600" y="395" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#0284C7" text-anchor="end">Request →</text>
    `;
  } else if (sceneId === 2) {
    body = `
      <rect x="24" y="64" width="592" height="96" rx="10" fill="${BRAND.navy}"/>
      <text x="44" y="100" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">3 Bedroom Serviced Residence</text>
      <text x="44" y="124" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1">Maitama District, Abuja FCT  ·  Illustrative Listing Preview</text>
      <rect x="446" y="84" width="150" height="30" rx="5" fill="#FFFFFF"/>
      <text x="521" y="104" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="${BRAND.navy}" text-anchor="middle">Landlord Verified</text>

      <rect x="24" y="176" width="592" height="84" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="44" y="212" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="700" fill="${BRAND.navy}">₦4,500,000</text>
      <text x="44" y="236" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B">Annual rent  ·  transparent pricing breakdown</text>
      <rect x="348" y="198" width="248" height="38" rx="7" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1.2"/>
      <text x="472" y="222" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="#0369A1" text-anchor="middle">Calculate Monthly &amp; Move-In Costs</text>

      <rect x="24" y="276" width="186" height="66" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="117" y="306" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A" text-anchor="middle">3 Bedrooms</text>
      <text x="117" y="326" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B" text-anchor="middle">En-suite Layout</text>

      <rect x="227" y="276" width="186" height="66" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="320" y="306" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A" text-anchor="middle">4 Bathrooms</text>
      <text x="320" y="326" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B" text-anchor="middle">Structured Specs</text>

      <rect x="430" y="276" width="186" height="66" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="523" y="306" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A" text-anchor="middle">Photo &amp; Video</text>
      <text x="523" y="326" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B" text-anchor="middle">Media Supported</text>

      <rect x="24" y="358" width="592" height="54" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="44" y="390" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#334155">Structured landlord amenities &amp; verified review summaries where available.</text>
    `;
  } else if (sceneId === 3) {
    body = `
      <rect x="24" y="64" width="592" height="154" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <rect x="44" y="84" width="38" height="38" rx="8" fill="${BRAND.navy}"/>
      <text x="63" y="109" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="${BRAND.goldSoft}" text-anchor="middle">ID</text>
      <text x="96" y="100" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Account Identity Verification</text>
      <text x="96" y="120" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#64748B">Required prior to unlocking full address details or initiating rent payments</text>
      <rect x="514" y="86" width="82" height="26" rx="5" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
      <text x="555" y="103" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#065F46" text-anchor="middle">VERIFIED</text>

      <rect x="44" y="142" width="172" height="56" rx="7" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="58" y="164" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">STEP 01</text>
      <text x="58" y="184" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Email &amp; Phone Check</text>

      <rect x="234" y="142" width="172" height="56" rx="7" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="248" y="164" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">STEP 02</text>
      <text x="248" y="184" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">NIN &amp; Live Photo</text>

      <rect x="424" y="142" width="172" height="56" rx="7" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="438" y="164" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">STEP 03</text>
      <text x="438" y="184" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Accountable Enquiry</text>

      <rect x="24" y="236" width="592" height="176" rx="10" fill="#FFFBEB" stroke="#FDE68A" stroke-width="1.2"/>
      <text x="44" y="270" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Unlock Full Property Details</text>
      <text x="44" y="296" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#475569">Complete the transparent platform unlock or active tenant subscription via</text>
      <text x="44" y="316" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#475569">Paystack or bank transfer to access full address, video, and landlord contact.</text>
      <rect x="44" y="342" width="210" height="44" rx="7" fill="${BRAND.navy}"/>
      <text x="149" y="369" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#FFFFFF" text-anchor="middle">Pay to Unlock Details</text>
      <rect x="270" y="342" width="236" height="44" rx="7" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2"/>
      <text x="388" y="369" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">In-Platform Messaging &amp; Calls</text>
    `;
  } else if (sceneId === 4) {
    body = `
      <rect x="24" y="64" width="592" height="348" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="44" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="700" fill="#0F172A">Wallet &amp; Rent Payment Ledger</text>
      <text x="596" y="98" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#64748B" text-anchor="end">Paystack &amp; Bank Transfer</text>
      <line x1="44" y1="114" x2="596" y2="114" stroke="#F1F5F9" stroke-width="1.2"/>

      <rect x="44" y="132" width="266" height="108" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="60" y="158" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#64748B">PENDING CLEARING</text>
      <text x="60" y="192" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="${BRAND.navy}">₦4,387,500</text>
      <text x="60" y="218" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#475569">14-working-day refund review window</text>

      <rect x="330" y="132" width="266" height="108" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="346" y="158" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#64748B">CLEARED BALANCE</text>
      <text x="346" y="192" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="#047857">₦1,850,000</text>
      <text x="346" y="218" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#475569">Eligible for verified bank withdrawal</text>

      <text x="44" y="274" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700" fill="#475569">RECENT LEDGER ACTIVITY (ILLUSTRATIVE)</text>

      <rect x="44" y="288" width="552" height="46" rx="7" fill="#F8FAFC"/>
      <text x="60" y="316" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Rent Payment  ·  Ref #RH-40219</text>
      <rect x="466" y="299" width="116" height="24" rx="4" fill="#FEF3C7"/>
      <text x="524" y="315" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#92400E" text-anchor="middle">PENDING CLEAR</text>

      <rect x="44" y="346" width="552" height="46" rx="7" fill="#F8FAFC"/>
      <text x="60" y="374" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Property Detail Unlock  ·  Paystack Verified</text>
      <rect x="486" y="357" width="96" height="24" rx="4" fill="#ECFDF5"/>
      <text x="534" y="373" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#065F46" text-anchor="middle">RECORDED</text>
    `;
  } else if (sceneId === 5) {
    body = `
      <rect x="24" y="64" width="592" height="214" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2"/>
      <text x="44" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Residential Tenancy Agreement  ·  Version 1</text>
      <rect x="476" y="77" width="120" height="26" rx="5" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1"/>
      <text x="536" y="94" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="700" fill="#065F46" text-anchor="middle">FULLY EXECUTED</text>
      <line x1="44" y1="114" x2="596" y2="114" stroke="#F1F5F9" stroke-width="1.2"/>

      <circle cx="54" cy="140" r="6" fill="${BRAND.emerald}"/>
      <text x="72" y="144" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Draft Prepared &amp; Jurisdiction Metadata Attached</text>

      <circle cx="54" cy="172" r="6" fill="${BRAND.emerald}"/>
      <text x="72" y="176" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Landlord Review &amp; Timestamped Signature Logged</text>

      <circle cx="54" cy="204" r="6" fill="${BRAND.emerald}"/>
      <text x="72" y="208" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Tenant Review &amp; Authenticated Acceptance Recorded</text>

      <rect x="44" y="226" width="552" height="36" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="58" y="249" font-family="DejaVu Sans Mono, monospace" font-size="11" fill="#475569">SHA-256 Document Hash: 8f4c92a1…e91a  ·  Audit Trail Locked</text>

      <rect x="24" y="294" width="592" height="118" rx="10" fill="${BRAND.navy}"/>
      <text x="44" y="326" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700" fill="#FFFFFF">Amana Property Protection  ·  /property-protection</text>
      <text x="44" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Free basic property records and case reporting (including unlisted land).</text>
      <text x="44" y="374" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#CBD5E1">Optional priced registry searches, survey reports &amp; physical inspections where available.</text>
      <text x="44" y="396" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="600" fill="${BRAND.goldSoft}">Public Dispute Evidence Verification  ·  /verify-case</text>
    `;
  } else {
    body = `
      <rect x="24" y="64" width="592" height="348" rx="12" fill="${BRAND.navy}"/>
      <rect x="24" y="64" width="592" height="4" fill="${BRAND.gold}"/>
      ${buildBrandMarkSvg(296, 102, 56)}
      <text x="320" y="196" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">AMANA RENTALHUB NG</text>
      <text x="320" y="226" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="600" fill="${BRAND.goldSoft}" text-anchor="middle" letter-spacing="2">STRUCTURED PROPERTY RENTALS IN NIGERIA</text>
      <line x1="120" y1="252" x2="520" y2="252" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1"/>
      <text x="320" y="286" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1" text-anchor="middle">Property Search  ·  Identity Verification  ·  Wallet Clearing</text>
      <text x="320" y="310" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#CBD5E1" text-anchor="middle">Digital Tenancy Agreements  ·  Property Protection</text>
      <rect x="190" y="338" width="260" height="46" rx="8" fill="${BRAND.gold}"/>
      <text x="320" y="367" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="${BRAND.navy}" text-anchor="middle">rentalhub.com.ng</text>
    `;
  }

  return `
    <g transform="scale(${scale.toFixed(4)})">
      <rect x="0" y="0" width="640" height="440" rx="14" fill="#F1F5F9" stroke="#CBD5E1" stroke-opacity="0.7" stroke-width="1.5"/>
      <rect x="0" y="0" width="640" height="44" rx="14" fill="#FFFFFF"/>
      <rect x="0" y="30" width="640" height="14" fill="#FFFFFF"/>
      <line x1="0" y1="44" x2="640" y2="44" stroke="#E2E8F0" stroke-width="1"/>
      <circle cx="22" cy="22" r="5" fill="#CBD5E1"/>
      <circle cx="38" cy="22" r="5" fill="#CBD5E1"/>
      <circle cx="54" cy="22" r="5" fill="#CBD5E1"/>
      <text x="74" y="26" font-family="DejaVu Sans Mono, monospace" font-size="12" fill="#475569">${escapeXml(SCENES[sceneId - 1].route)}</text>
      <rect x="478" y="11" width="144" height="22" rx="4" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="550" y="26" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="600" fill="#64748B" text-anchor="middle">Illustrative UI Preview</text>
      ${body}
    </g>
  `;
}

function buildVerticalChromeSvg(scene) {
  return `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topScrimV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#041129" stop-opacity="0.52"/>
        <stop offset="40%" stop-color="#041129" stop-opacity="0.18"/>
        <stop offset="70%" stop-color="#041129" stop-opacity="0.68"/>
        <stop offset="100%" stop-color="#041129" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <rect x="0" y="300" width="1080" height="1620" fill="url(#topScrimV)"/>
    <rect x="0" y="0" width="1080" height="300" fill="${BRAND.navy}"/>
    <rect x="0" y="296" width="1080" height="4" fill="${BRAND.gold}"/>
    ${buildBrandMarkSvg(508, 42, 64)}
    <text x="540" y="148" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="38" fill="${BRAND.goldSoft}" text-anchor="middle" letter-spacing="4">AMANA RENTALHUB</text>
    <text x="540" y="194" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="24" fill="#FFFFFF" text-anchor="middle" letter-spacing="2.2">NIGERIA'S STRUCTURED RENTAL PLATFORM</text>
    <text x="540" y="242" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="20" fill="#94A3B8" text-anchor="middle" letter-spacing="3">RENTALHUB.COM.NG</text>

    <g transform="translate(72, 1516)">
      <rect x="0" y="6" width="6" height="236" fill="${BRAND.gold}"/>
      <text x="30" y="32" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="22" fill="${BRAND.goldSoft}" letter-spacing="3.2">${escapeXml(scene.index)}  ·  ${escapeXml(scene.kicker)}</text>
      <text x="30" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="52" fill="#FFFFFF">${escapeXml(scene.headline1)}</text>
      <text x="30" y="156" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="46" fill="${BRAND.goldSoft}">${escapeXml(scene.headline2)}</text>
      <text x="30" y="216" font-family="DejaVu Sans, Arial, sans-serif" font-weight="400" font-size="22" fill="#E2E8F0">${escapeXml(scene.caption)}</text>
    </g>
  </svg>
  `;
}

function buildVerticalUiLayerSvg(scene) {
  return `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadowV" x="-10%" y="-10%" width="120%" height="125%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#020817" flood-opacity="0.45"/>
      </filter>
    </defs>
    <g transform="translate(90, 610)" filter="url(#cardShadowV)">
      ${buildAuthenticUiCardSvg(scene.id, 900, 620)}
    </g>
  </svg>
  `;
}

function buildLandscapeChromeSvg(scene) {
  const bulletsSvg = scene.bullets
    .map(
      (b, idx) => `
      <g transform="translate(0, ${idx * 42})">
        <rect x="0" y="9" width="8" height="8" rx="2" fill="${BRAND.gold}"/>
        <text x="20" y="18" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#E2E8F0">${escapeXml(b)}</text>
      </g>
    `
    )
    .join('');

  return `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leftScrimL" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#041129" stop-opacity="0.93"/>
        <stop offset="48%" stop-color="#071A3D" stop-opacity="0.80"/>
        <stop offset="100%" stop-color="#041129" stop-opacity="0.54"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="1280" height="720" fill="url(#leftScrimL)"/>
    <rect x="0" y="0" width="1280" height="78" fill="${BRAND.navy}" fill-opacity="0.96"/>
    <rect x="0" y="76" width="1280" height="2" fill="${BRAND.gold}"/>
    ${buildBrandMarkSvg(48, 17, 42)}
    <text x="104" y="38" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="18" fill="#FFFFFF" letter-spacing="1.5">AMANA RENTALHUB NG</text>
    <text x="104" y="58" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="${BRAND.goldSoft}" letter-spacing="1.2">STRUCTURED PROPERTY RENTALS IN NIGERIA</text>
    <text x="1232" y="45" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="15" fill="#CBD5E1" text-anchor="end" letter-spacing="1">rentalhub.com.ng</text>

    <g transform="translate(52, 146)">
      <rect x="0" y="4" width="4" height="162" fill="${BRAND.gold}"/>
      <text x="22" y="22" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="14" fill="${BRAND.goldSoft}" letter-spacing="2.4">${escapeXml(scene.index)}  ·  ${escapeXml(scene.kicker)}</text>
      <text x="22" y="68" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="30" fill="#FFFFFF">${escapeXml(scene.headline1)}</text>
      <text x="22" y="106" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="24" fill="${BRAND.goldSoft}">${escapeXml(scene.headline2)}</text>
      <text x="22" y="146" font-family="DejaVu Sans, Arial, sans-serif" font-size="14.5" fill="#CBD5E1">${escapeXml(scene.caption)}</text>
      <line x1="0" y1="204" x2="520" y2="204" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1"/>
      <g transform="translate(0, 232)">
        ${bulletsSvg}
      </g>
    </g>
  </svg>
  `;
}

function buildLandscapeUiLayerSvg(scene) {
  return `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadowL" x="-10%" y="-10%" width="120%" height="125%">
        <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#020817" flood-opacity="0.48"/>
      </filter>
    </defs>
    <g transform="translate(612, 144)" filter="url(#cardShadowL)">
      ${buildAuthenticUiCardSvg(scene.id, 616, 424)}
    </g>
  </svg>
  `;
}

/**
 * Renders a complete format (9:16 or 16:9) natively in FFmpeg:
 * - High-resolution upscaled architectural stills with smooth Ken Burns zoompan
 * - Clean transparent PNG chrome & lower-third overlay
 * - Delayed smooth fade-in of the authentic RentalHub UI card after establishing shot
 * - Silky xfade cross-dissolves across all 6 scenes
 */
async function renderFormatVideo(formatKey, width, height, sceneDurSec, outVisualMp4) {
  const isVertical = width < height;
  const workDir = path.join(TMP_DIR, formatKey);
  fs.mkdirSync(workDir, { recursive: true });

  console.log(`\n3. Rendering ${formatKey} (${width}x${height} @ ${FPS}fps, ${sceneDurSec.toFixed(2)}s/act)...`);

  const sceneClipPaths = [];
  const totalFramesPerScene = Math.round(sceneDurSec * FPS);

  for (let i = 0; i < SCENES.length; i += 1) {
    const scene = SCENES[i];
    const photoPath = fs.existsSync(scene.photo)
      ? scene.photo
      : path.join(PUBLIC_DIR, 'hero-main.avif');

    const bgPng = path.join(workDir, `bg_${scene.id}.png`);
    const chromePng = path.join(workDir, `chrome_${scene.id}.png`);
    const uiPng = path.join(workDir, `ui_${scene.id}.png`);
    const clipMp4 = path.join(workDir, `scene_${scene.id}.mp4`);
    if (process.argv.includes("--resume") && fs.existsSync(clipMp4) && fs.statSync(clipMp4).size > 50000) {
      sceneClipPaths.push(clipMp4);
      console.log(`   [${formatKey}] Reusing rendered Act ${scene.index}/0${SCENES.length}: ${scene.kicker}`);
      continue;
    }

    // 1. Upscale architectural photo cleanly with Lanczos3 + architectural sharpening
    await sharp(photoPath)
      .resize(Math.round(width * 1.15), Math.round(height * 1.15), {
        fit: 'cover',
        position: 'centre',
        kernel: 'lanczos3',
      })
      .sharpen({ sigma: 0.85, m1: 0.75, m2: 1.3 })
      .modulate({ brightness: 0.94, saturation: 0.92 })
      .png()
      .toFile(bgPng);

    // 2. Rasterize chrome + lower-third caption PNG
    const chromeSvg = isVertical ? buildVerticalChromeSvg(scene) : buildLandscapeChromeSvg(scene);
    await sharp(Buffer.from(chromeSvg)).png().toFile(chromePng);

    // 3. Rasterize authentic UI card PNG
    const uiSvg = isVertical ? buildVerticalUiLayerSvg(scene) : buildLandscapeUiLayerSvg(scene);
    await sharp(Buffer.from(uiSvg)).png().toFile(uiPng);

    // 4. Native FFmpeg smooth Ken Burns + delayed UI card fade-in
    const zoomExpr =
      scene.zoomMode === 'in'
        ? `1.00+0.08*on/${totalFramesPerScene}`
        : `1.08-0.08*on/${totalFramesPerScene}`;

    const uiFadeInStart = scene.id === 6 ? 0.35 : 0.95;
    const uiFadeOutStart = Math.max(uiFadeInStart + 1.0, sceneDurSec - 0.45);

    const filterComplex = [
      `[0:v]zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFramesPerScene}:s=${width}x${height}:fps=${FPS},format=rgba[bg]`,
      `[1:v]format=rgba[chrome]`,
      `[2:v]format=rgba,fade=t=in:st=${uiFadeInStart.toFixed(2)}:d=0.55:alpha=1,fade=t=out:st=${uiFadeOutStart.toFixed(2)}:d=0.35:alpha=1[ui]`,
      `[bg][chrome]overlay=0:0:shortest=1[s1]`,
      `[s1][ui]overlay=0:0:shortest=1,format=yuv420p[outv]`,
    ].join(';');

    execSync(
      `ffmpeg -y -loop 1 -i "${bgPng}" -loop 1 -t ${sceneDurSec.toFixed(2)} -i "${chromePng}" -loop 1 -t ${sceneDurSec.toFixed(2)} -i "${uiPng}" ` +
        `-filter_complex "${filterComplex}" -map "[outv]" -t ${sceneDurSec.toFixed(2)} -r ${FPS} ` +
        `-c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p "${clipMp4}"`,
      { stdio: 'pipe' }
    );

    sceneClipPaths.push(clipMp4);
    console.log(`   [${formatKey}] Rendered Act ${scene.index}/0${SCENES.length}: ${scene.kicker}`);
  }

  // 5. Chain silky cross-dissolves (xfade) across all 6 clips
  const inputsArg = sceneClipPaths.map((p) => `-i "${p}"`).join(' ');
  const xfadeSteps = [];
  let prevLabel = '[0:v]';
  let currentOffset = sceneDurSec - XFADE_SEC;

  for (let i = 1; i < sceneClipPaths.length; i += 1) {
    const outLabel = i === sceneClipPaths.length - 1 ? '[merged]' : `[xf${i}]`;
    xfadeSteps.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE_SEC}:offset=${currentOffset.toFixed(2)}${outLabel}`
    );
    prevLabel = outLabel;
    currentOffset += sceneDurSec - XFADE_SEC;
  }

  execSync(
    `ffmpeg -y ${inputsArg} -filter_complex "${xfadeSteps.join(';')}" -map "[merged]" ` +
      `-c:v libx264 -preset fast -profile:v high -crf 20 -pix_fmt yuv420p "${outVisualMp4}"`,
    { stdio: 'pipe' }
  );

  console.log(`   Encoded ${formatKey} visual master: ${outVisualMp4}`);
}

function muxAudioAndPublish(visualMp4, bgMusic, voAudio, totalDuration, finalPublicOut, finalBuildOut) {
  const fadeOutStart = Math.max(1, totalDuration - 2.0).toFixed(2);
  let cmd;

  if (bgMusic && voAudio) {
    const audioFilter =
      `[1:a]aloop=loop=-1:size=2e+09,volume=0.14,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2[bg];` +
      `[2:a]volume=1.25[vox];` +
      `[bg][vox]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    cmd =
      `ffmpeg -y -i "${visualMp4}" -i "${bgMusic}" -i "${voAudio}" ` +
      `-filter_complex "${audioFilter}" -map 0:v -map "[aout]" ` +
      `-c:v copy -c:a aac -b:a 192k -t ${totalDuration.toFixed(2)} -movflags +faststart "${finalPublicOut}"`;
  } else if (bgMusic) {
    const audioFilter =
      `[1:a]aloop=loop=-1:size=2e+09,volume=0.32,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2[aout]`;
    cmd =
      `ffmpeg -y -i "${visualMp4}" -i "${bgMusic}" ` +
      `-filter_complex "${audioFilter}" -map 0:v -map "[aout]" ` +
      `-c:v copy -c:a aac -b:a 192k -t ${totalDuration.toFixed(2)} -movflags +faststart "${finalPublicOut}"`;
  } else {
    cmd = `ffmpeg -y -i "${visualMp4}" -c:v copy -movflags +faststart "${finalPublicOut}"`;
  }

  execSync(cmd, { stdio: 'pipe' });
  if (fs.existsSync(path.dirname(finalBuildOut))) {
    fs.copyFileSync(finalPublicOut, finalBuildOut);
  }
  console.log(`   Published final MP4: ${finalPublicOut}`);
}

async function renderCommercials() {
  console.log('1. Preparing Executive Narration & Corporate Score...');
  const voOut = path.join(TMP_DIR, 'amana_executive_vo_v2.mp3');
  const voAudio = await synthesizeVoiceover(NARRATION_SCRIPT, voOut);
  const bgMusic = findCorporateMusicTrack();
  console.log('   Corporate score:', bgMusic || 'none');

  let targetDuration = 48.0;
  if (voAudio && fs.existsSync(voAudio)) {
    const voDuration = parseFloat(
      execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voAudio}"`
      )
        .toString()
        .trim()
    );
    if (Number.isFinite(voDuration) && voDuration > 20) {
      targetDuration = Math.max(46.0, Math.ceil((voDuration + 1.8) * 10) / 10);
    }
  }

  // With 6 clips joined by 5 xfade overlaps of XFADE_SEC:
  // total = 6 * sceneDur - 5 * XFADE_SEC  =>  sceneDur = (total + 5 * XFADE_SEC) / 6
  const sceneDurSec = (targetDuration + (SCENES.length - 1) * XFADE_SEC) / SCENES.length;
  console.log(`2. Timeline calibrated: target ${targetDuration.toFixed(1)}s (${sceneDurSec.toFixed(2)}s per act)`);

  const landscapeOnly = process.argv.includes('--landscape-only');
  const verticalOnly = process.argv.includes('--vertical-only');

  const verticalVisual = path.join(TMP_DIR, 'amana_vertical_master.mp4');
  const landscapeVisual = path.join(TMP_DIR, 'amana_landscape_master.mp4');

  if (!landscapeOnly) {
    await renderFormatVideo('vertical_9x16', 1080, 1920, sceneDurSec, verticalVisual);
  }

  if (!verticalOnly) {
    await renderFormatVideo('landscape_16x9', 1280, 720, sceneDurSec, landscapeVisual);
  }

  console.log('\n4. Multiplexing Narration + Ducked Corporate Score...');
  if (!landscapeOnly) {
    muxAudioAndPublish(
      verticalVisual,
      bgMusic,
      voAudio,
      targetDuration,
      path.join(PROMO_DIR, 'amana-app-tour-commercial.mp4'),
      path.join(BUILD_PROMO_DIR, 'amana-app-tour-commercial.mp4')
    );
  }

  if (!verticalOnly) {
    muxAudioAndPublish(
      landscapeVisual,
      bgMusic,
      voAudio,
      targetDuration,
      path.join(PROMO_DIR, 'amana-app-tour-landscape.mp4'),
      path.join(BUILD_PROMO_DIR, 'amana-app-tour-landscape.mp4')
    );
  }

  console.log('\nCompleted Amana RentalHub NG 9:16 & 16:9 commercials!');
}

renderCommercials().catch((err) => {
  console.error('Commercial render failed:', err);
  process.exit(1);
});
