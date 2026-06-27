const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const { contactFormLimiter, typingLimiter } = require('../config/middleware/securityRateLimiters');

const SUPPORT_ADMIN_ROLES = new Set([
  'super_admin',
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
]);

const SUPPORT_TICKET_CATEGORIES = new Set([
  'general',
  'account',
  'property',
  'tenancy',
  'payment',
  'transportation',
  'fumigation_cleaning',
  'legal',
  'technical',
]);

const SUPPORT_RELATED_TYPES = new Set([
  'transportation_booking',
  'fumigation_cleaning_booking',
  'property_request',
  'tenancy_request',
  'payment',
  'dispute',
]);

const SUPPORT_DEPARTMENTS = new Set([
  'support',
  'transportation',
  'fumigation',
  'finance',
  'legal',
  'technical',
]);

const ESCALATION_STATUSES = new Set([
  'none',
  'escalated',
  'acknowledged',
  'action_required',
  'resolved',
]);

const DEPARTMENT_ESCALATION_ROLES = {
  transportation: new Set([
    'transportation_admin',
    'lga_transportation_admin',
    'state_transportation_admin',
    'super_transportation_admin',
    'super_admin',
    'super_support_admin',
  ]),
  fumigation: new Set([
    'fumigation_admin',
    'lga_fumigation_admin',
    'state_fumigation_admin',
    'super_fumigation_admin',
    'super_admin',
    'super_support_admin',
  ]),
  finance: new Set([
    'financial_admin',
    'lga_financial_admin',
    'state_financial_admin',
    'super_financial_admin',
    'super_admin',
    'super_support_admin',
  ]),
  legal: new Set([
    'lawyer',
    'state_lawyer',
    'super_lawyer',
    'super_admin',
    'super_support_admin',
  ]),
  technical: new Set([
    'admin',
    'super_admin',
    'super_support_admin',
  ]),
};

let supportSchemaReady = false;

// In-memory admin activity store for anonymous presence/typing indicators
const adminActivity = {
  typing: new Map(),   // ticketId -> { userId, userName, timestamp }
  viewing: new Map(),  // ticketId -> { userId, userName, timestamp }
};
// Clean stale entries every 30 seconds
const adminActivityCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ticketId, data] of adminActivity.typing) {
    if (now - data.timestamp > 5000) adminActivity.typing.delete(ticketId);
  }
  for (const [ticketId, data] of adminActivity.viewing) {
    if (now - data.timestamp > 30000) adminActivity.viewing.delete(ticketId);
  }
}, 30000);
if (typeof adminActivityCleanup.unref === 'function') adminActivityCleanup.unref();

const MAGIC_BYTES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x39, 0x37], [0x47, 0x49, 0x46, 0x38, 0x38, 0x61]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/msword': [[0xD0, 0xCF, 0x11, 0xE0]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]],
  'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]],
  'audio/webm': [[0x1A, 0x45, 0xDF, 0xA3]],
  'audio/ogg': [[0x4F, 0x67, 0x67, 0x53]],
  'audio/wav': [[0x52, 0x49, 0x46, 0x46]],
};

const verifyMagicBytes = (filePath, expectedMime) => {
  if (expectedMime === 'text/plain' || MAGIC_BYTES[expectedMime] === 'skip') return true;
  const signatures = MAGIC_BYTES[expectedMime];
  if (!signatures) return false;
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  return signatures.some((sig) => sig.every((byte, i) => buf[i] === byte));
};

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

const verifyUploadedFile = (req, res, next) => {
  if (!req.file) return next();
  if (req.file.mimetype === 'text/plain') return next();
  if (!verifyMagicBytes(req.file.path, req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ success: false, message: 'Uploaded file content does not match its declared type' });
  }
  next();
};

let _ioCache = null;
const getIO = () => {
  if (process.env.NODE_ENV === 'test') return null;
  if (_ioCache) return _ioCache;
  try { _ioCache = require('../server').io; return _ioCache; } catch { return null; }
};

