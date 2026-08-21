import type { VoiceAdConfig } from '../components/VoiceAd';
import type { VoiceLine } from '../components/VoiceAd';

const NAVY = '#0f172a';
const SLATE = '#334155';
const BLUE = '#1d4ed8';
const SKY = '#0c4a6e';
const GOLD = '#eab308';
const WARM_DARK = '#292524';
const WARM_DEEP = '#1c1917';
const AMBER = '#f59e0b';
const CREAM = '#fef3c7';

// Frame counts are measured from the actual voiceover WAVs (30fps).
// Replace any file with an MP3 of the same base name (public/vo/*.mp3) to
// swap in a studio voice without changing code.

export const aspirationMale: VoiceLine[] = [
  { file: 'vo/aspiration-vo-1.wav', frames: 78, kicker: 'RentalHub', headline: 'Your address says a lot.', from: NAVY, to: SLATE, accent: GOLD, animation: 'zoomIn', beat: 'open',
  image: 'images/aspiration/1.jpg',},
  { file: 'vo/aspiration-vo-2.wav', frames: 150, headline: 'Ikeja. Lekki. Wuse II.', from: SKY, to: BLUE, accent: GOLD, animation: 'slideUp',
  image: 'images/aspiration/2.jpg',},
  { file: 'vo/aspiration-vo-3.wav', frames: 92, headline: 'Homes that match your ambition.', from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 54,
  image: 'images/aspiration/3.jpg',},
  { file: 'vo/aspiration-vo-4.wav', frames: 104, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, animation: 'slideUp', fontSize: 54,
  image: 'images/aspiration/4.jpg',},
  { file: 'vo/aspiration-vo-5.wav', frames: 225, headline: 'Paystack-secured. NDPR-safe. No agent fees.', from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 46, fontWeight: 700,
  image: 'images/aspiration/5.jpg',},
  { file: 'vo/aspiration-vo-6.wav', frames: 143, kicker: 'RentalHub', headline: 'Find your next address.', accentWords: ['address'], from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 66, beat: 'hold',
  image: 'images/aspiration/6.jpg',},
  { file: 'vo/aspiration-vo-7.wav', frames: 108, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 48, fontWeight: 700, beat: 'brand',
  image: 'images/aspiration/7.jpg',},
];

export const aspirationFemale: VoiceLine[] = [
  { file: 'vo/aspiration-vo-1-f.wav', frames: 80, kicker: 'RentalHub', headline: 'Your address says a lot.', from: NAVY, to: SLATE, accent: GOLD, animation: 'zoomIn', beat: 'open' ,
    image: 'images/aspiration/1.jpg'},
  { file: 'vo/aspiration-vo-2-f.wav', frames: 150, headline: 'Ikeja. Lekki. Wuse II.', from: SKY, to: BLUE, accent: GOLD, animation: 'slideUp' ,
    image: 'images/aspiration/2.jpg'},
  { file: 'vo/aspiration-vo-3-f.wav', frames: 92, headline: 'Homes that match your ambition.', from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 54 ,
    image: 'images/aspiration/3.jpg'},
  { file: 'vo/aspiration-vo-4-f.wav', frames: 101, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, animation: 'slideUp', fontSize: 54 ,
    image: 'images/aspiration/4.jpg'},
  { file: 'vo/aspiration-vo-5-f.wav', frames: 222, headline: 'Paystack-secured. NDPR-safe. No agent fees.', from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 46, fontWeight: 700 ,
    image: 'images/aspiration/5.jpg'},
  { file: 'vo/aspiration-vo-6-f.wav', frames: 140, kicker: 'RentalHub', headline: 'Find your next address.', accentWords: ['address'], from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 66, beat: 'hold' ,
    image: 'images/aspiration/6.jpg'},
  { file: 'vo/aspiration-vo-7-f.wav', frames: 115, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 48, fontWeight: 700, beat: 'brand' ,
    image: 'images/aspiration/7.jpg'},
];

