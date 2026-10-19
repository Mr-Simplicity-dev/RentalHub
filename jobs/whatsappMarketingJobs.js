const logger = require('../config/utils/logger');
const cron = require('node-cron');
const db = require('../config/middleware/database');
const { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia } = require('../config/utils/whatsappService');
const { ensureSchema, getDailySendLimit } = require('../services/whatsappMarketingService');

const BATCH_SIZE = 25;
const SEND_DELAY_MS = Number(process.env.WHATSAPP_CAMPAIGN_DELAY_MS || 300);
const RATE_LIMIT_STREAK_LIMIT = 3;

// Meta limits business-initiated conversations per rolling 24h (the unverified
// tier starts around 250/day). Rather than blast the whole audience in one run,
// we spend a fixed budget per UTC day and let the cron resume tomorrow until the
// queue drains. The limit itself lives in whatsappMarketingService so the panel
// and the sender never disagree.
const dailySendLimit = getDailySendLimit;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (message = '') => {
  const msg = String(message).toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('130429') ||
    msg.includes('frequency')
  );
};

const isTransientError = (message = '') => {
  const msg = String(message).toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('service unavailable') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  );
};

const countSentToday = async () => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS sent FROM whatsapp_campaign_recipients
     WHERE status = 'sent'
       AND sent_at >= date_trunc('day', (NOW() AT TIME ZONE 'UTC'))`
  );
  return rows[0]?.sent || 0;
};

const finalizeCampaign = async (campaignId) => {
  const stats = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM whatsapp_campaign_recipients WHERE campaign_id = $1`,
    [campaignId]
  );
  const { sent, failed } = stats.rows[0];
  await db.query(
    `UPDATE whatsapp_campaigns SET status = 'sent', sent_at = NOW(),
     stats = $2, updated_at = NOW() WHERE id = $1`,
    [campaignId, JSON.stringify({ sent, failed })]
  );
};

const processWhatsappQueue = async () => {
  try {
    await ensureSchema();

    if (dailySendLimit() <= 0) return;

    const sentToday = await countSentToday();
    let budget = dailySendLimit() - sentToday;

    if (budget <= 0) {
      logger.info(`WhatsApp daily send budget reached (${sentToday}/${dailySendLimit()}); resuming next UTC day`);
      return;
    }

    // 'sending' campaigns are re-picked so a queue that hit yesterday's budget
    // keeps draining today instead of stalling mid-campaign.
    const { rows: activated } = await db.query(
      `UPDATE whatsapp_campaigns SET status = 'sending', updated_at = NOW()
       WHERE status IN ('queued', 'sending')
       RETURNING id, kind, template_name, template_language, template_params, content,
                 media_type, media_url, header_media_type, header_media_url`
    );

    if (activated.length === 0) return;

    for (const camp of activated) {
      if (budget <= 0) break;

      const { rows: batch } = await db.query(
        `SELECT id, phone FROM whatsapp_campaign_recipients
         WHERE campaign_id = $1 AND status = 'pending'
         ORDER BY id LIMIT $2`,
        [camp.id, Math.min(BATCH_SIZE, budget)]
      );

      if (batch.length === 0) {
        await finalizeCampaign(camp.id);
        continue;
      }

      let rateLimitStreak = 0;

      for (const rec of batch) {
        if (budget <= 0) break;

        if (rateLimitStreak >= RATE_LIMIT_STREAK_LIMIT) {
          await db.query(
            `UPDATE whatsapp_campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1`,
            [camp.id]
          );
          logger.warn(`WhatsApp campaign ${camp.id} paused after repeated rate limiting`);
          break;
        }

        let result;
        if (camp.kind === 'template') {
          result = await sendWhatsAppTemplate({
            to: rec.phone,
            templateName: camp.template_name,
            language: camp.template_language,
            params: camp.template_params,
            headerMedia: camp.header_media_url
              ? { type: camp.header_media_type, link: camp.header_media_url }
              : null,
          });
        } else if (camp.media_url) {
          result = await sendWhatsAppMedia({
            to: rec.phone,
            mediaType: camp.media_type,
            link: camp.media_url,
            caption: camp.content || '',
          });
        } else {
          result = await sendWhatsAppText({ to: rec.phone, message: camp.content });
        }

        // Every attempt spends one unit of the day's budget, successful or not.
        budget -= 1;

        if (result.success) {
          rateLimitStreak = 0;
          await db.query(
            `UPDATE whatsapp_campaign_recipients SET status = 'sent', sent_at = NOW(), message_id = $2
             WHERE id = $1`,
            [rec.id, result.messageId || null]
          );
        } else {
          const rateLimited = isRateLimitError(result.message);
          const transient = rateLimited || isTransientError(result.message);
          if (rateLimited) rateLimitStreak++;
          await db.query(
            `UPDATE whatsapp_campaign_recipients SET status = 'failed', error_message = $2, last_error_type = $3
             WHERE id = $1`,
            [rec.id, String(result.message || 'Unknown error').slice(0, 500), transient ? 'transient' : 'permanent']
          );
        }

        await sleep(SEND_DELAY_MS);
      }
    }
  } catch (err) {
    logger.error('WhatsApp queue processor error:', err.message);
  }
};

exports.startWhatsappMarketingJobs = () => {
  cron.schedule('* * * * *', () => {
    processWhatsappQueue();
  });
  logger.info('WhatsApp marketing queue processor started');
};

exports.processWhatsappQueue = processWhatsappQueue;
exports.isRateLimitError = isRateLimitError;
exports.isTransientError = isTransientError;
exports.countSentToday = countSentToday;
exports.dailySendLimit = dailySendLimit;
