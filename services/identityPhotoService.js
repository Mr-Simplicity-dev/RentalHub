const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const db = require('../config/middleware/database');
const {
  encryptNIN,
  decryptNIN
} = require('../config/utils/ninEncryption');
const CONSENT_VERSION = 'local-face-2026-11';
const localFaces=require('./localFaceService');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const normalName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).sort().join(' ');
const photoRoot = path.resolve(__dirname, '../uploads/passports');
const privatePhoto = async url => {
  const filename = String(url || '').match(/^\/uploads\/passports\/(passport_\d+_[A-Za-z0-9_.-]+)$/)?.[1];
  if (!filename) return null;
  try {
    return await fs.promises.readFile(path.join(photoRoot, filename));
  } catch {
    return null;
  }
};
const canonicalPhoto = async buffer => sharp(buffer, {
  limitInputPixels: 16000000
}).rotate().resize({
  width: 1000,
  height: 1000,
  fit: 'inside',
  withoutEnlargement: true
}).jpeg({
  quality: 85
}).toBuffer();
const comparePhotos=async(one,two)=>{
 try{
 const health=await localFaces.health();if(!health.ready)return {status:'review_required'};
 const images=await Promise.all([canonicalPhoto(one),canonicalPhoto(two)]),hashes=images.map(digest).sort();
 if(hashes[0]===hashes[1])return {status:'match',confidence:1,engine:health.engine};
 const key=digest(health.engine+':'+hashes.join(':'));
 const cached=(await db.query("SELECT status,confidence FROM identity_face_comparisons WHERE pair_key=$1 AND status IN ('match','different')",[key])).rows[0];if(cached)return cached;
 const result=await localFaces.compare(...images);
 if(['match','different'].includes(result.status))await db.query("INSERT INTO identity_face_comparisons(pair_key,status,confidence) VALUES($1,$2,$3) ON CONFLICT(pair_key) DO UPDATE SET status=EXCLUDED.status,confidence=EXCLUDED.confidence,updated_at=NOW()",[key,result.status,result.confidence]);
 return result;
 }catch{return {status:'review_required'};}
};
const referencePhoto = async user => {
  const numbers = [user.nin ? decryptNIN(user.nin) : null, user.international_passport_number].filter(Boolean);
  if (!numbers.length) return null;
  const result = await db.query(`SELECT id,provider_reference,reference_photo_encrypted FROM prembly_verification_attempts WHERE status='verified' AND subject_hash=ANY($1::text[]) ORDER BY (reference_photo_encrypted IS NOT NULL) DESC,updated_at DESC LIMIT 1`, [numbers.map(n => digest(String(n).trim().toUpperCase()))]);
  const attempt = result.rows[0];
  if (attempt && !attempt.reference_photo_encrypted && attempt.provider_reference) {
    try {
      const checked = await Promise.race([require('../config/utils/premblyValidator').getVerificationStatusWithPrembly(attempt.provider_reference), new Promise(resolve => {
        const timer = setTimeout(() => resolve({
          verified: false
        }), 8000);
        timer.unref?.();
      })]);
      if (checked.verified && checked.reference_photo) {
        const encrypted = encryptNIN(checked.reference_photo);
        if (encrypted) {
          await db.query('UPDATE prembly_verification_attempts SET reference_photo_encrypted=$2 WHERE id=$1', [attempt.id, encrypted]);
          attempt.reference_photo_encrypted = encrypted;
        }
      }
    } catch {}
  }
  const image = result.rows[0]?.reference_photo_encrypted ? decryptNIN(result.rows[0].reference_photo_encrypted) : null;
  if (!image || !/^data:image\/(jpeg|png);base64,/.test(image)) return null;
  try {
    return await canonicalPhoto(Buffer.from(image.split(',')[1], 'base64'));
  } catch {
    return null;
  }
};
const recordFlag = async (userId, reason, relatedId = null, pairKey = null) => {
  const flag = await db.query("INSERT INTO identity_review_flags(user_id,reason,related_user_id,photo_pair_key) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM identity_review_flags WHERE user_id=$1 AND reason=$2 AND related_user_id IS NOT DISTINCT FROM $3 AND photo_pair_key IS NOT DISTINCT FROM $4 AND status='pending') RETURNING id", [userId, reason, relatedId, pairKey]);
  if (flag.rows.length) {
    await db.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(NULL,'IDENTITY_REVIEW_REQUIRED','user',$1,$2)", [userId, JSON.stringify({
      reason,
      flag_id: flag.rows[0].id
    })]);
    const admins = await db.query("SELECT id FROM users WHERE user_type='super_admin' AND deleted_at IS NULL AND is_active IS NOT FALSE");
    const {
      createNotification
    } = require('../config/utils/notificationService');
    for (const admin of admins.rows) await createNotification(admin.id, 'verification', 'Identity review required', 'An identity check needs review. Open the verification queue.', '/admin/verifications');
  }
};
const saveLocalTemplate=async(userId,hash,analysis)=>{
 if(!localFaces.validEmbedding(analysis.embedding))throw Error('INVALID_FACE_TEMPLATE');
 const encrypted=encryptNIN(JSON.stringify(analysis.embedding));if(!encrypted)throw Error('SECURE_STORAGE_UNAVAILABLE');
 await db.query("INSERT INTO local_face_templates(user_id,image_hash,engine,template_encrypted,consent_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET image_hash=EXCLUDED.image_hash,engine=EXCLUDED.engine,template_encrypted=EXCLUDED.template_encrypted,consent_version=EXCLUDED.consent_version,consent_at=NOW()",[userId,hash,analysis.engine,encrypted,CONSENT_VERSION]);
};
const screenPhotoUnlocked=async({userId,buffer,consent,assisted=false})=>{
 const image=await canonicalPhoto(buffer),hash=digest(image);
 const user=(await db.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL',[userId])).rows[0];if(!user)throw Error('USER_NOT_FOUND');
 if(!consent){await db.query('UPDATE identity_photo_checks SET consent_revoked_at=NOW() WHERE user_id=$1 AND consent_version=$2 AND consent_revoked_at IS NULL',[userId,CONSENT_VERSION]);await db.query('DELETE FROM local_face_templates WHERE user_id=$1',[userId]);}
 let revision='local-consent-declined';if(consent){try{revision=(await localFaces.health()).engine || 'local-unavailable';}catch{revision='local-unavailable';}}
 const claim=await db.query("INSERT INTO identity_photo_checks(user_id,image_hash,consent_version,consent_at,engine_revision) VALUES($1,$2,$3,CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE NULL END,$4) ON CONFLICT DO NOTHING RETURNING id",[userId,hash,consent?CONSENT_VERSION:null,revision]);
 if(!claim.rows.length){const cached=(await db.query('SELECT status,reasons,consent_revoked_at FROM identity_photo_checks WHERE user_id=$1 AND image_hash=$2 AND engine_revision=$3',[userId,hash,revision])).rows[0];return {hash,status:cached?.status==='verified'&&!cached.consent_revoked_at?'verified':'review_required',reasons:cached?.reasons||['local_check_pending']};}
 const reasons=[];
 const duplicates=await db.query("SELECT id,passport_photo_hash,nin_hash FROM users WHERE id<>$1 AND deleted_at IS NULL AND (passport_photo_hash=$2 OR (nin_hash IS NOT NULL AND nin_hash=$3) OR (international_passport_number IS NOT NULL AND international_passport_number=$4))",[userId,hash,user.nin_hash,user.international_passport_number]);
 for(const row of duplicates.rows){const reason=row.passport_photo_hash===hash?'duplicate_photo':'duplicate_identity';reasons.push(reason);await recordFlag(userId,reason,row.id);}
 const legacy=await db.query('SELECT id,passport_photo_url FROM users WHERE id<>$1 AND deleted_at IS NULL AND passport_photo_url IS NOT NULL AND passport_photo_hash IS NULL',[userId]);
 for(const row of legacy.rows){const old=await privatePhoto(row.passport_photo_url);if(!old)continue;try{const oldHash=digest(await canonicalPhoto(old));await db.query('UPDATE users SET passport_photo_hash=$2 WHERE id=$1 AND passport_photo_hash IS NULL',[row.id,oldHash]);if(oldHash===hash){reasons.push('duplicate_photo');await recordFlag(userId,'duplicate_photo',row.id);}}catch{}}
 const names=await db.query('SELECT id,full_name FROM users WHERE id<>$1 AND deleted_at IS NULL',[userId]);for(const row of names.rows)if(normalName(row.full_name)===normalName(user.full_name)){reasons.push('matching_name');await recordFlag(userId,'matching_name',row.id);}
 let analysis;
 if(!consent){reasons.push('local_biometric_consent_not_given');}
 else if(!reasons.some(reason=>['duplicate_identity','duplicate_photo'].includes(reason))){
  try{
   analysis=await localFaces.analyze(image);
   if(analysis.status!=='analyzed'||!localFaces.validEmbedding(analysis.embedding))reasons.push(analysis.reason || 'local_face_unavailable');
   else{
    if(analysis.liveness_status!=='live')reasons.push(analysis.automation_validated?'local_liveness_review':'local_spoof_validation_required');
    const reference=await referencePhoto(user);if(!reference)reasons.push('identity_reference_unavailable');else if((await comparePhotos(reference,image)).status!=='match')reasons.push('identity_face_review');
    const templates=await db.query("SELECT t.* FROM local_face_templates t JOIN users u ON u.id=t.user_id WHERE t.user_id<>$1 AND t.engine=$2 AND u.deleted_at IS NULL AND u.identity_verified=TRUE AND u.passport_photo_hash=t.image_hash",[userId,analysis.engine]);
    for(const template of templates.rows){try{const vector=JSON.parse(decryptNIN(template.template_encrypted));const score=localFaces.similarity(analysis.embedding,vector);if(score>=0.36){const reason=score>=0.55?'duplicate_face':'possible_duplicate_face';reasons.push(reason);await recordFlag(userId,reason,template.user_id);}}catch{reasons.push('local_template_review');}}
   }
  }catch{reasons.push('local_face_unavailable');}
 }
 if(assisted)reasons.push('assisted_review');
 if(!reasons.length){try{await saveLocalTemplate(userId,hash,analysis);}catch{reasons.push('local_storage_unavailable');}}
 const status=reasons.length?'review_required':'verified';for(const reason of new Set(reasons))await recordFlag(userId,reason);
 await db.query('UPDATE identity_photo_checks SET status=$3,reasons=$4,updated_at=NOW() WHERE user_id=$1 AND image_hash=$2 AND engine_revision=$5',[userId,hash,status,JSON.stringify([...new Set(reasons)]),revision]);return {hash,status,reasons};
};
const approveCurrentPhotoTemplate=async userId=>{
 const user=(await db.query('SELECT * FROM users WHERE id=$1 AND identity_verified=TRUE AND deleted_at IS NULL',[userId])).rows[0];if(!user)return;
 const consent=await db.query('SELECT id FROM identity_photo_checks WHERE user_id=$1 AND image_hash=$2 AND consent_version=$3 AND consent_revoked_at IS NULL LIMIT 1',[userId,user.passport_photo_hash,CONSENT_VERSION]);if(!consent.rows.length)return;
 try{const image=await privatePhoto(user.passport_photo_url);if(!image)throw Error('PHOTO_UNAVAILABLE');const analysis=await localFaces.analyze(image);if(analysis.status!=='analyzed')throw Error('NO_FACE');await saveLocalTemplate(userId,user.passport_photo_hash,analysis);}catch{await recordFlag(userId,'local_template_review');}
};
const screenPhoto = async options => {
  const lock = await db.connect();
  let acquired = false;
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock(hashtext('local-identity-photo-gallery')) AS acquired");
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) {
      const error = new Error('Identity verification is busy. Please try your upload again shortly.');
      error.statusCode = 429;
      throw error;
    }
    return await screenPhotoUnlocked(options);
  } finally {
    try {
      if (acquired) await lock.query("SELECT pg_advisory_unlock(hashtext('identity-photo-gallery'))");
    } finally {
      lock.release();
    }
  }
};
const identityConflict = (one, two) => {
  if (!one || !two) return false;
  return Boolean(Number(one.id) === Number(two.id) || one.nin_hash && one.nin_hash === two.nin_hash || one.international_passport_number && one.international_passport_number === two.international_passport_number || one.phone_key && one.phone_key === two.phone_key || one.email && two.email && String(one.email).toLowerCase() === String(two.email).toLowerCase() || one.passport_photo_hash && one.passport_photo_hash === two.passport_photo_hash);
};
const legalConflict = async (lawyerId, partyIds) => {
  const ids = [...new Set([lawyerId, ...partyIds].filter(Boolean).map(Number))];
  const rows = (await db.query('SELECT *,rentalhub_phone_key(phone) AS phone_key FROM users WHERE id=ANY($1::int[])', [ids])).rows;
  const lawyer = rows.find(row => Number(row.id) === Number(lawyerId));
  if (!lawyer) return true;
  for (const id of [...new Set(partyIds.filter(Boolean).map(Number))]) {
    const party = rows.find(row => Number(row.id) === id);
    if (!party) return true;
    if (identityConflict(lawyer, party)) {
      await recordFlag(lawyerId, 'legal_identity_conflict', party.id);
      return true;
    }
    const images = await Promise.all([privatePhoto(lawyer.passport_photo_url), privatePhoto(party.passport_photo_url)]);
    if (images.some(image => !image)) {
      await recordFlag(lawyerId, 'legal_missing_photo', party.id);
      return true;
    }
    const canonical = await Promise.all(images.map(canonicalPhoto)),
      hashes = canonical.map(digest),
      pairKey = digest([...hashes].sort().join(':'));
    const manual = await db.query("SELECT id FROM identity_review_flags WHERE user_id=$1 AND related_user_id=$2 AND photo_pair_key=$3 AND reason='legal_conflict_review' AND status='reviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL LIMIT 1", [lawyerId, party.id, pairKey]);
    if (manual.rows.length) continue;
    const consents = await db.query('SELECT user_id,image_hash FROM identity_photo_checks WHERE user_id=ANY($1::int[]) AND image_hash=ANY($2::text[]) AND consent_version=$3 AND consent_revoked_at IS NULL AND consent_at IS NOT NULL', [[Number(lawyerId), id], hashes, CONSENT_VERSION]);
    const consented = [lawyer, party].every((subject, index) => consents.rows.some(row => Number(row.user_id) === Number(subject.id) && row.image_hash === hashes[index]));
    if (!consented) {
      await recordFlag(lawyerId, 'legal_conflict_review', party.id, pairKey);
      return true;
    }
    const compared = await comparePhotos(...images);
    if (compared.status !== 'different') {
      await recordFlag(lawyerId, compared.status === 'match' ? 'legal_face_conflict' : 'legal_conflict_review', party.id, pairKey);
      return true;
    }
  }
  return false;
};
const guardManualVerification = async (userId, actorId) => {
  if (Number(userId) === Number(actorId)) {
    const error = new Error('You cannot approve your own identity.');
    error.statusCode = 403;
    throw error;
  }
  const duplicate = await db.query("SELECT other.id FROM users subject JOIN users other ON other.id<>subject.id AND other.deleted_at IS NULL AND ((subject.nin_hash IS NOT NULL AND other.nin_hash=subject.nin_hash) OR (subject.international_passport_number IS NOT NULL AND other.international_passport_number=subject.international_passport_number) OR rentalhub_phone_key(subject.phone)=rentalhub_phone_key(other.phone)) WHERE subject.id=$1 LIMIT 1", [userId]);
  if (duplicate.rows.length) {
    const error = new Error('Duplicate identity must be resolved before approval.');
    error.statusCode = 409;
    throw error;
  }
  const rows = await db.query(`SELECT reason FROM identity_review_flags WHERE user_id=$1 AND status='pending' AND reason IN ('duplicate_identity','duplicate_photo','duplicate_face','identity_face_different','legal_identity_conflict','legal_face_conflict')`, [userId]);
  if (rows.rows.length) {
    const err = new Error('Identity conflict requires investigation before approval.');
    err.statusCode = 409;
    throw err;
  }
};
const eraseGallery = async userId => {
  await db.query('DELETE FROM local_face_templates WHERE user_id=$1',[userId]);
  const row = (await db.query('SELECT face_gallery_enrolled,face_gallery_enrollment_pending FROM users WHERE id=$1', [userId])).rows[0];
  if (!row?.face_gallery_enrolled && !row?.face_gallery_enrollment_pending) return;
  const key = process.env.PREMBLY_SECRET_KEY || process.env.PREMBLY_API_KEY;
  const base = String(process.env.PREMBLY_BASE_URL || 'https://api.prembly.com').replace(/\/+$/, '');
  let response;
  try {
    response = await axios.delete(base + '/api/v1/verification/biometrics/face/enrollments/user-' + Number(userId) + '/?gallery_id=rentalhub-identities', {
      timeout: 45000,
      headers: {
        'x-api-key': key
      }
    });
  } catch (error) {
    if (error.response?.status !== 404) throw error;
    response = {
      data: {
        status: true
      }
    };
  }
  if (response.data?.status === false) throw new Error('Biometric erasure is not confirmed. Please retry later.');
  await db.query('UPDATE users SET face_gallery_enrolled=FALSE,face_gallery_enrollment_pending=FALSE WHERE id=$1', [userId]);
};
module.exports = {
  CONSENT_VERSION,
  approveCurrentPhotoTemplate,
  normalName,
  digest,
  privatePhoto,
  canonicalPhoto,

  comparePhotos,
  screenPhoto,
  identityConflict,
  legalConflict,
  recordFlag,
  guardManualVerification,
  eraseGallery
};
