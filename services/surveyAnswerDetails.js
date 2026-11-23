const survey=require('../config/survey');
function answerDetails(row){return Object.entries(row.answers||{}).map(([key,value])=>{
 const q=survey.getQuestionByKey(row.survey_type,key);
 const label=v=>q?.options?.find(option=>String(option.v)===String(v))?.en ?? String(v??'');
 return {key,question:q?.prompt?.en||key,answer:Array.isArray(value)?value.map(label).join(', '):value&&typeof value==='object'?JSON.stringify(value):label(value)};
});}
module.exports={answerDetails};
