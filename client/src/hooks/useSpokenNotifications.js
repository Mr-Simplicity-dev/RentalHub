import {useCallback, useEffect, useRef, useState} from 'react';
import api from '../services/api';

const DEVICE_KEY='rentalhub_spoken_device_id';
const INTERACTION_KEY='rentalhub_spoken_user_interacted';
const LANGUAGES=['en','ha','ig','yo'];
const APPROVED_AUDIO={};
const normalizeLanguage=value=>String(value||'en').toLowerCase().split(/[-_]/)[0];
const result=(outcome,reason=null)=>({outcome,reason});
const isExpired=event=>{const expiry=new Date(event?.expiresAt).getTime();return !Number.isFinite(expiry)||expiry<=Date.now()};
const hasInteracted=()=>{try{return window.sessionStorage.getItem(INTERACTION_KEY)==='1'}catch{return false}};
const hasSpeech=()=>typeof window!=='undefined'&&window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
const randomToken=()=>{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(!globalThis.crypto?.getRandomValues)return null;
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
};
const getDeviceId=()=>{try{const old=window.localStorage.getItem(DEVICE_KEY);if(old)return old;const id=randomToken();if(id)window.localStorage.setItem(DEVICE_KEY,id);return id}catch{return randomToken()}};
const voiceFor=language=>{if(!hasSpeech())return null;const voices=window.speechSynthesis.getVoices?.()||[];return voices.find(voice=>normalizeLanguage(voice.lang)===language)||null;};
const audioFor=event=>APPROVED_AUDIO[event.audioKey]?.[normalizeLanguage(event.language)]||null;
const canPlay=event=>LANGUAGES.includes(normalizeLanguage(event.language))&&Boolean(audioFor(event)||(hasSpeech()&&(normalizeLanguage(event.language)==='en'||voiceFor(normalizeLanguage(event.language)))));

