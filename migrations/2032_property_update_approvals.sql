BEGIN;
CREATE TABLE property_update_requests (
 id BIGSERIAL PRIMARY KEY,
 property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 submitted_by INTEGER NOT NULL REFERENCES users(id),
 before_data JSONB NOT NULL,
 proposed_data JSONB NOT NULL,
 reason TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 reviewed_by INTEGER REFERENCES users(id),
 review_note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX property_update_one_pending ON property_update_requests(property_id) WHERE status='pending';
CREATE INDEX property_update_history ON property_update_requests(property_id,created_at DESC);
CREATE INDEX property_update_review_queue ON property_update_requests(status,created_at);
COMMIT;
