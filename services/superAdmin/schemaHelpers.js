const db = require('../../config/middleware/database');

const logger = require('../../config/utils/logger');

const jwt = require('jsonwebtoken');

const { decryptNIN } = require('../../config/utils/ninEncryption');

const {
  ensureVerificationAuditSchema,
  ensureUserSuspensionSchema,
  ensureAdminAccountOperationSchema,
  ensureIdentityVerificationOperationSchema,
  USER_VERIFICATION_STATUS_EXPR,
} = require('../../config/schema');

const {

  DEFAULT_FEATURE_FLAGS,

  ensureFeatureFlagsTable,

  syncDefaultFeatureFlags,

} = require('../../config/middleware/featureFlags');

const { getLocationOptions } = require('../../config/utils/locationDirectory');

const {

  createLocationPricingRule,

  deleteLocationPricingRule,

  getPricingTargets,

  listLocationPricingRules,

  updateLocationPricingRule,

} = require('../../config/utils/locationPricing');

const {

  createRegistrationAccessRule,

  deleteRegistrationAccessRule,

  getRegistrationAccessTargets,

  listRegistrationAccessRules,

  updateRegistrationAccessRule,

} = require('../../config/utils/registrationAccess');

const {

  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,

  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,

  createPlatformLawyerInvite,

  ensurePlatformLawyerSchema,

} = require('../../config/utils/platformLawyerProgram');

const {

  ensurePlatformAgentSchema,

} = require('../../config/utils/platformAgentProgram');

const {

  sendPlatformLawyerInviteEmail,

} = require('../../config/utils/emailService');

const {

  ensureLawyerCaseNotesSchema,

} = require('../../config/utils/legalSchema');

const {

  setAuthCookies,

  shouldReturnTokenInBody,

} = require('../../config/utils/authCookies');




const getAdminOperationActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createAdminAccountOperation = async ({
  adminUserId,
  actorId,
  actorName,
  eventType,
  note = null,
  adminSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO admin_account_operations (
       admin_user_id,
       actor_id,
       actor_name,
       event_type,
       note,
       admin_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      adminUserId || null,
      actorId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(adminSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const createIdentityVerificationOperation = async ({
  userId,
  actorId,
  actorName,
  eventType,
  note = null,
  userSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO identity_verification_operations (
       user_id,
       actor_id,
       actor_name,
       event_type,
       note,
       user_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      userId || null,
      actorId || null,
      getAdminOperationActorName({ id: actorId, full_name: actorName }) || null,
      eventType,
      note || null,
      JSON.stringify(userSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const buildDeletedEmail = (userId) => `deleted+u${userId}.${Date.now()}@deleted.local`;


const buildDeletedUniqueValue = (prefix, userId) => `${prefix}${userId}${Date.now().toString().slice(-8)}`;



// ---- Audit Helper ----

const logAction = async (actorId, action, targetType = null, targetId = null) => {

  await db.query(

    `INSERT INTO audit_logs (actor_id, action, target_type, target_id)

     VALUES ($1, $2, $3, $4)`,

    [actorId, action, targetType, targetId]

  );

};



const getDashboardPathForRole = (userType) => {

  switch (String(userType || '').toLowerCase()) {

    case 'super_admin':

      return '/super-admin?tab=overview';

    case 'super_financial_admin':

      return '/admin/super-financial-dashboard?panel=overview';

    case 'financial_admin':

    case 'lga_financial_admin':

      return '/admin/financial-dashboard';

    case 'lga_support_admin':

      return '/admin?tab=property_requests';

    case 'state_admin':

    case 'state_financial_admin':

    case 'admin':

    case 'lga_admin':

      return '/admin';

    case 'super_support_admin':

      return '/admin/super-support-dashboard?tab=overview';

    case 'recruitment_admin':

      return '/admin/recruitment';

    case 'state_support_admin':

      return '/admin/state-support-dashboard';

    case 'fumigation_admin':

    case 'lga_fumigation_admin':

    case 'state_fumigation_admin':

    case 'super_fumigation_admin':

      return '/admin/fumigation-cleaning';

    case 'transportation_admin':

    case 'lga_transportation_admin':

    case 'state_transportation_admin':

    case 'super_transportation_admin':

      return '/admin/transportation';

    case 'super_lawyer':

      return '/lawyer/super';

    case 'state_lawyer':

      return '/lawyer/state';

    case 'lawyer':

      return '/lawyer';

    default:

      return '/dashboard';

  }

};




module.exports = {
  ensureVerificationAuditSchema,
  ensureUserSuspensionSchema,
  ensureAdminAccountOperationSchema,
  ensureIdentityVerificationOperationSchema,
  createAdminAccountOperation,
  createIdentityVerificationOperation,
  buildDeletedEmail,
  buildDeletedUniqueValue,
  logAction,
  getDashboardPathForRole,
  USER_VERIFICATION_STATUS_EXPR,
};
