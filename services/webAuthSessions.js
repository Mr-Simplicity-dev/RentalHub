const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const TAB_HEADER = 'x-rentalhub-session-id';
const ID_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ABSOLUTE_MS = 24 * 60 * 60 * 1000;
const IDLE_MS = 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const secretValue = () => crypto.randomBytes(32).toString('hex');
const denied = () => Object.assign(new Error('Please sign in again.'), { statusCode: 401, code: 'AUTH_SESSION_INVALID' });
const nativeRequest = req => String(req?.headers?.['x-rentalhub-client'] || req?.headers?.['x-client-platform'] || '').toLowerCase() === 'native';
const tabId = req => {
  const value = req?.headers?.[TAB_HEADER];
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
};
const cookies = header => Object.fromEntries(String(header || '').split(';').flatMap(part => {
  const index = part.indexOf('=');
  if (index < 1) return [];
  try { return [[part.slice(0,index).trim(),decodeURIComponent(part.slice(index+1).trim())]]; }
  catch { return []; }
}));
const cookieName = id => { if (!ID_PATTERN.test(id || '')) throw denied(); return 'rh_refresh_' + id; };
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function createService({ db, signingKey = process.env.JWT_SECRET, now = Date.now, production = process.env.NODE_ENV === 'production' }) {
  const originalDb=db;
  const protect = query => async (...args) => {try{return await query(...args);}catch{throw Object.assign(new Error('Authentication is temporarily unavailable.'),{statusCode:503,code:'AUTH_CHECK_UNAVAILABLE'});}};
  db={query:protect((...args)=>originalDb.query(...args)),connect:async()=>{let client;try{client=await originalDb.connect();}catch{throw Object.assign(new Error('Authentication is temporarily unavailable.'),{statusCode:503,code:'AUTH_CHECK_UNAVAILABLE'});}return{query:protect((...args)=>client.query(...args)),release:()=>client.release()};}};
  const csrf = row => crypto.createHmac('sha256',signingKey).update('rentalhub:web-csrf:' + row.id + ':' + row.public_id_hash).digest('hex');
  const csrfMatches = (row,value) => typeof value === 'string' && ID_PATTERN.test(value) && same(row.csrf_hash,digest(value));
  const cookieOptions = maxAge => ({ httpOnly: true, secure: production, sameSite: 'lax', path: '/api/auth', ...(maxAge !== undefined ? { maxAge } : {}) });
  const clearCookie = (res,id) => res.clearCookie(cookieName(id),cookieOptions());
  const writeCookie = (res,id,value,expiresAt) => res.cookie(cookieName(id),value,cookieOptions(Math.max(0,Date.parse(expiresAt)-now())));
  const live = (row,{ parked = false } = {}) => {
    if (!row || row.client_type !== 'web' || row.revoked_at || (!parked && row.parked_at) || Date.parse(row.expires_at) <= now() || Date.parse(row.idle_expires_at) <= now() || row.user_active !== true || row.user_deleted || Number(row.token_version) !== Number(row.user_token_version)) throw denied();
    return row;
  };
  const checkParent = async (row,executor=db) => {
    if(!row.impersonation_parent_id)return;
    const parent=(await executor.query('SELECT s.*,u.is_active AS user_active,u.deleted_at AS user_deleted,COALESCE(u.token_version,1) AS user_token_version FROM authentication_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1',[row.impersonation_parent_id])).rows[0];
    live(parent,{parked:true});
    if(Number(parent.user_id)!==Number(row.impersonated_by))throw denied();
    row.authority_expires_at=parent.expires_at;row.authority_idle_expires_at=parent.idle_expires_at;
  };
  const selection = `SELECT s.*, u.user_type, u.is_active AS user_active, u.deleted_at AS user_deleted, COALESCE(u.token_version,1) AS user_token_version FROM authentication_sessions s JOIN users u ON u.id=s.user_id`;
  const find = async (id,executor=db,lock=false) => {
    if (!ID_PATTERN.test(id || '')) throw denied();
    return (await executor.query(selection+' WHERE s.public_id_hash=$1'+(lock?' FOR UPDATE OF s':''),[digest(id)])).rows[0];
  };
  const transaction = async fn => {
    const client=await db.connect();
    try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  const access = row => jwt.sign({ userId:row.user_id,userType:row.user_type,tv:Number(row.token_version),purpose:'session',sid:row.id,...(row.impersonation_parent_id?{impersonation:true,impersonatedBy:row.impersonated_by}:{}) },signingKey,{expiresIn:Math.max(1,Math.min(600,Math.floor((Math.min(Date.parse(row.expires_at),row.authority_expires_at?Date.parse(row.authority_expires_at):Infinity)-now())/1000)))});
  const response = (row,id,data={}) => ({...data,token:access(row),csrf_token:csrf(row),web_session_id:id,...(row.impersonation_parent_id?{impersonation:true}:{})});
  const create = async (req,res,data,{ parentId=null,maxAge=ABSOLUTE_MS }={}) => {
    if (!tabId(req)) throw denied();
    const existingCookies=cookies(req.headers.cookie);
    const count=Object.keys(existingCookies).filter(name=>/^rh_refresh_[a-f0-9]{64}$/.test(name)).length;
    if(count>=24&&(parentId||!existingCookies[cookieName(tabId(req))]))throw Object.assign(new Error('Sign out unused tabs before opening another account.'),{statusCode:429});
    const identity=jwt.verify(data.token,signingKey,{algorithms:['HS256']});
    if(identity.purpose!=='session'||!Number.isSafeInteger(Number(identity.userId)))throw denied();
    const id=secretValue(),refresh=secretValue(),recordId=crypto.randomUUID();
    const row=await transaction(async client=>{
      const user=(await client.query('SELECT id,user_type,is_active,deleted_at,COALESCE(token_version,1) AS token_version FROM users WHERE id=$1 FOR UPDATE',[identity.userId])).rows[0];
      if(!user||user.is_active!==true||user.deleted_at||Number(identity.tv)!==Number(user.token_version))throw denied();
      const previous=await find(tabId(req),client,true);
      if(parentId){
        if(!previous||previous.id!==parentId||previous.user_id!==Number(identity.impersonatedBy))throw denied();
        live(previous);await client.query('UPDATE authentication_sessions SET parked_at=NOW() WHERE id=$1',[parentId]);
      }else if(previous&&!previous.revoked_at){
        const credential=cookies(req.headers.cookie)[cookieName(tabId(req))];
        if(credential&&same(previous.refresh_hash,digest(credential)))await client.query("UPDATE authentication_sessions SET revoked_at=NOW(),revocation_reason='account_switch' WHERE id=$1",[previous.id]);
      }
      const created=new Date(now()),expires=new Date(now()+Math.min(ABSOLUTE_MS,maxAge)),idle=new Date(Math.min(expires.getTime(),now()+IDLE_MS));
      const candidate={id:recordId,public_id_hash:digest(id),user_id:user.id,user_type:user.user_type,client_type:'web',token_version:Number(user.token_version),refresh_hash:digest(refresh),family_id:recordId,created_at:created.toISOString(),expires_at:expires.toISOString(),idle_expires_at:idle.toISOString(),impersonation_parent_id:parentId,impersonated_by:identity.impersonatedBy};
      if(parentId){candidate.authority_expires_at=previous.expires_at;candidate.authority_idle_expires_at=previous.idle_expires_at;}
      candidate.csrf_hash=digest(csrf(candidate));
      await client.query(`INSERT INTO authentication_sessions(id,public_id_hash,user_id,client_type,token_version,refresh_hash,csrf_hash,family_id,created_at,last_used_at,expires_at,idle_expires_at,impersonation_parent_id,impersonated_by) VALUES($1,$2,$3,'web',$4,$5,$6,$7,$8,$8,$9,$10,$11,$12)`,[candidate.id,candidate.public_id_hash,candidate.user_id,candidate.token_version,candidate.refresh_hash,candidate.csrf_hash,candidate.family_id,candidate.created_at,candidate.expires_at,candidate.idle_expires_at,parentId,identity.impersonatedBy||null]);
      return candidate;
    });
    writeCookie(res,id,refresh,row.expires_at);
    if(!parentId)clearCookie(res,tabId(req));
    return response(row,id,data);
  };
  const validateAccess = async (decoded,id,{ touch=true }={}) => {
    if(!UUID_PATTERN.test(decoded?.sid || '')||!Number.isFinite(decoded.exp))throw denied();
    const row=live(await find(id));
    await checkParent(row);
    if(row.id!==decoded.sid||Number(row.user_id)!==Number(decoded.userId)||Number(row.token_version)!==Number(decoded.tv))throw denied();
    if(touch)await db.query("UPDATE authentication_sessions SET last_used_at=NOW(),idle_expires_at=LEAST(expires_at,NOW()+INTERVAL '1 hour') WHERE id=$1 AND revoked_at IS NULL AND last_used_at<NOW()-INTERVAL '1 minute'",[row.id]);
    return row;
  };
  const bootstrap = async (req,res) => {
    const id=tabId(req),credential=id&&cookies(req.headers.cookie)[cookieName(id)];
    if(!credential||!ID_PATTERN.test(credential))throw denied();
    const row=live(await find(id));
    await checkParent(row);
    if(!same(row.refresh_hash,digest(credential)))throw denied();
    return response(row,id);
  };
  const verifyCsrf = async req => {
    const row=live(await find(tabId(req)));
    if(!csrfMatches(row,req.headers['x-csrf-token']))throw Object.assign(denied(),{statusCode:403});
    return row;
  };
  const refresh = async (req,res) => {
    const id=tabId(req),credential=id&&cookies(req.headers.cookie)[cookieName(id)];
    if(!credential||!ID_PATTERN.test(credential))throw denied();
    const next=secretValue();
    const result=await transaction(async client=>{
      const row=live(await find(id,client,true));
      await checkParent(row,client);
      if(!csrfMatches(row,req.headers['x-csrf-token']))throw Object.assign(denied(),{statusCode:403});
      if(!same(row.refresh_hash,digest(credential))){
        await client.query("UPDATE authentication_sessions SET revoked_at=NOW(),revocation_reason='refresh_credential_reuse' WHERE id=$1",[row.id]);
        return {reused:true};
      }
      await client.query("UPDATE authentication_sessions SET previous_refresh_hash=refresh_hash,refresh_hash=$2,rotation_count=rotation_count+1,rotated_at=NOW(),last_used_at=NOW(),idle_expires_at=LEAST(expires_at,NOW()+INTERVAL '1 hour') WHERE id=$1",[row.id,digest(next)]);
      return {row};
    });
    if(result.reused){clearCookie(res,id);throw denied();}
    writeCookie(res,id,next,result.row.expires_at);return response(result.row,id);
  };
  const revoke = async (req,res,reason='logout') => {
    const id=tabId(req);if(!id||!req.auth?.sid)throw denied();
    const current=await find(id);
    if(!current||current.id!==req.auth.sid||Number(current.user_id)!==Number(req.auth.userId))throw denied();
    await db.query('UPDATE authentication_sessions SET revoked_at=COALESCE(revoked_at,NOW()),revocation_reason=COALESCE(revocation_reason,$2) WHERE public_id_hash=$1',[digest(id),reason]);
    clearCookie(res,id);
  };
  const revokeWithCookie = async (req,res) => {
    const id=tabId(req),credential=id&&cookies(req.headers.cookie)[cookieName(id)];
    if(!credential||!ID_PATTERN.test(credential))throw denied();
    await transaction(async client=>{
      const row=live(await find(id,client,true));
      if(!csrfMatches(row,req.headers['x-csrf-token']))throw Object.assign(denied(),{statusCode:403});
      const hash=digest(credential);
      if(!same(row.refresh_hash,hash)&&!same(row.previous_refresh_hash,hash))throw denied();
      await client.query("UPDATE authentication_sessions SET revoked_at=NOW(),revocation_reason='logout' WHERE id=$1",[row.id]);
    });
    clearCookie(res,id);
  };
  const restoreImpersonation = async (req,res) => {
    const id=tabId(req);
    const original=await transaction(async client=>{
      const child=live(await find(id,client,true));
      if(child.id!==req.auth?.sid||!child.impersonation_parent_id||!child.impersonated_by)throw denied();
      const parent=(await client.query(selection+' WHERE s.id=$1 FOR UPDATE OF s',[child.impersonation_parent_id])).rows[0];
      live(parent,{parked:true});
      if(Number(parent.user_id)!==Number(child.impersonated_by))throw denied();
      const jar=cookies(req.headers.cookie);
      const name=Object.keys(jar).find(name=>/^rh_refresh_[a-f0-9]{64}$/.test(name)&&digest(name.slice('rh_refresh_'.length))===parent.public_id_hash);
      if(!name||!same(parent.refresh_hash,digest(jar[name])))throw denied();
      await client.query("UPDATE authentication_sessions SET revoked_at=NOW(),revocation_reason='impersonation_return' WHERE id=ANY($1::uuid[])",[[child.id,parent.id]]);
      return {parent,publicId:name.slice('rh_refresh_'.length)};
    });
    const token=jwt.sign({userId:original.parent.user_id,userType:original.parent.user_type,tv:Number(original.parent.token_version),purpose:'session'},signingKey,{expiresIn:'1m'});
    const data=await create(req,res,{token},{maxAge:Math.max(1,Date.parse(original.parent.expires_at)-now())});
    clearCookie(res,original.publicId);
    return data;
  };
  const cleanup = async ({limit=100,dryRun=true}={}) => {
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid cleanup batch');
    const selected=await db.query("SELECT id FROM authentication_sessions WHERE expires_at<NOW()-INTERVAL '7 days' OR revoked_at<NOW()-INTERVAL '7 days' ORDER BY expires_at LIMIT $1",[limit]);
    if(!dryRun&&selected.rows.length)await db.query('DELETE FROM authentication_sessions WHERE id=ANY($1::uuid[])',[selected.rows.map(row=>row.id)]);
    return {candidates:selected.rows.length,dryRun};
  };
  return {create,revokeWithCookie,restoreImpersonation,validateAccess,bootstrap,verifyCsrf,refresh,revoke,cleanup,find,live,response,csrfMatches,clearCookie,transaction};
}
let instance;
const getService=()=>instance||(instance=createService({db:require('../config/middleware/database')}));
module.exports={createService,getService,TAB_HEADER,ID_PATTERN,UUID_PATTERN,digest,nativeRequest,tabId,cookieName,cookies,denied};