const emitToUser = (userId, event, data) => {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

const emitToRole = (role, event, data) => {
  const io = getIO();
  if (!io) return;
  io.to(`role:${role}`).emit(event, data);
};

const emitToGuestTicket = (ticketId, event, data) => {
  const io = getIO();
  if (!io) return;
  const nsp = io.of('/guest');
  if (nsp) nsp.to(`ticket:guest:${ticketId}`).emit(event, data);
};

const emitTicketToAdmins = (event, payload) => {
  for (const role of SUPPORT_ADMIN_ROLES) {
    emitToRole(role, event, payload);
  }
};

const emitTicketUpdated = (ticket, extra = {}) => {
  if (!ticket?.id) return;
  const payload = {
    ticketId: ticket.id,
    ticket: { ...ticket, ...extra },
  };
  emitTicketToAdmins('ticket:updated', payload);
  if (ticket.user_id) emitToUser(ticket.user_id, 'ticket:updated', payload);
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
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      related_type VARCHAR(50),
      related_id INTEGER,
      escalation_department VARCHAR(50) NOT NULL DEFAULT 'support',
      escalation_status VARCHAR(30) NOT NULL DEFAULT 'none',
      escalation_note TEXT,
      sla_due_at TIMESTAMP,
      last_escalated_at TIMESTAMP,
      resolution_summary TEXT,
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
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='category') THEN
        ALTER TABLE support_tickets ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'general';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='related_type') THEN
        ALTER TABLE support_tickets ADD COLUMN related_type VARCHAR(50);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='related_id') THEN
        ALTER TABLE support_tickets ADD COLUMN related_id INTEGER;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='escalation_department') THEN
        ALTER TABLE support_tickets ADD COLUMN escalation_department VARCHAR(50) NOT NULL DEFAULT 'support';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='escalation_status') THEN
        ALTER TABLE support_tickets ADD COLUMN escalation_status VARCHAR(30) NOT NULL DEFAULT 'none';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='escalation_note') THEN
        ALTER TABLE support_tickets ADD COLUMN escalation_note TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='sla_due_at') THEN
        ALTER TABLE support_tickets ADD COLUMN sla_due_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='last_escalated_at') THEN
        ALTER TABLE support_tickets ADD COLUMN last_escalated_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='resolution_summary') THEN
        ALTER TABLE support_tickets ADD COLUMN resolution_summary TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='sla_warning_notified_at') THEN
        ALTER TABLE support_tickets ADD COLUMN sla_warning_notified_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='sla_breach_notified_at') THEN
        ALTER TABLE support_tickets ADD COLUMN sla_breach_notified_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='escalation_ack_notified_at') THEN
        ALTER TABLE support_tickets ADD COLUMN escalation_ack_notified_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='department_resolution_notified_at') THEN
        ALTER TABLE support_tickets ADD COLUMN department_resolution_notified_at TIMESTAMP;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
      ON support_tickets(status, priority, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_service_context
      ON support_tickets(related_type, related_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_department_escalation
      ON support_tickets(escalation_department, escalation_status);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_sla
      ON support_tickets(sla_due_at);

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

    CREATE TABLE IF NOT EXISTS support_ticket_timeline (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      actor_role VARCHAR(50),
      event_type VARCHAR(80) NOT NULL,
      message TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_support_ticket_timeline_ticket
      ON support_ticket_timeline(ticket_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS support_policy_settings (
      key VARCHAR(80) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  supportSchemaReady = true;
};

const requireSupportAdmin = (req, res, next) => {
  const role = String(req.user?.user_type || '').toLowerCase();
  if (SUPPORT_ADMIN_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Support admin access required' });
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const normalizeSupportCategory = (value, relatedType) => {
  const normalized = normalizeText(value).replace(/-/g, '_');
  if (SUPPORT_TICKET_CATEGORIES.has(normalized)) return normalized;
  if (relatedType === 'transportation_booking') return 'transportation';
  if (relatedType === 'fumigation_cleaning_booking') return 'fumigation_cleaning';
  return 'general';
};

const normalizeRelatedType = (value) => {
  const normalized = normalizeText(value).replace(/-/g, '_');
  return SUPPORT_RELATED_TYPES.has(normalized) ? normalized : null;
};

const normalizeDepartment = (value, category, relatedType) => {
  const normalized = normalizeText(value).replace(/-/g, '_');
  if (SUPPORT_DEPARTMENTS.has(normalized)) return normalized;
  if (relatedType === 'transportation_booking' || category === 'transportation') return 'transportation';
  if (relatedType === 'fumigation_cleaning_booking' || category === 'fumigation_cleaning') return 'fumigation';
  if (category === 'payment') return 'finance';
  if (category === 'legal') return 'legal';
  if (category === 'technical') return 'technical';
  return 'support';
};

const normalizeEscalationStatus = (value) => {
  const normalized = normalizeText(value).replace(/-/g, '_');
  return ESCALATION_STATUSES.has(normalized) ? normalized : 'escalated';
};

const departmentsForUser = (user) => {
  const role = normalizeText(user?.user_type);
  const departments = [];
  for (const [department, roles] of Object.entries(DEPARTMENT_ESCALATION_ROLES)) {
    if (roles.has(role)) departments.push(department);
  }
  return departments;
};

const canAccessDepartmentEscalation = (user, ticket = {}) => {
  const role = normalizeText(user?.user_type);
  if (SUPPORT_ADMIN_ROLES.has(role)) return canSupportAdminAccessTicket(user, ticket);
  const department = normalizeDepartment(ticket.escalation_department, ticket.category, ticket.related_type);
  const roleDepartments = departmentsForUser(user);
  if (!roleDepartments.includes(department)) return false;

  if (role.startsWith('super_') || role === 'super_admin') return true;
  const ticketState = normalizeText(ticket.state);
  const ticketLga = normalizeText(ticket.lga);
  const userState = normalizeText(user?.assigned_state);
  const userLga = normalizeText(user?.assigned_city);

  if (role.startsWith('state_')) return Boolean(!ticketState || (userState && ticketState === userState));
  if (role.startsWith('lga_')) return Boolean(!ticketState || !ticketLga || (userState && userLga && ticketState === userState && ticketLga === userLga));
  return true;
};

const addDepartmentEscalationScope = (where, params, user, alias = 'st') => {
  const role = normalizeText(user?.user_type);
  where.push(`${alias}.escalation_status <> 'none'`);

  if (SUPPORT_ADMIN_ROLES.has(role)) {
    addSupportTicketScope(where, params, user, alias);
    return;
  }

  const departments = departmentsForUser(user);
  if (!departments.length) {
    where.push('1 = 0');
    return;
  }

  params.push(departments);
  where.push(`${alias}.escalation_department = ANY($${params.length})`);

  if (role.startsWith('state_') && user.assigned_state) {
    params.push(normalizeText(user.assigned_state));
    where.push(`(LOWER(COALESCE(${alias}.state, '')) = $${params.length} OR ${alias}.state IS NULL)`);
  }

  if (role.startsWith('lga_') && user.assigned_state && user.assigned_city) {
    params.push(normalizeText(user.assigned_state));
    const stateParam = `$${params.length}`;
    params.push(normalizeText(user.assigned_city));
    const lgaParam = `$${params.length}`;
    where.push(`((LOWER(COALESCE(${alias}.state, '')) = ${stateParam} AND LOWER(COALESCE(${alias}.lga, '')) = ${lgaParam}) OR ${alias}.state IS NULL OR ${alias}.lga IS NULL)`);
  }
};

const resolveSlaDueAt = (category, priority) => {
  const normalizedPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
  const hoursByPriority = { urgent: 2, high: 4, medium: 24, low: 72 };
  let hours = hoursByPriority[normalizedPriority] || 24;
  if (['transportation', 'fumigation_cleaning', 'payment'].includes(category) && normalizedPriority === 'medium') {
    hours = 12;
  }
  const dueAt = new Date();
  dueAt.setHours(dueAt.getHours() + hours);
  return dueAt;
};

const addTicketTimeline = async (ticketId, actor, eventType, message, metadata = {}) => {
  try {
    await db.query(
      `INSERT INTO support_ticket_timeline
         (ticket_id, actor_id, actor_name, actor_role, event_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        ticketId,
        actor?.id || null,
        actor?.full_name || actor?.name || actor?.email || null,
        actor?.user_type || null,
        eventType,
        message || null,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (err) {
    console.error('Support ticket timeline error (non-fatal):', err);
  }
};

const getRelatedServiceContext = async (ticket) => {
  const relatedId = Number(ticket?.related_id);
  if (!ticket?.related_type || !Number.isInteger(relatedId) || relatedId <= 0) {
    return null;
  }

  if (ticket.related_type === 'transportation_booking') {
    const result = await db.query(
      `SELECT tb.id, tb.booking_status, tb.payment_status, tb.pickup_address, tb.destination_address,
              tb.booking_date, tb.booking_time, tb.total_price, tb.driver_name, tb.driver_phone,
              tb.vehicle_number, tb.created_at, ts.service_name, ts.service_type, ts.provider_name,
              p.title AS property_title, p.city AS property_city,
              u.full_name AS tenant_name, u.email AS tenant_email, u.phone AS tenant_phone
       FROM transportation_bookings tb
       LEFT JOIN transportation_services ts ON ts.id = tb.service_id
       LEFT JOIN properties p ON p.id = tb.property_id
       LEFT JOIN users u ON u.id = tb.tenant_id
       WHERE tb.id = $1`,
      [relatedId]
    );
    return result.rows[0] ? { type: 'transportation_booking', data: result.rows[0] } : null;
  }

  if (ticket.related_type === 'fumigation_cleaning_booking') {
    const result = await db.query(
      `SELECT fcb.id, fcb.booking_reference, fcb.booking_status, fcb.payment_status,
              fcb.booking_date, fcb.preferred_time_slot, fcb.specific_time, fcb.total_price,
              fcb.assigned_team_leader, fcb.team_contact_phone, fcb.created_at,
              fcs.service_name, fcc.category_name, fcc.category_type,
              p.title AS property_title, p.full_address AS property_address,
              u.full_name AS tenant_name, u.email AS tenant_email, u.phone AS tenant_phone,
              sp.company_name AS assigned_provider, sp.contact_phone AS provider_phone,
              sp.contact_email AS provider_email
       FROM fumigation_cleaning_bookings fcb
       LEFT JOIN fumigation_cleaning_services fcs ON fcs.id = fcb.service_id
       LEFT JOIN fumigation_cleaning_categories fcc ON fcc.id = fcs.category_id
       LEFT JOIN properties p ON p.id = fcb.property_id
       LEFT JOIN users u ON u.id = fcb.tenant_id
       LEFT JOIN service_providers sp ON sp.id = (
         SELECT provider_id FROM booking_provider_assignments
         WHERE booking_id = fcb.id
         ORDER BY assigned_at DESC
         LIMIT 1
       )
       WHERE fcb.id = $1`,
      [relatedId]
    );
    return result.rows[0] ? { type: 'fumigation_cleaning_booking', data: result.rows[0] } : null;
  }

  return null;
};

const getRelatedAdminPath = (ticket = {}, role = '') => {
  const normalizedRole = normalizeText(role);
  const relatedId = Number(ticket.related_id);
  const queryId = Number.isInteger(relatedId) && relatedId > 0 ? `&bookingId=${relatedId}` : '';

  if (ticket.related_type === 'transportation_booking' || ticket.category === 'transportation') {
    if (normalizedRole === 'super_admin' || normalizedRole === 'super_transportation_admin') {
      return `/super-admin/transportation?tab=bookings${queryId}`;
    }
    if (normalizedRole === 'state_transportation_admin') {
      return `/admin/transportation/state?tab=bookings${queryId}`;
    }
    return `/admin/transportation?tab=bookings${queryId}`;
  }

  if (ticket.related_type === 'fumigation_cleaning_booking' || ticket.category === 'fumigation_cleaning') {
    const query = Number.isInteger(relatedId) && relatedId > 0 ? `?bookingId=${relatedId}` : '';
    if (normalizedRole === 'super_admin' || normalizedRole === 'super_fumigation_admin') {
      return `/super-admin/fumigation-cleaning${query}#fumigation-bookings`;
    }
    if (normalizedRole === 'state_fumigation_admin') {
      return `/admin/fumigation-cleaning/state${query}#fumigation-bookings`;
    }
    return `/admin/fumigation-cleaning${query}#fumigation-bookings`;
  }

  if (ticket.category === 'payment') {
    if (normalizedRole === 'super_admin' || normalizedRole === 'super_financial_admin') {
      return '/admin/super-financial-dashboard?panel=transactions';
    }
    return '/admin/financial-dashboard?tab=transactions';
  }

  return null;
};

const getDepartmentEscalationPath = (department, role = '') => {
  const normalizedDepartment = normalizeDepartment(department);
  const normalizedRole = normalizeText(role);
  if (normalizedDepartment === 'transportation') {
    if (normalizedRole === 'super_transportation_admin') return '/super-admin/transportation?tab=support-escalations';
    if (normalizedRole === 'state_transportation_admin') return '/admin/transportation/state?tab=support-escalations';
    return '/admin/transportation?tab=support-escalations';
  }
  if (normalizedDepartment === 'fumigation') {
    if (normalizedRole === 'super_fumigation_admin') return '/super-admin/fumigation-cleaning#support-escalations';
    if (normalizedRole === 'state_fumigation_admin') return '/admin/fumigation-cleaning/state#support-escalations';
    return '/admin/fumigation-cleaning#support-escalations';
  }
  if (normalizedDepartment === 'finance') {
    if (normalizedRole === 'super_financial_admin') return '/admin/super-financial-dashboard?panel=support-escalations';
    return '/admin/financial-dashboard?tab=support-escalations';
  }
  return '/admin/super-support-dashboard?tab=escalations';
};

const findDepartmentEscalationRecipients = async (ticket, department) => {
  const roles = DEPARTMENT_ESCALATION_ROLES[normalizeDepartment(department)] || new Set();
  if (!roles.size) return [];

  const params = [Array.from(roles)];
  const where = [`LOWER(user_type) = ANY($1)`, `deleted_at IS NULL`, `account_suspended_at IS NULL`];
  const ticketState = normalizeText(ticket.state);
  const ticketLga = normalizeText(ticket.lga);

  if (ticketState) {
    params.push(ticketState);
    where.push(`(assigned_state IS NULL OR LOWER(COALESCE(assigned_state, '')) = $${params.length} OR LOWER(user_type) LIKE 'super_%' OR LOWER(user_type) IN ('super_admin', 'super_support_admin'))`);
  }

  if (ticketLga) {
    params.push(ticketLga);
    where.push(`(assigned_city IS NULL OR LOWER(COALESCE(assigned_city, '')) = $${params.length} OR LOWER(user_type) NOT LIKE 'lga_%')`);
  }

  const result = await db.query(
    `SELECT id, full_name, email, user_type
     FROM users
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE
         WHEN LOWER(user_type) LIKE 'lga_%' THEN 1
         WHEN LOWER(user_type) LIKE 'state_%' THEN 2
         WHEN LOWER(user_type) LIKE 'super_%' OR LOWER(user_type) = 'super_admin' THEN 3
         ELSE 4
       END
     LIMIT 30`,
    params
  );

  return result.rows;
};

const notifyDepartmentEscalation = async (ticket, department, note = '') => {
  try {
    const { createNotification } = require('../config/utils/notificationService');
    const recipients = await findDepartmentEscalationRecipients(ticket, department);
    const notified = new Set();

    for (const user of recipients) {
      if (!user.id || notified.has(user.id)) continue;
      notified.add(user.id);
      await createNotification(
        user.id,
        'support_department_escalation',
        'Support ticket needs department action',
        `Ticket #${ticket.id} "${ticket.subject}" was handed to ${normalizeDepartment(department).replace(/_/g, ' ')}.${note ? ` Note: ${note}` : ''}`,
        getDepartmentEscalationPath(department, user.user_type)
      );
      emitToUser(user.id, 'ticket:department_escalated', { ticketId: ticket.id, ticket, department });
    }
  } catch (err) {
    console.error('Department escalation notification error:', err);
  }
};

const sendSupportAlertEmails = async (recipientIds, subject, message, path = '/admin/super-support-dashboard?tab=escalations') => {
  try {
    const ids = Array.from(recipientIds || []).filter(Boolean);
    if (!ids.length) return;

    const recipients = await db.query(
      `SELECT id, email, full_name
       FROM users
       WHERE id = ANY($1)
         AND email IS NOT NULL
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL`,
      [ids]
    );
    if (!recipients.rows.length) return;

    const { sendEmail } = require('../config/utils/mailer');
    const { getFrontendUrl } = require('../config/utils/frontendUrl');
    const url = `${getFrontendUrl()}${path}`;

    for (const recipient of recipients.rows) {
      await sendEmail({
        to: recipient.email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h2 style="margin-bottom: 8px;">${subject}</h2>
            <p>Hello ${recipient.full_name || 'Admin'},</p>
            <p>${message}</p>
            <p><a href="${url}" style="color: #2563eb;">Open support dashboard</a></p>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('Support alert email error (non-fatal):', err.message || err);
  }
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const canSupportAdminAccessTicket = (user, ticket = {}) => {
  const role = normalizeText(user?.user_type);
  if (!SUPPORT_ADMIN_ROLES.has(role)) return false;
  if (role === 'super_admin' || role === 'super_support_admin') return true;
  if (ticket.assigned_to && Number(ticket.assigned_to) === Number(user.id)) return true;

  const ticketState = normalizeText(ticket.state);
  const ticketLga = normalizeText(ticket.lga);
  const userState = normalizeText(user.assigned_state);
  const userLga = normalizeText(user.assigned_city);

  if (role === 'state_support_admin') {
    return Boolean(userState && ticketState && userState === ticketState);
  }

  if (role === 'lga_support_admin') {
    return Boolean(userState && userLga && ticketState && ticketLga && userState === ticketState && userLga === ticketLga);
  }

  return false;
};

const addSupportTicketScope = (where, params, user, alias = 'st') => {
  const role = normalizeText(user?.user_type);
  if (role === 'super_admin' || role === 'super_support_admin') return;

  if (role === 'state_support_admin') {
    params.push(user.id);
    const assignedParam = `$${params.length}`;
    params.push(normalizeText(user.assigned_state));
    const stateParam = `$${params.length}`;
    where.push(`(${alias}.assigned_to = ${assignedParam} OR LOWER(COALESCE(${alias}.state, '')) = ${stateParam})`);
    return;
  }

  if (role === 'lga_support_admin') {
    params.push(user.id);
    const assignedParam = `$${params.length}`;
    params.push(normalizeText(user.assigned_state));
    const stateParam = `$${params.length}`;
    params.push(normalizeText(user.assigned_city));
    const lgaParam = `$${params.length}`;
    where.push(`(${alias}.assigned_to = ${assignedParam} OR (LOWER(COALESCE(${alias}.state, '')) = ${stateParam} AND LOWER(COALESCE(${alias}.lga, '')) = ${lgaParam}))`);
    return;
  }

  where.push('1 = 0');
};

const getScopedTicket = async (ticketId, user, select = 'st.*') => {
  const result = await db.query(
    `SELECT ${select}
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     WHERE st.id = $1`,
    [ticketId]
  );
  if (!result.rows.length) return { status: 404, ticket: null };

  const ticket = result.rows[0];
  if (!canSupportAdminAccessTicket(user, ticket)) return { status: 403, ticket: null };
  return { status: 200, ticket };
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
      preview: (reply.message || '').substring(0, 100),
    });
  } catch (err) {
    console.error('Add reply notification error:', err);
  }
};

const notifySlaRisk = async (ticket, severity, policies = {}) => {
  try {
    const { createNotification } = require('../config/utils/notificationService');
    const recipientIds = new Set();
    if (ticket.assigned_to) recipientIds.add(ticket.assigned_to);

    if (severity !== 'breached' || policies.notify_super_admin_on_breach !== false) {
      const superResult = await db.query(
        `SELECT id FROM users
         WHERE LOWER(user_type) IN ('super_admin', 'super_support_admin')
         LIMIT 25`
      );
      for (const user of superResult.rows) recipientIds.add(user.id);
    }

    const title = severity === 'breached' ? 'Support SLA breached' : 'Support SLA due soon';
    const message = `Ticket #${ticket.id} "${ticket.subject}" ${severity === 'breached' ? 'has breached its SLA' : 'is approaching its SLA deadline'}.`;
    const link = '/admin/super-support-dashboard?tab=tickets';

    for (const userId of recipientIds) {
      await createNotification(userId, 'support_sla', title, message, link);
      emitToUser(userId, 'ticket:sla_alert', { ticketId: ticket.id, severity, ticket });
    }

    if (severity === 'breached') {
      await sendSupportAlertEmails(recipientIds, title, message, link);
    }
  } catch (err) {
    console.error('Support SLA notification error:', err);
  }
};

const notifyPolicyRisk = async (ticket, severity, policies = {}) => {
  try {
    const { createNotification } = require('../config/utils/notificationService');
    const recipientIds = new Set();
    if (ticket.assigned_to) recipientIds.add(ticket.assigned_to);

    if (policies.notify_super_admin_on_breach !== false) {
      const superResult = await db.query(
        `SELECT id FROM users
         WHERE LOWER(user_type) IN ('super_admin', 'super_support_admin')
         LIMIT 25`
      );
      for (const user of superResult.rows) recipientIds.add(user.id);
    }

    const title = severity === 'ack_overdue'
      ? 'Department escalation acknowledgement overdue'
      : 'Department escalation resolution overdue';
    const message = severity === 'ack_overdue'
      ? `Ticket #${ticket.id} "${ticket.subject}" has not been acknowledged by ${ticket.escalation_department}.`
      : `Ticket #${ticket.id} "${ticket.subject}" is still unresolved after the department resolution target.`;

    for (const userId of recipientIds) {
      await createNotification(userId, 'support_policy_alert', title, message, '/admin/super-support-dashboard?tab=escalations');
      emitToUser(userId, 'ticket:policy_alert', { ticketId: ticket.id, severity, ticket });
    }

    await sendSupportAlertEmails(recipientIds, title, message, '/admin/super-support-dashboard?tab=escalations');

    await notifyDepartmentEscalation(ticket, ticket.escalation_department, message);
  } catch (err) {
    console.error('Support policy notification error:', err);
  }
};

const getSupportPolicySettings = async () => {
  try {
    const result = await db.query(`SELECT value FROM support_policy_settings WHERE key = 'support_governance'`);
    return {
      sla_due_soon_hours: 2,
      escalation_acknowledgement_hours: 4,
      department_resolution_hours: 24,
      notify_super_admin_on_breach: true,
      ...(result.rows[0]?.value || {}),
    };
  } catch (err) {
    return {
      sla_due_soon_hours: 2,
      escalation_acknowledgement_hours: 4,
      department_resolution_hours: 24,
      notify_super_admin_on_breach: true,
    };
  }
};

const runSupportSlaMonitor = async () => {
  try {
    await ensureSupportSchema();
    const policies = await getSupportPolicySettings();
    const dueSoonHours = Math.max(1, Math.min(24, Number(policies.sla_due_soon_hours) || 2));
    const acknowledgeHours = Math.max(1, Math.min(72, Number(policies.escalation_acknowledgement_hours) || 4));
    const resolutionHours = Math.max(1, Math.min(168, Number(policies.department_resolution_hours) || 24));

    const dueSoon = await db.query(
      `UPDATE support_tickets
       SET sla_warning_notified_at = CURRENT_TIMESTAMP
       WHERE status <> 'resolved'
         AND sla_due_at IS NOT NULL
         AND sla_due_at > CURRENT_TIMESTAMP
         AND sla_due_at <= CURRENT_TIMESTAMP + ($1::int * INTERVAL '1 hour')
         AND sla_warning_notified_at IS NULL
       RETURNING id, subject, assigned_to, user_id, state, lga, category, priority, status, sla_due_at`
      ,
      [dueSoonHours]
    );

    const breached = await db.query(
      `UPDATE support_tickets
       SET sla_breach_notified_at = CURRENT_TIMESTAMP
       WHERE status <> 'resolved'
         AND sla_due_at IS NOT NULL
         AND sla_due_at <= CURRENT_TIMESTAMP
         AND sla_breach_notified_at IS NULL
       RETURNING id, subject, assigned_to, user_id, state, lga, category, priority, status, sla_due_at`
    );

    const acknowledgementOverdue = await db.query(
      `UPDATE support_tickets
       SET escalation_ack_notified_at = CURRENT_TIMESTAMP,
           escalation_status = CASE WHEN escalation_status = 'escalated' THEN 'action_required' ELSE escalation_status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE status <> 'resolved'
         AND escalation_status = 'escalated'
         AND escalation_department <> 'support'
         AND last_escalated_at IS NOT NULL
         AND last_escalated_at <= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour')
         AND escalation_ack_notified_at IS NULL
       RETURNING id, subject, assigned_to, user_id, state, lga, category, priority, status,
                 escalation_department, escalation_status, last_escalated_at, related_type, related_id`,
      [acknowledgeHours]
    );

    const resolutionOverdue = await db.query(
      `UPDATE support_tickets
       SET department_resolution_notified_at = CURRENT_TIMESTAMP,
           escalation_status = CASE WHEN escalation_status IN ('escalated', 'acknowledged') THEN 'action_required' ELSE escalation_status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE status <> 'resolved'
         AND escalation_status IN ('escalated', 'acknowledged', 'action_required')
         AND escalation_department <> 'support'
         AND last_escalated_at IS NOT NULL
         AND last_escalated_at <= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour')
         AND department_resolution_notified_at IS NULL
       RETURNING id, subject, assigned_to, user_id, state, lga, category, priority, status,
                 escalation_department, escalation_status, last_escalated_at, related_type, related_id`,
      [resolutionHours]
    );

    for (const ticket of dueSoon.rows) {
      await notifySlaRisk(ticket, 'due_soon', policies);
      await addTicketTimeline(ticket.id, null, 'sla_due_soon', 'SLA is due within two hours');
    }

    for (const ticket of breached.rows) {
      await notifySlaRisk(ticket, 'breached', policies);
      await addTicketTimeline(ticket.id, null, 'sla_breached', 'SLA deadline was breached');
    }

    for (const ticket of acknowledgementOverdue.rows) {
      await notifyPolicyRisk(ticket, 'ack_overdue', policies);
      await addTicketTimeline(ticket.id, null, 'department_acknowledgement_overdue', `Department acknowledgement target of ${acknowledgeHours} hours was missed`);
      emitTicketUpdated(ticket);
    }

    for (const ticket of resolutionOverdue.rows) {
      await notifyPolicyRisk(ticket, 'resolution_overdue', policies);
      await addTicketTimeline(ticket.id, null, 'department_resolution_overdue', `Department resolution target of ${resolutionHours} hours was missed`);
      emitTicketUpdated(ticket);
    }
  } catch (err) {
    console.error('Support SLA monitor error:', err);
  }
};

if (process.env.NODE_ENV !== 'test') {
  const supportSlaMonitor = setInterval(runSupportSlaMonitor, 5 * 60 * 1000);
  if (typeof supportSlaMonitor.unref === 'function') supportSlaMonitor.unref();
  setTimeout(runSupportSlaMonitor, 30000).unref?.();
}

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

    const { name, email, state, lga, subject, message, priority, related_id } = req.body;
    const relatedType = normalizeRelatedType(req.body.related_type);
    const category = normalizeSupportCategory(req.body.category, relatedType);
    const relatedId = relatedType && Number.isInteger(Number(related_id)) ? Number(related_id) : null;

    if (!name || !name.trim() || !email || !email.trim() || !state || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, state, and message are required',
      });
    }

    if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Priority must be one of: low, medium, high, urgent' });
    }
    const normalizedPriority = priority || 'medium';
    const escalationDepartment = normalizeDepartment(req.body.escalation_department, category, relatedType);
    const slaDueAt = resolveSlaDueAt(category, normalizedPriority);
    const result = await db.query(
      `INSERT INTO support_tickets
         (subject, description, state, lga, contact_email, priority, status, user_id,
          category, related_type, related_id, escalation_department, sla_due_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NULL, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        subject?.trim() ? `[Contact] ${subject.trim()}` : `[Contact] ${name.trim()}`,
        lga
          ? `State: ${state}\nLGA: ${lga}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`
          : `State: ${state}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
        state,
        lga || null,
        email.trim().toLowerCase(),
        normalizedPriority,
        category,
        relatedType,
        relatedId,
        escalationDepartment,
        slaDueAt,
      ]
    );

    const ticketId = result.rows[0].id;

    // Store initial message as a reply so it shows in the conversation
    try {
      const initialMsg = lga
        ? `State: ${state}\nLGA: ${lga}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`
        : `State: ${state}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`;
      await db.query(
        `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin)
         VALUES ($1, NULL, $2, $3, FALSE)`,
        [ticketId, name.trim(), initialMsg]
      );
    } catch (replyErr) {
      console.error('Failed to store initial contact reply (non-fatal):', replyErr);
    }

    await addTicketTimeline(
      ticketId,
      { name: name.trim(), email: email.trim().toLowerCase(), user_type: 'contact' },
      'ticket_created',
      'Contact support ticket opened',
      { category, related_type: relatedType, related_id: relatedId, escalation_department: escalationDepartment }
    );

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

    emitTicketToAdmins('ticket:created', {
      ticketId,
      ticket: {
        id: ticketId,
        subject: subject?.trim() ? `[Contact] ${subject.trim()}` : `[Contact] ${name.trim()}`,
        description: lga
          ? `State: ${state}\nLGA: ${lga}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`
          : `State: ${state}\nFrom: ${name.trim()} <${email.trim()}>\n\n${message.trim()}`,
        state,
        lga: lga || null,
        contact_email: email.trim().toLowerCase(),
        priority: normalizedPriority,
        status: 'open',
        category,
        related_type: relatedType,
        related_id: relatedId,
        escalation_department: escalationDepartment,
        escalation_status: 'none',
        sla_due_at: slaDueAt.toISOString(),
        user_id: null,
      },
    });

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

    const { subject, description, priority, state, lga, related_id } = req.body;
    const relatedType = normalizeRelatedType(req.body.related_type);
    const category = normalizeSupportCategory(req.body.category, relatedType);
    const relatedId = relatedType && Number.isInteger(Number(related_id)) ? Number(related_id) : null;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const normalizedPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
    const escalationDepartment = normalizeDepartment(req.body.escalation_department, category, relatedType);
    const slaDueAt = resolveSlaDueAt(category, normalizedPriority);
    const result = await db.query(
      `INSERT INTO support_tickets
         (subject, description, priority, status, user_id, state, lga,
          category, related_type, related_id, escalation_department, sla_due_at)
       VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        subject.trim(),
        description?.trim() || null,
        normalizedPriority,
        req.user.id,
        state || null,
        lga || null,
        category,
        relatedType,
        relatedId,
        escalationDepartment,
        slaDueAt,
      ]
    );

    const ticket = result.rows[0];
    await addTicketTimeline(ticket.id, req.user, 'ticket_created', 'Support ticket opened', {
      category,
      related_type: relatedType,
      related_id: relatedId,
      escalation_department: escalationDepartment,
    });

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

    emitTicketToAdmins('ticket:created', {
      ticketId: ticket.id,
      ticket,
    });

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
              st.category, st.related_type, st.related_id, st.escalation_department,
              st.escalation_status, st.sla_due_at, st.last_escalated_at,
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

// Admin ticket listing

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

    addSupportTicketScope(where, params, req.user);

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.state, st.lga, st.priority, st.status,
              st.category, st.related_type, st.related_id, st.escalation_department,
              st.escalation_status, st.escalation_note, st.sla_due_at, st.last_escalated_at,
              CASE
                WHEN st.status = 'resolved' THEN 'met'
                WHEN st.sla_due_at IS NULL THEN 'not_set'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP THEN 'breached'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN 'due_soon'
                ELSE 'on_track'
              END AS sla_status,
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

    const { status, ticket } = await getScopedTicket(
      ticketId,
      req.user,
      'st.*, u.email AS user_email, u.full_name AS user_name'
    );

    if (status === 404) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (status === 403) {
      return res.status(403).json({ success: false, message: 'You cannot escalate this ticket' });
    }

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

    emitTicketUpdated(ticket, {
      priority: 'urgent',
      status: ticket.status === 'resolved' ? ticket.status : 'in_progress',
      assigned_to: nextAssigneeId,
      escalated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

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

    const { status, ticket } = await getScopedTicket(ticketId, req.user);
    if (status === 404) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (status === 403) {
      return res.status(403).json({ success: false, message: 'You cannot assign this ticket' });
    }

    if (assignedTo !== req.user.id) {
      const assigneeResult = await db.query(
        `SELECT id, user_type, assigned_state, assigned_city
         FROM users
         WHERE id = $1
           AND user_type IN ('super_admin', 'super_support_admin', 'state_support_admin', 'lga_support_admin')
           AND deleted_at IS NULL AND account_suspended_at IS NULL`,
        [assignedTo]
      );

      if (!assigneeResult.rows.length || !canSupportAdminAccessTicket(assigneeResult.rows[0], ticket)) {
        return res.status(400).json({ success: false, message: 'Assignee cannot access this ticket' });
      }
    }

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

    emitTicketUpdated(result.rows[0]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Assign support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign support ticket' });
  }
});

// POST /tickets/:id/takeover — department admin takes ownership of an escalated ticket
router.post('/tickets/:id/takeover', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const ticketResult = await db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
    if (!ticketResult.rows.length) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const ticket = ticketResult.rows[0];
    if (!canAccessDepartmentEscalation(req.user, ticket)) {
      return res.status(403).json({ success: false, message: 'You cannot take over this ticket' });
    }

    if (ticket.escalation_status === 'none') {
      return res.status(400).json({ success: false, message: 'Ticket is not escalated to a department' });
    }

    const result = await db.query(
      `UPDATE support_tickets
       SET assigned_to = $1,
           escalation_status = 'acknowledged',
           status = 'in_progress',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user.id, ticketId]
    );

    await addTicketTimeline(ticketId, req.user, 'ticket_taken_over', `${req.user.full_name || 'Department admin'} took over this ticket`, {
      department: ticket.escalation_department,
      previous_assignee: ticket.assigned_to,
    });

    emitTicketUpdated(result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Takeover ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to take over ticket' });
  }
});

