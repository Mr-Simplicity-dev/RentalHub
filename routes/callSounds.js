const express=require('express');const rateLimit=require('express-rate-limit');
const {authenticate,requireSuperAdmin}=require('../config/middleware/auth');
const db=require('../config/middleware/database');const {logAction}=require('../config/utils/auditLogger');const service=require('../services/callSoundService');
const router=express.Router();router.use(authenticate,rateLimit({windowMs:60000,max:90,standardHeaders:true,legacyHeaders:false}));
const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store, private');try{await fn(req,res);}catch(e){res.status(e.statusCode||500).json({success:false,message:e.statusCode?e.message:'Call settings are temporarily unavailable.'});}};
router.get('/call-sounds',handle(async(req,res)=>res.json({success:true,data:await service.settings(req.user)})));
router.patch('/call-sounds/preference',handle(async(req,res)=>res.json({success:true,data:await service.savePreference(req.user,req.body?.sound)})));
router.patch('/call-sounds/admin',requireSuperAdmin,handle(async(req,res)=>{
 const input=req.body?.policy;if(!input||Object.keys(input).some(k=>!Object.hasOwn(service.DEFAULT_POLICY,k))||Object.values(input).some(v=>typeof v!=='boolean'))return res.status(400).json({success:false,message:'Use the call sound switches to save valid settings.'});
 const current=(await service.settings(req.user)).policy;const policy={...current,...input};
 await db.query("INSERT INTO app_settings(key,value) VALUES('call_sound_policy',$1) ON CONFLICT(key) DO UPDATE SET value=app_settings.value || $2::jsonb,updated_at=NOW()",[JSON.stringify(policy),JSON.stringify(input)]);
 await logAction({actorId:req.user.id,action:'CALL_SOUND_POLICY_UPDATED',targetType:'call_sound_policy',ip:req.ip});
 res.json({success:true,data:await service.settings(req.user)});
}));
router.get('/calls/ringing',handle(async(req,res)=>{
 const rows=(await db.query("SELECT room_state FROM call_sessions WHERE receiver_id=$1 AND status='ringing' AND requested_at>NOW()-($2::integer*INTERVAL '1 millisecond') ORDER BY requested_at DESC LIMIT 1",[req.user.id,Number(process.env.CALL_RING_TIMEOUT_MS||45000)])).rows;
 const call=rows[0]?.room_state;res.json({success:true,data:service.recoverInvitation(call,req.user.id)});
}));
router.get('/calls/:callId',handle(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.callId))return res.status(404).json({success:false,message:'Call is no longer available.'});
 const call=await require('../services/callStateBridge').getBridge().load(req.params.callId);
 const recovered=service.recoverInvitation(call,req.user.id);
 if(!recovered)return res.status(404).json({success:false,message:'Call is no longer available.'});
 res.json({success:true,data:recovered});
}));
module.exports=router;
