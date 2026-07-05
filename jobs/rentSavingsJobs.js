const logger = require('../config/utils/logger');
const cron = require('node-cron');
const db = require('../config/middleware/database');
const NotificationService = require('../services/NotificationService');

/**
 * Rent Savings Cron Jobs
 * 
 * 1. Monthly check on the 1st of each month at 9:00 AM
 *    - Finds all active savings plans
 *    - Checks if tenant contributed for the current month
 *    - Sends reminder notification if missed
 * 
 * 2. Daily check at 8:00 AM
 *    - Finds plans approaching rent due date (within 7 days)
 *    - Sends withdrawal reminder notifications
 */

// Get the current month string in YYYY-MM format
function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get month name from YYYY-MM string
function getMonthName(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

/**
 * Check for missed monthly contributions and send reminders
 */
async function checkMissedMonthlyContributions() {
  try {
    logger.info('[RentSavingsJobs] Checking missed monthly contributions...');
    const currentMonth = getCurrentMonthStr();
    const now = new Date();

    // Find all active plans
    const activePlans = await db.query(
      `SELECT rsp.*, u.full_name AS tenant_name, u.email AS tenant_email,
              p.title AS property_title
       FROM rent_savings_plans rsp
       JOIN users u ON rsp.tenant_id = u.id
       JOIN properties p ON rsp.property_id = p.id
       WHERE rsp.is_active = TRUE
         AND rsp.status = 'active'
         AND rsp.rent_due_date > $1`,
      [now]
    );

    let reminderCount = 0;

    for (const plan of activePlans.rows) {
      // Check if the tenant has contributed for this month
      const contribution = await db.query(
        `SELECT id FROM rent_savings_contributions
         WHERE plan_id = $1 AND saved_for_month = $2`,
        [plan.id, currentMonth]
      );

      if (contribution.rows.length === 0) {
        // Tenant missed this month - send reminder
        const monthName = getMonthName(currentMonth);
        const monthlyAmount = Number(plan.monthly_savings_amount).toLocaleString();

        await NotificationService.sendNotification(
          plan.tenant_id,
          '📌 Time to Save for Your Rent!',
          `You missed ${monthName}. Save ₦${monthlyAmount} to stay on track for "${plan.property_title}". Tap here to contribute.`,
          'rent_savings_reminder',
          plan.id,
          'rent_savings_plan'
        );

        reminderCount++;
        logger.info(`[RentSavingsJobs] Reminder sent to tenant #${plan.tenant_id} for plan #${plan.id}`);
      }
    }

    logger.info(`[RentSavingsJobs] Monthly check complete. Sent ${reminderCount} reminders.`);
  } catch (error) {
    logger.error('[RentSavingsJobs] Error in monthly check:', error);
  }
}

/**
 * Check for plans approaching rent due date (within 7 days)
 */
async function checkApproachingDueDates() {
  try {
    logger.info('[RentSavingsJobs] Checking approaching due dates...');
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Find plans where rent due date is within the next 7 days
    const approachingPlans = await db.query(
      `SELECT rsp.*, u.full_name AS tenant_name, u.email AS tenant_email,
              p.title AS property_title
       FROM rent_savings_plans rsp
       JOIN users u ON rsp.tenant_id = u.id
       JOIN properties p ON rsp.property_id = p.id
       WHERE rsp.is_active = TRUE
         AND rsp.status = 'active'
         AND rsp.total_saved > 0
         AND rsp.rent_due_date BETWEEN $1 AND $2`,
      [now, sevenDaysFromNow]
    );

    let withdrawalReminderCount = 0;

    for (const plan of approachingPlans.rows) {
      const totalSaved = Number(plan.total_saved).toLocaleString();
      const dueDate = new Date(plan.rent_due_date).toLocaleDateString();

      await NotificationService.sendNotification(
        plan.tenant_id,
        '🏠 Rent Due Date Approaching!',
        `Your rent for "${plan.property_title}" is due on ${dueDate}. You have ₦${totalSaved} saved. Withdraw now to pay your rent.`,
        'rent_savings_due_reminder',
        plan.id,
        'rent_savings_plan'
      );

      withdrawalReminderCount++;
      logger.info(`[RentSavingsJobs] Due date reminder sent to tenant #${plan.tenant_id} for plan #${plan.id}`);
    }

    logger.info(`[RentSavingsJobs] Due date check complete. Sent ${withdrawalReminderCount} reminders.`);
  } catch (error) {
    logger.error('[RentSavingsJobs] Error in due date check:', error);
  }
}

/**
 * Start all rent savings cron jobs
 */
function startRentSavingsJobs() {
  // Run on the 1st of every month at 9:00 AM
  cron.schedule('0 9 1 * *', async () => {
    logger.info('[RentSavingsJobs] Running monthly contribution check...');
    await checkMissedMonthlyContributions();
  });

  // Run daily at 8:00 AM for approaching due dates
  cron.schedule('0 8 * * *', async () => {
    logger.info('[RentSavingsJobs] Running daily due date check...');
    await checkApproachingDueDates();
  });

  // Also run on startup (after short delay to let DB connect)
  setTimeout(async () => {
    logger.info('[RentSavingsJobs] Running initial checks...');
    await checkMissedMonthlyContributions();
    await checkApproachingDueDates();
  }, 10000);

  logger.info('✅ Rent savings cron jobs started');
}

module.exports = { startRentSavingsJobs, checkMissedMonthlyContributions, checkApproachingDueDates };