router.patch('/tickets/:id/resolve', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const { status } = await getScopedTicket(ticketId, req.user);
    if (status === 404) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (status === 403) {
      return res.status(403).json({ success: false, message: 'You cannot resolve this ticket' });
    }

    const resolutionSummary = typeof req.body?.resolution_summary === 'string'
      ? req.body.resolution_summary.trim().slice(0, 1000)
      : null;

    const result = await db.query(
      `UPDATE support_tickets
       SET status = 'resolved',
           escalation_status = CASE WHEN escalation_status = 'none' THEN escalation_status ELSE 'resolved' END,
           resolution_summary = COALESCE($2, resolution_summary),
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [ticketId, resolutionSummary]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    emitTicketUpdated(result.rows[0]);
    await addTicketTimeline(ticketId, req.user, 'ticket_resolved', resolutionSummary || 'Ticket marked as resolved');

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Resolve support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve support ticket' });
  }
});

router.get('/tickets/:id/context', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const role = normalizeText(req.user.user_type);
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);
    let ticket;

    if (isSupportAdmin) {
      const scoped = await getScopedTicket(ticketId, req.user, 'st.*, u.email AS user_email, u.full_name AS user_name');
      if (scoped.status === 404) return res.status(404).json({ success: false, message: 'Ticket not found' });
      if (scoped.status === 403) return res.status(403).json({ success: false, message: 'Access denied' });
      ticket = scoped.ticket;
    } else {
      const ownerResult = await db.query(
        `SELECT st.*, u.email AS user_email, u.full_name AS user_name
         FROM support_tickets st
         LEFT JOIN users u ON u.id = st.user_id
         WHERE st.id = $1 AND st.user_id = $2`,
        [ticketId, req.user.id]
      );
      if (!ownerResult.rows.length) return res.status(403).json({ success: false, message: 'Access denied' });
      ticket = ownerResult.rows[0];
    }

    let relatedContext = null;
    try {
      relatedContext = await getRelatedServiceContext(ticket);
    } catch (contextErr) {
      console.error('Support related context error (non-fatal):', contextErr);
    }

    const timelineResult = await db.query(
      `SELECT id, actor_id, actor_name, actor_role, event_type, message, metadata, created_at
       FROM support_ticket_timeline
       WHERE ticket_id = $1
       ORDER BY created_at ASC, id ASC`,
      [ticketId]
    );

    res.json({
      success: true,
      data: {
        ticket: { ...ticket, related_admin_path: getRelatedAdminPath(ticket, req.user.user_type) },
        related_context: relatedContext,
        timeline: timelineResult.rows,
      },
    });
  } catch (error) {
    console.error('Support ticket context error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket context' });
  }
});

router.post('/tickets/:id/escalate-department', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const { status, ticket } = await getScopedTicket(ticketId, req.user);
    if (status === 404) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (status === 403) return res.status(403).json({ success: false, message: 'You cannot escalate this ticket' });

    const department = normalizeDepartment(req.body.department, ticket.category, ticket.related_type);
    if (department === 'support') {
      return res.status(400).json({ success: false, message: 'Choose an operations department to hand off to' });
    }
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';

    const result = await db.query(
      `UPDATE support_tickets
       SET escalation_department = $1,
           escalation_status = 'escalated',
           escalation_note = $2,
           last_escalated_at = CURRENT_TIMESTAMP,
           escalation_ack_notified_at = NULL,
           department_resolution_notified_at = NULL,
           escalated_at = COALESCE(escalated_at, CURRENT_TIMESTAMP),
           priority = CASE WHEN priority IN ('low', 'medium') THEN 'high' ELSE priority END,
           status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [department, note || null, ticketId]
    );

    await addTicketTimeline(ticketId, req.user, 'department_escalated', note || `Escalated to ${department.replace(/_/g, ' ')}`, { department });
    await notifyDepartmentEscalation(result.rows[0], department, note);
    emitTicketUpdated(result.rows[0]);
    emitTicketToAdmins('ticket:department_escalated', { ticketId, ticket: result.rows[0], department });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Support department escalation error:', error);
    res.status(500).json({ success: false, message: 'Failed to escalate ticket to department' });
  }
});

