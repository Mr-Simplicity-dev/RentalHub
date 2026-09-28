const logger = require('../config/utils/logger');
const cron = require("node-cron");
const {
  checkExpiredSubscriptions,
  checkExpiredListings,
  checkExpiredTenancyReminders
} = require("../config/utils/paymentUtils");
const { expireProperties } = require("../config/utils/propertyUtils");
const { clearMaturedLandlordRentCredits } = require("../services/walletLedgerService");

const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Africa/Lagos";

// =====================================================
//               START PAYMENT JOBS
// =====================================================
exports.startPaymentJobs = () => {
  // Check expired subscriptions daily at 00:00
  cron.schedule("0 0 * * *", async () => {
    logger.info("Running expired subscriptions check...");
    await checkExpiredSubscriptions();
  });

  // Check expired listings daily at 00:30
  cron.schedule("30 0 * * *", async () => {
    logger.info("Running expired listings check...");
    await checkExpiredListings();
  });

  const tenancyReminderCron = process.env.TENANCY_EXPIRY_REMINDER_CRON || "0 7 * * *";

  // Check expired tenancy periods daily and email tenant/landlord once.
  cron.schedule(tenancyReminderCron, async () => {
    logger.info("Running expired tenancy reminder check...");
    await checkExpiredTenancyReminders({
      limit: process.env.TENANCY_EXPIRY_REMINDER_BATCH_LIMIT || 50,
    });
  }, { timezone: CRON_TIMEZONE });

  const walletClearingCron = process.env.RENT_WALLET_CLEARING_CRON || "15 1 * * *";

  cron.schedule(walletClearingCron, async () => {
    try {
      logger.info("Running landlord rent wallet clearing check...");
      const result = await clearMaturedLandlordRentCredits({
        limit: Number(process.env.RENT_WALLET_CLEARING_BATCH_LIMIT || 500),
      });
      logger.info(
        `Landlord rent wallet clearing complete: ${result.cleared_count} credits, ${result.cleared_amount} total`
      );
    } catch (error) {
      logger.error("Landlord rent wallet clearing failed:", error);
    }
  }, { timezone: CRON_TIMEZONE });

  // Auto-payout commissions weekly on Monday at 08:00
  cron.schedule("0 8 * * 1", async () => {
    try {
      const { processAutoPayouts } = require("../services/commissionService");
      const result = await processAutoPayouts();
      if (result?.processed > 0) {
        logger.info(`Auto-payout complete: ${result.processed} admins, ₦${result.total_amount}`);
      }
    } catch (error) {
      logger.error("Auto-payout error:", error);
    }
  });

  logger.info("✅ Payment cron jobs started");
};

// =====================================================
//               START PROPERTY JOBS
// =====================================================
// =====================================================
//          MARKETING AGENT COMMISSION SWEEP
// =====================================================
exports.startMarketingCommissionJobs = () => {
  // Pay the verification stage for agent-opened accounts that have since verified
  // both email and phone. A sweep keeps this in one place instead of hooking every
  // verification handler, and the unique constraint makes repeats harmless.
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        const { sweepVerifiedCommissions } = require('../services/marketingAgentCommissionService');
        const paid = await sweepVerifiedCommissions();
        if (paid) {
          logger.info(`Marketing agent commissions: paid ${paid} verification reward(s)`);
        }
      } catch (error) {
        logger.error('Marketing agent commission sweep error:', error.message);
      }
    },
    { timezone: CRON_TIMEZONE }
  );

  logger.info("Marketing commission cron jobs started");
};

exports.startPropertyJobs = () => {
  // Check expired properties daily at 01:00
  cron.schedule("0 1 * * *", async () => {
    logger.info("Running expired properties check...");
    await expireProperties();
  });

  logger.info("✅ Property cron jobs started");
};
