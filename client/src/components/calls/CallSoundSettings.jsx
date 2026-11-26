import React,{useEffect,useRef,useState} from 'react';
import api from '../../services/api';
import {loadCallSounds,playCallSound} from '../../hooks/useCallSounds';
export default function CallSoundSettings({admin=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const preview=useRef(null);const timer=useRef(null);const generation=useRef(0);const alive=useRef(true);
 const stop=()=>{generation.current++;clearTimeout(timer.current);preview.current?.stop();preview.current=null;};
 const load=()=>loadCallSounds().then(setData).catch(()=>setError('Could not load call sounds. Please try again.'));
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;stop();};},[]);
 const save=async(path,body)=>{setBusy(true);setError('');try{setData((await api.patch('/voice/call-sounds/'+path,body)).data.data);}catch{setError('Could not save call sounds. Please try again.');}finally{setBusy(false);}};
 const listen=async sound=>{stop();const version=generation.current;setError('');try{const player=await playCallSound(sound,false);if(!alive.current||version!==generation.current){player.stop();return;}preview.current=player;timer.current=setTimeout(stop,10000);}catch{setError('Your browser blocked sound. Allow sound for RentalHub and try again.');}};
 return <section className='my-5 rounded-2xl border border-gray-200 bg-white p-5 text-gray-900' aria-label='Call sound settings'>
 <h2 className='text-xl font-semibold'>{admin?'Call Settings':'Call sounds'}</h2>
 <p className='mt-2 text-sm text-gray-600'>Choose how RentalHub alerts you to incoming calls. No religion information is collected.</p>
 {error&&<p role='alert' className='my-2 text-sm text-red-700'>{error}</p>}
 {!data?<button type='button' onClick={load} className='mt-3 rounded-lg border p-3'>Load call settings</button>:<>
 {admin&&<fieldset disabled={busy} className='my-4 space-y-3'><legend className='font-semibold'>Platform controls</legend>{Object.entries({enabled:'Allow incoming call sounds',greetingEnabled:'Allow optional spoken greeting',ringbackEnabled:'Allow ringing sound for callers'}).map(([key,label])=><label key={key} className='flex items-center gap-3'><input type='checkbox' checked={data.policy[key]} onChange={e=>save('admin',{policy:{[key]:e.target.checked}})}/>{label}</label>)}</fieldset>}
 <label className='mt-4 block text-sm font-medium'>My incoming call sound<select aria-label='My incoming call sound' className='mt-2 block w-full rounded-xl border p-3' disabled={busy} value={data.preference} onChange={e=>save('preference',{sound:e.target.value})}><option value='normal'>Normal ringtone</option>{data.isWorker&&<option value='greeting' disabled={!data.policy.greetingEnabled}>Spoken greeting: Assalamu alaikum</option>}<option value='silent'>Silent</option></select></label>
 {data.preference==='greeting'&&!data.policy.greetingEnabled&&<p className='mt-2 text-sm'>The spoken greeting is disabled. Your calls use the normal ringtone.</p>}
 {!data.policy.enabled&&<p className='mt-2 text-sm'>Call sounds are currently disabled by Super Admin.</p>}
 <div className='mt-4 flex flex-wrap gap-2'><button type='button' className='rounded-lg border px-4 py-2' onClick={()=>listen('normal')}>Preview normal ringtone / Enable call sounds</button>{(admin||data.isWorker)&&<button type='button' className='rounded-lg border px-4 py-2' onClick={()=>listen('greeting')}>Preview spoken greeting</button>}<button type='button' className='rounded-lg border px-4 py-2' onClick={stop}>Stop preview</button></div>
 <p className='mt-3 text-xs text-gray-500'>The greeting says: “Assalamu alaikum. You have an incoming call through Amana RentalHub NG.” Phone silent settings and browser sound permissions still apply.</p>
 </>}
 </section>;
}