export const belongingMale: VoiceLine[] = [
  { file: 'vo/belonging-vo-1.wav', frames: 94, kicker: 'RentalHub', headline: "Home isn't just four walls.", from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'fade', fontSize: 60, beat: 'open',
  image: 'images/belonging/1.jpg',},
  { file: 'vo/belonging-vo-2.wav', frames: 134, headline: 'Sunday rice. Family laughter.', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'slideUp', fontSize: 56, fontWeight: 800,
  image: 'images/belonging/2.jpg',},
  { file: 'vo/belonging-vo-3.wav', frames: 81, headline: 'A room for the kids to grow.', from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'fade', fontSize: 56,
  image: 'images/belonging/3.jpg',},
  { file: 'vo/belonging-vo-4.wav', frames: 94, headline: 'A door that opens for everyone.', from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'slideUp', fontSize: 54,
  image: 'images/belonging/4.jpg',},
  { file: 'vo/belonging-vo-5.wav', frames: 111, kicker: 'Verified', headline: 'RentalHub verifies before you move in.', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'fade', fontSize: 50,
  image: 'images/belonging/5.jpg',},
  { file: 'vo/belonging-vo-6.wav', frames: 133, kicker: 'RentalHub', headline: 'Home for your family.', accentWords: ['family'], from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'pulse', fontSize: 66, beat: 'hold',
  image: 'images/belonging/6.jpg',},
  { file: 'vo/belonging-vo-7.wav', frames: 133, headline: 'rentalhub.com.ng/download', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'pulse', fontSize: 46, fontWeight: 700, beat: 'brand',
  image: 'images/belonging/7.jpg',},
];

export const belongingFemale: VoiceLine[] = [
  { file: 'vo/belonging-vo-1-f.wav', frames: 92, kicker: 'RentalHub', headline: "Home isn't just four walls.", from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'fade', fontSize: 60, beat: 'open' ,
    image: 'images/belonging/1.jpg'},
  { file: 'vo/belonging-vo-2-f.wav', frames: 130, headline: 'Sunday rice. Family laughter.', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'slideUp', fontSize: 56, fontWeight: 800 ,
    image: 'images/belonging/2.jpg'},
  { file: 'vo/belonging-vo-3-f.wav', frames: 86, headline: 'A room for the kids to grow.', from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'fade', fontSize: 56 ,
    image: 'images/belonging/3.jpg'},
  { file: 'vo/belonging-vo-4-f.wav', frames: 92, headline: 'A door that opens for everyone.', from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'slideUp', fontSize: 54 ,
    image: 'images/belonging/4.jpg'},
  { file: 'vo/belonging-vo-5-f.wav', frames: 110, kicker: 'Verified', headline: 'RentalHub verifies before you move in.', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'fade', fontSize: 50 ,
    image: 'images/belonging/5.jpg'},
  { file: 'vo/belonging-vo-6-f.wav', frames: 130, kicker: 'RentalHub', headline: 'Home for your family.', accentWords: ['family'], from: WARM_DARK, to: WARM_DEEP, accent: AMBER, animation: 'pulse', fontSize: 66, beat: 'hold' ,
    image: 'images/belonging/6.jpg'},
  { file: 'vo/belonging-vo-7-f.wav', frames: 140, headline: 'rentalhub.com.ng/download', from: '#78350f', to: WARM_DEEP, accent: CREAM, animation: 'pulse', fontSize: 46, fontWeight: 700, beat: 'brand' ,
    image: 'images/belonging/7.jpg'},
];

