import db from '../db/index.js';

export const enforceFlags = async (req, res, next) => {
  const { rows } = await db.query(`SELECT key, enabled FROM feature_flags`);
  const flags = Object.fromEntries(rows.map(r => [r.key, r.enabled]));

  if (flags.maintenance_mode && !req.user?.role?.includes('super_admin')) {
    return res.status(503).json({ message: 'System under maintenance' });
  }

  if (!flags.allow_registration && req.path.includes('/auth/register')) {
    return res.status(403).json({ message: 'Registration disabled' });
  }

  if (!flags.allow_property_posting && req.path.includes('/properties') && req.method === 'POST') {
    return res.status(403).json({ message: 'Property posting disabled' });
  }

  if (!flags.allow_applications && req.path.includes('/applications') && req.method === 'POST') {
    return res.status(403).json({ message: 'Applications disabled' });
  }

  next();
};
