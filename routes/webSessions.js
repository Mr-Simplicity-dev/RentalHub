const express=require('express');
const {authenticate}=require('../config/middleware/auth');
const sessions=require('../services/webAuthSessions');
const router=express.Router();
const run=fn=>async(req,res)=>{
 res.set('Cache-Control','no-store, private');
 if(sessions.nativeRequest(req))return res.status(400).json({success:false,message:'Use native sign-in for this device.'});
 try{return res.json({success:true,data:await fn(req,res)});}
 catch(error){return res.status(error.statusCode||503).json({success:false,code:error.code,message:error.statusCode===401||error.statusCode===403?'Please sign in again.':'We could not check your sign-in. Please try again.'});}
};
router.get('/session',run((req,res)=>sessions.getService().bootstrap(req,res)));
router.post('/logout',(req,res,next)=>sessions.nativeRequest(req)?next():run(async(req,res)=>{await sessions.getService().revokeWithCookie(req,res);return {logged_out:true};})(req,res));
router.post('/impersonation/return',authenticate,run((req,res)=>sessions.getService().restoreImpersonation(req,res)));
module.exports=router;
