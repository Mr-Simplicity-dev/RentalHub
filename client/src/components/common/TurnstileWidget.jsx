import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {loadTurnstileScript} from '../../services/turnstileScript';
const SITE_KEY=process.env.REACT_APP_TURNSTILE_SITE_KEY;
const TurnstileWidget=forwardRef(({action,onToken,onExpire,onError},ref)=>{
 const {t}=useTranslation(),container=useRef(null),widget=useRef(null),sdk=useRef(null),callbacks=useRef({onToken,onExpire,onError});callbacks.current={onToken,onExpire,onError};
 const [attempt,setAttempt]=useState(0),[status,setStatus]=useState('loading'),[slow,setSlow]=useState(false);
 const retry=()=>{callbacks.current.onToken?.(null);setAttempt(n=>n+1);};
 useImperativeHandle(ref,()=>({reset(){retry();}}),[]);
 useEffect(()=>{
  let active=true,slowTimer;setStatus('loading');setSlow(false);
  const fail=code=>{if(!active)return;setStatus('error');callbacks.current.onToken?.(null);callbacks.current.onError?.(code);};
  if(!SITE_KEY||!action){fail('security_configuration');return()=>{active=false;};}
  loadTurnstileScript().then(api=>{
   if(!active||!container.current)return;sdk.current=api;setStatus('checking');
   try{widget.current=api.render(container.current,{sitekey:SITE_KEY,action,appearance:'always',execution:'render',theme:'auto',retry:'auto',refreshExpired:'auto',callback:token=>{if(!active)return;clearTimeout(slowTimer);setStatus('verified');setSlow(false);callbacks.current.onToken?.(token);},'expired-callback':()=>{if(!active)return;setStatus('checking');callbacks.current.onToken?.(null);callbacks.current.onExpire?.();},'error-callback':code=>{fail(code);return true;},'timeout-callback':()=>fail('security_timeout')});slowTimer=setTimeout(()=>{if(active)setSlow(true);},45000);}catch{fail('security_render_failed');}
  }).catch(()=>fail('security_script_failed'));
  return()=>{active=false;clearTimeout(slowTimer);if(widget.current!==null&&sdk.current){try{sdk.current.remove(widget.current);}catch{}widget.current=null;}};
 },[action,attempt]);
 return <div className="cf-turnstile-scroll" style={{width:'100%',overflowX:'auto',overflowY:'visible',minHeight:65}}><div ref={container} style={{margin:'0 auto',width:'max-content',minWidth:300,maxWidth:'100%'}}/>{status==='loading'&&<p role="status" className="mt-2 text-center text-sm text-slate-600">{t('securityCheck.loading','Loading security check…')}</p>}{(status==='error'||(slow&&status!=='verified'))&&<div className="mt-3 space-y-2 text-center"><p role="status" className="text-sm text-slate-700">{t('securityCheck.unavailable','The security check is taking too long. Check your connection and try again.')}</p><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold" onClick={retry}>{t('securityCheck.retry','Retry security check')}</button></div>}</div>;
});
TurnstileWidget.displayName='TurnstileWidget';export default TurnstileWidget;
