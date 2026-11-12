const {timeout:setTimeout}=require('../services/backgroundJobRuntime');
const {interval:setInterval}=require('../services/backgroundJobRuntime');
const logger = require('../config/utils/logger');

/**
 * Every server worker may tick the ticket monitor; its PostgreSQL lock permits
 * only one sweep. The legacy message sweep stays on the first app instance.
 */

let started = false;

const startSupportReassignJobs = () => {
  if (started) return;
  started = true;



  const intervalMs = Math.max(10, Number(process.env.SUPPORT_REASSIGN_TICK_SECONDS) || 20) * 1000;

  const run = async () => {
    try {
      const { runResponseMonitor } = require('../services/supportResponseMonitor');
      const { reassignUnansweredEscalations } = require('../services/messageService');
      await runResponseMonitor();
      await reassignUnansweredEscalations();
    } catch (error) {
      logger.error('Support reassign job error:', error);
    }
  };

  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  setTimeout(run, 15000).unref?.();
};

module.exports = { startSupportReassignJobs };
