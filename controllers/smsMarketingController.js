const db = require('../config/middleware/database');
const { sendSMS } = require('../config/utils/smsService');

const BATCH_SIZE = 50;

let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_subscribers (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      full_name VARCHAR(255),
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      source_id INTEGER,
      user_type VARCHAR(50),
      tags TEXT[] DEFAULT '{}',
      subscribed BOOLEAN NOT NULL DEFAULT TRUE,
      unsubscribed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_sms_subscribers_phone UNIQUE (phone)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      category VARCHAR(50) DEFAULT 'general',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_campaigns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sender_name VARCHAR(160),
      template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      recipient_filter JSONB DEFAULT '{}',
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      stats JSONB DEFAULT '{"sent":0,"failed":0}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
      subscriber_id INTEGER REFERENCES sms_subscribers(id) ON DELETE SET NULL,
      phone VARCHAR(20) NOT NULL,
      full_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_sms_subscribers_subscribed ON sms_subscribers (subscribed)`);
  await db.query(`ALTER TABLE sms_campaign_recipients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_scr_campaign ON sms_campaign_recipients (campaign_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_scr_status ON sms_campaign_recipients (status)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sms_marketing_operations (
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

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_marketing_operations_entity
      ON sms_marketing_operations(entity_type, entity_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_marketing_operations_created
      ON sms_marketing_operations(created_at DESC)
  `);

  schemaReady = true;
};

const getActorName = (user = {}) =>
  user.full_name || user.name || user.email || user.username || 'Admin';

const requireActionNote = (req, res, message) => {
  const note = String(req.body?.reason || req.body?.note || req.body?.approval_note || '').trim();
  if (!note) {
    res.status(400).json({ success: false, message });
    return null;
  }
  return note;
};

const recordOperation = async ({
  actor,
  entityType,
  entityId,
  eventType,
  note = '',
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO sms_marketing_operations (
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

// ─── Subscribers ────────────────────────────────────────────────────────────

const listSubscribers = async (req, res) => {
  try {
    await ensureSchema();
    const { search, source, subscribed, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    let idx = 1;

    if (search) {
      where.push(`(s.phone ILIKE $${idx} OR s.full_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (source) {
      where.push(`s.source = $${idx}`);
      params.push(source);
      idx++;
    }
    if (subscribed !== undefined && subscribed !== '') {
      where.push(`s.subscribed = $${idx}`);
      params.push(subscribed === 'true' || subscribed === '1');
      idx++;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM sms_subscribers s ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const { rows } = await db.query(
      `SELECT s.* FROM sms_subscribers s ${whereClause} ORDER BY s.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({ success: true, data: rows, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total } });
  } catch (error) {
    console.error('List SMS subscribers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS subscribers' });
  }
};

const syncSubscribers = async (req, res) => {
  try {
    await ensureSchema();
    let added = 0;
    let updated = 0;

    const users = await db.query(
      `SELECT id, phone, full_name, user_type FROM users WHERE phone IS NOT NULL AND phone != ''`
    );

    for (const user of users.rows) {
      const existing = await db.query(
        `SELECT id, full_name, user_type FROM sms_subscribers WHERE phone = $1 AND source = 'user'`,
        [user.phone]
      );

      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE sms_subscribers SET full_name = $1, user_type = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [user.full_name, user.user_type, existing.rows[0].id]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO sms_subscribers (phone, full_name, source, source_id, user_type, subscribed)
           VALUES ($1, $2, 'user', $3, $4, TRUE)
           ON CONFLICT (phone) DO NOTHING`,
          [user.phone, user.full_name, user.id, user.user_type]
        );
        added++;
      }
    }

    res.json({ success: true, data: { added, updated, total: added + updated } });
  } catch (error) {
    console.error('Sync SMS subscribers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to sync SMS subscribers' });
  }
};

const addSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { phone, full_name, source = 'manual', user_type, tags } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const result = await db.query(
      `INSERT INTO sms_subscribers (phone, full_name, source, user_type, tags, subscribed)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (phone) DO UPDATE SET
         full_name = COALESCE($2, sms_subscribers.full_name),
         subscribed = TRUE,
         unsubscribed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [phone.trim(), full_name || null, source, user_type || null, tags || []]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Add SMS subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add SMS subscriber' });
  }
};

const updateSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { full_name, user_type, tags, subscribed } = req.body;

    const result = await db.query(
      `UPDATE sms_subscribers SET
        full_name = COALESCE($1, full_name),
        user_type = COALESCE($2, user_type),
        tags = COALESCE($3, tags),
        subscribed = COALESCE($4, subscribed),
        unsubscribed_at = CASE WHEN $4 = FALSE THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [full_name || null, user_type || null, tags || null, subscribed !== undefined ? subscribed : null, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update SMS subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update SMS subscriber' });
  }
};

const deleteSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const reason = requireActionNote(req, res, 'A subscriber removal reason is required');
    if (!reason) return;

    const result = await db.query(
      `DELETE FROM sms_subscribers WHERE id = $1 RETURNING id, phone, full_name, source, user_type, subscribed`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    await recordOperation({
      actor: req.user,
      entityType: 'subscriber',
      entityId: result.rows[0].id,
      eventType: 'subscriber_removed',
      note: reason,
      metadata: { subscriber: result.rows[0] },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete SMS subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete SMS subscriber' });
  }
};

// ─── Templates ──────────────────────────────────────────────────────────────

const listTemplates = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT t.*, u.full_name AS created_by_name
       FROM sms_templates t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List SMS templates error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS templates' });
  }
};

const createTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { name, description, content, category } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Template name is required' });

    const result = await db.query(
      `INSERT INTO sms_templates (name, description, content, category, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), description || null, content || '', category || 'general', req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create SMS template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create SMS template' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { name, description, content, category } = req.body;

    const result = await db.query(
      `UPDATE sms_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        content = COALESCE($3, content),
        category = COALESCE($4, category),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [name || null, description !== undefined ? description : null, content || null, category || null, id]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update SMS template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update SMS template' });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const reason = requireActionNote(req, res, 'A template deletion reason is required');
    if (!reason) return;

    const result = await db.query(
      `DELETE FROM sms_templates
       WHERE id = $1 AND is_system = FALSE
       RETURNING id, name, category, is_system, created_by`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found or is system-protected' });

    await recordOperation({
      actor: req.user,
      entityType: 'template',
      entityId: result.rows[0].id,
      eventType: 'template_deleted',
      note: reason,
      metadata: { template: result.rows[0] },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete SMS template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete SMS template' });
  }
};

// ─── Campaigns ──────────────────────────────────────────────────────────────

const listCampaigns = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT c.*, u.full_name AS created_by_name,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM sms_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM sms_marketing_operations
           WHERE entity_type = 'campaign' AND entity_id = c.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       ORDER BY c.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List SMS campaigns error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS campaigns' });
  }
};

const createCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { name, content, sender_name, template_id, recipient_filter, scheduled_at } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Campaign name is required' });

    const result = await db.query(
      `INSERT INTO sms_campaigns (name, content, sender_name, template_id, recipient_filter, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name.trim(), content || '',
        sender_name || null, template_id || null,
        recipient_filter || {}, scheduled_at || null, req.user.id
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create SMS campaign' });
  }
};

const updateCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const fields = req.body;

    const check = await db.query(`SELECT status FROM sms_campaigns WHERE id = $1`, [id]);
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ success: false, message: 'Can only edit draft campaigns' });

    const setClauses = [];
    const params = [id];
    let idx = 2;

    const allowedColumns = new Set(['name', 'content', 'sender_name', 'recipient_filter', 'scheduled_at', 'max_retries']);
    for (const [key, value] of Object.entries(fields)) {
      if (allowedColumns.has(key)) {
        setClauses.push(`${key} = $${idx}`);
        params.push(key === 'recipient_filter' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, message: 'No valid fields to update' });

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    const { rows } = await db.query(
      `UPDATE sms_campaigns SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Update SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update SMS campaign' });
  }
};

const deleteCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const reason = requireActionNote(req, res, 'A campaign deletion reason is required');
    if (!reason) return;

    const check = await db.query(
      `SELECT id, name, status, stats, created_by FROM sms_campaigns WHERE id = $1`,
      [id]
    );
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (check.rows[0].status === 'sending' || check.rows[0].status === 'sent') {
      return res.status(400).json({ success: false, message: 'Cannot delete a sending or sent campaign' });
    }
    await db.query(`DELETE FROM sms_campaigns WHERE id = $1`, [id]);

    await recordOperation({
      actor: req.user,
      entityType: 'campaign',
      entityId: Number(id),
      eventType: 'campaign_deleted',
      note: reason,
      metadata: { campaign: check.rows[0] },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete SMS campaign' });
  }
};

