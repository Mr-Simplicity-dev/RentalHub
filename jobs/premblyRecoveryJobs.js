const logger = require('../config/utils/logger');
const { runPremblyRecoveryCycle } = require('../services/premblyRecoveryService');

let started = false;

const startPremblyRecoveryJobs = () => {
  if (started || process.env.PREMBLY_RECOVERY_DISABLED === 'true') return;
  started = true;

  const intervalMs = Math.max(
    Number(process.env.PREMBLY_RECOVERY_INTERVAL_MS) || 60_000,
    30_000
  );
  const batchSize = Math.max(
    Number(process.env.PREMBLY_RECOVERY_BATCH_SIZE) || 20,
    1
  );
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await runPremblyRecoveryCycle({ limit: batchSize });
      if (summary.claimed > 0) {
        logger.info('Prembly recovery cycle completed', summary);
      }
    } catch (error) {
      logger.error('Prembly recovery cycle failed:', error.message);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(run, 10_000);
  initialTimer.unref?.();
  const interval = setInterval(run, intervalMs);
  interval.unref?.();
  logger.info(`Prembly recovery scheduler started (${intervalMs}ms)`);
};

module.exports = { startPremblyRecoveryJobs };
