const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require.resolve('../../services/adminService'),'utf8');
test('admin schema readiness does not replace migration-managed role constraints or drop views',async()=>{
 const start=source.indexOf('const ensureAdminRoleSchema ='),end=source.indexOf('const ensurePropertyOperationSchema',start);
 const calls=[];const scope={db:{query:async sql=>{calls.push(sql);}},adminRoleSchemaReady:false};
 vm.runInNewContext(source.slice(start,end)+';this.ensure=ensureAdminRoleSchema;',scope);
 await scope.ensure();await scope.ensure();assert.equal(calls.length,1);
 assert.doesNotMatch(calls[0],/DROP CONSTRAINT|ADD CONSTRAINT|DROP VIEW|ALTER COLUMN user_type/);
 assert.match(calls[0],/ADD COLUMN IF NOT EXISTS is_lead/);
});
test('successful admin creation explicitly reports success to web and native clients',async()=>{
 const start=source.indexOf('exports.createAdmin ='),end=source.indexOf('// PATCH /api/admin/properties/:id/unlist',start);
 const calls=[],exports={};const scope={exports,ensureAdminRoleSchema:async()=>{},ensureLawyerScopeSchema:async()=>{},
 CREATABLE_ADMIN_ROLES:['recruitment_admin'],canonicalZone:()=>null,requireActiveTerritory:async()=>{},releaseDeletedUserIdentityConflicts:async()=>{},
 bcrypt:{genSalt:async()=>'',hash:async()=> 'test-hash'},db:{query:async(sql,params)=>{calls.push({sql,params});return{rows:[{id:12,user_type:'recruitment_admin',approval_status:'pending'}]};}},
 require:()=>({log:async()=>{}})};
 vm.runInNewContext(source.slice(start,end),scope);
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 await exports.createAdmin({body:{full_name:'Test Admin',email:'test@example.invalid',phone:'+2348000000000',password:'test-password',user_type:'recruitment_admin'},user:{id:1},logger:{error(){},warn(){}}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.success,true);assert.equal(res.body.pending_approval,true);assert.equal(res.body.admin.id,12);
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO users')).length,1);
});
test('photo SQL binds repeated values consistently and uses the same gallery lock name',()=>{
 const s=fs.readFileSync(require.resolve('../../services/identityPhotoService'),'utf8');
 assert.match(s,/SELECT \$1::integer,\$2::varchar,\$3::integer,\$4::varchar WHERE NOT EXISTS/);
 assert.match(s,/VALUES\(\$1,\$2,\$3::varchar,CASE WHEN \$3::varchar/);
 const acquire=s.match(/pg_try_advisory_lock\(hashtext\('([^']+)'\)/)[1];
 const release=s.match(/pg_advisory_unlock\(hashtext\('([^']+)'\)/)[1];assert.equal(acquire,release);
});

test('new role migration preserves existing users and permits every offered admin role',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const pg=await PGlite.create();
 try{
  await pg.exec("CREATE TABLE users(id SERIAL PRIMARY KEY,user_type VARCHAR(50),CONSTRAINT users_user_type_check CHECK(user_type IN ('tenant','landlord','admin')),CONSTRAINT preserved_check CHECK(id>0));INSERT INTO users(user_type) VALUES('tenant'),('landlord'),('admin');");
  await pg.exec(fs.readFileSync(require('path').join(__dirname,'../../migrations/2053_admin_creation_role_validation.sql'),'utf8'));
  const roles=require('../../config/utils/roleHierarchy').CREATABLE_ADMIN_ROLES;
  for(const role of roles)await pg.query('INSERT INTO users(user_type) VALUES($1)',[role]);
  assert.deepEqual((await pg.query('SELECT user_type FROM users WHERE id<=3 ORDER BY id')).rows.map(r=>r.user_type),['tenant','landlord','admin']);
  assert.equal((await pg.query("SELECT conname FROM pg_constraint WHERE conname='preserved_check'")).rows.length,1);
  await assert.rejects(pg.query("INSERT INTO users(user_type) VALUES('made_up_admin')"),{code:'23514'});
 }finally{await pg.close();}
});
