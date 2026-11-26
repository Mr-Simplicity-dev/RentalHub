const STORAGE_KEY = 'rentalhub.web-session-id';
const MARKER = '__rentalhubAuthEntry';
const ID_PATTERN = /^[a-f0-9]{64}$/;
function createTabIdentity(win) {
  let current = null, pending = null, release = null;
  const fresh = () => Array.from(win.crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const navigationKey = () => win.navigation?.currentEntry?.key || null;
  const mark = () => {
    const key=navigationKey();
    if(key && win.history.state?.[MARKER]!==key) win.history.replaceState({...win.history.state,[MARKER]:key},'');
  };
  const own = async id => {
    if(!win.navigator.locks?.request)return false;
    const bytes=await win.crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
    const name='rentalhub-web-owner:'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
    return new Promise((resolve,reject)=>{
      win.navigator.locks.request(name,{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock){resolve(false);return;}
        return new Promise(done=>{release=done;resolve(true);});
      }).catch(reject);
    });
  };
  const save = id => {try{win.sessionStorage.setItem(STORAGE_KEY,id);}catch{}current=id;mark();};
  const initialize = async () => {
    if(current)return current;
    if(pending){await pending;return current;}
    pending=(async()=>{
      let stored;try{stored=win.sessionStorage.getItem(STORAGE_KEY);}catch{stored=null;}
      const navigation=win.performance?.getEntriesByType?.('navigation')?.[0]?.type;
      const canResume=ID_PATTERN.test(stored||'') && ['reload','back_forward'].includes(navigation) && navigationKey() && win.history.state?.[MARKER]===navigationKey() && !!win.navigator.locks?.request;
      if(canResume && await own(stored)){save(stored);return;}
      const id=fresh();
      if(win.navigator.locks?.request && !(await own(id)))throw Error('Could not establish an independent tab. Please reload.');
      save(id);
    })();
    try{await pending;return current;}finally{pending=null;}
  };
  const replace = async id => {
    if(!ID_PATTERN.test(id||''))throw Error('Invalid browser session response.');
    if(id===current)return;
    release?.();release=null;
    if(win.navigator.locks?.request && !(await own(id))) { current=null;try{win.sessionStorage.removeItem(STORAGE_KEY);}catch{};throw Error('This sign-in belongs to another tab.'); }
    save(id);
  };
  const reset = async () => { await initialize();return replace(fresh()); };
  const close = () => {release?.();release=null;current=null;};
  win.addEventListener('pagehide',close);
  win.navigation?.addEventListener('currententrychange',()=>{if(current)mark();});
  return {initialize,replace,reset,get:()=>current,close};
}
module.exports={createTabIdentity,STORAGE_KEY,MARKER,ID_PATTERN};
