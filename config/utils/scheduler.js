const { checkAndEscalateDisputes } = require('../../services/disputeEscalationService');

function startScheduler() {
  console.log('Dispute escalation scheduler started');

  const runEscalation = async () => {
    try {
      await checkAndEscalateDisputes();
      console.log('Dispute escalation check completed');
    } catch (err) {
      console.error('Dispute escalation error:', err.message);
    }
  };

  // Run immediately once on server start
  runEscalation();

  // Then run every 24 hours
  setInterval(runEscalation, 24 * 60 * 60 * 1000);
}

module.exports = startScheduler;