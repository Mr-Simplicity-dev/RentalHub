const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=path.join(__dirname,'../services/propertyUpdateService.js');
const owner={id:10,user_type:'landlord'},admin={id:20,user_type:'super_admin'};
const property={id:7,landlord_id:10,title:'Original',description:'Original description',amenities:['parking'],structured_features:{},state_id:1,lga_name:'Ikeja'};
const fixture=(options={})=>{
 const queries=[],audits=[],notifications=[];
 const query=async(sql,params)=>{queries.push({sql,params});if(options.query)return options.query(sql,params);if(sql.startsWith('SELECT * FROM properties'))return{rows:[property]};if(sql.startsWith('SELECT id FROM property_update_requests'))return{rows:[]};if(sql.startsWith('INSERT INTO property_update_requests'))return{rows:[{id:3}]};return{rows:[]};};
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{module:mod,exports:mod.exports,require:id=>{
   if(id==='../config/middleware/database')return{query,connect:async()=>({query,release(){}})};
   if(id==='../config/utils/agentSystem')return{getPropertyManagerContext:async()=>({authorized:options.authorized!==false,landlordUserId:10})};
   if(id==='./activityLogger')return{log:async e=>audits.push(e)};
   if(id==='./notificationService')return{sendNotification:async(...args)=>notifications.push(args)};
   if(id==='util')return{isDeepStrictEqual:(a,b)=>require('util').isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)))};
   return require(require.resolve(id,{paths:[path.dirname(source)]}));
 }},{filename:source});
 return{service:mod.exports,queries,audits,notifications};
};
test('submission records a pending revision and never overwrites published property',async()=>{
 const {service,queries}=fixture();
 await service.submit(owner,7,{description:'Borehole now works',amenities:['water'],reason:'A shared borehole has been installed'});
 assert.equal(queries.some(q=>q.sql.startsWith('UPDATE properties')),false);
 const insert=queries.find(q=>q.sql.startsWith('INSERT INTO property_update_requests'));
 assert.equal(JSON.parse(insert.params[2]).description,'Original description');
 assert.equal(JSON.parse(insert.params[3]).description,'Borehole now works');
 assert.equal(JSON.parse(insert.params[3]).title,'Original');
});
test('unassigned user cannot read or submit property revisions',async()=>{
 const {service,queries}=fixture({authorized:false});
 await assert.rejects(service.history(owner,7),/access/i);
 await assert.rejects(service.submit(owner,7,{description:'changed',reason:'new borehole'}),/access/i);
 assert.equal(queries.length,0);
});
test('client cannot change verification, owner, status or approval outcome',()=>{
 const {service}=fixture();const values=service.normalize({description:'new description',landlord_id:99,is_verified:true,status:'approved',reviewed_by:99});
 assert.deepEqual(Object.keys(values),['description']);
});
test('invalid amenity and feature payloads fail validation',()=>{
 const {service}=fixture();for(const payload of [{amenities:'water'},{amenities:[{}]},{structured_features:[]},{description:''},{rent_amount:-1},{latitude:91},{title:'x'.repeat(256)}])assert.throws(()=>service.normalize(payload));
 assert.equal(service.normalize({structured_features:{borehole:{available:true,details:{type:'shared',availabilityType:'scheduled'}}}}).structured_features.borehole.available,true);
});
test('submission requires a reason and rejects an existing pending request',async()=>{
 const {service}=fixture();await assert.rejects(service.submit(owner,7,{description:'new'}),/Explain/);
 const second=fixture({query:async sql=>({rows:sql.startsWith('SELECT * FROM properties')?[property]:sql.startsWith('SELECT id FROM property_update_requests')?[{id:3}]:[]})});
 await assert.rejects(second.service.submit(owner,7,{description:'new',reason:'A new feature'}),/awaiting approval/);
});
const reviewFixture=(overrides={})=>{
 const base=fixture().service.snapshot(property),proposal={...base,description:'New borehole',amenities:['water']};
 const request={id:3,submitted_by:10,before_data:base,proposed_data:proposal};
 return fixture({query:async(sql)=>{
  if(sql.startsWith('SELECT * FROM properties'))return{rows:overrides.denied?[]:[overrides.property||property]};
  if(sql.startsWith('SELECT * FROM property_update_requests'))return{rows:overrides.noRequest?[]:[{...request,...overrides.request}]};
  return{rows:[]};
 }});
};
test('approval applies only stored fields and records reviewer transactionally',async()=>{
 const {service,queries,notifications}=reviewFixture();
 await service.review(admin,7,3,{decision:'approved',note:'Evidence checked',description:'attacker content'},{clause:'',params:[]});
 const update=queries.find(q=>q.sql.startsWith('UPDATE properties'));
 assert.ok(update);assert.equal(update.params[0],'New borehole');assert.equal(update.sql.includes('is_verified'),false);
 assert.ok(queries.find(q=>q.sql.startsWith('UPDATE property_update_requests')).params.includes(20));
 assert.equal(queries.at(-1).sql,'COMMIT');assert.equal(notifications[0][0],10);
});
test('rejection stores reason without modifying the listing',async()=>{
 const {service,queries}=reviewFixture();await service.review(admin,7,3,{decision:'rejected',note:'Please clarify water availability'},{clause:'',params:[]});
 assert.equal(queries.some(q=>q.sql.startsWith('UPDATE properties')),false);
});
test('stale versions, reviewed requests and self-approval are rejected',async()=>{
 for(const [options,actor,message] of [[{property:{...property,title:'Changed elsewhere'}},admin,/changed after/],[{noRequest:true},admin,/already been/],[{},owner,/Another authorized/]]){
  const {service,queries}=reviewFixture(options);await assert.rejects(service.review(actor,7,3,{decision:'approved',note:'Approved by staff'},{clause:'',params:[]}),message);assert.equal(queries.some(q=>q.sql.startsWith('UPDATE properties')),false);
 }
});
test('review uses territory filter and refuses out-of-scope property',async()=>{
 const {service,queries}=reviewFixture({denied:true});await assert.rejects(service.review(admin,7,3,{decision:'approved',note:'Evidence checked'},{clause:'AND state_id=$1',params:[1]}),/outside/);
 assert.match(queries.find(q=>q.sql.startsWith('SELECT * FROM properties')).sql,/AND state_id=\$1 AND id=\$2 FOR UPDATE/);
});
test('withdrawal can only change a pending request belonging to the owned property',async()=>{
 const {service,queries}=fixture({query:async sql=>({rows:sql.startsWith('SELECT id FROM properties')||sql.startsWith('UPDATE property_update_requests')?[{id:3}]:[]})});
 await service.cancel(owner,7,3);const statement=queries.find(q=>q.sql.startsWith('UPDATE property_update_requests'));assert.match(statement.sql,/property_id=\$2 AND status='pending'/);
});
test('the legacy PUT endpoint delegates to approvals and admin endpoints require admin roles',()=>{
 const service=fs.readFileSync(path.join(__dirname,'../services/propertyService.js'),'utf8');
 assert.match(service,/exports.updateProperty = require\('\.\/propertyUpdateService'\)\.handler/);
 const routes=fs.readFileSync(path.join(__dirname,'../routes/admin.js'),'utf8');assert.match(routes,/router.patch\('\/properties\/:id\/updates\/:requestId', requireAdminOrSuperAdmin/);
});
