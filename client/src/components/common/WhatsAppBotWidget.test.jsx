import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import {fireEvent,within} from '@testing-library/dom';
import {vi} from 'vitest';
import '../../i18n';
import WhatsAppBotWidget from './WhatsAppBotWidget';
import api from '../../services/api';
const auth=vi.hoisted(()=>({isAuthenticated:false,user:null}));
vi.mock('../../hooks/useAuth',()=>({useAuth:()=>auth}));
vi.mock('../../services/api',()=>({default:{post:vi.fn()}}));
vi.mock('framer-motion',async()=>{const React=await import('react');return {AnimatePresence:({children})=>children,useReducedMotion:()=>true,motion:{div:React.forwardRef(({initial,animate,exit,transition,children,...props},ref)=><div {...props} ref={ref}>{children}</div>)}};});
let root,container;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();auth.isAuthenticated=false;auth.user=null;globalThis.IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView=vi.fn();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.clearAllTimers();vi.useRealTimers();});
const mount=async()=>{await act(async()=>root.render(<WhatsAppBotWidget/>));await act(async()=>fireEvent.click(within(container).getByRole('button',{name:'Open WhatsApp assistant'})));await act(async()=>vi.advanceTimersByTime(1100));};
const send=async text=>{await act(async()=>fireEvent.change(within(container).getByPlaceholderText('Type your question...'),{target:{value:text}}));await act(async()=>fireEvent.click(within(container).getByRole('button',{name:'Send'})));};
const signIn=()=>{auth.isAuthenticated=true;auth.user={id:42,user_type:'tenant'};};
test('guests retain FAQ replies and property-search cards without private API calls',async()=>{await mount();await send('How do I find a property?');await act(async()=>vi.advanceTimersByTime(1600));expect(container.textContent).toContain('You can search for properties');expect(within(container).getByRole('link',{name:'Search properties'}).getAttribute('href')).toBe('/');expect(api.post).not.toHaveBeenCalled();});
test('guest account questions show a sign-in card and never query account records',async()=>{await mount();await send('My wallet balance');expect(within(container).getByRole('link',{name:'Sign in to your account'}).getAttribute('href')).toBe('/login');expect(api.post).not.toHaveBeenCalled();});
test('signed-in users receive live account replies and account quick actions',async()=>{signIn();api.post.mockResolvedValue({data:{data:{handled:true,text:'Your wallet balance is ₦25,000.',topic:'wallet',link:'/dashboard',linkText:'Open wallet'}}});await mount();await send('My wallet balance');expect(container.textContent).toContain('₦25,000');expect(api.post).toHaveBeenCalledWith('/support/assistant',{message:'My wallet balance'});expect(container.textContent).not.toContain('Create an account');expect(within(container).getByRole('link',{name:'Open wallet'})).toBeTruthy();});
test('ticket creation requires the explicit submit card and double clicks create one request',async()=>{
 signIn();const draft={subject:'Chat assistance: Payment is pending',description:'Payment is pending',priority:'medium',category:'payment'};api.post.mockImplementation(async url=>url==='/support/assistant'?{data:{data:{handled:true,text:'Review this request',ticketDraft:draft}}}:{data:{success:true,data:{id:321,status:'open'}}});await mount();await send('Create a ticket: Payment is pending');expect(api.post.mock.calls.filter(([url])=>url==='/support/tickets')).toHaveLength(0);const submit=within(container).getByRole('button',{name:'Submit ticket'});await act(async()=>{fireEvent.click(submit);fireEvent.click(submit);});expect(api.post.mock.calls.filter(([url])=>url==='/support/tickets')).toHaveLength(1);expect(api.post).toHaveBeenCalledWith('/support/tickets',draft);expect(container.textContent).toContain('ticket #321 has been submitted');
});
test('ticket detail follow-up sends ticket mode instead of falling into FAQ matching',async()=>{
 signIn();api.post.mockResolvedValueOnce({data:{data:{handled:true,text:'Describe the problem',needsDetails:true}}}).mockResolvedValueOnce({data:{data:{handled:true,text:'Review your request'}}});await mount();await send('Create a ticket');await send('My withdrawal is still pending');expect(api.post).toHaveBeenLastCalledWith('/support/assistant',{message:'My withdrawal is still pending',mode:'ticket'});
});
test('unconfirmed ticket submission never claims success or leaves a duplicate submit card',async()=>{
 signIn();api.post.mockResolvedValueOnce({data:{data:{handled:true,text:'Review request',ticketDraft:{subject:'Pending payment',description:'Payment pending'}}}}).mockRejectedValueOnce(Error('timeout'));await mount();await send('Create a ticket: Payment pending');await act(async()=>fireEvent.click(within(container).getByRole('button',{name:'Submit ticket'})));expect(container.textContent).toContain('could not confirm whether the ticket was saved');expect(container.textContent).not.toContain('has been submitted');expect(within(container).queryByRole('button',{name:'Submit ticket'})).toBeNull();
});
test('sign-out clears private messages and discards late private responses',async()=>{
 signIn();let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await mount();await send('My payments');auth.isAuthenticated=false;auth.user=null;await act(async()=>root.render(<WhatsAppBotWidget/>));await act(async()=>finish({data:{data:{handled:true,text:'PRIVATE ACCOUNT PAYMENT',topic:'payments'}}}));expect(container.textContent).not.toContain('PRIVATE ACCOUNT PAYMENT');expect(container.textContent).not.toContain('My payments');
});
test('account API failure produces an honest support card instead of a generic payment answer',async()=>{signIn();api.post.mockRejectedValue(Error('Unavailable'));await mount();await send('My payments');expect(container.textContent).toContain('could not verify your account records');expect(container.textContent).not.toContain('held safely');});
