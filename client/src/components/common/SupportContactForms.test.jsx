import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {fireEvent} from '@testing-library/dom';
import {vi} from 'vitest';
import SupportContactForms from './SupportContactForms';
import api from '../../services/api';
const {session}=vi.hoisted(()=>({session:{user:{id:7,user_type:'tenant'}}}));
vi.mock('../../hooks/useAuth',()=>({useAuth:()=>session}));
vi.mock('react-i18next',()=>({useTranslation:()=>({i18n:{language:'en'}})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
let root,container;
const request={id:'request-one',customer_id:7,requester_id:3,fields:['email'],purpose:'Please confirm the email for your support case.',status:'requested',expires_at:'2099-01-01T00:00:00Z'};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();session.user={id:7,user_type:'tenant'};api.get.mockResolvedValue({data:{data:[request]}});api.post.mockResolvedValue({data:{}});api.delete.mockResolvedValue({data:{}});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('a customer must explicitly consent and only submits to the private form endpoint',async()=>{
 await act(async()=>root.render(<SupportContactForms/>));
 const share=[...container.querySelectorAll('button')].find(button=>button.textContent.includes('Share'));
 expect(share.disabled).toBe(true);
 await act(async()=>fireEvent.change(container.querySelector('input[type=email]'),{target:{value:'customer@example.test'}}));
 await act(async()=>fireEvent.click(container.querySelector('input[type=checkbox]')));
 expect(share.disabled).toBe(false);
 await act(async()=>fireEvent.click(share));
 expect(api.post).toHaveBeenCalledWith('/messages/private-contact-forms/request-one',{email:'customer@example.test',consent:true});
 expect(container.querySelector('input[type=email]').value).toBe('');
});
test('withdrawal acts on only the displayed private request',async()=>{
 await act(async()=>root.render(<SupportContactForms/>));
 await act(async()=>fireEvent.click([...container.querySelectorAll('button')].find(button=>button.textContent.includes('Withdraw'))));
 expect(api.delete).toHaveBeenCalledWith('/messages/private-contact-forms/request-one');
});
test('contact values are fetched only after an authorised staff view action',async()=>{
 session.user={id:3,user_type:'super_admin'};api.get.mockResolvedValue({data:{data:[{...request,status:'submitted'}]}});
 await act(async()=>root.render(<SupportContactForms peerId={7}/>));
 expect(api.get).toHaveBeenCalledTimes(1);
 api.get.mockImplementation(url=>Promise.resolve({data:{data:url.endsWith('/details')?{email:'private@example.test'}:[{...request,status:'submitted'}]}}));
 await act(async()=>fireEvent.click([...container.querySelectorAll('button')].find(button=>button.textContent.includes('View'))));
 expect(api.get).toHaveBeenCalledWith('/messages/private-contact-forms/request-one/details');
 expect(container.textContent).toContain('private@example.test');
});

test('guests do not request or display private contact forms',async()=>{session.user=null;await act(async()=>root.render(<SupportContactForms/>));expect(api.get).not.toHaveBeenCalled();expect(container.textContent).toBe('');});
