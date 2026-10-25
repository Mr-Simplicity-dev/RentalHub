import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import {fireEvent,waitFor,within} from '@testing-library/dom';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import '../i18n';
import Careers from './Careers';
import api from '../services/api';
import VolunteerReceipt from '../components/careers/VolunteerReceipt';
import copy from '../i18n/volunteerTranslations';
vi.mock('../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('react-toastify',()=>({toast:{success:vi.fn(),error:vi.fn(),warn:vi.fn()}}));
vi.mock('../components/common/TurnstileWidget',async()=>{const React=await import('react');return{default:React.forwardRef(({onToken},ref)=>{React.useEffect(()=>{onToken?.('test-token');},[onToken]);React.useImperativeHandle(ref,()=>({reset:()=>{}}));return null;})};});
vi.mock('framer-motion',async()=>{
 const React=await import('react');
 return{AnimatePresence:({children})=>children,motion:new Proxy({},{get:(_,tag)=>React.forwardRef(({initial,animate,exit,transition,whileHover,whileTap,layout,...props},ref)=>React.createElement(tag,{...props,ref}))})};
});
let container,root;
const roles=[{id:1,title:'Paid Employment Role',opportunity_type:'employment',application_fee:5000,premium_fee:8000},{id:2,title:'Community Volunteer',opportunity_type:'volunteer',application_fee:0,premium_fee:0,description:'Community outreach and support.'}];
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.localStorage.clear();vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
function mockPublic(settings){api.get.mockImplementation(async url=>{
 if(url==='/recruitment/status')return{data:{data:settings}};
 if(url==='/recruitment/locations/states')return{data:{data:[{name:'Abuja',displayName:'Abuja'}]}};
 if(url==='/recruitment/roles/active')return{data:{data:roles.filter(role=>role.opportunity_type==='volunteer'?settings.volunteer_applications_enabled:settings.is_active)}};
 return{data:{data:[]}};
});}
async function mount(url='/careers'){await act(async()=>{root.render(<MemoryRouter initialEntries={[url]}><Careers/></MemoryRouter>);});}
test.each([[false,true],[true,false],[true,true]])('independent availability employment=%s volunteer=%s',async(employment,volunteer)=>{
 mockPublic({is_active:employment,volunteer_applications_enabled:volunteer});await mount();
 await waitFor(()=>expect(container.querySelector('form')).toBeTruthy());
 expect(container.textContent.includes('Community Volunteer')).toBe(volunteer);expect(container.textContent.includes('Paid Employment Role')).toBe(employment);
});
test('both toggles OFF shows no application form',async()=>{mockPublic({is_active:false,volunteer_applications_enabled:false});await mount();expect(container.querySelector('form')).toBeNull();expect(api.get.mock.calls.some(([url])=>url==='/recruitment/roles/active')).toBe(false);});
test('volunteer deep link focuses the volunteer category and selection removes the premium track',async()=>{
 mockPublic({is_active:true,volunteer_applications_enabled:true});await mount('/careers?type=volunteer');
 const ui=within(container);expect(container.textContent).toContain('Community Volunteer');expect(container.textContent).not.toContain('Paid Employment Role');
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Apply as Volunteer'})));
 expect(container.querySelector('select[name="application_track"]')).toBeNull();expect(container.textContent).toContain(copy.en.volunteer_motivation);expect(container.textContent).toContain(copy.en.volunteer_availability);expect(container.textContent).toContain(copy.en.volunteer_free);
 expect(api.post).not.toHaveBeenCalled();
});
test('status API failure fails closed and offers retry without an application form',async()=>{api.get.mockRejectedValue(new Error('unavailable'));await mount();expect(container.querySelector('form')).toBeNull();expect(api.post).not.toHaveBeenCalled();expect(within(container).getByRole('button',{name:/try again/i})).toBeTruthy();});
test('volunteer receipt confirms manual review and offers optional CV without payment or guaranteed interview',async()=>{
 await act(async()=>root.render(<VolunteerReceipt application={{reference_number:'ARH-APP-ABC',opportunity_type:'volunteer',status:'submitted',role_title:'Community Volunteer'}} onFileChange={()=>{}} onUpload={()=>{}}/>));
 expect(container.textContent).toContain(copy.en.volunteer_received);expect(container.textContent).toContain(copy.en.volunteer_confirmation);expect(container.querySelector('input[type="file"]')).toBeTruthy();expect(container.querySelector('input[type="file"]').required).toBe(false);expect(container.textContent).not.toMatch(/Paystack|premium|guaranteed interview/i);
});
test('all supported locales contain complete volunteer copy without replacing existing translations',()=>{const keys=Object.keys(copy.en).sort();expect(Object.keys(copy).sort()).toEqual(['ar','en','fr','ha','ig','ru','yo','zh']);for(const values of Object.values(copy)){expect(Object.keys(values).sort()).toEqual(keys);expect(Object.values(values).every(Boolean)).toBe(true);}});

test('submitting a volunteer form shows the receipt and never initializes payment',async()=>{
 mockPublic({is_active:false,volunteer_applications_enabled:true});
 const application={id:27,opportunity_type:'volunteer',status:'submitted',payment_status:'not_applicable',application_fee:0,full_name:'Community Applicant',email_address:'community@example.test',reference_number:'ARH-APP-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',role_title:'Community Volunteer'};
 const get=api.get.getMockImplementation();
 api.get.mockImplementation(url=>url.startsWith('/recruitment/my-application')?Promise.resolve({data:{data:application}}):url.includes('/locations/lgas/')?Promise.resolve({data:{data:['Gwagwalada']}}):get(url));
 api.post.mockResolvedValue({data:{success:true,data:application}});
 await mount('/careers?type=volunteer');
 await act(async()=>fireEvent.click(within(container).getByRole('button',{name:'Apply as Volunteer'})));
 const set=async(name,value)=>{await act(async()=>fireEvent.change(container.querySelector('[name="'+name+'"]'),{target:{value}}));};
 for(const[name,value]of Object.entries({full_name:'Community Applicant',phone_number:'08012345678',email_address:'community@example.test',highest_education:'University',area_locality:'Kutunku',residential_address:'Local address',suitability_reason:'Relevant experience',volunteer_motivation:'Community support',availability:'Saturdays'}))await set(name,value);
 await set('state_name','Abuja');await waitFor(()=>expect(container.querySelector('select[name="lga_name"]').options.length).toBe(2));await set('lga_name','Gwagwalada');
 await act(async()=>fireEvent.submit(container.querySelector('form')));
 await waitFor(()=>expect(container.textContent).toContain(copy.en.volunteer_received));
 expect(api.post.mock.calls.map(([url])=>url)).toEqual(['/recruitment/apply']);expect(container.textContent).not.toContain('Pay Application Access Fee');
});
