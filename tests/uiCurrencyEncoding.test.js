const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const mobile = path.join(root, 'RentalHubMobile');
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const sourceRoots = [path.join(root,'client/src'),path.join(mobile,'src')].filter(dir=>fs.existsSync(dir));
test('web and mobile UI source contains no corrupted naira symbols',()=>{
 const corrupted = [String.fromCodePoint(0xe2,0x201a,0xa6),String.fromCodePoint(0xe2,0x82,0xa6)];
 const failures=[];
 for(const directory of sourceRoots)for(const file of walk(directory).filter(file=>/\.(?:js|jsx|cjs|json|html)$/.test(file))){
  const source=fs.readFileSync(file,'utf8');if(corrupted.some(symbol=>source.includes(symbol)))failures.push(path.relative(root,file));
 }
 const refund=fs.readFileSync(path.join(root,'services/refundService.js'),'utf8');
 if(corrupted.some(symbol=>refund.includes(symbol)))failures.push('services/refundService.js');
 assert.deepEqual(failures,[]);
});
test('bundled web and native Inter weights contain an actual naira glyph',()=>{
 const fontkit=require('fontkit');
 const directories=[path.join(root,'client/src/assets/fonts'),path.join(mobile,'assets/fonts')].filter(dir=>fs.existsSync(dir));
 for(const directory of directories)for(const weight of ['Regular','Medium','SemiBold','Bold']){
  const file=path.join(directory,'Inter-'+weight+'.ttf');
  assert.ok(fontkit.openSync(file).hasGlyphForCodePoint(0x20a6),path.relative(root,file)+' must include U+20A6');
 }
});
test('registration totals and mobile admin prices retain the currency prefix',()=>{
 const web=fs.readFileSync(path.join(root,'client/src/pages/Register.jsx'),'utf8');
 assert.ok(web.includes('formatNaira(displayedRegistrationAmount)'));
 if(!fs.existsSync(path.join(mobile,'src/screens/auth/RegisterScreen.js')))return;
 const native=fs.readFileSync(path.join(mobile,'src/screens/auth/RegisterScreen.js'),'utf8');
 assert.ok(native.includes('\u20a6${Number(displayedRegistrationAmount'));
 const admin=fs.readFileSync(path.join(mobile,'src/screens/admin/SuperAdminDashboardScreen.js'),'utf8');
 assert.ok(!/(?:Base fee: |Amount: |Price: )N\{/.test(admin));
});
