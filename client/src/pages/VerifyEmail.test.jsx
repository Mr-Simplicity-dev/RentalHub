import React,{act} from 'react';import{createRoot}from'react-dom/client';import{fireEvent,waitFor}from'@testing-library/dom';import{MemoryRouter,Routes,Route}from'react-router-dom';import{vi}from'vitest';import'../i18n';import VerifyEmail from './VerifyEmail';import api from '../services/api';import{setAuthSession}from'../services/authStorage';
const{navigate}=vi.hoisted(()=>({navigate:vi.fn()}));vi.mock('react-router-dom',async()=>({...await vi.importActual('react-router-dom'),useNavigate:()=>navigate}));vi.mock('../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),defaults:{headers:{common:{}}}}}));vi.mock('../services/authStorage',()=>({setAuthSession:vi.fn()}));let root,container;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container)});afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers()});
test('email verification accepts a token in the URL path and keeps the verified phone session',async()=>{
 api.get.mockResolvedValue({data:{success:true,data:{token:'access',user:{id:1,user_type:'tenant',phone_verified:true}}}});
 await act(async()=>root.render(<MemoryRouter initialEntries={['/verify-email/path-token']}><Routes><Route path="/verify-email/:token" element={<VerifyEmail/>}/></Routes></MemoryRouter>));
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/auth/verify-email/path-token',{skipAuth:true,skipAuthRefresh:true}));expect(setAuthSession).toHaveBeenCalledWith('access',expect.objectContaining({phone_verified:true}));
});
test('failed email resend is visible and does not claim a verification message was sent',async()=>{
 api.post.mockRejectedValue({response:{data:{message:'Mail temporarily unavailable'}}});
 await act(async()=>root.render(<MemoryRouter initialEntries={['/verify-email']}><Routes><Route path="/verify-email" element={<VerifyEmail/>}/></Routes></MemoryRouter>));
 await act(async()=>fireEvent.change(container.querySelector('input[type="email"]'),{target:{value:'user@example.test'}}));await act(async()=>fireEvent.submit(container.querySelector('form')));expect(container.textContent).toContain('Mail temporarily unavailable');expect(setAuthSession).not.toHaveBeenCalled();
});
