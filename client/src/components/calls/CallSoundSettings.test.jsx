import React,{act} from 'react';import{createRoot}from'react-dom/client';import{fireEvent,within}from'@testing-library/dom';import{test,expect,vi,beforeEach,afterEach}from'vitest';
import CallSoundSettings from './CallSoundSettings';import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),patch:vi.fn()}}));
vi.mock('../../hooks/useCallSounds',()=>({loadCallSounds:()=>api.get('/voice/call-sounds').then(r=>r.data.data),playCallSound:vi.fn(async()=>({stop:vi.fn()}))}));
let root,host;const data={policy:{enabled:true,greetingEnabled:true,ringbackEnabled:true},preference:'normal',effectiveSound:'normal',isWorker:true};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;api.get.mockResolvedValue({data:{data}});api.patch.mockResolvedValue({data:{data:{...data,preference:'greeting'}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();});
test('worker can save a greeting without religion fields or global controls',async()=>{
 await act(async()=>root.render(<CallSoundSettings/>));const ui=within(host);expect(ui.getByRole('option',{name:/Normal ringtone/})).toBeTruthy();await act(async()=>fireEvent.change(ui.getByLabelText('My incoming call sound'),{target:{value:'greeting'}}));expect(api.patch).toHaveBeenCalledWith('/voice/call-sounds/preference',{sound:'greeting'});expect(ui.queryByText('Platform controls')).toBeNull();expect(host.querySelector('input[name=religion]')).toBeNull();
});
test('Super Admin has the three saved global switches and previews',async()=>{
 await act(async()=>root.render(<CallSoundSettings admin/>));const ui=within(host);expect(ui.getAllByRole('checkbox')).toHaveLength(3);await act(async()=>fireEvent.click(ui.getByLabelText('Allow incoming call sounds')));expect(api.patch).toHaveBeenCalledWith('/voice/call-sounds/admin',{policy:{enabled:false}});expect(ui.getByRole('button',{name:'Preview spoken greeting'})).toBeTruthy();expect(ui.getByRole('button',{name:'Stop preview'})).toBeTruthy();
});
test('non-worker gets normal and silent only, with a useful error on failed save',async()=>{
 api.get.mockResolvedValue({data:{data:{...data,isWorker:false}}});api.patch.mockRejectedValue(Error('offline'));await act(async()=>root.render(<CallSoundSettings/>));const ui=within(host);expect(ui.queryByRole('option',{name:/Spoken greeting/})).toBeNull();await act(async()=>fireEvent.change(ui.getByLabelText('My incoming call sound'),{target:{value:'silent'}}));expect(ui.getByRole('alert').textContent).toMatch(/Could not save/);
});
