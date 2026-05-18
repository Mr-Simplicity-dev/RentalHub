const cron = require("node-cron");
const {
  checkExpiredSubscriptions,
  checkExpiredListings,
  checkExpiredTenancyReminders
} = require("../config/utils/paymentUtils");
const { expireProperties } = require("../config/utils/propertyUtils");

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
