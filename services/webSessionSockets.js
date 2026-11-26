const jwt=require('jsonwebtoken');
const sessions=require('./webAuthSessions');
const authorize=async(socket,claims)=>{
 if(!claims.sid)return null;
 const row=await sessions.getService().validateAccess(claims,socket.handshake?.auth?.sessionId);
 socket.webSession=row;socket.webClaims=claims;return row;
};
const attach=socket=>{
 const row=socket.webSession,claims=socket.webClaims;if(!row)return;
 socket.join('auth-session:'+row.id);
 if(row.impersonated_by)socket.join('auth-actor:'+row.impersonated_by);
 const deadline=Math.min(claims.exp*1000,Date.parse(row.expires_at),Date.parse(row.idle_expires_at),row.authority_expires_at?Date.parse(row.authority_expires_at):Infinity,row.authority_idle_expires_at?Date.parse(row.authority_idle_expires_at):Infinity);
 const timer=setTimeout(()=>socket.disconnect(true),Math.max(1,deadline-Date.now()));timer.unref?.();
 socket.once('disconnect',()=>clearTimeout(timer));
 socket.use(async(_packet,next)=>{try{await sessions.getService().validateAccess(claims,socket.handshake?.auth?.sessionId);next();}catch{next(new Error('Session is no longer active'));socket.disconnect(true);}});
};
function createRevocationListener({io,db,logger={error(){}}}){
 let client=null,stopped=false,connecting=false,retry=null;
 const schedule=()=>{if(!stopped&&!retry){retry=setTimeout(()=>{retry=null;void start();},2000);retry.unref?.();}};
 const start=async()=>{
  if(stopped||client||connecting)return;connecting=true;
  try{
   const c=await db.connect();if(stopped){c.release();return;}client=c;
   c.on('notification',notice=>{
    if(notice.channel==='rentalhub_auth_session_revoked'&&sessions.UUID_PATTERN.test(notice.payload||''))io.in('auth-session:'+notice.payload).disconnectSockets(true);
    if(notice.channel==='rentalhub_auth_user_revoked'&&/^\d+$/.test(notice.payload||'')){io.in('user:'+notice.payload).disconnectSockets(true);io.in('auth-actor:'+notice.payload).disconnectSockets(true);}
   });
   const reconnect=()=>{if(client!==c)return;client=null;try{c.release(true);}catch{}schedule();};
   c.once('error',reconnect);c.once('end',reconnect);
   await c.query('LISTEN rentalhub_auth_session_revoked');await c.query('LISTEN rentalhub_auth_user_revoked');
  }catch{if(client){try{client.release(true);}catch{}client=null;}logger.error('Authentication session listener will retry');schedule();}finally{connecting=false;}
 };
 const stop=async()=>{stopped=true;clearTimeout(retry);retry=null;if(client){const c=client;client=null;try{await c.query('UNLISTEN rentalhub_auth_session_revoked');await c.query('UNLISTEN rentalhub_auth_user_revoked');}finally{c.release();}}};
 return{start,stop};
}
module.exports={authorize,attach,createRevocationListener};
