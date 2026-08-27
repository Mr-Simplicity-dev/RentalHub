BEGIN;

-- Restore the state_admin_earnings view. Several later migrations drop it to
-- relax constraints and were expected to re-create it; on this database the
-- re-creation never completed, leaving dashboards (commission health, state
-- admin performance) reading from a missing relation. The definition matches
-- migration 012_state_admin_system.sql.
CREATE OR REPLACE VIEW state_admin_earnings AS
SELECT
    admin.id as admin_id,
    admin.full_name as admin_name,
    admin.email as admin_email,
    admin.assigned_state,
    admin.assigned_city,
    admin.admin_wallet_balance,
    COUNT(DISTINCT ac.id) as total_commissions,
    SUM(CASE WHEN ac.status = 'paid' THEN ac.amount ELSE 0 END) as total_paid,
    SUM(CASE WHEN ac.status = 'pending' THEN ac.amount ELSE 0 END) as total_pending,
    COUNT(DISTINCT u.id) as total_users_managed,
    COUNT(DISTINCT aw.id) as total_withdrawals,
    SUM(CASE WHEN aw.status = 'processed' THEN aw.amount ELSE 0 END) as total_withdrawn
FROM users admin
LEFT JOIN admin_commissions ac ON admin.id = ac.admin_id
LEFT JOIN users u ON u.referred_by = admin.id
LEFT JOIN admin_withdrawals aw ON admin.id = aw.admin_id
WHERE admin.user_type = 'state_admin'
GROUP BY admin.id, admin.full_name, admin.email, admin.assigned_state, admin.assigned_city, admin.admin_wallet_balance
ORDER BY admin.assigned_state, admin.assigned_city;

COMMIT;