router.patch('/tickets/:id/escalation-status', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const scoped = await getScopedTicket(ticketId, req.user);
    if (scoped.status === 404) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (scoped.status === 403) return res.status(403).json({ success: false, message: 'You cannot update this escalation' });

    const escalationStatus = normalizeEscalationStatus(req.body.status);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';

    const result = await db.query(
      `UPDATE support_tickets
       SET escalation_status = $1,
           escalation_note = COALESCE($2, escalation_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [escalationStatus, note || null, ticketId]
    );

    await addTicketTimeline(ticketId, req.user, 'escalation_status_updated', note || `Escalation status changed to ${escalationStatus.replace(/_/g, ' ')}`, { escalation_status: escalationStatus });
    emitTicketUpdated(result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Support escalation status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update escalation status' });
  }
});

// ─── Conversation endpoints ────────────────────────────────────────────────

// GET /tickets/:id/conversation — paginated, with read receipts
router.get('/department-escalations', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const where = [];
    const params = [];
    addDepartmentEscalationScope(where, params, req.user);

    if (req.query.department && req.query.department !== 'all') {
      params.push(normalizeDepartment(req.query.department));
      where.push(`st.escalation_department = $${params.length}`);
    }

    if (req.query.status && req.query.status !== 'all') {
      params.push(normalizeEscalationStatus(req.query.status));
      where.push(`st.escalation_status = $${params.length}`);
    }

    const result = await db.query(
      `SELECT st.id, st.subject, st.description, st.state, st.lga, st.priority, st.status,
              st.category, st.related_type, st.related_id, st.escalation_department,
              st.escalation_status, st.escalation_note, st.sla_due_at, st.last_escalated_at,
              CASE
                WHEN st.status = 'resolved' THEN 'met'
                WHEN st.sla_due_at IS NULL THEN 'not_set'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP THEN 'breached'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN 'due_soon'
                ELSE 'on_track'
              END AS sla_status,
              st.created_at, st.updated_at, st.escalated_at, st.resolved_at,
              st.assigned_to,
              u.email AS user_email, u.full_name AS user_name,
              a.email AS assigned_email, a.full_name AS assigned_name,
              (SELECT COUNT(*) FROM support_ticket_replies str WHERE str.ticket_id = st.id AND str.is_admin = FALSE AND str.read_at IS NULL)::int AS unread_user_replies
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users a ON a.id = st.assigned_to
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY
         CASE st.escalation_status WHEN 'action_required' THEN 1 WHEN 'escalated' THEN 2 WHEN 'acknowledged' THEN 3 ELSE 4 END,
         st.sla_due_at ASC NULLS LAST,
         st.last_escalated_at DESC NULLS LAST
       LIMIT 100`,
      params
    );

    const rows = result.rows.map((ticket) => ({
      ...ticket,
      related_admin_path: getRelatedAdminPath(ticket, req.user.user_type),
      escalation_admin_path: getDepartmentEscalationPath(ticket.escalation_department, req.user.user_type),
    }));

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Department escalations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch department escalations' });
  }
});

router.patch('/department-escalations/:id/status', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const ticketResult = await db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
    if (!ticketResult.rows.length) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const ticket = ticketResult.rows[0];
    if (!canAccessDepartmentEscalation(req.user, ticket)) {
      return res.status(403).json({ success: false, message: 'You cannot update this department escalation' });
    }

    const escalationStatus = normalizeEscalationStatus(req.body.status);
    if (escalationStatus === 'none') {
      return res.status(400).json({ success: false, message: 'Use an active escalation status' });
    }
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';

    const result = await db.query(
      `UPDATE support_tickets
       SET escalation_status = $1,
           escalation_note = COALESCE($2, escalation_note),
           status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [escalationStatus, note || null, ticketId]
    );

    await addTicketTimeline(ticketId, req.user, 'department_status_updated', note || `Department marked escalation as ${escalationStatus.replace(/_/g, ' ')}`, {
      escalation_status: escalationStatus,
      department: ticket.escalation_department,
    });

    // When department resolves, notify the assigned support admin and auto-reply to the user
    if (escalationStatus === 'resolved') {
      const deptLabel = (ticket.escalation_department || '').replace(/_/g, ' ');
      const departmentName = deptLabel.charAt(0).toUpperCase() + deptLabel.slice(1);
      const adminName = req.user.full_name || 'Department Admin';
      const resolveMessage = note
        ? `Your issue has been resolved by the ${departmentName} team.\n\nResolution note: ${note}\n\nA support agent will follow up if needed.`
        : `Your issue has been resolved by the ${departmentName} team.\n\nA support agent will follow up if needed.`;

      // Auto-reply to the ticket visible to the user
      await db.query(
        `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [ticketId, req.user.id, `${adminName} (${departmentName})`, resolveMessage, true]
      );

      // Notify the assigned support admin
      if (ticket.assigned_to && ticket.assigned_to !== req.user.id) {
        try {
          const { createNotification } = require('../config/utils/notificationService');
          await createNotification(
            ticket.assigned_to,
            'support_department_resolved',
            'Department resolved a ticket',
            `Ticket #${ticketId} "${ticket.subject}" was resolved by ${departmentName}. Please follow up with the user.`,
            `/super-admin`
          );
          emitToUser(ticket.assigned_to, 'ticket:department_resolved', { ticketId, ticket: result.rows[0], department: ticket.escalation_department });
        } catch (notifyErr) {
          console.error('Failed to notify support admin of department resolution:', notifyErr);
        }
      }
    }

    emitTicketUpdated(result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Department escalation status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update department escalation' });
  }
});

