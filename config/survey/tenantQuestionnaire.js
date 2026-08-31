/**
 * TENANT onboarding survey questionnaire (Questionnaire A).
 * Exact questions from the field questionnaire. Prompts are stored per
 * language (en now; ha/yo/ig filled by the translation pass).
 *
 * Structure:
 *  section  – T0..T9
 *  part     – 'A' (mandatory gate: consent + profile) | 'B' (finish later)
 *  type     – single | multi | likert | text | rank
 *  required – whether an answer is enforced
 *  analysis – group used by the analysis engine (pain, nps, fee, feature,
 *             fraud, cost, adoption, verification, misc)
 */

const SCALE_1_5 = ['1', '2', '3', '4', '5'];
const SCALE_0_10 = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const LIKERT_STRONGLY = {
  labels: {
    1: { en: 'Strongly disagree' },
    2: { en: 'Disagree' },
    3: { en: 'Neither/unsure' },
    4: { en: 'Agree' },
    5: { en: 'Strongly agree' },
  },
};

const LIKERT_IMPORTANCE = {
  labels: {
    1: { en: 'Not important at all' },
    2: { en: 'Slightly important' },
    3: { en: 'Moderately important' },
    4: { en: 'Very important' },
    5: { en: 'Essential' },
  },
};

const LIKERT_PAIN = { ...LIKERT_STRONGLY, analysis: 'pain' };

const q = (key, section, part, type, prompt, options, extra = {}) => ({
  key,
  section,
  part,
  type,
  prompt: { en: prompt },
  options: options ? options.map(([v, label]) => ({ v, en: label })) : null,
  required: extra.required !== false,
  ...extra,
});

const T = [];

// ── T0 Consent and eligibility ────────────────────────────────────────────
T.push(q('T0.1', 'T0', 'A', 'single', 'Are you 18 years or older?', [
  ['yes', 'Yes'],
  ['no', 'No — end survey'],
], { endsOn: 'no', analysis: 'consent' }));

T.push(q('T0.2', 'T0', 'A', 'single', 'Which best describes you?', [
  ['renting', 'Currently renting a home'],
  ['looking', 'Actively looking for a rental home'],
  ['rented_recently', 'Rented a home within the last 24 months'],
  ['none', 'None of these — end survey'],
], { endsOn: 'none', analysis: 'consent' }));

T.push(q('T0.3', 'T0', 'A', 'single', 'Do you voluntarily agree to participate in this anonymous market-research survey?', [
  ['yes', 'Yes'],
  ['no', 'No — end survey'],
], { endsOn: 'no', analysis: 'consent' }));

// ── T1 Housing and respondent profile ─────────────────────────────────────
T.push(q('T1.3', 'T1', 'A', 'single', 'Area type:', [
  ['metro', 'Major city/metropolitan'],
  ['urban', 'Other urban area'],
  ['peri_urban', 'Peri-urban'],
  ['town', 'Town'],
  ['rural', 'Rural'],
  ['not_sure', 'Not sure'],
], { analysis: 'profile' }));

