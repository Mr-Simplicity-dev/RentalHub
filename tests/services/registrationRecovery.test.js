const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {normalizePremblyResponse}=require('../../config/utils/premblyResponse');
const response=()=>({status(value){this.statusCode=value;return this},json(value){this.body=value;return this}});
test('untrackable provider timeouts are not advertised as automatically recoverable',()=>{
 const s=fs.readFileSync(require.resolve('../../services/premblyRecoveryService'),'utf8');const a=s.indexOf('const attemptToResult ='),b=s.indexOf('const beginAttemptWithClient',a);
 const result=vm.runInNewContext(s.slice(a,b)+';attemptToResult({status:"pending",provider_reference:null,provider_message:"timeout"})');assert.equal(result.status,'reconciliation_required');assert.equal(result.pending,false);assert.equal(result.can_auto_check,false);
 const tracked=vm.runInNewContext(s.slice(a,b)+';attemptToResult({status:"pending",provider_reference:"reference"})');assert.equal(tracked.can_auto_check,true);
 const verified=vm.runInNewContext(s.slice(a,b)+';attemptToResult({status:"verified",provider_reference:"reference",verified_identity_name:"Verified Name"})');assert.equal(verified.verified_name,'Verified Name');
});
test('provider authentication failure is not an invalid NIN or pending paid check',()=>{
 const r=normalizePremblyResponse({status:false,response_code:'02',message:'token_not_valid'});assert.equal(r.status,'service_error');assert.equal(r.verified,false);
 assert.equal(normalizePremblyResponse({status:true,response_code:'00',verification:{status:'VERIFIED',reference:'ref'}}).verified,true);
});
function loadEmail(user,decoded={userId:1,email:'user@example.test',purpose:'email-verification'}){
 const source=fs.readFileSync(require.resolve('../../services/authService'),'utf8'),a=source.indexOf('exports.verifyEmail = async'),b=source.indexOf('// RESEND EMAIL VERIFICATION',a);let params;
 const ctx={exports:{},process:{env:{JWT_SECRET:'test'}},jwt:{verify:()=>decoded},hasTokenPurpose:require('../../config/utils/sessionToken').hasTokenPurpose,db:{query:async(sql,args)=>{params=args;assert.ok(sql.includes('LOWER(email) = LOWER($2)'));return{rowCount:user&&args[1]===user.email?1:0,rows:user?[user]:[]}}},logOtpEvent:async()=>{},generateToken:()=> 'session',attachAuthSession:(_,d,options)=>({...d,session_token:options.exposeSessionToken?'native-session':undefined}),isNativeAuthClient:()=>true};vm.runInNewContext(source.slice(a,b),ctx);return{run:ctx.exports.verifyEmail,params:()=>params};
}
const customer={id:1,email:'user@example.test',user_type:'tenant',email_verified:true,phone_verified:true,is_active:true,approval_status:'approved'};
test('email verification returns a complete native session and the verified phone state',async()=>{
 const f=loadEmail(customer),res=response();await f.run({params:{token:'test'},logger:{error(){}}},res);assert.equal(res.body.success,true);assert.equal(res.body.data.session_token,'native-session');assert.equal(res.body.user.phone_verified,true);assert.equal(f.params()[1],customer.email);
});
test('email verification never bypasses admin privileges, suspension or two-factor sign-in',async()=>{
 for(const changes of [{user_type:'super_admin'},{is_active:false},{totp_enabled:true},{approval_status:'pending'},{is_recruitment_admin:true}]){const f=loadEmail({...customer,...changes}),res=response();await f.run({params:{token:'test'},logger:{error(){}}},res);assert.equal(res.body.requires_sign_in,true);assert.equal(res.body.token,undefined);}
});
test('an old email link cannot verify a replacement email or act as a session token',async()=>{
 const f=loadEmail({...customer,email:'changed@example.test'}),res=response();await f.run({params:{token:'test'},logger:{error(){}}},res);assert.equal(res.statusCode,404);
 const g=loadEmail(customer,{userId:1,email:customer.email,purpose:'session'}),bad=response();await g.run({params:{token:'test'},logger:{error(){}}},bad);assert.equal(bad.statusCode,400);
});

test('OTP confirmation returns before identity verification; continuation starts it separately',async()=>{
 const source=fs.readFileSync(require.resolve('../../services/authService'),'utf8'),a=source.indexOf('const verifyRegistrationPhone ='),b=source.indexOf('exports.verifyRegistrationPaymentPhone',a);let starts=0;
 const ctx={validationResult:()=>({isEmpty:()=>true}),registrationPhoneGate:{verify:async()=> 'proof',resume:async()=> 'proof'},logOtpEvent:async()=>{},exports:{initializeRegistrationPayment:async(req,res)=>{starts++;return res.json({success:true,data:{reference:'payment'}})}}};
 const run=vm.runInNewContext(source.slice(a,b)+';verifyRegistrationPhone("paid")',ctx),first=response();
 await run({body:{phone:'08000000000',phone_verification_protocol:2}},first);assert.equal(first.body.code,'PHONE_VERIFIED');assert.equal(starts,0);assert.equal(first.body.phone_verification_token,'proof');
 const second=response();await run({body:{phone_verification_token:'proof'}},second);assert.equal(starts,1);assert.equal(second.body.data.completion_token,'proof');
});
test('verification email does not claim success when the provider rejects it',async()=>{
 const source=fs.readFileSync(require.resolve('../../config/utils/emailService'),'utf8'),a=source.indexOf('exports.sendVerificationEmail ='),b=source.indexOf('// Send payment receipt email',a),ctx={exports:{},FRONTEND_URL:'https://example.invalid',sendEmail:async()=>({success:false}),logger:{error(){}},process:{env:{NODE_ENV:'production'}}};
 vm.runInNewContext(source.slice(a,b),ctx);assert.equal((await ctx.exports.sendVerificationEmail('user@example.invalid','token')).success,false);
});
