const {requirePrivilegedMfa}=require('../config/utils/twoFactor');
const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const {
  authenticate,
  requireNotImpersonating
} = require('../config/middleware/auth');
const {
  validateSkills,
  languages
} = require('../config/utils/languagePolicy');
const {
  logAction
} = require('../config/utils/auditLogger');
const rateLimit = require('express-rate-limit');
const STAFF = new Set(['lga_support_admin', 'state_support_admin', 'super_support_admin', 'super_admin']);
const senior = u => ['super_support_admin', 'super_admin'].includes(u?.user_type);
const safe = fn => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    req.logger?.error('Support language action failed', {
      code: e.code
    });
    res.status(e.status || 500).json({
      success: false,
      message: e.status ? e.message : 'Support language action could not be completed.'
    });
  }
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), {
    status
  });
};
router.get('/catalog', (_req, res) => res.json({
  success: true,
  data: languages
}));
router.use(authenticate, requirePrivilegedMfa, requireNotImpersonating, rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
}));
router.use((req, res, next) => STAFF.has(req.user.user_type) ? next() : res.status(403).json({
  message: 'Support staff access required'
}));
router.get('/profile', safe(async (req, res) => res.json({
  data: {
    skills: (await db.query('SELECT * FROM support_agent_languages WHERE user_id=$1', [req.user.id])).rows,
    availability: (await db.query('SELECT available_until FROM support_agent_availability WHERE user_id=$1', [req.user.id])).rows[0] || null
  }
})));
router.put('/profile', safe(async (req, res) => {
  let rows;
  try {
    rows = validateSkills(req.body.skills);
  } catch (e) {
    fail(400, e.message);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    await client.query('DELETE FROM support_agent_languages WHERE user_id=$1', [req.user.id]);
    for (const row of rows) await client.query('INSERT INTO support_agent_languages(user_id,language_id,oral,written) VALUES($1,$2,$3,$4)', [req.user.id, row.language_id, row.oral, row.written]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await logAction({
    actorId: req.user.id,
    action: 'SUPPORT_LANGUAGES_SUBMITTED',
    targetType: 'user',
    targetId: req.user.id
  });
  res.json({
    message: 'Saved for senior support review. These skills are not approved yet.'
  });
}));
router.put('/availability', safe(async (req, res) => {
  const minutes = req.body.available === true ? Math.min(480, Math.max(15, Number(req.body.minutes) || 60)) : 0;
  await db.query(`INSERT INTO support_agent_availability(user_id,available_until) VALUES($1,NOW()+($2::int*INTERVAL '1 minute')) ON CONFLICT(user_id) DO UPDATE SET available_until=EXCLUDED.available_until,updated_at=NOW()`, [req.user.id, minutes]);
  await logAction({
    actorId: req.user.id,
    action: minutes ? 'SUPPORT_ON_DUTY' : 'SUPPORT_OFF_DUTY',
    targetType: 'user',
    targetId: req.user.id
  });
  res.json({
    message: minutes ? 'Available for the next ' + minutes + ' minutes.' : 'Marked unavailable.'
  });
}));
router.get('/review', safe(async (req, res) => {
  if (!senior(req.user)) fail(403, 'Senior support access required');
  const rows = await db.query(`SELECT l.*,u.full_name,u.user_type FROM support_agent_languages l JOIN users u ON u.id=l.user_id WHERE u.deleted_at IS NULL ORDER BY l.status,l.user_id,l.language_id LIMIT 1000`);
  res.json({
    data: rows.rows
  });
}));
router.post('/review', safe(async (req, res) => {
  if (!senior(req.user)) fail(403, 'Senior support access required');
  if (Number(req.body.user_id) === Number(req.user.id)) fail(403, 'Another senior officer must review your skills.');
  if (!['approved', 'rejected'].includes(req.body.status) || String(req.body.note || '').trim().length < 10) fail(400, 'Record the language assessment and result.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE support_agent_languages SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE user_id=$3 AND language_id=$4 RETURNING user_id', [req.body.status, req.user.id, req.body.user_id, req.body.language_id]);
    if (!result.rows.length) fail(404, 'Language record not found');
    await client.query('INSERT INTO support_language_reviews(user_id,language_id,reviewer_id,status,note) VALUES($1,$2,$3,$4,$5)', [req.body.user_id, req.body.language_id, req.user.id, req.body.status, String(req.body.note).trim().slice(0, 2000)]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await logAction({
    actorId: req.user.id,
    action: 'SUPPORT_LANGUAGE_' + req.body.status.toUpperCase(),
    targetType: 'user',
    targetId: req.body.user_id
  });
  res.json({
    message: 'Assessment recorded.'
  });
}));
router.get('/monitor', safe(async (req, res) => {
  if (!senior(req.user)) fail(403, 'Senior support access required');
  const rows = await db.query(`SELECT m.*,u.full_name,t.status,t.preferred_language FROM support_response_misses m JOIN users u ON u.id=m.agent_id JOIN support_tickets t ON t.id=m.ticket_id ORDER BY m.created_at DESC LIMIT 200`);
  res.json({
    data: rows.rows
  });
}));
router.post('/monitor/:id/review', safe(async (req, res) => {
  if (!senior(req.user)) fail(403, 'Senior support access required');
  if (!['excused', 'needs_followup'].includes(req.body.status) || String(req.body.note || '').trim().length < 10) fail(400, 'Choose a result and record the reason.');
  const r = await db.query('UPDATE support_response_misses SET review_status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$4 AND agent_id<>$3 RETURNING agent_id', [req.body.status, String(req.body.note).trim().slice(0, 2000), req.user.id, req.params.id]);
  if (!r.rows.length) fail(409, 'Record not found, or another officer must review it.');
  await logAction({
    actorId: req.user.id,
    action: 'SUPPORT_RESPONSE_REVIEWED',
    targetType: 'user',
    targetId: r.rows[0].agent_id
  });
  res.json({
    message: 'Review saved. No automatic penalty has been applied.'
  });
}));
module.exports = router;
