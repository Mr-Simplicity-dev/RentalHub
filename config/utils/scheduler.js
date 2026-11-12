const {interval:setInterval,once}=require('../../services/backgroundJobRuntime');
const logger = require('./logger');
const { checkAndEscalateDisputes } = require('../../services/disputeEscalationService');

function startScheduler() {
  logger.info('Dispute escalation scheduler started');

  const runEscalation = async () => {
    try {
      await checkAndEscalateDisputes();
      logger.info('Dispute escalation check completed');
    } catch (err) {
      logger.error('Dispute escalation error:', err.message);
    }
  };

  // Run immediately once on server start
  void once('dispute-escalation:startup',runEscalation);

  // Then run every 24 hours
  setInterval(runEscalation, 24 * 60 * 60 * 1000);
}

module.exports = startScheduler;