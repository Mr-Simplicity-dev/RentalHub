const {normalizeWhatsAppPhone,nextDeliveryStatus}=require('../config/utils/whatsappPolicy');
const SENIOR=new Set(['super_admin','super_support_admin']);
const STAFF=new Set([...SENIOR,'state_support_admin','lga_support_admin']);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const clean=value=>String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
const optedCommand=text=>['stop','unsubscribe','cancel','end','quit','stop messages'].includes(clean(text).toLowerCase().replace(/[.!]$/,''));
const windowOpen=(last,now=Date.now())=>Number.isFinite(new Date(last).getTime())&&new Date(last).getTime()<=now&&now-new Date(last).getTime()<86400000;
const canAccess=(actor,ticket)=>STAFF.has(actor?.user_type)&&(SENIOR.has(actor.user_type)||Number(ticket.assigned_to)===Number(actor.id));
const manualPolicy=(ticket,body,now)=>{
 if(body.human_confirmed!==true||body.purpose!=='support'||body.tag||body.automated||body.campaign_id)fail(400,'Only a manually written support reply is allowed.');
 if(!windowOpen(ticket.whatsapp_last_inbound_at,now))fail(409,'The 24-hour WhatsApp reply window has closed. Ask the customer to message us again. Approved templates are managed separately.');
 if(['resolved','closed'].includes(ticket.status)||ticket.whatsapp_mode!=='human')fail(409,'Open this conversation for human support before replying.');
 const message=clean(body.message);
 if(/\b(discount|promo(?:tion)?(?:s)?|coupon|buy now|limited.time offer|sale ends)\b/i.test(message))fail(400,'Promotions belong in the approved-template marketing workflow.');
 if(!message||message.length>3000)fail(400,'Enter a support reply of 1–3000 characters.');
 return message;
};
function createService({db,send,notify,audit,env=process.env,now=Date.now}){
 const tx=async fn=>{const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const mask=row=>{const {whatsapp_phone,...rest}=row;return {...rest,phone_hint:whatsapp_phone?'••••'+whatsapp_phone.slice(-4):'',channel:'whatsapp',identity:row.user_id?'Unique verified phone match; not a signed-in session':'Unidentified WhatsApp customer',window_open:windowOpen(row.whatsapp_last_inbound_at,now()),ai_paused:true};};
 const get=async(actor,id,c=db,lock=false)=>{if(!STAFF.has(actor?.user_type))fail(403,'Support staff access required.');const row=(await c.query('SELECT * FROM support_tickets WHERE id=$1 AND whatsapp_phone IS NOT NULL'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!row||!canAccess(actor,row))fail(404,'Conversation not found.');return row;};
 const alert=async(ticket,replyId)=>{
  const recipients=ticket.assigned_to?[{id:ticket.assigned_to}]:(await db.query("SELECT id FROM users WHERE user_type IN ('super_support_admin','super_admin') AND is_active=TRUE AND deleted_at IS NULL")).rows;
  for(const actor of recipients)await notify(actor.id,'whatsapp_support','WhatsApp support needs attention','A customer sent a support message. Open the protected support inbox.','/admin/whatsapp-support',`wa:inbound:${replyId}`);
 };
 const inbound=async(value,message)=>{
  const phone=normalizeWhatsAppPhone(message.from),timestamp=Number(message.timestamp),id=String(message.id||'');
  if(!phone||!id||id.length>255||!Number.isFinite(timestamp)||timestamp<=0||timestamp*1000>now()+300000)return;
  if(optedCommand(message.text?.body)||['start','subscribe'].includes(clean(message.text?.body).toLowerCase()))return;
  const text=message.type==='text'?clean(message.text?.body).slice(0,6000):'[Customer sent '+clean(message.type).slice(0,30)+'. This inbox accepts text. Ask the customer to use the secure support form for files.]';
  if(!text)return;
  const result=await tx(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['wa:'+phone]);
   const previous=(await c.query('SELECT id,ticket_id FROM support_ticket_replies WHERE whatsapp_message_id=$1',[id])).rows[0];if(previous){const ticket=(await c.query('SELECT * FROM support_tickets WHERE id=$1',[previous.ticket_id])).rows[0];return {ticket,reply:previous};}
   let ticket=(await c.query('SELECT * FROM support_tickets WHERE whatsapp_phone=$1 FOR UPDATE',[phone])).rows[0];
   const matches=(await c.query("SELECT id FROM users WHERE phone_verified=TRUE AND is_active=TRUE AND deleted_at IS NULL AND user_type IN ('tenant','landlord') AND rentalhub_phone_key(phone)=$1 LIMIT 2",['+'+phone])).rows;
   if(ticket&&ticket.user_id&&(matches.length!==1||Number(matches[0].id)!==Number(ticket.user_id))){await c.query('UPDATE support_tickets SET user_id=NULL WHERE id=$1',[ticket.id]);ticket.user_id=null;}
   if(!ticket){
    ticket=(await c.query("INSERT INTO support_tickets(subject,description,category,whatsapp_phone,user_id,status,whatsapp_mode) VALUES('WhatsApp support','Customer-initiated WhatsApp support conversation','general',$1,$2,'open','human') RETURNING *",[phone,matches.length===1?matches[0].id:null])).rows[0];
   }
   const reply=(await c.query("INSERT INTO support_ticket_replies(ticket_id,user_id,author_name,message,is_admin,whatsapp_message_id,whatsapp_delivery,whatsapp_event_at) VALUES($1,NULL,'WhatsApp customer',$2,FALSE,$3,'received',$4) RETURNING id",[ticket.id,text,id,new Date(timestamp*1000)])).rows[0];
   await c.query("UPDATE support_tickets SET whatsapp_last_inbound_at=GREATEST(COALESCE(whatsapp_last_inbound_at,$2),$2),status=CASE WHEN status IN ('resolved','closed','pending') THEN 'open' ELSE status END,whatsapp_mode='human',updated_at=NOW(),waiting_customer_since=COALESCE(waiting_customer_since,NOW()) WHERE id=$1",[ticket.id,new Date(timestamp*1000)]);
   return {ticket,reply};
  });
  if(result)await alert(result.ticket,result.reply.id);
 };
 const notifyReply=async(ticketId,replyId)=>{
  await db.query("UPDATE support_tickets SET updated_at=NOW(),first_response_at=COALESCE(first_response_at,NOW()),waiting_customer_since=CASE WHEN waiting_customer_since<=(SELECT created_at FROM support_ticket_replies WHERE id=$2) THEN NULL ELSE waiting_customer_since END WHERE id=$1",[ticketId,replyId]);
  const ticket=(await db.query('SELECT user_id FROM support_tickets WHERE id=$1',[ticketId])).rows[0];
  if(ticket?.user_id)await notify(ticket.user_id,'ticket_reply','Human support replied','A support agent replied. Open your support conversation.','/support/tickets/'+ticketId,'wa:reply:'+replyId);
 };
 const webhook=async body=>{
  if(body.object!=='whatsapp_business_account')return;
  for(const entry of Array.isArray(body.entry)?body.entry:[])for(const change of Array.isArray(entry.changes)?entry.changes:[]){
   const v=change.value||{};if(change.field!=='messages'||!env.WHATSAPP_PHONE_NUMBER_ID||v.metadata?.phone_number_id!==env.WHATSAPP_PHONE_NUMBER_ID)continue;
   for(const message of Array.isArray(v.messages)?v.messages:[])await inbound(v,message);
   for(const status of Array.isArray(v.statuses)?v.statuses:[]){
    if(!['sent','delivered','read','failed'].includes(status.status)||!status.id)continue;
    const received=await tx(async c=>{const token=/^arh_support_(\d+)$/.exec(String(status.biz_opaque_callback_data||''));const r=(await c.query('SELECT * FROM support_ticket_replies WHERE (whatsapp_message_id=$1 OR (id=$2 AND whatsapp_request_id IS NOT NULL)) AND is_admin=TRUE FOR UPDATE',[String(status.id).slice(0,255),token?Number(token[1]):0])).rows[0];if(r)await c.query('UPDATE support_ticket_replies SET whatsapp_delivery=$2,whatsapp_message_id=COALESCE(whatsapp_message_id,$3) WHERE id=$1',[r.id,nextDeliveryStatus(r.whatsapp_delivery,status.status),status.id]);return r;});if(received&&['sent','delivered','read'].includes(status.status))await notifyReply(received.ticket_id,received.id);
   }
  }
 };
 const list=async(actor,filters={})=>{
  if(!STAFF.has(actor?.user_type))fail(403,'Support staff access required.');
  const args=[],where=['st.whatsapp_phone IS NOT NULL'];
  if(!SENIOR.has(actor.user_type)){args.push(actor.id);where.push('st.assigned_to=$'+args.length);}
  if(['open','in_progress','pending','resolved','closed'].includes(filters.status)){args.push(filters.status);where.push('st.status=$'+args.length);}
  if(filters.assigned==='me'){args.push(actor.id);where.push('st.assigned_to=$'+args.length);}
  if(filters.q){args.push('%'+clean(filters.q).slice(0,100)+'%');where.push('(st.subject ILIKE $'+args.length+' OR CAST(st.id AS TEXT) ILIKE $'+args.length+')');}
  return (await db.query(`SELECT st.*,u.full_name AS agent_name,(SELECT message FROM support_ticket_replies r WHERE r.ticket_id=st.id ORDER BY r.id DESC LIMIT 1) AS last_message FROM support_tickets st LEFT JOIN users u ON u.id=st.assigned_to WHERE ${where.join(' AND ')} ORDER BY st.updated_at DESC LIMIT 100`,args)).rows.map(mask);
 };
 const history=async(actor,id,before)=>{const ticket=await get(actor,id);const args=[id];let clause='';if(Number(before)>0){args.push(Number(before));clause=' AND id<$2';}const rows=(await db.query('SELECT id,user_id,author_name,message,is_admin,created_at,whatsapp_delivery FROM support_ticket_replies WHERE ticket_id=$1'+clause+' ORDER BY id DESC LIMIT 100',args)).rows.reverse();return{ticket:mask(ticket),messages:rows,older_cursor:rows.length===100?rows[0].id:null};};
 const update=async(actor,id,body)=>{
  if(body.status!==undefined&&!['open','in_progress','pending','resolved','closed'].includes(body.status))fail(400,'Choose a valid support status.');
  if(body.assigned_to!==undefined&&body.assigned_to!==null&&(!Number.isSafeInteger(Number(body.assigned_to))||Number(body.assigned_to)<=0))fail(400,'Choose a valid agent.');
  const ticket=await tx(async c=>{
   const ticket=await get(actor,id,c,true);
   if(body.assigned_to!==undefined){
    if(!SENIOR.has(actor.user_type))fail(403,'Senior support must assign WhatsApp conversations.');
    const target=Number(body.assigned_to);
    if(target){const staff=(await c.query("SELECT id FROM users WHERE id=$1 AND user_type IN ('super_admin','super_support_admin','state_support_admin','lga_support_admin') AND is_active=TRUE AND deleted_at IS NULL",[target])).rows[0];if(!staff)fail(400,'Choose an active support agent.');}
    await c.query('UPDATE support_tickets SET assigned_to=$2,assigned_at=NOW(),updated_at=NOW() WHERE id=$1',[id,target||null]);
   }
   if(body.status!==undefined)await c.query("UPDATE support_tickets SET status=$2,whatsapp_mode=CASE WHEN $2 IN ('closed','resolved','pending') THEN 'paused' ELSE 'human' END,resolved_at=CASE WHEN $2 IN ('closed','resolved') THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1",[id,body.status]);
   return ticket;
  });
  if(body.assigned_to&&Number(body.assigned_to)!==Number(ticket.assigned_to))await notify(Number(body.assigned_to),'whatsapp_assignment','WhatsApp support assigned','A WhatsApp conversation was assigned to you.','/admin/whatsapp-support',`wa:assignment:${id}:${body.assigned_to}:${ticket.updated_at}`);
  if(body.status!==undefined&&body.status!==ticket.status&&ticket.user_id)await notify(ticket.user_id,'support_status','Support status updated','Your support conversation status changed. Open your support tickets.','/support',`wa:status:${id}:${body.status}:${ticket.updated_at}`);
  await audit({actorId:actor.id,action:'WHATSAPP_SUPPORT_UPDATED',targetType:'support_ticket',targetId:id});
  return{success:true};
 };
 const reply=async(actor,id,body)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id||''))fail(400,'A valid retry identifier is required.');
  // Commit the reservation before contacting Meta. An uncertain send is never resent automatically.
  const reserved=await tx(async c=>{const ticket=await get(actor,id,c,true);const old=(await c.query('SELECT id,whatsapp_delivery FROM support_ticket_replies WHERE ticket_id=$1 AND whatsapp_request_id=$2',[id,body.request_id])).rows[0];if(old)return{old};const text=manualPolicy(ticket,body,now());const opt=(await c.query('SELECT opted_out FROM property_alert_whatsapp_preferences WHERE phone=$1',[ticket.whatsapp_phone])).rows[0];if(opt?.opted_out)fail(409,'This customer opted out of WhatsApp messages.');const row=(await c.query("INSERT INTO support_ticket_replies(ticket_id,user_id,author_name,message,is_admin,whatsapp_request_id,whatsapp_delivery) VALUES($1,$2,'Human support agent',$3,TRUE,$4,'sending') RETURNING id",[id,actor.id,text,body.request_id])).rows[0];return{ticket,text,row};});
  if(reserved.old&&['sent','delivered','read'].includes(reserved.old.whatsapp_delivery))await notifyReply(id,reserved.old.id);
  if(reserved.old)return{success:reserved.old.whatsapp_delivery==='sent'||reserved.old.whatsapp_delivery==='delivered'||reserved.old.whatsapp_delivery==='read',data:reserved.old,replayed:true,message:'This send was already recorded. Check its delivery status before composing another reply.'};
  const {ticket,text,row}=reserved;let result;
  try{result=await send({to:ticket.whatsapp_phone,message:'RentalHub human support: '+text,callbackData:'arh_support_'+row.id});}catch{result={success:false,uncertain:true};}
  const state=result.success&&result.messageId?'sent':result.uncertain?'uncertain':'failed';
  const persisted=await db.query("UPDATE support_ticket_replies SET whatsapp_message_id=COALESCE(whatsapp_message_id,$2),whatsapp_delivery=CASE WHEN whatsapp_delivery IN ('read','delivered') OR (whatsapp_delivery='failed' AND $3='sent') THEN whatsapp_delivery ELSE $3 END WHERE id=$1 RETURNING whatsapp_delivery",[row.id,result.messageId||null,state]);
  const actualState=persisted.rows[0]?.whatsapp_delivery||state;
  if(['sent','delivered','read'].includes(actualState))await notifyReply(id,row.id);
  await audit({actorId:actor.id,action:'WHATSAPP_HUMAN_REPLY_'+actualState.toUpperCase(),targetType:'support_ticket',targetId:id});
  return{success:['sent','delivered','read'].includes(actualState),data:{id:row.id,whatsapp_delivery:actualState},message:actualState==='uncertain'?'Delivery is uncertain. Check history before sending anything again.':actualState==='failed'?'WhatsApp did not accept this reply. Check configuration and window before a new send.':undefined};
 };
 return{webhook,list,history,update,reply};
}
let instance;
const getService=()=>instance||(instance=createService({db:require('../config/middleware/database'),send:require('../config/utils/whatsappService').sendWhatsAppText,notify:(...args)=>require('../config/utils/notificationService').createNotification(...args),audit:require('../config/utils/auditLogger').logAction}));
module.exports={createService,windowOpen,manualPolicy,canAccess,optedCommand,STAFF,...Object.fromEntries(['webhook','list','history','update','reply'].map(name=>[name,(...args)=>getService()[name](...args)]))};
