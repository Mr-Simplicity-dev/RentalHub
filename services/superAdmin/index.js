const {
  getAllUsers,
  impersonateAdmin,
  banUser,
  unbanUser,
  deleteUser,
  promoteToAdmin,
} = require('./userService');

const {
  getIdentityVerifications,
  approveIdentityVerification,
  rejectIdentityVerification,
  deleteRejectedVerification,
  verifyUser,
  getAdminPerformance,
  getAdminStateUsers,
  updateAdminJurisdiction,
} = require('./verificationService');

const {
  getAllProperties,
  unlistProperty,
  featureProperty,
  unfeatureProperty,
} = require('./propertyService');

const {
  getAuditLogs,
  getAdminMonitor,
  getAnalytics,
} = require('./auditService');

const {
  getReports,
  updateReportStatus,
  resolveReport,
} = require('./reportService');

const {
  getBroadcasts,
  createBroadcast,
} = require('./broadcastService');

const {
  getPlatformLawyerManagementData,
  createManualPlatformLawyer,
  resendManualPlatformLawyerInvite,
  updatePlatformLawyer,
  deletePlatformLawyer,
  createPlatformLawyerRecruitmentBroadcast,
  approvePlatformLawyerApplication,
  rejectPlatformLawyerApplication,
  getPlatformAgentManagementData,
  createManualPlatformAgent,
  updatePlatformAgent,
  deletePlatformAgent,
} = require('./lawyerService');

const {
  getFeatureFlags,
  updateFeatureFlag,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  removePricingRule,
  getRegistrationAccessRules,
  createRegistrationAccessRuleHandler,
  updateRegistrationAccessRuleHandler,
  removeRegistrationAccessRule,
} = require('./pricingService');

const {
  getFraudFlags,
  resolveFraudFlag,
  getLawyerActivities,
  sendUserVerificationReminder,
} = require('./fraudService');

const {
  bulkUserAction,
  bulkPropertyAction,
} = require('./bulkActionService');

module.exports = {
  getAllUsers,
  impersonateAdmin,
  banUser,
  unbanUser,
  deleteUser,
  promoteToAdmin,
  getIdentityVerifications,
  approveIdentityVerification,
  rejectIdentityVerification,
  deleteRejectedVerification,
  verifyUser,
  getAdminPerformance,
  getAdminStateUsers,
  updateAdminJurisdiction,
  getAllProperties,
  unlistProperty,
  featureProperty,
  unfeatureProperty,
  getAuditLogs,
  getAdminMonitor,
  getAnalytics,
  getReports,
  updateReportStatus,
  resolveReport,
  getBroadcasts,
  createBroadcast,
  getPlatformLawyerManagementData,
  createManualPlatformLawyer,
  resendManualPlatformLawyerInvite,
  updatePlatformLawyer,
  deletePlatformLawyer,
  createPlatformLawyerRecruitmentBroadcast,
  approvePlatformLawyerApplication,
  rejectPlatformLawyerApplication,
  getPlatformAgentManagementData,
  createManualPlatformAgent,
  updatePlatformAgent,
  deletePlatformAgent,
  getFeatureFlags,
  updateFeatureFlag,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  removePricingRule,
  getRegistrationAccessRules,
  createRegistrationAccessRuleHandler,
  updateRegistrationAccessRuleHandler,
  removeRegistrationAccessRule,
  getFraudFlags,
  resolveFraudFlag,
  getLawyerActivities,
  sendUserVerificationReminder,
  bulkUserAction,
  bulkPropertyAction,
};
