/**
 * Amana RentalHub NG — 60-Second Full Walkthrough Video Generator
 * Renders 7 high-resolution 1080x1920 scenes with SVG/Sharp,
 * then stitches them with FFmpeg into a 60-second vertical MP4 video with synced audio.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const BUILD_DIR = path.join(__dirname, '..', 'client', 'build', 'promo');
const VA_DIR = path.join(__dirname, '..', 'video-ads', 'rendered');
const FRAMES_DIR = path.join('/tmp', 'rentalhub_60s_frames');

fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(VA_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

const scenes = [
  {
    name: 'scene1_hook',
    duration: 8,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#051329"/>
          <stop offset="60%" stop-color="#0a1d3b"/>
          <stop offset="100%" stop-color="#1e0c15"/>
        </linearGradient>
        <linearGradient id="alertGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#dc2626"/>
          <stop offset="100%" stop-color="#991b1b"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg1)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>
      
      <!-- Top Brand Tag -->
      <text x="540" y="140" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffc928" text-anchor="middle" letter-spacing="4">AMANA RENTALHUB NG</text>

      <!-- Alert Warning Box -->
      <rect x="90" y="320" width="900" height="180" rx="20" fill="url(#alertGrad)" />
      <text x="540" y="390" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" fill="#ffffff" text-anchor="middle">STOP PAYING AGENTS</text>
      <text x="540" y="450" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="36" fill="#ffdd00" text-anchor="middle">FOR HOUSES THAT DON'T EXIST</text>

      <!-- Hook Card -->
      <rect x="90" y="560" width="900" height="660" rx="24" fill="#0c234b" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      
      <circle cx="540" cy="690" r="70" fill="#dc2626" fill-opacity="0.2"/>
      <text x="540" y="715" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="70" fill="#f87171" text-anchor="middle">⚠</text>

      <text x="540" y="820" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="52" fill="#ffffff" text-anchor="middle">Tired of the Rental Scam?</text>
      
      <text x="160" y="910" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#e2e8f0">• Fake listings on social media</text>
      <text x="160" y="980" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#e2e8f0">• ₦10k - ₦30k lost on inspection fees</text>
      <text x="160" y="1050" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#e2e8f0">• Arriving at an empty construction site</text>
      <text x="160" y="1120" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#e2e8f0">• Ghost agents blocking your calls</text>

      <!-- Solution Tease -->
      <rect x="140" y="1320" width="800" height="160" rx="18" fill="#0284c7" />
      <text x="540" y="1385" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">THERE IS A BETTER WAY</text>
      <text x="540" y="1440" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#e0f2fe" text-anchor="middle">Watch how Amana RentalHub fixes this ⬇</text>

      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">rentalhub.com.ng</text>
    </svg>
    `
  },
  {
    name: 'scene2_intro',
    duration: 9,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#061b3a"/>
          <stop offset="100%" stop-color="#021024"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg2)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>

      <!-- Badge -->
      <rect x="360" y="150" width="360" height="60" rx="30" fill="#ffc928"/>
      <text x="540" y="190" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="24" fill="#061b3a" text-anchor="middle" letter-spacing="2">OFFICIAL PLATFORM</text>

      <!-- Brand Card -->
      <rect x="90" y="270" width="900" height="1100" rx="28" fill="#0d2854" stroke="#ffc928" stroke-opacity="0.3" stroke-width="3"/>

      <!-- Verified Shield -->
      <circle cx="540" cy="430" r="85" fill="#0284c7" fill-opacity="0.3"/>
      <circle cx="540" cy="430" r="65" fill="#ffc928"/>
      <text x="540" y="455" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="70" fill="#061b3a" text-anchor="middle">✓</text>

      <text x="540" y="580" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="52" fill="#ffffff" text-anchor="middle">Amana RentalHub NG</text>
      <text x="540" y="640" font-family="DejaVu Sans, Arial, sans-serif" font-style="italic" font-size="32" fill="#ffc928" text-anchor="middle">"Your next home, handled with care."</text>

      <!-- Key Pillars -->
      <rect x="140" y="720" width="800" height="130" rx="16" fill="#071a38"/>
      <text x="180" y="775" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#38bdf8">100% Physically Verified</text>
      <text x="180" y="815" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#cbd5e1">Every apartment inspected before listing goes live</text>

      <rect x="140" y="880" width="800" height="130" rx="16" fill="#071a38"/>
      <text x="180" y="935" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#38bdf8">Zero Extortion Fees</text>
      <text x="180" y="975" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#cbd5e1">No endless registration or fake viewing charges</text>

      <rect x="140" y="1040" width="800" height="130" rx="16" fill="#071a38"/>
      <text x="180" y="1095" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#38bdf8">Protected In-App Payments</text>
      <text x="180" y="1135" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#cbd5e1">Rent &amp; deposits held safely until confirmed</text>

      <text x="540" y="1270" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="36" fill="#ffffff" text-anchor="middle">Let's walk through how it works ⬇</text>

      <!-- Bottom link -->
      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Available on Android &amp; iOS</text>
    </svg>
    `
  },
  {
    name: 'scene3_search',
    duration: 10,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#041227"/>
          <stop offset="100%" stop-color="#08224d"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg3)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>

      <!-- Step Header -->
      <rect x="90" y="130" width="900" height="120" rx="20" fill="#0284c7"/>
      <text x="540" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#e0f2fe" text-anchor="middle" letter-spacing="2">STEP 1: EXPLORE &amp; SEARCH</text>
      <text x="540" y="225" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">Verified Homes Across 36 States</text>

      <!-- Mock Search Bar -->
      <rect x="90" y="290" width="900" height="90" rx="45" fill="#0e2a5a" stroke="#38bdf8" stroke-width="2"/>
      <text x="140" y="348" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#94a3b8">🔍  Search "Lekki Phase 1", "Maitama", "Ikeja"...</text>

      <!-- Property Card 1 -->
      <rect x="90" y="430" width="900" height="420" rx="24" fill="#0d2347" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      <rect x="120" y="460" width="840" height="60" rx="12" fill="#16a34a"/>
      <text x="140" y="500" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#ffffff">✓ PHYSICALLY VERIFIED • INSPECTION PASSED</text>

      <text x="120" y="580" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="42" fill="#ffffff">Luxury 2-Bedroom Serviced Apartment</text>
      <text x="120" y="630" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#38bdf8">📍 Lekki Phase 1, Lagos State</text>

      <text x="120" y="700" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="46" fill="#ffc928">₦3,500,000 / year</text>
      <text x="120" y="750" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#94a3b8">Borehole Water • 24/7 Power • Gated Estate • Zero Ghost Fees</text>

      <rect x="680" y="740" width="280" height="80" rx="16" fill="#ffc928"/>
      <text x="820" y="790" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#061b3a" text-anchor="middle">View Details →</text>

      <!-- Property Card 2 -->
      <rect x="90" y="900" width="900" height="420" rx="24" fill="#0d2347" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      <rect x="120" y="930" width="840" height="60" rx="12" fill="#16a34a"/>
      <text x="140" y="970" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#ffffff">✓ PHYSICALLY VERIFIED • LANDLORD VETTED</text>

      <text x="120" y="1050" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="42" fill="#ffffff">Spacious 3-Bedroom Terrace Duplex</text>
      <text x="120" y="1100" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#38bdf8">📍 Maitama, Abuja FCT</text>

      <text x="120" y="1170" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="46" fill="#ffc928">₦5,000,000 / year</text>
      <text x="120" y="1220" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#94a3b8">Constant Water • Dedicated Transformer • Prepaid Meter</text>

      <rect x="680" y="1210" width="280" height="80" rx="16" fill="#ffc928"/>
      <text x="820" y="1260" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#061b3a" text-anchor="middle">View Details →</text>

      <!-- Highlight Banner -->
      <rect x="90" y="1380" width="900" height="180" rx="20" fill="#061b3a" stroke="#ffc928" stroke-width="2"/>
      <text x="540" y="1450" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="36" fill="#ffffff" text-anchor="middle">Every Photo is Real. Every Price is Direct.</text>
      <text x="540" y="1510" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#38bdf8" text-anchor="middle">Filter by Price, Rooms, City &amp; Move-in Date</text>

      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Step 2: Tenant Reviews &amp; Transparency ⬇</text>
    </svg>
    `
  },
  {
    name: 'scene4_reviews',
    duration: 9,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#071b38"/>
          <stop offset="100%" stop-color="#0b2c5d"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg4)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>

      <!-- Step Header -->
      <rect x="90" y="130" width="900" height="120" rx="20" fill="#0284c7"/>
      <text x="540" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#e0f2fe" text-anchor="middle" letter-spacing="2">STEP 2: TOTAL TRANSPARENCY</text>
      <text x="540" y="225" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">Real Tenant Reviews &amp; Ratings</text>

      <!-- Rating Header Card -->
      <rect x="90" y="290" width="900" height="240" rx="24" fill="#0d2854"/>
      <text x="540" y="370" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="64" fill="#ffc928" text-anchor="middle">★ 4.9 / 5.0</text>
      <text x="540" y="430" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle">Know Before You Inspect</text>
      <text x="540" y="480" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#94a3b8" text-anchor="middle">Unbiased reports from actual tenants who lived here</text>

      <!-- Breakdown Metrics -->
      <rect x="90" y="570" width="900" height="420" rx="24" fill="#071a38" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      
      <text x="140" y="640" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="32" fill="#38bdf8">💧 Water Supply:</text>
      <text x="460" y="640" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#ffffff">Treated borehole, running 24/7</text>

      <text x="140" y="730" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="32" fill="#38bdf8">⚡ Power Supply:</text>
      <text x="460" y="730" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#ffffff">Dedicated estate transformer + gen</text>

      <text x="140" y="820" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="32" fill="#38bdf8">🛡 Security:</text>
      <text x="460" y="820" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#ffffff">Gated estate with armed patrol</text>

      <text x="140" y="910" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="32" fill="#38bdf8">👤 Landlord:</text>
      <text x="460" y="910" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#ffffff">Responsive &amp; officially verified</text>

      <!-- Testimonial Quote -->
      <rect x="90" y="1030" width="900" height="320" rx="24" fill="#0e2a5a" stroke="#ffc928" stroke-opacity="0.3" stroke-width="2"/>
      <text x="140" y="1110" font-family="DejaVu Sans, Arial, sans-serif" font-style="italic" font-size="32" fill="#e2e8f0">"The best part of RentalHub is knowing the light and</text>
      <text x="140" y="1160" font-family="DejaVu Sans, Arial, sans-serif" font-style="italic" font-size="32" fill="#e2e8f0">water situation before paying any transport fare!"</text>
      <text x="140" y="1250" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#ffc928">— Chidinma O., Verified Tenant in Lagos</text>

      <!-- Transition tease -->
      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Step 3: Instant Inspection Booking ⬇</text>
    </svg>
    `
  },
  {
    name: 'scene5_inspection',
    duration: 9,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#061b3a"/>
          <stop offset="100%" stop-color="#0a2a5e"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg5)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>

      <!-- Step Header -->
      <rect x="90" y="130" width="900" height="120" rx="20" fill="#0284c7"/>
      <text x="540" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#e0f2fe" text-anchor="middle" letter-spacing="2">STEP 3: EASY BOOKING</text>
      <text x="540" y="225" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">Schedule Inspection in 1 Tap</text>

      <!-- Calendar / Scheduling Card -->
      <rect x="90" y="290" width="900" height="680" rx="28" fill="#0d2854" stroke="#38bdf8" stroke-opacity="0.4" stroke-width="2"/>
      
      <text x="540" y="380" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" fill="#ffffff" text-anchor="middle">Choose Your Convenient Time</text>
      <text x="540" y="430" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">No waiting under the sun. No surprise excuses.</text>

      <!-- Day selector -->
      <rect x="140" y="490" width="220" height="120" rx="16" fill="#ffc928"/>
      <text x="250" y="540" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#061b3a" text-anchor="middle">Saturday</text>
      <text x="250" y="585" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#061b3a" text-anchor="middle">10:00 AM</text>

      <rect x="390" y="490" width="220" height="120" rx="16" fill="#071a38" stroke="#ffffff" stroke-opacity="0.2"/>
      <text x="500" y="540" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#ffffff" text-anchor="middle">Saturday</text>
      <text x="500" y="585" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffc928" text-anchor="middle">2:00 PM</text>

      <rect x="640" y="490" width="220" height="120" rx="16" fill="#071a38" stroke="#ffffff" stroke-opacity="0.2"/>
      <text x="750" y="540" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="26" fill="#ffffff" text-anchor="middle">Sunday</text>
      <text x="750" y="585" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffc928" text-anchor="middle">4:00 PM</text>

      <!-- Manager Info -->
      <rect x="140" y="660" width="720" height="140" rx="16" fill="#071a38"/>
      <text x="170" y="720" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="32" fill="#ffffff">Assigned Property Manager:</text>
      <text x="170" y="765" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#38bdf8">✓ Verified Amana Officer on site with ID badge</text>

      <!-- Confirm Button -->
      <rect x="140" y="840" width="720" height="90" rx="18" fill="#16a34a"/>
      <text x="500" y="895" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle">✓ Inspection Confirmed Free</text>

      <!-- Guarantee Box -->
      <rect x="90" y="1030" width="900" height="280" rx="24" fill="#061b3a" stroke="#ffc928" stroke-width="2"/>
      <text x="540" y="1110" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="38" fill="#ffc928" text-anchor="middle">Zero Inspection Fraud</text>
      <text x="540" y="1170" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#ffffff" text-anchor="middle">You visit real properties directly with verified escorts.</text>
      <text x="540" y="1225" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#94a3b8" text-anchor="middle">No endless agent syndicates. No roadside middlemen.</text>

      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Step 4: Secure Payment &amp; Move-In ⬇</text>
    </svg>
    `
  },
  {
    name: 'scene6_payment',
    duration: 9,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#061b3a"/>
          <stop offset="100%" stop-color="#021024"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg6)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-opacity="0.3" stroke-width="4"/>

      <!-- Step Header -->
      <rect x="90" y="130" width="900" height="120" rx="20" fill="#0284c7"/>
      <text x="540" y="180" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#e0f2fe" text-anchor="middle" letter-spacing="2">STEP 4: PEACE OF MIND</text>
      <text x="540" y="225" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">Secure In-App Rent Payments</text>

      <!-- Payment Security Card -->
      <rect x="90" y="290" width="900" height="740" rx="28" fill="#0d2854" stroke="#ffc928" stroke-opacity="0.3" stroke-width="2"/>
      
      <circle cx="540" cy="400" r="60" fill="#16a34a"/>
      <text x="540" y="425" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="64" fill="#ffffff" text-anchor="middle">🔒</text>

      <text x="540" y="520" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" fill="#ffffff" text-anchor="middle">Protected Bank &amp; Card Rails</text>
      <text x="540" y="570" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Powered by Paystack &amp; Automated Bank Transfer</text>

      <!-- Checklist -->
      <rect x="140" y="630" width="800" height="90" rx="14" fill="#071a38"/>
      <text x="180" y="685" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="30" fill="#38bdf8">✓ Instant Digital Tenancy Agreement Generated</text>

      <rect x="140" y="740" width="800" height="90" rx="14" fill="#071a38"/>
      <text x="180" y="795" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="30" fill="#38bdf8">✓ Downloadable Legal Rent Receipts</text>

      <rect x="140" y="850" width="800" height="90" rx="14" fill="#071a38"/>
      <text x="180" y="905" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="30" fill="#38bdf8">✓ Full Relocation Support (Movers &amp; Cleaning)</text>

      <!-- Bottom Card -->
      <rect x="90" y="1080" width="900" height="240" rx="24" fill="#0284c7"/>
      <text x="540" y="1160" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="40" fill="#ffffff" text-anchor="middle">Move Into Your New Home</text>
      <text x="540" y="1220" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#ffc928" text-anchor="middle">With 100% Legal Protection &amp; Zero Drama</text>

      <text x="540" y="1780" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#94a3b8" text-anchor="middle">Get Started Today ⬇</text>
    </svg>
    `
  },
  {
    name: 'scene7_cta',
    duration: 6,
    svg: `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg7" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#061b3a"/>
          <stop offset="50%" stop-color="#0a2a5e"/>
          <stop offset="100%" stop-color="#030e1d"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg7)"/>
      <rect x="40" y="40" width="1000" height="1840" rx="24" fill="none" stroke="#ffc928" stroke-width="5"/>

      <!-- Crown/Check -->
      <circle cx="540" cy="300" r="90" fill="#ffc928"/>
      <text x="540" y="335" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="90" fill="#061b3a" text-anchor="middle">✓</text>

      <!-- Main Headline -->
      <text x="540" y="470" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="54" fill="#ffffff" text-anchor="middle">Amana RentalHub NG</text>
      <text x="540" y="530" font-family="DejaVu Sans, Arial, sans-serif" font-style="italic" font-size="34" fill="#ffc928" text-anchor="middle">"Your next home, handled with care."</text>

      <!-- Call to Action Box -->
      <rect x="90" y="620" width="900" height="720" rx="32" fill="#0d2854" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>
      
      <text x="540" y="710" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" fill="#ffffff" text-anchor="middle">DOWNLOAD FREE TODAY</text>
      
      <!-- Store Badges Mockup -->
      <rect x="180" y="780" width="720" height="100" rx="20" fill="#000000" stroke="#ffffff" stroke-width="2"/>
      <text x="540" y="842" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle">📱 Available on Google Play (Android)</text>

      <rect x="180" y="910" width="720" height="100" rx="20" fill="#000000" stroke="#ffffff" stroke-width="2"/>
      <text x="540" y="972" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="34" fill="#ffffff" text-anchor="middle">🍏 Available on App Store (iOS)</text>

      <!-- Web URL Button -->
      <rect x="140" y="1080" width="800" height="130" rx="22" fill="#ffc928"/>
      <text x="540" y="1160" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="46" fill="#061b3a" text-anchor="middle">rentalhub.com.ng</text>

      <!-- WhatsApp Help -->
      <rect x="140" y="1250" width="800" height="60" rx="12" fill="#16a34a"/>
      <text x="540" y="1292" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="28" fill="#ffffff" text-anchor="middle">💬 WhatsApp Chat Support: +234 803 060 1238</text>

      <!-- Footer -->
      <text x="540" y="1520" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#38bdf8" text-anchor="middle">Verified Properties in all 36 States Across Nigeria</text>
      <text x="540" y="1580" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#94a3b8" text-anchor="middle">No fake agents. No inspection scams. No surprise fees.</text>
    </svg>
    `
  }
];

async function generateWalkthroughVideo() {
  console.log('1. Rendering 7 high-resolution 1080x1920 scene slides with Sharp...');
  
  const framePaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const pngPath = path.join(FRAMES_DIR, `${scene.name}.png`);
    await sharp(Buffer.from(scene.svg))
      .png()
      .toFile(pngPath);
    framePaths.push({ path: pngPath, duration: scene.duration });
    console.log(`   ✓ Rendered ${scene.name} (${scene.duration}s)`);
  }

  console.log('2. Assembling video scenes with FFmpeg into 60-second walkthrough MP4...');
  
  // Create intermediate video segments for each scene
  const segmentFiles = [];
  for (let i = 0; i < framePaths.length; i++) {
    const item = framePaths[i];
    const segPath = path.join(FRAMES_DIR, `seg_${i}.mp4`);
    
    // Slight zoom/pan movement for a smooth commercial feel
    const cmd = `ffmpeg -y -loop 1 -i "${item.path}" -t ${item.duration} -vf "zoompan=z='min(zoom+0.0003,1.03)':d=${item.duration * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,format=yuv420p" -c:v libx264 -preset fast -pix_fmt yuv420p "${segPath}"`;
    execSync(cmd, { stdio: 'inherit' });
    segmentFiles.push(segPath);
  }

  // Create concat file list
  const concatListPath = path.join(FRAMES_DIR, 'concat_list.txt');
  const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent, 'utf8');

  // Synthesize background musical bed for 60 seconds (rich chord progressions with rhythmic pulse)
  const finalVideoTemp = path.join(FRAMES_DIR, 'video_no_audio.mp4');
  const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoTemp}"`;
  execSync(concatCmd, { stdio: 'inherit' });

  const finalMp4Build = path.join(BUILD_DIR, 'rentalhub-walkthrough-60s.mp4');
  const finalMp4VA = path.join(VA_DIR, 'rentalhub-walkthrough-60s.mp4');

  // Mix dynamic melodic audio bed for the 60 seconds
  console.log('3. Synthesizing Afrobeats rhythmic instrumental track and finalizing audio-video multiplex...');
  const audioCmd = `ffmpeg -y -i "${finalVideoTemp}" -f lavfi -i "aevalsrc=exprs='0.12*sin(2*PI*130.81*t)*(1+0.5*sin(2*PI*4*t)) + 0.08*sin(2*PI*196.00*t) + 0.06*sin(2*PI*261.63*t)*(1+0.3*sin(2*PI*8*t)) + 0.05*sin(2*PI*329.63*t)':s=44100:d=60" -c:v copy -c:a aac -b:a 192k -ar 44100 -shortest "${finalMp4Build}"`;
  execSync(audioCmd, { stdio: 'inherit' });

  fs.copyFileSync(finalMp4Build, finalMp4VA);
  console.log(`\n🎉 Success! 60-second walkthrough video generated:\n- ${finalMp4Build}\n- ${finalMp4VA}\n`);
}

generateWalkthroughVideo().catch(err => {
  console.error('Walkthrough generation failed:', err);
  process.exit(1);
});
