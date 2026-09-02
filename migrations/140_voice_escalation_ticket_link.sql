-- Link voice warm-transfer escalations to the support ticket raised for the
-- caller, so the platform's department-escalation loop (department admins +
-- super-support dashboard) carries the complaint end to end.

ALTER TABLE voice_call_escalations
  ADD COLUMN IF NOT EXISTS ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_call_escalations_ticket
  ON voice_call_escalations(ticket_id);