router.get('/governance/summary', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const role = normalizeText(req.user.user_type);
    if (role !== 'super_admin' && role !== 'super_support_admin') {
      return res.status(403).json({ success: false, message: 'Super support governance access required' });
    }

    const [summary, byDepartment, bySla, recent] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*)::int AS total_tickets,
           COUNT(*) FILTER (WHERE status <> 'resolved')::int AS active_tickets,
           COUNT(*) FILTER (WHERE escalation_status <> 'none')::int AS escalated_tickets,
           COUNT(*) FILTER (WHERE status <> 'resolved' AND sla_due_at < CURRENT_TIMESTAMP)::int AS breached_sla,
           COUNT(*) FILTER (WHERE assigned_to IS NULL AND status <> 'resolved')::int AS unassigned_active
         FROM support_tickets`
      ),
      db.query(
        `SELECT escalation_department AS department,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE escalation_status IN ('escalated', 'action_required'))::int AS needs_action,
                COUNT(*) FILTER (WHERE status <> 'resolved' AND sla_due_at < CURRENT_TIMESTAMP)::int AS breached_sla
         FROM support_tickets
         WHERE escalation_status <> 'none'
         GROUP BY escalation_department
         ORDER BY needs_action DESC, total DESC`
      ),
      db.query(
        `SELECT
           CASE
             WHEN status = 'resolved' THEN 'met'
             WHEN sla_due_at IS NULL THEN 'not_set'
             WHEN sla_due_at < CURRENT_TIMESTAMP THEN 'breached'
             WHEN sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN 'due_soon'
             ELSE 'on_track'
           END AS sla_status,
           COUNT(*)::int AS total
         FROM support_tickets
         GROUP BY sla_status
         ORDER BY total DESC`
      ),
      db.query(
        `SELECT id, subject, state, lga, category, escalation_department, escalation_status,
                priority, status, sla_due_at, last_escalated_at
         FROM support_tickets
         WHERE escalation_status <> 'none'
         ORDER BY last_escalated_at DESC NULLS LAST, updated_at DESC
         LIMIT 10`
      ),
    ]);

    res.json({
      success: true,
      data: {
        summary: summary.rows[0] || {},
        by_department: byDepartment.rows,
        by_sla: bySla.rows,
        recent_escalations: recent.rows,
      },
    });
  } catch (error) {
    console.error('Support governance summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support governance summary' });
  }
});

router.get('/governance/export', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();

    const role = normalizeText(req.user.user_type);
    if (role !== 'super_admin' && role !== 'super_support_admin') {
      return res.status(403).json({ success: false, message: 'Super support governance access required' });
    }

    const result = await db.query(
      `SELECT st.id, st.subject, st.category, st.priority, st.status, st.state, st.lga,
              st.escalation_department, st.escalation_status, st.escalation_note,
              st.sla_due_at, st.last_escalated_at, st.resolved_at, st.created_at, st.updated_at,
              CASE
                WHEN st.status = 'resolved' THEN 'met'
                WHEN st.sla_due_at IS NULL THEN 'not_set'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP THEN 'breached'
                WHEN st.sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN 'due_soon'
                ELSE 'on_track'
              END AS sla_status,
              u.email AS user_email, u.full_name AS user_name,
              a.email AS assigned_email, a.full_name AS assigned_name
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users a ON a.id = st.assigned_to
       ORDER BY st.updated_at DESC
       LIMIT 5000`
    );

    const headers = [
      'ticket_id', 'subject', 'category', 'priority', 'ticket_status', 'state', 'lga',
      'department', 'escalation_status', 'sla_status', 'sla_due_at', 'last_escalated_at',
      'resolved_at', 'created_at', 'updated_at', 'user_name', 'user_email',
      'assigned_name', 'assigned_email', 'escalation_note',
    ];

    const rows = result.rows.map((row) => [
      row.id, row.subject, row.category, row.priority, row.status, row.state, row.lga,
      row.escalation_department, row.escalation_status, row.sla_status, row.sla_due_at,
      row.last_escalated_at, row.resolved_at, row.created_at, row.updated_at,
      row.user_name, row.user_email, row.assigned_name, row.assigned_email, row.escalation_note,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="support-governance-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Support governance export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export support governance report' });
  }
});

router.get('/governance/policies', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();
    const role = normalizeText(req.user.user_type);
    if (role !== 'super_admin' && role !== 'super_support_admin') {
      return res.status(403).json({ success: false, message: 'Super support governance access required' });
    }

    const result = await db.query(`SELECT key, value, updated_at FROM support_policy_settings WHERE key = 'support_governance'`);
    const defaults = {
      sla_due_soon_hours: 2,
      escalation_acknowledgement_hours: 4,
      department_resolution_hours: 24,
      notify_super_admin_on_breach: true,
    };
    res.json({ success: true, data: result.rows[0]?.value || defaults, updated_at: result.rows[0]?.updated_at || null });
  } catch (error) {
    console.error('Support governance policies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support governance policies' });
  }
});

router.put('/governance/policies', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSupportSchema();
    const role = normalizeText(req.user.user_type);
    if (role !== 'super_admin' && role !== 'super_support_admin') {
      return res.status(403).json({ success: false, message: 'Super support governance access required' });
    }

    const policy = {
      sla_due_soon_hours: Math.max(1, Math.min(24, Number(req.body.sla_due_soon_hours) || 2)),
      escalation_acknowledgement_hours: Math.max(1, Math.min(72, Number(req.body.escalation_acknowledgement_hours) || 4)),
      department_resolution_hours: Math.max(1, Math.min(168, Number(req.body.department_resolution_hours) || 24)),
      notify_super_admin_on_breach: req.body.notify_super_admin_on_breach !== false,
    };

    const result = await db.query(
      `INSERT INTO support_policy_settings (key, value, updated_by, updated_at)
       VALUES ('support_governance', $1::jsonb, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
       RETURNING value, updated_at`,
      [JSON.stringify(policy), req.user.id]
    );

    res.json({ success: true, data: result.rows[0].value, updated_at: result.rows[0].updated_at });
  } catch (error) {
    console.error('Support governance policy update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update support governance policies' });
  }
});

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
    if (isSupportAdmin) {
      const { status } = await getScopedTicket(ticketId, req.user);
      if (status === 404) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      if (status === 403) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      // Check if user is ticket owner or a department admin with escalation access
      const ticketResult = await db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
      if (!ticketResult.rows.length) return res.status(404).json({ success: false, message: 'Ticket not found' });
      const ticket = ticketResult.rows[0];
      const isOwner = ticket.user_id === req.user.id;
      const isDeptAdmin = canAccessDepartmentEscalation(req.user, ticket);
      if (!isOwner && !isDeptAdmin) {
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

    // Fetch ticket to check if anonymous (for admin presence tracking)
    const ticketResult = await db.query(
      'SELECT user_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    // If viewer is a support admin, mark all non-admin replies as read
    if (isSupportAdmin) {
      await db.query(
        `UPDATE support_ticket_replies SET read_at = CURRENT_TIMESTAMP
         WHERE ticket_id = $1 AND is_admin = FALSE AND read_at IS NULL`,
        [ticketId]
      );
      // Track admin viewing for anonymous contact presence
      if (ticketResult.rows.length > 0 && !ticketResult.rows[0].user_id) {
        adminActivity.viewing.set(ticketId, {
          userId: req.user.id,
          userName: req.user.full_name || req.user.email,
          timestamp: Date.now(),
        });
      }
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
router.post('/tickets/:id/reply', authenticate, uploadAttachment.single('attachment'), verifyUploadedFile, async (req, res) => {
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
      'SELECT id, subject, user_id, status, assigned_to, state, lga FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);
    const isOwner = ticket.user_id === req.user.id;
    const isDeptAdmin = !isSupportAdmin && !isOwner && canAccessDepartmentEscalation(req.user, ticket);

    if (isSupportAdmin && !canSupportAdminAccessTicket(req.user, ticket)) {
      return res.status(403).json({ success: false, message: 'You cannot reply to this ticket' });
    }

    if (!isSupportAdmin && !isOwner && !isDeptAdmin) {
      return res.status(403).json({ success: false, message: 'You cannot reply to this ticket' });
    }

    const isAdminReply = isSupportAdmin || isDeptAdmin;

    // Insert reply
    const result = await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin, attachment_url, attachment_name, attachment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        ticketId,
        req.user.id,
        isAdminReply ? (req.user.full_name || 'Support Team') : (req.user.full_name || req.user.email),
        message || '',
        isAdminReply,
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
      ticket.status = 'in_progress';
    }
    emitTicketUpdated(ticket, {
      status: ticket.status,
      updated_at: new Date().toISOString(),
    });

    // Notifications & email (async, non-blocking)
    const recipientId = isSupportAdmin ? ticket.user_id : (ticket.assigned_to || null);
    addReplyNotification(reply, ticket, req.user.id, recipientId).catch(() => {});
    sendReplyEmail(reply, ticket, req.user).catch(() => {});

    // Socket real-time event
    if (recipientId) {
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
    }

    // For unassigned tickets or contact tickets, emit to admin role rooms
    if (!recipientId && !isSupportAdmin) {
      const roleRooms = ['lga_support_admin', 'state_support_admin', 'super_support_admin'];
      for (const role of roleRooms) {
        emitToRole(role, 'ticket:new_reply', {
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
      }
    }

    // Admin replied to a contact ticket — notify anonymous user via guest namespace
    if (!ticket.user_id && isSupportAdmin) {
      emitToGuestTicket(ticket.id, 'ticket:new_reply', {
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
    }

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
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    if (isSupportAdmin) {
      const { status } = await getScopedTicket(ticketId, req.user);
      if (status === 404) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      if (status === 403) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      const ownerCheck = await db.query(
        'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
        [ticketId, req.user.id]
      );
      if (!ownerCheck.rows.length) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

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

    const role = String(req.user.user_type || '').toLowerCase();
    if (SUPPORT_ADMIN_ROLES.has(role)) {
      const { status } = await getScopedTicket(ticketId, req.user);
      if (status === 403) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
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

    if (isSupportAdmin) {
      const { status } = await getScopedTicket(ticketId, req.user);
      if (status === 404) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      if (status === 403) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (reply.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own replies' });
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
router.post('/tickets/:id/typing', authenticate, typingLimiter, async (req, res) => {
  try {
    const ticketId = Number(req.params.id);

    const ticketResult = await db.query(
      'SELECT id, user_id, assigned_to, state, lga FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const isAdmin = SUPPORT_ADMIN_ROLES.has(String(req.user.user_type || '').toLowerCase());
    if (isAdmin && !canSupportAdminAccessTicket(req.user, ticket)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!isAdmin && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const recipientId = isAdmin ? ticket.user_id : (ticket.assigned_to || null);

    if (recipientId) {
      emitToUser(recipientId, 'ticket:typing', {
        ticketId: ticket.id,
        userId: req.user.id,
        userName: req.user.full_name || req.user.email,
        isAdmin,
      });
    }

    // Track admin typing in-memory for anonymous contact-form tickets
    if (isAdmin && !ticket.user_id) {
      adminActivity.typing.set(ticketId, {
        userId: req.user.id,
        userName: req.user.full_name || req.user.email,
        timestamp: Date.now(),
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
      const where = [];
      const params = [];
      addSupportTicketScope(where, params, req.user, 'st');
      const scopeSql = where.length ? where.join(' AND ') : 'TRUE';

      // Count tickets with unread user replies visible to this admin
      result = await db.query(
        `SELECT COUNT(*) AS cnt FROM (
          SELECT st.id FROM support_tickets st
          WHERE ${scopeSql}
            AND EXISTS (
              SELECT 1 FROM support_ticket_replies str
              WHERE str.ticket_id = st.id AND str.is_admin = FALSE AND str.read_at IS NULL
            )
        ) sub`,
        params
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

    const where = ['sin.user_id != $1', 'sin.read_at IS NULL'];
    const params = [req.user.id];
    addSupportTicketScope(where, params, req.user, 'st');

    const result = await db.query(
      `SELECT COUNT(*) AS cnt FROM (
        SELECT DISTINCT sin.ticket_id
        FROM support_ticket_internal_notes sin
        JOIN support_tickets st ON st.id = sin.ticket_id
        WHERE ${where.join(' AND ')}
      ) sub`,
      params
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
router.get('/tickets/:id/internal-notes', authenticate, async (req, res) => {
  try {
    await ensureSupportSchema();

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid ticket ID is required' });
    }

    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);

    if (isSupportAdmin) {
      const { status } = await getScopedTicket(ticketId, req.user);
      if (status === 404) return res.status(404).json({ success: false, message: 'Ticket not found' });
      if (status === 403) return res.status(403).json({ success: false, message: 'Access denied' });
    } else {
      const ticketResult = await db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
      if (!ticketResult.rows.length) return res.status(404).json({ success: false, message: 'Ticket not found' });
      if (!canAccessDepartmentEscalation(req.user, ticketResult.rows[0])) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
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
router.post('/tickets/:id/internal-notes', authenticate, async (req, res) => {
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
      'SELECT * FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const role = String(req.user.user_type || '').toLowerCase();
    const isSupportAdmin = SUPPORT_ADMIN_ROLES.has(role);
    if (isSupportAdmin) {
      if (!canSupportAdminAccessTicket(req.user, ticket)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else if (!canAccessDepartmentEscalation(req.user, ticket)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

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

    const { status } = await getScopedTicket(ticketId, req.user);
    if (status === 403) {
      return res.status(403).json({ success: false, message: 'Access denied' });
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

    const { status } = await getScopedTicket(ticketId, req.user);
    if (status === 403) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await db.query('DELETE FROM support_ticket_internal_notes WHERE id = $1', [noteId]);

    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Delete internal note error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete internal note' });
  }
});

// POST /tickets/contact-reply — public reply for contact-form tickets (email-gated)
router.post('/tickets/contact-reply', uploadAttachment.single('attachment'), verifyUploadedFile, async (req, res) => {
  try {
    await ensureSupportSchema();

    const { ticketId, email, message } = req.body;
    const msg = (message || '').trim();

    if (!ticketId || !email) {
      return res.status(400).json({ success: false, message: 'Ticket ID and email are required' });
    }
    if (!msg && !req.file) {
      return res.status(400).json({ success: false, message: 'Message or attachment is required' });
    }

    const ticketResult = await db.query(
      'SELECT id, subject, contact_email, status, assigned_to, state, lga FROM support_tickets WHERE id = $1 AND user_id IS NULL',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.contact_email !== email.trim().toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Email does not match this ticket' });
    }

    const result = await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, user_id, author_name, message, is_admin, attachment_url, attachment_name, attachment_type)
       VALUES ($1, NULL, $2, $3, FALSE, $4, $5, $6)
       RETURNING *`,
      [
        ticketId,
        email.trim(),
        msg,
        req.file ? `/uploads/tickets/${req.file.filename}` : null,
        req.file ? req.file.originalname : null,
        req.file ? req.file.mimetype : null,
      ]
    );

    const reply = result.rows[0];

    // Re-open resolved ticket
    if (ticket.status === 'resolved') {
      await db.query("UPDATE support_tickets SET status = 'in_progress', resolved_at = NULL WHERE id = $1", [ticketId]);
      ticket.status = 'in_progress';
    }
    emitTicketUpdated(ticket, {
      status: ticket.status,
      updated_at: new Date().toISOString(),
    });

    // Notify assigned admin via socket
    const replyPayload = {
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
    };

    if (ticket.assigned_to) {
      emitToUser(ticket.assigned_to, 'ticket:new_reply', replyPayload);
      // In-app notification + email
      try {
        const { createNotification } = require('../config/utils/notificationService');
        await createNotification(ticket.assigned_to, 'ticket_reply', 'New reply on support ticket', `A user replied to ticket "${ticket.subject || 'Support request'}"`, `/admin/lga-support-dashboard`);
        const emailService = require('../config/utils/emailService');
        const adminResult = await db.query('SELECT email, full_name FROM users WHERE id = $1', [ticket.assigned_to]);
        if (adminResult.rows.length) {
          await emailService.sendMessageNotification(
            adminResult.rows[0].email,
            adminResult.rows[0].full_name || 'Support Admin',
            ticket.contact_email || 'A user',
            reply.message?.substring(0, 200) || 'Voice message'
          );
        }
      } catch (notifyErr) {
        console.error('Contact reply notification error:', notifyErr);
      }
    } else {
      // Not assigned — notify scoped admin role rooms
      const roleRooms = ['lga_support_admin', 'state_support_admin', 'super_support_admin'];
      for (const role of roleRooms) {
        emitToRole(role, 'ticket:new_reply', replyPayload);
      }
    }

    res.status(201).json({ success: true, data: reply });
  } catch (error) {
    console.error('Contact reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
});

