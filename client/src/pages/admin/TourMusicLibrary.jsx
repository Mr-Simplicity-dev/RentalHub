import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  FaArchive,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaMusic,
  FaPauseCircle,
  FaPlayCircle,
  FaSave,
  FaTimesCircle,
} from 'react-icons/fa';
import api from '../../services/api';

const MUSIC_BASE = '/super/property-tour-music';

const MOODS = ['calm', 'warm', 'energetic', 'premium', 'traditional', 'modern'];
const PROPERTY_TYPES = ['apartment', 'house', 'bungalow', 'duplex', 'studio', 'flat', 'room'];

const emptyUpload = {
  title: '',
  description: '',
  mood: '',
  property_types: [],
  priority: '0',
  auto_select: true,
  commercial_use_approved: false,
  license_type: '',
  license_source: '',
  license_reference: '',
  license_expiry: '',
  license_notes: '',
};

const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-2 text-sm">
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 h-4 w-4"
    />
    <span>
      <span className="font-medium text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </span>
  </label>
);

const TourMusicLibrary = () => {
  const [tracks, setTracks] = useState([]);
  const [settings, setSettings] = useState({
    music_enabled: true,
    default_volume: 0.25,
    ducking_enabled: true,
    ducking_volume: 0.12,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState(emptyUpload);
  const [file, setFile] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tracksResponse, settingsResponse] = await Promise.all([
        api.get(`${MUSIC_BASE}/tracks`, { params: { includeArchived: 'true' } }),
        api.get(`${MUSIC_BASE}/settings`),
      ]);
      setTracks(tracksResponse.data?.data || []);
      if (settingsResponse.data?.data) {
        setSettings((prev) => ({ ...prev, ...settingsResponse.data.data }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load the music library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    if (audioPreview) URL.revokeObjectURL(audioPreview);
  }, [audioPreview]);

  const activeTracks = useMemo(() => tracks.filter((track) => !track.is_archived), [tracks]);
  const licensedCount = useMemo(
    () => activeTracks.filter((track) => track.commercial_use_approved).length,
    [activeTracks]
  );

  const handleFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    setAudioPreview(selected ? URL.createObjectURL(selected) : null);
    if (selected && !upload.title) {
      setUpload((prev) => ({ ...prev, title: selected.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      toast.error('Choose an audio file first');
      return;
    }
    if (!upload.commercial_use_approved) {
      toast.error('Commercial-use approval is required before a track can score tours');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('music', file);
      Object.entries(upload).forEach(([key, value]) => {
        if (key === 'property_types') {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'boolean') {
          formData.append(key, value ? 'true' : 'false');
        } else {
          formData.append(key, value);
        }
      });

      await api.post(`${MUSIC_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Track added to the library');
      setUpload(emptyUpload);
      setFile(null);
      if (audioPreview) URL.revokeObjectURL(audioPreview);
      setAudioPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const patchTrack = async (track, changes) => {
    try {
      await api.put(`${MUSIC_BASE}/tracks/${track.id}`, changes);
      setTracks((prev) =>
        prev.map((item) => (item.id === track.id ? { ...item, ...changes } : item))
      );
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update the track');
    }
  };

  const archiveTrack = async (track) => {
    if (!window.confirm(`Archive "${track.title}"? Existing videos keep their audio.`)) return;
    try {
      await api.delete(`${MUSIC_BASE}/tracks/${track.id}`);
      toast.success('Track archived');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not archive the track');
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put(`${MUSIC_BASE}/settings`, {
        music_enabled: settings.music_enabled,
        default_volume: Number(settings.default_volume),
        ducking_enabled: settings.ducking_enabled,
        ducking_volume: Number(settings.ducking_volume),
      });
      toast.success('Audio settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <FaMusic className="text-[#FFC928]" /> Property Tour Music
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Only approved, commercially licensed tracks may score automatic property tours. Music is
          optional and never blocks a listing.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
            {activeTracks.length} active
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
            {licensedCount} cleared for commercial use
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
            {activeTracks.length - licensedCount} awaiting licence
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Mix settings</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Toggle
            checked={settings.music_enabled}
            onChange={(value) => setSettings((prev) => ({ ...prev, music_enabled: value }))}
            label="Music enabled"
            hint="Turn off to ship every tour silent."
          />
          <Toggle
            checked={settings.ducking_enabled}
            onChange={(value) => setSettings((prev) => ({ ...prev, ducking_enabled: value }))}
            label="Duck music under narration"
            hint="Lowers the bed while the voice-over speaks."
          />
          <label className="text-sm">
            <span className="font-medium text-slate-800">Music volume</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={settings.default_volume}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, default_volume: event.target.value }))
              }
              className="input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-800">Ducked volume</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={settings.ducking_volume}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, ducking_volume: event.target.value }))
              }
              className="input mt-1"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={savingSettings}
          className="btn btn-primary mt-4 inline-flex items-center gap-2"
        >
          <FaSave /> {savingSettings ? 'Saving…' : 'Save settings'}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add a track</h2>
        <form onSubmit={handleUpload} className="mt-3 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="font-medium text-slate-800">Audio file (MP3, WAV, AAC, M4A)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFile}
                className="mt-1 block w-full text-sm"
              />
            </label>
            {audioPreview && (
              <audio controls src={audioPreview} className="md:col-span-2 w-full">
                <track kind="captions" />
              </audio>
            )}
            <label className="text-sm">
              <span className="font-medium text-slate-800">Title</span>
              <input
                value={upload.title}
                onChange={(event) => setUpload((prev) => ({ ...prev, title: event.target.value }))}
                className="input mt-1"
                required
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Mood</span>
              <select
                value={upload.mood}
                onChange={(event) => setUpload((prev) => ({ ...prev, mood: event.target.value }))}
                className="input mt-1"
              >
                <option value="">Any</option>
                {MOODS.map((mood) => (
                  <option key={mood} value={mood}>
                    {mood}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="font-medium text-slate-800">Property types</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((type) => {
                  const active = upload.property_types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setUpload((prev) => ({
                          ...prev,
                          property_types: active
                            ? prev.property_types.filter((item) => item !== type)
                            : [...prev.property_types, type],
                        }))
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? 'border-[#071A3D] bg-[#071A3D] text-white'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 block text-xs text-slate-500">
                Leave empty to make the track eligible for every property type.
              </span>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Priority</span>
              <input
                type="number"
                value={upload.priority}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, priority: event.target.value }))
                }
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Licence type</span>
              <input
                value={upload.license_type}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, license_type: event.target.value }))
                }
                placeholder="e.g. royalty-free, commissioned"
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Licence source</span>
              <input
                value={upload.license_source}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, license_source: event.target.value }))
                }
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Licence reference</span>
              <input
                value={upload.license_reference}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, license_reference: event.target.value }))
                }
                className="input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">Licence expiry</span>
              <input
                type="date"
                value={upload.license_expiry}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, license_expiry: event.target.value }))
                }
                className="input mt-1"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="font-medium text-slate-800">Licence notes</span>
              <textarea
                value={upload.license_notes}
                onChange={(event) =>
                  setUpload((prev) => ({ ...prev, license_notes: event.target.value }))
                }
                rows={2}
                className="input mt-1"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              checked={upload.auto_select}
              onChange={(value) => setUpload((prev) => ({ ...prev, auto_select: value }))}
              label="Allow automatic selection"
              hint="Tours may pick this track without an admin choosing it."
            />
            <Toggle
              checked={upload.commercial_use_approved}
              onChange={(value) =>
                setUpload((prev) => ({ ...prev, commercial_use_approved: value }))
              }
              label="Commercial use approved"
              hint="Required before this track can score any tour."
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FaCloudUploadAlt /> {uploading ? 'Uploading…' : 'Add track'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Library</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : tracks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No tracks yet. Tours fall back to silence until an approved track is added.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {tracks.map((track) => (
              <li key={track.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {track.title}
                    {track.is_archived && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-600">
                        archived
                      </span>
                    )}
                    {track.commercial_use_approved ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <FaCheckCircle /> licensed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <FaTimesCircle /> licence needed
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[track.mood, track.license_type, track.license_source]
                      .filter(Boolean)
                      .join(' · ') || 'No metadata'}
                  </p>
                  <audio controls src={track.file_url} className="mt-2 w-full max-w-md">
                    <track kind="captions" />
                  </audio>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patchTrack(track, { is_active: !track.is_active })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  >
                    {track.is_active ? <FaPauseCircle /> : <FaPlayCircle />}
                    {track.is_active ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchTrack(track, { commercial_use_approved: !track.commercial_use_approved })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  >
                    {track.commercial_use_approved ? (
                      <>
                        <FaTimesCircle /> Revoke licence
                      </>
                    ) : (
                      <>
                        <FaCheckCircle /> Approve licence
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => patchTrack(track, { auto_select: !track.auto_select })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  >
                    Auto-select {track.auto_select ? 'on' : 'off'}
                  </button>
                  {!track.is_archived && (
                    <button
                      type="button"
                      onClick={() => archiveTrack(track)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700"
                    >
                      <FaArchive /> Archive
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default TourMusicLibrary;
