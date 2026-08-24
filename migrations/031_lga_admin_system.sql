-- Migration 031: LGA Admin System
-- Add LGA admin role and hierarchy for local government area administration

-- 1. Add LGA admin role to user_type constraint
DO $$
DECLARE
  existing_check_name TEXT;
BEGIN
  SELECT c.conname
  INTO existing_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'users'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%user_type%';

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', existing_check_name);
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (
    user_type IN (
      'tenant', 'landlord', 'lawyer', 'state_lawyer', 'super_lawyer',
      'admin', 'lga_admin', 'lga_support_admin', 'state_admin',
      'lga_financial_admin', 'lga_transportation_admin',
      'state_transportation_admin', 'super_transportation_admin',
      'lga_fumigation_admin', 'state_fumigation_admin',
      'super_fumigation_admin', 'state_financial_admin',
      'state_support_admin', 'super_admin', 'financial_admin',
      'super_financial_admin', 'super_support_admin', 'recruitment_admin',
      'agent', 'fumigation_admin', 'transportation_admin'
    )
  );

-- 2. Add LGA assignment columns for LGA admins
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS assigned_lga VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supervising_state_admin_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS supervising_super_admin_id INTEGER REFERENCES users(id);

-- 3. Create LGA admin performance monitoring table
CREATE TABLE IF NOT EXISTS lga_admin_performance (
  id SERIAL PRIMARY KEY,
  lga_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitoring_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitoring_level VARCHAR(20) NOT NULL CHECK (monitoring_level IN ('state_admin', 'super_admin')),
  
  -- Performance metrics
  total_users_managed INTEGER DEFAULT 0,
  total_properties_approved INTEGER DEFAULT 0,
  total_transactions_processed INTEGER DEFAULT 0,
  total_revenue_generated DECIMAL(12, 2) DEFAULT 0,
  response_time_avg_seconds INTEGER DEFAULT 0,
  approval_rate DECIMAL(5, 2) DEFAULT 0,
  
  -- Monitoring status
  last_monitored_at TIMESTAMPTZ DEFAULT NOW(),
  performance_rating VARCHAR(20) CHECK (performance_rating IN ('excellent', 'good', 'average', 'poor', 'critical')),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(lga_admin_id, monitoring_admin_id, monitoring_level)
);

