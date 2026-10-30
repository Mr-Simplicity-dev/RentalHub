const crypto = require('crypto');
const db = require('../config/middleware/database');
const registration = require('./assistedRegistrationService');
const { fail } = require('./assistedRegistrationPolicy');
const activity = require('./activityLogger');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const customer = async (actor, reference) => {
  const record = await registration.recordForStaff(actor, reference);
  const user = (await db.query('SELECT id,full_name,user_type,is_active,deleted_at FROM users WHERE id=$1', [record.user_id])).rows[0];
  if (!user || user.deleted_at || user.is_active === false || !['tenant', 'landlord'].includes(user.user_type)) throw fail(403, 'This customer is not eligible for assisted photo capture.');
  return user;
};
const audit = (actor, userId, action) => activity.log({ userId: actor.id, userType: actor.user_type, action, entityType: 'assisted_registration', entityId: userId, metadata: { consent_version: 'assisted-photo-v1' } });
const start = async (actor, reference, body) => {
  const user = await customer(actor, reference);
  if (body.consent_confirmed !== true) throw fail(400, 'Obtain the customer’s agreement before taking their photo.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('DELETE FROM assisted_photo_capture_sessions WHERE expires_at < NOW()');
  await db.query("INSERT INTO assisted_photo_capture_sessions(token_hash,user_id,staff_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')", [hash(token), user.id, actor.id]);
  await audit(actor, user.id, 'ASSISTED_PHOTO_CONSENT_CONFIRMED');
  return { token };
};
const consume = async (actor, reference, token) => {
  const user = await customer(actor, reference);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw fail(403, 'Start a new customer photo capture.');
  const result = await db.query('UPDATE assisted_photo_capture_sessions SET consumed_at=NOW() WHERE token_hash=$1 AND user_id=$2 AND staff_id=$3 AND consumed_at IS NULL AND expires_at>NOW() RETURNING user_id', [hash(token), user.id, actor.id]);
  if (!result.rows.length) throw fail(403, 'Capture session expired or was already used. Please retake the photo.');
  return user;
};
module.exports = { start, consume, customer, audit };
