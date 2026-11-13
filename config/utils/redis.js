// In-process fallback. Entries expire, but this store is not shared across workers.
function createMemoryRedis({now = Date.now} = {}) {
  const values = new Map(), expires = new Map();
  const alive = key => { if(expires.has(key) && expires.get(key)<=now()){values.delete(key);expires.delete(key);} return values.has(key); };
  const remove = key => { const existed=values.delete(key);expires.delete(key);return Number(existed); };
  const ttl = (key,ms) => {if(!alive(key))return 0;if(!Number.isFinite(ms))throw Error('Invalid expiry');if(ms<=0)return remove(key);expires.set(key,now()+ms);return 1;};
  return {
    get: async key => alive(key) ? values.get(key) : null,
    set: async (key,value,...args) => {let duration;for(let i=0;i<args.length;i++){const option=String(args[i]).toUpperCase();if(option==='EX')duration=Number(args[++i])*1000;else if(option==='PX')duration=Number(args[++i]);else throw Error('Unsupported memory store option');}if(duration!==undefined&&(!Number.isFinite(duration)||duration<=0))throw Error('Invalid expiry');values.set(key,value);expires.delete(key);if(duration!==undefined)expires.set(key,now()+duration);return 'OK';},
    del: async key => remove(key),
    incr: async key => {const value=Number(alive(key)?values.get(key):0)+1;values.set(key,value);return value;},
    decr: async key => {const value=Math.max(Number(alive(key)?values.get(key):0)-1,0);values.set(key,value);return value;},
    expire: async (key,seconds) => ttl(key,Number(seconds)*1000),
    pexpire: async (key,milliseconds) => ttl(key,Number(milliseconds)),
    pttl: async key => !alive(key) ? -2 : expires.has(key) ? Math.max(0,expires.get(key)-now()) : -1,
    ping: async () => 'PONG', connect: async()=>{}, quit: async()=>{},
    sweep: () => {for(const key of expires.keys())alive(key);},
  };
}
const redis=createMemoryRedis();
const expiryCleanup=setInterval(()=>redis.sweep(),60000);expiryCleanup.unref?.();
module.exports=redis;
module.exports.createMemoryRedis=createMemoryRedis;
