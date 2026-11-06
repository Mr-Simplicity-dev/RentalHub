const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const digestPayload = (payload, secret) => {
  const { turnstile_token, phone_challenge, phone_verification_token, otp, ...details } = payload;
  return crypto.createHmac('sha256', secret).update(JSON.stringify(canonical(details))).digest('hex');
};
const hashGrant = grant => crypto.createHash('sha256').update(String(grant || '')).digest('hex');
const fail = (message, code, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });

module.exports = ({ db, sendVerificationCode, secret }) => {
  const fingerprint = payload => digestPayload(payload, secret());
  const codeHash = (id, code) => crypto.createHmac('sha256', secret()).update(`${id}:${code}`).digest('hex');
  const send = async payload => {
    const id = crypto.randomUUID();
    const phone = String(payload.phone || '').trim();
    const phoneKey = codeHash('phone', phone.replace(/^0(?=\d{10}$)/, '234').replace(/^\+/, ''));
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`registration-phone:${phoneKey}`]);
      const recent = await client.query(`SELECT id FROM registration_phone_challenges WHERE phone_key = $1 AND created_at > NOW() - INTERVAL '60 seconds' LIMIT 1`, [phoneKey]);
      if (recent.rows.length) throw fail('Please wait one minute before requesting another code.', 'OTP_COOLDOWN', 429);
      await client.query('UPDATE registration_phone_challenges SET consumed_at = NOW() WHERE phone_key = $1 AND consumed_at IS NULL', [phoneKey]);
      await client.query(`INSERT INTO registration_phone_challenges (id, phone_key, payload_digest, code_hash, expires_at) VALUES ($1, $2, $3, '', NOW() + INTERVAL '10 minutes')`, [id, phoneKey, fingerprint(payload)]);
      const result = await sendVerificationCode(phone);
      if (!result.success) throw fail('Could not send the verification code. Please try again.', 'OTP_SEND_FAILED', 503);
      await client.query('UPDATE registration_phone_challenges SET code_hash = $1 WHERE id = $2', [codeHash(id, result.code), id]);
      await client.query('COMMIT');
      return { phone_challenge: id, phone_hint: `••••${phone.slice(-4)}`, otp_required: true, expires_in: 600 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  const verify = async payload => {
    const id = String(payload.phone_challenge || '');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) || !/^\d{6}$/.test(String(payload.otp || ''))) throw fail('Enter the six-digit verification code.', 'OTP_INVALID');
    const attempt = await db.query(`UPDATE registration_phone_challenges SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW() AND attempts < 5 RETURNING code_hash, payload_digest`, [id]);
    const row = attempt.rows[0];
    if (!row) throw fail('The code has expired or reached its attempt limit. Request a new code.', 'OTP_EXPIRED');
    if (row.payload_digest !== fingerprint(payload)) throw fail('Registration details changed. Request a new code.', 'OTP_DETAILS_CHANGED');
    const expected = Buffer.from(row.code_hash);
    const supplied = Buffer.from(codeHash(id, payload.otp));
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) throw fail('Invalid verification code.', 'OTP_INVALID');
    const consumed = await db.query(`UPDATE registration_phone_challenges SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id`, [id]);
    if (!consumed.rows.length) throw fail('This code has already been used. Request a new code.', 'OTP_EXPIRED');
    return jwt.sign({ purpose: 'registration-phone', challenge: id, fingerprint: fingerprint(payload) }, secret(), { algorithm: 'HS256', expiresIn: '24h', audience: 'rentalhub-registration' });
  };
  const resume = async (payload, token) => {
    let claims;
    try { claims = jwt.verify(token, secret(), { algorithms: ['HS256'], audience: 'rentalhub-registration' }); }
    catch { throw fail('Phone verification has expired. Request a new code.', 'OTP_EXPIRED'); }
    if (claims.purpose !== 'registration-phone' || claims.challenge !== payload.phone_challenge || claims.fingerprint !== fingerprint(payload)) throw fail('Registration details changed. Request a new code.', 'OTP_DETAILS_CHANGED');
    const result = await db.query(`SELECT id FROM registration_phone_challenges WHERE id = $1 AND consumed_at IS NOT NULL AND payload_digest = $2 AND created_at > NOW() - INTERVAL '24 hours'`, [claims.challenge, claims.fingerprint]);
    if (!result.rows.length) throw fail('Phone verification has expired. Request a new code.', 'OTP_EXPIRED');
    return token;
  };
  return { send, verify, resume, fingerprint };
};
module.exports.hashGrant = hashGrant;
module.exports.digestPayload = digestPayload;
