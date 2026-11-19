import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { vi } from 'vitest';
import TourMusicPlayer from './TourMusicPlayer';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
let root,container,play,pause;
const track={id:9,title:'Calm music',file_url:'Video-Presets_290_Royalty_Free_Background_Music_Tracks/Mp3/Calm.mp3'};
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  api.get.mockReset(); api.get.mockResolvedValue({data:new Blob(['audio'],{type:'audio/mpeg'})});
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:test-music'),revokeObjectURL:vi.fn()}));
  play=vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(){this.dispatchEvent(new Event('play'));return Promise.resolve();});
  pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(){this.dispatchEvent(new Event('pause'));});
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
const mount=async element=>act(async()=>root.render(element||<TourMusicPlayer track={track}/>));
const click=async name=>act(async()=>fireEvent.click(within(container).getByRole('button',{name})));

test('Play fetches authenticated audio; Pause and Stop control the preview without changing track settings',async()=>{
  await mount();expect(api.get).not.toHaveBeenCalled();
  await click('Play Calm music');
  expect(api.get).toHaveBeenCalledWith('/super/property-tour-music/tracks/9/audio',expect.objectContaining({responseType:'blob',signal:expect.any(AbortSignal)}));
  expect(play).toHaveBeenCalledTimes(1);
  const audio=container.querySelector('audio');audio.currentTime=12;
  await click('Pause Calm music');expect(pause).toHaveBeenCalled();
  await click('Play Calm music');expect(api.get).toHaveBeenCalledTimes(1);
  await click('Stop Calm music');expect(audio.currentTime).toBe(0);
  expect(within(container).getByRole('button',{name:'Play Calm music'})).toBeTruthy();
});
test('an HTML response cannot silently pretend to be music',async()=>{
  api.get.mockResolvedValue({data:new Blob(['<html>'],{type:'text/html'})});
  await mount();await click('Play Calm music');expect(play).not.toHaveBeenCalled();
  expect(within(container).getByRole('alert').textContent).toContain('Could not play');
});
test('Stop cancels a slow audio request and prevents late playback',async()=>{
  let finish;api.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await mount();await click('Play Calm music');
  const signal=api.get.mock.calls[0][1].signal;await click('Stop Calm music');expect(signal.aborted).toBe(true);
  await act(async()=>finish({data:new Blob(['audio'],{type:'audio/mpeg'})}));expect(play).not.toHaveBeenCalled();
});
test('starting another track stops and rewinds the first one',async()=>{
  await mount(<><TourMusicPlayer track={track}/><TourMusicPlayer track={{...track,id:10,title:'Second music'}}/></>);
  await click('Play Calm music');container.querySelector('audio').currentTime=7;
  await click('Play Second music');expect(container.querySelector('audio').currentTime).toBe(0);
  expect(within(container).getByRole('button',{name:'Play Calm music'})).toBeTruthy();
  expect(within(container).getByRole('button',{name:'Pause Second music'})).toBeTruthy();
});
