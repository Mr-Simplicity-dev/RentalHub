const crypto = require('crypto');
const db = require('../config/middleware/database');
const registration = require('./assistedRegistrationService');
const { fail, supervisors, otpHash, phoneKey } = require('./assistedRegistrationPolicy');
const matcher = require('./fingerprintMatcher');
const activity = require('./activityLogger');
const audit = (actor, action, userId, metadata = {}) => activity.log({ userId: actor.id, userType: actor.user_type, action, entityType: 'office_fingerprint', entityId: userId, metadata });
const customer = async (actor, reference) => {
  const record = await registration.recordForStaff(actor, reference);
  const user = (await db.query('SELECT user_type,is_active,deleted_at,phone_verified,phone FROM users WHERE id=$1', [record.user_id])).rows[0];
  if (!user || user.deleted_at || user.is_active === false || !['tenant', 'landlord'].includes(user.user_type)) throw fail(403, 'This account is not eligible for office fingerprint verification.');
  return { ...record, phone: user.phone, phone_verified: user.phone_verified };
};
const status = async () => {
  try {
    await matcher.run('health');
    const schema = (await db.query("SELECT to_regclass('public.office_fingerprint_enrollments') AS enrollments,to_regclass('public.office_fingerprint_challenges') AS challenges")).rows[0];
    if (!schema?.enrollments || !schema?.challenges) throw new Error('Schema unavailable');
    return { available: true, engine: matcher.ENGINE };
  } catch { return { available: false, reason: 'Office fingerprint verification requires the SourceAFIS engine, Java, encryption key and fingerprint database migration.' }; }
};
const enrollmentStatus = async (actor, reference) => {
  const row = await customer(actor, reference);
  const enrollment = (await db.query('SELECT created_at,engine_version FROM office_fingerprint_enrollments WHERE user_id=$1', [row.user_id])).rows[0];
  return { enrolled: Boolean(enrollment), created_at: enrollment?.created_at, compatible: !enrollment || enrollment.engine_version === matcher.ENGINE };
};
const requestConsent = async (actor, reference, body) => {
  matcher.settings();
  const row = await customer(actor, reference);
  if (body.consent_confirmed !== true) throw fail(400, 'Explain fingerprint storage and obtain the customer’s consent first.');
  if (!row.phone_verified || !row.phone) throw fail(409, 'The customer must verify their phone before fingerprint enrollment.');
  // The account and staff row locks serialize sends, even across backend workers.
  const client = await db.connect();
  const id = crypto.randomUUID(), code = String(crypto.randomInt(100000, 1000000));
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [row.user_id]);
    const enrolled = (await client.query('SELECT user_id FROM office_fingerprint_enrollments WHERE user_id=$1', [row.user_id])).rows[0];
    if (enrolled) throw fail(409, 'This customer already has an enrolled fingerprint.');
    const count = (await client.query("SELECT COUNT(*)::int AS count FROM office_fingerprint_challenges WHERE user_id=$1 AND created_at>NOW()-INTERVAL '10 minutes'", [row.user_id])).rows[0]?.count || 0;
    if (count >= 3) throw fail(429, 'Please wait before requesting another enrollment code.');
    await client.query('UPDATE office_fingerprint_challenges SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [row.user_id]);
    await client.query("INSERT INTO office_fingerprint_challenges(id,user_id,staff_id,code_hash,phone_key,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '5 minutes')", [id, row.user_id, actor.id, otpHash(id, code), phoneKey(row.phone)]);
    await client.query("DELETE FROM office_fingerprint_challenges WHERE expires_at<NOW()-INTERVAL '1 day'");
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  try {
    // Do not expose the approval code through staff-visible SMS delivery records.
    const sent = await require('../config/utils/smsService').sendSMS(row.phone, `Your RentalHub fingerprint enrollment approval code is ${code}. Share it with the office agent only if you agree to fingerprint storage. Expires in 5 minutes.`, { purpose: 'otp_verification', trackDelivery: false });
    if (!sent.success) throw new Error();
  } catch {
    await db.query('UPDATE office_fingerprint_challenges SET consumed_at=NOW() WHERE id=$1', [id]);
    throw fail(503, 'Unable to send enrollment approval. Please try later.');
  }
  await audit(actor, 'FINGERPRINT_CONSENT_REQUESTED', row.user_id);
  return { challenge_id: id, message: 'Enrollment approval code sent to the customer’s verified phone.' };
};
const consumeConsent = async (actor, customerRow, body) => {
  if (!/^[0-9a-f-]{36}$/i.test(body.challenge_id || '') || !/^\d{6}$/.test(body.enrollment_code || '')) throw fail(400, 'Enter the customer’s enrollment approval code.');
  const client = await db.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM office_fingerprint_challenges WHERE id=$1 FOR UPDATE', [body.challenge_id])).rows[0];
    if (!row || String(row.user_id) !== String(customerRow.user_id) || row.phone_key !== phoneKey(customerRow.phone) || !customerRow.phone_verified || String(row.staff_id) !== String(actor.id) || row.consumed_at || new Date(row.expires_at) <= new Date() || row.attempts >= 5) throw fail(401, 'Invalid or expired enrollment approval.');
    const actual = Buffer.from(otpHash(row.id, body.enrollment_code)), expected = Buffer.from(row.code_hash);
    const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    await client.query('UPDATE office_fingerprint_challenges SET attempts=attempts+1,consumed_at=CASE WHEN $2 THEN NOW() ELSE consumed_at END WHERE id=$1', [row.id, valid]);
    await client.query('COMMIT'); committed = true;
    if (!valid) throw fail(401, 'Invalid or expired enrollment approval.');
  } catch (error) { if (!committed) await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};
