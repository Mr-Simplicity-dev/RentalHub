const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { normalizeStateName } = require('../config/utils/stateName');
const { createNotification } = require('../config/utils/notificationService');

/**
 * A ticket that nobody answers should not just sit there.
 *
 * The rule (agreed with the business):
 *  - an assigned agent has 90 seconds to give the FIRST reply;
 *  - if he is typing, or has already replied, the ticket must NOT move;
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

  await db.query(`
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

  await db.query(`
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
    await db.query(`
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
};

/**
 * Pick the next agent in line: the same tier as the current owner, taking the
 * one with the fewest open tickets who has not already handled this ticket.
 */
const findNextAgent = async (ticket, excludeIds = []) => {
  const stateKey = normalizeStateName(ticket?.state);
  const lgaName = String(ticket?.lga || '').trim().toLowerCase();
  const exclude = [...new Set(excludeIds.filter((id) => Number.isInteger(Number(id))).map(Number))];

  const tiers = [];
  if (stateKey && lgaName) tiers.push({ type: 'lga_support_admin', byLga: true });
  if (stateKey) tiers.push({ type: 'state_support_admin', byLga: false });

  for (const tier of tiers) {
    const params = [tier.type];
    let stateClause = '';
    if (stateKey) {
      params.push(stateKey);
      stateClause = ` AND regexp_replace(LOWER(TRIM(COALESCE(u.assigned_state, ''))), '\\s+state$', '') IN ($2, 'federal capital territory')`;
    }
    let lgaClause = '';
    if (tier.byLga) {
      params.push(lgaName);
      lgaClause = ` AND LOWER(TRIM(COALESCE(u.assigned_city, ''))) = $${params.length}`;
    }
    let excludeClause = '';
    if (exclude.length) {
      params.push(exclude);
      excludeClause = ` AND u.id <> ALL($${params.length}::int[])`;
    }

    const result = await db.query(
      `SELECT u.id, COUNT(st.id) AS open_tickets
       FROM users u
       LEFT JOIN support_tickets st ON st.assigned_to = u.id
         AND st.status NOT IN ('resolved', 'closed')
       WHERE u.user_type = $1
         ${stateClause}
         ${lgaClause}
         ${excludeClause}
         AND u.deleted_at IS NULL
         AND u.account_suspended_at IS NULL
       GROUP BY u.id
       ORDER BY open_tickets ASC, u.id ASC
       LIMIT 1`,
      params
    );

    if (result.rows.length) return result.rows[0].id;
  }

  return null;
};

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
     ORDER BY u.open_tickets ASC, u.id ASC
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
 * The heart of the rule. Called on a timer.
 *
 * A ticket is eligible only when ALL of these hold:
 *  - it has an owner, is not resolved/closed, and has never been answered;
 *  - it is older than REASSIGN_AFTER_SECONDS;
 *  - nobody is typing on it right now (the guard);
 *  - it has not already used up its handovers.
 */
