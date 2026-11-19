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
