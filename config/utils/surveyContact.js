const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function surveyContact(contact={}) {
 const email=clean(contact.email,255).toLowerCase();
 return {name:clean(contact.name,200),phone:clean(contact.phone,30).replace(/\s+/g,''),email:contact.no_email===true?'':email,hasEmail:contact.no_email===true?false:email?true:null,location:clean(contact.location,255),origin:clean(contact.state_of_origin,120)};
}
function surveyResponse(row={}) {
 const result={...row};
 for(const [field,fallback]of [['respondent_name','user_full_name'],['respondent_phone','user_phone'],['respondent_email','user_email']]) result[field]=clean(row[field],255)||clean(row[fallback],255)||null;
 result.respondent_location=clean(row.respondent_location,255)||[row.lga_name,row.state_name].filter(Boolean).join(', ')||null;
 result.email_status=result.respondent_email?'provided':row.has_email===false&&Boolean(row.completed_at||row.consent_flags?.contact_no_email)?'no_email':'not_provided';
 result.agent_display=row.agent_name||(!row.agent_user_id&&['public_link','online'].includes(row.source)?'Self-service':null);
 result.answer_count=Object.keys(row.answers&&typeof row.answers==='object'?row.answers:{}).length;
 result.missing_fields=['respondent_name','respondent_phone','respondent_email','respondent_location','respondent_state_of_origin'].filter(key=>!result[key]&&!(key==='respondent_email'&&result.email_status==='no_email'));
 delete result.answers;delete result.consent_flags;
 return result;
}
module.exports={surveyContact,surveyResponse};
