const crypto = require('crypto');
const roles = new Set(['super_admin','super_support_admin','zonal_admin','state_support_admin','lga_support_admin']);
const supervisors = new Set(['super_admin','super_support_admin']);
const fail = (status,message) => Object.assign(new Error(message),{statusCode:status});
const phoneKey = value => {
 const raw=String(value||'').trim().replace(/[\s()-]/g,'');
 if(/^0[789]\d{9}$/.test(raw))return '+234'+raw.slice(1);
 if(/^234[789]\d{9}$/.test(raw))return '+'+raw;
 if(/^\+[1-9]\d{7,14}$/.test(raw))return raw;
 return null;
};
const safeUser = user => ({id:user.id,email:user.email,phone:user.phone,full_name:user.full_name,user_type:user.user_type,assisted_registration:user.assisted_registration===true,registration_payment_required:user.registration_payment_required===true});
const validateAccount = body => {
 if(!['tenant','landlord'].includes(body.user_type))throw fail(400,'Only tenant and landlord accounts can be assisted');
 if(!String(body.full_name||'').trim()||String(body.full_name).length>255)throw fail(400,'Enter the full name');
 if(!phoneKey(body.phone))throw fail(400,'Enter a valid phone number');
 if(body.email && !require('validator').isEmail(String(body.email)))throw fail(400,'Enter a valid email or leave it empty');
 if(body.consent_confirmed!==true)throw fail(400,'Explain registration and obtain the customer’s agreement first');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id||''))throw fail(400,'A registration request identifier is required');
};
const otpHash = (id,code) => crypto.createHmac('sha256',process.env.JWT_SECRET).update(id+':'+code).digest('hex');
const requireScope = (actor,location) => {
 if(!roles.has(actor?.user_type))throw fail(403,'Support registration access required');
 if(supervisors.has(actor.user_type))return;
 const norm=value=>String(value||'').trim().toLowerCase();
 if(actor.user_type==='zonal_admin'){
  if(!require('../config/utils/territorialZones').canonicalZone(actor.assigned_zone)||!require('../config/utils/territorialZones').zoneContainsState(actor.assigned_zone,location.state_name))throw fail(403,'This customer is outside your assigned zone');
 }else{
  if(!norm(actor.assigned_state)||norm(actor.assigned_state)!==norm(location.state_name))throw fail(403,'This customer is outside your assigned state');
  if(actor.user_type==='lga_support_admin' && (!norm(actor.assigned_lga||actor.assigned_city)||norm(actor.assigned_lga||actor.assigned_city)!==norm(location.lga_name)))throw fail(403,'This customer is outside your assigned local government area');
 }
};
module.exports={roles,supervisors,phoneKey,safeUser,validateAccount,otpHash,requireScope,fail};
