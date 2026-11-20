const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../../migrations/2052_lga_admin_activity_jsonb.sql'), 'utf8');
const original = fs.readFileSync(path.join(__dirname, '../../migrations/031_lga_admin_system.sql'), 'utf8');
const triggerSql = original.slice(original.indexOf('CREATE OR REPLACE FUNCTION log_lga_admin_activity()'), original.indexOf('COMMENT ON TABLE lga_admin_performance'));
async function fixture() {
  const pg = await PGlite.create();
  await pg.exec(`CREATE TABLE users (
    id SERIAL PRIMARY KEY,user_type TEXT NOT NULL,full_name TEXT NOT NULL,
    password_hash TEXT,totp_secret TEXT,totp_recovery_codes JSONB,nin TEXT,nin_hash TEXT,
    international_passport_number TEXT,passport_photo_hash TEXT
  );
  CREATE TABLE lga_admin_activities (
    id SERIAL PRIMARY KEY,lga_admin_id INTEGER REFERENCES users(id),activity_type TEXT,
    activity_details JSONB,ip_address INET,user_agent TEXT
  );`);
  await pg.exec(triggerSql);
  return pg;
}
test('the existing LGA insert failure is reproduced and the new migration fixes it', async () => {
  const pg = await fixture();
  try {
    await assert.rejects(pg.query("INSERT INTO users(user_type,full_name) VALUES('lga_admin','QA LGA')"), /could not convert type json to jsonb/i);
    await pg.exec(migration);
    await pg.query("INSERT INTO users(user_type,full_name) VALUES('lga_admin','QA LGA')");
    const activity = (await pg.query('SELECT activity_type,activity_details FROM lga_admin_activities')).rows;
    assert.equal(activity.length, 1);
    assert.equal(activity[0].activity_type, 'account_created');
    assert.deepEqual(activity[0].activity_details.old_data, {});
    assert.equal(activity[0].activity_details.new_data.full_name, 'QA LGA');
  } finally { await pg.close(); }
});
test('LGA updates retain useful history without passwords, MFA secrets or identity numbers', async () => {
  const pg = await fixture();
  try {
    await pg.exec(migration);
    const inserted = await pg.query(`INSERT INTO users(user_type,full_name,password_hash,totp_secret,totp_recovery_codes,nin,nin_hash,international_passport_number,passport_photo_hash)
      VALUES('lga_admin','Before','private-password','private-mfa','["private-recovery"]','private-nin','private-hash','private-passport','private-photo') RETURNING id`);
    await pg.query('UPDATE users SET full_name=$1 WHERE id=$2', ['After',inserted.rows[0].id]);
    const activities = (await pg.query('SELECT activity_type,activity_details FROM lga_admin_activities ORDER BY id')).rows;
    assert.equal(activities.length, 2);
    assert.equal(activities[1].activity_type, 'account_updated');
    assert.equal(activities[1].activity_details.old_data.full_name, 'Before');
    assert.equal(activities[1].activity_details.new_data.full_name, 'After');
    for (const activity of activities) {
      assert.ok(!JSON.stringify(activity.activity_details).includes('private-'));
      for (const snapshot of Object.values(activity.activity_details)) for (const key of ['password_hash','totp_secret','totp_recovery_codes','nin','nin_hash','international_passport_number','passport_photo_hash']) assert.equal(Object.hasOwn(snapshot,key), false);
    }
  } finally { await pg.close(); }
});
test('the migration is repeatable and leaves customer accounts and audit scope unchanged', async () => {
  const pg = await fixture();
  try {
    await pg.query("INSERT INTO users(user_type,full_name) VALUES('tenant','QA tenant'),('landlord','QA landlord')");
    await pg.exec(migration);
    await pg.exec(migration);
    await pg.query("UPDATE users SET full_name=full_name || ' updated'");
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 2);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS count FROM lga_admin_activities')).rows[0].count, 0);
  } finally { await pg.close(); }
});
