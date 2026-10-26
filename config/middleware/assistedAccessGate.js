const db = require('./database');
const allowed = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/refresh-token', '/api/assisted-registration/me', '/api/assisted-registration/payment', '/api/assisted-registration/payment/verify', '/api/assisted-registration/password']);
module.exports = async function assistedAccessGate(req, res, next) {
  if (req.user?.assisted_registration !== true) return next();
  const result = await db.query('SELECT status FROM assisted_registrations WHERE user_id=$1', [req.user.id]);
  if (result.rows[0]?.status === 'paid') return next();
  const route = String(req.originalUrl || '').split('?')[0].replace(/\/$/, '');
  if (allowed.has(route)) return next();
  return res.status(402).json({
    success: false,
    code: 'REGISTRATION_PAYMENT_REQUIRED',
    message: 'Pay your registration fee before opening your dashboard.'
  });
};
