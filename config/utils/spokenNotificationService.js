const db = require('../middleware/database');
const logger = require('./logger');
const { getSpokenCopy } = require('./spokenNotificationCopy');

const EVENT_TYPES = Object.freeze({ RENT_SAVINGS_DUE_REMINDER: 'rent_savings_due_reminder', RENT_PAYMENT_SUCCESS: 'rent_payment_success' });
const DEFAULT_EVENT_TTL_MS = 15 * 60 * 1000;
const CLAIM_TTL_MS = 90 * 1000;
const MAX_PENDING_EVENTS = 10;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60 * 1000;
const normalizeLanguage = value => { const language = String(value || 'en').trim().toLowerCase().split(/[-_]/)[0]; return ['en','ha','ig','yo'].includes(language) ? language : 'en'; };
const sanitizeText = (value, max = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Requests must never create or alter production schema. Use the numbered migrations.
const ensureSchema = () => db.query(`SELECT claim_token, attempt_count, max_attempts, last_failure_reason, next_eligible_at, playback_failed_at FROM spoken_notification_events WHERE FALSE`);
const getPreferences = async userId => {
  const { rows } = await db.query('SELECT preferences FROM user_notification_preferences WHERE user_id = $1', [userId]);
  const preferences = rows[0]?.preferences || {};
  return { enabled: preferences.spokenNotificationsEnabled === true, language: normalizeLanguage(preferences.spokenNotificationLanguage) };
};

const emitSpokenEvent = async ({ userId, eventType, sourceType = null, sourceId = null, dedupKey, title, message, audioKey = null, payload = {}, expiresAt = null, maxAttempts = DEFAULT_MAX_ATTEMPTS }) => {
  if (!userId || !Object.values(EVENT_TYPES).includes(eventType) || !dedupKey || !title || !message) return null;
  try {
    const preferences = await getPreferences(userId);
    if (!preferences.enabled) return null;
    await ensureSchema();
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(Date.now() + DEFAULT_EVENT_TTL_MS);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) return null;
    const copy = getSpokenCopy(eventType, preferences.language);
    const { rows } = await db.query(
      `INSERT INTO spoken_notification_events
        (user_id,event_type,source_type,source_id,dedup_key,title,message,language,audio_key,payload,status,expires_at,max_attempts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',$11,$12)
       ON CONFLICT (user_id, dedup_key) DO NOTHING RETURNING *`,
      [userId,eventType,sourceType ? sanitizeText(sourceType,80) : null,sourceId,sanitizeText(dedupKey,255),copy.title,copy.message,preferences.language,audioKey ? sanitizeText(audioKey,120) : null,JSON.stringify(payload && typeof payload === 'object' ? payload : {}),expiry.toISOString(),Math.max(1,Math.min(Number(maxAttempts)||DEFAULT_MAX_ATTEMPTS,5))]
    );
    return rows[0] || null;
  } catch (error) {
    logger.error('spokenNotificationService.emitSpokenEvent error', {error:error.message,eventType,userId});
    return null;
  }
};

const expireOldEvents = async userId => {
  await db.query(`UPDATE spoken_notification_events SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND status IN ('pending','claimed') AND expires_at<=CURRENT_TIMESTAMP`,[userId]);
  await db.query(`UPDATE spoken_notification_events SET status='failed',claimed_by_device=NULL,claim_token=NULL,claim_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND status IN ('pending','claimed') AND attempt_count>=COALESCE(max_attempts,$2) AND (claim_expires_at IS NULL OR claim_expires_at<=CURRENT_TIMESTAMP)`,[userId,DEFAULT_MAX_ATTEMPTS]);
};
const getPendingEvents = async (userId,{limit=MAX_PENDING_EVENTS}={}) => {
  await ensureSchema();
  await expireOldEvents(userId);
  const { rows } = await db.query(
    `SELECT id,event_type,source_type,source_id,dedup_key,title,message,language,audio_key,payload,status,
            expires_at,claimed_at,claimed_by_device,claim_expires_at,acknowledged_at,created_at,
            attempt_count,max_attempts,last_failure_reason,next_eligible_at
     FROM spoken_notification_events WHERE user_id=$1 AND status IN ('pending','claimed')
       AND expires_at>CURRENT_TIMESTAMP AND acknowledged_at IS NULL
       AND attempt_count<COALESCE(max_attempts,$3)
       AND (next_eligible_at IS NULL OR next_eligible_at<=CURRENT_TIMESTAMP)
       AND (claim_expires_at IS NULL OR claim_expires_at<=CURRENT_TIMESTAMP OR status='pending')
       AND EXISTS (SELECT 1 FROM user_notification_preferences WHERE user_id=$1 AND preferences->'spokenNotificationsEnabled'='true'::jsonb)
     ORDER BY created_at ASC LIMIT $2`,
    [userId,Math.max(1,Math.min(Number(limit)||MAX_PENDING_EVENTS,MAX_PENDING_EVENTS)),DEFAULT_MAX_ATTEMPTS]
  );
  return rows;
};