// GET /tickets/:id/typing-status — polling endpoint for anonymous contact users
router.get('/tickets/:id/typing-status', async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email query param is required' });
    }

    // Verify this is a contact ticket and email matches
    const ticketResult = await db.query(
      'SELECT id, contact_email FROM support_tickets WHERE id = $1 AND user_id IS NULL',
      [ticketId]
    );
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (ticketResult.rows[0].contact_email !== email.trim().toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Email does not match' });
    }

    const now = Date.now();
    const typingData = adminActivity.typing.get(ticketId);
    const viewingData = adminActivity.viewing.get(ticketId);

    res.json({
      success: true,
      typing: typingData && (now - typingData.timestamp < 5000)
        ? { userName: typingData.userName }
        : null,
      viewing: viewingData && (now - viewingData.timestamp < 30000)
        ? { userName: viewingData.userName }
        : null,
    });
  } catch (error) {
    console.error('Typing status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get typing status' });
  }
});

// ─── Support Governance ─────────────────────────────────────────────────────

const governanceDefaults = {
  sla_due_soon_hours: 2,
  escalation_acknowledgement_hours: 4,
  department_resolution_hours: 24,
  notify_super_admin_on_breach: true,
};

let governancePolicy = { ...governanceDefaults };

router.get('/governance/policies', authenticate, async (req, res) => {
  try {
    const result = await db.query("SELECT config_value FROM app_config WHERE config_key = 'support_governance_policy'");
    if (result.rows.length) {
      governancePolicy = { ...governanceDefaults, ...JSON.parse(result.rows[0].config_value) };
    }
    res.json({ success: true, data: governancePolicy });
  } catch (error) {
    console.error('Governance policies error:', error);
    res.status(500).json({ success: false, message: 'Failed to load policies' });
  }
});

