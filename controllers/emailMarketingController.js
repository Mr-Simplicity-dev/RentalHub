const db = require('../config/middleware/database');
const crypto = require('crypto');
const { sendEmail } = require('../config/utils/mailer');
const { buildEmail } = require('../config/utils/emailTemplates');

const EMAIL_FROM = process.env.EMAIL_FROM || 'RentalHub NG <support@rentalhub.com.ng>';
const BASE_URL = process.env.BASE_URL || 'https://rentalhub.com.ng';
const BATCH_SIZE = 50;

let schemaReady = false;

const ensureSchema = async () => {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_subscribers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      source_id INTEGER,
      user_type VARCHAR(50),
      tags TEXT[] DEFAULT '{}',
      subscribed BOOLEAN NOT NULL DEFAULT TRUE,
      unsubscribed_at TIMESTAMP,
      unsubscribe_token VARCHAR(64) UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_email_subscribers_email UNIQUE (email)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      subject VARCHAR(255) NOT NULL,
      content_html TEXT NOT NULL,
      category VARCHAR(50) DEFAULT 'general',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      sender_name VARCHAR(160),
      sender_email VARCHAR(255),
      reply_to VARCHAR(255),
      template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
      content_html TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      recipient_filter JSONB DEFAULT '{}',
      scheduled_at TIMESTAMP,
      sent_at TIMESTAMP,
      stats JSONB DEFAULT '{"sent":0,"failed":0,"opened":0,"clicked":0,"bounced":0,"unsubscribed":0}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_campaign_recipients (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
      subscriber_id INTEGER REFERENCES email_subscribers(id) ON DELETE SET NULL,
      email VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMP,
      opened_at TIMESTAMP,
      clicked_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_email_subscribers_subscribed ON email_subscribers (subscribed)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ecr_campaign ON email_campaign_recipients (campaign_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ecr_status ON email_campaign_recipients (status)`);

  schemaReady = true;
};

const generateUnsubscribeToken = () => crypto.randomBytes(32).toString('hex');

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
      where.push(`(s.email ILIKE $${idx} OR s.full_name ILIKE $${idx})`);
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

    const countResult = await db.query(`SELECT COUNT(*) FROM email_subscribers s ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const { rows } = await db.query(
      `SELECT s.* FROM email_subscribers s ${whereClause} ORDER BY s.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({ success: true, data: rows, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total } });
  } catch (error) {
    console.error('List subscribers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load subscribers' });
  }
};

const syncSubscribers = async (req, res) => {
  try {
    await ensureSchema();
    let added = 0;
    let updated = 0;

    // Sync from users table
    const users = await db.query(
      `SELECT id, email, full_name, user_type, created_at FROM users WHERE email IS NOT NULL AND email != ''`
    );

    for (const user of users.rows) {
      const existing = await db.query(
        `SELECT id, full_name, user_type FROM email_subscribers WHERE email = $1 AND source = 'user'`,
        [user.email]
      );

      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE email_subscribers SET full_name = $1, user_type = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [user.full_name, user.user_type, existing.rows[0].id]
        );
        updated++;
      } else {
        const token = generateUnsubscribeToken();
        await db.query(
          `INSERT INTO email_subscribers (email, full_name, source, source_id, user_type, unsubscribe_token, subscribed)
           VALUES ($1, $2, 'user', $3, $4, $5, TRUE)
           ON CONFLICT (email) DO NOTHING`,
          [user.email, user.full_name, user.id, user.user_type, token]
        );
        added++;
      }
    }

    // Sync from leads (tenant_registration_payments where not completed)
    const leads = await db.query(
      `SELECT id, email, full_name FROM tenant_registration_payments WHERE registered_user_id IS NULL AND email IS NOT NULL AND email != ''`
    );

    for (const lead of leads.rows) {
      const existing = await db.query(
        `SELECT id FROM email_subscribers WHERE email = $1 AND source = 'lead'`,
        [lead.email]
      );

      if (existing.rows.length === 0) {
        const token = generateUnsubscribeToken();
        await db.query(
          `INSERT INTO email_subscribers (email, full_name, source, source_id, user_type, unsubscribe_token, subscribed)
           VALUES ($1, $2, 'lead', $3, 'tenant', $4, TRUE)
           ON CONFLICT (email) DO NOTHING`,
          [lead.email, lead.full_name, lead.id, token]
        );
        added++;
      }
    }

    res.json({ success: true, data: { added, updated, total: added + updated } });
  } catch (error) {
    console.error('Sync subscribers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to sync subscribers' });
  }
};

const addSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { email, full_name, source = 'manual', user_type, tags } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const token = generateUnsubscribeToken();
    const result = await db.query(
      `INSERT INTO email_subscribers (email, full_name, source, user_type, tags, unsubscribe_token, subscribed)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         full_name = COALESCE($2, email_subscribers.full_name),
         subscribed = TRUE,
         unsubscribed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [email.trim(), full_name || null, source, user_type || null, tags || [], token]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Add subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add subscriber' });
  }
};

const updateSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { full_name, user_type, tags, subscribed } = req.body;

    const result = await db.query(
      `UPDATE email_subscribers SET
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
    console.error('Update subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update subscriber' });
  }
};

const deleteSubscriber = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const result = await db.query(`DELETE FROM email_subscribers WHERE id = $1 RETURNING id`, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Subscriber not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete subscriber error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete subscriber' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    await ensureSchema();
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2>Invalid unsubscribe link</h2>
        <p>The unsubscribe link is missing or invalid.</p>
        </body></html>
      `);
    }

    const result = await db.query(
      `UPDATE email_subscribers SET subscribed = FALSE, unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE unsubscribe_token = $1 AND subscribed = TRUE
       RETURNING email`,
      [token]
    );

    if (result.rows.length > 0) {
      res.send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f4f6f9;">
        <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;">
          <h2 style="color:#0f172a;margin:0 0 8px;">Unsubscribed</h2>
          <p style="color:#64748b;">${result.rows[0].email} has been removed from our mailing list.</p>
          <p style="color:#94a3b8;font-size:13px;">You won't receive marketing emails from us again.</p>
        </div>
        </body></html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f4f6f9;">
        <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;">
          <h2 style="color:#0f172a;margin:0 0 8px;">Already Unsubscribed</h2>
          <p style="color:#64748b;">This email has already been unsubscribed.</p>
        </div>
        </body></html>
      `);
    }
  } catch (error) {
    console.error('Unsubscribe error:', error.message);
    res.status(500).send('An error occurred. Please try again.');
  }
};

// ─── Templates ──────────────────────────────────────────────────────────────

const listTemplates = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT t.*, u.full_name AS created_by_name
       FROM email_templates t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List templates error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load templates' });
  }
};

const createTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { name, description, subject, content_html, category } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Template name is required' });
    if (!subject || !subject.trim()) return res.status(400).json({ success: false, message: 'Subject is required' });

    const result = await db.query(
      `INSERT INTO email_templates (name, description, subject, content_html, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), description || null, subject.trim(), content_html || '', category || 'general', req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create template' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const { name, description, subject, content_html, category } = req.body;

    const result = await db.query(
      `UPDATE email_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        subject = COALESCE($3, subject),
        content_html = COALESCE($4, content_html),
        category = COALESCE($5, category),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [name || null, description !== undefined ? description : null, subject || null, content_html || null, category || null, id]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update template' });
  }
};

const deleteTemplate = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const result = await db.query(`DELETE FROM email_templates WHERE id = $1 AND is_system = FALSE RETURNING id`, [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found or is system-protected' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
};

// ─── Campaigns ──────────────────────────────────────────────────────────────

const listCampaigns = async (req, res) => {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT c.*, u.full_name AS created_by_name
       FROM email_campaigns c
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List campaigns error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load campaigns' });
  }
};

const createCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { name, subject, content_html, sender_name, sender_email, reply_to, template_id, recipient_filter, scheduled_at } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Campaign name is required' });
    if (!subject || !subject.trim()) return res.status(400).json({ success: false, message: 'Subject is required' });

    const result = await db.query(
      `INSERT INTO email_campaigns (name, subject, content_html, sender_name, sender_email, reply_to, template_id, recipient_filter, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        name.trim(), subject.trim(), content_html || '',
        sender_name || null, sender_email || null, reply_to || null,
        template_id || null, recipient_filter || {}, scheduled_at || null, req.user.id
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create campaign' });
  }
};

const updateCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const fields = req.body;

    // Only allow updates on draft campaigns
    const check = await db.query(`SELECT status FROM email_campaigns WHERE id = $1`, [id]);
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ success: false, message: 'Can only edit draft campaigns' });

    const setClauses = [];
    const params = [id];
    let idx = 2;

    const allowedColumns = new Set(['name', 'subject', 'content_html', 'sender_name', 'sender_email', 'reply_to', 'recipient_filter', 'scheduled_at']);
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
      `UPDATE email_campaigns SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Update campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update campaign' });
  }
};

const deleteCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;
    const check = await db.query(`SELECT status FROM email_campaigns WHERE id = $1`, [id]);
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (check.rows[0].status === 'sending' || check.rows[0].status === 'sent') {
      return res.status(400).json({ success: false, message: 'Cannot delete a sending or sent campaign' });
    }
    await db.query(`DELETE FROM email_campaigns WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete campaign' });
  }
};

