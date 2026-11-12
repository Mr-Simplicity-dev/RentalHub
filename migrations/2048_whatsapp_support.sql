BEGIN;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(15),
 ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS whatsapp_mode VARCHAR(12) NOT NULL DEFAULT 'human';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP, ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;
ALTER TABLE support_tickets ADD CONSTRAINT support_whatsapp_mode_check CHECK (whatsapp_mode IN ('human','paused'));
CREATE UNIQUE INDEX support_whatsapp_phone_unique ON support_tickets(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
CREATE INDEX support_whatsapp_updated ON support_tickets(updated_at DESC) WHERE whatsapp_phone IS NOT NULL;
ALTER TABLE support_ticket_replies ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255),
 ADD COLUMN IF NOT EXISTS whatsapp_delivery VARCHAR(20),
 ADD COLUMN IF NOT EXISTS whatsapp_request_id UUID,
 ADD COLUMN IF NOT EXISTS whatsapp_event_at TIMESTAMPTZ;
CREATE UNIQUE INDEX support_whatsapp_message_unique ON support_ticket_replies(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE UNIQUE INDEX support_whatsapp_request_unique ON support_ticket_replies(ticket_id,whatsapp_request_id) WHERE whatsapp_request_id IS NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(200);
CREATE UNIQUE INDEX notifications_dedup_key_unique ON notifications(user_id,dedup_key) WHERE dedup_key IS NOT NULL;
COMMIT;
