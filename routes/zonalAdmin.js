const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const { requireZonalAdmin } = require('../config/middleware/requireZonalAdmin');
const { ZONE_STATES, canonicalZone } = require('../config/utils/territorialZones');

const router = express.Router();
router.use(authenticate, requireZonalAdmin);

const getScope = async (userId) => {
  const result = await db.query('SELECT assigned_zone FROM users WHERE id = $1 LIMIT 1', [userId]);
  const assignedZone = canonicalZone(result.rows[0]?.assigned_zone);
  return assignedZone ? { assignedZone, states: ZONE_STATES[assignedZone] } : null;
};
const pagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
};
const sendPage = (res, rows, total, page, limit) => res.json({ success: true, data: rows, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });

router.get('/dashboard', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const params = [scope.states];
    const [properties, applications, users, verifications, statePerformance, escalations] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM properties p JOIN states s ON s.id = p.state_id WHERE s.state_name = ANY($1)`, params),
      db.query(`SELECT COUNT(*) FROM applications a JOIN properties p ON p.id = a.property_id JOIN states s ON s.id = p.state_id WHERE s.state_name = ANY($1)`, params),
      db.query(`SELECT COUNT(DISTINCT scoped.user_id) FROM (
          SELECT COALESCE(p.user_id, p.landlord_id) AS user_id
          FROM properties p JOIN states s ON s.id = p.state_id WHERE s.state_name = ANY($1)
          UNION
          SELECT a.tenant_id AS user_id
          FROM applications a JOIN properties p ON p.id = a.property_id JOIN states s ON s.id = p.state_id
          WHERE s.state_name = ANY($1)
        ) scoped WHERE scoped.user_id IS NOT NULL`, params),
      db.query(`SELECT COUNT(*) FROM users WHERE assigned_state = ANY($1) AND deleted_at IS NULL AND COALESCE(identity_verification_status, CASE WHEN identity_verified THEN 'verified' ELSE 'pending' END) = 'pending'`, params),
      db.query(`SELECT s.state_name,
          COUNT(DISTINCT p.id)::int AS properties,
          COUNT(DISTINCT a.id)::int AS applications
        FROM states s
        LEFT JOIN properties p ON p.state_id = s.id
        LEFT JOIN applications a ON a.property_id = p.id
        WHERE s.state_name = ANY($1)
        GROUP BY s.state_name ORDER BY s.state_name`, params),
      db.query(`SELECT COUNT(*) FROM support_tickets WHERE state = ANY($1) AND escalation_status <> 'none' AND status <> 'resolved'`, params),
    ]);
    return res.json({ success: true, data: {
      totalUsers: Number(users.rows[0].count),
      totalProperties: Number(properties.rows[0].count),
      applications: Number(applications.rows[0].count),
      pendingVerifications: Number(verifications.rows[0].count),
      openEscalations: Number(escalations.rows[0].count),
      statePerformance: statePerformance.rows,
      scope: { assignedZone: scope.assignedZone, states: scope.states },
    }});
  } catch (error) {
    req.logger.error('Zonal dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal dashboard' });
  }
});

router.get('/admins', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const result = await db.query(`SELECT id, full_name, email, user_type, assigned_state, assigned_city, approval_status, is_active, created_at
      FROM users WHERE assigned_state = ANY($1) AND user_type IN ('admin','lga_admin','state_admin') AND deleted_at IS NULL
      ORDER BY assigned_state, user_type, full_name`, [scope.states]);
    return res.json({ success: true, data: result.rows, scope: { assignedZone: scope.assignedZone } });
  } catch (error) {
    req.logger.error('Zonal admin supervision error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal administrators' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const { page, limit, offset } = pagination(req.query);
    const search = `%${String(req.query.search || '').trim()}%`;
    const role = String(req.query.role || 'all');
    const state = `%${String(req.query.state || '').trim()}%`;
    const params = [scope.states, search, role, state];
    const scoped = `u.deleted_at IS NULL AND u.user_type IN ('tenant','landlord')
      AND ($3 = 'all' OR u.user_type = $3)
      AND (u.full_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)
      AND EXISTS (
        SELECT 1 FROM properties p JOIN states s ON s.id = p.state_id
        WHERE (p.user_id = u.id OR p.landlord_id = u.id) AND s.state_name = ANY($1) AND s.state_name ILIKE $4
        UNION ALL
        SELECT 1 FROM applications a JOIN properties p ON p.id = a.property_id JOIN states s ON s.id = p.state_id
        WHERE a.tenant_id = u.id AND s.state_name = ANY($1) AND s.state_name ILIKE $4
      )`;
    const [count, data] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users u WHERE ${scoped}`, params),
      db.query(`SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.email_verified, u.phone_verified, u.identity_verified, u.created_at
        FROM users u WHERE ${scoped} ORDER BY u.created_at DESC LIMIT $5 OFFSET $6`, [...params, limit, offset]),
    ]);
    return sendPage(res, data.rows, Number(count.rows[0].count), page, limit);
  } catch (error) {
    req.logger.error('Zonal users error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal users' });
  }
});

