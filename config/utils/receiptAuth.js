const db = require('../middleware/database');
const logger = require('./logger');
const { normalizeRole, roleIn, ROLE_GROUPS } = require('./roleHierarchy');
const { isSuperAdminOrSuperFinancialAdmin } = require('./roleScopes');
const { ZONE_STATES, canonicalZone } = require('./territorialZones');

const norm = (value) => String(value || '').trim().toLowerCase();

const cleanPhone = (value) => String(value || '').replace(/\D/g, '');

const TRANSPORT_ADMIN_ROLES = [
  ...ROLE_GROUPS.lgaTransportation,
  ...ROLE_GROUPS.stateTransportation,
  ...ROLE_GROUPS.zonalTransportation,
  ...ROLE_GROUPS.superTransportation,
];

const FUMIGATION_ADMIN_ROLES = [
  ...ROLE_GROUPS.lgaFumigation,
  ...ROLE_GROUPS.stateFumigation,
  ...ROLE_GROUPS.zonalFumigation,
  ...ROLE_GROUPS.superFumigation,
];

const hasPlatformFinanceAccess = (user) =>
  Boolean(user && isSuperAdminOrSuperFinancialAdmin(user.user_type));

const loadActorJurisdiction = async (user) => {
  if (!user) return {};
  if (
    user.assigned_state !== undefined ||
    user.assigned_lga !== undefined ||
    user.assigned_city !== undefined ||
    user.assigned_zone !== undefined
  ) {
    return {
      assigned_state: user.assigned_state || null,
      assigned_lga: user.assigned_lga || user.assigned_city || null,
      assigned_zone: user.assigned_zone || null,
    };
  }
  try {
    const res = await db.query(
      'SELECT assigned_state, assigned_lga, assigned_city, assigned_zone FROM users WHERE id = $1 LIMIT 1',
      [user.id]
    );
    const row = res.rows[0] || {};
    return {
      assigned_state: row.assigned_state || null,
      assigned_lga: row.assigned_lga || row.assigned_city || null,
      assigned_zone: row.assigned_zone || null,
    };
  } catch {
    return {};
  }
};

const matchesJurisdiction = async (actor, { stateName, lgaName } = {}) => {
  if (!actor) return false;
  const role = normalizeRole(actor.user_type);

  if (hasPlatformFinanceAccess(actor)) return true;

  // Zonal financial admin (or zonal admin with finance view)
  if (roleIn(role, ['zonal_financial_admin', 'zonal_admin'])) {
    if (!stateName) return false;
    const scope = await loadActorJurisdiction(actor);
    const zone = canonicalZone(scope.assigned_zone);
    if (!zone || !ZONE_STATES[zone]) return false;
    return ZONE_STATES[zone].some((s) => norm(s) === norm(stateName));
  }

  // State financial admin (or state admin per existing requireStateDashboardAccess)
  if (roleIn(role, ['state_financial_admin', 'state_admin'])) {
    if (!stateName) return false;
    const scope = await loadActorJurisdiction(actor);
    return Boolean(scope.assigned_state && norm(scope.assigned_state) === norm(stateName));
  }

  // LGA financial admin only (NOT ordinary lga_admin or support admins)
  if (roleIn(role, ['lga_financial_admin'])) {
    const scope = await loadActorJurisdiction(actor);
    if (!scope.assigned_state || !stateName) return false;
    if (norm(scope.assigned_state) !== norm(stateName)) return false;
    if (scope.assigned_lga && lgaName) {
      return norm(scope.assigned_lga) === norm(lgaName);
    }
    return true;
  }

  return false;
};

