const test=require('node:test');
const {after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.NODE_ENV='test';
const db=require('../config/middleware/database');
const axios=require('axios');
const mailer=require('../config/utils/mailer');
const audit=require('../config/utils/auditLogger');
const originalMail=mailer.sendEmail,originalAudit=audit.logAction;
let emails=[],audits=[];
mailer.sendEmail=async payload=>{emails.push(payload);};
audit.logAction=async payload=>{audits.push(payload);};
const service=require('../services/recruitmentService');
after(()=>{mailer.sendEmail=originalMail;audit.logAction=originalAudit;});
const logger={error:()=>{},warn:()=>{}};
const payload={role_id:9,full_name:'Volunteer Applicant',phone_number:'08012345678',email_address:'applicant@example.test',state_name:'Abuja',lga_name:'Gwagwalada',area_locality:'Kutunku',residential_address:'Local address',highest_education:'University',suitability_reason:'Relevant community experience',volunteer_motivation:'Support the community',availability:'Saturdays, 4 hours'};
const role={id:9,cycle_id:2,title:'Community Representative',type:'Administrative',opportunity_type:'volunteer',application_fee:0,premium_fee:0};
const result=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
function mock(t,{settings={is_active:false,volunteer_applications_enabled:true},selected=role,application,locations=0}={}){
 const originalQuery=db.query,originalPost=axios.post;const queries=[],gateway=[];emails=[];audits=[];
 t.after(()=>{db.query=originalQuery;axios.post=originalPost;});
 db.query=async(text,params=[])=>{
  queries.push({text,params});
  if(text.includes('INSERT INTO recruitment_settings'))return{rows:[]};
  if(text.includes('SELECT * FROM recruitment_settings'))return{rows:[settings]};
  if(text.includes('SELECT user_type'))return{rows:[{user_type:'super_admin'}]};
  if(text.includes('SELECT id FROM users'))return{rows:[]};
  if(text.includes('FROM recruitment_roles r')&&text.includes('WHERE r.id = $1'))return{rows:selected?[selected]:[]};
  if(text.includes('FROM recruitment_location_activation'))return{rows:text.includes('COUNT')?[{count:locations}]:[]};
  if(text.includes('INSERT INTO recruitment_applications'))return{rows:[{id:123,cycle_id:params[0],role_id:params[1],full_name:params[2],phone_number:params[3],email_address:params[4],state_name:params[5],lga_name:params[6],application_fee:params[15],application_track:params[16],reference_number:params[17],status:params[18],payment_status:params[19],volunteer_motivation:params[20],availability:params[21]}]};
  if(application&&text.includes('FROM recruitment_applications a')&&text.includes('WHERE a.id'))return{rows:[application]};
  return{rows:[]};
 };
 axios.post=async(url,body)=>{gateway.push({url,body});return{data:{data:{authorization_url:'https://checkout.paystack.com/example',reference:body.reference}}};};
 return{queries,gateway};
}
const req=(body=payload)=>({body,query:{},params:{},logger});
test('volunteer OFF rejects submissions even with forged payment and opportunity fields',async t=>{
 const m=mock(t,{settings:{is_active:true,volunteer_applications_enabled:false}});const res=result();
 await service.createApplication(req({...payload,opportunity_type:'employment',payment_status:'paid',application_fee:0}),res);
 assert.equal(res.statusCode,403);assert.match(res.body.message,/volunteer.*closed/i);assert.equal(m.gateway.length,0);assert.ok(!m.queries.some(q=>q.text.includes('INSERT INTO recruitment_applications')));
});
test('volunteer ON with employment OFF submits directly, fee zero, standard track, no account or gateway',async t=>{
 const m=mock(t);const res=result();await service.createApplication(req({...payload,application_track:'premium',application_fee:9999,payment_status:'paid',user_type:'super_admin'}),res);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(res.statusCode,201);assert.equal(res.body.data.status,'submitted');assert.equal(res.body.data.payment_status,'not_applicable');assert.equal(res.body.data.application_fee,0);assert.equal(res.body.data.application_track,'standard');assert.equal(res.body.data.opportunity_type,'volunteer');assert.match(res.body.data.reference_number,/^ARH-APP-/);assert.equal(m.gateway.length,0);
 assert.ok(!m.queries.some(q=>/INSERT INTO users|UPDATE users|INSERT INTO.*interview_assignments|access_code =/i.test(q.text)));
 assert.equal(res.body.data.access_code,undefined);assert.equal(res.body.data.token,undefined);assert.equal(emails.length,1);assert.match(emails[0].subject,/Volunteer Application Received/);
});
test('inactive or closed-cycle opportunities cannot receive volunteer applications',async t=>{
 const m=mock(t,{selected:null});const res=result();await service.createApplication(req(),res);assert.equal(res.statusCode,404);
 const sql=m.queries.find(q=>q.text.includes('WHERE r.id = $1')).text;assert.match(sql,/r.is_active = TRUE/);assert.match(sql,/c.is_active = TRUE/);assert.match(sql,/c.open_date <= CURRENT_DATE/);assert.ok(sql.includes('COALESCE(c.extension_date, c.close_date) >= CURRENT_DATE'));
});
test('volunteer motivation and availability are required, and location restrictions still apply',async t=>{
 mock(t,{locations:1});let res=result();await service.createApplication(req({...payload,availability:''}),res);assert.equal(res.statusCode,400);
 res=result();await service.createApplication(req(),res);assert.equal(res.statusCode,403);assert.match(res.body.message,/state and local government/i);
});
test('forged volunteer request cannot bypass employment fee or the employment master toggle',async t=>{
 mock(t,{selected:{...role,opportunity_type:'employment',application_fee:'5000',premium_fee:'8000'},settings:{is_active:true,volunteer_applications_enabled:false}});
 const res=result();await service.createApplication(req({...payload,opportunity_type:'volunteer',application_fee:0,payment_status:'not_applicable'}),res);
 assert.equal(res.statusCode,201);assert.equal(res.body.data.application_fee,5000);assert.equal(res.body.data.status,'draft');assert.equal(res.body.data.payment_status,'pending');assert.equal(res.body.data.opportunity_type,'employment');
});
test('employment OFF blocks employment even when volunteer intake is ON',async t=>{
 mock(t,{selected:{...role,opportunity_type:'employment'}});const res=result();await service.createApplication(req({...payload,opportunity_type:'volunteer'}),res);assert.equal(res.statusCode,403);
});
test('all four independent-toggle combinations filter active public opportunities',async t=>{
 const original=db.query;t.after(()=>{db.query=original;});
 for(const employment of [false,true])for(const volunteer of [false,true]){
  db.query=async(text,params)=>{
   if(text.includes('INSERT INTO recruitment_settings'))return{rows:[]};
   if(text.includes('SELECT * FROM recruitment_settings'))return{rows:[{is_active:employment,volunteer_applications_enabled:volunteer}]};
   assert.deepEqual(params,[employment,volunteer,2]);assert.match(text,/c.open_date <= CURRENT_DATE/);assert.match(text,/r.opportunity_type = 'volunteer' AND \$2::boolean/);
   return{rows:[...(employment?[{...role,opportunity_type:'employment'}]:[]),...(volunteer?[role]:[])]};
  };
  const res=result();await service.getActiveRoles({...req(),query:{cycle_id:2}},res);assert.equal(res.body.data.length,Number(employment)+Number(volunteer));
 }
});
test('a direct volunteer payment request is rejected before Paystack, even with no gateway key',async t=>{
 const application={...role,id:123,email_address:payload.email_address,reference_number:'ARH-APP-'+ 'A'.repeat(32),payment_status:'not_applicable'};
 const m=mock(t,{application});const old=process.env.PAYSTACK_SECRET_KEY;delete process.env.PAYSTACK_SECRET_KEY;t.after(()=>{if(old!==undefined)process.env.PAYSTACK_SECRET_KEY=old;});
 const res=result();await service.initiatePayment(req({application_id:123,applicant_email:application.email_address,reference_number:application.reference_number,amount:5000}),res);
 assert.equal(res.statusCode,400);assert.match(res.body.message,/free/);assert.equal(m.gateway.length,0);
});
test('employment payment initializes using stored fees rather than client amount or type',async t=>{
 const application={id:123,opportunity_type:'employment',application_fee:'5000',email_address:payload.email_address,reference_number:'ARH-APP-'+ 'B'.repeat(32),payment_status:'pending'};
 const m=mock(t,{application});const old=process.env.PAYSTACK_SECRET_KEY;process.env.PAYSTACK_SECRET_KEY='test';t.after(()=>{if(old===undefined)delete process.env.PAYSTACK_SECRET_KEY;else process.env.PAYSTACK_SECRET_KEY=old;});
 const res=result();await service.initiatePayment(req({application_id:123,applicant_email:application.email_address,reference_number:application.reference_number,amount:0,opportunity_type:'volunteer'}),res);
 assert.equal(res.statusCode,200);assert.equal(m.gateway.length,1);assert.equal(m.gateway[0].body.amount,500000);
});
test('only Super Admin can persist the volunteer setting; changes use existing audit conventions',async t=>{
 const original=db.query;const queries=[];t.after(()=>{db.query=original;});
 db.query=async(text,params)=>{queries.push({text,params});return{rows:text.startsWith('UPDATE')?[{id:1,volunteer_applications_enabled:params[0]}]:[]};};
 for(const user of [undefined,{id:2,user_type:'tenant'},{id:3,user_type:'recruitment_admin'}]){
  const res=result();await service.toggleVolunteerApplications({...req({volunteer_applications_enabled:true}),user},res);assert.equal(res.statusCode,403);
 }
 assert.equal(queries.length,0);
 for(const enabled of [false,true]){const res=result();await service.toggleVolunteerApplications({...req({volunteer_applications_enabled:enabled}),user:{id:1,user_type:'super_admin'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.data.volunteer_applications_enabled,enabled);}
 assert.ok(queries.some(q=>q.text.includes('UPDATE recruitment_settings')&&q.params[0]===true));assert.ok(audits.some(a=>a.action==='VOLUNTEER_APPLICATIONS_ENABLED'));assert.ok(audits.some(a=>a.action==='VOLUNTEER_APPLICATIONS_DISABLED'));
});
test('volunteer role creation ignores requested fees and audits the created opportunity',async t=>{
 const original=db.query;let inserted;t.after(()=>{db.query=original;});db.query=async(text,params)=>{if(text.includes('SELECT user_type'))return{rows:[{user_type:'super_admin'}]};inserted={text,params};return{rows:[{id:7}]};};
 const res=result();await service.createRole({...req({...role,application_fee:5000,premium_fee:9000}),user:{id:1}},res);assert.equal(res.statusCode,201);assert.deepEqual(inserted.params.slice(3,5),[0,0]);assert.ok(audits.some(a=>a.action==='VOLUNTEER_OPPORTUNITY_CREATED'));
});
test('existing opportunities cannot be reclassified to bypass historical employment payment rules',async t=>{
 const original=db.query;t.after(()=>{db.query=original;});db.query=async text=>({rows:text.includes('SELECT user_type')?[{user_type:'super_admin'}]:[{...role,opportunity_type:'employment'}]});
 const res=result();await service.updateRole({...req({opportunity_type:'volunteer'}),params:{id:9},user:{id:1}},res);assert.equal(res.statusCode,409);
});
test('admin opportunity filtering uses a SQL parameter and exposes the authoritative type',async t=>{
 const m=mock(t);const res=result();await service.getApplicants({...req(),user:{id:1,user_type:'super_admin'},query:{opportunity_type:'volunteer'}},res);
 const query=m.queries.find(q=>q.text.includes('SELECT a.*,')&&q.text.includes('ORDER BY a.created_at'));assert.ok(query);assert.match(query.text,/r.opportunity_type = \$1/);assert.equal(query.params[0],'volunteer');assert.match(query.text,/r.opportunity_type,/);
});
test('analytics excludes volunteers from employment revenue and reports volunteer role/status/location totals',async t=>{
 const original=db.query;const queries=[];t.after(()=>{db.query=original;});db.query=async(text,params)=>{queries.push({text,params});if(text.includes('SELECT user_type'))return{rows:[{user_type:'super_admin'}]};if(text.includes('r.id AS role_id'))return{rows:[{opportunity_type:'volunteer',role_id:9,title:role.title,status:'submitted',state_name:'Abuja',lga_name:'Gwagwalada',count:3}]};return{rows:[]};};
 const res=result();await service.getAnalytics({...req(),user:{id:1,user_type:'super_admin'},query:{opportunity_type:'volunteer'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.data.volunteer_applicants,3);assert.equal(res.body.data.volunteer_by_role[0].count,3);assert.equal(res.body.data.volunteer_by_status[0].status,'submitted');assert.equal(res.body.data.volunteer_by_location[0].lga_name,'Gwagwalada');
 for(const q of queries.filter(q=>q.text.includes('SUM(')))assert.match(q.text,/r.opportunity_type = 'employment'/);
 assert.ok(queries.filter(q=>q.text.includes('FROM recruitment_applications')).every(q=>q.params[0]==='volunteer'));
});
test('optional volunteer CV uploads still require applicant credentials and a reviewable application',async t=>{
 const original=db.query;t.after(()=>{db.query=original;});const app={id:123,opportunity_type:'volunteer',status:'submitted',email_address:payload.email_address,reference_number:'ARH-APP-'+ 'C'.repeat(32)};db.query=async()=>({rows:[app]});
 let next=false;let res=result();await service.authorizeDocumentUpload({...req(),params:{applicationId:123}},res,()=>{next=true;});assert.equal(res.statusCode,403);assert.equal(next,false);
 res=result();await service.authorizeDocumentUpload({...req(),params:{applicationId:123},query:{email:app.email_address,reference_number:app.reference_number}},res,()=>{next=true;});assert.equal(next,true);
});
test('migration preserves employment defaults, supports not-applicable payment, and enforces free volunteer records',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/2028_recruitment_volunteer_workflow.sql'),'utf8');
 assert.match(sql,/DEFAULT 'employment'/);assert.match(sql,/SET NOT NULL/);assert.ok(sql.includes("opportunity_type IN ('employment', 'volunteer')"));assert.match(sql,/NEW.application_fee := 0/);assert.match(sql,/NEW.payment_status := 'not_applicable'/);assert.match(sql,/BEFORE INSERT OR UPDATE ON recruitment_applications/);assert.doesNotMatch(sql,/CREATE TABLE|DELETE FROM|DROP TABLE/i);
 const routes=fs.readFileSync(path.join(__dirname,'../routes/recruitment.js'),'utf8');assert.ok(routes.indexOf("router.use('/admin', authenticate, requireRecruitmentAdmin)")<routes.indexOf("router.put('/admin/settings/volunteers'"));assert.ok(routes.includes("requireTurnstile('rentalhub_careers')"));
});
