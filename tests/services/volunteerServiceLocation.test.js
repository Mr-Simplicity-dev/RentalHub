const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {getServicePreference}=require('../../services/volunteerServiceLocation');
const {VOLUNTEER_OPPORTUNITY_TEMPLATES,FCT_VOLUNTEER_OPPORTUNITIES}=require('../../services/volunteerOpportunityCatalog');
const locations=require('../../data/nigeriaLocations');
test('six new opportunities cover all six FCT councils without replacing the original eight',()=>{
 assert.equal(FCT_VOLUNTEER_OPPORTUNITIES.length,6);assert.equal(VOLUNTEER_OPPORTUNITY_TEMPLATES.length,14);
 for(const role of FCT_VOLUNTEER_OPPORTUNITIES)for(const lga of locations.find(s=>s.state==='FCT').lgas){assert.equal(role.service_state,'FCT');assert.equal(getServicePreference({...role,opportunity_type:'volunteer'},{preferred_service_state:'Federal Capital Territory',preferred_service_lga:lga}).lga,lga);}
 for(const role of VOLUNTEER_OPPORTUNITY_TEMPLATES)assert.doesNotMatch(role.description,/but create a staff|but create a.*admin account/);
});
test('FCT-only roles reject another state and cannot be bypassed by a client type flag',()=>{
 const role={opportunity_type:'volunteer',service_state:'FCT'};
 assert.throws(()=>getServicePreference(role,{preferred_service_state:'Lagos',preferred_service_lga:'Ikeja',opportunity_type:'employment'}),/FCT only/);
 assert.throws(()=>getServicePreference(role,{preferred_service_state:'Abuja',preferred_service_lga:'Ikeja'}),/valid local government/);
});
test('existing volunteers can choose any Nigerian LGA independently of residence',()=>{
 for(const state of locations){const saved=getServicePreference({opportunity_type:'volunteer'},{state_name:'Lagos',lga_name:'Ikeja',preferred_service_state:state.state,preferred_service_lga:state.lgas[0]});assert.equal(saved.state,state.displayName);assert.equal(saved.source,'applicant_choice');}
 assert.throws(()=>getServicePreference({opportunity_type:'volunteer'},{preferred_service_state:'',preferred_service_lga:''}),/Choose the state/);
 assert.equal(getServicePreference({opportunity_type:'employment'},{opportunity_type:'volunteer'}),null);
});
test('older app requests remain compatible and still obey the FCT restriction',()=>{
 assert.equal(getServicePreference({opportunity_type:'volunteer'},{state_name:'Kogi',lga_name:'Lokoja'}).source,'legacy_residence');
 assert.throws(()=>getServicePreference({opportunity_type:'volunteer',service_state:'FCT'},{state_name:'Kogi',lga_name:'Lokoja'}),/FCT only/);
});
function applicationFixture(role,settings={is_active:true,volunteer_applications_enabled:true},limited=false){
 const source=fs.readFileSync(require.resolve('../../services/recruitmentService'),'utf8'),start=source.indexOf('exports.createApplication ='),end=source.indexOf('\n};',start)+4;
 const exports={},queries=[];const policy=require('../../config/utils/languagePolicy');
 const scope={exports,getServicePreference,fetchRecruitmentStatusRow:async()=>settings,normalizeText:value=>String(value||'').trim(),isVolunteer:r=>r.opportunity_type==='volunteer',isOpportunityOpen:(r,s)=>r.opportunity_type==='volunteer'?s.volunteer_applications_enabled:s.is_active,ALL_LGAS:'__ALL__',generateReferenceNumber:()=> 'TEST-REFERENCE',stripPublicApplicationSecrets:v=>v,createRecruitmentOperation:async()=>{},notifyVolunteerApplication:async()=>{},require:name=>name.includes('languagePolicy')?policy:require(name),db:{query:async(sql,params)=>{queries.push({sql,params});if(sql.includes('SELECT r.*'))return{rows:[{id:12,cycle_id:2,application_fee:5000,premium_fee:8000,...role}]};if(sql.includes('COUNT(*)'))return{rows:[{count:limited?1:0}]};if(sql.includes('WHERE volunteer_is_active'))return{rows:locations.find(s=>s.state==='FCT').lgas.map(lga=>({state_name:'Abuja',lga_name:lga,volunteer_is_active:true}))};if(sql.includes('FROM recruitment_location_activation'))return{rows:[]};if(sql.includes('INSERT INTO recruitment_applications'))return{rows:[{id:25,application_fee:params[15],application_track:params[16],status:params[18],payment_status:params[19],preferred_service_state:params[23],preferred_service_lga:params[24]}]};throw Error('Unexpected query');}}};
 vm.runInNewContext(source.slice(start,end),scope);
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 const languages=[{language_id:policy.PIDGIN,oral:'fluent',written:'basic'},{language_id:policy.languages.find(x=>x.iso==='hau').id,oral:'fluent',written:'basic'}];
 const body={role_id:12,full_name:'Test Applicant',email_address:'test@example.invalid',phone_number:'+2348000000000',state_name:'Lagos',lga_name:'Ikeja',area_locality:'Test area',residential_address:'Test address',suitability_reason:'Experience',highest_education:'Secondary',volunteer_motivation:'To help',availability:'Weekends',preferred_service_state:'Abuja',preferred_service_lga:'Bwari',language_skills:languages,application_fee:0,payment_status:'paid',opportunity_type:'volunteer'};
 return {res,queries,run:patch=>exports.createApplication({body:{...body,...patch},logger:{error(){},warn(){}}},res)};
}
test('volunteers persist their chosen service area with zero fee and no payment state',async()=>{
 const f=applicationFixture({opportunity_type:'volunteer',service_state:'FCT'});await f.run({application_fee:99999,application_track:'premium'});assert.equal(f.res.statusCode,201);assert.equal(f.res.body.data.application_fee,0);assert.equal(f.res.body.data.application_track,'standard');assert.equal(f.res.body.data.payment_status,'not_applicable');assert.equal(f.res.body.data.status,'submitted');assert.equal(f.res.body.data.preferred_service_state,'Abuja');assert.equal(f.res.body.data.preferred_service_lga,'Bwari');
});
test('volunteer toggle blocks inserts and a forged volunteer payload cannot make employment free',async()=>{
 const closed=applicationFixture({opportunity_type:'volunteer'},{is_active:false,volunteer_applications_enabled:false});await closed.run({});assert.equal(closed.res.statusCode,403);assert.equal(closed.queries.some(q=>q.sql.includes('INSERT')),false);
 const paid=applicationFixture({opportunity_type:'employment'});await paid.run({});assert.equal(paid.res.statusCode,201);assert.equal(paid.res.body.data.application_fee,5000);assert.equal(paid.res.body.data.payment_status,'pending');assert.equal(paid.res.body.data.preferred_service_state,null);
 const outside=applicationFixture({opportunity_type:'volunteer',service_state:'FCT'});await outside.run({preferred_service_state:'Kogi',preferred_service_lga:'Lokoja'});assert.equal(outside.res.statusCode,400);assert.equal(outside.queries.some(q=>q.sql.includes('INSERT')),false);
});
test('migration preserves old applications and paid roles and seeds new roles only in an open cycle',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const pg=await PGlite.create();try{
 await pg.exec("CREATE TABLE recruitment_cycles(id INTEGER PRIMARY KEY,is_active BOOLEAN,open_date DATE,close_date DATE,extension_date DATE);CREATE TABLE recruitment_roles(id SERIAL PRIMARY KEY,title VARCHAR(255),type VARCHAR(40),description TEXT,application_fee NUMERIC,premium_fee NUMERIC,cycle_id INTEGER,opportunity_type VARCHAR(30),is_active BOOLEAN);CREATE TABLE recruitment_applications(id INTEGER PRIMARY KEY);INSERT INTO recruitment_cycles VALUES(1,TRUE,CURRENT_DATE-60,CURRENT_DATE-30,NULL),(2,TRUE,CURRENT_DATE-1,CURRENT_DATE+30,NULL);INSERT INTO recruitment_roles(title,opportunity_type,application_fee,cycle_id,description)VALUES('Paid role','employment',5000,1,'Keep this'),('Old volunteer','volunteer',0,2,'it is not anemployment offer but create a staff account.');INSERT INTO recruitment_applications VALUES(1);");
 const sql=fs.readFileSync(require('path').join(__dirname,'../../migrations/2054_volunteer_service_locations.sql'),'utf8');await pg.exec(sql);await pg.exec(sql);
 const roles=(await pg.query("SELECT * FROM recruitment_roles WHERE service_state='FCT'")).rows;assert.equal(roles.length,6);assert.ok(roles.every(r=>r.cycle_id===2&&Number(r.application_fee)===0&&Number(r.premium_fee)===0));
 assert.equal(Number((await pg.query("SELECT application_fee FROM recruitment_roles WHERE title='Paid role'")).rows[0].application_fee),5000);
 assert.match((await pg.query("SELECT description FROM recruitment_roles WHERE title='Old volunteer'")).rows[0].description,/Applying does not create a staff account/);
 assert.equal((await pg.query('SELECT preferred_service_state FROM recruitment_applications WHERE id=1')).rows[0].preferred_service_state,null);
 }finally{await pg.close();}
});
test('survey answer details show question and choice text without changing saved answers',()=>{
 const {answerDetails}=require('../../services/surveyAnswerDetails');const row={survey_type:'tenant',answers:{'T0.1':'yes',unknown:['one','two']}};const before=JSON.stringify(row);const rows=answerDetails(row);assert.match(rows[0].question,/18/);assert.equal(rows[0].answer,'Yes');assert.equal(rows[1].question,'unknown');assert.equal(rows[1].answer,'one, two');assert.equal(JSON.stringify(row),before);
});