const sendCampaign = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;

    const campaign = await db.query(`SELECT * FROM email_campaigns WHERE id = $1`, [id]);
    if (!campaign.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const c = campaign.rows[0];
    if (c.status !== 'draft') return res.status(400).json({ success: false, message: `Campaign is already ${c.status}` });

    // Build recipient list from filter
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
      `SELECT id, email, full_name, unsubscribe_token FROM email_subscribers WHERE ${whereClause}`,
      subscriberParams
    );

    if (subscribers.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No subscribers match the filter criteria' });
    }

    // Mark campaign as sending
    await db.query(
      `UPDATE email_campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // Insert recipient records
    const recipientInserts = subscribers.rows.map((s) => {
      const token = s.unsubscribe_token || generateUnsubscribeToken();
      return db.query(
        `INSERT INTO email_campaign_recipients (campaign_id, subscriber_id, email, full_name, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [id, s.id, s.email, s.full_name || null]
      );
    });
    await Promise.all(recipientInserts);

    // Send in batches
    let sent = 0;
    let failed = 0;

    const fromAddress = c.sender_name
      ? `${c.sender_name} <${c.sender_email || 'support@rentalhub.com.ng'}>`
      : EMAIL_FROM;

    for (let i = 0; i < subscribers.rows.length; i += BATCH_SIZE) {
      const batch = subscribers.rows.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (sub) => {
        try {
          const html = c.content_html.includes('<!DOCTYPE')
            ? c.content_html
            : buildEmail({
                template: 'newsletter',
                data: { title: c.subject, body: c.content_html },
                unsubscribeToken: sub.unsubscribe_token,
              });

          await sendEmail({
            to: sub.email,
            subject: c.subject,
            html,
          });

          await db.query(
            `UPDATE email_campaign_recipients SET status = 'sent', sent_at = CURRENT_TIMESTAMP
             WHERE campaign_id = $1 AND subscriber_id = $2`,
            [id, sub.id]
          );
          sent++;
        } catch (err) {
          await db.query(
            `UPDATE email_campaign_recipients SET status = 'failed', error_message = $1
             WHERE campaign_id = $2 AND subscriber_id = $3`,
            [err.message?.slice(0, 500) || 'Unknown error', id, sub.id]
          );
          failed++;
        }
      });

      await Promise.all(batchPromises);
    }

    // Update campaign stats
    const total = subscribers.rows.length;
    const stats = { sent, failed, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 };
    const newStatus = failed > 0 && sent === 0 ? 'draft' : 'sent';

    await db.query(
      `UPDATE email_campaigns SET status = $1, stats = $2, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [newStatus, JSON.stringify(stats), id]
    );

    res.json({
      success: true,
      data: {
        total,
        sent,
        failed,
        status: newStatus,
      },
    });
  } catch (error) {
    console.error('Send campaign error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send campaign' });
  }
};

const getCampaignStats = async (req, res) => {
  try {
    await ensureSchema();
    const { id } = req.params;

    const campaign = await db.query(`SELECT * FROM email_campaigns WHERE id = $1`, [id]);
    if (!campaign.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const statusCounts = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM email_campaign_recipients WHERE campaign_id = $1 GROUP BY status`,
      [id]
    );

    const counts = { sent: 0, failed: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 };
    statusCounts.rows.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] = r.count;
    });

    const recipients = await db.query(
      `SELECT r.id, r.email, r.full_name, r.status, r.sent_at, r.opened_at, r.clicked_at, r.error_message
       FROM email_campaign_recipients r
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
    console.error('Campaign stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load campaign stats' });
  }
};

// ─── Dashboard Stats ────────────────────────────────────────────────────────

const getDashboardStats = async (req, res) => {
  try {
    await ensureSchema();

    const subscriberCount = await db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE subscribed = TRUE)::int AS active FROM email_subscribers`);
    const campaignCount = await db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'sent')::int AS sent FROM email_campaigns`);
    const monthlySent = await db.query(
      `SELECT COALESCE(SUM((stats->>'sent')::int), 0)::int AS total_sent
       FROM email_campaigns WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days'`
    );

    const recentCampaigns = await db.query(
      `SELECT c.id, c.name, c.status, c.sent_at, c.stats, u.full_name AS created_by_name
       FROM email_campaigns c
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
    console.error('Email marketing stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
};

module.exports = {
  listSubscribers,
  syncSubscribers,
  addSubscriber,
  updateSubscriber,
  deleteSubscriber,
  unsubscribe,
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
