const validator=require('validator');
module.exports=function requirePaymentEmail(value){
 const email=String(value||'').trim().toLowerCase();
 if(!validator.isEmail(email))throw Object.assign(new Error('Card payments need your own email address. Use a supported bank transfer or wallet option, or contact support.'),{statusCode:400,code:'PAYMENT_EMAIL_REQUIRED'});
 return email;
};