test('volunteer location choices are independent of employment activation, which still blocks paid applications',async()=>{
 const settings={is_active:true,volunteer_applications_enabled:true};const volunteer=applicationFixture({opportunity_type:'volunteer',service_state:'FCT'},settings,true);await volunteer.run({});assert.equal(volunteer.res.statusCode,201);
 const paid=applicationFixture({opportunity_type:'employment'},settings,true);await paid.run({});assert.equal(paid.res.statusCode,403);assert.equal(paid.queries.some(q=>q.sql.includes('INSERT')),false);
});

test('database volunteer controls block closed states and allow newly opened states',()=>{
 const role={opportunity_type:'volunteer',service_state:'FCT'},body={preferred_service_state:'Lagos',preferred_service_lga:'Ikeja'};
 assert.throws(()=>getServicePreference(role,body,[]),/not open/);
 assert.equal(getServicePreference(role,body,[{state_name:'Lagos',lga_name:'Ikeja',volunteer_is_active:true}]).lga,'Ikeja');
 assert.throws(()=>getServicePreference(role,body,[{state_name:'Lagos',lga_name:'Ikeja',volunteer_is_active:false}]),/not open/);
});

test('volunteer location migration opens all FCT councils and preserves paid switches',async()=>{const {PGlite}=require('@electric-sql/pglite'),pg=await PGlite.create();try{await pg.exec("CREATE TABLE recruitment_location_activation(id SERIAL PRIMARY KEY,state_name VARCHAR(100),lga_name VARCHAR(100),is_active BOOLEAN DEFAULT FALSE,updated_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(state_name,lga_name));INSERT INTO recruitment_location_activation(state_name,lga_name,is_active)VALUES('Lagos','Ikeja',TRUE),('Abuja','Gwagwalada',TRUE);");await pg.exec(fs.readFileSync(require('path').join(__dirname,'../../migrations/2057_volunteer_location_controls.sql'),'utf8'));const rows=(await pg.query('SELECT * FROM recruitment_location_activation')).rows;assert.equal(rows.filter(r=>r.volunteer_is_active).length,6);assert.equal(rows.find(r=>r.state_name==='Lagos').volunteer_is_active,false);assert.equal(rows.filter(r=>r.is_active).length,2);}finally{await pg.close();}});
