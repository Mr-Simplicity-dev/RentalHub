-- Migration 032: Transportation Admin Monitoring System (SIMPLIFIED VERSION)
-- Add tables for admin, state admin, and super admin monitoring of transportation system
-- SIMPLIFIED: Removed region-based queries since states table doesn't have region column

-- 1. Create admin transportation actions log table
CREATE TABLE IF NOT EXISTS admin_transportation_actions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES transportation_bookings(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES transportation_services(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  action_details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create state admin transportation jurisdiction table
CREATE TABLE IF NOT EXISTS state_admin_transportation_jurisdiction (
  id SERIAL PRIMARY KEY,
  state_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  can_monitor_bookings BOOLEAN DEFAULT TRUE,
  can_manage_services BOOLEAN DEFAULT FALSE,
  can_view_analytics BOOLEAN DEFAULT TRUE,
  can_override_status BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(state_admin_id, state, city)
);

-- 3. Create super admin transportation oversight table
CREATE TABLE IF NOT EXISTS super_admin_transportation_oversight (
  id SERIAL PRIMARY KEY,
  super_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oversight_level VARCHAR(20) NOT NULL CHECK (oversight_level IN ('national', 'state')),
  state VARCHAR(100),
  can_manage_all_services BOOLEAN DEFAULT TRUE,
  can_view_all_analytics BOOLEAN DEFAULT TRUE,
  can_override_any_status BOOLEAN DEFAULT TRUE,
  can_assign_state_admins BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- 4. Create transportation performance metrics table
CREATE TABLE IF NOT EXISTS transportation_performance_metrics (
  id SERIAL PRIMARY KEY,
  metric_date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  metric_value DECIMAL(12, 2) NOT NULL,
  breakdown JSONB,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_date, metric_type)
);

-- 5. Create transportation alert system table
CREATE TABLE IF NOT EXISTS transportation_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,
  alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('info', 'warning', 'critical')),
  alert_title VARCHAR(255) NOT NULL,
  alert_description TEXT,
  related_booking_id INTEGER REFERENCES transportation_bookings(id) ON DELETE SET NULL,
  related_service_id INTEGER REFERENCES transportation_services(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5b. Create transportation operations timeline table
CREATE TABLE IF NOT EXISTS transportation_booking_operations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES transportation_bookings(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  event_type VARCHAR(80) NOT NULL,
  note TEXT,
  proof_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transportation_bookings
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS pickup_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dropoff_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_transportation_actions_admin ON admin_transportation_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_transportation_actions_booking ON admin_transportation_actions(booking_id);
CREATE INDEX IF NOT EXISTS idx_admin_transportation_actions_created ON admin_transportation_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_transportation_actions_type ON admin_transportation_actions(action_type);

CREATE INDEX IF NOT EXISTS idx_state_admin_transportation_state_admin ON state_admin_transportation_jurisdiction(state_admin_id);
CREATE INDEX IF NOT EXISTS idx_state_admin_transportation_state ON state_admin_transportation_jurisdiction(state);
CREATE INDEX IF NOT EXISTS idx_state_admin_transportation_city ON state_admin_transportation_jurisdiction(city);

CREATE INDEX IF NOT EXISTS idx_super_admin_transportation_super_admin ON super_admin_transportation_oversight(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_transportation_level ON super_admin_transportation_oversight(oversight_level);
CREATE INDEX IF NOT EXISTS idx_super_admin_transportation_state ON super_admin_transportation_oversight(state);

CREATE INDEX IF NOT EXISTS idx_transportation_performance_date ON transportation_performance_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_transportation_performance_type ON transportation_performance_metrics(metric_type);

CREATE INDEX IF NOT EXISTS idx_transportation_alerts_type ON transportation_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_transportation_alerts_level ON transportation_alerts(alert_level);
CREATE INDEX IF NOT EXISTS idx_transportation_alerts_resolved ON transportation_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_transportation_alerts_created ON transportation_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transportation_operations_booking ON transportation_booking_operations(booking_id, created_at DESC);

-- 7. Create views for admin monitoring (SIMPLIFIED VERSION)

-- View for state admin transportation monitoring
CREATE OR REPLACE VIEW state_admin_transportation_view AS
SELECT 
  saj.state_admin_id,
  saj.state,
  saj.city,
  saj.can_monitor_bookings,
  saj.can_manage_services,
  saj.can_view_analytics,
  saj.can_override_status,
  u.full_name as admin_name,
  u.email as admin_email,
  u.user_type as admin_role,
  COUNT(DISTINCT tb.id) as total_bookings,
  COUNT(DISTINCT CASE WHEN tb.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN tb.id END) as recent_bookings,
  COALESCE(SUM(CASE WHEN tb.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN tb.total_price ELSE 0 END), 0) as recent_revenue,
  COUNT(DISTINCT ts.id) as available_services
FROM state_admin_transportation_jurisdiction saj
JOIN users u ON saj.state_admin_id = u.id
LEFT JOIN states state_lookup ON state_lookup.name = saj.state
LEFT JOIN properties p ON (
  p.state_id = state_lookup.id
  AND (saj.city IS NULL OR p.city = saj.city)
)
LEFT JOIN transportation_bookings tb ON p.id = tb.property_id
LEFT JOIN transportation_services ts ON ts.is_active = TRUE
WHERE u.user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
  AND u.deleted_at IS NULL
  AND u.approval_status = 'approved'
GROUP BY saj.state_admin_id, saj.state, saj.city, saj.can_monitor_bookings, 
         saj.can_manage_services, saj.can_view_analytics, saj.can_override_status,
         u.full_name, u.email, u.user_type;

-- View for super admin transportation oversight (SIMPLIFIED - removed region references)
CREATE OR REPLACE VIEW super_admin_transportation_oversight_view AS
SELECT 
  sao.super_admin_id,
  sao.oversight_level,
  sao.state as oversight_state,
  sao.can_manage_all_services,
  sao.can_view_all_analytics,
  sao.can_override_any_status,
  sao.can_assign_state_admins,
  u.full_name as super_admin_name,
  u.email as super_admin_email,
  COUNT(DISTINCT CASE WHEN sao.oversight_level = 'national' THEN tb.id 
                      WHEN sao.oversight_level = 'state' AND booking_state.name = sao.state THEN tb.id
                 END) as oversight_bookings,
  COUNT(DISTINCT CASE WHEN sao.oversight_level = 'national' THEN ts.id 
                      WHEN sao.oversight_level = 'state' THEN ts.id
                 END) as oversight_services,
  COUNT(DISTINCT CASE WHEN sao.oversight_level = 'national' THEN saj.state_admin_id 
                      WHEN sao.oversight_level = 'state' AND saj.state = sao.state THEN saj.state_admin_id
                 END) as oversight_state_admins
FROM super_admin_transportation_oversight sao
JOIN users u ON sao.super_admin_id = u.id
LEFT JOIN transportation_bookings tb ON 1=1
LEFT JOIN properties p ON tb.property_id = p.id
LEFT JOIN states booking_state ON booking_state.id = p.state_id
LEFT JOIN transportation_services ts ON ts.is_active = TRUE
LEFT JOIN state_admin_transportation_jurisdiction saj ON 1=1
WHERE u.user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin')
  AND u.deleted_at IS NULL
  AND u.approval_status = 'approved'
GROUP BY sao.super_admin_id, sao.oversight_level, sao.state,
         sao.can_manage_all_services, sao.can_view_all_analytics, 
         sao.can_override_any_status, sao.can_assign_state_admins,
         u.full_name, u.email;

-- View for transportation system health
CREATE OR REPLACE VIEW transportation_system_health_view AS
SELECT 
  DATE(created_at) as health_date,
  COUNT(*) as total_bookings,
  COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
  COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END) as cancelled_bookings,
  COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as paid_bookings,
  COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_payments,
  COALESCE(SUM(total_price), 0) as daily_revenue,
  COUNT(DISTINCT tenant_id) as unique_tenants,
  COUNT(DISTINCT property_id) as unique_properties,
  COUNT(DISTINCT service_id) as active_services_used,
  AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) as avg_confirmation_time_seconds,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_completion_time_seconds
FROM transportation_bookings
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY health_date DESC;

-- 8. Create functions for admin monitoring

-- Function to check if admin can monitor transportation in jurisdiction
CREATE OR REPLACE FUNCTION can_monitor_transportation(
  p_admin_id INTEGER,
  p_state VARCHAR(100),
  p_city VARCHAR(100) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_type VARCHAR(50);
  v_can_monitor BOOLEAN;
BEGIN
  -- Get user type
  SELECT user_type INTO v_user_type
  FROM users 
  WHERE id = p_admin_id 
    AND deleted_at IS NULL 
    AND approval_status = 'approved';
    
  IF v_user_type IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Super admins can monitor everything
  IF v_user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin') THEN
    RETURN TRUE;
  END IF;
  
  -- State admins need jurisdiction check
  IF v_user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin') THEN
    SELECT EXISTS (
      SELECT 1 
      FROM state_admin_transportation_jurisdiction 
      WHERE state_admin_id = p_admin_id 
        AND state = p_state 
        AND (city IS NULL OR city = p_city)
        AND can_monitor_bookings = TRUE
    ) INTO v_can_monitor;
    
    RETURN v_can_monitor;
  END IF;
  
  -- Regular admins can monitor everything (national level)
  IF v_user_type = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to log transportation admin action
CREATE OR REPLACE FUNCTION log_transportation_admin_action(
  p_admin_id INTEGER,
  p_action_type VARCHAR(50),
  p_action_details JSONB DEFAULT NULL,
  p_booking_id INTEGER DEFAULT NULL,
  p_service_id INTEGER DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_action_id INTEGER;
BEGIN
  INSERT INTO admin_transportation_actions (
    admin_id, booking_id, service_id, action_type, 
    action_details, ip_address, user_agent
  ) VALUES (
    p_admin_id, p_booking_id, p_service_id, p_action_type,
    p_action_details, p_ip_address, p_user_agent
  )
  RETURNING id INTO v_action_id;
  
  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate transportation alerts
CREATE OR REPLACE FUNCTION generate_transportation_alert(
  p_alert_type VARCHAR(50),
  p_alert_level VARCHAR(20),
  p_alert_title VARCHAR(255),
  p_alert_description TEXT DEFAULT NULL,
  p_related_booking_id INTEGER DEFAULT NULL,
  p_related_service_id INTEGER DEFAULT NULL,
  p_admin_id INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_alert_id INTEGER;
BEGIN
  INSERT INTO transportation_alerts (
    alert_type, alert_level, alert_title, alert_description,
    related_booking_id, related_service_id, admin_id
  ) VALUES (
    p_alert_type, p_alert_level, p_alert_title, p_alert_description,
    p_related_booking_id, p_related_service_id, p_admin_id
  )
  RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Create triggers for automatic alerts

-- Trigger for failed payments alert
CREATE OR REPLACE FUNCTION trigger_transportation_failed_payment_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'failed' AND OLD.payment_status != 'failed' THEN
    PERFORM generate_transportation_alert(
      'payment_failed',
      'warning',
      'Transportation Payment Failed',
      CONCAT('Payment failed for transportation booking #', NEW.id),
      NEW.id,
      NEW.service_id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transportation_failed_payment ON transportation_bookings;
CREATE TRIGGER trigger_transportation_failed_payment
AFTER UPDATE OF payment_status ON transportation_bookings
FOR EACH ROW
EXECUTE FUNCTION trigger_transportation_failed_payment_alert();

-- Trigger for cancelled booking alert
CREATE OR REPLACE FUNCTION trigger_transportation_cancelled_booking_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_status = 'cancelled' AND OLD.booking_status != 'cancelled' THEN
    PERFORM generate_transportation_alert(
      'booking_cancelled',
      'info',
      'Transportation Booking Cancelled',
      CONCAT('Transportation booking #', NEW.id, ' has been cancelled'),
      NEW.id,
      NEW.service_id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transportation_cancelled_booking ON transportation_bookings;
CREATE TRIGGER trigger_transportation_cancelled_booking
AFTER UPDATE OF booking_status ON transportation_bookings
FOR EACH ROW
EXECUTE FUNCTION trigger_transportation_cancelled_booking_alert();

-- 10. Insert default permissions for existing admins

-- Grant transportation monitoring permissions to existing super admins
INSERT INTO super_admin_transportation_oversight (
  super_admin_id, oversight_level, can_manage_all_services, 
  can_view_all_analytics, can_override_any_status, can_assign_state_admins
)
SELECT 
  id, 
  'national',
  TRUE,
  TRUE,
  TRUE,
  TRUE
FROM users 
WHERE user_type IN ('super_admin', 'super_financial_admin', 'super_support_admin')
  AND deleted_at IS NULL
  AND approval_status = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM super_admin_transportation_oversight sao
    WHERE sao.super_admin_id = users.id
      AND sao.oversight_level = 'national'
      AND sao.state IS NULL
  );

-- Grant transportation monitoring permissions to existing state admins
INSERT INTO state_admin_transportation_jurisdiction (
  state_admin_id, state, can_monitor_bookings, can_manage_services, 
  can_view_analytics, can_override_status, assigned_by
)
SELECT 
  u.id,
  u.assigned_state,
  TRUE,
  FALSE,
  TRUE,
  FALSE,
  (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)
FROM users u
WHERE u.user_type IN ('state_admin', 'state_financial_admin', 'state_support_admin')
  AND u.assigned_state IS NOT NULL
  AND u.deleted_at IS NULL
  AND u.approval_status = 'approved'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE admin_transportation_actions IS 'Logs all admin actions related to transportation system';
COMMENT ON TABLE state_admin_transportation_jurisdiction IS 'Defines transportation monitoring jurisdiction for state admins';
COMMENT ON TABLE super_admin_transportation_oversight IS 'Defines transportation oversight permissions for super admins';
COMMENT ON TABLE transportation_performance_metrics IS 'Stores calculated performance metrics for transportation system';
COMMENT ON TABLE transportation_alerts IS 'System alerts for transportation monitoring';
COMMENT ON VIEW state_admin_transportation_view IS 'View for state admin transportation monitoring dashboard';
COMMENT ON VIEW super_admin_transportation_oversight_view IS 'View for super admin transportation oversight dashboard';
COMMENT ON VIEW transportation_system_health_view IS 'View for transportation system health monitoring';
