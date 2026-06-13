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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_scr_campaign ON sms_campaign_recipients (campaign_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_scr_status ON sms_campaign_recipients (status)`);

  schemaReady = true;
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
    const result = await db.query(`DELETE FROM sms_subscribers WHERE id = $1 RETURNING id`, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

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
    const result = await db.query(`DELETE FROM sms_templates WHERE id = $1 AND is_system = FALSE RETURNING id`, [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found or is system-protected' });
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
      `SELECT c.*, u.full_name AS created_by_name
       FROM sms_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
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

    for (const [key, value] of Object.entries(fields)) {
      if (['name', 'content', 'sender_name', 'recipient_filter', 'scheduled_at'].includes(key)) {
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
    const check = await db.query(`SELECT status FROM sms_campaigns WHERE id = $1`, [id]);
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (check.rows[0].status === 'sending' || check.rows[0].status === 'sent') {
      return res.status(400).json({ success: false, message: 'Cannot delete a sending or sent campaign' });
    }
    await db.query(`DELETE FROM sms_campaigns WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete SMS campaign' });
  }
};

const sendCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;

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

    await db.query(
      `UPDATE sms_campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    const recipientInserts = subscribers.rows.map((s) =>
      db.query(
        `INSERT INTO sms_campaign_recipients (campaign_id, subscriber_id, phone, full_name, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [id, s.id, s.phone, s.full_name || null]
      )
    );
    await Promise.all(recipientInserts);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < subscribers.rows.length; i += BATCH_SIZE) {
      const batch = subscribers.rows.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (sub) => {
        try {
          await sendSMS(sub.phone, c.content);

          await db.query(
            `UPDATE sms_campaign_recipients SET status = 'sent', sent_at = CURRENT_TIMESTAMP
             WHERE campaign_id = $1 AND subscriber_id = $2`,
            [id, sub.id]
          );
          sent++;
        } catch (err) {
          await db.query(
            `UPDATE sms_campaign_recipients SET status = 'failed', error_message = $1
             WHERE campaign_id = $2 AND subscriber_id = $3`,
            [err.message?.slice(0, 500) || 'Unknown error', id, sub.id]
          );
          failed++;
        }
      });

      await Promise.all(batchPromises);
    }

    const total = subscribers.rows.length;
    const stats = { sent, failed };
    const newStatus = failed > 0 && sent === 0 ? 'draft' : 'sent';

    await db.query(
      `UPDATE sms_campaigns SET status = $1, stats = $2, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newStatus, JSON.stringify(stats), id]
    );

    res.json({
      success: true,
      data: { total, sent, failed, status: newStatus },
    });
  } catch (error) {
    console.error('Send SMS campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send SMS campaign' });
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

    const counts = { sent: 0, failed: 0 };
    statusCounts.rows.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] = r.count;
    });

    const recipients = await db.query(
      `SELECT r.id, r.phone, r.full_name, r.status, r.sent_at, r.error_message
       FROM sms_campaign_recipients r
       WHERE r.campaign_id = $1
       ORDER BY r.created_at DESC LIMIT 200`,
      [id]
    );

    res.json({
      success: true,
      data: {
        campaign: campaign.rows[0],
        stats: { ...campaign.rows[0].stats, ...counts, total: recipients.rows.length },
        recipients: recipients.rows,
      },
    });
  } catch (error) {
    console.error('SMS campaign stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load SMS campaign stats' });
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

module.exports = {
  listSubscribers,
  syncSubscribers,
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
  getCampaignStats,
  getDashboardStats,
};
