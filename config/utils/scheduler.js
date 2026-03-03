const { checkAndEscalateDisputes } = require('../services/disputeEscalationService');

const startScheduler = () => {
  console.log('Dispute escalation scheduler started');

  // Run every 24 hours
  setInterval(async () => {
    await checkAndEscalateDisputes();
  }, 24 * 60 * 60 * 1000);
};

module.exports = startScheduler;