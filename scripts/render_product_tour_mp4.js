/**
 * Amana RentalHub NG — 100% In-Engine Kinetic 3D Product Demo Video Renderer (Path 1)
 * Renders Apple/Stripe-grade frame-by-frame motion graphic commercials at 30fps:
 * - Output 1: 1080x1920 (9:16 Vertical — TikTok, Reels, Shorts, WhatsApp Status)
 * - Output 2: 1280x720 (16:9 Widescreen — Website Hero, YouTube, Presentations)
 *
 * Kinetic Scenes:
 * - Act 1: Character-by-character search typing (Maitama, Abuja FCT) + filter chips + radar pulse
 * - Act 2: Spring-eased listing cards (Maitama & Kano) + verified shimmer + button tap
 * - Act 3: Animated tenant review bars (Water 5.0/5, Power 4.9/5, Security 5.0/5)
 * - Act 4: Ripple tap + animated checkmark stroke + ₦0.00 inspection confirmation
 * - Act 5: Locking golden escrow shackle + handover & legal agreement reveals
 * - Act 6: Brand finale + Google Play / App Store badges + rentalhub.com.ng CTA
 *
 * Audio: Studio narration (full 47.2s unclipped) + ducked royalty-free preset music
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const sharp = require('sharp');

const PROMO_DIR = path.join(__dirname, '..', 'client', 'public', 'promo');
const BUILD_PROMO_DIR = path.join(__dirname, '..', 'client', 'build', 'promo');
const AUDIO_DIR = path.join(__dirname, '..', 'audio-tracks');
const TMP_DIR = path.join('/tmp', 'product_tour_mp4');

fs.mkdirSync(PROMO_DIR, { recursive: true });
fs.mkdirSync(BUILD_PROMO_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const FPS = 30;

const SCENES = [
  {
    id: 1,
    start: 0.0,
    end: 7.5,
    pill: 'SMART VERIFICATION SEARCH',
    line1: 'FIND HOMES IN ABUJA & KANO',
    line2: 'Zero Fake Agents • 100% Inspected Houses',
    sideTitle: 'Smart Verification Search',
    sideBullets: [
      'Live search across Maitama, Wuse 2, Garki & Gwarinpa',
      'Instant filters for borehole water & 24/7 power',
      'Zero fake agents or hidden inspection fees',
    ],
  },
  {
    id: 2,
    start: 7.5,
    end: 16.0,
    pill: 'VERIFIED REAL ESTATE LISTINGS',
    line1: 'MAITAMA & NASARAWA GRA',
    line2: 'Transparent Pricing • Direct Landlords',
    sideTitle: 'Verified Abuja & Kano Homes',
    sideBullets: [
      'Physically inspected luxury homes in Abuja FCT & Kano',
      'Transparent annual pricing directly from vetted owners',
      'Real photos verified on-site by Amana inspectors',
    ],
  },
  {
    id: 3,
    start: 16.0,
    end: 24.5,
    pill: 'TRANSPARENT TENANT REVIEWS',
    line1: 'NEVER RENT BLIND AGAIN',
    line2: 'Read Real Tenant Reviews on Water & Power',
    sideTitle: 'Verified Past-Tenant Reviews',
    sideBullets: [
      'Water Supply: real borehole & pressure ratings',
      'Power Grid: transformer & priority feeder scores',
      'Security: gated guard & estate safety feedback',
    ],
  },
  {
    id: 4,
    start: 24.5,
    end: 32.5,
    pill: 'ONE-TAP VERIFIED INSPECTIONS',
    line1: 'SCHEDULE VISITS IN SECONDS',
    line2: 'Meet Verified Hosts • Zero Extortion Fees',
    sideTitle: 'One-Tap Inspection Booking',
    sideBullets: [
      'Book an instant property visit directly inside the app',
      'Verified property manager assigned automatically',
      '₦0.00 inspection fee extortion — guaranteed',
    ],
  },
  {
    id: 5,
    start: 32.5,
    end: 40.5,
    pill: 'ENCRYPTED ESCROW PROTECTION',
    line1: 'PAY RENT SAFELY IN ESCROW',
    line2: 'Funds Released Only After Handover',
    sideTitle: 'Escrow & Digital Tenancy Lease',
    sideBullets: [
      'Your rent stays locked in encrypted escrow protection',
      'Landlord receives payout only after key handover',
      'Legally binding digital tenancy agreement included',
    ],
  },
  {
    id: 6,
    start: 40.5,
    end: 48.5,
    pill: 'DOWNLOAD AMANA RENTALHUB FREE',
    line1: 'DOWNLOAD AMANA RENTALHUB TODAY',
    line2: 'Android & iOS • rentalhub.com.ng',
    sideTitle: 'Rent With Complete Confidence',
    sideBullets: [
      'Available free on Google Play and the App Store',
      'Browse verified homes anytime at rentalhub.com.ng',
      'Dedicated Abuja & Kano WhatsApp Concierge',
    ],
  },
];

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function easeOutCubic(t) {
  const x = clamp(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t) {
  const x = clamp(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function synthesizeVoiceover(text, outFile) {
  if (fs.existsSync(outFile) && !process.argv.includes('--regen-vo')) {
    console.log('   ✓ Using existing studio narration audio:', outFile);
    return;
  }

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunkFiles = [];

  for (let i = 0; i < sentences.length; i++) {
    const chunkText = sentences[i].trim();
    if (!chunkText) continue;
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent(chunkText) + '&tl=en-US&client=tw-ob';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`TTS failed with status: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const chunkFile = path.join(TMP_DIR, `temp_chunk_${Date.now()}_${i}.mp3`);
    fs.writeFileSync(chunkFile, buf);
    chunkFiles.push(chunkFile);
    await new Promise((r) => setTimeout(r, 120));
  }

  const concatList = path.join(TMP_DIR, `concat_vo_${Date.now()}.txt`);
  fs.writeFileSync(concatList, chunkFiles.map((f) => `file '${f}'`).join('\n'));
  const rawFile = outFile.replace('.mp3', '_raw.mp3');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${rawFile}"`, { stdio: 'pipe' });

  execSync(
    `ffmpeg -y -i "${rawFile}" -af "highpass=f=85,equalizer=f=3200:t=q:w=1:g=2.5,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,volume=1.35" "${outFile}"`,
    { stdio: 'pipe' }
  );
  if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
}

function buildSceneInnerSvg(sceneId, localT, globalT) {
  const enter = easeOutCubic(localT / 0.55);
  const fadeOut = localT > 6.8 ? 1 : 1;

  if (sceneId === 1) {
    const query = 'Maitama, Abuja FCT';
    const charCount = Math.floor(clamp((localT - 0.15) / 1.45) * query.length);
    const typed = escapeXml(query.slice(0, charCount));
    const cursorVisible = Math.floor(globalT * 2.5) % 2 === 0;
    const cursorX = 76 + charCount * 17.5;

    const chip1 = easeOutBack((localT - 1.3) / 0.45);
    const chip2 = easeOutBack((localT - 1.6) / 0.45);
    const chip3 = easeOutBack((localT - 1.9) / 0.45);

    const cardUp = easeOutCubic((localT - 0.4) / 0.6);
    const cardY = 220 + (1 - cardUp) * 45;
    const countVal = Math.round(easeOutCubic((localT - 1.5) / 1.8) * 148);
    const radarPulse = (globalT * 0.75) % 1;
    const radarR = 24 + radarPulse * 135;
    const radarOp = (1 - radarPulse) * 0.55;

    return `
      <!-- Search Bar -->
      <g opacity="${enter}">
        <rect x="0" y="20" width="720" height="86" rx="22" fill="#082046" stroke="#0ea5e9" stroke-width="3"/>
        <circle cx="44" cy="63" r="11" fill="none" stroke="#38bdf8" stroke-width="3"/>
        <line x1="52" y1="71" x2="61" y2="80" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <text x="76" y="73" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#e0f2fe">${typed}</text>
        ${cursorVisible ? `<rect x="${cursorX}" y="44" width="3" height="36" fill="#38bdf8"/>` : ''}
      </g>

      <!-- Filter Chips -->
      <g transform="translate(0, 130)">
        <g transform="translate(0, ${(1 - chip1) * 18})" opacity="${clamp(chip1)}">
          <rect x="0" y="0" width="226" height="52" rx="16" fill="#042f2e" stroke="#10b981" stroke-width="2"/>
          <text x="113" y="33" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#34d399" text-anchor="middle">Borehole Water</text>
        </g>

        <g transform="translate(246, ${(1 - chip2) * 18})" opacity="${clamp(chip2)}">
          <rect x="0" y="0" width="226" height="52" rx="16" fill="#451a03" stroke="#f59e0b" stroke-width="2"/>
          <text x="113" y="33" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#fbbf24" text-anchor="middle">24/7 Power Grid</text>
        </g>

        <g transform="translate(492, ${(1 - chip3) * 18})" opacity="${clamp(chip3)}">
          <rect x="0" y="0" width="228" height="52" rx="16" fill="#0c4a6e" stroke="#38bdf8" stroke-width="2"/>
          <text x="114" y="33" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#38bdf8" text-anchor="middle">Zero Agent Fee</text>
        </g>
      </g>

      <!-- Radar Verification Map Card -->
      <g transform="translate(0, ${cardY.toFixed(1)})" opacity="${cardUp}">
        <rect x="0" y="0" width="720" height="520" rx="28" fill="#0b1e38" stroke="#1e3a5f" stroke-width="2"/>
        <circle cx="360" cy="200" r="145" fill="#0ea5e9" fill-opacity="0.07" stroke="#0ea5e9" stroke-opacity="0.4" stroke-width="2" stroke-dasharray="8 8"/>
        <circle cx="360" cy="200" r="90" fill="#059669" fill-opacity="0.12" stroke="#10b981" stroke-opacity="0.35" stroke-width="1.5"/>
        <circle cx="360" cy="200" r="${radarR.toFixed(1)}" fill="none" stroke="#34d399" stroke-opacity="${radarOp.toFixed(2)}" stroke-width="4"/>
        <circle cx="360" cy="200" r="18" fill="#10b981"/>
        <circle cx="360" cy="200" r="7" fill="#ffffff"/>

        <text x="360" y="390" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="30" fill="#ffffff" text-anchor="middle">${countVal} Physically Verified Listings</text>
        <text x="360" y="432" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#93c5fd" text-anchor="middle">Maitama • Wuse 2 • Garki • Gwarinpa</text>
        <text x="360" y="476" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="20" fill="#34d399" text-anchor="middle">✓ Inspected &amp; Real-Time Title Search</text>
      </g>
    `;
  }

  if (sceneId === 2) {
    const c1 = easeOutCubic(localT / 0.7);
    const c2 = easeOutCubic((localT - 0.55) / 0.75);
    const c1Y = 20 + (1 - c1) * 90;
    const c2Y = 475 + (1 - c2) * 110;
    const tapActive = localT > 4.2 && localT < 5.0;
    const btnScale = tapActive ? 0.94 : 1.0;
    const btnFill = tapActive ? '#fbbf24' : '#f59e0b';
    const shimmerX = ((localT * 320) % 900) - 180;

    return `
      <!-- Card 1: Maitama Luxury Terrace -->
      <g transform="translate(0, ${c1Y.toFixed(1)})" opacity="${c1}">
        <rect x="0" y="0" width="720" height="420" rx="26" fill="#082046" stroke="#10b981" stroke-width="3"/>
        <rect x="30" y="30" width="295" height="42" rx="14" fill="#059669"/>
        <text x="177" y="58" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#ffffff" text-anchor="middle">✓ 100% AMANA INSPECTED</text>

        <text x="30" y="125" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="35" fill="#ffffff">Luxury 3-Bed Terrace Duplex</text>
        <text x="30" y="170" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#93c5fd">Maitama, Abuja FCT</text>

        <text x="30" y="242" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" fill="#ffc928">₦4,500,000 <tspan font-size="24" fill="#cbd5e1">/ year</tspan></text>
        <text x="30" y="290" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#cbd5e1">Borehole Water • 24/7 Gated Security • Zero Extortion</text>

        <g transform="translate(570, 357) scale(${btnScale}) translate(-570, -357)">
          <rect x="445" y="325" width="245" height="64" rx="18" fill="${btnFill}"/>
          <text x="567" y="365" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="22" fill="#040d1a" text-anchor="middle">View Details →</text>
        </g>
        ${tapActive ? `<circle cx="567" cy="357" r="${20 + (localT - 4.2) * 80}" fill="none" stroke="#ffffff" stroke-opacity="${1 - (localT - 4.2) / 0.8}" stroke-width="3"/>` : ''}
      </g>

      <!-- Card 2: Kano Nasarawa GRA -->
      <g transform="translate(0, ${c2Y.toFixed(1)})" opacity="${c2}">
        <rect x="0" y="0" width="720" height="390" rx="26" fill="#082046" stroke="#38bdf8" stroke-width="2.5"/>
        <rect x="30" y="30" width="270" height="42" rx="14" fill="#0284c7"/>
        <text x="165" y="58" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#ffffff" text-anchor="middle">✓ VETTED LANDLORD</text>

        <text x="30" y="122" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff">Modern 4-Bed Detached House</text>
        <text x="30" y="166" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#93c5fd">Nasarawa GRA, Kano</text>

        <text x="30" y="238" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="42" fill="#ffc928">₦3,200,000 <tspan font-size="24" fill="#cbd5e1">/ year</tspan></text>
        <text x="30" y="286" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#cbd5e1">Dedicated Transformer • Treated Water • Security Post</text>

        <rect x="30" y="320" width="210" height="40" rx="12" fill="#0f172a" stroke="#38bdf8" stroke-opacity="0.5"/>
        <text x="135" y="346" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="17" fill="#38bdf8" text-anchor="middle">Escrow Protected</text>
      </g>

      <!-- Subtle Highlight Beam -->
      <rect x="${shimmerX.toFixed(0)}" y="20" width="90" height="845" fill="#ffffff" fill-opacity="0.02" rx="24"/>
    `;
  }

  if (sceneId === 3) {
    const headerUp = easeOutCubic(localT / 0.5);
    const m1 = easeOutCubic((localT - 0.5) / 1.1);
    const m2 = easeOutCubic((localT - 1.2) / 1.1);
    const m3 = easeOutCubic((localT - 1.9) / 1.1);

    const wWidth = Math.round(660 * m1);
    const pWidth = Math.round(646 * m2);
    const sWidth = Math.round(660 * m3);

    const wScore = (5.0 * m1).toFixed(1);
    const pScore = (4.9 * m2).toFixed(1);
    const sScore = (5.0 * m3).toFixed(1);

    return `
      <!-- Header Rating -->
      <g transform="translate(0, ${(20 + (1 - headerUp) * 30).toFixed(1)})" opacity="${headerUp}">
        <rect x="0" y="0" width="720" height="150" rx="24" fill="#082046" stroke="#f59e0b" stroke-width="2.5"/>
        <text x="360" y="62" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="36" fill="#fbbf24" text-anchor="middle">★ 4.9 Real Tenant Rating</text>
        <text x="360" y="108" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#cbd5e1" text-anchor="middle">Verified by actual past tenants before you move in</text>
      </g>

      <!-- Water Meter -->
      <g transform="translate(0, ${(200 + (1 - clamp(m1 * 1.4)) * 35).toFixed(1)})" opacity="${clamp(m1 * 1.6)}">
        <rect x="0" y="0" width="720" height="185" rx="24" fill="#0b1e38" stroke="#0ea5e9" stroke-width="2"/>
        <text x="30" y="54" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#38bdf8">Water Supply: ${wScore} / 5.0</text>
        <rect x="30" y="80" width="660" height="22" rx="11" fill="#1e293b"/>
        <rect x="30" y="80" width="${Math.max(22, wWidth)}" height="22" rx="11" fill="#0ea5e9"/>
        <text x="30" y="142" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#f1f5f9">"Borehole with industrial filter. Clean pressure 24/7."</text>
      </g>

      <!-- Power Meter -->
      <g transform="translate(0, ${(415 + (1 - clamp(m2 * 1.4)) * 35).toFixed(1)})" opacity="${clamp(m2 * 1.6)}">
        <rect x="0" y="0" width="720" height="185" rx="24" fill="#0b1e38" stroke="#f59e0b" stroke-width="2"/>
        <text x="30" y="54" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#fbbf24">Electricity: ${pScore} / 5.0</text>
        <rect x="30" y="80" width="660" height="22" rx="11" fill="#1e293b"/>
        <rect x="30" y="80" width="${Math.max(22, pWidth)}" height="22" rx="11" fill="#f59e0b"/>
        <text x="30" y="142" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#f1f5f9">"Connected to 33kVA priority line. Steady power."</text>
      </g>

      <!-- Security Meter -->
      <g transform="translate(0, ${(630 + (1 - clamp(m3 * 1.4)) * 35).toFixed(1)})" opacity="${clamp(m3 * 1.6)}">
        <rect x="0" y="0" width="720" height="185" rx="24" fill="#0b1e38" stroke="#10b981" stroke-width="2"/>
        <text x="30" y="54" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#34d399">Gated Security: ${sScore} / 5.0</text>
        <rect x="30" y="80" width="660" height="22" rx="11" fill="#1e293b"/>
        <rect x="30" y="80" width="${Math.max(22, sWidth)}" height="22" rx="11" fill="#10b981"/>
        <text x="30" y="142" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#f1f5f9">"24/7 uniformed guards, automated boom barrier."</text>
      </g>
    `;
  }

  if (sceneId === 4) {
    const cardPop = easeOutBack(localT / 0.65);
    const checkDraw = easeOutCubic((localT - 0.5) / 0.8);
    const totalLen = 152;
    const dashOffset = Math.round(totalLen * (1 - checkDraw));
    const rippleProgress = (localT * 0.55) % 1;
    const detailsOp = easeOutCubic((localT - 1.1) / 0.6);
    const feeGlow = 0.5 + 0.5 * Math.sin(globalT * 5);

    return `
      <g transform="translate(360, 410) scale(${(0.9 + 0.1 * cardPop).toFixed(3)}) translate(-360, -410)" opacity="${clamp(cardPop)}">
        <rect x="0" y="40" width="720" height="750" rx="32" fill="#042f2e" stroke="#10b981" stroke-width="4"/>

        <!-- Expanding Pulse Ring -->
        <circle cx="360" cy="200" r="${(85 + rippleProgress * 65).toFixed(1)}" fill="none" stroke="#10b981" stroke-opacity="${((1 - rippleProgress) * 0.45).toFixed(2)}" stroke-width="3"/>
        <circle cx="360" cy="200" r="85" fill="#10b981" fill-opacity="0.2" stroke="#10b981" stroke-width="5"/>

        <!-- Animated Checkmark -->
        <path d="M 310 200 L 345 235 L 415 165" fill="none" stroke="#10b981" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${totalLen}" stroke-dashoffset="${dashOffset}"/>

        <text x="360" y="340" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">INSPECTION CONFIRMED</text>
        <text x="360" y="390" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#6ee7b7" text-anchor="middle">Tomorrow at 10:30 AM • Verified Host Assigned</text>

        <line x1="60" y1="440" x2="660" y2="440" stroke="#10b981" stroke-opacity="0.3" stroke-width="2"/>

        <g transform="translate(60, 490)" opacity="${detailsOp}">
          <text x="0" y="35" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#cbd5e1">Property:</text>
          <text x="0" y="75" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#ffffff">The Maitama Residence, Abuja FCT</text>

          <text x="0" y="145" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#cbd5e1">Inspection Fee:</text>
          <rect x="-10" y="158" width="520" height="62" rx="14" fill="#064e3b" fill-opacity="${(0.35 + feeGlow * 0.25).toFixed(2)}" stroke="#ffc928" stroke-opacity="0.6"/>
          <text x="8" y="200" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="33" fill="#ffc928">₦0.00 (Zero Fee Extortion)</text>
        </g>
      </g>
    `;
  }

  if (sceneId === 5) {
    const cardIn = easeOutCubic(localT / 0.55);
    const lockDrop = easeOutCubic((localT - 0.35) / 0.65);
    const shackleOffset = (1 - lockDrop) * -18;
    const pulse = 0.5 + 0.5 * Math.sin(globalT * 4.2);
    const row1 = easeOutCubic((localT - 1.0) / 0.6);
    const row2 = easeOutCubic((localT - 1.8) / 0.6);

    return `
      <g transform="translate(0, ${(40 + (1 - cardIn) * 40).toFixed(1)})" opacity="${cardIn}">
        <rect x="0" y="0" width="720" height="750" rx="32" fill="#1e1804" stroke="#ffc928" stroke-width="4"/>

        <!-- Pulsing Shield Glow -->
        <circle cx="360" cy="160" r="${(92 + pulse * 14).toFixed(1)}" fill="#f59e0b" fill-opacity="${(0.08 + pulse * 0.1).toFixed(2)}"/>
        <circle cx="360" cy="160" r="85" fill="#f59e0b" fill-opacity="0.2" stroke="#ffc928" stroke-width="5"/>

        <!-- Animated Locking Padlock -->
        <g transform="translate(0, ${shackleOffset.toFixed(1)})">
          <path d="M 335 148 L 335 115 A 25 25 0 0 1 385 115 L 385 148" fill="none" stroke="#ffc928" stroke-width="12" stroke-linecap="round"/>
        </g>
        <rect x="323" y="146" width="74" height="58" rx="10" fill="#ffc928"/>
        <circle cx="360" cy="175" r="7" fill="#1e1804"/>

        <text x="360" y="305" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">PAYMENT IN ESCROW</text>
        <text x="360" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" fill="#fde68a" text-anchor="middle">Total Security for Renters &amp; Landlords</text>

        <line x1="60" y1="405" x2="660" y2="405" stroke="#f59e0b" stroke-opacity="0.3" stroke-width="2"/>

        <g transform="translate(60, ${(460 + (1 - row1) * 25).toFixed(1)})" opacity="${row1}">
          <text x="0" y="35" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#34d399">✓ Handover Guarantee</text>
          <text x="0" y="72" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#cbd5e1">Landlord is paid ONLY after keys are verified.</text>
        </g>

        <g transform="translate(60, ${(575 + (1 - row2) * 25).toFixed(1)})" opacity="${row2}">
          <text x="0" y="35" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#34d399">✓ Instant Legal Tenancy Agreement</text>
          <text x="0" y="72" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#cbd5e1">Digitally signed &amp; binding under Nigerian law.</text>
        </g>
      </g>
    `;
  }

  // Scene 6: Brand Finale
  const logoPop = easeOutBack(localT / 0.65);
  const badgeIn = easeOutCubic((localT - 0.7) / 0.6);
  const ctaIn = easeOutBack((localT - 1.2) / 0.6);
  const ctaPulse = 1 + 0.025 * Math.sin(globalT * 5);

  return `
    <g transform="translate(0, 70)">
      <rect x="0" y="0" width="720" height="700" rx="32" fill="#082046" stroke="#38bdf8" stroke-width="3"/>

      <g transform="translate(360, 140) scale(${logoPop.toFixed(3)}) translate(-360, -140)" opacity="${clamp(logoPop)}">
        <circle cx="360" cy="140" r="64" fill="#059669" stroke="#10b981" stroke-width="5"/>
        <text x="360" y="158" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="48" fill="#ffffff" text-anchor="middle">A</text>
      </g>

      <text x="360" y="265" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="42" fill="#ffffff" text-anchor="middle">Amana RentalHub NG</text>
      <text x="360" y="312" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ffc928" text-anchor="middle">HELP PEOPLE RENT WITH CONFIDENCE</text>

      <!-- Store Badges -->
      <g transform="translate(60, ${(375 + (1 - badgeIn) * 30).toFixed(1)})" opacity="${badgeIn}">
        <rect x="0" y="0" width="280" height="72" rx="18" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
        <text x="140" y="45" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="22" fill="#ffffff" text-anchor="middle">▶ Google Play</text>

        <rect x="320" y="0" width="280" height="72" rx="18" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
        <text x="460" y="45" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="22" fill="#ffffff" text-anchor="middle">App Store</text>
      </g>

      <!-- Pulsing Web CTA -->
      <g transform="translate(360, 522) scale(${(ctaIn * ctaPulse).toFixed(3)}) translate(-360, -522)" opacity="${clamp(ctaIn)}">
        <rect x="60" y="484" width="600" height="78" rx="20" fill="#f59e0b"/>
        <text x="360" y="535" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#040d1a" text-anchor="middle" letter-spacing="2">rentalhub.com.ng</text>
      </g>

      <text x="360" y="630" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#93c5fd" text-anchor="middle">WhatsApp Concierge: +234 803 060 1238</text>
    </g>
  `;
}

function renderVerticalFrameSvg(scene, localT, globalT, totalDuration) {
  const safeTitle = escapeXml(scene.pill).toUpperCase();
  const safeL1 = escapeXml(scene.line1);
  const safeL2 = escapeXml(scene.line2);
  const screenInner = buildSceneInnerSvg(scene.id, localT, globalT);

  // Subtle 3D float & breathing scale of phone chassis
  const floatY = Math.sin(globalT * 1.4) * 8;
  const phoneScale = 1 + Math.sin(globalT * 0.9) * 0.006;
  const progressRatio = clamp(globalT / totalDuration);
  const progressW = Math.round(920 * progressRatio);

  return `
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="studioBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#020813"/>
        <stop offset="40%" stop-color="#061834"/>
        <stop offset="70%" stop-color="#041227"/>
        <stop offset="100%" stop-color="#010610"/>
      </linearGradient>
      <radialGradient id="rimGlow" cx="50%" cy="42%" r="52%">
        <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.28"/>
        <stop offset="50%" stop-color="#10b981" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.11"/>
        <stop offset="35%" stop-color="#ffffff" stop-opacity="0.03"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <rect width="1080" height="1920" fill="url(#studioBg)"/>
    <rect width="1080" height="1920" fill="url(#rimGlow)"/>

    <line x1="140" y1="0" x2="140" y2="1920" stroke="#0ea5e9" stroke-opacity="0.06" stroke-width="1"/>
    <line x1="940" y1="0" x2="940" y2="1920" stroke="#0ea5e9" stroke-opacity="0.06" stroke-width="1"/>
    <line x1="0" y1="300" x2="1080" y2="300" stroke="#0ea5e9" stroke-opacity="0.06" stroke-width="1"/>
    <line x1="0" y1="1620" x2="1080" y2="1620" stroke="#0ea5e9" stroke-opacity="0.06" stroke-width="1"/>

    <!-- Top Floating Category Label -->
    <rect x="240" y="58" width="600" height="60" rx="30" fill="#041227" fill-opacity="0.92" stroke="#38bdf8" stroke-width="2"/>
    <text x="540" y="96" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="22" fill="#38bdf8" text-anchor="middle" letter-spacing="3">${safeTitle}</text>

    <!-- Floating Smartphone Chassis -->
    <g transform="translate(540, ${(880 + floatY).toFixed(1)}) scale(${phoneScale.toFixed(4)}) translate(-540, -880)">
      <rect x="135" y="158" width="810" height="1470" rx="60" fill="#000000" fill-opacity="0.62"/>
      <rect x="130" y="150" width="820" height="1460" rx="58" fill="#1e293b" stroke="#64748b" stroke-width="6"/>
      <rect x="150" y="170" width="780" height="1420" rx="46" fill="#040d1a" stroke="#0f172a" stroke-width="2"/>

      <rect x="440" y="190" width="200" height="34" rx="17" fill="#020617"/>
      <circle cx="480" cy="207" r="6" fill="#1e293b"/>
      <circle cx="600" cy="207" r="4" fill="#0ea5e9" fill-opacity="0.85"/>

      <!-- App Header -->
      <g transform="translate(180, 245)">
        <rect x="0" y="0" width="46" height="46" rx="12" fill="#059669"/>
        <text x="23" y="32" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ffffff" text-anchor="middle">A</text>
        <text x="60" y="24" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ffffff">Amana RentalHub</text>
        <text x="60" y="44" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#34d399">Abuja &amp; Kano Verified Homes</text>
        <rect x="520" y="6" width="200" height="34" rx="17" fill="#047857" fill-opacity="0.3" stroke="#10b981" stroke-width="2"/>
        <text x="620" y="30" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="16" fill="#34d399" text-anchor="middle">✓ VERIFIED</text>
      </g>

      <line x1="180" y1="310" x2="900" y2="310" stroke="#334155" stroke-opacity="0.4" stroke-width="1.5"/>

      <!-- Dynamic Screen Content -->
      <g transform="translate(180, 330)">
        ${screenInner}
      </g>

      <!-- Glass Reflection -->
      <rect x="150" y="170" width="780" height="1420" rx="46" fill="url(#glassSheen)"/>
      <rect x="420" y="1560" width="240" height="6" rx="3" fill="#64748b"/>
    </g>

    <!-- Lower-Third Subtitle + Timeline Bar -->
    <g transform="translate(80, 1660)">
      <rect x="0" y="0" width="920" height="190" rx="26" fill="#041227" fill-opacity="0.96" stroke="#ffc928" stroke-width="2"/>
      <text x="460" y="72" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle">${safeL1}</text>
      <text x="460" y="132" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#fef08a" text-anchor="middle">${safeL2}</text>
      <rect x="0" y="182" width="920" height="6" rx="3" fill="#1e293b"/>
      <rect x="0" y="182" width="${Math.max(8, progressW)}" height="6" rx="3" fill="#10b981"/>
    </g>
  </svg>
  `;
}

function renderLandscapeFrameSvg(scene, localT, globalT, totalDuration) {
  const safePill = escapeXml(scene.pill).toUpperCase();
  const safeSideTitle = escapeXml(scene.sideTitle);
  const safeL2 = escapeXml(scene.line2);
  const screenInner = buildSceneInnerSvg(scene.id, localT, globalT);

  const floatY = Math.sin(globalT * 1.4) * 5;
  const progressW = Math.round(620 * clamp(globalT / totalDuration));

  const bulletsSvg = scene.sideBullets
    .map((b, idx) => {
      const bIn = easeOutCubic((localT - idx * 0.35) / 0.55);
      const y = idx * 82 + (1 - bIn) * 18;
      return `
        <g transform="translate(0, ${y.toFixed(1)})" opacity="${bIn}">
          <rect x="0" y="0" width="600" height="64" rx="14" fill="#0b1e38" stroke="#1e3a5f" stroke-width="1.5"/>
          <circle cx="30" cy="32" r="11" fill="#059669"/>
          <path d="M 25 32 L 29 36 L 36 28" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="54" y="38" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#e2e8f0">${escapeXml(b)}</text>
        </g>
      `;
    })
    .join('\n');

  return `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="studioBgL" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#020813"/>
        <stop offset="50%" stop-color="#061834"/>
        <stop offset="100%" stop-color="#010610"/>
      </linearGradient>
      <radialGradient id="rimGlowL" cx="30%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.22"/>
        <stop offset="55%" stop-color="#0ea5e9" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="glassSheenL" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.1"/>
        <stop offset="40%" stop-color="#ffffff" stop-opacity="0.02"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <rect width="1280" height="720" fill="url(#studioBgL)"/>
    <rect width="1280" height="720" fill="url(#rimGlowL)"/>

    <!-- Left Stage: Scaled 3D Floating Smartphone -->
    <g transform="translate(80, ${(42 + floatY).toFixed(1)}) scale(0.435)">
      <rect x="135" y="158" width="810" height="1470" rx="60" fill="#000000" fill-opacity="0.65"/>
      <rect x="130" y="150" width="820" height="1460" rx="58" fill="#1e293b" stroke="#64748b" stroke-width="6"/>
      <rect x="150" y="170" width="780" height="1420" rx="46" fill="#040d1a" stroke="#0f172a" stroke-width="2"/>
      <rect x="440" y="190" width="200" height="34" rx="17" fill="#020617"/>
      <g transform="translate(180, 245)">
        <rect x="0" y="0" width="46" height="46" rx="12" fill="#059669"/>
        <text x="23" y="32" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ffffff" text-anchor="middle">A</text>
        <text x="60" y="24" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#ffffff">Amana RentalHub</text>
        <text x="60" y="44" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#34d399">Abuja &amp; Kano Verified Homes</text>
        <rect x="520" y="6" width="200" height="34" rx="17" fill="#047857" fill-opacity="0.3" stroke="#10b981" stroke-width="2"/>
        <text x="620" y="30" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="16" fill="#34d399" text-anchor="middle">✓ VERIFIED</text>
      </g>
      <line x1="180" y1="310" x2="900" y2="310" stroke="#334155" stroke-opacity="0.4" stroke-width="1.5"/>
      <g transform="translate(180, 330)">
        ${screenInner}
      </g>
      <rect x="150" y="170" width="780" height="1420" rx="46" fill="url(#glassSheenL)"/>
    </g>

    <!-- Right Stage: Editorial Product Callouts -->
    <g transform="translate(530, 88)">
      <rect x="0" y="0" width="390" height="42" rx="21" fill="#041227" stroke="#38bdf8" stroke-width="1.5"/>
      <text x="195" y="27" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="2">${safePill}</text>

      <text x="0" y="100" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff">${safeSideTitle}</text>
      <text x="0" y="140" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="21" fill="#ffc928">${safeL2}</text>

      <g transform="translate(0, 185)">
        ${bulletsSvg}
      </g>

      <!-- Bottom Website & Progress -->
      <g transform="translate(0, 465)">
        <rect x="0" y="0" width="600" height="62" rx="16" fill="#041227" stroke="#f59e0b" stroke-width="2"/>
        <text x="24" y="39" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="22" fill="#ffffff">rentalhub.com.ng</text>
        <text x="576" y="38" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="18" fill="#34d399" text-anchor="end">Abuja FCT • Kano</text>
        <rect x="0" y="76" width="620" height="6" rx="3" fill="#1e293b"/>
        <rect x="0" y="76" width="${Math.max(8, progressW)}" height="6" rx="3" fill="#10b981"/>
      </g>
    </g>
  </svg>
  `;
}

function getSceneAtTime(t) {
  for (const s of SCENES) {
    if (t >= s.start && t < s.end) return s;
  }
  return SCENES[SCENES.length - 1];
}

async function encodeKineticStream(width, height, totalDuration, buildSvgFn, outVisualMp4, label) {
  const totalFrames = Math.round(totalDuration * FPS);
  console.log(`\n3. Streaming ${totalFrames} kinetic frames (${width}x${height} @ ${FPS}fps) for ${label}...`);

  const ff = spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-r', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    outVisualMp4,
  ]);

  let ffStderr = '';
  ff.stderr.on('data', (d) => {
    ffStderr += d.toString();
  });

  const ffDone = new Promise((resolve, reject) => {
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${ffStderr.slice(-500)}`));
    });
  });

  const BATCH_SIZE = 16;
  const startTime = Date.now();

  for (let startIdx = 0; startIdx < totalFrames; startIdx += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, totalFrames - startIdx);
    const buffers = await Promise.all(
      Array.from({ length: batchCount }, (_, k) => {
        const frameIdx = startIdx + k;
        const globalT = frameIdx / FPS;
        const scene = getSceneAtTime(globalT);
        const localT = Math.max(0, globalT - scene.start);
        const svg = buildSvgFn(scene, localT, globalT, totalDuration);
        return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
      })
    );

    for (const buf of buffers) {
      if (!ff.stdin.write(buf)) {
        await new Promise((r) => ff.stdin.once('drain', r));
      }
    }

    if ((startIdx + batchCount) % 240 === 0 || startIdx + batchCount === totalFrames) {
      const pct = Math.round(((startIdx + batchCount) / totalFrames) * 100);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   [${label}] ${pct}% (${startIdx + batchCount}/${totalFrames} frames) in ${elapsedSec}s`);
    }
  }

  ff.stdin.end();
  await ffDone;
  console.log(`   ✓ Kinetic visual track encoded: ${outVisualMp4}`);
}

function muxAudioAndPublish(visualMp4, bgMusic, voAudio, totalDuration, finalPublicOut, finalBuildOut) {
  const audioFilter = `[1:a]aloop=loop=-1:size=2e+09,volume=0.16,afade=t=in:st=0:d=1,afade=t=out:st=${(totalDuration - 2).toFixed(2)}:d=2[bg];[2:a]volume=1.3[vox];[bg][vox]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
  const muxCmd = `ffmpeg -y -i "${visualMp4}" -i "${bgMusic}" -i "${voAudio}" -filter_complex "${audioFilter}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -t ${totalDuration.toFixed(2)} -movflags +faststart "${finalPublicOut}"`;
  execSync(muxCmd, { stdio: 'pipe' });
  fs.copyFileSync(finalPublicOut, finalBuildOut);
  console.log(`   ✓ Published final MP4: ${finalPublicOut}`);
}

async function renderVideo() {
  console.log('1. Preparing Studio Narration...');
  const voScript =
    'Finding a verified home in Abuja or Kano just got effortless. Meet Amana RentalHub NG. Search premier districts like Maitama and Nasarawa GRA, with 100% physically inspected listings and zero agent fees. Read transparent reviews from real past tenants on water supply, power, and security before you ever step outside. Book your physical inspection directly in the app, and meet a verified property manager with zero extortion. Pay rent safely through encrypted escrow, backed by an instant digital tenancy agreement. Download Amana RentalHub NG free today on Google Play and the App Store. Rent with confidence.';
  const voAudio = path.join(AUDIO_DIR, 'product_tour_vo.mp3');
  await synthesizeVoiceover(voScript, voAudio);

  const voDuration =
    parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voAudio}"`)
        .toString()
        .trim()
    ) || 47.2;
  const totalDuration = Math.max(48.5, Math.ceil((voDuration + 1.2) * 10) / 10);
  SCENES[SCENES.length - 1].end = totalDuration;
  console.log(`2. Timeline calibrated: VO = ${voDuration.toFixed(2)}s → Total Video = ${totalDuration.toFixed(1)}s`);

  const verticalVisual = path.join(TMP_DIR, 'visual_kinetic_9x16.mp4');
  const landscapeVisual = path.join(TMP_DIR, 'visual_kinetic_16x9.mp4');
  const landscapeOnly = process.argv.includes('--landscape-only');
  const verticalOnly = process.argv.includes('--vertical-only');

  if (!landscapeOnly) {
    await encodeKineticStream(1080, 1920, totalDuration, renderVerticalFrameSvg, verticalVisual, '9:16 Vertical');
  }
  if (!verticalOnly) {
    await encodeKineticStream(1280, 720, totalDuration, renderLandscapeFrameSvg, landscapeVisual, '16:9 Landscape');
  }

  console.log('\n4. Multiplexing Studio Narration + Ducked Royalty-Free Music...');
  const bgMusic = path.join(AUDIO_DIR, 'track_01_happy.mp3');

  if (!landscapeOnly) {
    muxAudioAndPublish(
      verticalVisual,
      bgMusic,
      voAudio,
      totalDuration,
      path.join(PROMO_DIR, 'amana-app-tour-commercial.mp4'),
      path.join(BUILD_PROMO_DIR, 'amana-app-tour-commercial.mp4')
    );
  }

  if (!verticalOnly) {
    muxAudioAndPublish(
      landscapeVisual,
      bgMusic,
      voAudio,
      totalDuration,
      path.join(PROMO_DIR, 'amana-app-tour-landscape.mp4'),
      path.join(BUILD_PROMO_DIR, 'amana-app-tour-landscape.mp4')
    );
  }

  console.log('\n🎉 BOTH 9:16 & 16:9 KINETIC PATH 1 COMMERCIALS RENDERED!');
}

renderVideo().catch((err) => {
  console.error('Render error:', err);
  process.exit(1);
});
