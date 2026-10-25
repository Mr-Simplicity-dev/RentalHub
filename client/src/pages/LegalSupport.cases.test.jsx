import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {fireEvent,waitFor,within} from '@testing-library/dom';
import {vi} from 'vitest';
import '../i18n';
import LegalSupport from './LawyersDirectory';
import api from '../services/api';
const auth=vi.hoisted(()=>({isAuthenticated:false}));
vi.mock('../hooks/useAuth',()=>({useAuth:()=>auth}));
vi.mock('../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('react-toastify',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
let container,root;
const cases={stats:{total_resolved:12,tenant_against_landlord:7,landlord_against_tenant:5},cases:[{id:1,direction:'tenant_landlord',state:'Lagos',resolved_at:'2026-09-20',full_name:'PRIVATE PERSON',email:'private@example.test',description:'PRIVATE CASE DETAILS'},{id:2,direction:'landlord_tenant',state:'Abuja',resolved_at:'2026-09-22'}]};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;auth.isAuthenticated=false;vi.clearAllMocks();window.localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const mount=()=>act(async()=>root.render(<MemoryRouter><LegalSupport/></MemoryRouter>));
test('guests see resolved disputes with correct nested totals, without requesting private legal data',async()=>{
 api.get.mockResolvedValue({data:{success:true,data:cases}});await mount();
 await waitFor(()=>expect(container.textContent).toContain('Tenant → landlord'));
 expect(within(container).getByRole('heading',{level:1}).textContent).toBe('Resolved dispute cases');
 for(const text of ['12','7','5','Lagos','Abuja','Landlord → tenant'])expect(container.textContent).toContain(text);
 expect(api.get.mock.calls.map(([url])=>url)).toEqual(['/legal/treated-cases']);
 expect(container.textContent).not.toMatch(/PRIVATE PERSON|private@example.test|PRIVATE CASE DETAILS|Lawyer Directory/);
 expect(container.querySelector('a[href="/login?redirect=/legal-support"]')).toBeTruthy();
});
test('zero real cases produces an honest empty state rather than lawyer listings or invented cases',async()=>{
 api.get.mockResolvedValue({data:{data:{stats:{total_resolved:0,tenant_against_landlord:0,landlord_against_tenant:0},cases:[]}}});await mount();
 await waitFor(()=>expect(container.textContent).toContain('No resolved dispute cases have been published yet.'));
 expect(container.querySelectorAll('article')).toHaveLength(0);expect(container.textContent).not.toContain('Lawyer Directory');
});
test('case API errors are visible and retry succeeds without showing fake zero totals',async()=>{
 api.get.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({data:{data:cases}});await mount();
 await waitFor(()=>expect(within(container).getByRole('alert')).toBeTruthy());expect(container.querySelectorAll('article')).toHaveLength(0);
 await act(async()=>fireEvent.click(within(container).getByRole('button',{name:'Try again'})));
 await waitFor(()=>expect(container.textContent).toContain('Lagos'));expect(container.querySelectorAll('article')).toHaveLength(2);
});
test('signed-in legal assistance remains available and private request details disappear on sign-out',async()=>{
 auth.isAuthenticated=true;api.get.mockImplementation(async url=>({data:{data:url==='/legal/treated-cases'?cases:url==='/legal/coverage-status'?{has_coverage:true}:[{id:4,subject:'PRIVATE REQUEST',description:'Protected details',status:'pending'}]}}));
 await mount();await waitFor(()=>expect(container.textContent).toContain('PRIVATE REQUEST'));expect(container.textContent).toContain('Resolved dispute cases');expect(container.textContent).not.toContain('lawyers_directory.');
 auth.isAuthenticated=false;await mount();await waitFor(()=>expect(container.textContent).not.toContain('PRIVATE REQUEST'));expect(container.textContent).toContain('Lagos');
});
