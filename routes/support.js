const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');

const router = express.Router();

const SUPPORT_ADMIN_ROLES = new Set([
  'super_admin',
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
]);

let supportSchemaReady = false;

const ensureSupportSchema = async () => {
  if (supportSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      subject VARCHAR(255) NOT NULL,
      description TEXT,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      escalated_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
      ON support_tickets(status, priority, created_at DESC);
  `);

  supportSchemaReady = true;
};

const requireSupportAdmin = (req, res, next) => {
  const role = String(req.user?.user_type || '').toLowerCase();
  if (SUPPORT_ADMIN_ROLES.has(role)) return next();

  return res.status(403).json({
    success: false,
    message: 'Support admin access required',
  });
};

router.get('/tickets', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const where = [];
    const params = [];

    if (req.query.status && req.query.status !== 'all') {
      params.push(String(req.query.status));
      where.push(`st.status = $${params.length}`);
    }

    if (req.query.priority && req.query.priority !== 'all') {
      params.push(String(req.query.priority));
      where.push(`st.priority = $${params.length}`);
    }

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.priority, st.status,
              st.created_at, st.updated_at, st.escalated_at, st.resolved_at,
              u.email AS user_email, u.full_name AS user_name
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY
         CASE st.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         st.created_at DESC
       LIMIT 100`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Support tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
    });
  }
});

router.post('/tickets/escalate', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.body?.ticketId || req.body?.ticket_id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid ticket ID is required',
      });
    }

    const result = await db.query(
      `UPDATE support_tickets
       SET priority = 'urgent',
           status = CASE WHEN status = 'resolved' THEN status ELSE 'in_progress' END,
           escalated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Escalate support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to escalate support ticket',
    });
  }
});

router.patch('/tickets/:id/resolve', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid ticket ID is required',
      });
    }

    const result = await db.query(
      `UPDATE support_tickets
       SET status = 'resolved',
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Resolve support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve support ticket',
    });
  }
});

module.exports = router;
