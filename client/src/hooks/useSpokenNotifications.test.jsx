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

test('unavailable SpeechSynthesis reports unavailable and preserves visual notification flow', async () => {
  // No speechSynthesis stubbed -> unavailable for en
  api.get.mockResolvedValue({ data: { data: [{ id: 14, dedupKey: 'k4', message: 'Your rent payment was successful.', language: 'en', expiresAt: new Date(Date.now() + 600000).toISOString() }] } });
  api.post.mockImplementation((url) => {
    if (url.endsWith('/claim')) return Promise.resolve({ data: { data: { id: 14, status: 'claimed' } } });
    if (url.endsWith('/ack')) return Promise.resolve({ data: { data: { id: 14, status: 'failed', acknowledged: false } } });
    return Promise.resolve({ data: {} });
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<Harness />); });
    await waitFor(() => api.post.mock.calls.find((c) => String(c[0]).includes('/ack')));
    const ackCall = api.post.mock.calls.find((c) => String(c[0]).includes('/ack'));
    expect(ackCall[1].outcome).toBe('unavailable');
    expect(api.patch.mock.calls.some((c) => String(c[0]).includes('/read'))).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});