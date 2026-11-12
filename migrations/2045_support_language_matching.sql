BEGIN;
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS language_skills JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(language_skills) = 'array');
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(16);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS waiting_customer_since TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS support_agent_availability (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), available_until TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS support_agent_languages (
 user_id INTEGER NOT NULL REFERENCES users(id), language_id VARCHAR(16) NOT NULL,
 oral VARCHAR(20) NOT NULL CHECK(oral IN ('basic','conversational','fluent')),
 written VARCHAR(20) NOT NULL CHECK(written IN ('none','basic','conversational','fluent')),
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by INTEGER REFERENCES users(id), reviewed_at TIMESTAMPTZ,
 PRIMARY KEY(user_id,language_id)
);
CREATE TABLE IF NOT EXISTS support_response_misses (
 id BIGSERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
 agent_id INTEGER NOT NULL REFERENCES users(id), waiting_since TIMESTAMPTZ NOT NULL,
 review_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','excused','needs_followup')),
 review_note TEXT,reviewed_by INTEGER REFERENCES users(id),reviewed_at TIMESTAMPTZ,
 reason VARCHAR(40) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(ticket_id,agent_id,waiting_since)
);
CREATE INDEX IF NOT EXISTS support_response_misses_agent ON support_response_misses(agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_agent_languages_matching ON support_agent_languages(language_id,user_id) WHERE status='approved';

CREATE TABLE IF NOT EXISTS support_language_reviews (
 id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),language_id VARCHAR(16) NOT NULL,
 reviewer_id INTEGER NOT NULL REFERENCES users(id),status VARCHAR(20) NOT NULL CHECK(status IN ('approved','rejected')),
 note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
