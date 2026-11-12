BEGIN;
CREATE TABLE background_job_runtime (
 app TEXT PRIMARY KEY,owner_id UUID NOT NULL,host TEXT NOT NULL,process_id INTEGER NOT NULL,pm_id TEXT,
 started_at TIMESTAMPTZ NOT NULL,heartbeat_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL
);
CREATE TABLE background_job_status (
 job_key TEXT PRIMARY KEY,kind TEXT NOT NULL,schedule TEXT NOT NULL,registered_by UUID NOT NULL,registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_started_at TIMESTAMPTZ,last_finished_at TIMESTAMPTZ,last_status TEXT NOT NULL DEFAULT 'registered',last_error_code VARCHAR(80),last_duration_ms INTEGER,
 success_count BIGINT NOT NULL DEFAULT 0,failure_count BIGINT NOT NULL DEFAULT 0
);
COMMIT;
