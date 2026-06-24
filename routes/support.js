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
      state VARCHAR(100),
      lga VARCHAR(100),
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      escalated_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- ensure columns exist (safe for existing tables)
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='state') THEN
        ALTER TABLE support_tickets ADD COLUMN state VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='lga') THEN
        ALTER TABLE support_tickets ADD COLUMN lga VARCHAR(100);
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
      ON support_tickets(status, priority, created_at DESC);

    CREATE TABLE IF NOT EXISTS support_ticket_replies (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(255),
      message TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket
      ON support_ticket_replies(ticket_id, created_at ASC);
  `);

  supportSchemaReady = true;
};

const requireSupportAdmin = (req, res, next) => {
  const role = String(req.user?.user_type || '').toLowerCase();
  if (SUPPORT_ADMIN_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Support admin access required' });
};

// Public contact form (no auth required)
router.post('/contact', async (req, res) => {
  try {
    await ensureSupportSchema();

    const { name, email, state, lga, subject, message } = req.body;

    if (!name || !name.trim() || !email || !email.trim() || !state || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, state, and message are required',
      });
    }

    const result = await db.query(
      `INSERT INTO support_tickets (subject, description, state, lga, priority, status, user_id)
       VALUES ($1, $2, $3, $4, 'medium', 'open', NULL)
       RETURNING id`,
      [
        subject?.trim() ? `[Contact] ${subject.trim()}` : `[Contact] ${name.trim()}`,
        lga
          ? `State: ${state}\nLGA: ${lga}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`
          : `State: ${state}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
        state,
        lga || null,
      ]
    );

    const ticketId = result.rows[0].id;

    // Auto-assign: LGA support → State support → Super support
    try {
      let assignedTo = null;

      if (lga) {
        const lgaResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'lga_support_admin'
             AND assigned_state = $1
             AND assigned_city = $2
             AND deleted_at IS NULL
             AND account_suspended_at IS NULL
           ORDER BY id ASC
           LIMIT 1`,
          [state, lga]
        );
        if (lgaResult.rows.length > 0) {
          assignedTo = lgaResult.rows[0].id;
        }
      }

      if (!assignedTo) {
        const stateResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'state_support_admin'
             AND assigned_state = $1
             AND deleted_at IS NULL
             AND account_suspended_at IS NULL
           ORDER BY id ASC
           LIMIT 1`,
          [state]
        );
        if (stateResult.rows.length > 0) {
          assignedTo = stateResult.rows[0].id;
        }
      }

      if (!assignedTo) {
        const superResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'super_support_admin'
             AND deleted_at IS NULL
             AND account_suspended_at IS NULL
           ORDER BY id ASC
           LIMIT 1`
        );
        if (superResult.rows.length > 0) {
          assignedTo = superResult.rows[0].id;
        }
      }

      if (assignedTo) {
        await db.query(
          `UPDATE support_tickets SET assigned_to = $1 WHERE id = $2`,
          [assignedTo, ticketId]
        );
      }
    } catch (assignErr) {
      console.error('Ticket auto-assignment error (non-fatal):', assignErr);
    }

    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

router.post('/tickets', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const { subject, description, priority } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Subject is required',
      });
    }

    const result = await db.query(
      `INSERT INTO support_tickets (subject, description, priority, status, user_id)
       VALUES ($1, $2, $3, 'open', $4)
       RETURNING *`,
      [subject.trim(), description?.trim() || null, priority || 'medium', req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket',
    });
  }
});

router.get('/tickets/my', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const result = await db.query(
      `SELECT id, subject, description, priority, status, escalated_at, resolved_at, created_at, updated_at
       FROM support_tickets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('My support tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your tickets',
    });
  }
});

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

    // Scope tickets by admin jurisdiction
    const role = String(req.user.user_type || '').toLowerCase();

    if (role === 'lga_support_admin') {
      // Own assignments + unassigned tickets in their LGA
      params.push(req.user.id);
      params.push(String(req.user.assigned_state || ''));
      params.push(String(req.user.assigned_city || ''));
      where.push(`(
        st.assigned_to = $${params.length - 2}
        OR (
          st.assigned_to IS NULL
          AND st.state = $${params.length - 1}
          AND st.lga = $${params.length}
        )
      )`);
    } else if (role === 'state_support_admin') {
      // Own assignments + unassigned tickets in their state
      params.push(req.user.id);
      params.push(String(req.user.assigned_state || ''));
      where.push(`(
        st.assigned_to = $${params.length - 1}
        OR (
          st.assigned_to IS NULL
          AND st.state = $${params.length}
        )
      )`);
    }
    // super_support_admin and super_admin see all tickets

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.state, st.lga, st.priority, st.status,
              st.created_at, st.updated_at, st.escalated_at, st.resolved_at,
              st.assigned_to,
              u.email AS user_email, u.full_name AS user_name,
              a.email AS assigned_email, a.full_name AS assigned_name
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users a ON a.id = st.assigned_to
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

    const currentUserType = req.user.user_type;
    const currentUserId = req.user.id;

    // Get current ticket info (subject/state from description)
    const ticketResult = await db.query(
      `SELECT st.*, u.email AS user_email, u.full_name AS user_name
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       WHERE st.id = $1`,
      [ticketId]
    );

    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const ticketState = ticket.state || null;

    // Determine next-level assignee
    let nextAssigneeId = null;
    let escalationNote = '';

    if (currentUserType === 'lga_support_admin') {
      // LGA → escalate to state support admin
      if (ticketState) {
        const stateResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'state_support_admin'
             AND assigned_state = $1
             AND deleted_at IS NULL
             AND account_suspended_at IS NULL
           ORDER BY id ASC LIMIT 1`,
          [ticketState]
        );
        if (stateResult.rows.length > 0) {
          nextAssigneeId = stateResult.rows[0].id;
          escalationNote = `Escalated from LGA support (User #${currentUserId}) to state support`;
        }
      }
    }

    if (!nextAssigneeId && (currentUserType === 'lga_support_admin' || currentUserType === 'state_support_admin')) {
      // State-level escalation → super support admin
      const superResult = await db.query(
        `SELECT id FROM users
         WHERE user_type = 'super_support_admin'
           AND deleted_at IS NULL
           AND account_suspended_at IS NULL
         ORDER BY id ASC LIMIT 1`
      );
      if (superResult.rows.length > 0) {
        nextAssigneeId = superResult.rows[0].id;
        escalationNote = escalationNote || `Escalated from ${currentUserType} (User #${currentUserId}) to super support`;
      }
    }

    if (!nextAssigneeId) {
      return res.status(400).json({
        success: false,
        message: currentUserType === 'super_support_admin'
          ? 'Ticket is already at the highest support level'
          : 'No available admin found at the next escalation level',
      });
    }

    await db.query(
      `UPDATE support_tickets
       SET priority = 'urgent',
           status = CASE WHEN status = 'resolved' THEN status ELSE 'in_progress' END,
           assigned_to = $1,
           escalated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [nextAssigneeId, ticketId]
    );

    res.json({
      success: true,
      message: 'Ticket escalated successfully',
      data: { assigned_to: nextAssigneeId, escalation_note: escalationNote },
    });
  } catch (error) {
    console.error('Escalate support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to escalate support ticket',
    });
  }
});

router.patch('/tickets/:id/assign', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const assignedTo = req.body.assigned_to ? Number(req.body.assigned_to) : req.user.id;

    const result = await db.query(
      `UPDATE support_tickets
       SET assigned_to = $1,
           status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [assignedTo, ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Assign support ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign support ticket',
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

// ─── Conversation / Reply endpoints ────────────────────────────────────────

// GET /support/tickets/:id/conversation — fetch all replies for a ticket
router.get('/tickets/:id/conversation', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    // Check access: ticket owner or support admin
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    if (!isSupportAdmin) {
      const ownerCheck = await db.query(
        'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
        [ticketId, req.user.id]
      );
      if (!ownerCheck.rows.length) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const result = await db.query(
      `SELECT str.id, str.ticket_id, str.user_id, str.author_name, str.message,
              str.is_admin, str.created_at,
              u.email AS user_email
       FROM support_ticket_replies str
       LEFT JOIN users u ON u.id = str.user_id
       WHERE str.ticket_id = $1
       ORDER BY str.created_at ASC, str.id ASC`,
      [ticketId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
});

// POST /support/tickets/:id/reply — add a reply to a ticket
router.post('/tickets/:id/reply', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // Fetch ticket to verify access
    const ticketResult = await db.query(
      'SELECT id, subject, user_id, status FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);
    const isOwner = ticket.user_id === req.user.id;

    if (!isSupportAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'You cannot reply to this ticket' });
    }

    // Insert reply
    const result = await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        ticketId,
        req.user.id,
        isSupportAdmin ? (req.user.full_name || 'Support Team') : (req.user.full_name || req.user.email),
        message.trim(),
        isSupportAdmin,
      ]
    );

    // If ticket was resolved, re-open it on new reply
    if (ticket.status === 'resolved') {
      await db.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticketId]
      );
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
});

module.exports = router;
