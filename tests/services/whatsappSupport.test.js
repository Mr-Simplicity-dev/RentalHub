const {test}=require('node:test'),assert=require('node:assert/strict');
const {createService,windowOpen,manualPolicy,canAccess,optedCommand}=require('../../services/whatsappSupportService');
const NOW=Date.parse('2026-11-12T09:00:00Z'),senior={id:7,user_type:'super_support_admin'},agent={id:8,user_type:'lga_support_admin'};
const body={request_id:'34c9d2c4-34d8-4fa2-8a0d-57a4f830c285',message:'Please open Payment History and share the transaction reference.',human_confirmed:true,purpose:'support'};
function fixture({matches=[{id:44}],optedOut=false,ticket:initial}={}){
 let ticket=initial||null,serial=0;const replies=[],calls=[],notifications=new Map(),sent=[],audits=[];
 const query=async(sql,args=[])=>{calls.push({sql,args});const rows=[];
  if(/^(BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(sql))return{rows};
  if(sql.startsWith('SELECT id,ticket_id FROM support_ticket_replies'))return{rows:replies.filter(r=>r.whatsapp_message_id===args[0])};
  if(sql.startsWith('SELECT id FROM users WHERE phone_verified')){assert.equal(args[0],'+2348030000000');return{rows:matches};}
  if(sql.startsWith('SELECT id FROM users WHERE user_type'))return{rows:[senior]};
  if(sql.startsWith('SELECT * FROM support_tickets'))return{rows:ticket&&(!sql.includes('whatsapp_phone=$1')||ticket.whatsapp_phone===args[0])?[{...ticket}]:[]};
  if(sql.startsWith('INSERT INTO support_tickets')){ticket={id:1,whatsapp_phone:args[0],user_id:args[1],status:'open',whatsapp_mode:'human',assigned_to:8,updated_at:'stamp'};return{rows:[{...ticket}]};}
  if(sql.startsWith('INSERT INTO support_ticket_replies')){const inbound=sql.includes("'WhatsApp customer'");const r=inbound?{id:++serial,ticket_id:args[0],message:args[1],whatsapp_message_id:args[2],is_admin:false,whatsapp_delivery:'received'}:{id:++serial,ticket_id:args[0],user_id:args[1],message:args[2],whatsapp_request_id:args[3],is_admin:true,whatsapp_delivery:'sending'};replies.push(r);return{rows:[r]};}
  if(sql.startsWith('UPDATE support_tickets SET whatsapp_last_inbound_at')){ticket.whatsapp_last_inbound_at=args[1];return{rows};}
  if(sql.startsWith('SELECT id,whatsapp_delivery'))return{rows:replies.filter(r=>r.ticket_id===args[0]&&r.whatsapp_request_id===args[1])};
  if(sql.startsWith('SELECT opted_out'))return{rows:[{opted_out:optedOut}]};
  if(sql.startsWith('UPDATE support_ticket_replies SET whatsapp_message_id=COALESCE')){const r=replies.find(r=>r.id===args[0]);r.whatsapp_message_id=args[1];r.whatsapp_delivery=args[2];return{rows};}
  if(sql.startsWith('UPDATE support_tickets SET updated_at'))return{rows};
  if(sql.startsWith('SELECT user_id FROM support_tickets'))return{rows:ticket?[ticket]:[]};
  if(sql.startsWith('SELECT id,user_id,author_name'))return{rows:replies.slice().reverse()};
  if(sql.startsWith('SELECT st.*'))return{rows:ticket?[ticket]:[]};
  throw Error('Unexpected query: '+sql);
 };
 const db={query,connect:async()=>({query,release(){}})};
 const service=createService({db,now:()=>NOW,env:{WHATSAPP_PHONE_NUMBER_ID:'expected'},send:async x=>{sent.push(x);return{success:true,messageId:'out'+sent.length};},notify:async(...x)=>notifications.set(x[0]+':'+x[5],x),audit:async x=>audits.push(x)});
 const incoming=(id='in1',number='expected',text='I need a human to help with payment')=>service.webhook({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:number},messages:[{id,from:'2348030000000',timestamp:String(NOW/1000),type:'text',text:{body:text}}]}}]}]});
 return {service,incoming,replies,notifications,sent,calls,audits,get ticket(){return ticket;}};
}
test('WhatsApp window is strictly 24 hours; future timestamps and app messages do not open it',()=>{assert.equal(windowOpen(NOW-86399999,NOW),true);assert.equal(windowOpen(NOW-86400000,NOW),false);assert.equal(windowOpen(NOW+1,NOW),false);assert.equal(windowOpen(undefined,NOW),false);});
test('Only senior support or the assigned support agent can read a WhatsApp conversation',()=>{const t={assigned_to:8};assert.equal(canAccess(senior,t),true);assert.equal(canAccess(agent,t),true);assert.equal(canAccess({...agent,id:9},t),false);assert.equal(canAccess({id:8,user_type:'tenant'},t),false);assert.equal(canAccess({id:8,user_type:'financial_admin'},t),false);});
test('Manual policy rejects automation, tags and marketing payloads',()=>{const t={whatsapp_last_inbound_at:new Date(NOW-1000),status:'open',whatsapp_mode:'human'};for(const extra of [{human_confirmed:false},{purpose:'marketing'},{automated:true},{tag:'HUMAN_AGENT'},{campaign_id:1},{message:'Buy now with a discount'}])assert.throws(()=>manualPolicy(t,{...body,...extra},NOW));assert.equal(manualPolicy(t,body,NOW),body.message);});
test('Paused or closed conversations cannot send replies',()=>{for(const extra of [{whatsapp_mode:'paused'},{status:'closed'},{whatsapp_last_inbound_at:new Date(NOW-86400000)}])assert.throws(()=>manualPolicy({status:'open',whatsapp_mode:'human',whatsapp_last_inbound_at:new Date(NOW),...extra},body,NOW));});
test('Incoming customer message reuses support tickets; duplicates do not create extra replies or notifications',async()=>{const f=fixture();await f.incoming();await f.incoming();assert.equal(f.replies.length,1);assert.equal(f.notifications.size,1);assert.equal(f.ticket.user_id,44);assert.equal(f.sent.length,0);assert.equal(f.ticket.whatsapp_mode,'human');});
test('Only the configured WhatsApp phone ID is processed',async()=>{const f=fixture();await f.incoming('in1','other');assert.equal(f.ticket,null);assert.equal(f.replies.length,0);});
test('Ambiguous verified-phone matches stay unidentified',async()=>{const f=fixture({matches:[{id:44},{id:45}]});await f.incoming();assert.equal(f.ticket.user_id,null);});
test('Unverified or unknown phone stays unidentified',async()=>{const f=fixture({matches:[]});await f.incoming();assert.equal(f.ticket.user_id,null);});
test('STOP and subscription commands do not create support conversations or auto replies',async()=>{for(const text of ['STOP','unsubscribe!','START']){const f=fixture();await f.incoming('in1','expected',text);assert.equal(f.ticket,null);assert.equal(f.sent.length,0);}assert.equal(optedCommand('Stop messages.'),true);});
test('Authorised manual reply uses the existing WhatsApp sender and a support correlation tag, not HUMAN_AGENT',async()=>{const f=fixture();await f.incoming();const r=await f.service.reply(agent,1,body);assert.equal(r.success,true);assert.equal(f.sent.length,1);assert.match(f.sent[0].message,/RentalHub human support:/);assert.match(f.sent[0].callbackData,/^arh_support_/);assert.equal(f.audits[0].action,'WHATSAPP_HUMAN_REPLY_SENT');});
test('Retrying the same send cannot send twice',async()=>{const f=fixture();await f.incoming();await f.service.reply(agent,1,body);const r=await f.service.reply(agent,1,body);assert.equal(f.sent.length,1);assert.equal(r.replayed,true);});
test('Opted out customers cannot receive manual messages',async()=>{const f=fixture({optedOut:true});await f.incoming();await assert.rejects(f.service.reply(agent,1,body),/opted out/);assert.equal(f.sent.length,0);});
test('Another customer cannot list or read WhatsApp support',async()=>{const f=fixture();await f.incoming();await assert.rejects(f.service.list({id:44,user_type:'tenant'}),/staff access/);await assert.rejects(f.service.history({id:44,user_type:'tenant'},1),/staff access/);});
test('Staff response payload masks phone and identifies AI as paused',async()=>{const f=fixture();await f.incoming();const r=await f.service.history(agent,1);assert.equal(r.ticket.whatsapp_phone,undefined);assert.equal(r.ticket.phone_hint,'••••0000');assert.equal(r.ticket.ai_paused,true);assert.equal(r.ticket.window_open,true);});

test('The real notification helper skips push dispatch when a deduplication key already exists',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let pushes=0,inserts=0;const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../config/utils/notificationService'),'utf8'),{module,exports:module.exports,process:{env:{NODE_ENV:"test"}},console,Promise,Number,String,Math,require:name=>name.includes('database')?{query:async(sql,args)=>{assert.match(sql,/ON CONFLICT/);assert.equal(args[5],'wa:inbound:4');return{rows:inserts++===0?[{id:1}]:[]};}}:name.includes('pushNotificationService')?{sendPushToUser:async()=>{pushes++;}}:name.includes('unreadActivityService')?{getPushBadgeCount:async()=>1}:name.includes('logger')?{warn(){},error(){}}:(()=>{throw Error(name);})()});
 const args=[44,'whatsapp_support','Support','New reply','/support','wa:inbound:4'];await module.exports.createNotification(...args);await module.exports.createNotification(...args);assert.equal(pushes,1);
});
