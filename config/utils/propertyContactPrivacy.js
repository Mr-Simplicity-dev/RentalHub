const policy=require('./contactPolicy');
const CONTACT_KEY=/^(?:(?:landlord|owner|tenant|agent|contact|property_contact|opened_by|against|actor|assigned_by|lawyer)_?)?(?:email|email_address|phone|phone_number|mobile|mobile_number|whatsapp|whatsapp_number)$/i;
const TEXT_FIELDS=new Set(['title','description','full_address','note','message','resolution_note','lawyer_summary','content','details','amenities','structured_features']);
const HIDDEN='Contact information hidden. Please use RentalHub support.';
const redactContactText=value=>{
 if(!policy.inspect(value).blocked)return value;
 const cleaned=value.replace(/[^\s@<>()\[\]]+\s*@\s*[^\s@.]+(?:\s*\.\s*[^\s@.]+)+/gu,'[private contact]').replace(/\+?[\p{Nd}][\p{Nd}\s().-]{7,35}[\p{Nd}]/gu,match=>policy.hasPhone(match)?'[private contact]':match);
 return policy.inspect(cleaned).blocked?HIDDEN:cleaned;
};
const removePropertyContacts=(value,textContext=false)=>{
 if(typeof value==='string')return textContext?redactContactText(value):value;
 if(Array.isArray(value))return value.map(item=>removePropertyContacts(item,textContext));
 if(!value||typeof value!=='object'||value instanceof Date||Buffer.isBuffer(value))return value;
 return Object.fromEntries(Object.entries(value)
  .filter(([key,item])=>(!CONTACT_KEY.test(key)||key==='mobile'&&typeof item==='object')&&(!textContext||!policy.inspect(key).blocked))
  .map(([key,item])=>[key,removePropertyContacts(item,textContext||TEXT_FIELDS.has(key))]));
};
const hidePropertyContacts=(_req,res,next)=>{const json=res.json;res.json=function(body){return json.call(this,removePropertyContacts(body));};next();};
module.exports={removePropertyContacts,hidePropertyContacts};