// ─── Dashboard Stats ────────────────────────────────────────────────────────

const getDashboardStats = async (req, res) => {
  try {
    await ensureSchema();

    const subscriberCount = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE subscribed = TRUE)::int AS active FROM sms_subscribers`
    );
    const campaignCount = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'sent')::int AS sent FROM sms_campaigns`
    );
    const monthlySent = await db.query(
      `SELECT COALESCE(SUM((stats->>'sent')::int), 0)::int AS total_sent
       FROM sms_campaigns WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days'`
    );

    const recentCampaigns = await db.query(
      `SELECT c.id, c.name, c.status, c.sent_at, c.stats, u.full_name AS created_by_name
       FROM sms_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        subscribers: subscriberCount.rows[0],
        campaigns: campaignCount.rows[0],
        monthlySent: monthlySent.rows[0].total_sent,
        recentCampaigns: recentCampaigns.rows,
      },
    });
  } catch (error) {
    console.error('SMS marketing stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS stats' });
  }
};

const importSubscribers = async (req, res) => {
  try {
    await ensureSchema();
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ success: false, message: 'No phone numbers provided' });
    }

    const normalized = phones
      .map((p) => String(p).replace(/[\s-]/g, '').trim())
      .filter((p) => p.length >= 10 && /^\d+$/.test(p));

    if (normalized.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid phone numbers found' });
    }

    let added = 0;
    let skipped = 0;

    for (const phone of normalized) {
      await db.query(
        `INSERT INTO sms_subscribers (phone, source, subscribed)
         VALUES ($1, 'import', TRUE)
         ON CONFLICT (phone) DO UPDATE SET
           subscribed = TRUE,
           unsubscribed_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [phone]
      );
      added++;
    }

    const total = await db.query(
      `SELECT COUNT(*)::int AS total FROM sms_subscribers WHERE source = 'import'`
    );

    res.json({
      success: true,
      data: {
        added,
        skipped: phones.length - normalized.length,
        totalImport: total.rows[0].total,
      },
    });
  } catch (error) {
    console.error('Import SMS subscribers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to import SMS subscribers' });
  }
};

const sendCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { max_retries } = req.body;
    const approvalNote = requireActionNote(req, res, 'A launch approval note is required');
    if (!approvalNote) return;

    const campaign = await db.query(`SELECT * FROM sms_campaigns WHERE id = $1`, [id]);
    if (!campaign.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const c = campaign.rows[0];
    if (c.status !== 'draft') return res.status(400).json({ success: false, message: `Campaign is already ${c.status}` });

    const filter = c.recipient_filter || {};
    const subscriberQuery = [];
    const subscriberParams = [];
    let idx = 1;

    subscriberQuery.push(`s.subscribed = TRUE`);

    if (filter.sources && Array.isArray(filter.sources) && filter.sources.length > 0) {
      subscriberQuery.push(`s.source = ANY($${idx})`);
      subscriberParams.push(filter.sources);
      idx++;
    }

    if (filter.user_types && Array.isArray(filter.user_types) && filter.user_types.length > 0) {
      subscriberQuery.push(`s.user_type = ANY($${idx})`);
      subscriberParams.push(filter.user_types);
      idx++;
    }

    if (filter.tags && Array.isArray(filter.tags) && filter.tags.length > 0) {
      subscriberQuery.push(`s.tags @> $${idx}`);
      subscriberParams.push(filter.tags);
      idx++;
    }

    const whereClause = subscriberQuery.join(' AND ');
    const subscribers = await db.query(
      `SELECT id, phone, full_name FROM sms_subscribers WHERE ${whereClause}`,
      subscriberParams
    );

    if (subscribers.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No subscribers match the filter criteria' });
    }

    const retryCount = Math.min(Math.max(parseInt(max_retries, 10) || 0, 0), 3);

    await db.query(
      `UPDATE sms_campaigns SET status = 'queued', max_retries = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, retryCount]
    );

    const recipientInserts = subscribers.rows.map((s) =>
      db.query(
        `INSERT INTO sms_campaign_recipients (campaign_id, subscriber_id, phone, full_name, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [id, s.id, s.phone, s.full_name || null]
      )
    );
    await Promise.all(recipientInserts);

    const segments = Math.ceil(c.content.length / 160) || 1;
    const costResp = await db.query(
      `SELECT value FROM commission_config WHERE key = 'sms_cost_per_segment'`
    );
    const costPerSegment = parseFloat(costResp.rows[0]?.value) || 4;
    const estimatedCost = (segments * costPerSegment * subscribers.rows.length).toFixed(2);

    await recordOperation({
      actor: req.user,
      entityType: 'campaign',
      entityId: Number(id),
      eventType: 'campaign_queued',
      note: approvalNote,
      metadata: {
        recipients: subscribers.rows.length,
        estimated_cost: estimatedCost,
        estimated_segments: segments,
        max_retries: retryCount,
      },
    });

    res.json({
      success: true,
      data: {
        total: subscribers.rows.length,
        status: 'queued',
        estimated_cost: estimatedCost,
        estimated_segments: segments,
        max_retries: retryCount,
      },
    });
  } catch (error) {
    console.error('Send SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to queue SMS campaign' });
  }
};

const retryCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const reason = requireActionNote(req, res, 'A retry reason is required');
    if (!reason) return;

    const campaign = await db.query(
      `SELECT id, max_retries, stats FROM sms_campaigns WHERE id = $1`,
      [id]
    );
    if (!campaign.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const c = campaign.rows[0];
    if (c.max_retries < 1) {
      return res.status(400).json({ success: false, message: 'This campaign has retries disabled' });
    }

    const { rows: retryable } = await db.query(
      `UPDATE sms_campaign_recipients SET status = 'pending', error_message = NULL, updated_at = NOW()
       WHERE campaign_id = $1 AND status = 'failed'
       AND last_error_type = 'transient'
       AND retry_count < $2
       RETURNING id`,
      [id, c.max_retries]
    );

    if (retryable.length === 0) {
      return res.status(400).json({ success: false, message: 'No retryable failures found' });
    }

    await db.query(
      `UPDATE sms_campaign_recipients SET retry_count = retry_count + 1
       WHERE campaign_id = $1 AND status = 'pending' AND retry_count > 0`,
      [id]
    );

    await db.query(
      `UPDATE sms_campaigns SET status = 'sending', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await recordOperation({
      actor: req.user,
      entityType: 'campaign',
      entityId: Number(id),
      eventType: 'campaign_retry_queued',
      note: reason,
      metadata: { retrying: retryable.length, max_retries: c.max_retries },
    });

    res.json({
      success: true,
      data: { retrying: retryable.length },
    });
  } catch (error) {
    console.error('Retry SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to retry SMS campaign' });
  }
};

const getCampaignStats = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;

    const campaign = await db.query(`SELECT * FROM sms_campaigns WHERE id = $1`, [id]);
    if (!campaign.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const statusCounts = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM sms_campaign_recipients WHERE campaign_id = $1 GROUP BY status`,
      [id]
    );

    const counts = { pending: 0, sent: 0, failed: 0 };
    statusCounts.rows.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] = r.count;
    });

    const recipients = await db.query(
      `SELECT r.id, r.phone, r.full_name, r.status, r.sent_at, r.error_message, r.retry_count
       FROM sms_campaign_recipients r
       WHERE r.campaign_id = $1
       ORDER BY r.created_at DESC LIMIT 200`,
      [id]
    );

    const segments = Math.ceil((campaign.rows[0].content || '').length / 160) || 1;
    const costResp = await db.query(
      `SELECT value FROM commission_config WHERE key = 'sms_cost_per_segment'`
    );
    const costPerSegment = parseFloat(costResp.rows[0]?.value) || 4;
    const totalSegments = segments * (counts.sent + counts.failed);
    const actualCost = (totalSegments * costPerSegment).toFixed(2);

    res.json({
      success: true,
      data: {
        campaign: campaign.rows[0],
        stats: { ...campaign.rows[0].stats, ...counts, total: recipients.rows.length },
        recipients: recipients.rows,
        cost: {
          per_segment: costPerSegment,
          segments_per_message: segments,
          total_segments: totalSegments,
          estimated: campaign.rows[0].cost_estimate,
          actual: actualCost,
        },
      },
    });
  } catch (error) {
    console.error('SMS campaign stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS campaign stats' });
  }
};

module.exports = {
  listSubscribers,
  syncSubscribers,
  importSubscribers,
  addSubscriber,
  updateSubscriber,
  deleteSubscriber,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  retryCampaign,
  getCampaignStats,
  getDashboardStats,
};
