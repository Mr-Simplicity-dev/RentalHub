const db = require('../config/middleware/database');
const { getPropertyManagerContext } = require('../config/utils/agentSystem');
const { validateStructuredFeatures } = require('../config/utils/propertyFeatureSchema');
const { isDeepStrictEqual } = require('util');
const activity = require('./activityLogger');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const fields = ['state_id','lga_name','city','area','full_address','latitude','longitude','property_type','bedrooms','bathrooms','rent_amount','payment_frequency','caution_deposit','title','description','amenities','structured_features'];
const snapshot = row => Object.fromEntries(fields.map(key => [key, row[key] ?? null]));
const normalize = body => {
  const values = {};
  for (const key of fields) {
    if (body[key] === undefined) continue;
    let value = body[key];
    if (['title','description','lga_name','city','area','full_address'].includes(key)) {
      const max = key === 'description' ? 10000 : key === 'full_address' ? 1000 : 255;
      if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, `Enter a valid ${key.replaceAll('_',' ')}.`);
      value = value.trim();
    } else if (['state_id','latitude','longitude','bedrooms','bathrooms','rent_amount','caution_deposit'].includes(key)) {
      if (value === '' || value === null || typeof value === 'boolean' || !Number.isFinite(Number(value))) throw fail(400, `Invalid ${key}.`);
      value = Number(value);
      if (['state_id','bedrooms','bathrooms'].includes(key) && !Number.isInteger(value)) throw fail(400, `Invalid ${key}.`);
      const min = key === 'latitude' ? -90 : key === 'longitude' ? -180 : key === 'state_id' ? 1 : 0;
      const max = key === 'latitude' ? 90 : key === 'longitude' ? 180 : 1e12;
      if (value < min || value > max) throw fail(400, `Invalid ${key}.`);
    } else if (key === 'property_type') {
      if (!['apartment','house','duplex','studio','bungalow','flat','room'].includes(value)) throw fail(400,'Invalid property type.');
    } else if (key === 'payment_frequency') {
      if (!['monthly','yearly'].includes(value)) throw fail(400,'Invalid payment frequency.');
    } else if (key === 'amenities') {
      if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 120)) throw fail(400,'Enter valid amenities.');
      value = [...new Set(value.map(item => item.trim()))];
    } else if (key === 'structured_features') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 60000) throw fail(400,'Invalid property features.');
      const validated = validateStructuredFeatures(JSON.parse(JSON.stringify(value)));
      if (!validated.valid) throw fail(400,'Please correct the property feature details.');
      value = validated.features;
    }
    values[key] = value;
  }
  if (!Object.keys(values).length) throw fail(400,'No property changes provided.');
  return values;
};
const manager = async (user, propertyId) => {
  const context = await getPropertyManagerContext({ user, propertyId, requiredPermission: 'can_manage_properties' });
  if (!context?.authorized) throw fail(context?.statusCode || 403, context?.message || 'Property management access required.');
  return context;
};
const audit = (user, action, propertyId, requestId) => activity.log({userId:user.id,userType:user.user_type,action,entityType:'property',entityId:Number(propertyId),metadata:{update_request_id:requestId}});
const history = async (user, propertyId) => {
  const context = await manager(user, propertyId);
  const row = (await db.query('SELECT * FROM properties WHERE id=$1 AND landlord_id=$2 AND deleted_at IS NULL',[propertyId,context.landlordUserId])).rows[0];
  if (!row) throw fail(404,'Property not found.');
  const requests = (await db.query('SELECT * FROM property_update_requests WHERE property_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[propertyId])).rows;
  return {current:snapshot(row),requests};
};
const submit = async (user, propertyId, body) => {
  const context = await manager(user, propertyId);
  const changes = normalize(body);
  if (typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000) throw fail(400,'Explain what changed and why (5–2,000 characters).');
  const client = await db.connect();
  let result;
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM properties WHERE id=$1 AND landlord_id=$2 AND deleted_at IS NULL FOR UPDATE',[propertyId,context.landlordUserId])).rows[0];
    if (!row) throw fail(404,'Property not found.');
    if ((await client.query("SELECT id FROM property_update_requests WHERE property_id=$1 AND status='pending'",[propertyId])).rows.length) throw fail(409,'This property already has an update awaiting approval. Withdraw it before submitting another.');
    const before = snapshot(row), proposed = {...before,...changes};
    if (isDeepStrictEqual(before,proposed)) throw fail(400,'No changes were made.');
    result = (await client.query('INSERT INTO property_update_requests(property_id,submitted_by,before_data,proposed_data,reason) VALUES($1,$2,$3::jsonb,$4::jsonb,$5) RETURNING *',[propertyId,user.id,JSON.stringify(before),JSON.stringify(proposed),body.reason.trim()])).rows[0];
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); if(error.code==='23505') throw fail(409,'An update is already awaiting approval.'); throw error; }
  finally { client.release(); }
  await audit(user,'PROPERTY_UPDATE_SUBMITTED',propertyId,result.id);
  await require('./notificationService').sendNotification(context.landlordUserId,'Property update submitted','Your property changes are awaiting admin approval.','general',Number(propertyId),'property');
  return result;
};
const cancel = async (user, propertyId, requestId) => {
  const context = await manager(user,propertyId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT id FROM properties WHERE id=$1 AND landlord_id=$2 AND deleted_at IS NULL FOR UPDATE',[propertyId,context.landlordUserId])).rows[0];
    if(!row) throw fail(404,'Property not found.');
    const result = await client.query("UPDATE property_update_requests SET status='cancelled',reviewed_at=NOW() WHERE id=$1 AND property_id=$2 AND status='pending' RETURNING id",[requestId,propertyId]);
    if(!result.rows.length) throw fail(409,'This update is no longer pending.');
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
  await audit(user,'PROPERTY_UPDATE_WITHDRAWN',propertyId,requestId);
};
const adminHistory = async (propertyId, scope) => {
  const idIndex = scope.params.length + 1;
  const row = (await db.query(`SELECT * FROM properties WHERE deleted_at IS NULL ${scope.clause} AND id=$${idIndex}`,[...scope.params,propertyId])).rows[0];
  if(!row) throw fail(404,'Property not found or outside your assigned area.');
  const requests = (await db.query('SELECT * FROM property_update_requests WHERE property_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[propertyId])).rows;
  return {current:snapshot(row),requests};
};
const review = async (user, propertyId, requestId, body, scope) => {
  if(!['approved','rejected'].includes(body.decision)) throw fail(400,'Choose approve or reject.');
  if(typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 2000) throw fail(400,'Enter a review note (5–2,000 characters).');
  const client = await db.connect();
  let request, row;
  try {
    await client.query('BEGIN');
    row = (await client.query(`SELECT * FROM properties WHERE deleted_at IS NULL ${scope.clause} AND id=$${scope.params.length+1} FOR UPDATE`,[...scope.params,propertyId])).rows[0];
    if(!row) throw fail(404,'Property not found or outside your assigned area.');
    request = (await client.query("SELECT * FROM property_update_requests WHERE id=$1 AND property_id=$2 AND status='pending' FOR UPDATE",[requestId,propertyId])).rows[0];
    if(!request) throw fail(409,'This update has already been reviewed or withdrawn.');
    if(String(request.submitted_by)===String(user.id) || String(row.landlord_id)===String(user.id)) throw fail(403,'Another authorized administrator must review your property update.');
    if(body.decision==='approved') {
      if(!isDeepStrictEqual(snapshot(row),request.before_data)) throw fail(409,'The property changed after this request. Reject it and ask for a new submission.');
      if(scope.params.length && String(request.before_data.state_id)!==String(request.proposed_data.state_id)) throw fail(403,'A Super Admin must approve a change to another state.');
      if(scope.clause.includes('lga_name') && request.before_data.lga_name!==request.proposed_data.lga_name) throw fail(403,'An administrator covering both areas must review this location change.');
      const changed = fields.filter(key=>!isDeepStrictEqual(request.before_data[key],request.proposed_data[key]));
      const values = changed.map(key=>['amenities','structured_features'].includes(key)?JSON.stringify(request.proposed_data[key]):request.proposed_data[key]);
      if(!changed.length) throw fail(409,'There are no changes to approve.');
      await client.query(`UPDATE properties SET ${changed.map((key,i)=>`${key}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${values.length+1}`,[...values,propertyId]);
    }
    await client.query('UPDATE property_update_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW() WHERE id=$4',[body.decision,user.id,body.note.trim(),requestId]);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  await audit(user,body.decision==='approved'?'PROPERTY_UPDATE_APPROVED':'PROPERTY_UPDATE_REJECTED',propertyId,requestId);
  await require('./notificationService').sendNotification(row.landlord_id,'Property update '+body.decision,body.note.trim(),'general',Number(propertyId),'property');
  return {status:body.decision};
};
const handler = fn => async (req,res) => {
  try {
    for(const value of Object.values(req.params||{})) if(!/^[1-9]\d*$/.test(String(value))) throw fail(400,'Invalid property update identifier.');
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:await fn(req)});
  }
  catch(error) {if(!error.statusCode) req.logger?.error('Property update request failed',{message:error.message});res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Unable to process the property update.'});}
};
module.exports={normalize,snapshot,history,submit,cancel,adminHistory,review,handler};
