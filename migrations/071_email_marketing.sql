-- Email Marketing Campaign System

CREATE TABLE IF NOT EXISTS email_subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  -- 'user' (from users table), 'lead' (partial registration), 'manual' (manually added)
  source_id INTEGER,
  -- users.id if source='user', tenant_registration_payments.id if source='lead'
  user_type VARCHAR(50),
  tags TEXT[] DEFAULT '{}',
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMP,
  unsubscribe_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_email_subscribers_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_subscribed
  ON email_subscribers (subscribed);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_source
  ON email_subscribers (source);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_user_type
  ON email_subscribers (user_type);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_tags
  ON email_subscribers USING GIN (tags);

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  subject VARCHAR(255) NOT NULL,
  content_html TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  -- 'general', 'promo', 'property_alert', 're_engagement', 'newsletter'
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  sender_name VARCHAR(160),
  sender_email VARCHAR(255),
  reply_to VARCHAR(255),
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  content_html TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- 'draft', 'scheduled', 'sending', 'sent', 'cancelled'
  recipient_filter JSONB DEFAULT '{}',
  -- { source: ['user','lead'], user_types: ['tenant','landlord'], subscribed: true, ... }
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  stats JSONB DEFAULT '{"sent":0,"failed":0,"opened":0,"clicked":0,"bounced":0,"unsubscribed":0}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status
  ON email_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled
  ON email_campaigns (scheduled_at);

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscriber_id INTEGER REFERENCES email_subscribers(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- 'pending', 'sent', 'failed', 'bounced', 'opened', 'clicked', 'unsubscribed'
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ecr_campaign
  ON email_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ecr_status
  ON email_campaign_recipients (status);
CREATE INDEX IF NOT EXISTS idx_ecr_subscriber
  ON email_campaign_recipients (subscriber_id);
