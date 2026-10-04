const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'templates');
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const accentLast = (h) => h.replace(/(\S+)(\s*)$/, '<span class="accent">$1</span>$2');
const LOGO = '<img class="logo" src="../../client/public/rentalhub-mark.svg" alt="RentalHub NG">';
const FOOTER = '<div class="footer">rentalhub.com.ng&nbsp;&nbsp;&bull;&nbsp;&nbsp;support@rentalhub.com.ng</div>';
const tick = (p) => `<span class="tick"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" style="stroke:${p.onAccent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

const PALETTES = [
  { key: 'blue', name: 'Royal Blue', light: false, bg: '#0B1739', bg2: '#12275E', card: '#13295F', accent: '#22C55E', accent2: '#14B8A6', ink: '#FFFFFF', soft: '#C7D2EA', onAccent: '#0B1739' },
  { key: 'gold', name: 'Charcoal Gold', light: false, bg: '#0B0B0D', bg2: '#1A1A1E', card: '#17171B', accent: '#E2B64A', accent2: '#C9A45C', ink: '#FFFFFF', soft: '#CBBFA8', onAccent: '#0B0B0D' },
  { key: 'green', name: 'Deep Green', light: false, bg: '#0B3F31', bg2: '#12734F', card: '#0E5C46', accent: '#A7F3D0', accent2: '#22C55E', ink: '#FFFFFF', soft: '#B9D8CC', onAccent: '#0A3F31' },
  { key: 'navy', name: 'Navy Cyan', light: false, bg: '#0B0930', bg2: '#17123E', card: '#141036', accent: '#22D3EE', accent2: '#8B5CF6', ink: '#FFFFFF', soft: '#C7C9E6', onAccent: '#08061F' },
  { key: 'cream', name: 'Sand Terracotta', light: true, bg: '#EFE3D0', bg2: '#F7EEE0', card: '#FFF9F1', accent: '#B5673A', accent2: '#8A4B28', ink: '#2E2418', soft: '#6E5B48', onAccent: '#FFFFFF' },
];

const CONTENT = [
  { eyebrow: "NIGERIA'S VERIFIED RENTAL MARKETPLACE", h: 'Rent safely, direct from landlords.', sub: 'No hidden agents. Just verified homes and honest prices.', bullets: ['Verified landlords & inspected homes', 'Zero hidden agent or platform fees', 'Secure payments with instant receipts', 'Real photos and upfront pricing', '24/7 support, move in with confidence'], stat: '4.9', statlbl: 'TENANT RATING' },
  { eyebrow: 'PREMIUM VERIFIED LISTINGS', h: 'Luxury you can trust.', sub: 'Inspected before they go live, verified when you move in.', bullets: ['Hand-verified landlords & agents', 'Real photos and honest pricing', 'Secure, receipted payments', 'Premium homes, fully inspected', 'Concierge support from viewing to keys'], stat: '5.0', statlbl: 'GUEST SCORE' },
  { eyebrow: 'SAVE MONTHLY, PAY WITH EASE', h: 'Save monthly. Rent without panic.', sub: 'Set your target rent and let automated top-ups do the work.', bullets: ['Set your target rent amount', 'Automated monthly top-ups', 'Withdraw at maturity, on time', 'No lump sums, no pressure', 'Track progress in real time'], stat: '\u20A60', statlbl: 'HIDDEN FEES' },
  { eyebrow: 'SMART RENTAL SEARCH', h: 'Your next home, one tap away.', sub: 'Search verified rentals with instant alerts and honest details.', bullets: ['Filter by area, size and budget', 'Instant alerts on new listings', 'Verified listings only', 'Save and compare favourites', 'Chat directly with landlords'], stat: '1', statlbl: 'TAP TO APPLY' },
  { eyebrow: 'RENT WITH BACKUP', h: 'Disputes resolved with a paper trail.', sub: 'Verified legal support, state by state, on every transaction.', bullets: ['Verified lawyers in your state', 'Log disputes with evidence', 'Track every step transparently', 'Written, receipted outcomes', 'Support until it is settled'], stat: '100%', statlbl: 'DOCUMENTED' },
  { eyebrow: 'NO AGENT WAHALA', h: 'No agent. No wahala. Just keys.', sub: 'Rent direct from verified landlords, sharp sharp.', bullets: ['Landlord verified before listing', 'No middleman charges', 'Pay and get receipt instantly', 'See real photos, no filter', 'Support dey 24/7'], stat: '\u20A60', statlbl: 'AGENT FEES' },
  { eyebrow: 'FINE HOUSES, HONEST PRICE', h: 'Fine houses, honest price.', sub: 'Premium homes with clean, transparent pricing.', bullets: ['Every home inspected', 'No hidden charges', 'Secure, receipted payments', 'Real photos only', 'Concierge support'], stat: '5.0', statlbl: 'STAR HOMES' },
  { eyebrow: 'SAVE SMALL SMALL', h: 'Small small, you go reach your rent.', sub: 'Save gradually and pay rent without pressure.', bullets: ['Set your rent target', 'Auto top-up monthly', 'Withdraw when due', 'No lump sum stress', 'Track am live'], stat: '\u20A60', statlbl: 'STRESS' },
  { eyebrow: 'SEARCH SMART', h: 'Search smart. Move sharp sharp.', sub: 'Find verified homes fast with smart filters.', bullets: ['Filter by area and budget', 'Instant new-listing alerts', 'Verified homes only', 'Save and compare', 'Chat landlords direct'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'WE DEY FOR YOU', h: 'If trouble come, we dey for you.', sub: 'Legal support on every rental transaction.', bullets: ['Verified lawyers nationwide', 'Report disputes with proof', 'Track every step', 'Written outcomes', 'We stay till resolved'], stat: '100%', statlbl: 'BACKED' },
  { eyebrow: 'ZERO STORIES', h: 'Verified homes, zero stories.', sub: 'What you see is what you get, every time.', bullets: ['Inspected properties', 'Verified landlords', 'Honest pricing', 'Real photos', 'Fast support'], stat: '4.9', statlbl: 'RATING' },
  { eyebrow: 'NO HIDDEN CHARGES', h: 'Premium living, no hidden charges.', sub: 'Luxury rentals with transparent total costs.', bullets: ['Upfront pricing', 'Inspected homes', 'Secure payments', 'Receipts always', 'Dedicated concierge'], stat: '\u20A60', statlbl: 'HIDDEN' },
  { eyebrow: 'RENT WITHOUT STRESS', h: 'Save for rent without stress.', sub: 'Automate your rent savings month by month.', bullets: ['Set target amount', 'Monthly auto-save', 'Withdraw at maturity', 'No lump sum', 'Live progress'], stat: '\u20A60', statlbl: 'PRESSURE' },
  { eyebrow: 'FIND YOUR SPACE', h: 'Find your space in minutes.', sub: 'Search, filter and shortlist verified homes fast.', bullets: ['Filter by area and size', 'New-listing alerts', 'Verified only', 'Save favourites', 'Direct chat'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'PROTECTED AGREEMENTS', h: 'Rent agreement wey protect you.', sub: 'Clear, written terms on every deal.', bullets: ['Verified legal templates', 'Digital signatures', 'Evidence storage', 'Transparent steps', 'Receipted outcomes'], stat: '100%', statlbl: 'SAFE' },
  { eyebrow: 'LANDLORD PEACE', h: 'Landlord no go worry you.', sub: 'Verified tenants and on-time payments, guaranteed.', bullets: ['Screen verified tenants', 'On-time rent alerts', 'Digital receipts', 'Transparent earnings', 'Dedicated support'], stat: '0', statlbl: 'DRAMA' },
  { eyebrow: 'CLASSY & CLEAN', h: 'Classy homes, clean paperwork.', sub: 'Premium rentals with airtight documentation.', bullets: ['Inspected properties', 'Verified landlords', 'Written agreements', 'Receipted payments', 'Concierge help'], stat: '5.0', statlbl: 'CLEAN' },
  { eyebrow: 'YOUR PACE', h: 'Your rent, your pace.', sub: 'Save at a rhythm that fits your pocket.', bullets: ['Set your own target', 'Flexible monthly top-ups', 'Withdraw when ready', 'No penalties', 'Track everything'], stat: '\u20A60', statlbl: 'RUSH' },
  { eyebrow: 'ONE SEARCH', h: 'One search, plenty homes.', sub: 'Thousands of verified listings in one place.', bullets: ['Wide verified listings', 'Smart filters', 'Instant alerts', 'Save and compare', 'Direct contact'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'EVERY KOBO COUNTS', h: 'Every kobo documented.', sub: 'Track every naira from payment to receipt.', bullets: ['Digital receipts', 'Payment history', 'Dispute evidence', 'Transparent steps', 'Verified support'], stat: '100%', statlbl: 'TRACKED' },
  { eyebrow: 'MOVE WITH CONFIDENCE', h: 'Move in with confidence.', sub: 'Verified homes and secure payments, always.', bullets: ['Inspected homes', 'Verified landlords', 'Secure checkout', 'Instant receipts', '24/7 support'], stat: '4.9', statlbl: 'SAFE' },
  { eyebrow: 'INSPECTED LUXURY', h: 'Luxury listings, inspected.', sub: 'Every premium home checked before it goes live.', bullets: ['Physical inspection', 'Verified ownership', 'Honest pricing', 'Real photos', 'Concierge support'], stat: '5.0', statlbl: 'CHECKED' },
  { eyebrow: 'PAY SMALL SMALL', h: 'Pay small small, rent big big.', sub: 'Break your rent into easy monthly savings.', bullets: ['Set rent target', 'Auto monthly top-up', 'Withdraw at due date', 'No lump sum', 'See progress'], stat: '\u20A60', statlbl: 'STRESS' },
  { eyebrow: 'NEW HOME ALERTS', h: 'Alerts when new homes drop.', sub: 'Be first to see verified listings in your area.', bullets: ['Area-based alerts', 'Instant notifications', 'Verified listings', 'Save searches', 'Chat landlords'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'LEGAL BACKUP', h: 'Legal backup on every deal.', sub: 'Verified lawyers ready if anything goes wrong.', bullets: ['State-by-state lawyers', 'Evidence logging', 'Transparent tracking', 'Written outcomes', 'Support till settled'], stat: '100%', statlbl: 'BACKED' },
  { eyebrow: 'REAL HOMES', h: 'Real homes. Real landlords.', sub: 'No fake listings, no inflated prices.', bullets: ['Inspected properties', 'Verified landlords', 'Honest pricing', 'Real photos', 'Fast support'], stat: '4.9', statlbl: 'REAL' },
  { eyebrow: 'THE FINER THINGS', h: 'The finer things, verified.', sub: 'Premium homes for discerning tenants.', bullets: ['Curated listings', 'Verified owners', 'Secure payments', 'Receipts always', 'Concierge care'], stat: '5.0', statlbl: 'FINER' },
  { eyebrow: 'RENT PLAN', h: 'Rent plan wey make sense.', sub: 'A savings plan built around your rent date.', bullets: ['Set rent goal', 'Auto monthly savings', 'Withdraw on time', 'No hidden fees', 'Live tracking'], stat: '\u20A60', statlbl: 'HIDDEN' },
  { eyebrow: 'FILTER SAVE COMPARE', h: 'Filter, save, compare.', sub: 'Shortlist verified homes your own way.', bullets: ['Smart filters', 'Save favourites', 'Compare side by side', 'Instant alerts', 'Direct chat'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'NO HIDDEN FEES', h: 'No hidden fees. Full stop.', sub: 'What you see is what you pay.', bullets: ['Upfront total cost', 'Verified charges only', 'Digital receipts', 'Transparent steps', 'Verified support'], stat: '\u20A60', statlbl: 'HIDDEN' },
  { eyebrow: 'SEARCH TO KEYS', h: 'Safe from search to keys.', sub: 'Verified every step of your rental journey.', bullets: ['Verified listings', 'Secure payments', 'Receipts instantly', 'Real photos', '24/7 help'], stat: '4.9', statlbl: 'SAFE' },
  { eyebrow: 'FIVE-STAR HOMES', h: 'Five-star homes only.', sub: 'Only top-rated, inspected properties make the cut.', bullets: ['Strict inspection', 'Verified owners', 'Honest pricing', 'Real photos', 'Concierge support'], stat: '5.0', statlbl: 'STARS' },
  { eyebrow: 'BUILD YOUR RENT', h: 'Build your rent, bit by bit.', sub: 'Small savings today, stress-free rent tomorrow.', bullets: ['Set target', 'Monthly top-ups', 'Withdraw when due', 'No lump sums', 'Track progress'], stat: '\u20A60', statlbl: 'STRESS' },
  { eyebrow: 'NEXT ADDRESS', h: 'Your next address, sorted.', sub: 'Find and secure a verified home fast.', bullets: ['Smart search', 'Verified listings', 'Instant alerts', 'Save and compare', 'Direct contact'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'SIGNED & SAFE', h: 'Signed, sealed, safe.', sub: 'Every deal backed by clear documentation.', bullets: ['Written agreements', 'Digital signatures', 'Evidence storage', 'Transparent steps', 'Receipted outcomes'], stat: '100%', statlbl: 'SAFE' },
  { eyebrow: 'ZERO AGENT WAHALA', h: 'Zero agent wahala.', sub: 'Deal direct with verified landlords only.', bullets: ['No agent fees', 'Verified landlords', 'Instant receipts', 'Real photos', '24/7 support'], stat: '\u20A60', statlbl: 'AGENT' },
  { eyebrow: 'LIVE WELL, PAY FAIR', h: 'Live well, pay fair.', sub: 'Premium homes at honest, upfront prices.', bullets: ['Inspected homes', 'Honest pricing', 'Secure payment', 'Receipts always', 'Concierge care'], stat: '5.0', statlbl: 'FAIR' },
  { eyebrow: 'RENT READY', h: 'Rent ready before due date.', sub: 'Save automatically and never scramble again.', bullets: ['Set rent date', 'Auto monthly savings', 'Withdraw on time', 'No penalties', 'Track live'], stat: '\u20A60', statlbl: 'PANIC' },
  { eyebrow: 'SMART MATCHES', h: 'Smart matches, fast replies.', sub: 'Get matched to verified homes that fit you.', bullets: ['Smart filters', 'Personal matches', 'Instant alerts', 'Save searches', 'Direct chat'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'YOUR RIGHTS', h: 'Your rights, protected.', sub: 'Legal cover for tenants and landlords alike.', bullets: ['Verified lawyers', 'Evidence logging', 'Transparent tracking', 'Written outcomes', 'Full support'], stat: '100%', statlbl: 'SAFE' },
  { eyebrow: 'TRUSTED NATIONWIDE', h: 'Trusted homes nationwide.', sub: 'Verified rentals across every major city.', bullets: ['City-wide listings', 'Inspected homes', 'Verified landlords', 'Secure payments', '24/7 support'], stat: '4.9', statlbl: 'TRUSTED' },
  { eyebrow: 'ELEGANCE VERIFIED', h: 'Elegance, verified.', sub: 'Premium homes with proven ownership.', bullets: ['Verified owners', 'Inspected homes', 'Honest pricing', 'Receipts always', 'Concierge care'], stat: '5.0', statlbl: 'VERIFIED' },
  { eyebrow: 'SAVE TODAY', h: 'Save today, rent tomorrow.', sub: 'Start your rent plan in minutes.', bullets: ['Set target', 'Auto top-up', 'Withdraw when due', 'No lump sums', 'Track progress'], stat: '\u20A60', statlbl: 'STRESS' },
  { eyebrow: 'FIT YOUR BUDGET', h: 'Homes that fit your budget.', sub: 'Filter verified rentals by what you can afford.', bullets: ['Budget filters', 'Verified listings', 'Instant alerts', 'Save and compare', 'Direct contact'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'CLEAR TERMS', h: 'Clear terms, clean deals.', sub: 'No fine print, no surprises.', bullets: ['Written agreements', 'Transparent charges', 'Digital receipts', 'Evidence storage', 'Verified support'], stat: '100%', statlbl: 'CLEAR' },
  { eyebrow: 'FROM ABROAD', h: 'From abroad to your door.', sub: 'Manage Nigerian rentals from anywhere.', bullets: ['Pay from abroad', 'Verified homes', 'Digital receipts', 'Local support', 'Track everything'], stat: '4.9', statlbl: 'GLOBAL' },
  { eyebrow: 'PREMIUM YOURS', h: 'Premium, inspected, yours.', sub: 'Reserve a verified luxury home today.', bullets: ['Inspected homes', 'Verified owners', 'Secure payment', 'Receipts always', 'Concierge care'], stat: '5.0', statlbl: 'YOURS' },
  { eyebrow: 'STEADY SAVINGS', h: 'Steady savings, smooth rent.', sub: 'Consistent monthly saving for a calm move-in.', bullets: ['Set target', 'Monthly auto-save', 'Withdraw on time', 'No lump sums', 'Live tracking'], stat: '\u20A60', statlbl: 'STRESS' },
  { eyebrow: 'TAP TOUR TAKE', h: 'Tap, tour, take it.', sub: 'Discover and secure verified homes fast.', bullets: ['Smart search', 'Virtual tours', 'Instant alerts', 'Save favourites', 'Direct chat'], stat: '1', statlbl: 'TAP' },
  { eyebrow: 'START TO FINISH', h: 'Documented, start to finish.', sub: 'Every step recorded and receipted.', bullets: ['Written agreements', 'Digital signatures', 'Payment history', 'Evidence storage', 'Full support'], stat: '100%', statlbl: 'TRACKED' },
];

const baseCss = (p) => `
:root{--bg:${p.bg};--bg2:${p.bg2};--card:${p.card};--accent:${p.accent};--accent2:${p.accent2};--ink:${p.ink};--soft:${p.soft};--onAccent:${p.onAccent};--line:${p.light ? 'rgba(46,36,24,.14)' : 'rgba(255,255,255,.12)'};--photo:url('../assets/hero-terrace.avif')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
body{font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--ink)}
.flyer{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.logo{width:8.5vmin;height:8.5vmin;border-radius:50%;background:#fff;box-shadow:0 1vmin 2.4vmin rgba(0,0,0,.28)}
.brand{font-weight:800;font-size:3.3vmin}
.brand span{font-weight:400;color:var(--accent)}
.eyebrow{font-size:1.85vmin;font-weight:800;letter-spacing:.24em;color:var(--accent)}
h1{font-size:4.6vmin;line-height:1.08;font-weight:800;letter-spacing:-.01em}
h1 .accent{color:var(--accent)}
.sub{font-size:2.05vmin;color:var(--soft);line-height:1.45}
ul{list-style:none}
ul.list{display:flex;flex-direction:column;gap:1.7vmin}
li{display:flex;align-items:flex-start;gap:1.5vmin;font-size:2.05vmin;font-weight:600;line-height:1.3}
.tick{flex:0 0 auto;width:3.3vmin;height:3.3vmin;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;margin-top:.1vmin}
.tick svg{width:1.85vmin;height:1.85vmin}
.footer{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:var(--onAccent);font-weight:700;font-size:2.05vmin;padding:1.9vmin 3.6vmin;border-radius:99px;white-space:nowrap;flex:0 0 auto}
.img{background-image:var(--photo);background-size:cover;background-position:center}
.wrap{position:relative;display:flex;flex-direction:column;gap:2.2vmin;padding:5.5vmin;justify-content:center;align-items:flex-start}
.arr-center{align-items:center;text-align:center}
.arr-center ul.list{display:inline-flex;flex-direction:column;gap:1.7vmin}
.arr-center .footer{align-self:center}
.arr-card{align-items:center;justify-content:center}
.arr-card .card{width:100%;max-width:82vmin;background:var(--card);border:.3vmin solid var(--line);border-radius:3.2vmin;padding:5vmin;box-shadow:0 3vmin 7vmin rgba(0,0,0,.28);display:flex;flex-direction:column;gap:2.2vmin;align-items:flex-start}
.arr-card .footer{align-self:stretch}
.arr-pills ul.pills{display:flex;flex-wrap:wrap;gap:1.2vmin}
.arr-pills ul.pills li{background:var(--card);border:.25vmin solid var(--line);border-radius:99px;padding:1.1vmin 2vmin;font-size:1.95vmin}
.arr-pills ul.pills .tick{width:2.6vmin;height:2.6vmin}
.arr-pills ul.pills .tick svg{width:1.5vmin;height:1.5vmin}
`;

function contentInner(p, c, arr) {
  const list = arr === 'pills'
    ? `<ul class="pills">${c.bullets.slice(0, 5).map((b) => `<li>${tick(p)}${esc(b)}</li>`).join('')}</ul>`
    : `<ul class="list">${c.bullets.slice(0, 5).map((b) => `<li>${tick(p)}${esc(b)}</li>`).join('')}</ul>`;
  const inner = `<div class="eyebrow">${c.eyebrow}</div><h1>${accentLast(c.h)}</h1><p class="sub">${c.sub}</p>${list}${FOOTER}`;
  return arr === 'card' ? `<div class="card">${inner}</div>` : inner;
}
const wrapHtml = (p, c, arr) => `<div class="wrap arr-${arr}">${contentInner(p, c, arr)}</div>`;

const MODES = [
  { key: 'none', css: `.flyer{background:linear-gradient(160deg,var(--bg2),var(--bg))}`, body: (p, c, a) => `<div class="flyer">${wrapHtml(p, c, a)}</div>` },
  { key: 'left', css: `.flyer{flex-direction:row}.img.left{flex:0 0 44%}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer"><div class="img left"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'right', css: `.flyer{flex-direction:row}.img.right{flex:0 0 44%}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer">${wrapHtml(p, c, a)}<div class="img right"></div></div>` },
  { key: 'top', css: `.flyer{flex-direction:column}.img.top{flex:0 0 38%;border-radius:0 0 4vmin 4vmin}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer"><div class="img top"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'bottom', css: `.flyer{flex-direction:column}.img.bottom{flex:0 0 36%;border-radius:4vmin 4vmin 0 0}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer">${wrapHtml(p, c, a)}<div class="img bottom"></div></div>` },
  { key: 'full', css: `.flyer{position:relative}.img{position:absolute;inset:0}.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.32),rgba(0,0,0,.78))}.wrap{flex:1;color:#fff}.full .sub{color:rgba(255,255,255,.85)}.arr-card .card{background:rgba(0,0,0,.45);border-color:rgba(255,255,255,.28)}`, body: (p, c, a) => `<div class="flyer"><div class="img"></div><div class="scrim"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'inset', css: `.flyer{flex-direction:column;padding:5vmin;gap:2.4vmin}.img.inset{flex:0 0 34%;border-radius:3vmin;box-shadow:0 2.4vmin 6vmin rgba(0,0,0,.3)}.wrap{flex:1;padding:0}`, body: (p, c, a) => `<div class="flyer"><div class="img inset"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'circle', css: `.circ{position:absolute;right:-8vmin;top:50%;transform:translateY(-50%);width:44vmin;height:44vmin;border-radius:50%;background-image:var(--photo);background-size:cover;background-position:center;border:1vmin solid var(--card);box-shadow:0 2vmin 6vmin rgba(0,0,0,.3)}.wrap{flex:1;max-width:54%}`, body: (p, c, a) => `<div class="flyer"><div class="circ"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'diagonal', css: `.diag{position:absolute;inset:0;background-image:var(--photo);background-size:cover;background-position:center;clip-path:polygon(46% 0,100% 0,100% 100%,22% 100%)}.wrap{flex:1;max-width:54%}`, body: (p, c, a) => `<div class="flyer"><div class="diag"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'strip', css: `.flyer{flex-direction:row}.img.strip{flex:0 0 14%}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer"><div class="img strip"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'corner', css: `.corner{position:absolute;top:4.5vmin;right:4.5vmin;width:38vmin;height:38vmin;border-radius:3vmin;background-image:var(--photo);background-size:cover;background-position:center;box-shadow:0 2vmin 6vmin rgba(0,0,0,.3)}.wrap{flex:1;max-width:56%}`, body: (p, c, a) => `<div class="flyer"><div class="corner"></div>${wrapHtml(p, c, a)}</div>` },
  { key: 'arch', css: `.flyer{flex-direction:column}.img.arch{flex:0 0 40%;background-image:var(--photo);background-size:cover;background-position:center;border-radius:0 0 16vmin 16vmin}.wrap{flex:1}`, body: (p, c, a) => `<div class="flyer"><div class="img arch"></div>${wrapHtml(p, c, a)}</div>` },
];

