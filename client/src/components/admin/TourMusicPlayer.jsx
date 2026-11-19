import React, { useEffect, useId, useRef, useState } from 'react';
import { FaPlay, FaPause, FaStop } from 'react-icons/fa';
import api from '../../services/api';

const PLAY_EVENT = 'rentalhub:tour-music-preview';

export default function TourMusicPlayer({ track }) {
  const id = useId();
  const audio = useRef(null);
  const request = useRef(null);
  const objectUrl = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const stop = () => {
    request.current?.abort();
    request.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
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

  const play = async () => {
    if (status === 'playing') { audio.current.pause(); return; }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
    setError('');
    setStatus('loading');
    const controller = new AbortController();
    request.current = controller;
    try {
      if (!audio.current.getAttribute('src')) {
        if (/^https:\/\/res\.cloudinary\.com\//i.test(track.file_url || '')) {
          audio.current.src = track.file_url;
        } else {
          const response = await api.get('/super/property-tour-music/tracks/' + track.id + '/audio', {
            responseType: 'blob', signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (!response.data?.size || !/^audio\//i.test(response.data.type || '')) throw new Error('The server did not return an audio file.');
          objectUrl.current = URL.createObjectURL(response.data);
          audio.current.src = objectUrl.current;
        }
      }
      if (controller.signal.aborted) return;
      audio.current.muted = false;
      await audio.current.play();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setStatus('idle');
      setError(failure.response?.status === 404 ? 'Audio file is missing. Please upload this track again.' : 'Could not play this track. Check your connection and try again.');
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <div className="mt-2 w-full max-w-md space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} disabled={status === 'loading'} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm" aria-label={(status === 'playing' ? 'Pause ' : 'Play ') + track.title}>
          {status === 'playing' ? <FaPause /> : <FaPlay />}
          {status === 'loading' ? 'Loading…' : status === 'playing' ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={stop} disabled={status === 'idle'} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" aria-label={'Stop ' + track.title}>
          <FaStop /> Stop
        </button>
      </div>
      <audio ref={audio} controls preload="none" className="w-full" aria-label={'Audio preview: ' + track.title}
        onPlay={() => { window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id })); setStatus('playing'); }}
        onPause={() => setStatus(previous => previous === 'idle' ? 'idle' : 'paused')}
        onEnded={() => { if (audio.current) audio.current.currentTime = 0; setStatus('idle'); }}
        onError={() => { setStatus('idle'); setError('Could not play this audio file. Please retry or upload it again.'); }}>
        <track kind="captions" />
      </audio>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