export const joyMale: VoiceLine[] = [
  { file: 'vo/joy-vo-1.wav', frames: 109, kicker: 'RentalHub', headline: 'The comedy series called house hunting.', from: NAVY, to: SLATE, accent: GOLD, animation: 'pulse', fontSize: 50,
  image: 'images/joy/1.jpg',},
  { file: 'vo/joy-vo-2.wav', frames: 130, headline: "Agent: 'Just a small issue with the roof.'", from: NAVY, to: SLATE, accent: GOLD, animation: 'slideUp', fontSize: 48, fontWeight: 700,
  image: 'images/joy/2.jpg',},
  { file: 'vo/joy-vo-3.wav', frames: 85, kicker: 'Plot twist', headline: 'The roof: absent.', accentWords: ['absent'], from: NAVY, to: SLATE, accent: GOLD, animation: 'zoomIn', fontSize: 72, beat: 'punch',
  image: 'images/joy/3.jpg',},
  { file: 'vo/joy-vo-4.wav', frames: 100, headline: "14 'wonderful' houses later...", from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 50,
  image: 'images/joy/4.jpg',},
  { file: 'vo/joy-vo-5.wav', frames: 104, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 54,
  image: 'images/joy/5.jpg',},
  { file: 'vo/joy-vo-6.wav', frames: 138, kicker: 'RentalHub', headline: 'Laugh for real this time.', from: NAVY, to: SLATE, accent: GOLD, animation: 'pulse', fontSize: 60, beat: 'hold',
  image: 'images/joy/6.jpg',},
  { file: 'vo/joy-vo-7.wav', frames: 114, headline: 'rentalhub.com.ng/download', from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 44, fontWeight: 700, beat: 'brand',
  image: 'images/joy/7.jpg',},
];

export const joyFemale: VoiceLine[] = [
  { file: 'vo/joy-vo-1-f.wav', frames: 109, kicker: 'RentalHub', headline: 'The comedy series called house hunting.', from: NAVY, to: SLATE, accent: GOLD, animation: 'pulse', fontSize: 50 ,
    image: 'images/joy/1.jpg'},
  { file: 'vo/joy-vo-2-f.wav', frames: 125, headline: "Agent: 'Just a small issue with the roof.'", from: NAVY, to: SLATE, accent: GOLD, animation: 'slideUp', fontSize: 48, fontWeight: 700 ,
    image: 'images/joy/2.jpg'},
  { file: 'vo/joy-vo-3-f.wav', frames: 82, kicker: 'Plot twist', headline: 'The roof: absent.', accentWords: ['absent'], from: NAVY, to: SLATE, accent: GOLD, animation: 'zoomIn', fontSize: 72, beat: 'punch' ,
    image: 'images/joy/3.jpg'},
  { file: 'vo/joy-vo-4-f.wav', frames: 97, headline: "14 'wonderful' houses later...", from: NAVY, to: SLATE, accent: GOLD, animation: 'fade', fontSize: 50 ,
    image: 'images/joy/4.jpg'},
  { file: 'vo/joy-vo-5-f.wav', frames: 101, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 54 ,
    image: 'images/joy/5.jpg'},
  { file: 'vo/joy-vo-6-f.wav', frames: 135, kicker: 'RentalHub', headline: 'Laugh for real this time.', from: NAVY, to: SLATE, accent: GOLD, animation: 'pulse', fontSize: 60, beat: 'hold' ,
    image: 'images/joy/6.jpg'},
  { file: 'vo/joy-vo-7-f.wav', frames: 131, headline: 'rentalhub.com.ng/download', from: SKY, to: BLUE, accent: GOLD, animation: 'pulse', fontSize: 44, fontWeight: 700, beat: 'brand' ,
    image: 'images/joy/7.jpg'},
];

// -- Ad configs (per-ad grade + lines) ------------------------------------

export const aspirationAd: VoiceAdConfig = { grade: 'rgba(56,189,248,0.10)', lines: aspirationMale };
export const aspirationAdF: VoiceAdConfig = { grade: 'rgba(56,189,248,0.10)', lines: aspirationFemale };
export const belongingAd: VoiceAdConfig = { grade: 'rgba(245,158,11,0.08)', lines: belongingMale };
export const belongingAdF: VoiceAdConfig = { grade: 'rgba(245,158,11,0.08)', lines: belongingFemale };
export const joyAd: VoiceAdConfig = { grade: 'rgba(234,179,8,0.07)', lines: joyMale };
export const joyAdF: VoiceAdConfig = { grade: 'rgba(234,179,8,0.07)', lines: joyFemale };
