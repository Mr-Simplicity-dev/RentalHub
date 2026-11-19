const normalize = phone => {
  const digits = String(phone || '').replace(/\D/g, '');
  let national = digits;
  if (digits.startsWith('234')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  return /^[789]\d{9}$/.test(national) ? '234' + national : null;
};

const planRecovery = (source, existing) => {
  const known = new Set(existing.map(row => normalize(row.phone)).filter(Boolean));
  const seen = new Set();
  const contacts = [];
  let invalid = 0, duplicates = 0, alreadySaved = 0;
  for (const row of source) {
    const phone = normalize(row.phone);
    if (!phone) { invalid++; continue; }
    if (seen.has(phone)) { duplicates++; continue; }
    seen.add(phone);
    if (known.has(phone)) { alreadySaved++; continue; }
    contacts.push({ phone, full_name: row.full_name || null });
  }
  return { contacts, invalid, duplicates, alreadySaved };
};

async function main() {
  require('dotenv').config({ quiet: true });
  const db = require('../config/middleware/database');
  const date = process.argv.find(arg => arg.startsWith('--source-date='))?.slice(14);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Use --source-date=YYYY-MM-DD');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('whatsapp-import-recovery'))");
    const source = await client.query("SELECT phone, full_name FROM sms_subscribers WHERE source = 'import' AND created_at::date = $1::date ORDER BY id", [date]);
    const existing = await client.query('SELECT phone FROM whatsapp_contacts');
    const plan = planRecovery(source.rows, existing.rows);
    const summary = { sourceDate: date, sourceRows: source.rows.length, existingTotal: existing.rows.length,
      missingUniqueContacts: plan.contacts.length, invalid: plan.invalid, duplicates: plan.duplicates, alreadySaved: plan.alreadySaved };
    if (!process.argv.includes('--apply')) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ ...summary, dryRun: true }));
      return;
    }
    let added = 0;
    for (let offset = 0; offset < plan.contacts.length; offset += 250) {
      const chunk = plan.contacts.slice(offset, offset + 250);
      const result = await client.query(
        "INSERT INTO whatsapp_contacts(phone,full_name,source,subscribed,wa_status,import_batch) SELECT phone,full_name,'recovery',FALSE,'unknown',$2 FROM jsonb_to_recordset($1::jsonb) AS incoming(phone text,full_name text) ON CONFLICT(phone) DO NOTHING RETURNING id",
        [JSON.stringify(chunk), 'Recovered WhatsApp import ' + date]);
      added += result.rowCount;
    }
    await client.query(
      "INSERT INTO whatsapp_marketing_operations(actor_name,entity_type,event_type,note,metadata) VALUES('Contact recovery','whatsapp_contact','contacts_recovered',$1,$2::jsonb)",
      ['Recovered the earlier WhatsApp file from its matching SMS import at the owner’s request. No messages sent; WhatsApp permission remains unconfirmed.', JSON.stringify({ ...summary, added })]);
    const total = (await client.query('SELECT COUNT(*)::int total FROM whatsapp_contacts')).rows[0].total;
    await client.query('COMMIT');
    console.log(JSON.stringify({ ...summary, added, total, messagesSent: 0, newContactsSubscribed: false }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await db.end(); }
}

module.exports = { normalize, planRecovery };
if (require.main === module) main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
