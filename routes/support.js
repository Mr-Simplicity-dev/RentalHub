const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const { contactFormLimiter } = require('../config/middleware/securityRateLimiters');

const SUPPORT_ADMIN_ROLES = new Set([
  'super_admin',
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
]);

let supportSchemaReady = false;
let io = null;

try {
  io = require('../server').io;
} catch (e) {
  // server may not be fully loaded yet; io will be set later if needed
}

const ATTACHMENT_DIR = path.join(__dirname, '..', 'uploads', 'tickets');
if (!fs.existsSync(ATTACHMENT_DIR)) {
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
}

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'audio/webm': '.webm',
  'audio/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
};

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACHMENT_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname) || '.bin';
    cb(null, `ticket_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error('Only images, PDF, DOC, DOCX, TXT, XLS, XLSX, and audio files allowed'), false);
  },
});

const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

const emitToRole = (role, event, data) => {
  if (!io) return;
  io.to(`role:${role}`).emit(event, data);
};

const ensureSupportSchema = async () => {
  if (supportSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      subject VARCHAR(255) NOT NULL,
      description TEXT,
      state VARCHAR(100),
      lga VARCHAR(100),
      contact_email VARCHAR(255),
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      escalated_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='state') THEN
        ALTER TABLE support_tickets ADD COLUMN state VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='lga') THEN
        ALTER TABLE support_tickets ADD COLUMN lga VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='contact_email') THEN
        ALTER TABLE support_tickets ADD COLUMN contact_email VARCHAR(255);
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
      attachment_url TEXT,
      attachment_name VARCHAR(255),
      attachment_type VARCHAR(100),
      edited_at TIMESTAMP,
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_replies' AND column_name='attachment_url') THEN
        ALTER TABLE support_ticket_replies ADD COLUMN attachment_url TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_replies' AND column_name='attachment_name') THEN
        ALTER TABLE support_ticket_replies ADD COLUMN attachment_name VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_replies' AND column_name='attachment_type') THEN
        ALTER TABLE support_ticket_replies ADD COLUMN attachment_type VARCHAR(100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_replies' AND column_name='edited_at') THEN
        ALTER TABLE support_ticket_replies ADD COLUMN edited_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_replies' AND column_name='read_at') THEN
        ALTER TABLE support_ticket_replies ADD COLUMN read_at TIMESTAMP;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket
      ON support_ticket_replies(ticket_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS support_ticket_internal_notes (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(255),
      author_role VARCHAR(50),
      message TEXT NOT NULL,
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_ticket_internal_notes' AND column_name='read_at') THEN
        ALTER TABLE support_ticket_internal_notes ADD COLUMN read_at TIMESTAMP;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_internal_notes_ticket
      ON support_ticket_internal_notes(ticket_id, created_at ASC);
  `);

  supportSchemaReady = true;
};

