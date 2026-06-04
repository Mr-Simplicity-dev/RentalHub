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
    console.log("Running expired subscriptions check...");
    await checkExpiredSubscriptions();
  });

  // Check expired listings daily at 00:30
  cron.schedule("30 0 * * *", async () => {
    console.log("Running expired listings check...");
    await checkExpiredListings();
  });

  const tenancyReminderCron = process.env.TENANCY_EXPIRY_REMINDER_CRON || "0 7 * * *";

  // Check expired tenancy periods daily and email tenant/landlord once.
  cron.schedule(tenancyReminderCron, async () => {
    console.log("Running expired tenancy reminder check...");
    await checkExpiredTenancyReminders({
      limit: process.env.TENANCY_EXPIRY_REMINDER_BATCH_LIMIT || 50,
    });
  }, { timezone: CRON_TIMEZONE });

  const walletClearingCron = process.env.RENT_WALLET_CLEARING_CRON || "15 1 * * *";

  cron.schedule(walletClearingCron, async () => {
    try {
      console.log("Running landlord rent wallet clearing check...");
      const result = await clearMaturedLandlordRentCredits({
        limit: Number(process.env.RENT_WALLET_CLEARING_BATCH_LIMIT || 500),
      });
      console.log(
        `Landlord rent wallet clearing complete: ${result.cleared_count} credits, ${result.cleared_amount} total`
      );
    } catch (error) {
      console.error("Landlord rent wallet clearing failed:", error);
    }
  }, { timezone: CRON_TIMEZONE });

  console.log("✅ Payment cron jobs started");
};

// =====================================================
//               START PROPERTY JOBS
// =====================================================
exports.startPropertyJobs = () => {
  // Check expired properties daily at 01:00
  cron.schedule("0 1 * * *", async () => {
    console.log("Running expired properties check...");
    await expireProperties();
  });

  console.log("✅ Property cron jobs started");
};
