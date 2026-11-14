BEGIN;
CREATE TABLE seo_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),config JSONB NOT NULL DEFAULT '{"serp_daily_limit":10,"serp_batch_size":3,"ranking_max_keywords":200,"low_ctr":0.02,"min_impressions":100,"loss_ratio":0.2,"sync_days":28}'::jsonb,updated_by INTEGER REFERENCES users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO seo_settings(id) VALUES(1);
CREATE TABLE seo_integrations (
 provider TEXT PRIMARY KEY CHECK(provider IN ('search_console','google_ads')),credentials_encrypted TEXT,scopes JSONB NOT NULL DEFAULT '[]',property_url TEXT,account_label TEXT,status TEXT NOT NULL DEFAULT 'disconnected',version INTEGER NOT NULL DEFAULT 1,connected_by INTEGER REFERENCES users(id),connected_at TIMESTAMPTZ,last_sync_at TIMESTAMPTZ,error_code TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO seo_integrations(provider) VALUES('search_console'),('google_ads');
CREATE TABLE seo_oauth_states (
 state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL REFERENCES seo_integrations(provider),user_id INTEGER NOT NULL REFERENCES users(id),token_version INTEGER NOT NULL,connection_version INTEGER NOT NULL,verifier_encrypted TEXT NOT NULL,requested_scopes JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX seo_oauth_states_expiry ON seo_oauth_states(expires_at);
CREATE TABLE seo_sync_runs (
 id UUID PRIMARY KEY,provider TEXT NOT NULL REFERENCES seo_integrations(provider),connection_version INTEGER NOT NULL,property_url TEXT NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,cursor_date DATE NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','retry','completed','failed','cancelled')),attempts INTEGER NOT NULL DEFAULT 0,processed_rows BIGINT NOT NULL DEFAULT 0,truncated BOOLEAN NOT NULL DEFAULT FALSE,error_code TEXT,lease_id UUID,heartbeat_at TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),requested_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ,CHECK(start_date<=end_date)
);
CREATE UNIQUE INDEX seo_one_active_sync ON seo_sync_runs(provider) WHERE status IN ('queued','running','retry');
CREATE INDEX seo_sync_work ON seo_sync_runs(status,next_attempt_at);
CREATE TABLE seo_search_metrics (
 integration TEXT NOT NULL REFERENCES seo_integrations(provider),property_url TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('total','detail')),search_date DATE NOT NULL,query TEXT NOT NULL DEFAULT '',page TEXT NOT NULL DEFAULT '',country VARCHAR(3) NOT NULL DEFAULT '',device TEXT NOT NULL DEFAULT '',row_hash TEXT NOT NULL,clicks DOUBLE PRECISION NOT NULL CHECK(clicks>=0),impressions DOUBLE PRECISION NOT NULL CHECK(impressions>=0),position DOUBLE PRECISION CHECK(position>=0),imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(integration,property_url,kind,search_date,row_hash)
);
CREATE INDEX seo_search_dates ON seo_search_metrics(property_url,kind,search_date);
CREATE INDEX seo_search_query ON seo_search_metrics(query,search_date) WHERE kind='detail';
CREATE INDEX seo_search_pages ON seo_search_metrics(page,search_date) WHERE kind='detail';
CREATE TABLE seo_keywords (
 id BIGSERIAL PRIMARY KEY,keyword VARCHAR(200) NOT NULL,normalized_keyword VARCHAR(200) NOT NULL,country VARCHAR(2) NOT NULL DEFAULT 'ng',language VARCHAR(20) NOT NULL DEFAULT 'en',location VARCHAR(150) NOT NULL DEFAULT '',group_name VARCHAR(120) NOT NULL DEFAULT '',target_url TEXT,is_target BOOLEAN NOT NULL DEFAULT FALSE,is_tracked BOOLEAN NOT NULL DEFAULT FALSE,is_active BOOLEAN NOT NULL DEFAULT TRUE,frequency_hours INTEGER NOT NULL DEFAULT 168 CHECK(frequency_hours BETWEEN 24 AND 2160),metrics JSONB,metrics_source TEXT,metrics_updated_at TIMESTAMPTZ,last_checked_at TIMESTAMPTZ,next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_error_code TEXT,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(normalized_keyword,country,language,location)
);
CREATE INDEX seo_keywords_due ON seo_keywords(is_tracked,is_active,next_check_at);
CREATE TABLE seo_competitors (
 domain VARCHAR(253) PRIMARY KEY,label VARCHAR(150),is_active BOOLEAN NOT NULL DEFAULT TRUE,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE seo_observations (
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('keyword_research','url_inspection','technical_audit','sitemap','pagespeed')),cache_key TEXT,subject TEXT,status TEXT NOT NULL,result JSONB NOT NULL DEFAULT '{}',error_code TEXT,requested_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ
);
CREATE INDEX seo_observation_history ON seo_observations(kind,created_at DESC);
CREATE INDEX seo_observation_cache ON seo_observations(kind,cache_key,expires_at);
CREATE TABLE seo_opportunities (
 id TEXT PRIMARY KEY,rule TEXT NOT NULL,query TEXT,page TEXT,priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),reason TEXT NOT NULL,action TEXT NOT NULL,evidence JSONB NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','done')),generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by INTEGER REFERENCES users(id)
);
CREATE INDEX seo_opportunity_status ON seo_opportunities(status,generated_at DESC);
CREATE TABLE seo_content_plans (
 id UUID PRIMARY KEY,title VARCHAR(200) NOT NULL,cluster VARCHAR(150) NOT NULL,keywords JSONB NOT NULL DEFAULT '[]',intent VARCHAR(40) NOT NULL DEFAULT 'informational',target_url TEXT,outline TEXT NOT NULL DEFAULT '',content TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','publishing','published')),blog_id TEXT,approval_note TEXT,approved_by INTEGER REFERENCES users(id),approved_at TIMESTAMPTZ,created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE seo_provider_usage (
 provider TEXT NOT NULL,usage_date DATE NOT NULL,used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),PRIMARY KEY(provider,usage_date)
);
COMMIT;
