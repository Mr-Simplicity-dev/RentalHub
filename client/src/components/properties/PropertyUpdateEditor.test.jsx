import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {fireEvent,screen,waitFor} from '@testing-library/dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import api from '../../services/api';
import PropertyUpdateEditor from './PropertyUpdateEditor';
import PropertyUpdateReview from '../admin/PropertyUpdateReview';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(_key,options)=>options.defaultValue})}));
vi.mock('./PropertyFeaturesForm',()=>({default:({onChange})=><button type="button" onClick={()=>onChange({borehole:{available:true,details:{type:'shared'}}})}>Add borehole</button>}));
vi.mock('./PropertyFeaturesDisplay',()=>({default:()=> <span>Feature details</span>}));
let root,container;
const current={title:'Existing home',description:'No borehole',amenities:['parking'],structured_features:{}};
const data=requests=>({data:{data:{current,requests}}});
beforeEach(()=>{vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.get.mockResolvedValue(data([]));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it('submits edited descriptions and amenities as an approval request',async()=>{
 api.put.mockResolvedValue({data:{success:true}});
 await act(async()=>root.render(<PropertyUpdateEditor property={{id:7}} onClose={()=>{}}/>));
 await act(async()=>{fireEvent.change(screen.getByLabelText('Property description'),{target:{value:'Shared borehole now working'}});fireEvent.change(screen.getByLabelText('What changed and why?'),{target:{value:'A borehole was installed'}});fireEvent.click(screen.getByText('Add borehole'));});
 await act(async()=>fireEvent.submit(screen.getByText('Submit for approval').closest('form')));
 expect(api.put).toHaveBeenCalledWith('/properties/7',expect.objectContaining({description:'Shared borehole now working',reason:'A borehole was installed',structured_features:{borehole:{available:true,details:{type:'shared'}}}}));
});
it('pending requests hide editing and can be withdrawn before editing again',async()=>{
 api.get.mockResolvedValueOnce(data([{id:3,status:'pending',reason:'New borehole',created_at:'2026-10-30',before_data:current,proposed_data:{...current,description:'New pump working'}}])).mockResolvedValue(data([]));api.post.mockResolvedValue({});
 await act(async()=>root.render(<PropertyUpdateEditor property={{id:7}} onClose={()=>{}}/>));
 expect(screen.queryByLabelText('Property description')).toBeNull();
 await act(async()=>fireEvent.click(screen.getByText('Withdraw update to edit again')));
 expect(api.post).toHaveBeenCalledWith('/properties/7/updates/3/withdraw');
 expect(screen.getByLabelText('Property description').value).toBe('New pump working');
});
it('load failure does not expose an empty edit form',async()=>{
 api.get.mockRejectedValue(new Error('offline'));
 await act(async()=>root.render(<PropertyUpdateEditor property={{id:7}} onClose={()=>{}}/>));
 expect(screen.getByRole('alert').textContent).toMatch(/Unable to load/);expect(screen.queryByText('Submit for approval')).toBeNull();
});
it('admin review requires a note and sends only the selected decision',async()=>{
 api.get.mockResolvedValue(data([{id:3,status:'pending',reason:'New borehole',created_at:'2026-10-30',before_data:current,proposed_data:{...current,description:'Water available'}}]));api.patch.mockResolvedValue({});
 await act(async()=>root.render(<PropertyUpdateReview propertyId={7}/>));
 expect(screen.getByText('Approve changes').disabled).toBe(true);
 await act(async()=>fireEvent.change(screen.getByLabelText('Review note'),{target:{value:'Evidence reviewed'}}));
 await act(async()=>fireEvent.click(screen.getByText('Approve changes')));
 await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/admin/properties/7/updates/3',{decision:'approved',note:'Evidence reviewed'}));
});
