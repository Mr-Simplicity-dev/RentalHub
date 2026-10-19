const db = require('../config/middleware/database');
const { sendWhatsAppText, sendWhatsAppTemplate } = require('../config/utils/whatsappService');

let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      kind VARCHAR(20) NOT NULL CHECK (kind IN ('template', 'text')),
      template_name VARCHAR(128),
      template_language VARCHAR(20) DEFAULT 'en',
      template_params JSONB DEFAULT '[]'::jsonb,
      content TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      recipient_filter JSONB DEFAULT '{}'::jsonb,
      sent_at TIMESTAMP,
      stats JSONB DEFAULT '{"sent":0,"failed":0}'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      phone VARCHAR(20) NOT NULL,
      full_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      message_id VARCHAR(80),
      sent_at TIMESTAMP,
      error_message TEXT,
      last_error_type VARCHAR(20),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_marketing_operations (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER,
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_wcr_campaign ON whatsapp_campaign_recipients (campaign_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_wcr_status ON whatsapp_campaign_recipients (status)`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_wmo_created ON whatsapp_marketing_operations(created_at DESC)
  `);

  await db.query(`ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS media_type VARCHAR(20)`);
  await db.query(`ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS media_url TEXT`);
  await db.query(`ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS header_media_type VARCHAR(20)`);
  await db.query(`ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS header_media_url TEXT`);

  schemaReady = true;
};

const getActorName = (user = {}) =>
  user.full_name || user.name || user.email || user.username || 'Admin';

const requireActionNote = (req, res, message) => {
  const note = String(req.body?.reason || req.body?.note || '').trim();
  if (!note) {
    res.status(400).json({ success: false, message });
    return null;
  }
  return note;
};

const recordOperation = async ({ actor, entityType, entityId, eventType, note = '', metadata = {} }) => {
  await db.query(
    `INSERT INTO whatsapp_marketing_operations (
       actor_id, actor_name, entity_type, entity_id, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      actor?.id || null,
      getActorName(actor),
      entityType,
      entityId || null,
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.user_type === 'super_admin' || req.user?.is_admin) return next();
  return res.status(403).json({ success: false, message: 'Super admin access required' });
};

// Meta only accepts E.164 recipients: 0803... → 234803..., bare 803... → 234803...
const normalizeWhatsphone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  let national = digits;
  if (digits.startsWith('234')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  if (national.length !== 10) return null;
  return `234${national}`;
};

const buildAudienceQuery = (filter = {}) => {
  const where = [`phone IS NOT NULL`, `phone <> ''`];
  const params = [];
  if (filter.scope === 'user_type' && filter.user_type) {
    params.push(String(filter.user_type).trim());
    where.push(`user_type = $${params.length}`);
  }
  return { whereClause: `WHERE ${where.join(' AND ')}`, params };
};

const MEDIA_TYPES = ['image', 'video', 'document'];

// Uploaded campaign media is served back to Meta through a public API route,
// so only server-generated random filenames may ever be resolved from disk.
const SAFE_MEDIA_FILENAME = /^wa_\d+_[a-f0-9]{24}\.(jpg|png|webp|mp4|3gp)$/;

const isSafeMediaFilename = (name) => SAFE_MEDIA_FILENAME.test(String(name || ''));

// Media is sent to Meta as a public https:// link that Meta downloads, so the
// URL must already be reachable from the internet (uploads are hosted publicly).
const normalizeMedia = (mediaType, mediaUrl, label) => {
  const type = String(mediaType || '').toLowerCase().trim();
  const url = String(mediaUrl || '').trim();
  if (!type && !url) return { type: null, url: null };
  if (!type || !url) {
    return { error: `${label}: choose a media type and provide the file or link` };
  }
  if (!MEDIA_TYPES.includes(type)) {
    return { error: `${label}: media type must be image, video or document` };
  }
  if (!/^https:\/\/\S+$/i.test(url)) {
    return { error: `${label}: media must be a public https:// link` };
  }
  return { type, url };
};

