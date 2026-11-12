const os=require('os'),path=require('path'),crypto=require('crypto');
function createRuntime({db,logger,cron,exit=code=>process.exit(code),timers={setInterval,clearInterval,setTimeout},env=process.env}){
 const owner=crypto.randomUUID(),jobs=new Map(),inflight=new Map();let leader=false,client=null,election=null,heartbeat=null,starting=false,stopping=false,onLead=null;
 const keyFor=(kind,schedule,fn)=>{const frame=(new Error().stack||'').split('\n').find(s=>/(jobs[\\/]|server\.js|scheduler\.js|conductPaymentService\.js|routes[\\/]support\.js)/.test(s));const location=frame?.match(/([^() ]+\.(?:js|cjs)):(\d+):\d+/);return (location?path.relative(path.resolve(__dirname,'..'),location[1]).replace(/\\/g,'/')+':'+location[2]:fn.name||'job')+':'+kind+':'+schedule;};
 async function register(key,kind,schedule){jobs.set(key,{key,kind,schedule});if(leader)await db.query(`INSERT INTO background_job_status(job_key,kind,schedule,registered_by,registered_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(job_key) DO UPDATE SET kind=$2,schedule=$3,registered_by=$4,registered_at=NOW()`,[key,kind,String(schedule),owner]);}
 async function execute(key,fn,args=[]){
  if(!leader||stopping||inflight.has(key))return {skipped:true};
  const work=(async()=>{const began=Date.now();try{
   await db.query("UPDATE background_job_status SET last_started_at=NOW(),last_status='running',last_error_code=NULL WHERE job_key=$1",[key]);
   const result=await fn(...args);
   if(result?.skipped){await db.query("UPDATE background_job_status SET last_finished_at=NOW(),last_status='skipped',last_error_code=$2 WHERE job_key=$1",[key,String(result.reason||'NOT_READY').replace(/[^a-zA-Z0-9_]/g,'_').slice(0,80)]);return result;}
   if(result?.errors>0||result?.ok===false)throw Object.assign(new Error('Job reported a failure'),{code:'JOB_REPORTED_FAILURE'});
   await db.query("UPDATE background_job_status SET last_finished_at=NOW(),last_status='completed',last_duration_ms=$2,success_count=success_count+1 WHERE job_key=$1",[key,Date.now()-began]);return result;
  }catch(error){logger.error('Background job failed',{job:key,code:error.code||'JOB_FAILED'});try{await db.query("UPDATE background_job_status SET last_finished_at=NOW(),last_status='failed',last_error_code=$2,failure_count=failure_count+1 WHERE job_key=$1",[key,String(error.code||'JOB_FAILED').slice(0,80)]);}catch{}return {errors:1};}})();
  inflight.set(key,work);try{return await work;}finally{inflight.delete(key);}
 }
 const schedule=(expression,fn,options={})=>{if(!cron.validate(expression))throw Error('Invalid background job schedule');const key=options.name||keyFor('cron',expression,fn);void register(key,'cron',expression).catch(e=>logger.error('Job registration failed',{code:e.code}));return cron.schedule(expression,(...args)=>execute(key,fn,args),{timezone:env.CRON_TIMEZONE||'Africa/Lagos',...options});};
 function interval(fn,ms){const key=keyFor('interval',ms,fn);void register(key,'interval',ms).catch(e=>logger.error('Job registration failed',{code:e.code}));const timer=timers.setInterval(()=>execute(key,fn),ms);timer.unref?.();return timer;}
 function timeout(fn,ms){const key=keyFor('startup',ms,fn);void register(key,'startup',ms).catch(e=>logger.error('Job registration failed',{code:e.code}));const timer=timers.setTimeout(()=>execute(key,fn),ms);timer.unref?.();return timer;}
 async function once(name,fn){await register(name,'startup','once');return execute(name,fn);}
 function lost(error){if(!leader||stopping)return;leader=false;logger.error('Background job leadership lost; restarting worker',{code:error?.code||'JOB_LEADER_LOST'});timers.setTimeout(()=>exit(1),1000).unref?.();}
 async function elect(){
  if(leader||starting||stopping)return;starting=true;let candidate;
  try{candidate=await db.connect();const locked=(await candidate.query('SELECT pg_try_advisory_lock(2047,1) AS locked')).rows[0]?.locked;if(!locked){candidate.release();return;}
   client=candidate;client.on?.('error',lost);client.on?.('end',()=>lost());
   await client.query(`INSERT INTO background_job_runtime(app,owner_id,host,process_id,pm_id,started_at,heartbeat_at,status) VALUES('rentalhub',$1,$2,$3,$4,NOW(),NOW(),'leader') ON CONFLICT(app) DO UPDATE SET owner_id=$1,host=$2,process_id=$3,pm_id=$4,started_at=NOW(),heartbeat_at=NOW(),status='leader'`,[owner,os.hostname(),process.pid,String(env.pm_id??'standalone')]);
   leader=true;for(const job of jobs.values())await register(job.key,job.kind,job.schedule);
   await onLead?.();logger.info('Background job leader elected',{owner,pm_id:env.pm_id??'standalone'});
   heartbeat=timers.setInterval(async()=>{if(!leader)return;try{await client.query("UPDATE background_job_runtime SET heartbeat_at=NOW() WHERE app='rentalhub' AND owner_id=$1",[owner]);}catch(e){lost(e);}},10000);heartbeat.unref?.();
  }catch(error){if(leader){lost(error);}else{try{if(candidate){await candidate.query('SELECT pg_advisory_unlock(2047,1)');candidate.release();}}catch{try{candidate?.release(true);}catch{}}logger.error('Background job election will retry',{code:error.code||'JOB_ELECTION_FAILED'});}}finally{starting=false;}
 }
 function start(fn){if(election)return;onLead=fn;election=timers.setInterval(elect,5000);election.unref?.();void elect();}
 async function stop(){stopping=true;leader=false;if(election)timers.clearInterval(election);if(heartbeat)timers.clearInterval(heartbeat);
  const drained=await Promise.race([Promise.allSettled([...inflight.values()]).then(()=>true),new Promise(resolve=>timers.setTimeout(()=>resolve(false),8000).unref?.())]);
  if(!drained)return false;
  if(client){try{await client.query("UPDATE background_job_runtime SET status='stopped',heartbeat_at=NOW() WHERE app='rentalhub' AND owner_id=$1",[owner]);await client.query('SELECT pg_advisory_unlock(2047,1)');}finally{client.release();client=null;}}return true;
 }
 return {cron:{schedule,validate:cron.validate},interval,timeout,once,start,stop,elect,execute,isLeader:()=>leader,owner};
}
const runtime=createRuntime({db:require('../config/middleware/database'),logger:require('../config/utils/logger'),cron:require('node-cron')});
module.exports={...runtime,createRuntime};
