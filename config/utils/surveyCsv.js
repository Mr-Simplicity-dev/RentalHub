const {surveyResponse}=require('./surveyContact');
const escape=value=>{let text=value===null||value===undefined?'':String(value);if(/^\s*[=+@-]|^[\t\r\n]/.test(text))text="'"+text;return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
function buildSurveyCsv(rows,questions){
 const header=['respondent_code','source','admin_mode','admin_date','state','lga','respondent_name','respondent_phone','respondent_email','respondent_location','respondent_state_of_origin','agent_name','agent_phone','agent_lga','agent_location','created_at','completed_at','time_spent_seconds',...questions.map(q=>q.key)];
 const lines=[header.map(escape).join(',')];
 for(const raw of rows){const row=surveyResponse(raw),answers=raw.answers||{};
  const values=[row.respondent_code,row.source,row.admin_mode,row.admin_date,row.state_name||row.state,row.lga_name,row.respondent_name,row.respondent_phone,row.email_status==='no_email'?'NO_EMAIL':row.respondent_email,row.respondent_location,row.respondent_state_of_origin,row.agent_display,row.agent_phone,row.agent_lga,row.agent_location,row.created_at,row.completed_at,row.time_spent_seconds,...questions.map(q=>Array.isArray(answers[q.key])?answers[q.key].join('; '):answers[q.key])];
  lines.push(values.map(escape).join(','));
 }
 return '\uFEFF'+lines.join('\n');
}
module.exports={buildSurveyCsv};
