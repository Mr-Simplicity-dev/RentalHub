const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { normalizeStateName } = require('../config/utils/stateName');
const { createNotification } = require('../config/utils/notificationService');

/**
 * A ticket that nobody answers should not just sit there.
 *
 * The rule (agreed with the business):
 *  - an assigned agent has 90 seconds to give the FIRST reply;
 *  - recent typing gives a bounded grace period; later customer replies are monitored too;
 *  - a ticket may be passed on at most twice; the third failure goes to a
 *    super support admin, where it stays.
 */

const REASSIGN_AFTER_SECONDS = Math.max(
  30,
  Number(process.env.SUPPORT_REASSIGN_AFTER_SECONDS) || 90
);
const MAX_HANDOVERS = Math.max(1, Number(process.env.SUPPORT_MAX_HANDOVERS) || 2);
const TYPING_GRACE_SECONDS = Math.max(
  10,
  Number(process.env.SUPPORT_TYPING_GRACE_SECONDS) || 60
);

let schemaReady = false;

const ensureReassignSchema = async () => {
  if (schemaReady) return;
  const client = await db.connect();
  try {
  await client.query('SELECT pg_advisory_lock(2045,2)');
  if (schemaReady) return;

  await client.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_assignments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      assigned_to INTEGER,
      assigned_by INTEGER,
      reason VARCHAR(40) NOT NULL DEFAULT 'auto_reassign',
      handover_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_support_ticket_assignments_ticket
      ON support_ticket_assignments(ticket_id, created_at DESC)
  `);

  const columns = [
    ['assigned_at', 'TIMESTAMP'],
    ['first_response_at', 'TIMESTAMP'],
    ['handover_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_typing_at', 'TIMESTAMP'],
    ['exhausted_at', 'TIMESTAMP'],
  ];

  for (const [column, type] of columns) {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='support_tickets' AND column_name='${column}'
        ) THEN
          ALTER TABLE support_tickets ADD COLUMN ${column} ${type};
        END IF;
      END $$;
    `);
  }

  schemaReady = true;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(2045,2)'); } finally { client.release(); }
  }
};

/**
 * Pick the next agent in line: the same tier as the current owner, taking the
 * one with the fewest open tickets who has not already handled this ticket.
 */
const findNextAgent = async (ticket, excludeIds = []) => require('./supportLanguageService').chooseAgent(ticket, excludeIds);

const findSuperSupportAdmin = async () => {
  const result = await db.query(
    `SELECT u.id, COUNT(st.id) AS open_tickets
     FROM users u
     LEFT JOIN support_tickets st ON st.assigned_to = u.id
       AND st.status NOT IN ('resolved', 'closed')
     WHERE u.user_type IN ('super_support_admin', 'super_admin')
       AND u.deleted_at IS NULL
       AND u.account_suspended_at IS NULL
     GROUP BY u.id
     ORDER BY open_tickets ASC, u.id ASC
     LIMIT 1`
  );
  return result.rows[0]?.id || null;
};

const recordHandover = async ({ ticketId, assignedTo, assignedBy, reason, handoverCount }) => {
  await db.query(
    `INSERT INTO support_ticket_assignments
       (ticket_id, assigned_to, assigned_by, reason, handover_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, assignedTo, assignedBy, reason, handoverCount]
  );
};

const notifyNewAssignee = async ({ ticket, assigneeId, escalated }) => {
  try {
    if (!Number.isInteger(Number(assigneeId))) return;
    const title = escalated ? 'Ticket escalated to you' : 'Ticket reassigned to you';
    const message = escalated
      ? `Ticket #${ticket.id} "${String(ticket.subject || '').slice(0, 90)}" was not answered in time and is now yours.`
      : `Ticket #${ticket.id} "${String(ticket.subject || '').slice(0, 90)}" has been passed to you.`;
    await createNotification(
      Number(assigneeId),
      escalated ? 'support_ticket_escalated' : 'support_ticket_reassigned',
      title,
      message,
      '/admin/super-support-dashboard?tab=tickets'
    );
  } catch (error) {
    logger.warn(`Reassign notification failed: ${error.message}`);
  }
};

/**
 * Backward-compatible entry point for the single response monitor.
 *
 * A ticket is eligible only when ALL of these hold:
 *  - it has an owner, is not resolved/closed, and has never been answered;
 *  - it is older than REASSIGN_AFTER_SECONDS;
 *  - nobody is typing on it right now (the guard);
 *  - it has not already used up its handovers.
 */
const reassignUnansweredTickets = async () => require('./supportResponseMonitor').runResponseMonitor();

/** Called from the typing endpoint so the guard has fresh evidence. */
const markTicketTyping = async (ticketId) => {
  try {
    await ensureReassignSchema();
    await db.query(
      'UPDATE support_tickets SET last_typing_at = CURRENT_TIMESTAMP WHERE id = $1',
      [ticketId]
    );
  } catch (error) {
    logger.warn(`markTicketTyping failed: ${error.message}`);
  }
};

/** Called after a stored agent reply. A later customer message starts a fresh waiting period. */
const markTicketAnswered = async (ticketId) => {
  try {
    await ensureReassignSchema();
    await db.query(
      `UPDATE support_tickets
       SET first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
           waiting_customer_since = NULL,
           last_typing_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ticketId]
    );
  } catch (error) {
    logger.warn(`markTicketAnswered failed: ${error.message}`);
  }
};

/** Called when auto-assign picks an owner, so the 90s clock starts there. */
const markTicketAssigned = async (ticketId, assigneeId) => {
  try {
    await ensureReassignSchema();
    await db.query(
      `UPDATE support_tickets
       SET waiting_customer_since = CASE WHEN first_response_at IS NULL OR waiting_customer_since IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END, assigned_at = CURRENT_TIMESTAMP,
           assigned_to = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [assigneeId, ticketId]
    );
    await recordHandover({
      ticketId,
      assignedTo: assigneeId,
      assignedBy: null,
      reason: 'initial_assignment',
      handoverCount: 0,
    });
  } catch (error) {
    logger.warn(`markTicketAssigned failed: ${error.message}`);
  }
};

module.exports = {
  ensureReassignSchema,
  reassignUnansweredTickets,
  markTicketTyping,
  markTicketAnswered,
  markTicketAssigned,
  findNextAgent,
  findSuperSupportAdmin,
  REASSIGN_AFTER_SECONDS,
  MAX_HANDOVERS,
  TYPING_GRACE_SECONDS,
};
