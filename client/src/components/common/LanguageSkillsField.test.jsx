import React,{useState,act} from 'react';
import {createRoot} from 'react-dom/client';
import {screen,fireEvent as domFireEvent} from '@testing-library/dom';
let root,container;beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(()=>{act(()=>root.unmount());container.remove();});
const render=element=>act(()=>root.render(element));
const fireEvent={change:(...args)=>act(()=>domFireEvent.change(...args)),click:(...args)=>act(()=>domFireEvent.click(...args))};
import {describe,it,expect,vi} from 'vitest';
import LanguageSkillsField from './LanguageSkillsField';
import {validateSkills,PIDGIN,languages} from '../../data/languagePolicy';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
function Form(){const [skills,setSkills]=useState([]);let valid=true;try{validateSkills(skills);}catch{valid=false;}return <><LanguageSkillsField value={skills} onChange={setSkills}/><button disabled={!valid}>Continue</button></>;}
describe('Career language choices',()=>{
 it('shows the rule and keeps continuation disabled until Pidgin, a second language and levels are supplied',()=>{render(<Form/>);expect(screen.getByRole('button',{name:'Continue'})).toBeDisabled();const add=id=>{fireEvent.change(screen.getByLabelText('Search languages'),{target:{value:languages.find(x=>x.id===id).name}});fireEvent.change(screen.getByLabelText('Choose a language'),{target:{value:id}});};add(PIDGIN);add(languages.find(x=>x.iso==='hau').id);expect(screen.getByRole('button',{name:'Continue'})).toBeDisabled();for(const select of screen.getAllByLabelText('Speaking / understanding (or signing)'))fireEvent.change(select,{target:{value:'conversational'}});for(const select of screen.getAllByLabelText('Reading / writing'))fireEvent.change(select,{target:{value:'basic'}});expect(screen.getByRole('button',{name:'Continue'})).toBeEnabled();fireEvent.click(screen.getAllByRole('button',{name:'Remove'})[0]);expect(screen.getByRole('button',{name:'Continue'})).toBeDisabled();});
 it('supports searching customer language preferences without asking customers for proficiency',()=>{const onChange=vi.fn();render(<LanguageSkillsField preference value="" onChange={onChange}/>);fireEvent.change(screen.getByLabelText('Search languages'),{target:{value:'Hausa'}});expect(screen.getByRole('option',{name:'Hausa'})).toBeInTheDocument();expect(screen.queryByText('Reading / writing')).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText('Choose a language'),{target:{value:languages.find(x=>x.iso==='hau').id}});expect(onChange).toHaveBeenCalled();});
 it('stops offering a sixth selection',()=>{const value=languages.slice(0,5).map(x=>({language_id:x.id,oral:'fluent',written:'fluent'}));render(<LanguageSkillsField value={value} onChange={()=>{}}/>);expect(screen.getByLabelText('Choose a language')).toBeDisabled();});
});
