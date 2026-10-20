const db = require('../middleware/database');
const logger = require('./logger');
const { createNotification } = require('./notificationService');

/**
 * A tenant opening a support ticket used to fire only a live socket ping, so
 * an admin who was not staring at the dashboard at that moment never learned
 * about it. This writes a real notification row (and therefore a push), which
 * feeds the unread badge even when the app is closed.
 */

const findSupportAudience = async (assignedTo) => {
  const ids = new Set();
  if (assignedTo) ids.add(Number(assignedTo));

  try {
    const result = await db.query(
      `SELECT id FROM users
       WHERE user_type IN ('super_admin', 'super_support_admin')
         AND deleted_at IS NULL
         AND account_suspended_at IS NULL`
    );
    result.rows.forEach((row) => ids.add(Number(row.id)));
  } catch (error) {
    logger.warn(`Support audience lookup failed: ${error.message}`);
  }

  return [...ids].filter((id) => Number.isInteger(id) && id > 0);
};

exports.notifyTicketCreated = async ({ ticket, assignedTo = null }) => {
  try {
    if (!ticket?.id) return { sent: 0 };

    const recipients = await findSupportAudience(assignedTo);
    if (!recipients.length) return { sent: 0 };

    const subject = String(ticket.subject || 'Support request').slice(0, 120);
    const title = 'New support ticket';
    const message = `Ticket #${ticket.id} "${subject}" was just opened.`;
    // Admins land on their own dashboard; the tab opens the ticket list.
    const link = '/admin/super-support-dashboard?tab=tickets';

    let sent = 0;
    for (const userId of recipients) {
      const created = await createNotification(userId, 'support_ticket_created', title, message, link);
      if (created) sent += 1;
    }

    return { sent };
  } catch (error) {
    logger.error('Ticket created notification error:', error);
    return { sent: 0 };
  }
};

module.exports = exports;
