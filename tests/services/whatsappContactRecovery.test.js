const { test } = require('node:test');
const fs = require('fs');
const assert = require('node:assert/strict');
const { normalize, planRecovery } = require('../../scripts/recoverWhatsappContacts');

test('recovery adds missing numbers without replacing the later import or repeating local-format duplicates', () => {
  const source = [{phone:'08030000001',full_name:'First'}, {phone:'+2348030000001'}, {phone:'08030000002',full_name:'Second'}, {phone:'wrong'}];
  const original = [{phone:'2348030000002',subscribed:false}, {phone:'2348030000003',full_name:'Later import'}];
  const plan = planRecovery(source, original);
  assert.deepEqual(plan.contacts, [{phone:'2348030000001',full_name:'First'}]);
  assert.equal(plan.duplicates,1); assert.equal(plan.alreadySaved,1); assert.equal(plan.invalid,1);
  assert.equal(original[0].subscribed,false); assert.equal(original[1].full_name,'Later import');
});
test('repeat recovery has no new contacts to add', () => {
  const source=[{phone:'08030000001'}];const first=planRecovery(source,[]);
  assert.equal(planRecovery(source,first.contacts).contacts.length,0);
  assert.equal(normalize('12345'),null);
});
test('recovery and repeat imports cannot revive campaign permissions',()=>{
  const script=fs.readFileSync(require.resolve('../../scripts/recoverWhatsappContacts'),'utf8');
  assert.ok(script.includes("'recovery',FALSE,'unknown'"));
  const service=fs.readFileSync(require.resolve('../../services/whatsappMarketingService'),'utf8');
  const update=service.slice(service.indexOf('ON CONFLICT (phone) DO UPDATE SET',service.indexOf('const importContacts')));
  assert.equal(update.split('RETURNING')[0].includes('subscribed = TRUE'),false);
});
