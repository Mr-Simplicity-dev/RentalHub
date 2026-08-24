ALTER TABLE sms_campaigns ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sms_campaign_recipients ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sms_campaign_recipients ADD COLUMN IF NOT EXISTS last_error_type VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_scr_queue ON sms_campaign_recipients (status, campaign_id);
INSERT INTO commission_config (key, value, description)
VALUES ('sms_cost_per_segment', '4', 'Cost per SMS segment in naira for cost estimation')
ON CONFLICT (key) DO NOTHING;