const ARR = ['left', 'center', 'card', 'pills'];

for (const f of fs.readdirSync(OUT)) {
  if (/^t\d\d-/.test(f) && !/^t0[12]-/.test(f)) fs.unlinkSync(path.join(OUT, f));
}

const files = [
  { n: '01', name: 't01-rail-blue.html', layout: 'rail', palette: 'Royal Blue', theme: 'Rent safely, direct from landlords.' },
  { n: '02', name: 't02-rail-gold.html', layout: 'rail', palette: 'Charcoal Gold', theme: 'Luxury you can trust.' },
];

for (let k = 0; k < 48; k++) {
  const idx = 2 + k;
  const mode = MODES[k % MODES.length];
  const arr = ARR[Math.floor(k / MODES.length) % ARR.length];
  const pal = PALETTES[k % PALETTES.length];
  const c = CONTENT[idx];
  const n = String(idx + 1).padStart(2, '0');
  const name = `t${n}-${mode.key}-${arr}-${pal.key}.html`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RentalHub NG - ${mode.key} / ${arr} / ${pal.name}</title>
<!-- layout=${mode.key} arrangement=${arr} palette=${pal.name} theme="${c.h}". Swap --photo in :root to change the image. -->
<style>${baseCss(pal)}${mode.css}
</style>
</head>
<body>
${mode.body(pal, c, arr)}
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, name), html);
  files.push({ n, name, layout: mode.key, palette: pal.name, theme: c.h });
}