router.put('/governance/policies', authenticate, async (req, res) => {
  try {
    const policy = { ...governanceDefaults, ...req.body };
    try {
      const result = await db.query(
        `INSERT INTO app_config (config_key, config_value) VALUES ($1, $2)
         ON CONFLICT (config_key) DO UPDATE SET config_value = $2 RETURNING config_value`,
        ['support_governance_policy', JSON.stringify(policy)]
      );
    } catch (dbErr) {
      console.warn('Could not persist governance policy (non-fatal):', dbErr.message);
    }
    governancePolicy = policy;
    res.json({ success: true, data: policy });
  } catch (error) {
    console.error('Governance policies save error:', error);
    res.status(500).json({ success: false, message: 'Failed to save policies' });
  }
});

router.get('/governance/summary', authenticate, async (req, res) => {
  try {
    const [totalRes, activeRes, escalatedRes, breachedRes, unassignedRes, deptRes, recentEscRes] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM support_tickets'),
      db.query("SELECT COUNT(*)::int AS count FROM support_tickets WHERE status NOT IN ('resolved','closed')"),
      db.query("SELECT COUNT(*)::int AS count FROM support_tickets WHERE escalation_status NOT IN ('none','resolved')"),
      db.query("SELECT COUNT(*)::int AS count FROM support_tickets WHERE sla_due_at IS NOT NULL AND sla_due_at < CURRENT_TIMESTAMP AND status NOT IN ('resolved','closed')"),
      db.query("SELECT COUNT(*)::int AS count FROM support_tickets WHERE assigned_to IS NULL AND status NOT IN ('resolved','closed')"),
      db.query(`SELECT COALESCE(NULLIF(escalation_department,''), 'unassigned') AS department,
                       COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE escalation_status NOT IN ('none','resolved'))::int AS needs_action,
                       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL AND sla_due_at < CURRENT_TIMESTAMP)::int AS breached_sla
                FROM support_tickets GROUP BY escalation_department ORDER BY total DESC`),
      db.query(`SELECT id, subject, escalation_department, escalation_status, category, created_at
                FROM support_tickets
                WHERE escalation_status NOT IN ('none','resolved')
                ORDER BY created_at DESC LIMIT 10`),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          total_tickets: totalRes.rows[0].count,
          active_tickets: activeRes.rows[0].count,
          escalated_tickets: escalatedRes.rows[0].count,
          breached_sla: breachedRes.rows[0].count,
          unassigned_active: unassignedRes.rows[0].count,
        },
        by_department: deptRes.rows,
        recent_escalations: recentEscRes.rows,
      },
    });
  } catch (error) {
    console.error('Governance summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to load governance summary' });
  }
});

