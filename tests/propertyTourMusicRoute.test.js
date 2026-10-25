const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const fs=require('node:fs/promises');
const upload=require('../config/middleware/tourMusicUpload');

test('tour music router loads without calling single on property middleware and preserves admin protection',()=>{
 const router=require('../routes/propertyTourMusic');
 const {authenticate,requireSuperAdmin}=require('../config/middleware/auth');
 const route=router.stack.find(layer=>layer.route?.path==='/upload').route;
 assert.equal(route.stack[0].handle,authenticate);
 assert.equal(route.stack[1].handle,requireSuperAdmin);
 assert.equal(route.stack[2].handle,upload);
});

async function uploadFixture(t,{name,type,bytes}){
 const app=express();
 app.post('/upload',upload,async(req,res)=>{
  if(!req.file)return res.status(400).json({message:'No file'});
  const file={name:req.file.originalname,size:req.file.size,type:req.file.mimetype};
  await fs.unlink(req.file.path);
  res.json(file);
 });
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const body=new FormData();body.append('music',new Blob([bytes],{type}),name);
 return fetch('http://127.0.0.1:'+server.address().port+'/upload',{method:'POST',body});
}

test('dedicated uploader accepts a WAV audio file without Cloudinary configuration',async t=>{
 const bytes=Buffer.alloc(46);bytes.write('RIFF',0);bytes.writeUInt32LE(38,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(2,40);
 const response=await uploadFixture(t,{name:'sample.wav',type:'audio/wav',bytes});
 assert.equal(response.status,200);assert.equal((await response.json()).name,'sample.wav');
});

test('HTML disguised as an audio upload is rejected',async t=>{
 const response=await uploadFixture(t,{name:'fake.mp3',type:'audio/mpeg',bytes:Buffer.from('<html>not audio</html>')});
 assert.equal(response.status,400);assert.match((await response.json()).message,/File content/);
});

test('unsupported MIME and extension are rejected before storage',async t=>{
 const response=await uploadFixture(t,{name:'document.pdf',type:'application/pdf',bytes:Buffer.from('%PDF-1.7 invalid music')});
 assert.equal(response.status,400);assert.match((await response.json()).message,/MP3, WAV, AAC, or M4A/);
});
