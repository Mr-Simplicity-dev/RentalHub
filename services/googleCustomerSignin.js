const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const db = require('../config/middleware/database');
const twoFactor = require('../config/utils/twoFactor');
const registration = require('./assistedRegistrationService');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = /^[a-f0-9]{64}$/;
const fail = (status, message, code) => Object.assign(new Error(message), { publicStatus: status, code });
const expired = () => fail(401, 'Sign-in expired. Start Google sign-in again.');
const audience = () => {
  const id = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
  if (!id) throw fail(503, 'Google sign-in is unavailable.');
  return id;
};
const endpoint = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (db.isMockActive?.()) throw fail(503,'Account database is unavailable. Please try again.');
    return await fn(req,res);
  }
  catch (e) {
    if (!e.publicStatus) req.logger?.error('Google sign-in failed', { kind: e.name });
    return res.status(e.publicStatus || 500).json({ success:false, code:e.publicStatus ? e.code : undefined, message:e.publicStatus ? e.message : 'Google sign-in could not be completed.' });
  }
};
const columns = `id,email,phone,full_name,user_type,email_verified,phone_verified,identity_verified,
 identity_verification_status,passport_photo_url,assisted_registration,subscription_active,subscription_expires_at,
 preferred_state_id,preferred_lga_name,approval_status,is_active,deleted_at,locked_until,token_version,
 is_recruitment_admin,google_subject,totp_enabled`;
