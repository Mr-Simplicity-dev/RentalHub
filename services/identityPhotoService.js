const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const db = require('../config/middleware/database');
const { encryptNIN, decryptNIN } = require('../config/utils/ninEncryption');
const CONSENT_VERSION = 'face-gallery-2026-11';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const normalName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).sort().join(' ');
const photoRoot = path.resolve(__dirname, '../uploads/passports');
const privatePhoto = async url => {
  const filename = String(url || '').match(/^\/uploads\/passports\/(passport_\d+_[A-Za-z0-9_.-]+)$/)?.[1];
  if (!filename) return null;
  try { return await fs.promises.readFile(path.join(photoRoot, filename)); } catch { return null; }
};
const canonicalPhoto = async buffer => sharp(buffer, {limitInputPixels:16000000}).rotate().resize({width:1000,height:1000,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
const provider = async (endpoint, body) => {
  const key = process.env.PREMBLY_SECRET_KEY || process.env.PREMBLY_API_KEY;
  if (!key) throw new Error('BIOMETRICS_UNAVAILABLE');
  const base = String(process.env.PREMBLY_BASE_URL || 'https://api.prembly.com').replace(/\/+$/,'');
  const response = await axios.post(base + endpoint, body, {timeout:8000,maxContentLength:4000000,headers:{'x-api-key':key,'app-id':process.env.PREMBLY_PUBLIC_KEY || process.env.PREMBLY_APP_ID,'Content-Type':'application/json'}});
  if (response.data?.status === false || /FAILED|NOT.?VERIFIED/.test(String(response.data?.verification?.status || ''))) throw new Error('BIOMETRICS_UNAVAILABLE');
  return response.data;
};
const dataUri = image => 'data:image/jpeg;base64,' + image.toString('base64');
const faceVerdict = body => {
  const raw = body?.confidence ?? body?.data?.confidence;
  const score = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
  // This endpoint documents a 0-100 score. Ambiguous low fractional scores need review.
  const negative=body?.is_match === false || body?.data?.is_match === false || /^(?:no match|face mismatch|not a match)[.!]?$/i.test(String(body?.message || '').trim());
  if(negative)return {status:score !== null && score >= 70 ? 'review_required' : 'different',confidence:score};
  if (score !== null && score >= 90) return {status:'match',confidence:score};
  return {status:'review_required',confidence:score};
};
const comparePhotos = async (one, two) => {
  const images = await Promise.all([canonicalPhoto(one),canonicalPhoto(two)]);
  const hashes = images.map(digest).sort();
  if (hashes[0] === hashes[1]) return {status:'match',confidence:100};
  const pairKey = digest(hashes.join(':'));
  const claim = await db.query(`INSERT INTO identity_face_comparisons(pair_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING pair_key`,[pairKey]);
  if (!claim.rows.length) { const cached = await db.query('SELECT status,confidence FROM identity_face_comparisons WHERE pair_key=$1',[pairKey]); return cached.rows[0] || {status:'review_required'}; }
  let result;
  try { result = faceVerdict(await provider('/verification/biometrics/face/comparison',{image_one:dataUri(images[0]),image_two:dataUri(images[1])})); }
  catch { result = {status:'review_required',confidence:null}; }
  await db.query('UPDATE identity_face_comparisons SET status=$2,confidence=$3,updated_at=NOW() WHERE pair_key=$1',[pairKey,result.status,result.confidence]);
  return result;
};
const referencePhoto = async user => {
  const numbers = [user.nin ? decryptNIN(user.nin) : null, user.international_passport_number].filter(Boolean);
  if (!numbers.length) return null;
  const result = await db.query(`SELECT id,provider_reference,reference_photo_encrypted FROM prembly_verification_attempts WHERE status='verified' AND subject_hash=ANY($1::text[]) ORDER BY (reference_photo_encrypted IS NOT NULL) DESC,updated_at DESC LIMIT 1`,[numbers.map(n=>digest(String(n).trim().toUpperCase()))]);
  const attempt=result.rows[0];
  if(attempt && !attempt.reference_photo_encrypted && attempt.provider_reference){
    try{const checked=await Promise.race([require('../config/utils/premblyValidator').getVerificationStatusWithPrembly(attempt.provider_reference),new Promise(resolve=>{const timer=setTimeout(()=>resolve({verified:false}),8000);timer.unref?.();})]);if(checked.verified && checked.reference_photo){const encrypted=encryptNIN(checked.reference_photo);if(encrypted){await db.query('UPDATE prembly_verification_attempts SET reference_photo_encrypted=$2 WHERE id=$1',[attempt.id,encrypted]);attempt.reference_photo_encrypted=encrypted;}}}catch{}
  }
  const image = result.rows[0]?.reference_photo_encrypted ? decryptNIN(result.rows[0].reference_photo_encrypted) : null;
  if (!image || !/^data:image\/(jpeg|png);base64,/.test(image)) return null;
  try { return await canonicalPhoto(Buffer.from(image.split(',')[1],'base64')); } catch { return null; }
};
const recordFlag = async (userId, reason, relatedId = null) => {
  const flag = await db.query(`INSERT INTO identity_review_flags(user_id,reason,related_user_id) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM identity_review_flags WHERE user_id=$1 AND reason=$2 AND related_user_id IS NOT DISTINCT FROM $3 AND status='pending') RETURNING id`,[userId,reason,relatedId]);
  if (flag.rows.length) {
    await db.query(`INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(NULL,'IDENTITY_REVIEW_REQUIRED','user',$1,$2)`,[userId,JSON.stringify({reason,flag_id:flag.rows[0].id})]);
    const admins = await db.query(`SELECT id FROM users WHERE user_type='super_admin' AND deleted_at IS NULL AND is_active IS NOT FALSE`);
    const { createNotification } = require('../config/utils/notificationService');
    for (const admin of admins.rows) await createNotification(admin.id,'verification','Identity review required','An identity check needs review. Open the verification queue.','/admin/verifications');
  }
};
const screenPhotoUnlocked = async ({userId, buffer, consent, assisted=false}) => {
  const image = await canonicalPhoto(buffer), hash = digest(image);
  const user = (await db.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL',[userId])).rows[0];
  if (!user) throw new Error('USER_NOT_FOUND');
  const claim = await db.query(`INSERT INTO identity_photo_checks(user_id,image_hash,consent_version,consent_at) VALUES($1,$2,$3,CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE NULL END) ON CONFLICT DO NOTHING RETURNING id`,[userId,hash,consent ? CONSENT_VERSION : null]);
  if (!claim.rows.length) { const cached=(await db.query('SELECT status,reasons FROM identity_photo_checks WHERE user_id=$1 AND image_hash=$2',[userId,hash])).rows[0]; return {hash,status:cached?.status === 'verified' ? 'verified' : cached?.status === 'rejected' ? 'rejected' : 'review_required',reasons:cached?.reasons || ['check_pending']}; }
  const reasons=[]; let rejected=false;
  const duplicates=await db.query(`SELECT id,passport_photo_hash,passport_photo_url,full_name,nin_hash,international_passport_number FROM users WHERE id<>$1 AND deleted_at IS NULL AND (passport_photo_hash=$2 OR (nin_hash IS NOT NULL AND nin_hash=$3) OR (international_passport_number IS NOT NULL AND international_passport_number=$4))`,[userId,hash,user.nin_hash,user.international_passport_number]);
  for(const duplicate of duplicates.rows){ const reason=duplicate.passport_photo_hash===hash?'duplicate_photo':'duplicate_identity';reasons.push(reason);await recordFlag(userId,reason,duplicate.id); }
  // Hash older local photos as well; do not enrol historical faces without consent.
  const legacy=await db.query(`SELECT id,passport_photo_url,full_name FROM users WHERE id<>$1 AND deleted_at IS NULL AND passport_photo_url IS NOT NULL AND passport_photo_hash IS NULL`,[userId]);
  for(const row of legacy.rows){const old=await privatePhoto(row.passport_photo_url);if(!old)continue;let oldHash;try{oldHash=digest(await canonicalPhoto(old));}catch{continue;}await db.query('UPDATE users SET passport_photo_hash=$2 WHERE id=$1 AND passport_photo_hash IS NULL',[row.id,oldHash]);if(oldHash===hash){reasons.push('duplicate_photo');await recordFlag(userId,'duplicate_photo',row.id);}}
  const names=await db.query('SELECT id,full_name FROM users WHERE id<>$1 AND deleted_at IS NULL',[userId]);
  for(const row of names.rows)if(normalName(row.full_name)===normalName(user.full_name)){reasons.push('matching_name');await recordFlag(userId,'matching_name',row.id);}
  if(!consent || reasons.some(reason=>['duplicate_identity','duplicate_photo'].includes(reason))){
    if(!consent)reasons.push('biometric_consent_not_given');
    for(const reason of new Set(reasons))await recordFlag(userId,reason);
    await db.query("UPDATE identity_photo_checks SET status='review_required',reasons=$3,updated_at=NOW() WHERE user_id=$1 AND image_hash=$2",[userId,hash,JSON.stringify([...new Set(reasons)])]);
    return {hash,status:'review_required',reasons};
  }
  try {
    const live = await provider('/verification/biometrics/face/liveliness_check',{image:dataUri(image)});
    const pct=live?.data?.confidence_in_percentage;
    if(typeof pct !== 'number' || pct<90){reasons.push('liveness_review');if(typeof pct==='number'&&pct<70)rejected=true;}
  } catch {reasons.push('liveness_unavailable');}
  const reference=await referencePhoto(user);
  if(reference){const verdict=await comparePhotos(reference,image);if(verdict.status!=='match'){reasons.push('identity_face_'+verdict.status);if(verdict.status==='different')rejected=true;}}
  else reasons.push('identity_reference_unavailable');
  if(consent){
    try{
      const result=await provider('/api/v1/verification/biometrics/face/identify/',{image:dataUri(image),gallery_id:'rentalhub-identities',top_k:5,confirm:true,confidence_threshold:90});
      const data=result.data || result;
      if(typeof data.matched!=='boolean' || (!data.matched && !Array.isArray(data.candidates)))throw new Error('Invalid gallery result');
      const best=data.best_match;
      if(data.matched){
        const other=String(best?.subject_id || '').match(/^user-(\d+)$/)?.[1];
        if(!other || best?.is_match!==true || Number(best?.confidence)<90)reasons.push('gallery_review');
        else if(Number(other)!==Number(userId)){reasons.push('duplicate_face');await recordFlag(userId,'duplicate_face',Number(other));}
      }
      if(!reasons.length && !assisted){
        const enrolled=await provider('/api/v1/verification/biometrics/face/enroll/',{subject_id:'user-'+userId,gallery_id:'rentalhub-identities',image:dataUri(image),consent:true,consent_reference:CONSENT_VERSION+'-check-'+claim.rows[0].id,check_liveness:true,overwrite:user.face_gallery_enrolled===true});
        if(String((enrolled.data || enrolled).subject_id || '') !== 'user-'+userId)throw new Error('Enrolment not confirmed');
        await db.query('UPDATE users SET face_gallery_enrolled=TRUE WHERE id=$1',[userId]);
      }
    }catch{reasons.push('gallery_unavailable');}
  }else reasons.push('biometric_consent_not_given');
  if(assisted)reasons.push('assisted_review');
  const status=rejected?'rejected':reasons.length?'review_required':'verified';
  for(const reason of new Set(reasons))await recordFlag(userId,reason);
  await db.query('UPDATE identity_photo_checks SET status=$3,reasons=$4,updated_at=NOW() WHERE user_id=$1 AND image_hash=$2',[userId,hash,status,JSON.stringify([...new Set(reasons)])]);
  return {hash,status,reasons};
};
const screenPhoto = async options => {
 const lock=await db.connect();
 let acquired=false;
 try {const result=await lock.query("SELECT pg_try_advisory_lock(hashtext('identity-photo-gallery')) AS acquired");acquired=result.rows[0]?.acquired===true;if(!acquired){const error=new Error('Identity verification is busy. Please try your upload again shortly.');error.statusCode=429;throw error;}return await screenPhotoUnlocked(options);}
 finally {try{if(acquired)await lock.query("SELECT pg_advisory_unlock(hashtext('identity-photo-gallery'))");}finally{lock.release();}}
};
const identityConflict = (one,two) => {
 if(!one||!two)return false;
 return Boolean(Number(one.id)===Number(two.id) || (one.nin_hash && one.nin_hash===two.nin_hash) || (one.international_passport_number && one.international_passport_number===two.international_passport_number) || (one.phone_key && one.phone_key===two.phone_key) || (one.email && two.email && String(one.email).toLowerCase()===String(two.email).toLowerCase()) || (one.passport_photo_hash && one.passport_photo_hash===two.passport_photo_hash));
};
const legalConflict = async (lawyerId,partyIds) => {
  const ids=[...new Set([lawyerId,...partyIds].filter(Boolean).map(Number))];
  const rows=(await db.query('SELECT *,rentalhub_phone_key(phone) AS phone_key FROM users WHERE id=ANY($1::int[])',[ids])).rows;
  const lawyer=rows.find(r=>Number(r.id)===Number(lawyerId));
  if(!lawyer)return true;
  for(const id of partyIds.filter(Boolean)){
    const party=rows.find(r=>Number(r.id)===Number(id));
    if(!party)return true;
    if(identityConflict(lawyer,party)){await recordFlag(lawyerId,'legal_identity_conflict',party.id);return true;}
    const images=await Promise.all([privatePhoto(lawyer.passport_photo_url),privatePhoto(party.passport_photo_url)]);
    if(images.some(i=>!i))return true;
    const compared=await comparePhotos(...images);
    if(compared.status!=='different'){await recordFlag(lawyerId,compared.status==='match'?'legal_face_conflict':'legal_conflict_review',party.id);return true;}
  }
  return false;
};
const guardManualVerification = async (userId,actorId) => {
 if(Number(userId)===Number(actorId)){const error=new Error('You cannot approve your own identity.');error.statusCode=403;throw error;}
 const duplicate=await db.query("SELECT other.id FROM users subject JOIN users other ON other.id<>subject.id AND other.deleted_at IS NULL AND ((subject.nin_hash IS NOT NULL AND other.nin_hash=subject.nin_hash) OR (subject.international_passport_number IS NOT NULL AND other.international_passport_number=subject.international_passport_number) OR rentalhub_phone_key(subject.phone)=rentalhub_phone_key(other.phone)) WHERE subject.id=$1 LIMIT 1",[userId]);
 if(duplicate.rows.length){const error=new Error('Duplicate identity must be resolved before approval.');error.statusCode=409;throw error;}
 const rows=await db.query(`SELECT reason FROM identity_review_flags WHERE user_id=$1 AND status='pending' AND reason IN ('duplicate_identity','duplicate_photo','duplicate_face','identity_face_different','legal_identity_conflict','legal_face_conflict')`,[userId]);
 if(rows.rows.length){const err=new Error('Identity conflict requires investigation before approval.');err.statusCode=409;throw err;}
};
const eraseGallery = async userId => {
 const row=(await db.query('SELECT face_gallery_enrolled FROM users WHERE id=$1',[userId])).rows[0];
 if(!row?.face_gallery_enrolled)return;
 const key=process.env.PREMBLY_SECRET_KEY || process.env.PREMBLY_API_KEY;
 const base=String(process.env.PREMBLY_BASE_URL || 'https://api.prembly.com').replace(/\/+$/,'');
 await axios.delete(base+'/api/v1/verification/biometrics/face/enrollments/user-'+Number(userId)+'/?gallery_id=rentalhub-identities',{timeout:45000,headers:{'x-api-key':key}});
 if(response.data?.status===false)throw new Error('Biometric erasure is not confirmed. Please retry later.');
 await db.query('UPDATE users SET face_gallery_enrolled=FALSE WHERE id=$1',[userId]);
};
module.exports={CONSENT_VERSION,normalName,digest,privatePhoto,canonicalPhoto,faceVerdict,comparePhotos,screenPhoto,identityConflict,legalConflict,recordFlag,guardManualVerification,eraseGallery};
