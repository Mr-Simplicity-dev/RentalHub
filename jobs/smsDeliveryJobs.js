const cron = require('node-cron');
const { processPendingSmsFallbacks } = require('../config/utils/smsService');

let smsDeliveryJobsStarted = false;

async function runSmsDeliveryFallbackCheck() {
  try {
    const summary = await processPendingSmsFallbacks();

    if (!summary.disabled && (summary.fallbackSent || summary.failed)) {
      console.log('SMS delivery fallback check completed', summary);
    }
  } catch (error) {
    console.error('SMS delivery fallback check failed:', error.message);
  }
}

function startSmsDeliveryJobs() {
  if (smsDeliveryJobsStarted) {
    return;
  }

  smsDeliveryJobsStarted = true;

  if (String(process.env.SMS_DELIVERY_JOBS_DISABLED || '').toLowerCase() === 'true') {
    console.log('SMS delivery fallback jobs disabled');
    return;
  }

  const schedule = process.env.SMS_FALLBACK_CRON || '* * * * *';
  cron.schedule(schedule, runSmsDeliveryFallbackCheck);
  setTimeout(runSmsDeliveryFallbackCheck, 15000);
  console.log(`SMS delivery fallback job scheduled (${schedule})`);
}

module.exports = {
  startSmsDeliveryJobs,
  runSmsDeliveryFallbackCheck,
};
