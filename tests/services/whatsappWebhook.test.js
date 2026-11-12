const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {createWebhookRouter}=require('../../routes/whatsappWebhook');
test('Webhook checks raw-body signatures before processing; invalid and missing signatures cannot mutate records',async()=>{
 const previous=process.env.WHATSAPP_APP_SECRET;process.env.WHATSAPP_APP_SECRET='test-webhook-secret';let count=0;
 const app=express();app.use(express.json({verify:(req,_res,buf)=>req.rawBody=buf}));app.use('/hook',createWebhookRouter({processEvents:async()=>count++}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const url='http://127.0.0.1:'+server.address().port+'/hook',body=JSON.stringify({entry:[{}]}),sig='sha256='+crypto.createHmac('sha256','test-webhook-secret').update(body).digest('hex');
  for(const signature of ['', 'sha256=bad','sha256='+'0'.repeat(64)]){const r=await fetch(url,{method:'POST',body,headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature}});assert.equal(r.status,401);}assert.equal(count,0);
  const valid=await fetch(url,{method:'POST',body,headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig}});assert.equal(valid.status,200);assert.equal(count,1);
  const tampered=await fetch(url,{method:'POST',body:body+' ',headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig}});assert.equal(tampered.status,401);assert.equal(count,1);
  delete process.env.WHATSAPP_APP_SECRET;const missing=await fetch(url,{method:'POST',body,headers:{'Content-Type':'application/json'}});assert.equal(missing.status,503);assert.equal(count,1);
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=previous;}
});
