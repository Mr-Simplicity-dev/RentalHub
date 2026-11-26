const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('crypto');const fs=require('fs');const {buildIceServers,iceServersHandler}=require('../services/webrtcIceService');
const missing=()=>{const e=Error('missing');e.code='ENOENT';throw e;};
test('TURN shared secret stays private and produces expiring per-user credentials',()=>{
 const secret='private-test-secret';const now=1800000000000;
 const result=buildIceServers({userId:42,now,env:{},readFile:()=>JSON.stringify({urls:['turn:relay.example:3478?transport=udp','turn:relay.example:3478?transport=tcp'],secret})});
 const relay=result.at(-1);assert.match(relay.username,/^1800003600:42:[a-f0-9]{16}$/);assert.equal(relay.credential,crypto.createHmac('sha1',secret).update(relay.username).digest('base64'));assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(result.some(s=>[].concat(s.urls).some(u=>u.startsWith('turns:'))),false);
});
test('credentials expire relative to each request and do not reuse another users identity',()=>{
 const options={env:{TURN_URL:'turn:relay.example:3478',TURN_AUTH_SECRET:'test-secret'},readFile:missing,now:1800000000000};
 const a=buildIceServers({...options,userId:1}).at(-1),b=buildIceServers({...options,userId:2,now:options.now+60000}).at(-1);
 assert.notEqual(a.username,b.username);assert.notEqual(a.credential,b.credential);assert.equal(Number(b.username.split(':')[0])-Number(a.username.split(':')[0]),60);
 assert.throws(()=>buildIceServers({...options}),/Authenticated/);
});
test('legacy credentials work without inventing a TLS endpoint; incomplete settings do not expose an unauthenticated relay',()=>{
 const env={TURN_URL:'turn:relay:3478?transport=tcp,turns:secure:5349',TURN_USERNAME:'legacy',TURN_PASSWORD:'password'};
 const relay=buildIceServers({env,readFile:missing}).at(-1);assert.equal(relay.urls.length,2);assert.equal(relay.username,'legacy');assert.equal(buildIceServers({env:{TURN_URL:'turn:relay:3478'},readFile:missing}).length,2);assert.equal(buildIceServers({env:{},readFile:missing}).length,2);
});
test('existing endpoint stays authenticated and relay responses are not cached',()=>{
 const route=fs.readFileSync(require.resolve('../routes/voice'),'utf8');assert.match(route,/router.get\('\/ice-servers', voiceTokenLimiter, authenticate,/);
 const headers={};const res={set(k,v){headers[k]=v;return this;},json(data){return data;},status(){return this;}};
 iceServersHandler({user:{id:42}},res);assert.equal(headers['Cache-Control'],'no-store, private');
});
