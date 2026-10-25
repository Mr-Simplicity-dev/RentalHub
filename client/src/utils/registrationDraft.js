export const REGISTRATION_DRAFT_KEY='rentalhub:registration-draft:v1';
export const REGISTRATION_DRAFT_TTL=24*60*60*1000;
const stringFields=['full_name','email','phone','lawyer_email','agent_full_name','agent_email','agent_phone','nationality','state_id','lga_name','referral_code'];
const booleanFields=['use_rentalhub_lawyers','use_rentalhub_agents','add_agent','is_foreigner'];
const storage=()=>typeof window==='undefined'?null:window.localStorage;
const sanitize=(form={})=>{
 const safe={};
 for(const field of stringFields)if(typeof form[field]==='string'||(field==='state_id'&&Number.isInteger(form[field])))safe[field]=String(form[field]).slice(0,1000);
 for(const field of booleanFields)if(typeof form[field]==='boolean')safe[field]=form[field];
 if(['tenant','landlord'].includes(form.user_type))safe.user_type=form.user_type;
 return safe;
};
export const clearRegistrationDraft=()=>{try{storage()?.removeItem(REGISTRATION_DRAFT_KEY);}catch{}};
export const readRegistrationDraft=(now=Date.now())=>{
 try{
  const raw=storage()?.getItem(REGISTRATION_DRAFT_KEY);if(!raw)return null;
  const saved=JSON.parse(raw);
  if(saved.version!==1||!Number.isFinite(saved.savedAt)||saved.savedAt>now||now-saved.savedAt>=REGISTRATION_DRAFT_TTL||!saved.form||Array.isArray(saved.form)||typeof saved.form!=='object'){clearRegistrationDraft();return null;}
  return{form:sanitize(saved.form),step:Math.min(3,Math.max(1,Number(saved.step)||1))};
 }catch{clearRegistrationDraft();return null;}
};
export const saveRegistrationDraft=(form,step,now=Date.now())=>{
 try{
  const safe=sanitize(form);
  const meaningful=stringFields.filter(f=>f!=='referral_code').some(f=>safe[f]?.trim())||safe.user_type==='landlord'||safe.is_foreigner===true;
  if(!meaningful){clearRegistrationDraft();return false;}
  const target=storage();if(!target)return false;
  target.setItem(REGISTRATION_DRAFT_KEY,JSON.stringify({version:1,savedAt:now,step:Math.min(4,Math.max(1,Number(step)||1)),form:safe}));return true;
 }catch{return false;}
};
