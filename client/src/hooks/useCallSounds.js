import {useEffect,useRef,useState,useCallback} from 'react';
import api from '../services/api';
import {createCallSoundSession,ringingExpiry} from '../utils/callSoundSession.cjs';
export const loadCallSounds=async()=>(await api.get('/voice/call-sounds')).data.data;
export function playCallSound(sound,loop=true){
 const player=new Audio('/call-sounds/call_'+sound+'.wav');player.loop=loop;player.volume=0.65;
 return player.play().then(()=>({stop:()=>{player.pause();player.removeAttribute('src');player.load();}})).catch(e=>{player.pause();throw e;});
}
export default function useCallSounds(call,direction){
 const [blocked,setBlocked]=useState(false);const session=useRef(null);
 if(!session.current)session.current=createCallSoundSession({loadSettings:loadCallSounds,play:playCallSound,onBlocked:setBlocked});
 const enable=useCallback(()=>{
  const player=new Audio('/call-sounds/call_normal.wav');player.volume=0.5;
  player.play().then(()=>{setTimeout(()=>{player.pause();session.current.stop();if(call)void session.current.start(call.callId+':'+direction,direction,ringingExpiry(call));},500);setBlocked(false);}).catch(()=>setBlocked(true));
 },[call,direction]);
 useEffect(()=>{
  if(call)void session.current.start(call.callId+':'+direction,direction,ringingExpiry(call));
  else session.current.stop();
  return()=>session.current.stop();
 },[call?.callId,direction]);
 return {blocked,enable};
}
