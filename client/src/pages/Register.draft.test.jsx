import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import {fireEvent,waitFor} from '@testing-library/dom';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import '../i18n';
import Register from './Register';
import api from '../services/api';
import {saveRegistrationDraft,readRegistrationDraft,REGISTRATION_DRAFT_KEY} from '../utils/registrationDraft';
vi.mock('../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),defaults:{headers:{common:{}}}}}));
vi.mock('../hooks/useAuth',()=>({useAuth:()=>({register:vi.fn()})}));
vi.mock('react-toastify',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('../components/common/FloatingContactWidget',()=>({default:()=>null}));
vi.mock('../components/common/WhatsAppBotWidget',()=>({default:()=>null}));
vi.mock('../components/common/TurnstileWidget',()=>({default:()=>null}));
vi.mock('../components/BankTransferCheckout',()=>({default:()=>null}));
vi.mock('../components/VirtualAccountCheckout',()=>({default:()=>null}));
vi.mock('framer-motion',async()=>{const React=await import('react');const cache={};return{AnimatePresence:({children})=>children,motion:new Proxy({},{get:(_,tag)=>cache[tag]||(cache[tag]=React.forwardRef(({initial,animate,exit,transition,whileHover,whileTap,...props},ref)=>React.createElement(tag,{...props,ref})))})};});
let container,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.localStorage.clear();vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockImplementation(async url=>({data:{success:true,data:url.includes('registration-flags')?{registration_allowed:true,nin_number:false,passport_number:false,pricing:{amount:0}}:[]}}));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const mount=()=>act(async()=>root.render(<MemoryRouter initialEntries={['/register']}><Register/></MemoryRouter>));
test('web registration restores personal details and auto-saves edits for a later visit',async()=>{
 saveRegistrationDraft({user_type:'landlord',full_name:'Returning User',email:'user@example.test',phone:'08012345678',lawyer_email:'lawyer@example.test'},2);
 await mount();
 await waitFor(()=>expect(container.querySelector('input[name="full_name"]')?.value).toBe('Returning User'));
 expect(container.querySelector('input[name="email"]').value).toBe('user@example.test');
 await act(async()=>fireEvent.change(container.querySelector('input[name="full_name"]'),{target:{value:'Updated User'}}));
 expect(readRegistrationDraft().form.full_name).toBe('Updated User');
});
test('choosing RentalHub lawyers keeps the user-entered lawyer email editable and intact',async()=>{
 saveRegistrationDraft({full_name:'User',email:'user@example.test',phone:'08012345678',lawyer_email:'lawyer@example.test'},2);
 await mount();const input=container.querySelector('input[name="lawyer_email"]');
 await act(async()=>fireEvent.click(container.querySelector('#use_rentalhub_lawyers')));
 expect(input.disabled).toBe(false);expect(input.value).toBe('lawyer@example.test');expect(readRegistrationDraft().form.lawyer_email).toBe('lawyer@example.test');
});

test('registration introduction displays the naira symbol on each local fee',async()=>{
 await mount();
 for (const amount of ['3,000','5,000','2,000']) expect(container.textContent).toContain('\u20A6'+amount);
 expect(container.textContent).not.toContain(String.fromCodePoint(0xe2,0x201a,0xa6));
});
