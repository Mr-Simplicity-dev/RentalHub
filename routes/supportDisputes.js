const router=require('express').Router({mergeParams:true});
const {authenticate}=require('../config/middleware/auth');
const {sensitiveActionLimiter}=require('../config/middleware/securityRateLimiters');
const service=require('../services/supportDisputeHandoverService');
const handler=method=>async(req,res,next)=>{try{const result=await service[method](req);res.json({success:true,data:result});}catch(error){if(error.statusCode)return res.status(error.statusCode).json({success:false,code:error.code,message:error.message});next(error);}};
router.get('/',authenticate,handler('context'));
router.post('/',authenticate,sensitiveActionLimiter,require('../config/utils/twoFactor').requirePrivilegedMfa,handler('request'));
router.post('/:handoverId/respond',authenticate,sensitiveActionLimiter,handler('respond'));
module.exports=router;
