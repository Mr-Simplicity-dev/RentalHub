// Explicit isolated PostgreSQL acceptance test. Never loads production .env.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg');
const {createService,cookieName}=require('../services/webAuthSessions');
async function main(){
 if(!process.argv.includes('--allow-isolated-test-database')||!process.env.RENTALHUB_AUTH_TEST_DATABASE_URL)throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
 const pool=new Pool({connectionString:process.env.RENTALHUB_AUTH_TEST_DATABASE_URL,max:10,connectionTimeoutMillis:5000,statement_timeout:10000,allowExitOnIdle:true});
 let admin,created=false,checks=0;
 const schema='rh_auth_test_'+crypto.randomBytes(8).toString('hex');
 const quoted='"'+schema+'"';
 try{
  admin=await pool.connect();
  const name=(await admin.query('SELECT current_database() AS name')).rows[0].name;
  if(!/(?:^test_|_test(?:_|$))/i.test(name))throw Error('TEST_DATABASE_NAME_REQUIRED');
  await admin.query('CREATE SCHEMA '+quoted);created=true;
  const connect=async()=>{const client=await pool.connect();try{await client.query('SET search_path TO '+quoted);}catch(error){client.release(true);throw error;}return client;};
  const db={connect,query:async(sql,args)=>{const client=await connect();try{return await client.query(sql,args);}finally{client.release();}}};
  await db.query("CREATE TABLE users(id INTEGER PRIMARY KEY,user_type TEXT NOT NULL,token_version INTEGER NOT NULL DEFAULT 1,is_active BOOLEAN NOT NULL DEFAULT TRUE,deleted_at TIMESTAMPTZ);CREATE TABLE google_signin_requests(id UUID PRIMARY KEY);INSERT INTO users(id,user_type)VALUES(1,'tenant'),(2,'landlord');");
  const migrationClient=await connect();
  try{await migrationClient.query(fs.readFileSync(path.join(__dirname,'../migrations/2060_web_auth_sessions.sql'),'utf8'));}catch(error){await migrationClient.query('ROLLBACK');throw error;}finally{migrationClient.release();}
  const clients=await Promise.all([connect(),connect()]);
  try{const pids=await Promise.all(clients.map(client=>client.query('SELECT pg_backend_pid() AS pid')));assert.notEqual(pids[0].rows[0].pid,pids[1].rows[0].pid);checks++;}finally{clients.forEach(client=>client.release());}
  const key=crypto.randomBytes(32).toString('hex'),jwt=require('jsonwebtoken'),service=createService({db,signingKey:key,production:false}),jar=new Map();
  const response=()=>({cookie:(name,value)=>jar.set(name,value),clearCookie:name=>jar.delete(name)});
  const headers=id=>({'x-rentalhub-session-id':id,cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')});
  const login=async userId=>{const token=jwt.sign({userId,userType:userId===1?'tenant':'landlord',tv:1,purpose:'session'},key,{expiresIn:'1m'}),data=await service.create({headers:headers(crypto.randomBytes(32).toString('hex'))},response(),{token});return{id:data.web_session_id,token:data.token,csrf:data.csrf_token};};
  const request=user=>({headers:{...headers(user.id),'x-csrf-token':user.csrf},auth:jwt.verify(user.token,key)});
  const a=await login(1),b=await login(2);
  assert.equal(jwt.verify((await service.bootstrap(request(a),response())).token,key).userId,1);assert.equal(jwt.verify((await service.bootstrap(request(b),response())).token,key).userId,2);checks++;
  const r=request(a),race=await Promise.allSettled([service.refresh(r,response()),service.refresh(r,response())]);assert.equal(race.filter(result=>result.status==='fulfilled').length,1);await assert.rejects(service.bootstrap(request(a),response()));assert.ok((await service.bootstrap(request(b),response())).token);checks++;
  const c=await login(1);const independent=await Promise.allSettled([service.refresh(request(c),response()),service.refresh(request(b),response())]);assert.ok(independent.every(result=>result.status==='fulfilled'));checks++;
  const d=await login(1),dr=request(d);await Promise.allSettled([service.refresh(dr,response()),service.revokeWithCookie(dr,response())]);await assert.rejects(service.bootstrap(request(d),response()));assert.ok((await service.bootstrap(request(b),response())).token);checks++;
  const wrong=request(b);wrong.headers['x-csrf-token']=c.csrf;await assert.rejects(service.refresh(wrong,response()),error=>error.statusCode===403);checks++;
  const wrongCookie=request(b);wrongCookie.headers.cookie=cookieName(b.id)+'='+jar.get(cookieName(c.id));await assert.rejects(service.bootstrap(wrongCookie,response()));checks++;
  await db.query('UPDATE users SET token_version=token_version+1 WHERE id=2');await assert.rejects(service.bootstrap(request(b),response()));checks++;
  await db.query(fs.readFileSync(path.join(__dirname,'../docs/sql/2060_web_auth_sessions_rollback.sql'),'utf8'));assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count,2);checks++;
  console.log(JSON.stringify({passed:checks,failed:0,engine:'real PostgreSQL, multiple pool connections',productionAccess:false}));
 }finally{
  if(admin){try{if(created&&/^rh_auth_test_[a-f0-9]{16}$/.test(schema))await admin.query('DROP SCHEMA '+quoted+' CASCADE');}finally{admin.release();}}
  await pool.end();
 }
}
main().catch(error=>{console.error(['ISOLATED_TEST_DATABASE_REQUIRED','TEST_DATABASE_NAME_REQUIRED'].includes(error.message)?error.message:'Isolated PostgreSQL acceptance failed. No credentials or session values are printed.');process.exitCode=1;});
