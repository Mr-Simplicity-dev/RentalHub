function createHandlers({authenticate,isPrivilegedRole,requirePrivilegedMfa}) {
 return [authenticate,(req,res,next)=>{if(!isPrivilegedRole(req.user?.user_type))return res.status(403).json({success:false,message:'Administrator access required.'});return requirePrivilegedMfa(req,res,next);},(_req,res)=>res.json({success:true,data:{verified:true}})];
}
function handlers(){const {authenticate}=require('../config/middleware/auth');const {isPrivilegedRole,requirePrivilegedMfa}=require('../config/utils/twoFactor');return createHandlers({authenticate,isPrivilegedRole,requirePrivilegedMfa});}
module.exports={createHandlers,handlers};
