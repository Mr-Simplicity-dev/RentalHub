import {useEffect, useState} from 'react';
export function usePhotoInstructions(text, active, language = 'en') {
  const [enabled,setEnabled]=useState(true),[repeat,setRepeat]=useState(0);
  useEffect(()=>{
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const stop=()=>window.speechSynthesis.cancel();
    stop();
    if (active && enabled && text && document.visibilityState !== 'hidden') {
      const utterance=new SpeechSynthesisUtterance(text);utterance.lang=language;utterance.rate=0.85;
      utterance.onerror=()=>{};window.speechSynthesis.speak(utterance);
    }
    const hidden=()=>{if(document.visibilityState==='hidden')stop();};
    document.addEventListener('visibilitychange',hidden);
    return ()=>{stop();document.removeEventListener('visibilitychange',hidden);};
  },[text,active,language,enabled,repeat]);
  return {enabled,toggle:()=>setEnabled(value=>!value),repeat:()=>setRepeat(value=>value+1)};
}