const requireSupportAdmin = (req, res, next) => {
  const role = String(req.user?.user_type || '').toLowerCase();
  if (SUPPORT_ADMIN_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Support admin access required' });
};

const addReplyNotification = async (reply, ticket, senderId, recipientId) => {
  try {
    const { createNotification } = require('../config/utils/notificationService');
    const isAdminReply = reply.is_admin;
    const recipient = isAdminReply ? ticket.user_id : recipientId;
    if (!recipient || recipient === senderId) return;

    const title = isAdminReply ? 'New reply to your support ticket' : 'New message from user on ticket';
    const message = isAdminReply
      ? `Support team replied to "${ticket.subject}"`
      : `A user replied to ticket "${ticket.subject}"`;
    const link = `/support/tickets/${ticket.id}`;

    await createNotification(recipient, 'ticket_reply', title, message, link);

    emitToUser(recipient, 'ticket:new_reply', {
      ticketId: ticket.id,
      subject: ticket.subject,
      replyId: reply.id,
      isAdmin: reply.is_admin,
      preview: reply.message.substring(0, 100),
    });
  } catch (err) {
    console.error('Add reply notification error:', err);
  }
};

const sendReplyEmail = async (reply, ticket, sender) => {
  try {
    const emailService = require('../config/utils/emailService');
    const isAdminReply = reply.is_admin;

    if (isAdminReply && ticket.user_id) {
      const userResult = await db.query('SELECT email, full_name FROM users WHERE id = $1', [ticket.user_id]);
      if (userResult.rows.length) {
        const user = userResult.rows[0];
        await emailService.sendMessageNotification(
          user.email,
          user.full_name || 'User',
          'Support Team',
          reply.message
        );
      }
    } else if (!isAdminReply) {
      const assignees = [];
      if (ticket.assigned_to) assignees.push(ticket.assigned_to);
      const adminResult = await db.query(
        `SELECT email, full_name FROM users WHERE id = ANY($1)`,
        [assignees]
      );
      for (const admin of adminResult.rows) {
        await emailService.sendMessageNotification(
          admin.email,
          admin.full_name || 'Support Admin',
          sender.full_name || 'A user',
          reply.message
        );
      }
    }
  } catch (err) {
    console.error('Reply email error:', err);
  }
};

// ─── Public contact form ───────────────────────────────────────────────────

router.post('/contact', contactFormLimiter, async (req, res) => {
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
      `INSERT INTO support_tickets (subject, description, state, lga, contact_email, priority, status, user_id)
       VALUES ($1, $2, $3, $4, $5, 'medium', 'open', NULL)
       RETURNING id`,
      [
        subject?.trim() ? `[Contact] ${subject.trim()}` : `[Contact] ${name.trim()}`,
        lga
          ? `State: ${state}\nLGA: ${lga}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`
          : `State: ${state}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
        state,
        lga || null,
        email.trim().toLowerCase(),
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
             AND deleted_at IS NULL AND account_suspended_at IS NULL
           ORDER BY id ASC LIMIT 1`,
          [state, lga]
        );
        if (lgaResult.rows.length > 0) assignedTo = lgaResult.rows[0].id;
      }

      if (!assignedTo) {
        const stateResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'state_support_admin'
             AND assigned_state = $1
             AND deleted_at IS NULL AND account_suspended_at IS NULL
           ORDER BY id ASC LIMIT 1`,
          [state]
        );
        if (stateResult.rows.length > 0) assignedTo = stateResult.rows[0].id;
      }

      if (!assignedTo) {
        const superResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'super_support_admin'
             AND deleted_at IS NULL AND account_suspended_at IS NULL
           ORDER BY id ASC LIMIT 1`
        );
        if (superResult.rows.length > 0) assignedTo = superResult.rows[0].id;
      }

      if (assignedTo) {
        await db.query('UPDATE support_tickets SET assigned_to = $1 WHERE id = $2', [assignedTo, ticketId]);
      }
    } catch (assignErr) {
      console.error('Ticket auto-assignment error (non-fatal):', assignErr);
    }

    res.status(201).json({ success: true, message: 'Message sent successfully', data: { ticketId } });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// ─── Authenticated ticket CRUD ─────────────────────────────────────────────

