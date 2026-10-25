const normalizeWhatsAppPhone = value => {
 const raw=String(value || '').trim();if(!raw || /[a-z]/i.test(raw))return null;
 let digits=raw.replace(/[^\d]/g,'');if(digits.startsWith('00'))digits=digits.slice(2);
 if(/^0[789]\d{9}$/.test(digits))digits='234'+digits.slice(1);
 if(/^[789]\d{9}$/.test(digits) && !raw.startsWith('+'))digits='234'+digits;
 return /^[1-9]\d{7,14}$/.test(digits)?digits:null;
};
const nextDeliveryStatus=(current,incoming)=>{
 if(current==='read')return current;
 if(current==='delivered')return incoming==='read'?'read':current;
 if(incoming==='delivered' || incoming==='read')return incoming;
 if(current==='failed' && incoming==='sent')return current;
 return incoming;
};
const retryableWhatsAppError=({code,httpStatus}={})=>[4,17,130429,131000,131016].includes(Number(code)) || Number(httpStatus)===429 || Number(httpStatus)>=500;
module.exports={normalizeWhatsAppPhone,nextDeliveryStatus,retryableWhatsAppError};
