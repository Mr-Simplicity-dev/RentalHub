const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const { requireZonalFinancialAdmin } = require('../config/middleware/requireZonalFinancialAdmin');
const { ZONE_STATES, canonicalZone } = require('../config/utils/territorialZones');

const router = express.Router();
router.use(authenticate, requireZonalFinancialAdmin);

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

router.get('/overview', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Financial Admin account is missing a valid assigned_zone' });
    const params = [scope.states];

    const [revenue, transactions, withdrawals, commissions] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(p.amount), 0) AS total_revenue,
                COUNT(*) FILTER (WHERE p.payment_status = 'completed')::int AS completed
         FROM payments p
         JOIN properties prop ON p.property_id = prop.id
         JOIN states s ON s.id = prop.state_id
         WHERE s.state_name = ANY($1)`,
        params
      ),
      db.query(
        `SELECT p.id, p.amount, p.payment_status, p.payment_type, p.created_at,
                u.full_name AS user_name, prop.title AS property_title, s.state_name AS state
         FROM payments p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN properties prop ON p.property_id = prop.id
         LEFT JOIN states s ON s.id = prop.state_id
         WHERE s.state_name = ANY($1)
         ORDER BY p.created_at DESC LIMIT 20`,
        params
      ),
      db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE w.status = 'pending')::int AS pending,
                COALESCE(SUM(w.amount) FILTER (WHERE w.status = 'completed'), 0) AS paid_out
         FROM admin_withdrawals w
         JOIN users u ON u.id = w.admin_id
         WHERE u.assigned_state = ANY($1)`,
        params
      ),
      db.query(
        `SELECT s.state_name,
                COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) AS revenue,
                COUNT(*) FILTER (WHERE p.payment_status = 'completed')::int AS payments
         FROM states s
         LEFT JOIN properties prop ON prop.state_id = s.id
         LEFT JOIN payments p ON p.property_id = prop.id
         WHERE s.state_name = ANY($1)
         GROUP BY s.state_name ORDER BY s.state_name`,
        params
      ),
    ]);

    return res.json({
      success: true,
      data: {
        totalRevenue: Number(revenue.rows[0]?.total_revenue || 0),
        completedPayments: Number(revenue.rows[0]?.completed || 0),
        withdrawals: {
          total: Number(withdrawals.rows[0]?.total || 0),
          pending: Number(withdrawals.rows[0]?.pending || 0),
          paidOut: Number(withdrawals.rows[0]?.paid_out || 0),
        },
        recentTransactions: transactions.rows,
        stateBreakdown: commissions.rows,
        scope: { assignedZone: scope.assignedZone, states: scope.states },
      },
    });
  } catch (error) {
    req.logger.error('Zonal financial overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal financial overview' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const scope = await getScope(req.user.id);
    if (!scope) return res.status(403).json({ success: false, message: 'Zonal Financial Admin account is missing a valid assigned_zone' });
    const { page, limit, offset } = pagination(req.query);
    const params = [scope.states, `%${String(req.query.search || '').trim()}%`];
    const where = `s.state_name = ANY($1) AND (p.id::text ILIKE $2 OR u.full_name ILIKE $2 OR prop.title ILIKE $2)`;
    const [count, data] = await Promise.all([
      db.query(
        `SELECT COUNT(*) FROM payments p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN properties prop ON p.property_id = prop.id
         LEFT JOIN states s ON s.id = prop.state_id
         WHERE ${where}`,
        params
      ),
      db.query(
        `SELECT p.id, p.amount, p.payment_status, p.payment_type, p.created_at,
                u.full_name AS user_name, u.email AS user_email, prop.title AS property_title, s.state_name AS state
         FROM payments p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN properties prop ON p.property_id = prop.id
         LEFT JOIN states s ON s.id = prop.state_id
         WHERE ${where}
         ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
        [...params, limit, offset]
      ),
    ]);
    return res.json({
      success: true,
      data: data.rows,
      pagination: { total: Number(count.rows[0].count), page, limit, pages: Math.ceil(Number(count.rows[0].count) / limit) },
    });
  } catch (error) {
    req.logger.error('Zonal financial transactions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load zonal financial transactions' });
  }
});

module.exports = router;