-- 4. Create LGA admin activity log table
CREATE TABLE IF NOT EXISTS lga_admin_activities (
  id SERIAL PRIMARY KEY,
  lga_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  activity_details JSONB,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_assigned_lga ON users(assigned_lga);
CREATE INDEX IF NOT EXISTS idx_users_supervising_state_admin ON users(supervising_state_admin_id);
CREATE INDEX IF NOT EXISTS idx_users_supervising_super_admin ON users(supervising_super_admin_id);
CREATE INDEX IF NOT EXISTS idx_lga_admin_performance_lga_admin ON lga_admin_performance(lga_admin_id);
CREATE INDEX IF NOT EXISTS idx_lga_admin_performance_monitoring ON lga_admin_performance(monitoring_admin_id);
CREATE INDEX IF NOT EXISTS idx_lga_admin_activities_lga_admin ON lga_admin_activities(lga_admin_id);
CREATE INDEX IF NOT EXISTS idx_lga_admin_activities_created_at ON lga_admin_activities(created_at DESC);

-- 6. Create view for LGA admin hierarchy
CREATE OR REPLACE VIEW lga_admin_hierarchy AS
SELECT 
  lga.id as lga_admin_id,
  lga.full_name as lga_admin_name,
  lga.email as lga_admin_email,
  lga.assigned_lga,
  lga.assigned_state,
  lga.assigned_city,
  state_admin.id as state_admin_id,
  state_admin.full_name as state_admin_name,
  state_admin.email as state_admin_email,
  super_admin.id as super_admin_id,
  super_admin.full_name as super_admin_name,
  super_admin.email as super_admin_email
FROM users lga
LEFT JOIN users state_admin ON lga.supervising_state_admin_id = state_admin.id
LEFT JOIN users super_admin ON lga.supervising_super_admin_id = super_admin.id
WHERE lga.user_type = 'lga_admin'
  AND lga.deleted_at IS NULL
  AND lga.approval_status = 'approved';

-- 7. Create function to update LGA admin performance metrics
CREATE OR REPLACE FUNCTION update_lga_admin_performance(
  p_lga_admin_id INTEGER,
  p_monitoring_admin_id INTEGER,
  p_monitoring_level VARCHAR(20)
)
RETURNS VOID AS $$
DECLARE
  v_total_users INTEGER;
  v_total_properties INTEGER;
  v_total_transactions INTEGER;
  v_total_revenue DECIMAL(12, 2);
  v_approval_rate DECIMAL(5, 2);
BEGIN
  -- Calculate total users managed by this LGA admin
  SELECT COUNT(*) INTO v_total_users
  FROM users u
  WHERE u.referred_by = p_lga_admin_id
    AND u.deleted_at IS NULL;
    
  -- Calculate total properties approved by this LGA admin
  SELECT COUNT(*) INTO v_total_properties
  FROM properties p
  WHERE p.approved_by_admin_id = p_lga_admin_id
    AND p.is_verified = TRUE;
    
  -- Calculate total transactions processed
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_total_transactions, v_total_revenue
  FROM payments p
  WHERE p.processed_by_admin_id = p_lga_admin_id
    AND p.payment_status = 'completed';
    
  -- Calculate approval rate (properties approved vs total reviewed)
  SELECT 
    CASE 
      WHEN total_reviewed > 0 THEN (approved_count * 100.0 / total_reviewed)
      ELSE 0 
    END INTO v_approval_rate
  FROM (
    SELECT 
      COUNT(*) as total_reviewed,
      SUM(CASE WHEN is_verified = TRUE THEN 1 ELSE 0 END) as approved_count
    FROM properties
    WHERE reviewed_by_admin_id = p_lga_admin_id
  ) stats;
  
  -- Update or insert performance record
  INSERT INTO lga_admin_performance (
    lga_admin_id,
    monitoring_admin_id,
    monitoring_level,
    total_users_managed,
    total_properties_approved,
    total_transactions_processed,
    total_revenue_generated,
    approval_rate,
    last_monitored_at,
    updated_at
  ) VALUES (
    p_lga_admin_id,
    p_monitoring_admin_id,
    p_monitoring_level,
    v_total_users,
    v_total_properties,
    v_total_transactions,
    v_total_revenue,
    v_approval_rate,
    NOW(),
    NOW()
  )
  ON CONFLICT (lga_admin_id, monitoring_admin_id, monitoring_level) 
  DO UPDATE SET
    total_users_managed = EXCLUDED.total_users_managed,
    total_properties_approved = EXCLUDED.total_properties_approved,
    total_transactions_processed = EXCLUDED.total_transactions_processed,
    total_revenue_generated = EXCLUDED.total_revenue_generated,
    approval_rate = EXCLUDED.approval_rate,
    last_monitored_at = EXCLUDED.last_monitored_at,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger to log LGA admin activities
CREATE OR REPLACE FUNCTION log_lga_admin_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_type = 'lga_admin' AND TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO lga_admin_activities (
      lga_admin_id,
      activity_type,
      activity_details,
      ip_address,
      user_agent
    ) VALUES (
      NEW.id,
      CASE 
        WHEN TG_OP = 'INSERT' THEN 'account_created'
        WHEN TG_OP = 'UPDATE' THEN 'account_updated'
      END,
      jsonb_build_object(
        'old_data', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE '{}'::jsonb END,
        'new_data', row_to_json(NEW)
      ),
      NULL, -- Will be populated by application layer
      NULL  -- Will be populated by application layer
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_lga_admin_activity ON users;

CREATE TRIGGER trigger_log_lga_admin_activity
AFTER INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION log_lga_admin_activity();

COMMENT ON TABLE lga_admin_performance IS 'Tracks performance metrics for LGA admins as monitored by state and super admins';
COMMENT ON TABLE lga_admin_activities IS 'Logs all activities performed by LGA admins for audit purposes';
COMMENT ON VIEW lga_admin_hierarchy IS 'Shows the hierarchical relationship between LGA admins, state admins, and super admins';