T.push(q('T1.4', 'T1', 'A', 'single', 'Age group:', [
  ['18_24', '18–24'],
  ['25_34', '25–34'],
  ['35_44', '35–44'],
  ['45_54', '45–54'],
  ['55_plus', '55+'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'profile' }));

T.push(q('T1.5', 'T1', 'A', 'single', 'Main work/income situation:', [
  ['salaried', 'Salaried employment'],
  ['self_employed', 'Self-employed/business'],
  ['student', 'Student'],
  ['gig', 'Casual/gig work'],
  ['unemployed', 'Unemployed/job-seeking'],
  ['retired', 'Retired'],
  ['other', 'Other'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'profile' }));

T.push(q('T1.6', 'T1', 'A', 'single', 'Approximate monthly household income:', [
  ['lt100k', 'Below ₦100,000'],
  ['100_249', '₦100,000–₦249,999'],
  ['250_499', '₦250,000–₦499,999'],
  ['500_999', '₦500,000–₦999,999'],
  ['1m_plus', '₦1,000,000+'],
  ['irregular', 'Irregular/varies'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'profile' }));

T.push(q('T1.7', 'T1', 'A', 'single', 'Current/most recent home type:', [
  ['room_self', 'Room/self-contained'],
  ['1bed', '1-bedroom'],
  ['2bed', '2-bedroom'],
  ['3bed', '3-bedroom'],
  ['4plus', '4+ bedroom'],
  ['shared', 'Shared apartment'],
  ['duplex', 'Duplex/house'],
  ['other', 'Other'],
], { analysis: 'profile' }));

T.push(q('T1.8', 'T1', 'A', 'single', 'Current/most recent annualised rent band:', [
  ['lt300k', 'Below ₦300,000'],
  ['300_599', '₦300,000–₦599,999'],
  ['600_999', '₦600,000–₦999,999'],
  ['1m_1_99', '₦1m–₦1.99m'],
  ['2m_4_99', '₦2m–₦4.99m'],
  ['5m_plus', '₦5m+'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'profile' }));

T.push(q('T1.9', 'T1', 'A', 'single', 'How is/was the rent normally demanded?', [
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['6monthly', '6-monthly'],
  ['yearly', 'Yearly'],
  ['1yr_plus', 'More than one year upfront'],
  ['other', 'Other'],
], { analysis: 'profile' }));

T.push(q('T1.10', 'T1', 'A', 'single', 'How many people live in the household?', [
  ['1', '1'],
  ['2', '2'],
  ['3_4', '3–4'],
  ['5_6', '5–6'],
  ['7plus', '7+'],
], { analysis: 'profile' }));

T.push(q('T1.11', 'T1', 'A', 'single', 'How many times have you searched for a rental property in the last five years?', [
  ['0', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3_4', '3–4'],
  ['5plus', '5+'],
], { analysis: 'profile' }));

T.push(q('T1.12', 'T1', 'A', 'single', 'Do you usually search personally or through someone else?', [
  ['personally', 'Personally'],
  ['agent', 'Agent'],
  ['family', 'Family/friend'],
  ['employer', 'Employer/institution'],
  ['mix', 'A mix of these'],
], { analysis: 'profile' }));

// ── T2 How Nigerians actually search ──────────────────────────────────────
T.push(q('T2.1', 'T2', 'B', 'multi', 'Where have you searched for rental property? Select all that apply.', [
  ['agents', 'Estate/house agents'],
  ['whatsapp', 'WhatsApp groups'],
  ['social', 'Facebook/Instagram/TikTok'],
  ['sites', 'Property websites/apps'],
  ['signs', 'Signs on properties/streets'],
  ['friends', 'Friends/family/colleagues'],
  ['landlord', 'Landlord directly'],
  ['community', 'Community contacts'],
  ['other', 'Other'],
], { analysis: 'search' }));

T.push(q('T2.2', 'T2', 'B', 'single', 'Which ONE source do you trust most for finding a real property?', [
  ['agent', 'Agent'],
  ['platform', 'Online platform/app'],
  ['friend', 'Friend/family'],
  ['landlord', 'Landlord directly'],
  ['signs', 'Street signs'],
  ['community', 'Community contact'],
  ['none', 'None consistently'],
], { analysis: 'search' }));

T.push(q('T2.3', 'T2', 'B', 'single', 'How long did your last serious property search take?', [
  ['same_day', 'Same day'],
  ['2_7d', '2–7 days'],
  ['1_4w', '1–4 weeks'],
  ['1_3m', '1–3 months'],
  ['3m_plus', 'More than 3 months'],
  ['still', 'Still searching'],
], { analysis: 'search' }));

T.push(q('T2.4', 'T2', 'B', 'single', 'About how many properties did you inspect before choosing one?', [
  ['0', '0'],
  ['1', '1'],
  ['2_3', '2–3'],
  ['4_6', '4–6'],
  ['7_10', '7–10'],
  ['10plus', 'More than 10'],
], { analysis: 'search' }));

T.push(q('T2.5', 'T2', 'B', 'single', 'Roughly how much did you spend on transport, inspection charges, calls/data and other search costs before securing your last home?', [
  ['lt5k', '₦0–₦4,999'],
  ['5_19', '₦5,000–₦19,999'],
  ['20_49', '₦20,000–₦49,999'],
  ['50_99', '₦50,000–₦99,999'],
  ['100k_plus', '₦100,000+'],
  ['not_sure', 'Not sure/prefer not to say'],
], { analysis: 'cost' }));

[
  ['T2.6', 'I see the same property advertised by several different agents.'],
  ['T2.7', 'Agents sometimes advertise properties that are already taken or unavailable.'],
  ['T2.8', 'Property photos/descriptions often fail to match what I see at inspection.'],
  ['T2.9', 'It is difficult to know who is genuinely authorised to rent out a property.'],
  ['T2.10', 'House hunting takes too much time away from work, business, school or family.'],
  ['T2.11', 'I often have to travel long distances before learning that a property is unsuitable.'],
  ['T2.12', 'I find it difficult to compare total move-in costs across properties.'],
].forEach(([key, text]) => {
  T.push(q(key, 'T2', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── T3 Upfront rent, agent fees and affordability ─────────────────────────
T.push(q('T3.1', 'T3', 'B', 'multi', 'For your most recent rental, what did you have to pay before moving in? Select all that apply.', [
  ['rent_advance', 'Rent in advance'],
  ['agency_fee', 'Agency/commission fee'],
  ['legal_fee', 'Agreement/legal fee'],
  ['deposit', 'Caution/security deposit'],
  ['service_charge', 'Service charge'],
  ['inspection_fee', 'Inspection fee'],
  ['application_fee', 'Application/form fee'],
  ['estate_fee', 'Estate/association fee'],
  ['utility_deposit', 'Utility deposit'],
  ['other', 'Other'],
], { analysis: 'cost' }));

T.push(q('T3.2', 'T3', 'B', 'single', 'Were all charges clearly disclosed before you committed to the property?', [
  ['completely', 'Yes, completely'],
  ['mostly', 'Mostly'],
  ['partly', 'Partly'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'cost' }));

T.push(q('T3.3', 'T3', 'B', 'single', 'Have you ever been asked to pay more than one year of rent upfront?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'cost' }));

T.push(q('T3.4', 'T3', 'B', 'single', 'If yes, what happened?', [
  ['paid', 'I paid it'],
  ['negotiated', 'I negotiated it down'],
  ['borrowed', 'I borrowed money to meet it'],
  ['lost', 'I lost the property because I could not pay'],
  ['walked', 'I walked away'],
  ['na', 'Not applicable'],
  ['other', 'Other'],
], { analysis: 'cost' }));

T.push(q('T3.5', 'T3', 'B', 'single', 'Have inspection fees ever prevented you from viewing properties you might otherwise have considered?', [
  ['never', 'Never'],
  ['rarely', 'Rarely'],
  ['sometimes', 'Sometimes'],
  ['often', 'Often'],
  ['very_often', 'Very often'],
], { analysis: 'cost' }));

T.push(q('T3.6', 'T3', 'B', 'single', 'Have you ever paid inspection fees for a property that turned out to be unavailable, misleading or clearly unsuitable?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'fraud' }));

T.push(q('T3.7', 'T3', 'B', 'single', 'Have you ever paid agency/commission to more than one intermediary during one search?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'fraud' }));

T.push(q('T3.8', 'T3', 'B', 'single', 'Have you ever paid a rental-related charge without receiving a proper receipt or written record?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'fraud' }));

[
  ['T3.9', 'Raising a large annual rent payment at once is difficult for my household.'],
  ['T3.10', 'Extra charges make the real move-in cost much higher than the advertised rent.'],
  ['T3.11', 'I would prefer a clearly itemised total price before I inspect or apply.'],
  ['T3.12', 'I would prefer more flexible rent-payment options if they were legitimate and transparent.'],
  ['T3.13', 'I have delayed moving because I could not raise the full upfront amount.'],
  ['T3.14', 'I have borrowed or sold assets to meet rental costs.'],
].forEach(([key, text]) => {
  T.push(q(key, 'T3', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── T4 Fraud, verification and trust ──────────────────────────────────────
T.push(q('T4.1', 'T4', 'B', 'single', 'Have you personally lost money to a fake rental listing, fake landlord, fake agent, duplicate payment or similar rental scam?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'fraud' }));

T.push(q('T4.2', 'T4', 'B', 'single', 'Has someone close to you experienced such a rental scam?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'fraud' }));

T.push(q('T4.3', 'T4', 'B', 'single', 'Before paying for a rental, how confident are you that you can verify the landlord/agent and the property?', [
  ['very', 'Very confident'],
  ['somewhat', 'Somewhat confident'],
  ['neither', 'Neither'],
  ['not_very', 'Not very confident'],
  ['not_at_all', 'Not at all confident'],
], { analysis: 'verification' }));

T.push(q('T4.4', 'T4', 'B', 'multi', 'Which checks do you normally perform before paying? Select all that apply.', [
  ['visit', 'Visit the property'],
  ['neighbours', 'Ask neighbours/security'],
  ['landlord_id', 'Request landlord ID'],
  ['agent_id', 'Request agent ID/authority'],
  ['documents', 'Check ownership/property documents'],
  ['lawyer', 'Use a lawyer'],
  ['online', 'Search online'],
  ['friends', 'Ask family/friends'],
  ['none', 'I do not normally verify'],
  ['other', 'Other'],
], { analysis: 'verification' }));

T.push(q('T4.5', 'T4', 'B', 'single', 'Which verification matters most to you?', [
  ['real_available', 'Property is real and available'],
  ['authorised', 'Person collecting money is authorised'],
  ['identity', 'Landlord/agent identity'],
  ['documents', 'Property/legal documents'],
  ['recipient', 'Bank/payment recipient identity'],
  ['reputation', 'Previous tenant/reputation information'],
  ['all', 'All are equally important'],
], { analysis: 'verification' }));

[
  ['T4.6', 'I would be more willing to use an online rental platform if identities were verified.'],
  ['T4.7', 'A “verified” badge alone is not enough; I would want to know what was actually checked.'],
  ['T4.8', 'I worry that online rental platforms can also contain fake or stale listings.'],
  ['T4.9', 'I would prefer payments that create a traceable digital record.'],
  ['T4.10', 'I would still inspect a property physically even if it were verified online.'],
  ['T4.11', 'I would distrust a platform that does not clearly explain fees and complaint procedures.'],
].forEach(([key, text]) => {
  T.push(q(key, 'T4', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── T5 Living in the property ─────────────────────────────────────────────
T.push(q('T5.1', 'T5', 'B', 'multi', 'Which problems have you experienced in a rented home? Select all that apply.', [
  ['water', 'Water supply problems'],
  ['electricity', 'Electricity/wiring problems'],
  ['plumbing', 'Plumbing/leakage'],
  ['damp', 'Damp/flooding'],
  ['security', 'Security problems'],
  ['waste', 'Poor waste disposal'],
  ['structural', 'Structural defects'],
  ['pests', 'Pests'],
  ['noise', 'Noise/neighbour issues'],
  ['none', 'None'],
  ['other', 'Other'],
], { analysis: 'living' }));

T.push(q('T5.2', 'T5', 'B', 'single', 'When a serious repair is needed, who usually pays first?', [
  ['landlord', 'Landlord'],
  ['tenant', 'Tenant'],
  ['depends', 'Depends on the repair'],
  ['unclear', 'Unclear/disputed'],
  ['na', 'Not applicable'],
], { analysis: 'living' }));

T.push(q('T5.3', 'T5', 'B', 'single', 'How quickly does/did your landlord or agent respond to serious repair complaints?', [
  ['same_day', 'Same day'],
  ['1_3d', '1–3 days'],
  ['4_7d', '4–7 days'],
  ['1w_plus', 'More than a week'],
  ['unresolved', 'Often not resolved'],
  ['na', 'Not applicable'],
], { analysis: 'living' }));

T.push(q('T5.4', 'T5', 'B', 'single', 'Have you ever paid for a repair you believed the landlord should have handled?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'living' }));

T.push(q('T5.5', 'T5', 'B', 'single', 'Have you ever had a dispute over a caution/security deposit?', [
  ['not_refunded', 'Yes — not refunded'],
  ['deductions', 'Yes — deductions disputed'],
  ['delayed', 'Yes — delayed refund'],
  ['no', 'No'],
  ['na', 'Not applicable'],
], { analysis: 'dispute' }));

T.push(q('T5.6', 'T5', 'B', 'single', 'Have you ever received a rent increase that you considered sudden or difficult to justify?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'living' }));

T.push(q('T5.7', 'T5', 'B', 'single', 'Have you ever had a serious disagreement with a landlord/agent about notice, eviction, rent, damage, repairs or access to the property?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'dispute' }));

T.push(q('T5.8', 'T5', 'B', 'multi', 'If a serious dispute occurred, what did you do? Select all that apply.', [
  ['negotiated', 'Negotiated directly'],
  ['community', 'Used family/community leaders'],
  ['agent', 'Used an agent'],
  ['lawyer', 'Used a lawyer'],
  ['police', 'Police/security involvement'],
  ['court', 'Court/tribunal'],
  ['moved', 'Moved out'],
  ['nothing', 'Did nothing'],
  ['na', 'Not applicable'],
  ['other', 'Other'],
], { analysis: 'dispute' }));

[
  ['T5.9', 'Written records of complaints and responses would help reduce disputes.'],
  ['T5.10', 'Digital rent receipts and payment history would be useful to me.'],
  ['T5.11', 'Photo/video evidence with dates would help in damage or repair disputes.'],
  ['T5.12', 'I would value access to verified legal professionals when a dispute becomes serious.'],
  ['T5.13', 'I am confident I understand my tenancy agreement before signing it.'],
  ['T5.14', 'I normally receive and keep a copy of my tenancy agreement.'],
].forEach(([key, text]) => {
  T.push(q(key, 'T5', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── T6 Digital behaviour and payment preferences ──────────────────────────
T.push(q('T6.1', 'T6', 'B', 'single', 'Which device do you mainly use to access the internet?', [
  ['android', 'Android phone'],
  ['iphone', 'iPhone'],
  ['laptop', 'Laptop/desktop'],
  ['shared', 'Shared device'],
  ['rarely', 'Rarely use internet'],
], { analysis: 'digital' }));

T.push(q('T6.2', 'T6', 'B', 'single', 'How reliable is your mobile data/internet for important transactions?', [
  ['very', 'Very reliable'],
  ['mostly', 'Mostly reliable'],
  ['mixed', 'Mixed'],
  ['often', 'Often unreliable'],
  ['very_unreliable', 'Very unreliable'],
], { analysis: 'digital' }));

T.push(q('T6.3', 'T6', 'B', 'single', 'Which rental payment method do you prefer?', [
  ['transfer', 'Bank transfer'],
  ['cash', 'Cash'],
  ['pos', 'POS'],
  ['ussd', 'USSD'],
  ['card', 'Card/online payment'],
  ['direct_debit', 'Direct debit/standing instruction'],
  ['no_pref', 'No preference'],
  ['other', 'Other'],
], { analysis: 'digital' }));

T.push(q('T6.4', 'T6', 'B', 'single', 'Would you complete identity verification on a rental platform if it reduced fraud and was handled securely?', [
  ['definitely_yes', 'Definitely yes'],
  ['probably_yes', 'Probably yes'],
  ['unsure', 'Unsure'],
  ['probably_no', 'Probably no'],
  ['definitely_no', 'Definitely no'],
], { analysis: 'verification' }));

T.push(q('T6.5', 'T6', 'B', 'multi', 'What would make you refuse online identity verification? Select all that apply.', [
  ['privacy', 'Privacy concerns'],
  ['leaks', 'Fear of data leaks'],
  ['distrust', 'Do not trust the company'],
  ['effort', 'Too much effort'],
  ['no_id', 'No acceptable ID'],
  ['cost', 'Cost'],
  ['internet', 'Poor internet'],
  ['never_refuse', 'I would not refuse if well explained'],
  ['other', 'Other'],
], { analysis: 'verification' }));

T.push(q('T6.6', 'T6', 'B', 'single', 'Would you upload property-related documents/evidence to an online platform during a dispute?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No'],
], { analysis: 'dispute' }));

T.push(q('T6.7', 'T6', 'B', 'single', 'How comfortable are you making a high-value rental payment through a platform rather than paying directly to a landlord/agent?', [
  ['very', 'Very comfortable'],
  ['somewhat', 'Somewhat comfortable'],
  ['unsure', 'Unsure'],
  ['uncomfortable', 'Uncomfortable'],
  ['very_uncomfortable', 'Very uncomfortable'],
], { analysis: 'adoption' }));

T.push(q('T6.8', 'T6', 'B', 'multi', 'What would you need before making such a payment?', [
  ['recipient', 'Clear recipient details'],
  ['receipt', 'Receipt/reference'],
  ['refund', 'Refund/dispute procedure'],
  ['verified', 'Verified landlord/property'],
  ['security', 'Strong security information'],
  ['support', 'Customer support'],
  ['all', 'All of these'],
  ['direct', 'I would still pay directly'],
], { analysis: 'adoption' }));

// ── T7 Concept test ───────────────────────────────────────────────────────
T.push(q('T7.1', 'T7', 'B', 'single', 'Before today, had you heard of RentalHub NG with the website rentalhub.com.ng?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'awareness' }));

T.push(q('T7.2', 'T7', 'B', 'single', 'Based only on the description above, how useful does the overall idea seem for your own rental needs?', [
  ['very', 'Very useful'],
  ['useful', 'Useful'],
  ['neither', 'Neither'],
  ['not_very', 'Not very useful'],
  ['not_at_all', 'Not useful at all'],
], { analysis: 'concept' }));

[
  ['T7.3', 'Verified property/landlord/agent information with an explanation of what was verified.'],
  ['T7.4', 'Searchable rental listings with clear photos, location and total costs.'],
  ['T7.5', 'Ability to request the type/location/budget of property you need.'],
  ['T7.6', 'Digital rental application and status tracking.'],
  ['T7.7', 'In-platform messaging and documented communication.'],
  ['T7.8', 'Digital payment history, receipts and references.'],
  ['T7.9', 'Rent Savings tools for gradually preparing for future rent obligations.'],
  ['T7.10', 'Evidence/document storage for rental disputes.'],
  ['T7.11', 'Access to legal-support/lawyer options when needed.'],
  ['T7.12', 'Transportation/moving support connected to a rental move.'],
  ['T7.13', 'Fumigation/cleaning booking connected to a property.'],
  ['T7.14', 'Saved properties and alerts for relevant listings.'],
].forEach(([key, text]) => {
  T.push(q(key, 'T7', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_IMPORTANCE, analysis: 'feature' }));
});

T.push(q('T7.15', 'T7', 'B', 'rank', 'Which THREE functions above would most influence you to try RentalHub NG? Write the numbers:', null, {
  maxPicks: 3,
  analysis: 'feature',
  rankSource: ['T7.3', 'T7.4', 'T7.5', 'T7.6', 'T7.7', 'T7.8', 'T7.9', 'T7.10', 'T7.11', 'T7.12', 'T7.13', 'T7.14'],
}));

T.push(q('T7.16', 'T7', 'B', 'text', 'Which functions would you probably never use?', null, { analysis: 'open' }));

T.push(q('T7.17', 'T7', 'B', 'text', 'What important rental problem is missing from the concept?', null, { analysis: 'open' }));

// ── T8 Adoption, trust and willingness to pay ─────────────────────────────
T.push(q('T8.1', 'T8', 'B', 'single', 'If RentalHub NG had suitable verified listings in your area today, how likely would you be to create an account?', [
  ['definitely', 'Definitely would'],
  ['probably', 'Probably would'],
  ['not_sure', 'Not sure'],
  ['probably_not', 'Probably would not'],
  ['definitely_not', 'Definitely would not'],
], { analysis: 'adoption' }));

T.push(q('T8.2', 'T8', 'B', 'single', 'How likely would you be to use RentalHub NG as your FIRST place to search for your next home?', [
  ['very', 'Very likely'],
  ['likely', 'Likely'],
  ['unsure', 'Unsure'],
  ['unlikely', 'Unlikely'],
  ['very_unlikely', 'Very unlikely'],
], { analysis: 'adoption' }));

T.push(q('T8.3', 'T8', 'B', 'single', 'Would you still use agents outside RentalHub NG?', [
  ['yes', 'Yes, definitely'],
  ['probably', 'Probably'],
  ['only_if', 'Only if I cannot find a property'],
  ['probably_not', 'Probably not'],
  ['no', 'No'],
], { analysis: 'adoption' }));

T.push(q('T8.4', 'T8', 'B', 'single', 'Would you invite a landlord/agent to use RentalHub NG if the property you wanted was not listed there?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No'],
], { analysis: 'adoption' }));

T.push(q('T8.5', 'T8', 'B', 'multi', 'What would stop you from using RentalHub NG? Select all that apply.', [
  ['few_listings', 'Too few listings'],
  ['trust_agents', 'I trust offline agents more'],
  ['intrusive', 'Verification feels intrusive'],
  ['fees', 'Fees are too high'],
  ['support', 'Poor customer support'],
  ['fear', 'Fear of scams/data loss'],
  ['difficult', 'App/site is difficult to use'],
  ['cash', 'I prefer cash/direct payment'],
  ['internet', 'Poor internet/data cost'],
  ['presence', 'No presence in my area'],
  ['nothing', 'Nothing if it works well'],
  ['other', 'Other'],
], { analysis: 'barriers' }));

T.push(q('T8.6', 'T8', 'B', 'single', 'Which charging model would you find most acceptable for tenant-facing services?', [
  ['freemium', 'Free search; pay only for optional premium services'],
  ['fixed_fee', 'Small fixed service fee'],
  ['percentage', 'Percentage of completed transaction'],
  ['subscription', 'Subscription'],
  ['ads', 'Advertising-supported/free'],
  ['never', 'I would not pay RentalHub'],
  ['not_sure', 'Not sure'],
], { analysis: 'fee' }));

T.push(q('T8.7', 'T8', 'B', 'single', 'What is the maximum one-off platform/service fee you would personally consider reasonable for a successful rental transaction, excluding rent and legitimate third-party charges?', [
  ['0', '₦0'],
  ['lt2k', 'Below ₦2,000'],
  ['2_4_9', '₦2,000–₦4,999'],
  ['5_9_9', '₦5,000–₦9,999'],
  ['10_24_9', '₦10,000–₦24,999'],
  ['25k_plus', '₦25,000+'],
  ['replaces', 'Only if it replaces other fees'],
  ['not_sure', 'Not sure'],
], { analysis: 'fee' }));

T.push(q('T8.8', 'T8', 'B', 'single', 'Would you pay for a clearly disclosed verification or legal-support service if optional?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No'],
  ['depends', 'Depends on amount'],
], { analysis: 'fee' }));

T.push(q('T8.9', 'T8', 'B', 'single', 'How likely are you to recommend RentalHub to another renter IF it consistently solved the problems you rated most important? (0 = not at all likely; 10 = extremely likely)', SCALE_0_10, {
  analysis: 'nps',
}));

T.push(q('T8.10', 'T8', 'B', 'text', 'What single failure would make you stop trusting RentalHub immediately?', null, { analysis: 'open' }));

// ── T9 Open-ended ─────────────────────────────────────────────────────────
T.push(q('T9.1', 'T9', 'B', 'text', 'Tell us about the worst rental-search experience you have had in Nigeria.', null, { analysis: 'open' }));
T.push(q('T9.2', 'T9', 'B', 'text', 'What is the most unfair or wasteful cost you have faced while renting?', null, { analysis: 'open' }));
T.push(q('T9.3', 'T9', 'B', 'text', 'What is one thing agents do that you most want changed?', null, { analysis: 'open' }));
T.push(q('T9.4', 'T9', 'B', 'text', 'What is one thing landlords do that you most want changed?', null, { analysis: 'open' }));
T.push(q('T9.5', 'T9', 'B', 'text', 'What should a rental platform do to earn your trust before you pay anyone through it?', null, { analysis: 'open' }));
T.push(q('T9.6', 'T9', 'B', 'text', 'What should RentalHub NG NEVER do?', null, { analysis: 'open' }));
T.push(q('T9.7', 'T9', 'B', 'text', 'If you could redesign renting in Nigeria, what would you change first?', null, { analysis: 'open' }));
T.push(q('T9.8', 'T9', 'B', 'text', 'Any other comment you want the RentalHub NG team to hear?', null, { analysis: 'open' }));

module.exports = { type: 'tenant', sections: ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'], questions: T };
