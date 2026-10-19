const logger = require('../config/utils/logger');
const cron = require('node-cron');
const db = require('../config/middleware/database');
const { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia } = require('../config/utils/whatsappService');
const { ensureSchema } = require('../services/whatsappMarketingService');

const BATCH_SIZE = 25;
const SEND_DELAY_MS = Number(process.env.WHATSAPP_CAMPAIGN_DELAY_MS || 300);
const RATE_LIMIT_STREAK_LIMIT = 3;

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
    const { rows: activated } = await db.query(
      `UPDATE whatsapp_campaigns SET status = 'sending', updated_at = NOW()
       WHERE status = 'queued'
       RETURNING id, kind, template_name, template_language, template_params, content,
                 media_type, media_url, header_media_type, header_media_url`
    );

    if (activated.length === 0) return;

    let globalCount = 0;

    for (const camp of activated) {
      if (globalCount >= BATCH_SIZE) break;

      const { rows: batch } = await db.query(
        `SELECT id, phone FROM whatsapp_campaign_recipients
         WHERE campaign_id = $1 AND status = 'pending'
         ORDER BY id LIMIT $2`,
        [camp.id, BATCH_SIZE - globalCount]
      );

      if (batch.length === 0) {
        await finalizeCampaign(camp.id);
        continue;
      }

      globalCount += batch.length;
      let rateLimitStreak = 0;

      for (const rec of batch) {
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