const byLayout = MODES.map((m) => ({ key: m.key, items: files.filter((f) => f.layout === m.key) }));
const railItems = files.filter((f) => f.layout === 'rail');
const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RentalHub NG - Template Library (50)</title>
<style>
*{margin:0;box-sizing:border-box}
body{background:#0d0f14;color:#e7ebf3;font-family:Arial,Helvetica,sans-serif;padding:28px}
h1{font-size:24px;margin-bottom:6px}
p.note{color:#93a0b5;font-size:13px;margin-bottom:22px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.14em;color:#7ee0c4;margin:24px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
a.card{display:block;background:#161a22;border:1px solid #232a36;border-radius:12px;padding:14px;text-decoration:none;color:#e7ebf3}
a.card:hover{border-color:#3ddc97}
a.card b{font-size:14px}
a.card span{display:block;color:#8b97ab;font-size:12px;margin-top:6px}
a.card em{display:block;color:#5f6b7d;font-size:11px;font-style:normal;margin-top:4px}
</style>
</head>
<body>
<h1>RentalHub NG - Template Library</h1>
<p class="note">${files.length} templates - 48 unique layout compositions (12 image placements x 4 arrangements) + the 2 rail templates. Each has unique copy.</p>
<h2>rail (done)</h2><div class="grid">${railItems.map((f) => `<a class="card" href="${f.name}"><b>${f.name}</b><span>${f.palette}</span><em>${f.theme}</em></a>`).join('')}</div>
${byLayout.filter((g) => g.key !== 'rail').map((g) => `<h2>${g.key}</h2><div class="grid">${g.items.map((f) => `<a class="card" href="${f.name}"><b>${f.name}</b><span>${f.palette}</span><em>${f.theme}</em></a>`).join('')}</div>`).join('')}
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), index);
console.log('total templates:', files.length, '| new unique layouts:', 48);
