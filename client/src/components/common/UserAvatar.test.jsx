import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import {fireEvent,waitFor} from '@testing-library/dom';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import UserAvatar from './UserAvatar';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
let container,root;
beforeEach(()=>{vi.clearAllMocks();globalThis.IS_REACT_ACT_ENVIRONMENT=true;URL.createObjectURL=vi.fn(()=> 'blob:private-photo');URL.revokeObjectURL=vi.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{if(root)await act(async()=>root.unmount());container.remove();});
describe('protected verification avatar',()=>{
 it('shows initials and never fetches arbitrary or public document URLs',async()=>{await act(async()=>root.render(<UserAvatar name="Ada" photo="https://example.invalid/passport.jpg" />));expect(container.textContent).toBe('A');expect(api.get).not.toHaveBeenCalled();});
 it('loads the face photo through the authenticated API and revokes it on unmount',async()=>{api.get.mockResolvedValue({data:new Blob(['image'],{type:'image/jpeg'})});await act(async()=>root.render(<UserAvatar name="Ada" photo="/uploads/passports/passport_5_123.jpg" />));await waitFor(()=>expect(container.querySelector('img')?.src).toBe('blob:private-photo'));expect(api.get).toHaveBeenCalledWith('/users/passport-photo/passport_5_123.jpg',{responseType:'blob'});await act(async()=>root.unmount());root=null;expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');});
 it('falls back to initials if a saved photo cannot load',async()=>{api.get.mockResolvedValue({data:new Blob(['image'])});await act(async()=>root.render(<UserAvatar name="Ada" photo="/uploads/passports/passport_5_123.jpg" />));await waitFor(()=>expect(container.querySelector('img')).toBeTruthy());await act(async()=>fireEvent.error(container.querySelector('img')));expect(container.textContent).toBe('A');});
});