router.get('/governance/export', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT st.id, st.subject, st.status, st.priority, st.state, st.lga, st.escalation_department,
              st.escalation_status, st.sla_due_at, st.created_at, st.resolved_at,
              u.email AS user_email, a.email AS assigned_email
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN users a ON a.id = st.assigned_to
       ORDER BY st.created_at DESC`
    );
    const csv = [
      'ID,Subject,Status,Priority,State,LGA,Department,Escalation,User,Assigned,Created,Resolved,SLA Due',
      ...result.rows.map((r) =>
        `${r.id},"${(r.subject||'').replace(/"/g,'""')}",${r.status},${r.priority},${r.state||''},${r.lga||''},${r.escalation_department||''},${r.escalation_status||''},${r.user_email||''},${r.assigned_email||''},${r.created_at},${r.resolved_at||''},${r.sla_due_at||''}`
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="support-governance.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Governance export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export governance data' });
  }
});

router._supportScopeForTest = {
  canSupportAdminAccessTicket,
  normalizeSupportCategory,
  normalizeRelatedType,
  normalizeDepartment,
  normalizeEscalationStatus,
  resolveSlaDueAt,
  departmentsForUser,
  canAccessDepartmentEscalation,
  getRelatedAdminPath,
  getDepartmentEscalationPath,
  getSupportPolicySettings,
  runSupportSlaMonitor,
};

module.exports = router;
