const db = require('../config/middleware/database');
async function runResponseMonitor() {
  const policy=require('./supportReassignService');
  const responseSeconds=policy.REASSIGN_AFTER_SECONDS||90,typingSeconds=policy.TYPING_GRACE_SECONDS||60,maxHandovers=policy.MAX_HANDOVERS||2;
  await require('./supportReassignService').ensureReassignSchema();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(2045,1) AS locked');
    if (!lock.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return;
    }
    const rows = await client.query(`SELECT t.*, COALESCE(t.waiting_customer_since,t.assigned_at,t.created_at) AS waiting_since
  FROM support_tickets t WHERE t.status NOT IN ('resolved','closed') AND t.assigned_to IS NOT NULL AND t.escalation_status='none' AND EXISTS(SELECT 1 FROM users owner WHERE owner.id=t.assigned_to AND owner.user_type IN ('lga_support_admin','state_support_admin','super_support_admin'))
  AND (t.waiting_customer_since IS NOT NULL OR t.first_response_at IS NULL)
  AND COALESCE(t.waiting_customer_since,t.assigned_at,t.created_at)<NOW()-($1::int*INTERVAL '1 second')
  AND (t.last_typing_at IS NULL OR t.last_typing_at<NOW()-($2::int*INTERVAL '1 second') OR COALESCE(t.waiting_customer_since,t.assigned_at,t.created_at)<NOW()-($3::int*INTERVAL '1 second'))
  ORDER BY t.created_at LIMIT 50 FOR UPDATE SKIP LOCKED`,[responseSeconds,typingSeconds,responseSeconds+2*typingSeconds]);
    const newAssignments=[];
    for (const ticket of rows.rows) {
      await client.query(`INSERT INTO support_response_misses(ticket_id,agent_id,waiting_since,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [ticket.id, ticket.assigned_to, ticket.waiting_since, ticket.first_response_at ? 'follow_up_waiting' : 'first_reply_waiting']);
      const previous = await client.query('SELECT assigned_to FROM support_ticket_assignments WHERE ticket_id=$1', [ticket.id]);
      const exclusions = [ticket.assigned_to, ...previous.rows.map(x => x.assigned_to)].filter(Boolean);
      const next = Number(ticket.handover_count || 0) < maxHandovers ? await require('./supportLanguageService').chooseAgent(ticket, exclusions) : null;
      await client.query(`UPDATE support_tickets SET assigned_to=$1,assigned_at=NOW(),waiting_customer_since=NOW(),last_typing_at=NULL,handover_count=COALESCE(handover_count,0)+1,updated_at=NOW() WHERE id=$2`, [next, ticket.id]);
      await client.query(`INSERT INTO support_ticket_assignments(ticket_id,assigned_to,reason,handover_count) VALUES($1,$2,$3,$4)`, [ticket.id, next, next ? 'auto_reassign_timeout' : 'supervisor_review', Number(ticket.handover_count || 0) + 1]);
      if(next)newAssignments.push({id:ticket.id,agent:next});
    }
    const waiting = await client.query("SELECT * FROM support_tickets WHERE assigned_to IS NULL AND status NOT IN ('resolved','closed') AND escalation_status='none' AND COALESCE(handover_count,0)<$1 ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED",[maxHandovers]);

    for (const ticket of waiting.rows) {
      const next = await require('./supportLanguageService').chooseAgent(ticket);
      if (next) {
        await client.query('UPDATE support_tickets SET assigned_to=$1,assigned_at=NOW(),waiting_customer_since=NOW(),updated_at=NOW() WHERE id=$2', [next, ticket.id]);
        await client.query("INSERT INTO support_ticket_assignments(ticket_id,assigned_to,reason,handover_count) VALUES($1,$2,'available_language_match',$3)", [ticket.id, next, ticket.handover_count || 0]);
        newAssignments.push({
          id: ticket.id,
          agent: next
        });
      }
    }
    await client.query('COMMIT');
    const {
      createNotification
    } = require('../config/utils/notificationService');
    for (const a of newAssignments) await require('./supportLanguageService').notifyAssignment(a.agent,a.id);
    for (const ticket of rows.rows) {
      const users = await db.query("SELECT id FROM users WHERE user_type IN ('super_support_admin','super_admin') AND deleted_at IS NULL AND account_suspended_at IS NULL");
      for (const user of users.rows) await createNotification(user.id, 'support_response_review', 'Support response needs review', `Ticket #${ticket.id} waited for a reply. Review the assignment and reason; this is not a misconduct finding.`, '/admin/super-support-dashboard?tab=tickets');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
module.exports = {
  runResponseMonitor
};
