const crypto = require('crypto');

// Canonical platform prefix for every NEW Amana RentalHub reference.
// ARH = Amana RentalHub.
const PLATFORM_PREFIX = 'ARH';

// Build an underscore-style reference: buildReference('RENT', 184, ts) -> ARH_RENT_184_<ts>
const buildReference = (...parts) =>
  [PLATFORM_PREFIX, ...parts.map((part) => String(part))].join('_').replace(/_+$/, '');

// Build a hyphen-style reference: buildHyphenReference('RCPT', 184) -> ARH-RCPT-184
const buildHyphenReference = (...parts) =>
  [PLATFORM_PREFIX, ...parts.map((part) => String(part))].join('-').replace(/-+$/, '');

// Cryptographically secure token for security-sensitive references (hex, uppercase).
const secureToken = (bytes = 16) => crypto.randomBytes(bytes).toString('hex').toUpperCase();

// Payout transfer reference builders. New transfers MUST use these so Paystack
// receives the ARH form; the exact persisted string is what verification and
// reconciliation later look up (never re-generate or guess a reference).
const payoutReference = (kind, withdrawalId, suffix) =>
  suffix === undefined
    ? buildReference(kind, withdrawalId, Date.now())
    : buildReference(kind, withdrawalId, suffix);

const agentWithdrawalReference = (withdrawalId) => payoutReference('AGW', withdrawalId);
const walletWithdrawalReference = (withdrawalId) => payoutReference('WLW', withdrawalId);
const stateAdminWithdrawalReference = (withdrawalId) => payoutReference('SAW', withdrawalId);

// Payout retry references: ARH_AGW_<id>_R1 etc. Attempt comes from the claim.
const payoutRetryReference = (kind, withdrawalId, attempt) =>
  buildReference(kind, withdrawalId, `R${attempt}`);

// LEGACY compatibility helpers -------------------------------------------------
// Historical references were generated without the ARH prefix (AGW_, WLW_,
// SAW_, RENT_, REGPAY_, RH-APP-, RH_CR_, ...). Those rows stay in the database
// forever, so every router/validator must accept BOTH forms. Matching helpers
// below must never be used to decide what we GENERATE, only what we ACCEPT.

const withLegacy = (prefix) => [`ARH_${prefix}_`, `${prefix}_`];
const withLegacyHyphen = (prefix) => [`ARH-${prefix}-`, `${prefix}-`];

// True when a reference starts with either the ARH or the legacy form.
const matchesPrefix = (reference, prefix) => {
  const value = String(reference || '');
  return value.startsWith(`ARH_${prefix}_`) || value.startsWith(`${prefix}_`);
};

const matchesHyphenPrefix = (reference, prefix) => {
  const value = String(reference || '');
  return value.startsWith(`ARH-${prefix}-`) || value.startsWith(`${prefix}-`);
};

// Accepts ARH-APP-... and legacy RH-APP-... (recruitment application reference).
const isApplicationReference = (reference) =>
  /^(ARH|RH)-APP-[A-Z0-9]+$/i.test(String(reference || ''));

// Accepts ARH_CR_... and legacy RH_CR_... (recruitment payment reference).
const isRecruitmentPaymentReference = (reference) =>
  /^(ARH|RH)_CR_/.test(String(reference || ''));

// Receipt/document numbers (hyphen style, zero-padded immutable record id).
const paymentReceiptNumber = (paymentId) => buildHyphenReference('RCPT', String(paymentId).padStart(6, '0'));
const savingsReceiptNumber = (contributionId) =>
  buildHyphenReference('RCPT', 'SAV', String(contributionId).padStart(6, '0'));
const userPayoutReceiptNumber = (withdrawalId) => buildHyphenReference('WDR', String(withdrawalId).padStart(6, '0'));
const agentPayoutReceiptNumber = (withdrawalId) =>
  buildHyphenReference('AG', 'PAY', String(withdrawalId).padStart(6, '0'));
const adminPayoutReceiptNumber = (withdrawalId) =>
  buildHyphenReference('SAW', 'PAY', String(withdrawalId).padStart(6, '0'));

module.exports = {
  PLATFORM_PREFIX,
  buildReference,
  buildHyphenReference,
  secureToken,
  agentWithdrawalReference,
  walletWithdrawalReference,
  stateAdminWithdrawalReference,
  payoutRetryReference,
  withLegacy,
  withLegacyHyphen,
  matchesPrefix,
  matchesHyphenPrefix,
  isApplicationReference,
  isRecruitmentPaymentReference,
  paymentReceiptNumber,
  savingsReceiptNumber,
  userPayoutReceiptNumber,
  agentPayoutReceiptNumber,
  adminPayoutReceiptNumber,
};
