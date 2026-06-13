-- SMS Marketing Campaign System

CREATE TABLE IF NOT EXISTS sms_subscribers (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  full_name VARCHAR(255),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  source_id INTEGER,
  user_type VARCHAR(50),
  tags TEXT[] DEFAULT '{}',
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sms_subscribers_phone UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_sms_subscribers_subscribed
  ON sms_subscribers (subscribed);
CREATE INDEX IF NOT EXISTS idx_sms_subscribers_source
  ON sms_subscribers (source);
CREATE INDEX IF NOT EXISTS idx_sms_subscribers_user_type
  ON sms_subscribers (user_type);
CREATE INDEX IF NOT EXISTS idx_sms_subscribers_tags
  ON sms_subscribers USING GIN (tags);

CREATE TABLE IF NOT EXISTS sms_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sender_name VARCHAR(160),
  template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  recipient_filter JSONB DEFAULT '{}',
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  stats JSONB DEFAULT '{"sent":0,"failed":0}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status
  ON sms_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_scheduled
  ON sms_campaigns (scheduled_at);

CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES sms_subscribers(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  full_name VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scr_campaign
  ON sms_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_scr_status
  ON sms_campaign_recipients (status);
CREATE INDEX IF NOT EXISTS idx_scr_subscriber
  ON sms_campaign_recipients (subscriber_id);
