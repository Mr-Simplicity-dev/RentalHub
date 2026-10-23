const { buildFactsLine } = require('./propertyTourVideo');

/**
 * Fact-grounded narration generator for property tours.
 * NEVER invents claims - only uses verified data.
 */

const MONEY_WORDS = {
  0: 'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',
  10:'ten',11:'eleven',12:'twelve',13:'thirteen',14:'fourteen',15:'fifteen',16:'sixteen',17:'seventeen',18:'eighteen',19:'nineteen',
  20:'twenty',30:'thirty',40:'forty',50:'fifty',60:'sixty',70:'seventy',80:'eighty',90:'ninety'
};

const numberToWords = (n) => {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 20) return MONEY_WORDS[n];
  if (n < 100) {
    const tens = Math.floor(n/10)*10;
    const ones = n % 10;
    return ones ? `${MONEY_WORDS[tens]} and ${MONEY_WORDS[ones]}` : MONEY_WORDS[tens];
  }
  if (n < 1000) {
    const h = Math.floor(n/100);
    const r = n % 100;
    const base = `${MONEY_WORDS[h]} hundred`;
    return r ? `${base} and ${numberToWords(r)}` : base;
  }
  if (n < 1000000) {
    const t = Math.floor(n/1000);
    const r = n % 1000;
    const base = `${numberToWords(t)} thousand`;
    return r ? `${base} ${numberToWords(r)}` : base;
  }
  if (n < 1000000000) {
    const m = Math.floor(n/1000000);
    const r = n % 1000000;
    const base = `${numberToWords(m)} million`;
    return r ? `${base} ${numberToWords(r)}` : base;
  }
  const b = Math.floor(n/1000000000);
  const r = n % 1000000000;
  const base = `${numberToWords(b)} billion`;
  return r ? `${base} ${numberToWords(r)}` : base;
};

const formatNairaSpoken = (amount, frequency = 'yearly') => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  const per = String(frequency).toLowerCase() === 'monthly' ? 'per month' : 'per year';
  return `${numberToWords(value)} naira ${per}`;
};

const generateNarrationScript = (property = {}, shots = [], structuredFeatures = {}) => {
  const segments = [];
  
  // Intro - only use verified facts
  const parts = [];
  const beds = Number(property.bedrooms);
  if (Number.isFinite(beds) && beds > 0) {
    parts.push(`${beds}-bedroom`);
  }
  const type = property.property_type ? String(property.property_type) : '';
  if (type) parts.push(type);
  const loc = [property.area, property.city, property.state].filter(Boolean).join(', ');
  
  if (parts.length || loc) {
    let intro = 'Welcome to ';
    if (parts.length) intro += `this ${parts.join(' ')} `;
    if (loc) intro += `in ${loc}`;
    intro += ', available on Amana RentalHub NG.';
    segments.push({ scene: 'intro', text: intro, priority: 1 });
  }
  
  // Scene-aware narration based on actual shots
  const shotKeys = Array.isArray(shots) ? shots.map(s => typeof s === 'object' ? s.key : s) : [];
  
  if (shotKeys.includes('compound') || shotKeys.includes('building_front')) {
    segments.push({ scene: 'exterior', text: 'Here is the exterior of the property and its entrance.', priority: 5 });
  }
  if (shotKeys.includes('sitting_room')) {
    segments.push({ scene: 'living_room', text: 'Moving inside, here is the main living area.', priority: 6 });
  }
  if (shotKeys.includes('kitchen')) {
    segments.push({ scene: 'kitchen', text: 'Here is the kitchen.', priority: 7 });
  }
  if (Number.isFinite(beds) && beds > 0 && shotKeys.some(k => k === 'bedroom')) {
    segments.push({ scene: 'bedroom', text: `Here ${beds === 1 ? 'is one of the bedrooms' : 'are the bedrooms'}.`, priority: 8 });
  }
  if (shotKeys.includes('bathroom')) {
    segments.push({ scene: 'bathroom', text: 'Here is the bathroom.', priority: 9 });
  }
  
  // Facts from structured data only
  const facts = [];
  const baths = Number(property.bathrooms);
  if (Number.isFinite(baths) && baths > 0) facts.push(`${baths} bathroom${baths === 1 ? '' : 's'}`);
  if (Number.isFinite(beds) && beds > 0 && !facts.some(f => f.includes('bedroom'))) facts.push(`${beds} bedroom${beds === 1 ? '' : 's'}`);
  
  // Structured features - only if explicitly true
  if (structuredFeatures.water_board?.available === true) {
    const dt = structuredFeatures.water_board.details || {};
    if (dt.availabilityType === 'scheduled') {
      facts.push('scheduled public water supply');
    } else if (dt.availabilityType === '24_hours') {
      facts.push('public water supply');
    } else {
      facts.push('public water supply');
    }
  }
  if (structuredFeatures.water_storage?.available === true) {
    const dt = structuredFeatures.water_storage.details || {};
    if (dt.capacityLitres) {
      facts.push(`${numberToWords(dt.capacityLitres)} litre water storage`);
    } else {
      facts.push('water storage');
    }
  }
  if (structuredFeatures.parking?.available === true) {
    const dt = structuredFeatures.parking.details || {};
    if (dt.capacity) {
      facts.push(`parking for up to ${numberToWords(dt.capacity)} vehicle${dt.capacity === 1 ? '' : 's'}`);
    } else {
      facts.push('parking available');
    }
  }
  if (structuredFeatures.electricity?.available === true || structuredFeatures.prepaid_meter?.available === true) {
    facts.push('prepaid electricity meter');
  }
  
  if (facts.length) {
    segments.push({ scene: 'facts', text: `The property has ${facts.join(', ')}.`, priority: 10 });
  }
  
  // Price
  const priceSpoken = formatNairaSpoken(property.rent_amount, property.payment_frequency);
  if (priceSpoken) {
    segments.push({ scene: 'price', text: `The rent is ${priceSpoken}.`, priority: 11 });
  }
  
  // Outro
  segments.push({ scene: 'outro', text: 'Interested in this property? Request a viewing through Amana RentalHub NG.', priority: 12 });
  
  return segments;
};

const computeNarrationHash = (segments, voiceConfig = {}) => {
  const crypto = require('crypto');
  const payload = JSON.stringify({ segments: segments.map(s => s.text), voiceConfig });
  return crypto.createHash('sha256').update(payload).digest('hex');
};

module.exports = {
  generateNarrationScript,
  formatNairaSpoken,
  numberToWords,
  computeNarrationHash,
};