const enroll = async (actor, reference, body) => {
  matcher.settings();
  const row = await customer(actor, reference);
  if (body.consent_confirmed !== true) throw fail(400, 'Customer consent is required.');
  matcher.validateImage(body.image); matcher.validateImage(body.confirmation);
  await consumeConsent(actor, row, body);
  const result = await matcher.run('enroll', { image: body.image, confirmation: body.confirmation });
  if (!result.matches) throw fail(422, 'The two scans did not match. Request a new approval code and scan the same finger twice.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const eligible = (await client.query("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE AND user_type IN ('tenant','landlord') AND phone_verified=TRUE AND rentalhub_phone_key(phone)=$2 FOR UPDATE", [row.user_id, phoneKey(row.phone)])).rows[0];
    if (!eligible) throw fail(409, 'The customer account changed. Start enrollment again.');
    const approval = (await client.query('SELECT id FROM office_fingerprint_challenges WHERE id=$1 AND user_id=$2 AND staff_id=$3 AND consumed_at IS NOT NULL AND expires_at>NOW()', [body.challenge_id, row.user_id, actor.id])).rows[0];
    if (!approval) throw fail(409, 'Enrollment approval expired or was withdrawn. Request a new approval.');
    await client.query('INSERT INTO office_fingerprint_enrollments(user_id,encrypted_template,engine_version,enrolled_by) VALUES($1,$2,$3,$4)', [row.user_id, matcher.seal(row.user_id, result.template), matcher.ENGINE, actor.id]);
    await client.query('DELETE FROM office_fingerprint_challenges WHERE id=$1', [body.challenge_id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw fail(409, 'A fingerprint is already enrolled. It has not been replaced.'); throw error; }
  finally { client.release(); }
  await audit(actor, 'FINGERPRINT_ENROLLED', row.user_id, { consent_version: 'office-fingerprint-v1', engine: matcher.ENGINE });
  return { enrolled: true, message: 'Fingerprint enrolled with customer approval.' };
};
const verify = async (actor, reference, body) => {
  const row = await customer(actor, reference);
  const stored = (await db.query('SELECT encrypted_template,engine_version FROM office_fingerprint_enrollments WHERE user_id=$1', [row.user_id])).rows[0];
  if (!stored) throw fail(409, 'This customer has no enrolled fingerprint.');
  if (stored.engine_version !== matcher.ENGINE) throw fail(409, 'Fingerprint re-enrollment is required for this engine version.');
  const result = await matcher.run('verify', { image: body.image, template: matcher.unseal(row.user_id, stored.encrypted_template) });
  await audit(actor, result.matches ? 'FINGERPRINT_MATCHED' : 'FINGERPRINT_NOT_MATCHED', row.user_id);
  return { matched: result.matches, message: result.matches ? 'Fingerprint matched this account. Continue through the normal authorized support process.' : 'Fingerprint did not match this account. Use the normal identity verification process.' };
};
const revoke = async (actor, reference) => {
  const row = await customer(actor, reference);
  if (!supervisors.has(actor.user_type)) throw fail(403, 'A support supervisor must remove an enrollment.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [row.user_id]);
    await client.query('DELETE FROM office_fingerprint_enrollments WHERE user_id=$1', [row.user_id]);
    await client.query('DELETE FROM office_fingerprint_challenges WHERE user_id=$1', [row.user_id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await audit(actor, 'FINGERPRINT_REMOVED', row.user_id);
  return { enrolled: false };
};
module.exports = { status, enrollmentStatus, requestConsent, enroll, verify, revoke };
