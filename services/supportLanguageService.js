const db = require('../config/middleware/database');
const {
  languagePreference
} = require('../config/utils/languagePolicy');
const {
  normalizeStateName
} = require('../config/utils/stateName');
async function chooseAgent(ticket, excludeIds = []) {
  const language = languagePreference(ticket.preferred_language);
  const state = normalizeStateName(ticket.state),
    lga = String(ticket.lga || '').trim().toLowerCase();
  const result = await db.query(`SELECT u.id,COUNT(st.id)::int AS open_tickets
 FROM users u JOIN support_agent_availability a ON a.user_id=u.id AND a.available_until>NOW()
 LEFT JOIN support_tickets st ON st.assigned_to=u.id AND st.status NOT IN ('resolved','closed')
 WHERE u.user_type IN ('lga_support_admin','state_support_admin','super_support_admin')
 AND u.deleted_at IS NULL AND u.account_suspended_at IS NULL
 AND u.id<>ALL($4::int[])
 AND (u.user_type='super_support_admin' OR
 ((CASE WHEN LOWER(TRIM(COALESCE(u.assigned_state,''))) IN ('fct','abuja') THEN 'federal capital territory' ELSE regexp_replace(LOWER(TRIM(COALESCE(u.assigned_state,''))), '\\s+state$', '') END)=$2
 AND (u.user_type='state_support_admin' OR LOWER(TRIM(COALESCE(u.assigned_city,'')))=$3)))
 AND ($1::text IS NULL OR EXISTS(SELECT 1 FROM support_agent_languages l WHERE l.user_id=u.id
 AND l.language_id=$1 AND l.status='approved' AND l.oral IN ('conversational','fluent') AND l.written IN ('conversational','fluent')))
 GROUP BY u.id ORDER BY CASE u.user_type WHEN 'lga_support_admin' THEN 0 WHEN 'state_support_admin' THEN 1 ELSE 2 END,open_tickets,u.id LIMIT 1`, [language, state, lga, excludeIds]);
  return result.rows[0]?.id || null;
}
async function notifyAssignment(agentId,ticketId){
 const person=(await db.query('SELECT user_type FROM users WHERE id=$1',[agentId])).rows[0];
 const route=person?.user_type==='state_support_admin'?'state-support-dashboard':person?.user_type==='super_support_admin'?'super-support-dashboard':'lga-support-dashboard';
 await require('../config/utils/notificationService').createNotification(agentId,'support_ticket_assigned','Support request assigned',`Ticket #${ticketId} is waiting for your reply.`,`/admin/${route}?tab=tickets`);
}
async function assignLanguageTicket(ticketId, preferredLanguage) {
  await require('./supportReassignService').ensureReassignSchema();
  const language = languagePreference(preferredLanguage);
  await db.query('UPDATE support_tickets SET preferred_language=$1 WHERE id=$2', [language, ticketId]);
  const ticket = (await db.query('SELECT * FROM support_tickets WHERE id=$1', [ticketId])).rows[0];
  const id = await chooseAgent(ticket);
  if (id) {
    await require('./supportReassignService').markTicketAssigned(ticketId, id);
    await notifyAssignment(id,ticketId);
  } else {
    await db.query('UPDATE support_tickets SET assigned_to=NULL WHERE id=$1', [ticketId]);
    const heads = await db.query("SELECT id FROM users WHERE user_type IN ('super_support_admin','super_admin') AND deleted_at IS NULL AND account_suspended_at IS NULL");
    for (const head of heads.rows) await require('../config/utils/notificationService').createNotification(head.id, 'support_language_waiting', 'Support request needs an available agent', `Ticket #${ticketId} needs an approved language match. Please arrange help.`, '/admin/super-support-dashboard?tab=tickets');
  }
  return id;
}
async function canTakeLanguageTicket(userId, ticket) {
  if (!ticket.preferred_language) return true;
  const r = await db.query(`SELECT l.user_id FROM support_agent_languages l JOIN support_agent_availability a ON a.user_id=l.user_id AND a.available_until>NOW() WHERE l.user_id=$1 AND l.language_id=$2 AND l.status='approved' AND l.oral IN ('conversational','fluent') AND l.written IN ('conversational','fluent')`, [userId, ticket.preferred_language]);
  return r.rows.length > 0;
}
module.exports = {
  chooseAgent,
  assignLanguageTicket,
  canTakeLanguageTicket,
  notifyAssignment
};