const reassignUnansweredTickets = async () => {
  try {
    await ensureReassignSchema();

    const candidates = await db.query(
      `SELECT st.id, st.subject, st.assigned_to, st.user_id, st.state, st.lga,
              st.status, st.category, st.priority,
              COALESCE(st.assigned_at, st.created_at) AS waiting_since,
              COALESCE(st.handover_count, 0) AS handover_count,
              st.first_response_at, st.last_typing_at,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(st.assigned_at, st.created_at))) AS waited_seconds,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - st.last_typing_at)) AS typing_age_seconds
       FROM support_tickets st
       WHERE st.status NOT IN ('resolved', 'closed')
         AND st.assigned_to IS NOT NULL
         AND st.first_response_at IS NULL
         AND COALESCE(st.exhausted_at, NULL) IS NULL
         AND COALESCE(st.assigned_at, st.created_at) <=
             CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
       ORDER BY st.assigned_at ASC NULLS FIRST
       LIMIT 50`,
      [REASSIGN_AFTER_SECONDS]
    );

    let reassigned = 0;
    let escalated = 0;

    for (const ticket of candidates.rows) {
      // GUARD: the agent is typing a reply right now. Never take it off him.
      const typingAge = Number(ticket.typing_age_seconds);
      if (
        ticket.last_typing_at &&
        Number.isFinite(typingAge) &&
        typingAge < TYPING_GRACE_SECONDS
      ) {
        continue;
      }

      // GUARD: he answered. first_response_at is set, so the query above
      // already excludes him, but double-check against a race.
      if (ticket.first_response_at) continue;

      const handoverCount = Number(ticket.handover_count) || 0;

      // Already handed over the maximum number of times: go to super admin and
      // stay there.
      if (handoverCount >= MAX_HANDOVERS) {
        const superAdminId = await findSuperSupportAdmin();
        if (!superAdminId || superAdminId === Number(ticket.assigned_to)) {
          await db.query(
            `UPDATE support_tickets
             SET exhausted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [ticket.id]
          );
          continue;
        }

        await db.query(
          `UPDATE support_tickets
           SET assigned_to = $1,
               assigned_at = CURRENT_TIMESTAMP,
               handover_count = $2,
               exhausted_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [superAdminId, handoverCount + 1, ticket.id]
        );

        await recordHandover({
          ticketId: ticket.id,
          assignedTo: superAdminId,
          assignedBy: null,
          reason: 'auto_escalated_super',
          handoverCount: handoverCount + 1,
        });
        await notifyNewAssignee({ ticket, assigneeId: superAdminId, escalated: true });
        escalated += 1;
        continue;
      }

      const previousOwners = await db.query(
        `SELECT DISTINCT assigned_to FROM support_ticket_assignments WHERE ticket_id = $1`,
        [ticket.id]
      );
      const excludeIds = previousOwners.rows
        .map((row) => row.assigned_to)
        .concat([ticket.assigned_to]);

      const nextAgentId = await findNextAgent(ticket, excludeIds);
      if (!nextAgentId) {
        // Nobody left in this tier — send it up rather than leave it stranded.
        const superAdminId = await findSuperSupportAdmin();
        if (!superAdminId || superAdminId === Number(ticket.assigned_to)) continue;

        await db.query(
          `UPDATE support_tickets
           SET assigned_to = $1,
               assigned_at = CURRENT_TIMESTAMP,
               handover_count = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [superAdminId, handoverCount + 1, ticket.id]
        );
        await recordHandover({
          ticketId: ticket.id,
          assignedTo: superAdminId,
          assignedBy: null,
          reason: 'auto_escalated_no_agent',
          handoverCount: handoverCount + 1,
        });
        await notifyNewAssignee({ ticket, assigneeId: superAdminId, escalated: true });
        escalated += 1;
        continue;
      }

      await db.query(
        `UPDATE support_tickets
         SET assigned_to = $1,
             assigned_at = CURRENT_TIMESTAMP,
             handover_count = $2,
             last_typing_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextAgentId, handoverCount + 1, ticket.id]
      );

      await recordHandover({
        ticketId: ticket.id,
        assignedTo: nextAgentId,
        assignedBy: null,
        reason: 'auto_reassign_timeout',
        handoverCount: handoverCount + 1,
      });
      await notifyNewAssignee({ ticket, assigneeId: nextAgentId, escalated: false });
      reassigned += 1;
    }

    return { scanned: candidates.rows.length, reassigned, escalated };
  } catch (error) {
    logger.error('Support auto-reassign error:', error);
    return { scanned: 0, reassigned: 0, escalated: 0 };
  }
};

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

/** Called when an agent replies: the clock stops for good. */
const markTicketAnswered = async (ticketId) => {
  try {
    await ensureReassignSchema();
    await db.query(
      `UPDATE support_tickets
       SET first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
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
       SET assigned_at = CURRENT_TIMESTAMP,
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
