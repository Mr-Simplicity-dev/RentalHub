const logger = require('../config/utils/logger');

/**
 * The 90-second first-response rule needs a fast tick, so it does not live in
 * the five-minute SLA sweep. It is deliberately its own tiny loop.
 *
 * In a pm2 cluster every worker would otherwise run the same scan. The tick is
 * cheap and the updates are guarded by timestamps, but to keep one worker per
 * job the interval starts only in the primary process when a cluster is used.
 */

let started = false;

const startSupportReassignJobs = () => {
  if (started) return;
  started = true;

  // Only the first worker (or a single-process run) owns the timer.
  if (process.env.pm_id && process.env.pm_id !== '0') return;

  const intervalMs = Math.max(10, Number(process.env.SUPPORT_REASSIGN_TICK_SECONDS) || 20) * 1000;

  const run = async () => {
    try {
      const { reassignUnansweredTickets } = require('../services/supportReassignService');
      const { reassignUnansweredEscalations } = require('../services/messageService');
      await reassignUnansweredTickets();
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
