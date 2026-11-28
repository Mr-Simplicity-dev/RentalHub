import {useEffect,useRef,useState,useCallback} from 'react';
import api from '../services/api';
import {createCallSoundSession,ringingExpiry} from '../utils/callSoundSession.cjs';
export const loadCallSounds=async()=>(await api.get('/voice/call-sounds')).data.data;
export function playCallSound(sound,loop=true){
 const player=new Audio('/call-sounds/call_'+sound+(['normal','greeting'].includes(sound)?'_v2':'')+'.wav');player.loop=loop;player.volume=1;
 return player.play().then(()=>({stop:()=>{player.pause();player.removeAttribute('src');player.load();}})).catch(e=>{player.pause();throw e;});
}
export default function useCallSounds(call,direction){
 const [blocked,setBlocked]=useState(false);const session=useRef(null),preview=useRef(null),previewTimer=useRef(null),version=useRef(0),alive=useRef(true),active=useRef(null);
 active.current={call,direction};
 if(!session.current)session.current=createCallSoundSession({loadSettings:loadCallSounds,play:playCallSound,onBlocked:setBlocked});
 const cancelPreview=useCallback(()=>{version.current++;clearTimeout(previewTimer.current);preview.current?.pause();preview.current=null;},[]);
 const enable=useCallback(()=>{
  cancelPreview();const current=version.current;const player=new Audio('/call-sounds/call_normal_v2.wav');preview.current=player;player.volume=1;
  player.play().then(()=>{
   if(!alive.current||current!==version.current){player.pause();return;}
   setBlocked(false);previewTimer.current=setTimeout(()=>{
    player.pause();preview.current=null;session.current.stop();const next=active.current;
    if(alive.current&&next?.call)void session.current.start(next.call.callId+':'+next.direction,next.direction,ringingExpiry(next.call));
   },500);
  }).catch(()=>{if(alive.current&&current===version.current)setBlocked(true);});
 },[cancelPreview]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancelPreview();session.current.stop();};},[cancelPreview]);
 useEffect(()=>{
  if(call)void session.current.start(call.callId+':'+direction,direction,ringingExpiry(call));else session.current.stop();
  return()=>{cancelPreview();session.current.stop();};
 },[call?.callId,direction,cancelPreview]);
 return {blocked,enable};
}
