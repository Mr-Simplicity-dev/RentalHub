const db=require('../config/middleware/database');
const {ALL_ADMIN_ROLES}=require('../config/utils/roleHierarchy');
const DEFAULT_POLICY=Object.freeze({enabled:true,greetingEnabled:true,ringbackEnabled:true});
const SOUNDS=new Set(['normal','greeting','silent']);
const isWorker=user=>ALL_ADMIN_ROLES.includes(user?.user_type)||['agent','marketing_agent'].includes(user?.user_type);
const normalizePolicy=value=>Object.fromEntries(Object.entries(DEFAULT_POLICY).map(([key,fallback])=>[key,typeof value?.[key]==='boolean'?value[key]:fallback]));
const resolveSound=(policy,choice,worker)=>!policy.enabled||choice==='silent'?'silent':choice==='greeting'&&worker&&policy.greetingEnabled?'greeting':'normal';
async function settings(user,q=db){
 const [global,personal]=await Promise.all([q.query("SELECT value FROM app_settings WHERE key='call_sound_policy'"),q.query('SELECT preferences FROM user_notification_preferences WHERE user_id=$1',[user.id])]);
 const policy=normalizePolicy(global.rows[0]?.value);const preference=SOUNDS.has(personal.rows[0]?.preferences?.incomingCallSound)?personal.rows[0].preferences.incomingCallSound:'normal';
 return {policy,preference,isWorker:isWorker(user),effectiveSound:resolveSound(policy,preference,isWorker(user))};
}
async function savePreference(user,choice,q=db){
 if(!SOUNDS.has(choice)||choice==='greeting'&&!isWorker(user)){const e=Error('Choose an available call sound.');e.statusCode=400;throw e;}
 await q.query("INSERT INTO user_notification_preferences(user_id,preferences) VALUES($1,jsonb_build_object('incomingCallSound',$2::text)) ON CONFLICT(user_id) DO UPDATE SET preferences=user_notification_preferences.preferences || EXCLUDED.preferences,updated_at=NOW()",[user.id,choice]);
 return settings(user,q);
}
const expiresAt=call=>new Date(new Date(call.createdAt).getTime()+Number(process.env.CALL_RING_TIMEOUT_MS||45000)).toISOString();
const invitation=call=>({callId:call.id,callType:call.callType,caller:call.caller,receiver:call.receiver,propertyId:call.propertyId,propertyTitle:call.propertyTitle,status:call.status,isSupport:call.isSupport,createdAt:call.createdAt,expiresAt:expiresAt(call),...(call.disputeId?{disputeId:call.disputeId}:{})});
async function notifyIncoming(call,receiver,{q=db,sendPush=(...args)=>require('../config/utils/pushNotificationService').sendPushToUser(...args)}={}){
 const remaining=Math.ceil((Date.parse(expiresAt(call))-Date.now())/1000);if(remaining<=0)return;
 const prefs=await settings(receiver,q);
 const current=await q.query('SELECT status FROM call_sessions WHERE id=$1',[call.id]);if(current.rows[0]?.status!=='ringing')return;const sound=prefs.effectiveSound;
 return sendPush(receiver.id,{title:'Incoming RentalHub call',body:'Open RentalHub to answer. This call will expire shortly.',sound:sound==='silent'?null:sound==='greeting'?'call_greeting.wav':'call_normal.wav',channelId:'calls-'+sound+'-v1',ttl:Math.min(45,remaining),data:{type:'incoming_call',callId:call.id,expiresAt:expiresAt(call)}});
}
const recoverInvitation=(call,userId,now=Date.now())=>call&&Number(call.receiver?.id)===Number(userId)&&call.status==='ringing'&&Date.parse(expiresAt(call))>now?invitation(call):null;
module.exports={recoverInvitation,DEFAULT_POLICY,SOUNDS,isWorker,normalizePolicy,resolveSound,settings,savePreference,expiresAt,invitation,notifyIncoming};
