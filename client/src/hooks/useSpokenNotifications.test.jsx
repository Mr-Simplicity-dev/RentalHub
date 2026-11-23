globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
import api from '../services/api';
import { useSpokenNotifications } from './useSpokenNotifications';

const flush = () => new Promise((r) => setTimeout(r, 0));
const waitFor = async (fn, timeout = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = fn(); if (v) return v; } catch {}
    await act(async () => { await flush(); });
  }
  throw new Error('waitFor timeout');
};

function Harness({ enabled = true, userId = 7 }) {
  useSpokenNotifications({ enabled, userId });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem('rentalhub_spoken_user_interacted', '1');
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('successful playback acknowledgement is sent only after successful playback', async () => {
  const speak = vi.fn((u) => { setTimeout(() => u.onend && u.onend(), 0); });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak, getVoices: () => [{ lang: 'en-US', name: 'Test' }] });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });

  api.get.mockResolvedValue({ data: { data: [{ id: 11, eventType: 'rent_payment_success', dedupKey: 'k1', message: 'Your rent payment was successful.', language: 'en', expiresAt: new Date(Date.now() + 600000).toISOString() }] } });
  api.post.mockImplementation((url) => {
    if (url.endsWith('/claim')) return Promise.resolve({ data: { data: { id: 11, status: 'claimed' } } });
    if (url.endsWith('/ack')) return Promise.resolve({ data: { data: { id: 11, status: 'acknowledged', acknowledged: true } } });
    return Promise.resolve({ data: {} });
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<Harness />); });
    await waitFor(() => api.post.mock.calls.find((c) => String(c[0]).includes('/ack')));
    const ackCall = api.post.mock.calls.find((c) => String(c[0]).includes('/ack'));
    expect(ackCall[1].outcome).toBe('success');
    const claimCall=api.post.mock.calls.find(c=>String(c[0]).endsWith('/claim'));
    expect(ackCall[1].claimToken).toBe(claimCall[1].claimToken);
    expect(api.patch.mock.calls.some((c) => String(c[0]).includes('/read'))).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('failed playback reports failure and does not acknowledge success', async () => {
  const speak = vi.fn((u) => { setTimeout(() => u.onerror && u.onerror({ error: 'audio-busy' }), 0); });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak, getVoices: () => [{ lang: 'en-US', name: 'Test' }] });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });

  api.get.mockResolvedValue({ data: { data: [{ id: 12, eventType: 'rent_payment_success', dedupKey: 'k2', message: 'Your rent payment was successful.', language: 'en', expiresAt: new Date(Date.now() + 600000).toISOString() }] } });
  api.post.mockImplementation((url) => {
    if (url.endsWith('/claim')) return Promise.resolve({ data: { data: { id: 12, status: 'claimed' } } });
    if (url.endsWith('/ack')) return Promise.resolve({ data: { data: { id: 12, status: 'pending', acknowledged: false } } });
    return Promise.resolve({ data: {} });
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<Harness />); });
    await waitFor(() => api.post.mock.calls.find((c) => String(c[0]).includes('/ack')));
    const ackCall = api.post.mock.calls.find((c) => String(c[0]).includes('/ack'));
    expect(ackCall[1].outcome).toBe('failed');
    expect(ackCall[1].outcome).not.toBe('success');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('interrupted playback reports interrupted outcome', async () => {
  const speak = vi.fn((u) => { setTimeout(() => u.onerror && u.onerror({ error: 'interrupted' }), 0); });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak, getVoices: () => [{ lang: 'en-US', name: 'Test' }] });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });

  api.get.mockResolvedValue({ data: { data: [{ id: 13, dedupKey: 'k3', message: 'Rent-savings reminder.', language: 'en', expiresAt: new Date(Date.now() + 600000).toISOString() }] } });
  api.post.mockImplementation((url) => {
    if (url.endsWith('/claim')) return Promise.resolve({ data: { data: { id: 13, status: 'claimed' } } });
    if (url.endsWith('/ack')) return Promise.resolve({ data: { data: { id: 13, status: 'pending', acknowledged: false } } });
    return Promise.resolve({ data: {} });
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<Harness />); });
    await waitFor(() => api.post.mock.calls.find((c) => String(c[0]).includes('/ack')));
    const ackCall = api.post.mock.calls.find((c) => String(c[0]).includes('/ack'));
    expect(ackCall[1].outcome).toBe('interrupted');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('unavailable SpeechSynthesis leaves the event unclaimed and preserves visual notifications', async () => {
  vi.stubGlobal('speechSynthesis', undefined);
  api.get.mockResolvedValue({data:{data:[{id:14,message:'Test',language:'en',expiresAt:new Date(Date.now()+600000).toISOString()}]}});
  const container=document.createElement('div'),root=createRoot(container);
  try {await act(async()=>root.render(<Harness/>));await act(flush);expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();}
  finally {await act(async()=>root.unmount());}
});

