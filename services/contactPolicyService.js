const db=require('../config/middleware/database');const policy=require('../config/utils/contactPolicy');
const ERROR_MESSAGE='Keep phone numbers, email addresses and outside contact links out of messages. For account help, ask staff for a private contact form.';
const recordViolation=async(userId,channel,contextKey,reason)=>{
 await db.query('INSERT INTO communication_policy_violations(user_id,channel,context_key,reason) VALUES($1,$2,$3,$4)',[userId,channel,String(contextKey),reason]);
 const count=Number((await db.query("SELECT COUNT(*)::int AS count FROM communication_policy_violations WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",[userId])).rows[0]?.count || 0);
 if(count>=3){const alert=await db.query("INSERT INTO communication_policy_alerts(user_id,window_start) VALUES($1,date_trunc('hour',NOW())) ON CONFLICT DO NOTHING RETURNING user_id",[userId]);if(alert.rows.length)await db.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,metadata) VALUES($1,'REPEATED_CONTACT_SHARING_BLOCKED','user',$1,$2)",[userId,JSON.stringify({channel,reason,count})]);}
};
const enforce=async({userId,channel,contextKey,texts,history=[]})=>{
 const fragments=texts.filter(Boolean).map(policy.fragment).filter(Boolean);
 if(fragments.length>1){const candidates=[fragments.join(''),...fragments.map((first,index)=>first+fragments.filter((_,other)=>other!==index).join(''))];texts=[...texts,...candidates.filter(value=>/^(?:0[789]|234|\+)/.test(value))];}
 for(const text of texts.filter(Boolean)){const result=policy.inspect(text,history);if(result.blocked){await recordViolation(userId,channel,contextKey,result.reason);const error=new Error(result.reason==='credential_request'?'Never share passwords, OTPs or card PINs. Use the account recovery tools.':ERROR_MESSAGE);error.statusCode=400;error.code='CONTACT_SHARING_BLOCKED';throw error;}}
};
const messageHistory=async(senderId,receiverId)=>(await db.query("SELECT message_text FROM messages WHERE sender_id=$1 AND receiver_id=$2 AND created_at>NOW()-INTERVAL '15 minutes' ORDER BY created_at DESC LIMIT 5",[senderId,receiverId])).rows.reverse().map(row=>row.message_text);
module.exports={enforce,messageHistory,ERROR_MESSAGE};
