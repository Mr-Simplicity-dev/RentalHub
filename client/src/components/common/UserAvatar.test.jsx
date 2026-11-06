import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import UserAvatar from './UserAvatar';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
beforeEach(()=>{cleanup();vi.clearAllMocks();URL.createObjectURL=vi.fn(()=> 'blob:private-photo');URL.revokeObjectURL=vi.fn();});
describe('protected verification avatar',()=>{
 it('shows initials and never fetches arbitrary or public document URLs',()=>{render(<UserAvatar name="Ada" photo="https://example.invalid/passport.jpg" />);expect(screen.getByText('A')).toBeTruthy();expect(api.get).not.toHaveBeenCalled();});
 it('loads the private face photo through the authenticated API and revokes it on unmount',async()=>{api.get.mockResolvedValue({data:new Blob(['image'],{type:'image/jpeg'})});const view=render(<UserAvatar name="Ada" photo="/uploads/passports/passport_5_123.jpg" />);await waitFor(()=>expect(view.container.querySelector('img')?.src).toBe('blob:private-photo'));expect(api.get).toHaveBeenCalledWith('/users/passport-photo/passport_5_123.jpg',{responseType:'blob'});view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');});
 it('falls back to initials if a saved photo cannot load',async()=>{api.get.mockResolvedValue({data:new Blob(['image'])});const view=render(<UserAvatar name="Ada" photo="/uploads/passports/passport_5_123.jpg" />);await waitFor(()=>expect(view.container.querySelector('img')).toBeTruthy());fireEvent.error(view.container.querySelector('img'));expect(screen.getByText('A')).toBeTruthy();});
});
