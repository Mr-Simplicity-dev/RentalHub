const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.resolve(__dirname,'../services/googleCustomerSignin.js'),'utf8');
function fixture(options={}) {
  const records=new Map(), issued=[], audit=[];
  const user={id:2,email:'customer@gmail.com',phone:'08000000000',user_type:'tenant',email_verified:true,approval_status:'approved',is_active:true,token_version:7,...options.user};
  let claim,otp;
  const query=async(sql,args=[])=>{
    audit.push(sql);
    if(sql.startsWith('INSERT INTO google_signin_requests')){records.set(args[0],{id:args[0],mode:args[1],nonce:args[2],verifier_hash:args[3]});return {rowCount:1};}
    const r=records.get(args[0]);
    if(sql.includes('SELECT * FROM google_signin_requests'))return {rows:r&&!r.user_id?[r]:[]};
    if(sql.includes('FROM users WHERE'))return {rows:options.missing?[]:[{...user}]};
    if(sql.startsWith('UPDATE users SET google_subject')){user.google_subject=args[0];return {rowCount:1};}
    if(sql.startsWith('UPDATE google_signin_requests SET mailbox_user_id')){Object.assign(r,{mailbox_user_id:args[1],mailbox_subject:args[2],mailbox_hash:args[3],mailbox_attempts:0});return {rowCount:1};}
    if(sql.startsWith('UPDATE google_signin_requests SET mailbox_attempts')){r.mailbox_attempts++;r.mailbox_verified=r.mailbox_hash===args[1];return {rows:[r]};}
    if(sql.startsWith('UPDATE google_signin_requests SET user_id')){Object.assign(r,{user_id:args[1],token_version:args[2],had_totp:args[3],code_hash:args[4]});return {rowCount:1};}
    if(sql.startsWith('DELETE FROM google_signin_requests WHERE id=')){
      if(!r || (args.length===3&&(args[1]!==r.code_hash || args[2]!==r.verifier_hash))) return {rows:[],rowCount:0};
      records.delete(args[0]);return {rows:[r],rowCount:1};
    }
    return {rows:[]};
  };
  const modules={
    '../config/middleware/database':{query,connect:async()=>({query,release(){}})},
    '../services/unused':{},'./assistedRegistrationService':{decorateUser:async u=>{if(u.assisted_registration)u.registration_payment_required=true;}},
    './authService':{assistedRegistrationInternals:{generateToken:()=>{issued.push(1);return 'session';},attachAuthSession:(_r,data)=>data}},
    '../config/utils/twoFactor':{verifyTotpCode:async({code})=>{if(code!=='123456')throw Error();},verifyRecoveryCode:async()=>{throw Error();}},
    '../config/utils/mailer':{sendEmail:async({html})=>{otp=html.match(/<strong>(\d+)</)[1];return {success:true};}},
    'google-auth-library':{OAuth2Client:class{async verifyIdToken({idToken,audience}){assert.equal(audience,'test-client');if(idToken!=='signed')throw Error();return {getPayload:()=>claim};}}},
    'node:crypto':crypto,
  };
  const ctx={exports:{},require:k=>modules[k],process:{env:{GOOGLE_CLIENT_ID:'test-client',JWT_SECRET:'test-only-key'}}};vm.runInNewContext(source,ctx);
  async function call(fn,body={},params={}){const res={statusCode:200,set(){},status(n){this.statusCode=n;return this;},json(obj){this.body=obj;return this;}};await ctx.exports[fn]({body,params},res);return res;}
  async function begin(mode='mobile'){const {body:{data}}=await call('start',{mode});claim={email:user.email,sub:'google-id',email_verified:true,nonce:data.nonce,...options.claim};return data;}
  return {call,begin,user,issued,audit,getOtp:()=>otp};
}
test('mobile: proof, customer payment gate and one-time exchange',async()=>{
 const f=fixture({user:{assisted_registration:true,phone_verified:true}}),c=await f.begin();
 const auth=await f.call('authorize',{request_id:c.id,credential:'signed'});assert.equal(auth.statusCode,200);assert.equal(f.issued.length,0);
 const payload={request_id:c.id,code:auth.body.data.code,verifier:c.verifier};
 assert.equal((await f.call('exchange',{...payload,verifier:'0'.repeat(64)})).statusCode,401);
 const done=await f.call('exchange',payload);assert.equal(done.body.data.user.registration_payment_required,true);assert.equal(done.body.data.token,'session');
 assert.equal((await f.call('exchange',payload)).statusCode,401);
});
test('unregistered email never creates an account',async()=>{const f=fixture({missing:true}),c=await f.begin();const r=await f.call('authorize',{request_id:c.id,credential:'signed'});assert.equal(r.body.code,'REGISTRATION_REQUIRED');assert.ok(!f.audit.some(q=>/insert into users/i.test(q)));});
test('forged, unverified and stale Google identity is rejected',async()=>{for(const [credential,claim] of [['fake',{}],['signed',{email_verified:false}],['signed',{nonce:'another'}]]){const f=fixture({claim}),c=await f.begin();assert.equal((await f.call('authorize',{request_id:c.id,credential})).statusCode,401);assert.equal(f.issued.length,0);}});
test('privileged, pending, incomplete, locked and suspended accounts cannot sign in',async()=>{for(const user of [{user_type:'super_admin'},{is_recruitment_admin:true},{approval_status:'pending'},{email_verified:false},{phone:null},{is_active:false},{locked_until:'2099-01-01'},{google_subject:'other'},{assisted_registration:true,phone_verified:false}]){const f=fixture({user}),c=await f.begin();assert.ok((await f.call('authorize',{request_id:c.id,credential:'signed'})).statusCode>=400);assert.equal(f.issued.length,0);}});
test('web requires the browser verifier and configured second factor',async()=>{const f=fixture({user:{totp_enabled:true}}),c=await f.begin('web'),body={request_id:c.id,credential:'signed'};assert.equal((await f.call('authorize',body)).statusCode,401);body.verifier=c.verifier;assert.equal((await f.call('authorize',body)).body.code,'GOOGLE_MFA_REQUIRED');assert.equal((await f.call('authorize',{...body,factor:'123456'})).body.data.token,'session');});
test('third party Google email requires mailbox proof before linking',async()=>{const f=fixture({user:{email:'me@example.com'}}),c=await f.begin('web'),body={request_id:c.id,credential:'signed',verifier:c.verifier};assert.equal((await f.call('authorize',body)).body.code,'GOOGLE_EMAIL_REQUIRED');assert.equal((await f.call('authorize',{...body,mailbox_code:f.getOtp()})).body.data.user.id,2);});