const matchesServiceAdminScope = async (actor, domain, { stateName, lgaName } = {}) => {
  if (!actor) return false;
  const role = normalizeRole(actor.user_type);

  if (domain === 'transportation') {
    if (!roleIn(role, TRANSPORT_ADMIN_ROLES)) return false;
    if (roleIn(role, ['super_transportation_admin', 'transportation_admin'])) return true;
    const scope = await loadActorJurisdiction(actor);
    if (role === 'zonal_transportation_admin') {
      const zone = canonicalZone(scope.assigned_zone);
      return Boolean(zone && stateName && (ZONE_STATES[zone] || []).some((s) => norm(s) === norm(stateName)));
    }
    if (role === 'state_transportation_admin') {
      return Boolean(scope.assigned_state && stateName && norm(scope.assigned_state) === norm(stateName));
    }
    if (role === 'lga_transportation_admin') {
      if (!scope.assigned_state || !stateName || norm(scope.assigned_state) !== norm(stateName)) return false;
      return !scope.assigned_lga || !lgaName || norm(scope.assigned_lga) === norm(lgaName);
    }
    return false;
  }

  if (domain === 'fumigation') {
    if (!roleIn(role, FUMIGATION_ADMIN_ROLES)) return false;
    if (roleIn(role, ['super_fumigation_admin', 'fumigation_admin'])) return true;
    const scope = await loadActorJurisdiction(actor);
    if (role === 'zonal_fumigation_admin') {
      const zone = canonicalZone(scope.assigned_zone);
      return Boolean(zone && stateName && (ZONE_STATES[zone] || []).some((s) => norm(s) === norm(stateName)));
    }
    if (role === 'state_fumigation_admin') {
      return Boolean(scope.assigned_state && stateName && norm(scope.assigned_state) === norm(stateName));
    }
    if (role === 'lga_fumigation_admin') {
      if (!scope.assigned_state || !stateName || norm(scope.assigned_state) !== norm(stateName)) return false;
      return !scope.assigned_lga || !lgaName || norm(scope.assigned_lga) === norm(lgaName);
    }
    return false;
  }

  return false;
};

/**
 * Authorize access to a payment receipt (payments table).
 * Returns { allowed: boolean, perspective: 'payer' | 'landlord' | 'finance_admin' | null, reason?: string }.
 */
const authorizePaymentReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.payment) return { allowed: false, perspective: null, reason: 'missing_context' };

  const actorId = Number(actor.id);
  const payment = ctx.payment;

  // 1. Payer or beneficiary user
  if (
    Number(payment.user_id) === actorId ||
    (payment.payer_user_id && Number(payment.payer_user_id) === actorId)
  ) {
    return { allowed: true, perspective: 'payer' };
  }

  // 2. Property landlord for rent payments on their own property (Landlord Rent Received view)
  if (
    payment.payment_type === 'rent_payment' &&
    ctx.rent?.landlordId &&
    Number(ctx.rent.landlordId) === actorId
  ) {
    return { allowed: true, perspective: 'landlord' };
  }

  // 3. Platform-wide or jurisdiction-scoped finance admin
  const geo = {
    stateName: ctx.geo?.stateName || ctx.rent?.stateName || null,
    lgaName: ctx.geo?.lgaName || ctx.rent?.lgaName || null,
  };
  if (await matchesJurisdiction(actor, geo)) {
    return { allowed: true, perspective: 'finance_admin' };
  }

  return { allowed: false, perspective: null, reason: 'not_authorized_for_payment' };
};

const authorizeSavingsReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.contribution) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (Number(ctx.contribution.tenant_id) === Number(actor.id)) {
    return { allowed: true, perspective: 'owner' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_savings' };
};

const authorizeWalletTransactionReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.transaction) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (Number(ctx.transaction.user_id) === Number(actor.id)) {
    return { allowed: true, perspective: 'owner' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_wallet_transaction' };
};

const authorizeUserPayoutReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.withdrawal) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (Number(ctx.withdrawal.user_id) === Number(actor.id)) {
    return { allowed: true, perspective: 'recipient' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_user_payout' };
};

const authorizeAgentPayoutReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.withdrawal) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (Number(ctx.withdrawal.agent_user_id) === Number(actor.id)) {
    return { allowed: true, perspective: 'recipient' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_agent_payout' };
};

const authorizeAdminPayoutReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.withdrawal) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (Number(ctx.withdrawal.admin_id) === Number(actor.id)) {
    return { allowed: true, perspective: 'recipient' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_admin_payout' };
};

const authorizeRefundReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.refund) return { allowed: false, perspective: null, reason: 'missing_context' };
  const actorId = Number(actor.id);
  if (Number(ctx.refund.tenant_id) === actorId) {
    return { allowed: true, perspective: 'tenant' };
  }
  if (ctx.refund.landlord_id && Number(ctx.refund.landlord_id) === actorId) {
    return { allowed: true, perspective: 'landlord' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_refund' };
};

const authorizeTransportationReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.booking) return { allowed: false, perspective: null, reason: 'missing_context' };
  const actorId = Number(actor.id);
  if (Number(ctx.booking.tenant_id) === actorId) {
    return { allowed: true, perspective: 'payer' };
  }
  // Assigned driver / transport operator for this specific booking only
  if (ctx.booking.driver_id && Number(ctx.booking.driver_id) === actorId) {
    return { allowed: true, perspective: 'provider' };
  }
  if (await matchesServiceAdminScope(actor, 'transportation', ctx.geo || {})) {
    return { allowed: true, perspective: 'service_admin' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_transportation' };
};

const authorizeFumigationReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.booking) return { allowed: false, perspective: null, reason: 'missing_context' };
  const actorId = Number(actor.id);
  if (Number(ctx.booking.tenant_id) === actorId) {
    return { allowed: true, perspective: 'payer' };
  }
  // Assigned fumigation specialist / team member for this specific booking only
  const actorPhoneDigits = cleanPhone(actor.phone);
  const teamPhoneDigits = cleanPhone(ctx.booking.team_phone);
  if (
    (ctx.booking.team_id && Number(ctx.booking.team_id) === actorId) ||
    (ctx.booking.provider_user_id && Number(ctx.booking.provider_user_id) === actorId) ||
    (actorPhoneDigits && teamPhoneDigits && teamPhoneDigits.endsWith(actorPhoneDigits.slice(-10)))
  ) {
    return { allowed: true, perspective: 'provider' };
  }
  if (await matchesServiceAdminScope(actor, 'fumigation', ctx.geo || {})) {
    return { allowed: true, perspective: 'service_admin' };
  }
  if (await matchesJurisdiction(actor, ctx.geo || {})) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_fumigation' };
};

const authorizeEvidenceReceipt = async (actor, ctx) => {
  if (!actor || !ctx?.evidencePayment) return { allowed: false, perspective: null, reason: 'missing_context' };
  if (
    actor.email &&
    ctx.evidencePayment.payer_email &&
    norm(actor.email) === norm(ctx.evidencePayment.payer_email)
  ) {
    return { allowed: true, perspective: 'payer' };
  }
  if (hasPlatformFinanceAccess(actor)) {
    return { allowed: true, perspective: 'finance_admin' };
  }
  return { allowed: false, perspective: null, reason: 'not_authorized_for_evidence' };
};

const logReceiptAccessDenial = (req, { kind, resourceId, reason }) => {
  try {
    const activeLogger = req?.logger || logger;
    activeLogger.warn('Financial receipt access denied', {
      event: 'receipt_access_denied',
      actorId: req?.user?.id || null,
      actorRole: normalizeRole(req?.user?.user_type),
      documentKind: kind,
      resourceId: Number.isFinite(Number(resourceId)) ? Number(resourceId) : String(resourceId || ''),
      reason: reason || 'forbidden',
      path: req?.originalUrl || req?.path || '',
    });
  } catch {
    // Logging errors must never block the 403 response.
  }
};

module.exports = {
  hasPlatformFinanceAccess,
  matchesJurisdiction,
  matchesServiceAdminScope,
  authorizePaymentReceipt,
  authorizeSavingsReceipt,
  authorizeWalletTransactionReceipt,
  authorizeUserPayoutReceipt,
  authorizeAgentPayoutReceipt,
  authorizeAdminPayoutReceipt,
  authorizeRefundReceipt,
  authorizeTransportationReceipt,
  authorizeFumigationReceipt,
  authorizeEvidenceReceipt,
  logReceiptAccessDenial,
};