router.post('/tickets', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const { subject, description, priority, state, lga } = req.body;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const result = await db.query(
      `INSERT INTO support_tickets (subject, description, priority, status, user_id, state, lga)
       VALUES ($1, $2, $3, 'open', $4, $5, $6) RETURNING *`,
      [subject.trim(), description?.trim() || null, priority || 'medium', req.user.id, state || null, lga || null]
    );

    const ticket = result.rows[0];

    // Auto-assign: LGA support → State support → Super support
    if (state) {
      try {
        let assignedTo = null;

        if (lga) {
          const lgaResult = await db.query(
            `SELECT id FROM users
             WHERE user_type = 'lga_support_admin'
               AND assigned_state = $1
               AND assigned_city = $2
               AND deleted_at IS NULL AND account_suspended_at IS NULL
             ORDER BY id ASC LIMIT 1`,
            [state, lga]
          );
          if (lgaResult.rows.length > 0) assignedTo = lgaResult.rows[0].id;
        }

        if (!assignedTo) {
          const stateResult = await db.query(
            `SELECT id FROM users
             WHERE user_type = 'state_support_admin'
               AND assigned_state = $1
               AND deleted_at IS NULL AND account_suspended_at IS NULL
             ORDER BY id ASC LIMIT 1`,
            [state]
          );
          if (stateResult.rows.length > 0) assignedTo = stateResult.rows[0].id;
        }

        if (!assignedTo) {
          const superResult = await db.query(
            `SELECT id FROM users
             WHERE user_type = 'super_support_admin'
               AND deleted_at IS NULL AND account_suspended_at IS NULL
             ORDER BY id ASC LIMIT 1`
          );
          if (superResult.rows.length > 0) assignedTo = superResult.rows[0].id;
        }

        if (assignedTo) {
          await db.query('UPDATE support_tickets SET assigned_to = $1 WHERE id = $2', [assignedTo, ticket.id]);
          ticket.assigned_to = assignedTo;
        }
      } catch (assignErr) {
        console.error('Ticket auto-assignment error (non-fatal):', assignErr);
      }
    }

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
});

router.get('/tickets/my', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.state, st.lga, st.priority, st.status,
              st.escalated_at, st.resolved_at, st.created_at, st.updated_at,
              (SELECT COUNT(*) FROM support_ticket_replies str WHERE str.ticket_id = st.id AND str.is_admin = TRUE AND (str.read_at IS NULL OR str.read_at < st.updated_at))::int AS unread_admin_replies
       FROM support_tickets st
       WHERE st.user_id = $1
       ORDER BY st.created_at DESC LIMIT 50`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('My support tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your tickets' });
  }
});

// ─── Admin ticket listing (scoped) ─────────────────────────────────────────

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

    const role = String(req.user.user_type || '').toLowerCase();

    if (role === 'lga_support_admin') {
      params.push(req.user.id);
      params.push(String(req.user.assigned_state || ''));
      params.push(String(req.user.assigned_city || ''));
      where.push(`(
        st.assigned_to = $${params.length - 2}
        OR (st.assigned_to IS NULL AND st.state = $${params.length - 1} AND st.lga = $${params.length})
      )`);
    } else if (role === 'state_support_admin') {
      params.push(req.user.id);
      params.push(String(req.user.assigned_state || ''));
      where.push(`(
        st.assigned_to = $${params.length - 1}
        OR (st.assigned_to IS NULL AND st.state = $${params.length})
      )`);
    }

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.state, st.lga, st.priority, st.status,
              st.created_at, st.updated_at, st.escalated_at, st.resolved_at,
              st.assigned_to,
              u.email AS user_email, u.full_name AS user_name,
              a.email AS assigned_email, a.full_name AS assigned_name,
              (SELECT COUNT(*) FROM support_ticket_replies str WHERE str.ticket_id = st.id AND str.is_admin = FALSE AND (str.read_at IS NULL))::int AS unread_user_replies
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users a ON a.id = st.assigned_to
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY
         CASE st.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         st.created_at DESC
       LIMIT 100`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Support tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support tickets' });
  }
});

// ─── Escalate ──────────────────────────────────────────────────────────────

