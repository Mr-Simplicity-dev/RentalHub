import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocketProvider } from './SocketContext';
const state=vi.hoisted(()=>({handlers:{},socket:{},auth:{isAuthenticated:true,user:{id:2}}}));
vi.mock('../hooks/useAuth',()=>({useAuth:()=>state.auth}));
vi.mock('../services/authStorage',()=>({getAuthToken:()=> 'test-token'}));
vi.mock('../services/api',()=>({default:{get:vi.fn(async()=>({data:{success:true,data:[{urls:'turn:relay.test:3478',username:'expires',credential:'temporary'}]}}))}}));
vi.mock('socket.io-client',()=>({io:()=>state.socket}));
vi.mock('react-toastify',()=>({toast:{info:vi.fn(),error:vi.fn(),success:vi.fn(),warning:vi.fn()}}));
vi.mock('../components/calls/CallNotification',()=>({default:()=>null}));
vi.mock('../components/calls/AudioCallPanel',()=>({default:()=>null}));
let root,host,resolveMedia,track,stream,peers;
const call={callId:'accepted-a',callType:'audio',caller:{id:1},receiver:{id:2}};
beforeEach(async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;state.handlers={};state.socket={on:vi.fn((event,fn)=>{state.handlers[event]=fn;}),off:vi.fn(),emit:vi.fn(),disconnect:vi.fn()};
 track={id:'audio',enabled:true,stop:vi.fn()};stream={getTracks:()=>[track],getAudioTracks:()=>[track],getVideoTracks:()=>[]};peers=[];
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(()=>new Promise(resolve=>{resolveMedia=resolve;}))}});
 vi.stubGlobal('RTCPeerConnection',class{constructor(){this.remoteDescription=null;this.added=[];this.addTrack=vi.fn();this.close=vi.fn();peers.push(this);}async setRemoteDescription(value){this.remoteDescription=value;}async addIceCandidate(value){this.added.push(value);}async createAnswer(){return {type:'answer',sdp:'test'};}async setLocalDescription(value){this.localDescription=value;}});
 vi.stubGlobal('RTCSessionDescription',class{constructor(value){Object.assign(this,value);}});vi.stubGlobal('RTCIceCandidate',class{constructor(value){Object.assign(this,value);}});
 vi.stubGlobal('MediaStream',class{getTracks(){return [];}addTrack(){}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(<SocketProvider><div /></SocketProvider>);});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe('accepted web call connection',()=>{
 test('offer and candidates arriving during microphone permission connect once',async()=>{
  await act(async()=>{state.handlers['call:accepted'](call);});
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  let answering;
  await act(async()=>{answering=state.handlers['call:signal:offer']({...call,description:{type:'offer',sdp:'test'}});await state.handlers['call:signal:ice-candidate']({callId:call.callId,candidate:{candidate:'early'}});});
  await act(async()=>{resolveMedia(stream);await answering;});
  expect(peers).toHaveLength(1);expect(peers[0].added).toHaveLength(1);expect(peers[0].added[0].candidate).toBe('early');expect(state.socket.emit).toHaveBeenCalledWith('call:signal:answer',expect.objectContaining({callId:call.callId}));
 });
 test('ending before permission finishes stops late media and does not reopen the call',async()=>{
  await act(async()=>{state.handlers['call:accepted'](call);});
  await act(async()=>{state.handlers['call:ended']({callId:call.callId});resolveMedia(stream);});
  expect(track.stop).toHaveBeenCalledTimes(1);expect(peers).toHaveLength(0);
 });
});
