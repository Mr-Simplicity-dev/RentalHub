import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {fireEvent,within} from '@testing-library/dom';
import {vi} from 'vitest';
import {createRequire} from 'node:module';
import SurveyWizard from './SurveyWizard';
import api from '../../services/api';
const require=createRequire(import.meta.url),survey=require('../../../../config/survey');
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback,i18n:{language:'en'}})}));
vi.mock('../common/TurnstileWidget',()=>({default:()=>null}));
const definition=type=>({sections:survey.getSectionOrder(type),notice:'Responses are confidential.',questions:survey.getQuestions(type).map(q=>({...q,prompt:q.prompt.en,labels:Object.fromEntries(Object.entries(q.labels||{}).map(([v,copy])=>[v,copy.en])),options:q.type==='rank'?q.rankSource.map(key=>({v:key,label:key+'. '+survey.getQuestionByKey(type,key).prompt.en})):(q.options||[]).map(o=>({v:o.v,label:q.labels?.[o.v]?.en||o.en}))}))});
for(const type of ['tenant','landlord'])test(type+' can answer every paper question and submit all 109 answers without gaps',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();const data=definition(type),done=vi.fn();
 api.get.mockResolvedValue({data:{data}});api.post.mockResolvedValue({data:{success:true,data:{respondent_code:'TEST-ONLY'}}});
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 try{
  await act(async()=>root.render(<SurveyWizard surveyType={type} mode="full" paperMode onComplete={done}/>));
  for(const question of data.questions){
   const page=within(container);
   if(question.type==='text')await act(async()=>fireEvent.change(page.getByRole('textbox'),{target:{value:'Provided response'}}));
   else{
    const options=question.type==='rank'?question.options.slice(0,3):question.type==='single'&&question.analysis==='nps'?question.options.slice(-1):question.options.slice(0,1);
    for(const option of options){const name=question.type==='likert'?option.v+option.label:option.label;await act(async()=>fireEvent.click(page.getByRole('button',{name,exact:true})));}
   }
   const button=page.getByRole('button',{name:/^(Next|Finish)$/});
   if(question===data.questions[0])expect(button.disabled).toBe(true);
   await act(async()=>vi.advanceTimersByTime(3000));expect(button.disabled).toBe(false);
   await act(async()=>fireEvent.click(button));
  }
  expect(done).toHaveBeenCalledTimes(1);const submit=api.post.mock.calls.find(([url])=>url==='/admin/survey/paper-entry')[1];
  expect(Object.keys(submit.answers)).toHaveLength(109);expect(survey.getMissingQuestions(type,submit.answers)).toEqual([]);
  expect(submit.answers[type==='tenant'?'T8.9':'L9.8']).toBe('10');
 }finally{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.clearAllMocks();}
},30000);
