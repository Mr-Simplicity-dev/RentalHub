const crypto=require('crypto');
const {normalizeWhatsAppPhone,nextDeliveryStatus,retryableWhatsAppError}=require('../config/utils/whatsappPolicy');
const escapeHtml=value=>String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>crypto.randomBytes(24).toString('hex');
const createPropertyAlertDeliveryService=({db,sendEmail,sendWhatsAppTemplate,frontendUrl,env=process.env})=>{
 const q=(sql,params)=>db.query(sql,params);
 const syncAlert=async alertId=>q("UPDATE tenant_property_alerts a SET notified_at=COALESCE(a.notified_at,NOW()), fulfilled_at=COALESCE(a.fulfilled_at,NOW()), workflow_status='fulfilled', is_active=FALSE, matched_property_id=COALESCE(a.matched_property_id,(SELECT (d.payload->>'property_id')::INTEGER FROM property_alert_deliveries d WHERE d.alert_id=a.id AND d.payload->>'property_id' IS NOT NULL LIMIT 1)) WHERE a.id=$1 AND EXISTS(SELECT 1 FROM property_alert_deliveries d WHERE d.alert_id=a.id AND ((d.channel='email' AND d.status='accepted') OR (d.channel='whatsapp' AND d.status IN ('delivered','read'))))",[alertId]);
 const enqueue=async({alert,property,note=''})=>{
  const url=new URL(property?'/properties/'+property.id:'/properties',frontendUrl);
  if(!property){for(const key of ['property_type','state_id','lga_name','city'])if(alert[key])url.searchParams.set(key,alert[key]);}
  const payload={property_id:property?.id || null,title:property?.title || 'Your property request has been completed',location:property?[property.area,property.city].filter(Boolean).join(', '):[alert.state_name,alert.lga_name,alert.city].filter(Boolean).join(', '),detail:property?'Rent: NGN '+property.rent_amount:'Check matching listings for your requested property.',url:url.toString().length<=200?url.toString():new URL('/properties',frontendUrl).toString(),note:String(note).slice(0,1000)};
  const result=await q("INSERT INTO property_alert_deliveries(alert_id,channel,payload,correlation_token) VALUES ($1,'email',$2,$3),($1,'whatsapp',$2,$4) ON CONFLICT(alert_id,channel) DO NOTHING RETURNING id",[alert.id,JSON.stringify(payload),'arh_pa_'+token(),'arh_pa_'+token()]);
  return {queued:result.rows.length};
 };
 const finish=async(job,status,error=null,messageId=null,delaySeconds=0)=>{
  await q("UPDATE property_alert_deliveries SET status=$3,last_error=$4,message_id=COALESCE($5,message_id),next_attempt_at=NOW()+($6 * INTERVAL '1 second'),lease_until=NULL,attempts=CASE WHEN $3='blocked' THEN GREATEST(attempts-1,0) ELSE attempts END,updated_at=NOW() WHERE id=$1 AND claim_token=$2 AND status='sending'",[job.id,job.claim_token,status,error,messageId,delaySeconds]);
  await syncAlert(job.alert_id);
 };
 const processJob=async job=>{
  const payload=typeof job.payload==='string'?JSON.parse(job.payload):job.payload;
  if(job.channel==='email'){
   try{const result=await sendEmail({to:job.email,subject:'Update on your RentalHub property request',html:'<p>Hello '+escapeHtml(job.full_name)+',</p><p>'+escapeHtml(payload.title)+'</p><p>'+escapeHtml(payload.location)+'</p><p>'+escapeHtml(payload.detail)+'</p><p>'+escapeHtml(payload.note)+'</p><p><a href="'+escapeHtml(payload.url)+'">View properties</a></p>'});if(result?.success!==true)throw Error('email_not_accepted');await finish(job,'accepted');}
   catch(error){await finish(job,/timeout|timed out/i.test(error.message)?'uncertain':job.attempts<5?'retry':'failed','email_send_failed',null,Math.min(3600,60*2**job.attempts));}return;
  }
  if(job.whatsapp_opt_in!==true || !job.whatsapp_consented_at)return finish(job,'skipped','no_recorded_opt_in');
  const phone=normalizeWhatsAppPhone(job.phone);if(!phone)return finish(job,'skipped','invalid_phone');
  const suppressed=await q('SELECT opted_out FROM property_alert_whatsapp_preferences WHERE phone=$1',[phone]);
  if(suppressed.rows[0]?.opted_out)return finish(job,'cancelled','recipient_opted_out');
  if((env.WHATSAPP_PROVIDER || 'meta').toLowerCase()!=='meta' || !/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_API_VERSION || '') || !env.WHATSAPP_PROPERTY_MATCH_TEMPLATE || !env.WHATSAPP_META_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_APP_SECRET)return finish(job,'blocked','whatsapp_configuration_required',null,3600);
  const result=await sendWhatsAppTemplate({to:phone,templateName:env.WHATSAPP_PROPERTY_MATCH_TEMPLATE,language:env.WHATSAPP_PROPERTY_MATCH_LANGUAGE || 'en',params:[String(job.full_name).slice(0,100),payload.title,payload.location || 'Your requested location',payload.detail,payload.url],callbackData:job.correlation_token});
  if(result.optedOut)return finish(job,'cancelled','recipient_opted_out');
  if(result.policyBlocked)return finish(job,'blocked','opt_out_check_unavailable',null,3600);
  if(result.success && result.messageId)return finish(job,'accepted',null,result.messageId);
  if(result.success || result.uncertain)return finish(job,'uncertain','provider_acceptance_uncertain');
  if([190,131005,132001,132015,132016].includes(Number(result.code)))return finish(job,'blocked','whatsapp_configuration_'+result.code,null,3600);
  const retry=retryableWhatsAppError(result) && job.attempts<5;
  return finish(job,retry?'retry':'failed','whatsapp_error_'+(result.code || result.httpStatus || 'rejected'),null,Math.min(7200,60*2**job.attempts));
 };
 const reconcile=async()=>{
  const events=await q('SELECT * FROM property_alert_whatsapp_events WHERE processed_at IS NULL ORDER BY id LIMIT 100');
  for(const event of events.rows){
   const found=await q("SELECT * FROM property_alert_deliveries WHERE channel='whatsapp' AND (message_id=$1 OR correlation_token=$2) LIMIT 1",[event.message_id,event.correlation_token || '']);const job=found.rows[0];
   if(!job){await q("UPDATE property_alert_whatsapp_events SET processed_at=NOW() WHERE id=$1 AND created_at < NOW()-INTERVAL '7 days'",[event.id]);continue;}
   const older=job.last_event_at && new Date(event.event_at)<new Date(job.last_event_at);
   if(!older || ['delivered','read'].includes(event.status)){
    const status=nextDeliveryStatus(job.status,event.status);
    const retry=status==='failed' && retryableWhatsAppError({code:event.error_code}) && job.attempts<5;
    await q("UPDATE property_alert_deliveries SET status=$3,message_id=COALESCE(message_id,$2),last_event_at=GREATEST(COALESCE(last_event_at,$4),$4),last_error=$5,next_attempt_at=NOW()+INTERVAL '5 minutes',lease_until=NULL,updated_at=NOW() WHERE id=$1 AND status=$6",[job.id,event.message_id,retry?'retry':status,event.event_at,event.error_code?'whatsapp_error_'+event.error_code:null,job.status]);
    await syncAlert(job.alert_id);
   }
   await q('UPDATE property_alert_whatsapp_events SET processed_at=NOW() WHERE id=$1',[event.id]);
  }
 };
 const processQueue=async(limit=20)=>{
  await q("UPDATE property_alert_deliveries SET status='uncertain',last_error='worker_interrupted_check_receipts',updated_at=NOW() WHERE status='sending' AND lease_until<NOW()");
  await q("UPDATE property_alert_deliveries SET status='failed',last_error='delivery_expired',updated_at=NOW() WHERE status IN ('pending','retry','blocked') AND created_at<=NOW()-INTERVAL '7 days'");
  await reconcile();
  for(let i=0;i<limit;i++){
   const claim=token();const result=await q("WITH candidate AS (SELECT id FROM property_alert_deliveries WHERE status IN ('pending','retry','blocked') AND next_attempt_at<=NOW() AND attempts<5 AND created_at>NOW()-INTERVAL '7 days' ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (UPDATE property_alert_deliveries d SET status='sending',claim_token=$1,correlation_token=$2,message_id=NULL,lease_until=NOW()+INTERVAL '2 minutes',attempts=attempts+1,updated_at=NOW() FROM candidate c WHERE d.id=c.id RETURNING d.*) SELECT d.*,a.email,a.full_name,a.phone,a.whatsapp_opt_in,a.whatsapp_consented_at FROM claimed d JOIN tenant_property_alerts a ON a.id=d.alert_id",[claim,'arh_pa_'+token()]);
   const job=result.rows[0];if(!job)break;
   try{await processJob(job);}catch(error){await finish(job,'uncertain','worker_error_check_delivery');}
  }
 };
 const handleWebhook=async body=>{
  for(const entry of Array.isArray(body.entry)?body.entry:[])for(const change of Array.isArray(entry.changes)?entry.changes:[]){
   const value=change.value || {};if(!env.WHATSAPP_PHONE_NUMBER_ID || value.metadata?.phone_number_id!==env.WHATSAPP_PHONE_NUMBER_ID)continue;
   for(const message of Array.isArray(value.messages)?value.messages:[]){
    const text=String(message.text?.body || '').trim().toLowerCase().replace(/[.!]$/,'');const optedOut=['stop','unsubscribe','cancel','end','quit','stop messages'].includes(text);if(!optedOut && !['start','subscribe'].includes(text))continue;
    const phone=normalizeWhatsAppPhone(message.from);if(!phone)continue;
    const time=Number(message.timestamp);if(!Number.isFinite(time) || time<=0)continue;
    await q('INSERT INTO property_alert_whatsapp_preferences(phone,opted_out,event_at) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET opted_out=EXCLUDED.opted_out,event_at=EXCLUDED.event_at,updated_at=NOW() WHERE EXCLUDED.event_at>property_alert_whatsapp_preferences.event_at',[phone,optedOut,new Date(time*1000)]);
   }
   for(const status of Array.isArray(value.statuses)?value.statuses:[]){
    if(!['sent','delivered','read','failed'].includes(status.status) || !status.id || String(status.id).length>255)continue;
    const time=Number(status.timestamp);if(!Number.isFinite(time) || time<=0)continue;
    await q(`INSERT INTO property_alert_whatsapp_events(message_id,status,correlation_token,event_at,error_code) SELECT $1,$2,$3,$4,$5 WHERE $3 LIKE 'arh_pa_%' OR EXISTS(SELECT 1 FROM property_alert_deliveries WHERE message_id=$1) ON CONFLICT(message_id,status,event_at) DO NOTHING`,[status.id,status.status,String(status.biz_opaque_callback_data || '').slice(0,80) || null,new Date(time*1000),Number(status.errors?.[0]?.code) || null]);
   }
  }
  await reconcile();
 };
 return {enqueue,processQueue,processJob,handleWebhook,reconcile};
};
let service;
const getService=()=>service || (service=createPropertyAlertDeliveryService({db:require('../config/middleware/database'),sendEmail:require('../config/utils/mailer').sendEmail,sendWhatsAppTemplate:require('../config/utils/whatsappService').sendWhatsAppTemplate,frontendUrl:require('../config/utils/frontendUrl').getFrontendUrl()}));
module.exports={createPropertyAlertDeliveryService,enqueue:args=>getService().enqueue(args),processQueue:()=>getService().processQueue(),handleWebhook:body=>getService().handleWebhook(body)};
