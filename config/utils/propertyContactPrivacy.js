const CONTACT_KEY = /^(?:(?:landlord|owner|tenant|agent|contact|property_contact|opened_by|against|actor|assigned_by|lawyer)_)?(?:email|phone|phone_number|mobile|mobile_number|whatsapp|whatsapp_number)$/i;
const removePropertyContacts = value => {
 if (Array.isArray(value)) return value.map(removePropertyContacts);
 if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
 return Object.fromEntries(Object.entries(value).filter(([key]) => !CONTACT_KEY.test(key)).map(([key,item]) => [key,typeof item==='string'&&['title','description','full_address','note','message'].includes(key)&&require('./contactPolicy').inspect(item).blocked?'Contact information hidden. Please use RentalHub support.':removePropertyContacts(item)]));
};
const hidePropertyContacts = (_req,res,next) => {
 const json=res.json;
 res.json=function(body){return json.call(this,removePropertyContacts(body));};
 next();
};
module.exports={removePropertyContacts,hidePropertyContacts};
