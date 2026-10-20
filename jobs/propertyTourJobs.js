const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { generatePropertyTour } = require('../config/utils/propertyTourService');

/**
 * Automatic property tour videos.
 *
 * Encoding is slow, so it never happens inside the landlord's request. The
 * listing is published immediately and the video is attached a minute or two
 * later by this sweep.
 *
 * Work is tracked in property_tour_jobs so a failure is retried rather than
 * silently dropped, and so a property is not re-encoded on every tick.
 */

const MAX_ATTEMPTS = Math.max(1, Number(process.env.PROPERTY_TOUR_MAX_ATTEMPTS) || 3);
const BATCH_SIZE = Math.max(1, Number(process.env.PROPERTY_TOUR_BATCH_SIZE) || 3);

let schemaReady = false;

const ensureTourJobSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS property_tour_jobs (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (property_id)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_property_tour_jobs_status
      ON property_tour_jobs(status, updated_at ASC)
  `);

  schemaReady = true;
};

/** Queue a property for a tour video. Safe to call more than once. */
const enqueuePropertyTour = async (propertyId) => {
  const id = Number(propertyId);
  if (!Number.isInteger(id) || id <= 0) return false;

  try {
    await ensureTourJobSchema();
    await db.query(
      `INSERT INTO property_tour_jobs (property_id, status)
       VALUES ($1, 'pending')
       ON CONFLICT (property_id) DO NOTHING`,
      [id]
    );
    return true;
  } catch (error) {
    logger.warn(`Could not queue property tour for #${id}: ${error.message}`);
    return false;
  }
};

const claimJobs = async (limit) => {
  // Claim atomically so two pm2 workers never encode the same property.
  const result = await db.query(
    `UPDATE property_tour_jobs
     SET status = 'processing',
         attempts = attempts + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id IN (
       SELECT id FROM property_tour_jobs
       WHERE status = 'pending'
         AND attempts < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, property_id, attempts`,
    [MAX_ATTEMPTS, limit]
  );

  return result.rows;
};

const runPropertyTourJobs = async () => {
  try {
    await ensureTourJobSchema();

    const jobs = await claimJobs(BATCH_SIZE);
    if (!jobs.length) return { processed: 0, succeeded: 0 };

    let succeeded = 0;

    for (const job of jobs) {
      const produced = await generatePropertyTour({
        propertyId: job.property_id,
        logger,
      });

      if (produced) {
        succeeded += 1;
        await db.query(
          `UPDATE property_tour_jobs
           SET status = 'done',
               last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [job.id]
        );
      } else {
        const exhausted = Number(job.attempts) >= MAX_ATTEMPTS;
        await db.query(
          `UPDATE property_tour_jobs
           SET status = $1,
               last_error = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [
            exhausted ? 'failed' : 'pending',
            exhausted
              ? 'Video could not be generated after repeated attempts'
              : 'Attempt did not produce a video; will retry',
            job.id,
          ]
        );
      }
    }

    return { processed: jobs.length, succeeded };
  } catch (error) {
    logger.error('Property tour job error:', error);
    return { processed: 0, succeeded: 0 };
  }
};

let started = false;

const startPropertyTourJobs = () => {
  if (started) return;
  started = true;

  // Only one worker should own the timer in a pm2 cluster.
  if (process.env.pm_id && process.env.pm_id !== '0') return;

  const intervalMs =
    Math.max(30, Number(process.env.PROPERTY_TOUR_TICK_SECONDS) || 120) * 1000;

  const timer = setInterval(() => {
    void runPropertyTourJobs();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  setTimeout(() => {
    void runPropertyTourJobs();
  }, 45000).unref?.();
};

module.exports = {
  startPropertyTourJobs,
  runPropertyTourJobs,
  enqueuePropertyTour,
  ensureTourJobSchema,
  MAX_ATTEMPTS,
};
