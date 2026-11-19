const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { resolveLocalTourMusic } = require('../../config/utils/tourMusicPath');

test('music preview resolves real audio only inside the two approved music folders', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rentalhub-music-preview-'));
  t.after(()=>{ assert.ok(path.basename(root).startsWith('rentalhub-music-preview-')); fs.rmSync(root,{recursive:true,force:true}); });
  const preset=path.join(root,'Video-Presets_290_Royalty_Free_Background_Music_Tracks','Mp3','Warm & Calm','Test.mp3');
  const upload=path.join(root,'uploads','property_tour','music','uploaded.m4a');
  for(const file of [preset,upload]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from('ID3example'));
    assert.equal(resolveLocalTourMusic(path.relative(root,file),root),fs.realpathSync(file));
    assert.equal(resolveLocalTourMusic(file,root),fs.realpathSync(file));}
  const privateFile=path.join(root,'uploads','passport.mp3');fs.writeFileSync(privateFile,'private');
  assert.equal(resolveLocalTourMusic(privateFile,root),null);
  assert.equal(resolveLocalTourMusic(path.join(root,'missing.mp3'),root),null);
  assert.equal(resolveLocalTourMusic('https://example.test/music.mp3',root),null);
  assert.equal(resolveLocalTourMusic('../outside.mp3',root),null);
  assert.equal(resolveLocalTourMusic('bad\0name.mp3',root),null);
  if(process.platform!=='win32') {const link=path.join(path.dirname(upload),'escape.mp3');fs.symlinkSync(privateFile,link);assert.equal(resolveLocalTourMusic(link,root),null);}
});
test('music route retains authentication and Super Admin verification',()=>{
  const source=fs.readFileSync(require.resolve('../../routes/propertyTourMusic'),'utf8');
  assert.ok(source.includes("router.get('/tracks/:id/audio', authenticate, requireSuperAdmin, ctrl.previewTrack)"));
});

test('the preview controller serves audio bytes and seeking ranges rather than an HTML page', async t => {
  const express=require('express');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rentalhub-music-http-'));
  const file=path.join(root,'uploads','property_tour','music','test.mp3');fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=Buffer.from('ID3test-audio-preview-0123456789');fs.writeFileSync(file,bytes);
  t.after(()=>{assert.ok(path.basename(root).startsWith('rentalhub-music-http-'));fs.rmSync(root,{recursive:true,force:true});});
  const dbPath=require.resolve('../../config/middleware/database'),helperPath=require.resolve('../../config/utils/tourMusicPath'),ctrlPath=require.resolve('../../controllers/propertyTourMusicController');
  const oldDb=require.cache[dbPath],oldHelper=require.cache[helperPath],oldCtrl=require.cache[ctrlPath];
  let queryCount=0;
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(_sql,params)=>{queryCount++;return {rows:params[0]==='1'?[{file_url:path.relative(root,file)}]:params[0]==='3'?[{file_url:'../private.mp3'}]:[]};}}};
  require.cache[helperPath]={id:helperPath,filename:helperPath,loaded:true,exports:{resolveLocalTourMusic:value=>resolveLocalTourMusic(value,root)}};
  delete require.cache[ctrlPath];const {previewTrack}=require(ctrlPath);
  for(const [key,previous]of [[dbPath,oldDb],[helperPath,oldHelper],[ctrlPath,oldCtrl]]){if(previous)require.cache[key]=previous;else delete require.cache[key];}
  const app=express();app.get('/tracks/:id/audio',previewTrack);const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/tracks/1/audio');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^audio\/mpeg/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const range=await fetch(base+'/tracks/1/audio',{headers:{Range:'bytes=0-2'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(0,3));
    assert.equal((await fetch(base+'/tracks/2/audio')).status,404);
    assert.equal((await fetch(base+'/tracks/3/audio')).status,404);
    const before=queryCount;assert.equal((await fetch(base+'/tracks/invalid/audio')).status,400);assert.equal(queryCount,before);
  } finally {await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});