const claimEvent = async ({userId,eventId,deviceId,claimToken}) => {
  const device=sanitizeText(deviceId,120),token=sanitizeText(claimToken,120);
  if (!device || !token) return null;
  await ensureSchema();
  const retry = "status = 'claimed' AND claimed_by_device = $3 AND claim_token IS NOT NULL AND claim_token = $5 AND claim_expires_at > CURRENT_TIMESTAMP";
  // A single UPDATE and token-bound lease protect separate tabs using the same device ID.
  const { rows } = await db.query(
    `UPDATE spoken_notification_events SET status = 'claimed',
       claimed_at=CASE WHEN ${retry} THEN claimed_at ELSE CURRENT_TIMESTAMP END,
       claimed_by_device=$3,claim_token=$5,
       claim_expires_at=CASE WHEN ${retry} THEN claim_expires_at ELSE CURRENT_TIMESTAMP+INTERVAL '90 seconds' END,
       last_attempt_at=CASE WHEN ${retry} THEN last_attempt_at ELSE CURRENT_TIMESTAMP END,
       attempt_count=CASE WHEN ${retry} THEN attempt_count ELSE attempt_count+1 END,
       updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 AND acknowledged_at IS NULL AND expires_at>CURRENT_TIMESTAMP
       AND status IN ('pending','claimed')
       AND (attempt_count < COALESCE(max_attempts, $4) OR (${retry}))
       AND (next_eligible_at IS NULL OR next_eligible_at<=CURRENT_TIMESTAMP)
       AND (status='pending' OR (status='claimed' AND (claim_expires_at IS NULL OR claim_expires_at<=CURRENT_TIMESTAMP)) OR (${retry}))
       AND EXISTS (SELECT 1 FROM user_notification_preferences WHERE user_id=$2 AND preferences->'spokenNotificationsEnabled'='true'::jsonb)
     RETURNING *`,[eventId,userId,device,DEFAULT_MAX_ATTEMPTS,token]
  );
  return rows[0] || null;
};

const recordPlaybackResult = async ({userId,eventId,deviceId,claimToken,outcome,reason=null}) => {
  const device=sanitizeText(deviceId,120),token=sanitizeText(claimToken,120);
  if (!device || !token || !['success','failed','interrupted','unavailable','unsupported'].includes(outcome)) return {event:null,acknowledged:false};
  await ensureSchema();
  if (outcome==='success') {
    const {rows}=await db.query(
      `UPDATE spoken_notification_events SET status='acknowledged',acknowledged_at=CURRENT_TIMESTAMP,acknowledged_by_device=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND user_id=$2 AND status='claimed' AND claimed_by_device=$3 AND claim_token=$4
         AND claim_expires_at>CURRENT_TIMESTAMP AND acknowledged_at IS NULL AND expires_at>CURRENT_TIMESTAMP RETURNING *`,[eventId,userId,device,token]);
    if (rows[0]) return {event:rows[0],acknowledged:true};
    const duplicate=await db.query(`SELECT * FROM spoken_notification_events WHERE id=$1 AND user_id=$2 AND status='acknowledged' AND acknowledged_by_device=$3 AND claim_token=$4`,[eventId,userId,device,token]);
    return {event:duplicate.rows[0]||null,acknowledged:Boolean(duplicate.rows[0])};
  }
  const permanent=['unavailable','unsupported'].includes(outcome);
  const {rows}=await db.query(
    `UPDATE spoken_notification_events SET status=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN 'expired' WHEN $5::boolean OR attempt_count>=COALESCE(max_attempts,$6) THEN 'failed' ELSE 'pending' END,
       last_failure_reason=$7,last_failure_at=CURRENT_TIMESTAMP,playback_failed_at=CURRENT_TIMESTAMP,playback_failure_reason=$7,
       next_eligible_at=CASE WHEN $5::boolean OR attempt_count>=COALESCE(max_attempts,$6) OR expires_at<=CURRENT_TIMESTAMP THEN NULL ELSE CURRENT_TIMESTAMP+INTERVAL '60 seconds' END,
       claim_expires_at=NULL,claimed_by_device=NULL,claim_token=NULL,updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 AND status='claimed' AND claimed_by_device=$3 AND claim_token=$4 AND claim_expires_at>CURRENT_TIMESTAMP AND acknowledged_at IS NULL RETURNING *`,
    [eventId,userId,device,token,permanent,DEFAULT_MAX_ATTEMPTS,sanitizeText(reason||outcome,64)]
  );
  return {event:rows[0]||null,acknowledged:false,permanent};
};
module.exports={EVENT_TYPES,DEFAULT_EVENT_TTL_MS,CLAIM_TTL_MS,MAX_PENDING_EVENTS,DEFAULT_MAX_ATTEMPTS,RETRY_DELAY_MS,ensureSchema,normalizeLanguage,emitSpokenEvent,getPendingEvents,claimEvent,recordPlaybackResult,expireOldEvents};