export function useSpokenNotifications({enabled,userId}) {
  const [interacted,setInteracted]=useState(hasInteracted);
  const [unavailableLanguage,setUnavailableLanguage]=useState(null);
  const deviceRef=useRef(null);
  if(!deviceRef.current)deviceRef.current=getDeviceId();
  const stateRef=useRef({enabled,userId});stateRef.current={enabled,userId};
  const busyRef=useRef(false),mountedRef=useRef(true),generationRef=useRef(0),cancelRef=useRef(null),seenRef=useRef(new Set()),channelRef=useRef(null);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;generationRef.current++;cancelRef.current?.();}},[]);
  useEffect(()=>{generationRef.current++;cancelRef.current?.();seenRef.current.clear();setUnavailableLanguage(null);},[enabled,userId]);
  useEffect(()=>{
    const interact=()=>{try{window.sessionStorage.setItem(INTERACTION_KEY,'1')}catch{}setInteracted(true)};
    for(const name of ['pointerdown','keydown','touchstart'])window.addEventListener(name,interact,{passive:true});
    return()=>{for(const name of ['pointerdown','keydown','touchstart'])window.removeEventListener(name,interact)};
  },[]);
  useEffect(()=>{
    if(typeof window.BroadcastChannel!=='function')return undefined;
    const channel=new window.BroadcastChannel('rentalhub-spoken-notifications');channelRef.current=channel;
    channel.onmessage=message=>{if(message?.data?.userId===stateRef.current.userId&&message?.data?.ackEventId)seenRef.current.add(String(message.data.ackEventId));};
    return()=>{channel.close();if(channelRef.current===channel)channelRef.current=null};
  },[]);
  const playSpeech=useCallback(event=>new Promise(resolve=>{
    const language=normalizeLanguage(event.language),voice=voiceFor(language);
    if(!LANGUAGES.includes(language)||!hasSpeech()||(language!=='en'&&!voice))return resolve(result('unavailable','unsupported_language_voice'));
    const synth=window.speechSynthesis,utterance=new window.SpeechSynthesisUtterance(String(event.message||'').slice(0,500));
    let done=false,timer;
    const finish=(outcome,reason)=>{if(done)return;done=true;clearTimeout(timer);utterance.onend=null;utterance.onerror=null;if(cancelRef.current===cancel)cancelRef.current=null;resolve(result(outcome,reason));};
    const cancel=()=>{finish('interrupted','speech_interrupted');synth.cancel();};cancelRef.current=cancel;
    utterance.lang=voice?.lang||'en-NG';if(voice)utterance.voice=voice;utterance.rate=0.95;utterance.pitch=1;
    utterance.onend=()=>finish('success');
    utterance.onerror=e=>finish(['interrupted','canceled'].includes(e?.error)?'interrupted':'failed','speech_'+String(e?.error||'error').slice(0,45));
    timer=setTimeout(()=>{finish('failed','speech_timeout');synth.cancel();},15000);
    try{synth.speak(utterance)}catch{finish('failed','speech_exception')}
  }),[]);
  const playAudio=useCallback(src=>new Promise(resolve=>{
    if(typeof Audio!=='function')return resolve(result('unavailable','audio_unsupported'));
    const audio=new Audio(src);let done=false,timer;
    const finish=(outcome,reason)=>{if(done)return;done=true;clearTimeout(timer);audio.onended=null;audio.onerror=null;audio.onabort=null;if(cancelRef.current===cancel)cancelRef.current=null;resolve(result(outcome,reason));};
    const cancel=()=>{finish('interrupted','audio_aborted');audio.pause();};cancelRef.current=cancel;
    audio.onended=()=>finish('success');audio.onerror=()=>finish('unavailable','audio_unavailable');audio.onabort=()=>finish('interrupted','audio_aborted');
    timer=setTimeout(()=>{finish('failed','audio_timeout');audio.pause();},20000);
    try{const promise=audio.play();promise?.catch(error=>finish(error?.name==='NotSupportedError'?'unavailable':'failed',error?.name==='NotAllowedError'?'autoplay_blocked':'audio_play_failed'))}catch{finish('failed','audio_exception')}
  }),[]);
  const processPending=useCallback(async()=>{
    if(!enabled||!userId||!interacted||busyRef.current||!mountedRef.current||!deviceRef.current)return;
    const generation=generationRef.current;
    const active=()=>mountedRef.current&&stateRef.current.enabled&&stateRef.current.userId===userId&&generationRef.current===generation;
    busyRef.current=true;
    try{
      const response=await api.get('/notifications/spoken/pending',{params:{limit:3}});
      for(const event of Array.isArray(response?.data?.data)?response.data.data:[]){
        if(!active())break;
        const id=String(event.id);if(seenRef.current.has(id)||isExpired(event))continue;
        if(!canPlay(event)){setUnavailableLanguage(normalizeLanguage(event.language));continue;}
        const claimToken=randomToken();if(!claimToken)continue;
        let claim;try{claim=await api.post(`/notifications/spoken/${event.id}/claim`,{deviceId:deviceRef.current,claimToken})}catch{continue}
        if(!active())break;if(!claim?.data?.data)continue;
        setUnavailableLanguage(null);
        const source=audioFor(event),playback=source?await playAudio(source):await playSpeech(event);
        if(!active())break;
        try{
          const ack=await api.post(`/notifications/spoken/${event.id}/ack`,{deviceId:deviceRef.current,claimToken,outcome:playback.outcome,...(playback.reason?{reason:playback.reason}:{})});
          if(playback.outcome==='success'&&ack?.data?.data?.acknowledged===true){seenRef.current.add(id);try{channelRef.current?.postMessage({userId,ackEventId:id})}catch{}}
        }catch{}
      }
    }catch{}finally{busyRef.current=false;}
  },[enabled,userId,interacted,playAudio,playSpeech]);
  useEffect(()=>{
    if(!enabled||!userId)return undefined;
    processPending();const interval=window.setInterval(processPending,30000);
    const visible=()=>{if(document.visibilityState==='visible')processPending()};
    const voicesChanged=()=>{setUnavailableLanguage(null);processPending()};
    document.addEventListener('visibilitychange',visible);window.speechSynthesis?.addEventListener?.('voiceschanged',voicesChanged);
    return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',visible);window.speechSynthesis?.removeEventListener?.('voiceschanged',voicesChanged)};
  },[enabled,userId,processPending]);
  return {interacted,deviceId:deviceRef.current,unavailableLanguage};
}
