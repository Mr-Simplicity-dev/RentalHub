globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {vi,test,expect} from 'vitest';
import {usePhotoInstructions} from './usePhotoInstructions';
test('spoken instructions change, repeat, mute and stop when capture closes',async()=>{
 const speech={cancel:vi.fn(),speak:vi.fn()};vi.stubGlobal('speechSynthesis',speech);vi.stubGlobal('SpeechSynthesisUtterance',class{constructor(text){this.text=text;}});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);let controls;
 function Capture({active=true,text='Face forward'}){controls=usePhotoInstructions(text,active,'en');return null;}
 try{
  await act(async()=>root.render(<Capture/>));expect(speech.speak.mock.calls.at(-1)[0].text).toBe('Face forward');
  await act(async()=>controls.repeat());expect(speech.speak).toHaveBeenCalledTimes(2);
  await act(async()=>controls.toggle());expect(speech.speak).toHaveBeenCalledTimes(2);expect(speech.cancel).toHaveBeenCalled();
  await act(async()=>controls.toggle());await act(async()=>root.render(<Capture text="Blink once"/>));expect(speech.speak.mock.calls.at(-1)[0].text).toBe('Blink once');
  const count=speech.speak.mock.calls.length;await act(async()=>root.render(<Capture active={false}/>));expect(speech.speak).toHaveBeenCalledTimes(count);
 }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
