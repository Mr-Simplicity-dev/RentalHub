/**
 * LANDLORD onboarding survey questionnaire (Questionnaire B).
 * Exact questions from the field questionnaire.
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
  ...extra,
});

const L = [];

// ── L0 Consent and eligibility ────────────────────────────────────────────
L.push(q('L0.1', 'L0', 'A', 'single', 'Are you 18 years or older?', [
  ['yes', 'Yes'],
  ['no', 'No — end survey'],
], { endsOn: 'no', analysis: 'consent' }));

L.push(q('L0.2', 'L0', 'A', 'single', 'Do you currently own residential property that is rented out, available for rent, or has been rented within the last 24 months?', [
  ['yes', 'Yes'],
  ['no', 'No — end survey'],
], { endsOn: 'no', analysis: 'consent' }));

L.push(q('L0.3', 'L0', 'A', 'single', 'Do you voluntarily agree to participate in this anonymous market-research survey?', [
  ['yes', 'Yes'],
  ['no', 'No — end survey'],
], { endsOn: 'no', analysis: 'consent' }));

// ── L1 Landlord and property portfolio profile ────────────────────────────
L.push(q('L1.3', 'L1', 'A', 'single', 'How many residential rental units do you own?', [
  ['1', '1'],
  ['2_3', '2–3'],
  ['4_10', '4–10'],
  ['11_25', '11–25'],
  ['26plus', '26+'],
], { analysis: 'profile' }));

L.push(q('L1.4', 'L1', 'A', 'single', 'How long have you been a landlord?', [
  ['lt1y', 'Under 1 year'],
  ['1_3y', '1–3 years'],
  ['4_7y', '4–7 years'],
  ['8_15y', '8–15 years'],
  ['16plus', '16+ years'],
], { analysis: 'profile' }));

L.push(q('L1.5', 'L1', 'A', 'single', 'Main type of rental property:', [
  ['rooms', 'Rooms/self-contained'],
  ['flats', 'Flats/apartments'],
  ['duplexes', 'Duplexes/houses'],
  ['shared', 'Shared/student housing'],
  ['mixed', 'Mixed portfolio'],
  ['other', 'Other'],
], { analysis: 'profile' }));

L.push(q('L1.6', 'L1', 'A', 'single', 'Typical annual rent per unit:', [
  ['lt300k', 'Below ₦300,000'],
  ['300_599', '₦300,000–₦599,999'],
  ['600_999', '₦600,000–₦999,999'],
  ['1m_1_99', '₦1m–₦1.99m'],
  ['2m_4_99', '₦2m–₦4.99m'],
  ['5m_plus', '₦5m+'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'profile' }));

L.push(q('L1.7', 'L1', 'A', 'single', 'How do you mainly manage tenants?', [
  ['self', 'Directly myself'],
  ['family', 'Family/staff'],
  ['agent', 'Estate/house agent'],
  ['manager', 'Professional property manager'],
  ['combination', 'Combination'],
], { analysis: 'profile' }));

L.push(q('L1.8', 'L1', 'A', 'single', 'How do you mainly find new tenants?', [
  ['agent', 'Agent'],
  ['referrals', 'Referrals'],
  ['social', 'WhatsApp/social media'],
  ['sites', 'Property website/app'],
  ['signs', 'Signboard/offline advertising'],
  ['existing', 'Existing tenants'],
  ['other', 'Other'],
], { analysis: 'profile' }));

L.push(q('L1.9', 'L1', 'A', 'single', 'What rent-payment period do you usually request?', [
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['6monthly', '6-monthly'],
  ['yearly', 'Yearly'],
  ['1yr_plus', 'More than one year upfront'],
  ['varies', 'Varies by tenant/property'],
], { analysis: 'profile' }));

L.push(q('L1.10', 'L1', 'A', 'single', 'Do you normally use a written tenancy agreement?', [
  ['always', 'Always'],
  ['usually', 'Usually'],
  ['sometimes', 'Sometimes'],
  ['rarely', 'Rarely'],
  ['never', 'Never'],
], { analysis: 'records' }));

L.push(q('L1.11', 'L1', 'A', 'single', 'Do you issue receipts/payment records?', [
  ['always', 'Always'],
  ['usually', 'Usually'],
  ['sometimes', 'Sometimes'],
  ['rarely', 'Rarely'],
  ['never', 'Never'],
], { analysis: 'records' }));

L.push(q('L1.12', 'L1', 'A', 'single', 'Approximate current vacancy in your portfolio:', [
  ['0', '0%'],
  ['1_10', '1–10%'],
  ['11_25', '11–25%'],
  ['26_50', '26–50%'],
  ['50plus', 'More than 50%'],
  ['not_sure', 'Not sure'],
], { analysis: 'profile' }));

// ── L2 Finding tenants, vacancy and agent problems ────────────────────────
L.push(q('L2.1', 'L2', 'B', 'single', 'How long does it normally take to fill a vacant unit?', [
  ['lt1w', 'Under 1 week'],
  ['1_4w', '1–4 weeks'],
  ['1_3m', '1–3 months'],
  ['3m_plus', 'More than 3 months'],
  ['varies', 'Varies greatly'],
], { analysis: 'vacancy' }));

L.push(q('L2.2', 'L2', 'B', 'single', 'What is your biggest cost when a property stays vacant?', [
  ['lost_rent', 'Lost rent'],
  ['security', 'Security'],
  ['cleaning', 'Cleaning/maintenance'],
  ['utilities', 'Utilities/service charge'],
  ['advertising', 'Agent/advertising cost'],
  ['damage', 'Risk of damage/vandalism'],
  ['other', 'Other'],
], { analysis: 'vacancy' }));

L.push(q('L2.3', 'L2', 'B', 'single', 'Have agents ever advertised your property without your permission or after it was no longer available?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'agent' }));

L.push(q('L2.4', 'L2', 'B', 'single', 'Have different agents ever advertised your property at different rents or fees?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'agent' }));

L.push(q('L2.5', 'L2', 'B', 'single', 'Have you ever had a dispute with an agent over commission, tenant money, misrepresentation or communication?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'agent' }));

[
  ['L2.6', 'I find it difficult to know which agent has actually brought a serious tenant.'],
  ['L2.7', 'Unprofessional agents can damage a landlord’s reputation with prospective tenants.'],
  ['L2.8', 'Repeated inspections by unserious prospects waste time and resources.'],
  ['L2.9', 'I would prefer a transparent record of who introduced each applicant.'],
  ['L2.10', 'I would prefer to see applicant information before scheduling an inspection.'],
  ['L2.11', 'Vacancy is a major enough problem that I would try a new platform if it produced serious applicants.'],
  ['L2.12', 'I worry that online property platforms attract many unserious or fraudulent enquiries.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L2', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── L3 Tenant screening and verification ──────────────────────────────────
L.push(q('L3.1', 'L3', 'B', 'multi', 'What do you currently check before accepting a tenant? Select all that apply.', [
  ['govt_id', 'Government ID'],
  ['income', 'Employment/income'],
  ['guarantor', 'Guarantor'],
  ['prev_landlord', 'Previous landlord reference'],
  ['workplace', 'Workplace/business'],
  ['bank', 'Bank/payment evidence'],
  ['community', 'Family/community reference'],
  ['social', 'Social media'],
  ['agent_rec', 'Agent recommendation'],
  ['none', 'I do little/no formal screening'],
  ['other', 'Other'],
], { analysis: 'screening' }));

L.push(q('L3.2', 'L3', 'B', 'single', 'Have you ever accepted a tenant who later turned out to have provided false or misleading information?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'screening' }));

L.push(q('L3.3', 'L3', 'B', 'single', 'Have you ever rejected a good applicant because you could not verify them adequately?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'screening' }));

L.push(q('L3.4', 'L3', 'B', 'single', 'Which tenant risk concerns you most?', [
  ['non_payment', 'Non-payment/late rent'],
  ['damage', 'Property damage'],
  ['illegal', 'Illegal activity'],
  ['subletting', 'Unauthorised occupants/subletting'],
  ['neighbours', 'Conflict with neighbours'],
  ['refusal', 'Refusal to leave'],
  ['false_id', 'False identity/information'],
  ['other', 'Other'],
], { analysis: 'screening' }));

[
  ['L3.5', 'Reliable identity verification would make me more willing to accept an applicant found online.'],
  ['L3.6', 'Income/employment information is useful, but I would not rely on it alone.'],
  ['L3.7', 'A previous landlord reference would materially affect my decision.'],
  ['L3.8', 'I would want the applicant’s consent before viewing sensitive verification information.'],
  ['L3.9', 'I would distrust a platform that gives a “verified tenant” badge without explaining the basis.'],
  ['L3.10', 'I would value a structured application that lets me compare applicants consistently.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L3', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── L4 Rent collection, late payment and financial records ────────────────
L.push(q('L4.1', 'L4', 'B', 'single', 'How often do tenants pay later than agreed?', [
  ['never', 'Never'],
  ['rarely', 'Rarely'],
  ['sometimes', 'Sometimes'],
  ['often', 'Often'],
  ['very_often', 'Very often'],
], { analysis: 'payments' }));

L.push(q('L4.2', 'L4', 'B', 'single', 'Have you had a tenant owe substantial rent arrears in the last five years?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'payments' }));

L.push(q('L4.3', 'L4', 'B', 'single', 'What do you usually do first when rent is late?', [
  ['call', 'Call/message tenant'],
  ['visit', 'Visit property'],
  ['guarantor', 'Contact guarantor'],
  ['agent', 'Use agent'],
  ['notice', 'Send written notice'],
  ['lawyer', 'Use lawyer'],
  ['other', 'Other'],
], { analysis: 'payments' }));

L.push(q('L4.4', 'L4', 'B', 'single', 'How do you mainly keep rent records?', [
  ['notebook', 'Notebook/paper'],
  ['whatsapp', 'WhatsApp messages'],
  ['bank', 'Bank statements'],
  ['spreadsheet', 'Spreadsheet'],
  ['software', 'Property-management software'],
  ['memory', 'Memory/no formal system'],
  ['other', 'Other'],
], { analysis: 'records' }));

L.push(q('L4.5', 'L4', 'B', 'single', 'Have you ever disagreed with a tenant about whether/how much rent was paid?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'payments' }));

[
  ['L4.6', 'Automatic digital receipts would reduce payment disputes.'],
  ['L4.7', 'A clear tenant payment history would be useful to me.'],
  ['L4.8', 'I would value automatic reminders before rent due dates.'],
  ['L4.9', 'I would consider more flexible payment schedules for a verified/reliable tenant if collection risk were controlled.'],
  ['L4.10', 'I would not route rent through a platform unless settlement timing, fees and accountability were very clear.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L4', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── L5 Property damage, repairs and maintenance ───────────────────────────
L.push(q('L5.1', 'L5', 'B', 'single', 'How often do tenant-related repairs or damage create significant unexpected costs?', [
  ['never', 'Never'],
  ['rarely', 'Rarely'],
  ['sometimes', 'Sometimes'],
  ['often', 'Often'],
  ['very_often', 'Very often'],
], { analysis: 'maintenance' }));

L.push(q('L5.2', 'L5', 'B', 'single', 'Have you had a serious disagreement with a tenant over whether damage was normal wear or tenant-caused?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'maintenance' }));

L.push(q('L5.3', 'L5', 'B', 'single', 'How do you document property condition at move-in?', [
  ['photos', 'Photos/videos'],
  ['checklist', 'Written inventory/checklist'],
  ['agent', 'Agent report'],
  ['inspection', 'Professional inspection'],
  ['nothing', 'Nothing formal'],
  ['other', 'Other'],
], { analysis: 'maintenance' }));

L.push(q('L5.4', 'L5', 'B', 'single', 'How do tenants usually report repairs?', [
  ['call', 'Phone call'],
  ['whatsapp', 'WhatsApp/SMS'],
  ['agent', 'Agent'],
  ['email', 'Email'],
  ['letter', 'Written letter'],
  ['system', 'Property-management system'],
  ['other', 'Other'],
], { analysis: 'maintenance' }));

L.push(q('L5.5', 'L5', 'B', 'single', 'What most delays repairs?', [
  ['cost', 'Cost'],
  ['artisans', 'Finding trusted artisans'],
  ['access', 'Tenant access/availability'],
  ['approval', 'Landlord approval'],
  ['responsibility', 'Disagreement over responsibility'],
  ['parts', 'Parts/materials'],
  ['other', 'Other'],
], { analysis: 'maintenance' }));

[
  ['L5.6', 'Dated move-in/move-out photos would reduce deposit and damage disputes.'],
  ['L5.7', 'A documented maintenance request system would help me prioritise repairs.'],
  ['L5.8', 'I would value access to vetted cleaning/fumigation or maintenance providers.'],
  ['L5.9', 'I worry about allowing third-party service providers into my property.'],
  ['L5.10', 'I would want to see provider identity, rating and job record before booking.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L5', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── L6 Caution deposits, inspections, disputes and legal support ──────────
L.push(q('L6.1', 'L6', 'B', 'single', 'Do you normally collect a caution/security deposit?', [
  ['always', 'Always'],
  ['usually', 'Usually'],
  ['sometimes', 'Sometimes'],
  ['rarely', 'Rarely'],
  ['never', 'Never'],
], { analysis: 'deposit' }));

L.push(q('L6.2', 'L6', 'B', 'single', 'Have you had a serious dispute about refunding or deducting from a caution/security deposit?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['na', 'Not applicable'],
], { analysis: 'deposit' }));

L.push(q('L6.3', 'L6', 'B', 'single', 'Do you conduct periodic property inspections during a tenancy?', [
  ['schedule', 'On a fixed schedule'],
  ['problem', 'Only when there is a problem'],
  ['rarely', 'Rarely'],
  ['never', 'Never'],
], { analysis: 'deposit' }));

L.push(q('L6.4', 'L6', 'B', 'single', 'Have you ever needed a lawyer or formal dispute-resolution process for a tenancy matter?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['prefer_not', 'Prefer not to say'],
], { analysis: 'legal' }));

L.push(q('L6.5', 'L6', 'B', 'single', 'Which disputes concern you most?', [
  ['arrears', 'Rent arrears'],
  ['damage', 'Damage/deposit'],
  ['eviction', 'Eviction/recovery of premises'],
  ['repairs', 'Repairs'],
  ['subletting', 'Unauthorised occupants/subletting'],
  ['utilities', 'Utilities/service charges'],
  ['neighbours', 'Neighbour complaints'],
  ['other', 'Other'],
], { analysis: 'legal' }));

[
  ['L6.6', 'A documented communication trail could reduce “he said/she said” disputes.'],
  ['L6.7', 'I would value access to verified legal professionals for serious tenancy matters.'],
  ['L6.8', 'A platform should not take sides automatically; evidence and due process matter.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L6', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_PAIN }));
});

// ── L7 Digital readiness and platform trust ───────────────────────────────
L.push(q('L7.1', 'L7', 'B', 'single', 'Which device do you mainly use for property-related communication?', [
  ['android', 'Android phone'],
  ['iphone', 'iPhone'],
  ['laptop', 'Laptop/desktop'],
  ['basic', 'Basic phone'],
  ['other', 'Other'],
], { analysis: 'digital' }));

L.push(q('L7.2', 'L7', 'B', 'single', 'How comfortable are you uploading property photos and documents to a secure online platform?', [
  ['very', 'Very comfortable'],
  ['comfortable', 'Comfortable'],
  ['unsure', 'Unsure'],
  ['uncomfortable', 'Uncomfortable'],
  ['very_uncomfortable', 'Very uncomfortable'],
], { analysis: 'digital' }));

L.push(q('L7.3', 'L7', 'B', 'single', 'Would you complete landlord identity verification to receive a verified profile/listing status?', [
  ['definitely_yes', 'Definitely yes'],
  ['probably_yes', 'Probably yes'],
  ['unsure', 'Unsure'],
  ['probably_no', 'Probably no'],
  ['definitely_no', 'Definitely no'],
], { analysis: 'verification' }));

L.push(q('L7.4', 'L7', 'B', 'multi', 'What would make you refuse verification? Select all that apply.', [
  ['privacy', 'Privacy concerns'],
  ['security', 'Data-security concerns'],
  ['effort', 'Too much effort'],
  ['distrust', 'Do not trust the company'],
  ['no_doc', 'No acceptable document'],
  ['cost', 'Cost'],
  ['internet', 'Poor internet'],
  ['never_refuse', 'I would not refuse if well explained'],
  ['other', 'Other'],
], { analysis: 'verification' }));

L.push(q('L7.5', 'L7', 'B', 'single', 'Would you accept rental applications from people you first encountered online?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe, after verification'],
  ['no', 'No'],
], { analysis: 'adoption' }));

L.push(q('L7.6', 'L7', 'B', 'single', 'Would you communicate with applicants inside a platform if it created a searchable record?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No — I prefer phone/WhatsApp'],
], { analysis: 'adoption' }));

L.push(q('L7.7', 'L7', 'B', 'single', 'How comfortable are you receiving rent through a platform that then settles to your bank account?', [
  ['very', 'Very comfortable'],
  ['somewhat', 'Somewhat comfortable'],
  ['unsure', 'Unsure'],
  ['uncomfortable', 'Uncomfortable'],
  ['very_uncomfortable', 'Very uncomfortable'],
], { analysis: 'adoption' }));

L.push(q('L7.8', 'L7', 'B', 'multi', 'What would you require before trusting platform-based rent collection?', [
  ['settlement', 'Fast settlement'],
  ['fees', 'Low/clear fees'],
  ['statement', 'Detailed statement/receipt'],
  ['security', 'Strong security'],
  ['dispute', 'Dispute support'],
  ['support', 'Reliable customer support'],
  ['credibility', 'Regulatory/company credibility'],
  ['all', 'All of these'],
  ['direct', 'I would still prefer direct payment'],
], { analysis: 'adoption' }));

// ── L8 Concept test ───────────────────────────────────────────────────────
L.push(q('L8.1', 'L8', 'B', 'single', 'Before today, had you heard of RentalHub NG?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['not_sure', 'Not sure'],
], { analysis: 'awareness' }));

L.push(q('L8.2', 'L8', 'B', 'single', 'Based only on the description above, how useful does the overall idea seem for your rental business?', [
  ['very', 'Very useful'],
  ['useful', 'Useful'],
  ['neither', 'Neither'],
  ['not_very', 'Not very useful'],
  ['not_at_all', 'Not useful at all'],
], { analysis: 'concept' }));

[
  ['L8.3', 'Verified landlord/property profiles that clearly explain what was checked.'],
  ['L8.4', 'Property listing with structured price, fees, location, photos and availability status.'],
  ['L8.5', 'Structured tenant applications and applicant comparison.'],
  ['L8.6', 'Tenant identity/verification information with appropriate consent.'],
  ['L8.7', 'Inspection scheduling and applicant tracking.'],
  ['L8.8', 'In-platform messages and communication records.'],
  ['L8.9', 'Digital rent-payment records and receipts.'],
  ['L8.10', 'Rent due reminders and payment-history view.'],
  ['L8.11', 'Move-in/move-out condition evidence and dispute documentation.'],
  ['L8.12', 'Legal-support/lawyer access for serious disputes.'],
  ['L8.13', 'Fumigation/cleaning service booking.'],
  ['L8.14', 'Transportation/moving services for incoming/outgoing tenants.'],
  ['L8.15', 'Property-performance and vacancy/activity analytics.'],
].forEach(([key, text]) => {
  L.push(q(key, 'L8', 'B', 'likert', text, SCALE_1_5, { ...LIKERT_IMPORTANCE, analysis: 'feature' }));
});

L.push(q('L8.16', 'L8', 'B', 'rank', 'Which THREE functions above would most influence you to try RentalHub NG? Write the numbers:', null, {
  maxPicks: 3,
  analysis: 'feature',
  rankSource: ['L8.3', 'L8.4', 'L8.5', 'L8.6', 'L8.7', 'L8.8', 'L8.9', 'L8.10', 'L8.11', 'L8.12', 'L8.13', 'L8.14', 'L8.15'],
}));

L.push(q('L8.17', 'L8', 'B', 'text', 'Which functions would you probably never use?', null, { analysis: 'open' }));
L.push(q('L8.18', 'L8', 'B', 'text', 'What important landlord problem is missing from the concept?', null, { analysis: 'open' }));

// ── L9 Adoption and willingness to pay ────────────────────────────────────
L.push(q('L9.1', 'L9', 'B', 'single', 'If RentalHub NG had active renters in your area today, how likely would you be to list one property?', [
  ['definitely', 'Definitely would'],
  ['probably', 'Probably would'],
  ['not_sure', 'Not sure'],
  ['probably_not', 'Probably would not'],
  ['definitely_not', 'Definitely would not'],
], { analysis: 'adoption' }));

L.push(q('L9.2', 'L9', 'B', 'single', 'Would you give RentalHub NG an exclusive listing?', [
  ['yes', 'Yes'],
  ['limited', 'Maybe for a limited period'],
  ['no', 'No — I would list on multiple channels'],
  ['not_sure', 'Not sure'],
], { analysis: 'adoption' }));

L.push(q('L9.3', 'L9', 'B', 'single', 'Would you continue using offline agents alongside RentalHub NG?', [
  ['yes', 'Yes, definitely'],
  ['probably', 'Probably'],
  ['when_needed', 'Only when needed'],
  ['probably_not', 'Probably not'],
  ['no', 'No'],
], { analysis: 'adoption' }));

L.push(q('L9.4', 'L9', 'B', 'multi', 'What would stop you from listing on RentalHub NG? Select all that apply.', [
  ['few_tenants', 'Too few serious tenants'],
  ['fees', 'Fees too high'],
  ['verification', 'Verification burden'],
  ['privacy', 'Privacy/security concern'],
  ['fraud', 'Fear of fraud'],
  ['agents', 'I prefer my current agents'],
  ['settlement', 'Slow payments/settlement'],
  ['support', 'Poor support'],
  ['difficult', 'Platform difficult to use'],
  ['presence', 'No presence in my area'],
  ['nothing', 'Nothing if it produces good tenants'],
  ['other', 'Other'],
], { analysis: 'barriers' }));

L.push(q('L9.5', 'L9', 'B', 'single', 'Which charging model would you consider most acceptable?', [
  ['freemium', 'Free basic listing + optional paid services'],
  ['fixed_fee', 'Fixed fee per successful tenancy'],
  ['percentage', 'Percentage commission on successful tenancy'],
  ['subscription', 'Monthly/annual landlord subscription'],
  ['promoted', 'Pay for promoted/featured listings'],
  ['ads', 'Advertising-supported/free'],
  ['never', 'I would not pay RentalHub'],
  ['not_sure', 'Not sure'],
], { analysis: 'fee' }));

L.push(q('L9.6', 'L9', 'B', 'single', 'If RentalHub NG successfully introduced a tenant who completed a tenancy, what maximum platform fee would you consider before preferring your existing method?', [
  ['0', '₦0'],
  ['lt5k', 'Below ₦5,000'],
  ['5_19', '₦5,000–₦19,999'],
  ['20_49', '₦20,000–₦49,999'],
  ['50k_plus', '₦50,000+'],
  ['pct', 'A small percentage of rent'],
  ['replaces', 'Only if it replaces an agent fee'],
  ['depends', 'Depends on property value'],
  ['not_sure', 'Not sure'],
], { analysis: 'fee' }));

L.push(q('L9.7', 'L9', 'B', 'single', 'Would you pay separately for optional tenant verification, legal support, property promotion or maintenance services?', [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No'],
  ['depends', 'Depends on price/value'],
], { analysis: 'fee' }));

L.push(q('L9.8', 'L9', 'B', 'single', 'Would you recommend RentalHub NG to another landlord IF it consistently brought serious verified applicants and reduced disputes? (0 = not at all likely; 10 = extremely likely)', SCALE_0_10, {
  analysis: 'nps',
}));

L.push(q('L9.9', 'L9', 'B', 'text', 'What single failure would make you remove all your properties from RentalHub NG?', null, { analysis: 'open' }));
L.push(q('L9.10', 'L9', 'B', 'text', 'What proof would you need before trusting RentalHub NG with important rental transactions?', null, { analysis: 'open' }));

// ── L10 Open-ended ────────────────────────────────────────────────────────
L.push(q('L10.1', 'L10', 'B', 'text', 'Tell us about the worst tenant-related problem you have experienced.', null, { analysis: 'open' }));
L.push(q('L10.2', 'L10', 'B', 'text', 'Tell us about the worst agent-related problem you have experienced.', null, { analysis: 'open' }));
L.push(q('L10.3', 'L10', 'B', 'text', 'What currently wastes the most time or money when you are trying to rent out a property?', null, { analysis: 'open' }));
L.push(q('L10.4', 'L10', 'B', 'text', 'What information about a prospective tenant would be genuinely useful — and what would be unnecessary or intrusive?', null, { analysis: 'open' }));
L.push(q('L10.5', 'L10', 'B', 'text', 'What would make you choose an online platform over your present agent/referral method?', null, { analysis: 'open' }));
L.push(q('L10.6', 'L10', 'B', 'text', 'What should RentalHub NEVER do to landlords or tenants?', null, { analysis: 'open' }));
L.push(q('L10.7', 'L10', 'B', 'text', 'If you could change one thing about the Nigerian rental market, what would it be?', null, { analysis: 'open' }));
L.push(q('L10.8', 'L10', 'B', 'text', 'Any other comment you want the RentalHub team to hear?', null, { analysis: 'open' }));

module.exports = { type: 'landlord', sections: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'], questions: L };
