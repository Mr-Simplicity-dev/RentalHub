// Local-only browser acceptance harness. No application server, providers or production DB.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
const {createService}=require('../services/webAuthSessions');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.resolve(process.argv[2]||'RentalHubMobile/.codex-tmp/tab-browser-acceptance');fs.mkdirSync(output,{recursive:true});
const profile=path.join(output,'chrome-'+Date.now());fs.mkdirSync(profile);
const signingKey=require('crypto').randomBytes(32).toString('hex');
let chrome,ws,server,pg;let seq=0;const pending=new Map();
async function send(method,params={},sessionId){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local Chrome command timed out: '+method));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function attach(targetId){return(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;}
async function evaluate(sessionId,expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);if(result.exceptionDetails)throw Error('Local browser assertion failed: '+String(result.exceptionDetails.exception?.description||result.exceptionDetails.text).split('\n')[0].replace(/[a-f0-9]{32,}/g,'[redacted]'));return result.result.value;}
async function main(){
 pg=new PGlite();await pg.waitReady;await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,user_type TEXT NOT NULL,token_version INTEGER NOT NULL DEFAULT 1,is_active BOOLEAN NOT NULL DEFAULT TRUE,deleted_at TIMESTAMPTZ); CREATE TABLE google_signin_requests(id UUID PRIMARY KEY); INSERT INTO users(id,user_type)VALUES(1,'tenant'),(2,'landlord');");
 await pg.exec(fs.readFileSync(path.join(__dirname,'../migrations/2060_web_auth_sessions.sql'),'utf8'));
 let tail=Promise.resolve();const acquire=async()=>{let release;const next=new Promise(r=>{release=r;});const prior=tail;tail=next;await prior;return release;};
 const db={query:async(sql,args)=>{const release=await acquire();try{return await pg.query(sql,args);}finally{release();}},connect:async()=>{const release=await acquire();return{query:(sql,args)=>pg.query(sql,args),release};}};
 const sessions=createService({db,signingKey,production:false});
 const factory=fs.readFileSync(path.join(__dirname,'../client/src/services/tabIdentity.cjs'),'utf8');
 const html=`<!doctype html><title>RentalHub isolated acceptance test</title><p>Local test only. No real accounts.</p><script>const module={exports:{}};${factory}\nwindow.identity=module.exports.createTabIdentity(window);let access=null,csrf=null;window.call=async(route,method='GET',body={})=>{const id=await identity.initialize();const r=await fetch('/api/auth/'+route,{method,headers:{'Content-Type':'application/json','X-RentalHub-Session-Id':id,...(access?{Authorization:'Bearer '+access}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});const data=await r.json();if(data.web_session_id){await identity.replace(data.web_session_id);access=data.token;csrf=data.csrf_token;}return {status:r.status,userId:data.userId};};window.login=userId=>call('test-login','POST',{userId});window.current=()=>call('me');window.logout=async()=>{const result=await call('logout','POST');access=null;csrf=null;await identity.reset();return result;};window.ready=call('session');</script>`;
 let base;
 server=http.createServer(async(req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');let data;
  console.log('Local request '+req.method+' '+req.url);
  const response={cookie(name,value,opts){const existing=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...existing,`${name}=${value}; HttpOnly; SameSite=Lax; Path=${opts.path}`]);},clearCookie(name,opts){const existing=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...existing,`${name}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=${opts.path}`]);}};
  if(req.method==='POST'&&req.headers.origin!==base)throw Object.assign(Error(),{statusCode:403});
  if(req.url==='/api/auth/test-login'){
   if(![1,2].includes(body.userId))throw Error();
   const token=jwt.sign({userId:body.userId,userType:body.userId===1?'tenant':'landlord',tv:1,purpose:'session'},signingKey,{expiresIn:'1m'});data=await sessions.create(req,response,{token});
  }else if(req.url==='/api/auth/session'){data=await sessions.bootstrap(req,response);}
  else if(req.url==='/api/auth/me'){const claims=jwt.verify(String(req.headers.authorization||'').replace('Bearer ',''),signingKey);await sessions.validateAccess(claims,req.headers['x-rentalhub-session-id']);data={userId:claims.userId};}
  else if(req.url==='/api/auth/refresh-token'){await sessions.verifyCsrf(req);data=await sessions.refresh(req,response);}
  else if(req.url==='/api/auth/logout'){await sessions.verifyCsrf(req);await sessions.revokeWithCookie(req,response);data={};}
  else throw Error();
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));console.log('Local response completed');
 }catch(error){console.log('Local response rejected');res.statusCode=error.statusCode||401;res.setHeader('Content-Type','application/json');res.end('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const executable=process.env.CHROME_TEST_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe';
 chrome=spawn(executable,['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-popup-blocking','--disable-component-update','--user-data-dir='+profile],{windowsHide:true,stdio:'ignore'});
 let lines;for(let i=0;i<60;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/);break;}await delay(250);}if(!lines)throw Error('Isolated Chrome did not start');
 ws=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.onmessage=event=>{const value=JSON.parse(event.data),item=pending.get(value.id);if(!item)return;clearTimeout(item.timer);pending.delete(value.id);value.error?item.reject(Error(value.error.message)):item.resolve(value.result);};
 const waitReady=async session=>{for(let i=0;i<60;i++){if(await evaluate(session,"typeof window.ready !== 'undefined'")){await evaluate(session,'ready');return;}await delay(100);}throw Error('Local fixture did not load');};
 const open=async route=>{const {targetId}=await send('Target.createTarget',{url:base+route});const session=await attach(targetId);console.log('Checking local tab initialization');await waitReady(session);return session;};
 const a=await open('/a'),b=await open('/b');const report={};console.log('Checking local sign-in');
 await Promise.all([evaluate(a,'login(1)'),evaluate(b,'login(2)')]);
 report.tenantInA=(await evaluate(a,'current()')).userId===1;report.landlordInB=(await evaluate(b,'current()')).userId===2;
 console.log('Checking reload A');await send('Page.reload',{},a);await delay(400);await waitReady(a);report.reloadA=(await evaluate(a,'current()')).userId===1;
 console.log('Checking reload B');await send('Page.reload',{},b);await delay(400);await waitReady(b);report.reloadB=(await evaluate(b,'current()')).userId===2;
 report.protectedA=(await evaluate(a,'current()')).status===200;report.protectedB=(await evaluate(b,'current()')).status===200;
 console.log('Checking isolated logout');await evaluate(a,'logout()');report.logoutAKeepsB=(await evaluate(b,'current()')).userId===2;
 console.log('Checking second logout');await evaluate(a,'login(1)');await evaluate(b,'logout()');report.logoutBKeepsA=(await evaluate(a,'current()')).userId===1;
 await evaluate(b,'login(2)');await evaluate(a,'login(2)');report.switchAKeepsB=(await evaluate(b,'current()')).userId===2;
 const c=await open('/independent');report.newTabSignedOut=(await evaluate(c,'current()')).status===401;
 await evaluate(a,`window.open('${base}/opener','_blank');true`);await delay(400);const targets=(await send('Target.getTargets')).targetInfos;const popup=targets.find(t=>t.url===base+'/opener');assert.ok(popup);const d=await attach(popup.targetId);await waitReady(d);report.openerSignedOut=(await evaluate(d,'current()')).status===401;
 const copied=await evaluate(a,'({id:identity.get(),marker:history.state.__rentalhubAuthEntry})');
 await evaluate(c,`sessionStorage.setItem('rentalhub.web-session-id',${JSON.stringify(copied.id)});history.replaceState({...history.state,__rentalhubAuthEntry:${JSON.stringify(copied.marker)}},'');true`);
 await send('Page.reload',{},c);await delay(400);await waitReady(c);report.copiedStorageSignedOut=(await evaluate(c,'current()')).status===401;
 report.concurrentIdentifiersDistinct=await evaluate(a,'identity.get()')!==await evaluate(b,'identity.get()');
 report.cookiesNotVisibleToJavaScript=await evaluate(a,"!document.cookie.includes('rh_refresh_')");
 report.noBearerInStorage=await evaluate(a,"Object.keys(sessionStorage).every(key=>key==='rentalhub.web-session-id')&&Object.keys(localStorage).length===0");
 report.chromeDuplicateMenu='NOT TESTED: follow the manual Chrome procedure';
 for(const [name,value]of Object.entries(report))if(typeof value==='boolean')assert.equal(value,true,name);
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{try{if(ws?.readyState===1)await send('Browser.close');}catch{}ws?.close();chrome?.kill();await new Promise(resolve=>server?server.close(resolve):resolve());await pg?.close();});
