import type { VoiceAdConfig } from '../components/VoiceAd';

// ── Sell ads: 8 fixed legacy concepts + 2 new ones ──────────────────────
// Frame counts are measured from the voiceover WAVs (30fps). Beats drive
// motion: open (slow), build, punch (hard cut + slam), hold (weight), brand
// (flash + ding). Grades give each ad its emotional color wash.

const NAVY = '#0f172a';
const SLATE = '#334155';
const BLUE = '#1d4ed8';
const SKY = '#0c4a6e';
const GOLD = '#eab308';
const RED = '#b91c1c';
const RED_DARK = '#450a0a';
const EMERALD = '#065f46';
const AMBER = '#b45309';
const GREEN = '#166534';

// ── TextAd1: STOP paying agents (fear) ──
export const sellText1: VoiceAdConfig = {
  grade: 'rgba(220,38,38,0.08)',
  lines: [
    { file: 'vo/text1-vo-1.wav', frames: 52, kicker: 'RentalHub', headline: 'STOP.', accentWords: ['STOP'], from: RED_DARK, to: RED, accent: GOLD, image: 'images/text1/1.jpg', beat: 'open', fontSize: 96 },
    { file: 'vo/text1-vo-2.wav', frames: 80, headline: 'Paying agents for houses that do not exist.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/text1/2.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/text1-vo-3.wav', frames: 99, headline: 'Fake listings. Empty promises.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/text1/3.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/text1-vo-4.wav', frames: 86, headline: 'You work too hard for this.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text1/4.jpg', beat: 'hold', fontSize: 56 },
    { file: 'vo/text1-vo-5.wav', frames: 104, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text1/5.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/text1-vo-6.wav', frames: 86, headline: 'Never lose your money again.', accentWords: ['Never'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/text1/6.jpg', beat: 'hold', fontSize: 58 },
    { file: 'vo/text1-vo-7.wav', frames: 273, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/text1/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── TextAd2: 3 steps (trust) ──
export const sellText2: VoiceAdConfig = {
  grade: 'rgba(56,189,248,0.08)',
  lines: [
    { file: 'vo/text2-vo-1.wav', frames: 98, kicker: 'RentalHub', headline: 'Finding a home in three steps.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text2/1.jpg', beat: 'open', fontSize: 56 },
    { file: 'vo/text2-vo-2.wav', frames: 89, headline: 'Step one. Search verified listings.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text2/2.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/text2-vo-3.wav', frames: 83, headline: 'Step two. Message the real landlord.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text2/3.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/text2-vo-4.wav', frames: 79, headline: 'Step three. Move in with confidence.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text2/4.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/text2-vo-5.wav', frames: 93, kicker: 'Direct', headline: 'RentalHub connects you directly.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text2/5.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/text2-vo-6.wav', frames: 142, headline: 'No agent fees. No fake listings.', accentWords: ['fake'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/text2/6.jpg', beat: 'hold', fontSize: 54 },
    { file: 'vo/text2-vo-7.wav', frames: 196, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/text2/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── TextAd3: 36 states (pride) ──
export const sellText3: VoiceAdConfig = {
  grade: 'rgba(16,185,129,0.07)',
  lines: [
    { file: 'vo/text3-vo-1.wav', frames: 160, kicker: 'RentalHub', headline: '36 states. One trusted platform.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text3/1.jpg', beat: 'open', fontSize: 52 },
    { file: 'vo/text3-vo-2.wav', frames: 77, headline: 'From Lagos to Kano.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text3/2.jpg', beat: 'build', fontSize: 56 },
    { file: 'vo/text3-vo-3.wav', frames: 78, headline: 'From Abuja to Enugu.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text3/3.jpg', beat: 'build', fontSize: 56 },
    { file: 'vo/text3-vo-4.wav', frames: 87, headline: 'Verified homes everywhere.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text3/4.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/text3-vo-5.wav', frames: 110, kicker: 'Nationwide', headline: 'RentalHub is home to all of Nigeria.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text3/5.jpg', beat: 'build', fontSize: 48 },
    { file: 'vo/text3-vo-6.wav', frames: 111, headline: 'Whatever the state, we have got you.', accentWords: ['state'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/text3/6.jpg', beat: 'hold', fontSize: 50 },
    { file: 'vo/text3-vo-7.wav', frames: 157, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/text3/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── TextAd4: testimonials (trust) ──
export const sellText4: VoiceAdConfig = {
  grade: 'rgba(16,185,129,0.08)',
  lines: [
    { file: 'vo/text4-vo-1.wav', frames: 74, kicker: 'Real renters', headline: 'What real renters say.', from: NAVY, to: SLATE, accent: EMERALD, image: 'images/text4/1.jpg', beat: 'open', fontSize: 54 },
    { file: 'vo/text4-vo-2.wav', frames: 119, headline: 'I found my Lekki apartment in three days.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/text4/2.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/text4-vo-3.wav', frames: 146, headline: 'The landlord was real. The rent was real.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/text4/3.jpg', beat: 'build', fontSize: 48 },
    { file: 'vo/text4-vo-4.wav', frames: 175, headline: 'No agent. No stress. No story.', accentWords: ['story'], from: NAVY, to: SLATE, accent: EMERALD, image: 'images/text4/4.jpg', beat: 'punch', fontSize: 56 },
    { file: 'vo/text4-vo-5.wav', frames: 123, kicker: 'Results', headline: 'Real people. Real results.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/text4/5.jpg', beat: 'build', fontSize: 54 },
    { file: 'vo/text4-vo-6.wav', frames: 120, headline: 'Join 10,000+ verified renters.', accentWords: ['10,000+'], from: NAVY, to: SLATE, accent: EMERALD, image: 'images/text4/6.jpg', beat: 'hold', fontSize: 52 },
    { file: 'vo/text4-vo-7.wav', frames: 143, headline: 'rentalhub.com.ng/download', from: NAVY, to: GREEN, accent: GOLD, image: 'images/text4/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── TextAd5: scams (fear) ──
export const sellText5: VoiceAdConfig = {
  grade: 'rgba(220,38,38,0.08)',
  lines: [
    { file: 'vo/text5-vo-1.wav', frames: 139, kicker: 'Warning', headline: 'Agent scams cost Nigerians billions every year.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/text5/1.jpg', beat: 'open', fontSize: 46 },
    { file: 'vo/text5-vo-2.wav', frames: 130, headline: 'Fake listings. Fake agents.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/text5/2.jpg', beat: 'build', fontSize: 54 },
    { file: 'vo/text5-vo-3.wav', frames: 89, headline: 'Money gone before you know it.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/text5/3.jpg', beat: 'punch', fontSize: 54 },
    { file: 'vo/text5-vo-4.wav', frames: 102, kicker: 'Verified', headline: 'RentalHub verifies before you pay.', from: SKY, to: BLUE, accent: GOLD, image: 'images/text5/4.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/text5-vo-5.wav', frames: 119, headline: 'If it is on RentalHub, it is real.', accentWords: ['real'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/text5/5.jpg', beat: 'hold', fontSize: 54 },
    { file: 'vo/text5-vo-6.wav', frames: 134, headline: 'Protect your money. Rent the safe way.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/text5/6.jpg', beat: 'hold', fontSize: 50 },
    { file: 'vo/text5-vo-7.wav', frames: 187, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/text5/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── CartoonAd1: bad agent story (fear) ──
export const sellCartoon1: VoiceAdConfig = {
  grade: 'rgba(220,38,38,0.08)',
  lines: [
    { file: 'vo/cartoon1-vo-1.wav', frames: 167, kicker: 'Story time', headline: 'You see a listing online. The photos look amazing.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon1/1.jpg', beat: 'open', fontSize: 46 },
    { file: 'vo/cartoon1-vo-2.wav', frames: 168, headline: 'You pay the agent fee. ₦20,000 gone.', accentWords: ['gone'], from: RED_DARK, to: RED, accent: GOLD, image: 'images/cartoon1/2.jpg', beat: 'punch', fontSize: 52 },
    { file: 'vo/cartoon1-vo-3.wav', frames: 145, headline: 'You get to the house. It does not exist.', from: RED_DARK, to: RED, accent: GOLD, image: 'images/cartoon1/3.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/cartoon1-vo-4.wav', frames: 69, headline: 'Sound familiar?', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon1/4.jpg', beat: 'build', fontSize: 58 },
    { file: 'vo/cartoon1-vo-5.wav', frames: 104, kicker: 'Verified', headline: 'RentalHub verifies every listing.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon1/5.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/cartoon1-vo-6.wav', frames: 105, headline: 'Find your next home with confidence.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon1/6.jpg', beat: 'hold', fontSize: 52 },
    { file: 'vo/cartoon1-vo-7.wav', frames: 142, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/cartoon1/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── CartoonAd2: how it works (trust) ──
export const sellCartoon2: VoiceAdConfig = {
  grade: 'rgba(56,189,248,0.08)',
  lines: [
    { file: 'vo/cartoon2-vo-1.wav', frames: 71, kicker: 'RentalHub', headline: 'Skip the middleman.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon2/1.jpg', beat: 'open', fontSize: 58 },
    { file: 'vo/cartoon2-vo-2.wav', frames: 82, headline: 'Search verified homes.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon2/2.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/cartoon2-vo-3.wav', frames: 92, headline: 'Talk directly to the landlord.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon2/3.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/cartoon2-vo-4.wav', frames: 134, headline: 'Pay securely. Move in safely.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon2/4.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/cartoon2-vo-5.wav', frames: 96, kicker: 'Verified', headline: 'RentalHub does the verification.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon2/5.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/cartoon2-vo-6.wav', frames: 87, headline: 'You just move in and smile.', accentWords: ['smile'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon2/6.jpg', beat: 'hold', fontSize: 54 },
    { file: 'vo/cartoon2-vo-7.wav', frames: 218, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/cartoon2/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── CartoonAd3: nationwide (pride) ──
export const sellCartoon3: VoiceAdConfig = {
  grade: 'rgba(16,185,129,0.07)',
  lines: [
    { file: 'vo/cartoon3-vo-1.wav', frames: 175, kicker: 'Nationwide', headline: 'RentalHub. Every state. Every home.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon3/1.jpg', beat: 'open', fontSize: 52 },
    { file: 'vo/cartoon3-vo-2.wav', frames: 87, headline: '36 states covered.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon3/2.jpg', beat: 'build', fontSize: 56 },
    { file: 'vo/cartoon3-vo-3.wav', frames: 152, headline: 'Verified in Lagos. Verified in Kano.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon3/3.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/cartoon3-vo-4.wav', frames: 141, headline: 'One platform. The whole of Nigeria.', from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon3/4.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/cartoon3-vo-5.wav', frames: 109, headline: 'Your next home is closer than you think.', from: SKY, to: BLUE, accent: GOLD, image: 'images/cartoon3/5.jpg', beat: 'hold', fontSize: 50 },
    { file: 'vo/cartoon3-vo-6.wav', frames: 138, headline: 'RentalHub. Your home, country wide.', accentWords: ['country'], from: NAVY, to: SLATE, accent: GOLD, image: 'images/cartoon3/6.jpg', beat: 'hold', fontSize: 50 },
    { file: 'vo/cartoon3-vo-7.wav', frames: 128, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/cartoon3/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── NEW: UrgencyAd1 (FOMO) ──
export const sellUrgency: VoiceAdConfig = {
  grade: 'rgba(234,179,8,0.09)',
  lines: [
    { file: 'vo/urgency-vo-1.wav', frames: 130, kicker: 'This week', headline: '3 verified apartments left in Ikeja.', from: AMBER, to: '#78350f', accent: GOLD, image: 'images/urgency/1.jpg', beat: 'open', fontSize: 52 },
    { file: 'vo/urgency-vo-2.wav', frames: 89, headline: 'The best homes move fast.', from: NAVY, to: SLATE, accent: AMBER, image: 'images/urgency/2.jpg', beat: 'build', fontSize: 54 },
    { file: 'vo/urgency-vo-3.wav', frames: 135, headline: 'First verified. First served.', from: NAVY, to: SLATE, accent: AMBER, image: 'images/urgency/3.jpg', beat: 'punch', fontSize: 56 },
    { file: 'vo/urgency-vo-4.wav', frames: 98, kicker: 'Alerts', headline: 'RentalHub alerts you before they go.', from: SKY, to: BLUE, accent: GOLD, image: 'images/urgency/4.jpg', beat: 'build', fontSize: 50 },
    { file: 'vo/urgency-vo-5.wav', frames: 131, headline: 'Set your alert. Do not miss out.', from: NAVY, to: SLATE, accent: AMBER, image: 'images/urgency/5.jpg', beat: 'hold', fontSize: 52 },
    { file: 'vo/urgency-vo-6.wav', frames: 86, headline: 'Your next home will not wait.', accentWords: ['wait'], from: NAVY, to: SLATE, accent: AMBER, image: 'images/urgency/6.jpg', beat: 'hold', fontSize: 54 },
    { file: 'vo/urgency-vo-7.wav', frames: 111, headline: 'rentalhub.com.ng/download', from: NAVY, to: BLUE, accent: GOLD, image: 'images/urgency/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};

// ── NEW: LandlordAd1 (landlord audience) ──
export const sellLandlord: VoiceAdConfig = {
  grade: 'rgba(16,185,129,0.08)',
  lines: [
    { file: 'vo/landlord-vo-1.wav', frames: 80, kicker: 'For landlords', headline: 'Good tenants are out there.', from: NAVY, to: SLATE, accent: EMERALD, image: 'images/landlord/1.jpg', beat: 'open', fontSize: 54 },
    { file: 'vo/landlord-vo-2.wav', frames: 78, headline: 'They are on RentalHub.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/landlord/2.jpg', beat: 'build', fontSize: 56 },
    { file: 'vo/landlord-vo-3.wav', frames: 134, headline: 'Verified renters. Real income.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/landlord/3.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/landlord-vo-4.wav', frames: 91, headline: 'List your property in minutes.', from: EMERALD, to: GREEN, accent: GOLD, image: 'images/landlord/4.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/landlord-vo-5.wav', frames: 78, kicker: 'Verified', headline: 'RentalHub does the vetting.', from: NAVY, to: SLATE, accent: EMERALD, image: 'images/landlord/5.jpg', beat: 'build', fontSize: 52 },
    { file: 'vo/landlord-vo-6.wav', frames: 140, headline: 'Welcome the right tenants.', accentWords: ['right'], from: NAVY, to: SLATE, accent: EMERALD, image: 'images/landlord/6.jpg', beat: 'hold', fontSize: 56 },
    { file: 'vo/landlord-vo-7.wav', frames: 179, headline: 'rentalhub.com.ng/download', from: NAVY, to: GREEN, accent: GOLD, image: 'images/landlord/7.jpg', beat: 'brand', fontSize: 46, fontWeight: 700 },
  ],
};