function eligible(user) {
  if (!user) throw fail(404, 'Complete normal RentalHub registration first, then sign in with Google.', 'REGISTRATION_REQUIRED');
  if (!['tenant','landlord'].includes(user.user_type) || user.is_recruitment_admin || user.deleted_at || user.is_active !== true || (user.approval_status && user.approval_status !== 'approved')) throw fail(403, 'This account is not eligible for customer Google sign-in.');
  if (user.locked_until && new Date(user.locked_until) > new Date()) throw fail(423, 'Account temporarily locked. Please try again later.');
  if (!user.phone || !user.email_verified || (user.assisted_registration && !user.phone_verified)) throw fail(403, 'Complete your registration and account verification before using Google sign-in.');
  return user;
}
const readRequest = async id => {
  if (!uuid.test(id || '')) throw expired();
  const row = (await db.query('SELECT * FROM google_signin_requests WHERE id=$1 AND expires_at>NOW() AND user_id IS NULL',[id])).rows[0];
  if (!row) throw expired();
  return row;
};
async function verifyIdentity(credential, nonce) {
  const clientId = audience();
  let p;
  try { p = (await new OAuth2Client(clientId).verifyIdToken({ idToken:credential, audience:clientId })).getPayload(); }
  catch { throw fail(401,'Google could not verify this sign-in.'); }
  if (!p?.sub || !p.email || p.email_verified !== true || p.nonce !== nonce) throw fail(401,'A verified Google email and a fresh sign-in are required.');
  return p;
}
async function finishSession(req,res,user,native) {
  await registration.decorateUser(user);
  const {generateToken,attachAuthSession} = require('./authService').assistedRegistrationInternals;
  const token = generateToken(user.id,user.user_type,{tokenVersion:user.token_version || 1});
  delete user.google_subject;
  return res.json({success:true,data:attachAuthSession(res,{user,token},{exposeSessionToken:native})});
}
async function confirmMailbox(row,user,subject,code) {
  if (row.mailbox_verified && row.mailbox_user_id === user.id && row.mailbox_subject === subject) return;
  const prompt = () => fail(403,'Enter the one-time code sent to your RentalHub email.','GOOGLE_EMAIL_REQUIRED');
  const fingerprint = value => crypto.createHmac('sha256',process.env.JWT_SECRET).update(`${row.id}:${user.id}:${subject}:${value}`).digest('hex');
  if (!row.mailbox_hash) {
    const value = String(crypto.randomInt(100000,1000000));
    const result = await db.query('UPDATE google_signin_requests SET mailbox_user_id=$2,mailbox_subject=$3,mailbox_hash=$4 WHERE id=$1 AND mailbox_hash IS NULL AND expires_at>NOW() RETURNING id',[row.id,user.id,subject,fingerprint(value)]);
    if (result.rowCount) {
      const sent = await require('../config/utils/mailer').sendEmail({to:user.email,subject:'Confirm Google sign-in for RentalHub',html:`<p>Your one-time code is <strong>${value}</strong>. Enter it only if you started Google sign-in for your RentalHub account.</p>`});
      if (!sent?.success) throw fail(503,'Unable to send the confirmation code. Start sign-in again.');
    }
    throw prompt();
  }
  if (row.mailbox_user_id !== user.id || row.mailbox_subject !== subject || row.mailbox_attempts >= 5) throw expired();
  if (!/^\d{6}$/.test(code || '')) throw prompt();
  const result = await db.query('UPDATE google_signin_requests SET mailbox_attempts=mailbox_attempts+1,mailbox_verified=(mailbox_hash=$2) WHERE id=$1 AND mailbox_user_id=$3 AND mailbox_subject=$4 AND mailbox_attempts<5 AND expires_at>NOW() RETURNING mailbox_verified',[row.id,fingerprint(code),user.id,subject]);
  if (!result.rows[0]?.mailbox_verified) throw prompt();
}
exports.start = endpoint(async (req,res) => {
  const clientId = audience();
  const mode = req.body.mode;
  if (!['web','mobile'].includes(mode)) throw fail(400,'Invalid sign-in request.');
  const id = crypto.randomUUID(), verifier = secret(), nonce = secret();
  await db.query('DELETE FROM google_signin_requests WHERE expires_at <= NOW()');
  const inserted = await db.query("INSERT INTO google_signin_requests(id,mode,nonce,verifier_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')",[id,mode,nonce,digest(verifier)]);
  if (inserted.rowCount !== 1) throw fail(503,'Could not start a persistent sign-in session.');
  return res.json({success:true,data:{id,verifier,nonce,clientId}});
});
exports.browserConfig = endpoint(async (req,res) => {
  const row = await readRequest(req.params.id);
  if (row.mode !== 'mobile') throw expired();
  return res.json({success:true,data:{id:row.id,nonce:row.nonce,clientId:audience()}});
});
exports.authorize = endpoint(async (req,res) => {
  const {credential,request_id,verifier,factor} = req.body;
  const row = await readRequest(request_id);
  if (row.mode === 'web' && (!hex.test(verifier || '') || digest(verifier) !== row.verifier_hash)) throw expired();
  if (typeof credential !== 'string' || credential.length>12000) throw fail(400,'Google credential required.');
  const profile = await verifyIdentity(credential,row.nonce);
  const email = profile.email.toLowerCase();
  const result = await db.query(`SELECT ${columns} FROM users WHERE deleted_at IS NULL AND LOWER(email)=$1`,[email]);
  const user = eligible(result.rows.length === 1 ? result.rows[0] : null);
  if (user.google_subject && user.google_subject !== profile.sub) throw fail(403,'This account is linked to a different Google identity.');
  if (!user.google_subject && !email.endsWith('@gmail.com') && !profile.hd) await confirmMailbox(row,user,profile.sub,req.body.mailbox_code);
  if (user.totp_enabled) {
    if (!factor) throw fail(403,'Enter your authenticator or recovery code.','GOOGLE_MFA_REQUIRED');
    try {
      if (/^\d{6}$/.test(factor)) await twoFactor.verifyTotpCode({userId:user.id,code:factor});
      else await twoFactor.verifyRecoveryCode({userId:user.id,code:factor});
    } catch (e) { throw fail(e.statusCode === 429 ? 429 : 403,'Authenticator or recovery code was not accepted.','GOOGLE_MFA_REQUIRED'); }
  }
  const code = secret();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const bound = await client.query('UPDATE users SET google_subject=$1 WHERE id=$2 AND (google_subject IS NULL OR google_subject=$1) RETURNING id',[profile.sub,user.id]);
    if (!bound.rowCount) throw expired();
    const used = row.mode === 'mobile'
      ? await client.query("UPDATE google_signin_requests SET user_id=$2,token_version=$3,had_totp=$4,code_hash=$5,expires_at=NOW()+INTERVAL '90 seconds' WHERE id=$1 AND user_id IS NULL AND expires_at>NOW() RETURNING id",[row.id,user.id,user.token_version || 1,Boolean(user.totp_enabled),digest(code)])
      : await client.query('DELETE FROM google_signin_requests WHERE id=$1 AND user_id IS NULL AND expires_at>NOW() RETURNING id',[row.id]);
    if (!used.rowCount) throw expired();
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  if (row.mode === 'mobile') return res.json({success:true,data:{code}});
  return finishSession(req,res,user,false);
});
exports.exchange = endpoint(async (req,res) => {
  const {request_id,code,verifier} = req.body;
  if (!uuid.test(request_id || '') || !hex.test(code || '') || !hex.test(verifier || '')) throw expired();
  const row = (await db.query("DELETE FROM google_signin_requests WHERE id=$1 AND mode='mobile' AND code_hash=$2 AND verifier_hash=$3 AND expires_at>NOW() RETURNING user_id,token_version,had_totp",[request_id,digest(code),digest(verifier)])).rows[0];
  if (!row) throw expired();
  const user = eligible((await db.query(`SELECT ${columns} FROM users WHERE id=$1`,[row.user_id])).rows[0]);
  if (row.token_version !== (user.token_version || 1) || row.had_totp !== Boolean(user.totp_enabled)) throw expired();
  return finishSession(req,res,user,true);
});