router.get('/properties', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const { page, limit, offset } = pagination(req.query);
    const params = [scope.states, `%${String(req.query.search || '').trim()}%`];
    const where = `s.state_name = ANY($1) AND (p.title ILIKE $2 OR u.full_name ILIKE $2 OR p.city ILIKE $2)`;
    const [count, data] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM properties p LEFT JOIN users u ON u.id = p.user_id JOIN states s ON s.id = p.state_id WHERE ${where}`, params),
      db.query(`SELECT p.id, p.title, p.rent_amount, p.status,
          CASE WHEN p.is_verified THEN 'approved' WHEN LOWER(COALESCE(p.status,'')) = 'rejected' THEN 'rejected' ELSE 'pending' END AS approval_status,
          p.is_available, p.featured, p.created_at, p.city, s.state_name AS state, s.state_name, u.full_name AS landlord_name
        FROM properties p LEFT JOIN users u ON u.id = p.user_id JOIN states s ON s.id = p.state_id
        WHERE ${where} ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`, [...params, limit, offset]),
    ]);
    return sendPage(res, data.rows, Number(count.rows[0].count), page, limit);
  } catch (error) {
    req.logger.error('Zonal properties error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal properties' });
  }
});

router.get('/applications', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const { page, limit, offset } = pagination(req.query);
    const params = [scope.states, `%${String(req.query.search || '').trim()}%`];
    const joins = `FROM applications a JOIN users t ON t.id = a.tenant_id JOIN properties p ON p.id = a.property_id LEFT JOIN users l ON l.id = p.user_id JOIN states s ON s.id = p.state_id`;
    const where = `s.state_name = ANY($1) AND (t.full_name ILIKE $2 OR p.title ILIKE $2 OR l.full_name ILIKE $2)`;
    const [count, data] = await Promise.all([
      db.query(`SELECT COUNT(*) ${joins} WHERE ${where}`, params),
      db.query(`SELECT a.id, a.status, a.created_at, t.full_name AS tenant_name, p.title AS property_title, l.full_name AS landlord_name, s.state_name ${joins} WHERE ${where} ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`, [...params, limit, offset]),
    ]);
    return sendPage(res, data.rows, Number(count.rows[0].count), page, limit);
  } catch (error) {
    req.logger.error('Zonal applications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal applications' });
  }
});

router.get('/verifications', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const { page, limit, offset } = pagination(req.query);
    const params = [scope.states, `%${String(req.query.search || '').trim()}%`];
    const where = `u.deleted_at IS NULL AND u.email_verified = TRUE AND u.phone_verified = TRUE
      AND COALESCE(u.identity_verification_status, CASE WHEN u.identity_verified THEN 'verified' ELSE 'pending' END) = 'pending'
      AND (u.full_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)
      AND EXISTS (SELECT 1 FROM properties p JOIN states s ON s.id = p.state_id WHERE (p.user_id = u.id OR p.landlord_id = u.id) AND s.state_name = ANY($1)
        UNION ALL SELECT 1 FROM applications a JOIN properties p ON p.id = a.property_id JOIN states s ON s.id = p.state_id WHERE a.tenant_id = u.id AND s.state_name = ANY($1))`;
    const [count, data] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params),
      db.query(`SELECT u.id, u.full_name, u.email, u.phone, u.user_type, u.nin, u.passport_photo_url, u.created_at FROM users u WHERE ${where} ORDER BY u.created_at LIMIT $3 OFFSET $4`, [...params, limit, offset]),
    ]);
    return sendPage(res, data.rows, Number(count.rows[0].count), page, limit);
  } catch (error) {
    req.logger.error('Zonal verifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal verifications' });
  }
});

router.get('/escalations', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const result = await db.query(`SELECT id, subject, status, priority, state, lga, escalation_department, escalation_status, last_escalated_at, created_at
      FROM support_tickets WHERE state = ANY($1) AND escalation_status <> 'none'
      ORDER BY COALESCE(last_escalated_at, created_at) DESC LIMIT 200`, [scope.states]);
    return res.json({ success: true, data: result.rows, scope: { assignedZone: scope.assignedZone } });
  } catch (error) {
    req.logger.error('Zonal escalation report error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal escalations' });
  }
});

router.get('/service-operations', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Admin account is missing a valid assigned_zone' });
    const result = await db.query(`
      SELECT 'transportation' AS service_type, s.state_name,
             COUNT(*)::int AS bookings,
             COUNT(*) FILTER (WHERE tb.booking_status IN ('pending','confirmed','in_progress'))::int AS active,
             COALESCE(SUM(tb.total_price), 0) AS gross_value
      FROM transportation_bookings tb JOIN properties p ON p.id = tb.property_id JOIN states s ON s.id = p.state_id
      WHERE s.state_name = ANY($1) GROUP BY s.state_name
      UNION ALL
      SELECT 'fumigation_cleaning' AS service_type, s.state_name,
             COUNT(*)::int AS bookings,
             COUNT(*) FILTER (WHERE fb.booking_status IN ('pending','confirmed','scheduled','in_progress'))::int AS active,
             COALESCE(SUM(fb.total_price), 0) AS gross_value
      FROM fumigation_cleaning_bookings fb JOIN properties p ON p.id = fb.property_id JOIN states s ON s.id = p.state_id
      WHERE s.state_name = ANY($1) GROUP BY s.state_name
      ORDER BY service_type, state_name`, [scope.states]);
    return res.json({ success: true, data: result.rows, scope: { assignedZone: scope.assignedZone } });
  } catch (error) {
    req.logger.error('Zonal service operations error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal service operations' });
  }
});

module.exports = router;
