import React, { useEffect, useId, useRef, useState } from 'react';
import { FaStop } from 'react-icons/fa';
import api from '../../services/api';

const PLAY_EVENT = 'rentalhub:tour-music-preview';

export default function TourMusicPlayer({ track }) {
  const id = useId();
  const audio = useRef(null);
  const request = useRef(null);
  const objectUrl = useRef(null);
  const attemptedFallback = useRef(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const cloudSource = /^https:\/\/res\.cloudinary\.com\//i.test(track.file_url || '');
  const endpoint = '/super/property-tour-music/tracks/' + track.id + '/audio';
  const source = cloudSource ? track.file_url : (api.defaults?.baseURL || '/api').replace(/\/$/, '') + endpoint;

  const stop = () => {
    request.current?.abort();
    request.current = null;
    if (audio.current) {
      audio.current.pause();
      try { audio.current.currentTime = 0; } catch { /* Metadata may not have loaded yet. */ }
    }
    setStatus('idle');
  };

  useEffect(() => {
    const player = audio.current;
    const stopOther = event => { if (event.detail !== id) stop(); };
    window.addEventListener(PLAY_EVENT, stopOther);
    return () => {
      window.removeEventListener(PLAY_EVENT, stopOther);
      request.current?.abort();
      player?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [id]);

  const loadFallback = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    attemptedFallback.current = true;
    setError(''); setHint(''); setStatus('loading');
    try {
      let response;
      try {
        response = await api.get(endpoint, { responseType: 'blob', signal: controller.signal });
      } catch (failure) {
        if (failure.response?.status !== 403 || controller.signal.aborted) throw failure;
        await api.get('/super/property-tour-music/settings', { signal: controller.signal });
        response = await api.get(endpoint, { responseType: 'blob', signal: controller.signal });
      }
      if (controller.signal.aborted) return;
      if (!response.data?.size || !/^audio\//i.test(response.data.type || '')) throw new Error('Audio was not returned');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(response.data);
      audio.current.src = objectUrl.current;
      audio.current.muted = false;
      await audio.current.play();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setStatus('idle');
      if (failure.name === 'NotAllowedError') setHint('Audio is ready. Press Play on the player.');
      else setError(failure.response?.status === 404 ? 'Audio file is missing. Please upload this track again.' : 'Could not play this track. Check your connection and try again.');
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  const failed = () => {
    if (!cloudSource && !attemptedFallback.current) { loadFallback(); return; }
    setStatus('idle'); setError('Could not play this audio file. Please retry or upload it again.');
  };

  return (
    <div className="mt-2 w-full max-w-md space-y-2">
      <div className="flex items-center gap-2">
        <audio ref={audio} controls preload="none" src={source} className="min-w-0 flex-1" aria-label={'Audio preview: ' + track.title}
          onPlay={() => { window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id })); setError(''); setHint(''); setStatus('playing'); }}
          onPause={() => setStatus(previous => previous === 'idle' || previous === 'loading' ? previous : 'paused')}
          onEnded={() => { if (audio.current) audio.current.currentTime = 0; setStatus('idle'); }} onError={failed}>
          <track kind="captions" />
        </audio>
        <button type="button" onClick={stop} disabled={status === 'idle'} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" aria-label={'Stop ' + track.title}>
          <FaStop aria-hidden="true" /> Stop
        </button>
      </div>
      {status === 'loading' && <p role="status" className="text-sm text-slate-600">Loading audio…</p>}
      {hint && <p role="status" className="text-sm text-slate-600">{hint}</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" onClick={cloudSource ? () => { audio.current.load(); audio.current.play().catch(failed); } : loadFallback}>Retry audio</button></div>}
    </div>
  );
}
