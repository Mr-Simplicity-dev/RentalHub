BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assisted_registration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_login_key TEXT;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE tenant_registration_payments ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT assisted_registration_contact_required CHECK (email IS NOT NULL OR (assisted_registration=TRUE AND user_type IN ('tenant','landlord') AND phone IS NOT NULL));
ALTER TABLE tenant_registration_payments ADD CONSTRAINT assisted_payment_contact_required CHECK (email IS NOT NULL OR COALESCE(registration_payload->>'assisted_registration','false')='true');
CREATE OR REPLACE FUNCTION rentalhub_phone_key(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN digits ~ '^0[789][0-9]{9}$' THEN '+234' || substring(digits FROM 2)
             WHEN digits ~ '^234[789][0-9]{9}$' THEN '+' || digits
             WHEN value ~ '^\+' AND digits ~ '^[1-9][0-9]{7,14}$' THEN '+' || digits ELSE NULL END
 FROM (SELECT regexp_replace(COALESCE(value,''),'[^0-9]','','g') AS digits) p
$$;
WITH unique_phones AS (SELECT rentalhub_phone_key(phone) AS key FROM users WHERE deleted_at IS NULL GROUP BY rentalhub_phone_key(phone) HAVING COUNT(*)=1)
UPDATE users u SET phone_login_key = rentalhub_phone_key(u.phone) FROM unique_phones p WHERE rentalhub_phone_key(u.phone)=p.key AND p.key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_login_key_unique ON users(phone_login_key) WHERE phone_login_key IS NOT NULL AND deleted_at IS NULL;
CREATE OR REPLACE FUNCTION rentalhub_set_phone_login_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.phone_login_key := rentalhub_phone_key(NEW.phone); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS rentalhub_phone_login_key_trigger ON users;
CREATE TRIGGER rentalhub_phone_login_key_trigger BEFORE INSERT OR UPDATE OF phone ON users FOR EACH ROW EXECUTE FUNCTION rentalhub_set_phone_login_key();
CREATE TABLE IF NOT EXISTS assisted_registration_requests (
 staff_id INTEGER NOT NULL REFERENCES users(id), request_id UUID NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','completed','failed')),
 lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '10 minutes', registration_reference VARCHAR(255), PRIMARY KEY(staff_id,request_id)
);
CREATE TABLE IF NOT EXISTS assisted_registrations (
 reference VARCHAR(255) PRIMARY KEY REFERENCES tenant_registration_payments(transaction_reference), user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
 staff_id INTEGER NOT NULL REFERENCES users(id), state_id INTEGER NOT NULL REFERENCES states(id), lga_name VARCHAR(120) NOT NULL,
 consent_version VARCHAR(60) NOT NULL DEFAULT 'assisted-registration-v1', consent_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 amount_due NUMERIC(12,2) NOT NULL CHECK(amount_due>=0), quote JSONB NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid')),
 assigned_agent_id INTEGER REFERENCES users(id), benefits_completed_at TIMESTAMPTZ, benefits_last_attempt_at TIMESTAMPTZ, payment_id INTEGER REFERENCES payments(id), collected_by INTEGER REFERENCES users(id), collection_method VARCHAR(24),
 remittance_status VARCHAR(20) NOT NULL DEFAULT 'not_applicable' CHECK(remittance_status IN ('not_applicable','outstanding','received')),
 remitted_by INTEGER REFERENCES users(id), remitted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS assisted_registration_scope ON assisted_registrations(state_id,lga_name,created_at DESC);
CREATE TABLE IF NOT EXISTS assisted_phone_challenges (
 id UUID PRIMARY KEY, phone_key TEXT NOT NULL, purpose VARCHAR(20) NOT NULL CHECK(purpose IN ('access','recovery')), code_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assisted_phone_challenges_phone ON assisted_phone_challenges(phone_key,created_at DESC);
COMMIT;