router.post('/tickets/escalate', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.body?.ticketId || req.body?.ticket_id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const currentUserType = req.user.user_type;
    const currentUserId = req.user.id;

    const ticketResult = await db.query(
      `SELECT st.*, u.email AS user_email, u.full_name AS user_name
       FROM support_tickets st LEFT JOIN users u ON u.id = st.user_id WHERE st.id = $1`,
      [ticketId]
    );

    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const ticketState = ticket.state || null;

    let nextAssigneeId = null;
    let escalationNote = '';

    if (currentUserType === 'lga_support_admin') {
      if (ticketState) {
        const stateResult = await db.query(
          `SELECT id FROM users
           WHERE user_type = 'state_support_admin' AND assigned_state = $1
             AND deleted_at IS NULL AND account_suspended_at IS NULL
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
      const superResult = await db.query(
        `SELECT id FROM users
         WHERE user_type = 'super_support_admin'
           AND deleted_at IS NULL AND account_suspended_at IS NULL
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
      `UPDATE support_tickets SET priority = 'urgent',
         status = CASE WHEN status = 'resolved' THEN status ELSE 'in_progress' END,
         assigned_to = $1, escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
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
    res.status(500).json({ success: false, message: 'Failed to escalate support ticket' });
  }
});

// ─── Assign / Resolve ─────────────────────────────────────────────────────

router.patch('/tickets/:id/assign', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const assignedTo = req.body.assigned_to ? Number(req.body.assigned_to) : req.user.id;

    const result = await db.query(
      `UPDATE support_tickets SET assigned_to = $1,
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [assignedTo, ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Assign support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign support ticket' });
  }
});

router.patch('/tickets/:id/resolve', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const result = await db.query(
      `UPDATE support_tickets SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Resolve support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve support ticket' });
  }
});

// ─── Conversation endpoints ────────────────────────────────────────────────

// GET /tickets/:id/conversation — paginated, with read receipts
router.get('/tickets/:id/conversation', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    // Access check
    if (!isSupportAdmin) {
      const ownerCheck = await db.query(
        'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
        [ticketId, req.user.id]
      );
      if (!ownerCheck.rows.length) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Pagination
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await db.query(
      `SELECT str.id, str.ticket_id, str.user_id, str.author_name, str.message,
              str.is_admin, str.attachment_url, str.attachment_name, str.attachment_type,
              str.edited_at, str.read_at, str.created_at,
              u.email AS user_email
       FROM support_ticket_replies str
       LEFT JOIN users u ON u.id = str.user_id
       WHERE str.ticket_id = $1
       ORDER BY str.created_at ASC, str.id ASC
       LIMIT $2 OFFSET $3`,
      [ticketId, limit, offset]
    );

    // Count total for pagination
    const countResult = await db.query(
      'SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = $1',
      [ticketId]
    );

    // If viewer is a support admin, mark all non-admin replies as read
    if (isSupportAdmin) {
      await db.query(
        `UPDATE support_ticket_replies SET read_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND is_admin = FALSE AND read_at IS NULL`,
        [ticketId]
      );
    }

    // If viewer is the ticket owner, mark all admin replies as read
    if (!isSupportAdmin) {
      await db.query(
        `UPDATE support_ticket_replies SET read_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND is_admin = TRUE AND read_at IS NULL`,
        [ticketId]
      );
    }

    res.json({
      success: true,
      data: result.rows,
      meta: { total: parseInt(countResult.rows[0].count), limit, offset },
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
});

// POST /tickets/:id/reply — add reply with optional file attachment
router.post('/tickets/:id/reply', authenticate, uploadAttachment.single('attachment'), async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const message = req.body?.message?.trim();
    const hasAttachment = !!req.file;

    if (!message && !hasAttachment) {
      return res.status(400).json({ success: false, message: 'Message or attachment is required' });
    }

    // Fetch ticket
    const ticketResult = await db.query(
      'SELECT id, subject, user_id, status, assigned_to FROM support_tickets WHERE id = $1',
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
      `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin, attachment_url, attachment_name, attachment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        ticketId,
        req.user.id,
        isSupportAdmin ? (req.user.full_name || 'Support Team') : (req.user.full_name || req.user.email),
        message || '',
        isSupportAdmin,
        req.file ? `/uploads/tickets/${req.file.filename}` : null,
        req.file ? req.file.originalname : null,
        req.file ? req.file.mimetype : null,
      ]
    );

    const reply = result.rows[0];

    // Re-open if resolved
    if (ticket.status === 'resolved') {
      await db.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticketId]
      );
    }

    // Notifications & email (async, non-blocking)
    const recipientId = isSupportAdmin ? ticket.user_id : (ticket.assigned_to || null);
    addReplyNotification(reply, ticket, req.user.id, recipientId);
    sendReplyEmail(reply, ticket, req.user);

    // Socket real-time event
    emitToUser(recipientId, 'ticket:new_reply', {
      ticketId: ticket.id,
      subject: ticket.subject,
      reply: {
        id: reply.id,
        message: reply.message,
        is_admin: reply.is_admin,
        author_name: reply.author_name,
        attachment_url: reply.attachment_url,
        attachment_name: reply.attachment_name,
        attachment_type: reply.attachment_type,
        created_at: reply.created_at,
      },
    });

    res.status(201).json({ success: true, data: reply });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
});

