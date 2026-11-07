BEGIN;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS responsible_support_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS disputes_responsible_support ON disputes(responsible_support_id) WHERE responsible_support_id IS NOT NULL;
CREATE TABLE support_dispute_handovers (
 id BIGSERIAL PRIMARY KEY,
 ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
 customer_id INTEGER NOT NULL REFERENCES users(id),
 property_id INTEGER NOT NULL REFERENCES properties(id),
 against_user_id INTEGER NOT NULL REFERENCES users(id),
 requested_by INTEGER NOT NULL REFERENCES users(id),
 responsible_support_id INTEGER NOT NULL REFERENCES users(id),
 title VARCHAR(160) NOT NULL,
 shared_summary TEXT NOT NULL,
 existing_dispute_id INTEGER REFERENCES disputes(id),
 dispute_id INTEGER REFERENCES disputes(id),
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX support_dispute_one_pending ON support_dispute_handovers(ticket_id) WHERE status='pending';
CREATE UNIQUE INDEX support_dispute_one_accepted ON support_dispute_handovers(ticket_id) WHERE status='accepted';
CREATE INDEX support_dispute_customer ON support_dispute_handovers(customer_id,created_at);
COMMIT;
