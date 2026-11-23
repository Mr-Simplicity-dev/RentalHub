globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import {createLiveFaceMesh} from '../../utils/liveFaceMesh';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/dom';
import { vi } from 'vitest';
import LivePassportCaptureModal from './LivePassportCaptureModal';
import api from '../../services/api';
vi.mock('../../utils/liveFaceMesh',()=>({createLiveFaceMesh:vi.fn()}));
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key, text) => text }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function face({ size = 0.4, eye = 0.02, nose = 0.5 } = {}) {
  const points = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0.5 - size / 2, y: 0.5 - size / 2 };
  points[2] = { x: 0.5 + size / 2, y: 0.5 + size / 2 };
  points[1] = { x: nose, y: 0.5 };
  points[78] = {x:0.4,y:0.5}; points[308] = {x:0.6,y:0.5};
  points[13] = { x: 0.5, y: 0.475 }; points[14] = { x: 0.5, y: 0.525 };
  for (const indices of [[33, 160, 158, 133, 153, 144], [362, 385, 387, 263, 373, 380]]) {
    const values = [[0.4, 0.5], [0.43, 0.5 - eye], [0.47, 0.5 - eye], [0.5, 0.5], [0.47, 0.5 + eye], [0.43, 0.5 + eye]];
    indices.forEach((id, i) => { points[id] = { x: values[i][0], y: values[i][1] }; });
  }
  return { multiFaceLandmarks: [points] };
}
test.each([false,true])('camera saves automatically and supports a fresh-token retry: %s', async (retry) => {
  vi.useFakeTimers();
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
  script.setAttribute('data-loaded', 'true'); document.body.append(script);
  let onResults;
  createLiveFaceMesh.mockImplementation(async()=>({setOptions(){},onResults(fn){onResults=fn;},async send(){},close(){}}));
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['photo'], { type: 'image/jpeg' })));
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:customer-photo'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) })));
  let sessions = 0, uploads = 0;
  api.post.mockReset();
  api.post.mockImplementation(async url => {
    if (url === '/customer/photo/session') return {data:{success:true,data:{token:++sessions === 1 ? 'customer-session' : 'retry-session'}}};
    uploads++;
    if (retry && uploads === 1) throw {response:{status:500,data:{message:'Photo check unavailable'}}};
    return {data:{success:true}};
  });
  const saved = vi.fn();
  try {
    await act(async () => root.render(<LivePassportCaptureModal sessionEndpoint="/customer/photo/session" uploadEndpoint="/customer/photo" consentConfirmed onCapture={saved} />));
    const ui = within(container);
    await act(async () => fireEvent.click(ui.getByText('Open Camera')));
    expect(container.querySelector('video').srcObject).toBe(stream);
    for (const frame of [face(), face({ eye: 0.005, nose: 0.44 }), face({ nose: 0.56, size: 0.5 }), face({ size: 0.3 })]) {
      await act(async () => onResults(frame));
    }
    await act(async () => vi.advanceTimersByTime(700));
    expect(ui.getByAltText('Captured')).toBeTruthy();
    if (retry) await act(async()=>fireEvent.click(ui.getByText('Try saving photo again')));
    expect(stop).toHaveBeenCalled();
    expect(ui.queryByRole('button',{name:'Upload Photo'})).toBeNull();
    expect(api.post.mock.calls.at(-1)[0]).toBe('/customer/photo');
    expect(api.post.mock.calls.at(-1)[2].headers['X-Capture-Token']).toBe(retry ? 'retry-session' : 'customer-session');
    expect(saved).toHaveBeenCalledOnce();
    expect(api.post.mock.calls.filter(([url])=>url==='/customer/photo')).toHaveLength(retry ? 2 : 1);
    const form=api.post.mock.calls.at(-1)[1];
    expect(form.get('biometric_consent')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    container.remove(); script.remove(); delete window.FaceMesh;
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