// PATCH /tickets/:ticketId/reply/:replyId/read — mark reply as read
router.patch('/tickets/:ticketId/reply/:replyId/read', authenticate, async (req, res) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const replyId = Number(req.params.replyId);

    await db.query(
      `UPDATE support_ticket_replies SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND ticket_id = $2`,
      [replyId, ticketId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark reply read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// PATCH /tickets/:ticketId/reply/:replyId — edit reply
router.patch('/tickets/:ticketId/reply/:replyId', authenticate, async (req, res) => {
  try {
    const replyId = Number(req.params.replyId);
    const ticketId = Number(req.params.ticketId);
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const replyResult = await db.query(
      'SELECT id, user_id, is_admin FROM support_ticket_replies WHERE id = $1 AND ticket_id = $2',
      [replyId, ticketId]
    );
    if (!replyResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Reply not found' });
    }

    const reply = replyResult.rows[0];
    if (reply.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own replies' });
    }

    const result = await db.query(
      `UPDATE support_ticket_replies SET message = $1, edited_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [message.trim(), replyId]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Edit reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to edit reply' });
  }
});

// DELETE /tickets/:ticketId/reply/:replyId — delete reply
router.delete('/tickets/:ticketId/reply/:replyId', authenticate, async (req, res) => {
  try {
    const replyId = Number(req.params.replyId);
    const ticketId = Number(req.params.ticketId);

    const replyResult = await db.query(
      'SELECT id, user_id FROM support_ticket_replies WHERE id = $1 AND ticket_id = $2',
      [replyId, ticketId]
    );
    if (!replyResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Reply not found' });
    }

    const reply = replyResult.rows[0];
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    if (reply.user_id !== req.user.id && !isSupportAdmin) {
      return res.status(403).json({ success: false, message: 'You cannot delete this reply' });
    }

    // Delete file if present
    const fileResult = await db.query(
      'SELECT attachment_url FROM support_ticket_replies WHERE id = $1',
      [replyId]
    );
    if (fileResult.rows.length && fileResult.rows[0].attachment_url) {
      const filePath = path.join(__dirname, '..', fileResult.rows[0].attachment_url);
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }

    await db.query('DELETE FROM support_ticket_replies WHERE id = $1', [replyId]);

    res.json({ success: true, message: 'Reply deleted' });
  } catch (error) {
    console.error('Delete reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete reply' });
  }
});

// POST /tickets/:id/typing — typing indicator
router.post('/tickets/:id/typing', authenticate, async (req, res) => {
  try {
    const ticketId = Number(req.params.id);

    const ticketResult = await db.query(
      'SELECT id, user_id, assigned_to FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const isAdmin = SUPPORT_ADMIN_ROLES.has(String(req.user.user_type || '').toLowerCase());
    const recipientId = isAdmin ? ticket.user_id : (ticket.assigned_to || null);

    if (recipientId) {
      emitToUser(recipientId, 'ticket:typing', {
        ticketId: ticket.id,
        userId: req.user.id,
        userName: req.user.full_name || req.user.email,
        isAdmin,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Typing indicator error:', error);
    res.status(500).json({ success: false, message: 'Failed to send typing indicator' });
  }
});

// GET /tickets/unread/count — unread ticket replies for current user
router.get('/tickets/unread/count', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    let result;
    if (isSupportAdmin) {
      // Count tickets with unread user replies assigned to this admin
      result = await db.query(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT st.id FROM support_tickets st
          WHERE st.assigned_to = $1
            AND EXISTS (
              SELECT 1 FROM support_ticket_replies str
              WHERE str.ticket_id = st.id AND str.is_admin = FALSE AND str.read_at IS NULL
            )
        ) sub`,
        [req.user.id]
      );
    } else {
      // Count tickets with unread admin replies for this user
      result = await db.query(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT st.id FROM support_tickets st
          WHERE st.user_id = $1
            AND EXISTS (
              SELECT 1 FROM support_ticket_replies str
              WHERE str.ticket_id = st.id AND str.is_admin = TRUE AND str.read_at IS NULL
            )
        ) sub`,
        [req.user.id]
      );
    }

    res.json({ success: true, count: parseInt(result.rows[0].cnt) });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

// GET /tickets/internal-notes/unread-count — count tickets with unread internal notes for this admin
router.get('/tickets/internal-notes/unread-count', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const result = await db.query(
      `SELECT COUNT(*) AS cnt FROM (
        SELECT DISTINCT sin.ticket_id FROM support_ticket_internal_notes sin
        WHERE sin.user_id != $1 AND sin.read_at IS NULL
      ) sub`,
      [req.user.id]
    );

    res.json({ success: true, count: parseInt(result.rows[0].cnt) });
  } catch (error) {
    console.error('Unread internal notes count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

// POST /tickets/contact-lookup — look up contact-form tickets by email (public)
router.post('/tickets/contact-lookup', async (req, res) => {
  try {
    await ensureSupportSchema();

    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const result = await db.query(
      `SELECT id, subject, status, created_at FROM support_tickets
       WHERE contact_email = $1 AND user_id IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      [email.trim().toLowerCase()]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Contact lookup error:', error);
    res.status(500).json({ success: false, message: 'Lookup failed' });
  }
});

// POST /tickets/contact-conversation — get replies for a contact-form ticket (public, email-gated)
router.post('/tickets/contact-conversation', async (req, res) => {
  try {
    await ensureSupportSchema();

    const { ticketId, email } = req.body;
    if (!ticketId || !email) {
      return res.status(400).json({ success: false, message: 'Ticket ID and email are required' });
    }

    const ticketResult = await db.query(
      'SELECT id, contact_email FROM support_tickets WHERE id = $1 AND user_id IS NULL',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticketResult.rows[0].contact_email !== email.trim().toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Email does not match this ticket' });
    }

    const result = await db.query(
      `SELECT str.id, str.message, str.is_admin, str.author_name, str.attachment_url, str.attachment_name, str.attachment_type, str.created_at
       FROM support_ticket_replies str
       WHERE str.ticket_id = $1
       ORDER BY str.created_at ASC, str.id ASC`,
      [ticketId]
    );

    res.json({ success: true, data: result.rows, ticket: { id: ticketResult.rows[0].id, contact_email: ticketResult.rows[0].contact_email } });
  } catch (error) {
    console.error('Contact conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
});

// ─── Internal Notes (admin-to-admin) ──────────────────────────────────────

// GET /tickets/:id/internal-notes — fetch internal notes for a ticket
router.get('/tickets/:id/internal-notes', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await db.query(
      `SELECT sin.id, sin.ticket_id, sin.user_id, sin.author_name, sin.author_role, sin.message, sin.read_at, sin.created_at,
              u.email AS user_email
       FROM support_ticket_internal_notes sin
       LEFT JOIN users u ON u.id = sin.user_id
       WHERE sin.ticket_id = $1
       ORDER BY sin.created_at ASC, sin.id ASC
       LIMIT $2 OFFSET $3`,
      [ticketId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM support_ticket_internal_notes WHERE ticket_id = $1',
      [ticketId]
    );

    // Mark notes as read by this admin
    await db.query(
      `UPDATE support_ticket_internal_notes SET read_at = CURRENT_TIMESTAMP
       WHERE ticket_id = $1 AND (read_at IS NULL OR read_at < CURRENT_TIMESTAMP)`,
      [ticketId]
    );

    res.json({ success: true, data: result.rows, meta: { total: parseInt(countResult.rows[0].count), limit, offset } });
  } catch (error) {
    console.error('Get internal notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch internal notes' });
  }
});

// POST /tickets/:id/internal-notes — add internal note
router.post('/tickets/:id/internal-notes', authenticate, requireSupportAdmin, async (req, res) => {
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

    // Verify ticket exists
    const ticketResult = await db.query(
      'SELECT id, subject, assigned_to FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    const result = await db.query(
      `INSERT INTO support_ticket_internal_notes (ticket_id, user_id, author_name, author_role, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        ticketId,
        req.user.id,
        req.user.full_name || req.user.email || 'Support Admin',
        req.user.user_type || 'support_admin',
        message.trim(),
      ]
    );

    const note = result.rows[0];

    // Notify only relevant admins (assigned to ticket or jurisdiction-scoped)
    try {
      const { createNotification } = require('../config/utils/notificationService');
      const adminsResult = await db.query(
        `SELECT id FROM users
         WHERE user_type IN ('super_support_admin', 'state_support_admin', 'lga_support_admin')
           AND id != $1
           AND deleted_at IS NULL AND account_suspended_at IS NULL
           AND (
             id = $2
             OR (user_type = 'super_support_admin')
             OR (user_type = 'state_support_admin' AND assigned_state = $3)
             OR (user_type = 'lga_support_admin' AND assigned_state = $3 AND assigned_city = $4)
           )`,
        [req.user.id, ticket.assigned_to, ticket.state || '', ticket.lga || '']
      );
      for (const admin of adminsResult.rows) {
        await createNotification(
          admin.id,
          'internal_note',
          `Internal note on ticket "${ticket.subject}"`,
          `${note.author_name} posted an internal note on "${ticket.subject}"`,
          `/support/tickets/${ticketId}`
        );
        emitToUser(admin.id, 'ticket:internal_note', {
          ticketId,
          subject: ticket.subject,
          note: {
            id: note.id,
            author_name: note.author_name,
            preview: note.message.substring(0, 100),
            created_at: note.created_at,
          },
        });
      }
    } catch (notifyErr) {
      console.error('Internal note notification error (non-fatal):', notifyErr);
    }

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error('Create internal note error:', error);
    res.status(500).json({ success: false, message: 'Failed to create internal note' });
  }
});

// PATCH /tickets/:ticketId/internal-notes/:noteId — edit own internal note
router.patch('/tickets/:ticketId/internal-notes/:noteId', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const noteId = Number(req.params.noteId);
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const noteResult = await db.query(
      'SELECT id, user_id FROM support_ticket_internal_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!noteResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (noteResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own notes' });
    }

    const result = await db.query(
      `UPDATE support_ticket_internal_notes SET message = $1 WHERE id = $2 RETURNING *`,
      [message.trim(), noteId]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Edit internal note error:', error);
    res.status(500).json({ success: false, message: 'Failed to edit internal note' });
  }
});

// DELETE /tickets/:ticketId/internal-notes/:noteId — delete own internal note
router.delete('/tickets/:ticketId/internal-notes/:noteId', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.ticketId);
    const noteId = Number(req.params.noteId);

    const noteResult = await db.query(
      'SELECT id, user_id FROM support_ticket_internal_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!noteResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    const note = noteResult.rows[0];
    if (note.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own notes' });
    }

    await db.query('DELETE FROM support_ticket_internal_notes WHERE id = $1', [noteId]);

    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Delete internal note error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete internal note' });
  }
});

module.exports = router;