const validateCampaignPayload = (body = {}) => {
  const name = String(body.name || '').trim();
  if (!name || name.length > 200) {
    return { error: 'A campaign name of at most 200 characters is required' };
  }

  const kind = body.kind === 'template' || body.kind === 'text' ? body.kind : null;
  if (!kind) {
    return { error: "Message type must be 'template' or 'text'" };
  }

  const media = normalizeMedia(body.media_type, body.media_url, 'Media attachment');
  if (media.error) return { error: media.error };
  const header = normalizeMedia(body.header_media_type, body.header_media_url, 'Template header media');
  if (header.error) return { error: header.error };

  if (kind === 'template') {
    const templateName = String(body.template_name || '').trim();
    if (!/^[A-Za-z0-9_]{1,64}$/.test(templateName)) {
      return { error: 'A valid Meta template name is required (letters, numbers and underscores only)' };
    }
    const templateLanguage = String(body.template_language || 'en').trim();
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(templateLanguage)) {
      return { error: 'Template language must look like en or en_US' };
    }
    const templateParams = (Array.isArray(body.template_params) ? body.template_params : [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 10);
    return {
      value: {
        name,
        kind,
        template_name: templateName,
        template_language: templateLanguage,
        template_params: templateParams,
        content: null,
        media_type: null,
        media_url: null,
        header_media_type: header.type,
        header_media_url: header.url,
      },
    };
  }

  const content = String(body.content || '').trim();
  if (!media.url && !content) {
    return { error: 'A message or a media attachment is required' };
  }
  if (content.length > 1000) {
    return { error: 'A message or caption of at most 1000 characters is required' };
  }
  return {
    value: {
      name,
      kind,
      template_name: null,
      template_language: null,
      template_params: [],
      content: content || null,
      media_type: media.type,
      media_url: media.url,
      header_media_type: null,
      header_media_url: null,
    },
  };
};

const getDashboardStats = async (req, res) => {
  try {
    await ensureSchema();
    const campaigns = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
       FROM whatsapp_campaigns`
    );
    const messages = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM whatsapp_campaign_recipients`
    );
    res.json({
      success: true,
      data: {
        campaigns: campaigns.rows[0],
        messages: messages.rows[0],
      },
    });
  } catch (error) {
    req.logger.error('WhatsApp marketing stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp marketing stats' });
  }
};

