const test=require('node:test'),assert=require('node:assert/strict');const service=require('../services/callSoundService');
const policy=service.DEFAULT_POLICY;
const db=(preferences={},global=null)=>({query:async sql=>sql.includes('app_settings')?{rows:global?[{value:global}]:[]}:{rows:[{preferences}]}});
test('normal sound is the default and no religion information is read',async()=>{
 const value=await service.settings({id:1,user_type:'recruitment_admin'},db());assert.equal(value.preference,'normal');assert.equal(value.effectiveSound,'normal');assert.equal(value.isWorker,true);assert.equal(JSON.stringify(value).includes('religion'),false);
});
test('spoken greeting is explicit, worker-only and respects both global controls',()=>{
 assert.equal(service.resolveSound(policy,'greeting',true),'greeting');assert.equal(service.resolveSound(policy,'greeting',false),'normal');assert.equal(service.resolveSound({...policy,greetingEnabled:false},'greeting',true),'normal');assert.equal(service.resolveSound({...policy,enabled:false},'greeting',true),'silent');assert.equal(service.resolveSound(policy,'silent',true),'silent');
});
test('personal choice is validated and saved without replacing other notification preferences',async()=>{
 let sql='',params;const q={query:async(s,p)=>{if(s.startsWith('INSERT')){sql=s;params=p;}return{rows:s.includes('SELECT preferences')?[{preferences:{incomingCallSound:'greeting'}}]:[]};}};
 await service.savePreference({id:17,user_type:'marketing_agent'},'greeting',q);assert.match(sql,/preferences=user_notification_preferences.preferences \|\| EXCLUDED.preferences/);assert.deepEqual(params,[17,'greeting']);await assert.rejects(service.savePreference({id:17,user_type:'tenant'},'greeting',q),/available/);await assert.rejects(service.savePreference({id:17,user_type:'super_admin'},'arbitrary',q),/available/);
});
test('recovery rejects another recipient, expired and ended calls',()=>{
 const call={id:'call-a',caller:{id:1},receiver:{id:2},status:'ringing',callType:'audio',createdAt:new Date().toISOString()};assert.equal(service.recoverInvitation(call,2).callId,'call-a');assert.equal(service.recoverInvitation(call,1),null);assert.equal(service.recoverInvitation({...call,status:'accepted'},2),null);assert.equal(service.recoverInvitation({...call,createdAt:'2000-01-01T00:00:00Z'},2),null);
});
test('incoming push uses a short TTL, custom channels and no unread badge or contact details',async()=>{
 let sent;const call={id:'a',createdAt:new Date().toISOString()};const q={query:async sql=>sql.includes('call_sessions')?{rows:[{status:'ringing'}]}:sql.includes('app_settings')?{rows:[]}:{rows:[{preferences:{incomingCallSound:'greeting'}}]}};
 await service.notifyIncoming(call,{id:3,user_type:'recruitment_admin'},{q,signAlert:()=> 'isolated-test-alert',sendPush:async(id,notification)=>{sent={id,notification};}});assert.equal(sent.id,3);assert.equal(sent.notification.sound,'call_greeting.wav');assert.equal(sent.notification.channelId,'calls-greeting-v1');assert.ok(sent.notification.ttl<=45);assert.equal(sent.notification.badge,undefined);assert.equal(sent.notification.data.type,'incoming_call');assert.equal(sent.notification.data.email,undefined);
 let count=0;await service.notifyIncoming({...call,createdAt:'2000-01-01T00:00:00Z'},{id:3},{q,sendPush:async()=>count++});assert.equal(count,0);
});
test('ordinary preference updates retain call choice and only Super Admin can change policy',()=>{
 const fs=require('fs');const route=fs.readFileSync(require.resolve('../routes/callSounds'),'utf8');assert.match(route,/router.use\(authenticate/);assert.match(route,/router.patch\('\/call-sounds\/admin',requireSuperAdmin/);assert.match(route,/CALL_SOUND_POLICY_UPDATED/);assert.match(fs.readFileSync(require.resolve('../routes/notifications'),'utf8'),/user_notification_preferences.preferences \|\| EXCLUDED.preferences/);
});

test('the actual Super Admin guard rejects a worker before any policy write',async()=>{
 const guard=require('../config/middleware/auth').requireSuperAdmin;let code,next=false;
 const res={status(value){code=value;return this;},json(){return this;}};
 await guard({user:{id:7,user_type:'recruitment_admin'}},res,()=>{next=true;});assert.equal(code,403);assert.equal(next,false);
 const router=require('../routes/callSounds');const admin=router.stack.find(layer=>layer.route?.path==='/call-sounds/admin');assert.ok(admin.route.stack.some(layer=>layer.handle===guard));
});
test('a call accepted before push delivery is not sent as a new invitation',async()=>{
 let sent=0;const q={query:async sql=>sql.includes('call_sessions')?{rows:[{status:'accepted'}]}:{rows:[]}};
 await service.notifyIncoming({id:'ended',createdAt:new Date().toISOString()},{id:3,user_type:'recruitment_admin'},{q,sendPush:async()=>sent++});assert.equal(sent,0);
});
