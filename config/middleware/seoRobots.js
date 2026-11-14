const privatePath=/^\/(?:api|admin|super-admin|tenant(?:-dashboard)?|landlord(?:-dashboard)?|agent-dashboard|dashboard|profile|messages|wallet|notifications|settings|login|register)(?:\/|$)/;
module.exports=(req,res,next)=>{if(privatePath.test(req.path))res.set('X-Robots-Tag','noindex, nofollow');next();};