const getAudienceEstimate = async (req, res) => {
  try {
    const { whereClause, params } = buildAudienceQuery(req.query || {});
    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM users ${whereClause}`,
      params
    );
    res.json({ success: true, data: { count: result.rows[0].count } });
  } catch (error) {
    req.logger.error('WhatsApp audience estimate error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to estimate audience' });
  }
};

const createCampaign = async (req, res) => {
  try {
    await ensureSchema();

    const validated = validateCampaignPayload(req.body || {});
    if (validated.error) {
      return res.status(400).json({ success: false, message: validated.error });
    }

    const filter = {
      scope: req.body?.recipient_filter?.scope === 'user_type' ? 'user_type' : 'all',
      user_type: req.body?.recipient_filter?.user_type || null,
    };

    const { whereClause, params } = buildAudienceQuery(filter);
    const { rows: users } = await db.query(
      `SELECT id, phone, full_name FROM users ${whereClause}`,
      params
    );

    const byPhone = new Map();
    let skipped = 0;
    for (const user of users) {
      const phone = normalizeWhatsphone(user.phone);
      if (!phone || byPhone.has(phone)) {
        skipped++;
        continue;
      }
      byPhone.set(phone, { userId: user.id, fullName: user.full_name || null });
    }

    if (byPhone.size === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users with valid phone numbers match this audience',
      });
    }

    const campaign = await db.query(
      `INSERT INTO whatsapp_campaigns
         (name, kind, template_name, template_language, template_params, content, status,
          media_type, media_url, header_media_type, header_media_url, recipient_filter, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', $7, $8, $9, $10, $11::jsonb, $12)
       RETURNING *`,
      [
        validated.value.name,
        validated.value.kind,
        validated.value.template_name,
        validated.value.template_language,
        JSON.stringify(validated.value.template_params),
        validated.value.content,
        validated.value.media_type,
        validated.value.media_url,
        validated.value.header_media_type,
        validated.value.header_media_url,
        JSON.stringify(filter),
        req.user?.id || null,
      ]
    );

    const campaignId = campaign.rows[0].id;
    const entries = [...byPhone.entries()];
    let inserted = 0;

    for (let i = 0; i < entries.length; i += 250) {
      const chunk = entries.slice(i, i + 250);
      const chunkParams = [];
      const values = chunk.map(([phone, meta]) => {
        const base = chunkParams.length;
        chunkParams.push(campaignId, phone, meta.userId, meta.fullName);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });
      const result = await db.query(
        `INSERT INTO whatsapp_campaign_recipients (campaign_id, phone, user_id, full_name)
         VALUES ${values.join(', ')}`,
        chunkParams
      );
      inserted += result.rowCount ?? chunk.length;
    }

    await recordOperation({
      actor: req.user,
      entityType: 'whatsapp_campaign',
      entityId: campaignId,
      eventType: 'campaign_created',
      metadata: { recipients: inserted, skipped, filter },
    });

    res.status(201).json({
      success: true,
      data: { ...campaign.rows[0], recipients: inserted, skipped },
    });
  } catch (error) {
    req.logger.error('Create WhatsApp campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create WhatsApp campaign' });
  }
};

const listCampaigns = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.kind, c.template_name, c.status, c.stats, c.sent_at, c.created_at,
              u.full_name AS created_by_name,
              COUNT(r.id)::int AS total_recipients,
              COUNT(r.id) FILTER (WHERE r.status = 'sent')::int AS sent_count,
              COUNT(r.id) FILTER (WHERE r.status = 'failed')::int AS failed_count,
              COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending_count
       FROM whatsapp_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN whatsapp_campaign_recipients r ON r.campaign_id = c.id
       GROUP BY c.id, u.full_name
       ORDER BY c.created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    req.logger.error('List WhatsApp campaigns error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp campaigns' });
  }
};

const getCampaignStats = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const campaign = await db.query(
      `SELECT id, name, kind, template_name, template_language, template_params, content,
              media_type, media_url, header_media_type, header_media_url,
              status, stats, sent_at, created_at
       FROM whatsapp_campaigns WHERE id = $1`,
      [id]
    );
    if (!campaign.rows.length) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const counts = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM whatsapp_campaign_recipients WHERE campaign_id = $1`,
      [id]
    );

    const failures = await db.query(
      `SELECT phone, full_name, error_message
       FROM whatsapp_campaign_recipients
       WHERE campaign_id = $1 AND status = 'failed'
       ORDER BY id DESC LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      data: {
        campaign: campaign.rows[0],
        counts: counts.rows[0],
        recent_failures: failures.rows,
      },
    });
  } catch (error) {
    req.logger.error('WhatsApp campaign stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load campaign stats' });
  }
};

const sendCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const note = requireActionNote(req, res, 'A launch approval note is required to queue this campaign');
    if (!note) return;

    const { id } = req.params;
    const result = await db.query(
      `UPDATE whatsapp_campaigns SET status = 'queued', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('draft', 'paused')
       RETURNING id, status`,
      [id]
    );

    if (!result.rows.length) {
      const exists = await db.query(`SELECT status FROM whatsapp_campaigns WHERE id = $1`, [id]);
      if (!exists.rows.length) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      return res.status(400).json({
        success: false,
        message: `A campaign with status '${exists.rows[0].status}' cannot be queued`,
      });
    }

    await recordOperation({
      actor: req.user,
      entityType: 'whatsapp_campaign',
      entityId: Number(id),
      eventType: 'campaign_queued',
      note,
    });

    res.json({ success: true });
  } catch (error) {
    req.logger.error('Queue WhatsApp campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to queue WhatsApp campaign' });
  }
};

const retryCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const note = requireActionNote(req, res, 'A retry reason is required');
    if (!note) return;

    const { id } = req.params;
    const campaign = await db.query(`SELECT id, status FROM whatsapp_campaigns WHERE id = $1`, [id]);
    if (!campaign.rows.length) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (!['sent', 'paused'].includes(campaign.rows[0].status)) {
      return res.status(400).json({
        success: false,
        message: `Only sent or paused campaigns can be retried (status is '${campaign.rows[0].status}')`,
      });
    }

    const reset = await db.query(
      `UPDATE whatsapp_campaign_recipients SET status = 'pending', error_message = NULL, last_error_type = NULL
       WHERE campaign_id = $1 AND status = 'failed'
       RETURNING id`,
      [id]
    );
    const requeued = await db.query(
      `UPDATE whatsapp_campaigns SET status = 'queued', stats = '{"sent":0,"failed":0}'::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    await recordOperation({
      actor: req.user,
      entityType: 'whatsapp_campaign',
      entityId: Number(id),
      eventType: 'campaign_retry',
      note,
      metadata: { requeued_failures: reset.rows.length, queued: requeued.rows.length > 0 },
    });

    res.json({ success: true, data: { requeued_failures: reset.rows.length } });
  } catch (error) {
    req.logger.error('Retry WhatsApp campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to retry WhatsApp campaign' });
  }
};

const deleteCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const note = requireActionNote(req, res, 'A deletion reason is required');
    if (!note) return;

    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM whatsapp_campaigns WHERE id = $1 AND status <> 'sending' RETURNING id`,
      [id]
    );
    if (!result.rows.length) {
      const exists = await db.query(`SELECT id FROM whatsapp_campaigns WHERE id = $1`, [id]);
      if (!exists.rows.length) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      return res.status(400).json({
        success: false,
        message: 'A campaign that is currently sending cannot be deleted',
      });
    }

    await recordOperation({
      actor: req.user,
      entityType: 'whatsapp_campaign',
      entityId: Number(id),
      eventType: 'campaign_deleted',
      note,
    });

    res.json({ success: true });
  } catch (error) {
    req.logger.error('Delete WhatsApp campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete WhatsApp campaign' });
  }
};

module.exports = {
  ensureSchema,
  requireSuperAdmin,
  normalizeWhatsphone,
  isSafeMediaFilename,
  validateCampaignPayload,
  getDashboardStats,
  getAudienceEstimate,
  createCampaign,
  listCampaigns,
  getCampaignStats,
  sendCampaign,
  retryCampaign,
  deleteCampaign,
};
