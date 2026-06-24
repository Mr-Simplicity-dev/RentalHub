const cron = require('node-cron');
const db = require('../config/middleware/database');
const { sendSMS } = require('../config/utils/smsService');

const BATCH_SIZE = 50;

const isTransientError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('service unavailable') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('5')
  );
};

const processSmsQueue = async () => {
  try {
    const { rows: activated } = await db.query(
      `UPDATE sms_campaigns SET status = 'sending', updated_at = NOW()
       WHERE status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       RETURNING id`
    );

    const { rows: sending } = await db.query(
      `SELECT id, content, sender_name FROM sms_campaigns WHERE status = 'sending'`
    );

    if (sending.length === 0) return;

    let globalCount = 0;

    for (const camp of sending) {
      if (globalCount >= BATCH_SIZE) break;

      const { rows: batch } = await db.query(
        `SELECT id, phone, full_name FROM sms_campaign_recipients
         WHERE campaign_id = $1 AND status = 'pending'
         ORDER BY id LIMIT $2`,
        [camp.id, BATCH_SIZE - globalCount]
      );

      if (batch.length === 0) {
        const stats = await db.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
           FROM sms_campaign_recipients WHERE campaign_id = $1`,
          [camp.id]
        );
        const { sent, failed } = stats.rows[0];
        await db.query(
          `UPDATE sms_campaigns SET status = 'sent', sent_at = NOW(),
           stats = $2, updated_at = NOW() WHERE id = $1`,
          [camp.id, JSON.stringify({ sent, failed })]
        );
        continue;
      }

      globalCount += batch.length;

      for (const rec of batch) {
        try {
          await sendSMS(rec.phone, camp.content);
          await db.query(
            `UPDATE sms_campaign_recipients SET status = 'sent', sent_at = NOW()
             WHERE id = $1`,
            [rec.id]
          );
        } catch (err) {
          const transient = isTransientError(err);
          await db.query(
            `UPDATE sms_campaign_recipients SET status = 'failed',
             error_message = $2, last_error_type = $3
             WHERE id = $1`,
            [rec.id, err.message?.slice(0, 500) || 'Unknown error',
             transient ? 'transient' : 'permanent']
          );
        }
      }
    }
  } catch (err) {
    console.error('SMS queue processor error:', err.message);
  }
};

exports.startSmsMarketingJobs = () => {
  cron.schedule('* * * * *', () => {
    processSmsQueue();
  });
  console.log('SMS marketing queue processor started');
};