const futureEvent=(language='en')=>({id:91,message:language==='ha'?'An karɓi kuɗin hayarka':language==='ig'?'A natara ụgwọ ụlọ gị':language==='yo'?'A ti gba owó ilé rẹ':'Your rent payment was successful.',language,expiresAt:new Date(Date.now()+600000).toISOString()});
const mockQueue=(event=futureEvent())=>{api.get.mockResolvedValue({data:{data:[event]}});api.post.mockImplementation(async url=>({data:{data:url.endsWith('/claim')?{id:event.id,status:'claimed'}:{id:event.id,acknowledged:true}}}));};
async function renderHarness(props={}){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<Harness {...props}/>));return {root,container,close:async()=>{await act(async()=>root.unmount());container.remove()}};}
test.each(['ha','ig','yo'])('matching %s voice speaks its translated message and acknowledges with the winning token',async language=>{
 const speak=vi.fn(u=>queueMicrotask(()=>u.onend?.()));vi.stubGlobal('speechSynthesis',{cancel:vi.fn(),speak,getVoices:()=>[{lang:language+'-NG',name:language}]});vi.stubGlobal('SpeechSynthesisUtterance',class{constructor(text){this.text=text}});mockQueue(futureEvent(language));const page=await renderHarness();try{await waitFor(()=>api.post.mock.calls.some(c=>c[0].endsWith('/ack')));expect(speak.mock.calls[0][0].lang).toBe(language+'-NG');expect(speak.mock.calls[0][0].text).toBe(futureEvent(language).message);const claim=api.post.mock.calls.find(c=>c[0].endsWith('/claim')),ack=api.post.mock.calls.find(c=>c[0].endsWith('/ack'));expect(ack[1].claimToken).toBe(claim[1].claimToken);expect(api.patch).not.toHaveBeenCalled();}finally{await page.close()}
});
test.each(['ha','ig','yo'])('without a matching %s voice no claim or false success is sent',async language=>{
 const speak=vi.fn();vi.stubGlobal('speechSynthesis',{cancel:vi.fn(),speak,getVoices:()=>[{lang:'en-NG',name:'English'}]});vi.stubGlobal('SpeechSynthesisUtterance',class{});mockQueue(futureEvent(language));const page=await renderHarness();try{await act(flush);expect(api.post).not.toHaveBeenCalled();expect(speak).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();}finally{await page.close()}
});
test('two tabs using one device ID send different tokens and only the winning claim plays',async()=>{
 const speak=vi.fn(u=>queueMicrotask(()=>u.onend?.()));vi.stubGlobal('speechSynthesis',{cancel:vi.fn(),speak,getVoices:()=>[{lang:'en-NG',name:'English'}]});vi.stubGlobal('SpeechSynthesisUtterance',class{});mockQueue();let claimed=false;api.post.mockImplementation(async url=>{if(url.endsWith('/claim')){if(claimed)throw Error('409 already claimed');claimed=true;return{data:{data:{id:91,status:'claimed'}}}}return{data:{data:{acknowledged:true}}}});const first=await renderHarness(),second=await renderHarness();try{await waitFor(()=>api.post.mock.calls.filter(c=>c[0].endsWith('/claim')).length===2);const claims=api.post.mock.calls.filter(c=>c[0].endsWith('/claim'));expect(claims[0][1].deviceId).toBe(claims[1][1].deviceId);expect(claims[0][1].claimToken).not.toBe(claims[1][1].claimToken);expect(speak).toHaveBeenCalledTimes(1);}finally{await first.close();await second.close()}
});
test('disabling speech cancels current playback without a success acknowledgement',async()=>{
 const cancel=vi.fn(),speak=vi.fn();vi.stubGlobal('speechSynthesis',{cancel,speak,getVoices:()=>[{lang:'en-NG',name:'English'}]});vi.stubGlobal('SpeechSynthesisUtterance',class{});mockQueue();const page=await renderHarness();try{await waitFor(()=>speak.mock.calls.length);await act(async()=>page.root.render(<Harness enabled={false}/>));expect(cancel).toHaveBeenCalled();expect(api.post.mock.calls.some(c=>c[0].endsWith('/ack')&&c[1].outcome==='success')).toBe(false);}finally{await page.close()}
});
test('a claim response received after sign-out cannot start speech',async()=>{
 const speak=vi.fn();vi.stubGlobal('speechSynthesis',{cancel:vi.fn(),speak,getVoices:()=>[{lang:'en-NG',name:'English'}]});vi.stubGlobal('SpeechSynthesisUtterance',class{});mockQueue();let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const page=await renderHarness();try{await waitFor(()=>finish);await act(async()=>page.root.render(<Harness enabled={false} userId={null}/>));await act(async()=>finish({data:{data:{id:91,status:'claimed'}}}));expect(speak).not.toHaveBeenCalled();expect(api.post.mock.calls.some(c=>c[0].endsWith('/ack'))).toBe(false);}finally{await page.close()}
});
test('expired events are never claimed',async()=>{mockQueue({...futureEvent(),expiresAt:new Date(Date.now()-1000).toISOString()});const page=await renderHarness();try{await act(flush);expect(api.post).not.toHaveBeenCalled();}finally{await page.close()}});
