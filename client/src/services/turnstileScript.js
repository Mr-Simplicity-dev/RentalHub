let pending;
export function loadTurnstileScript(){
 if(window.turnstile?.render)return Promise.resolve(window.turnstile);
 if(pending)return pending;
 const request=new Promise((resolve,reject)=>{
  const id='cf-turnstile-script';let script=document.getElementById(id),poll,timer,done=false;
  const finish=error=>{if(done)return;done=true;clearInterval(poll);clearTimeout(timer);script?.removeEventListener('error',failed);if(error){if(!window.turnstile?.render)script?.remove();reject(error);}else resolve(window.turnstile);};
  const failed=()=>finish(Error('security_script_failed'));
  if(!script){script=document.createElement('script');script.id=id;script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;}
  script.addEventListener('error',failed);
  poll=setInterval(()=>{if(window.turnstile?.render)finish();},100);
  timer=setTimeout(()=>finish(Error('security_script_timeout')),20000);
  if(!script.isConnected)document.head.appendChild(script);
 });
 pending=request;request.then(()=>{if(pending===request)pending=null;},()=>{if(pending===request)pending=null;});return request;
}
