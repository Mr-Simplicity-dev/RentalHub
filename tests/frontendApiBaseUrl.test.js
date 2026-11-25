const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveApiBaseUrl}=require('../client/config/apiBaseUrl.cjs');
test('production browser builds never use the server loopback API',()=>{for(const input of ['http://localhost:5000/api','http://127.0.0.1:5000/api','http://127.10.1.2/api','http://0.0.0.0:5000/api','http://[::1]:5000/api','http://dev.localhost:5000/api'])assert.equal(resolveApiBaseUrl(input,{production:true}),'/api');});
test('same-origin defaults and public HTTPS API configurations remain supported',()=>{assert.equal(resolveApiBaseUrl(undefined,{production:true}),'/api');assert.equal(resolveApiBaseUrl('/api',{production:true}),'/api');assert.equal(resolveApiBaseUrl('https://rentalhub.com.ng/api',{production:true}),'https://rentalhub.com.ng/api');});
test('local development retains its configured backend address',()=>assert.equal(resolveApiBaseUrl('http://localhost:5000/api',{production:false}),'http://localhost:5000/api'));
test('invalid API addresses fail the build instead of reaching visitors',()=>{for(const value of ['localhost:5000/api','javascript:alert(1)','//localhost:5000/api'])assert.throws(()=>resolveApiBaseUrl(value,{production:true}));});
