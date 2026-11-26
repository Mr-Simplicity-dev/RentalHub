import React,{act}from'react';import{createRoot}from'react-dom/client';import{test,expect,vi}from'vitest';import useCallSounds from'./useCallSounds';import api from'../services/api';
vi.mock('../services/api',()=>({default:{get:vi.fn(async()=>({data:{data:{policy:{enabled:false},effectiveSound:'normal'}}}))}}));
test('a browser sound permission promise cannot restart ringing after logout or unmount',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();let release,enable;const pause=vi.fn();vi.stubGlobal('Audio',class{play(){return new Promise(resolve=>{release=resolve;});}pause(){pause();}});
 function Probe(){enable=useCallSounds({callId:'one',createdAt:new Date().toISOString()},'incoming').enable;return null;}
 const host=document.createElement('div');const root=createRoot(host);
 try{await act(async()=>root.render(<Probe/>));const initial=api.get.mock.calls.length;await act(async()=>enable());await act(async()=>root.unmount());await act(async()=>{release();await Promise.resolve();vi.runAllTimers();});expect(api.get.mock.calls.length).toBe(initial);expect(pause).toHaveBeenCalled();}
 finally{vi.useRealTimers();vi.unstubAllGlobals();}
});
