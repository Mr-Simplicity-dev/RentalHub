import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaCircle, FaRedo, FaStop, FaTimes, FaTrash, FaVideo } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { propertyService } from '../../services/propertyService';
import { useTranslation } from 'react-i18next';

const DEFAULT_MAX_CLIPS = 4;
const MAX_CLIP_SECONDS = 6;

/**
 * Live property clip capture.
 *
 * The landlord films a few short clips of the property with the on-page camera.
 * The server slows them to half speed and weaves them into the automatic tour
 * video, so the advert moves rather than only pans.
 *
 * Clips follow the same live-capture promise as the photos: the recording is
 * made here, and each clip carries its own one-use server ticket.
 */
const LivePropertyClipCapture = ({
  clips = [],
  captureTokens = [],
  onChange,
  onTokensChange,
  maxClips = DEFAULT_MAX_CLIPS,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const elapsedTimerRef = useRef(null);
  const autoStopRef = useRef(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [previews, setPreviews] = useState([]);

  // Object URLs are created once per clip and revoked, rather than rebuilt on
  // every render, so the browser does not leak a blob URL per frame.
  useEffect(() => {
    const next = clips.map((clip, index) => ({
      url: URL.createObjectURL(clip),
      key: `${clip.name || 'clip'}-${clip.size || 0}-${index}`,
    }));

    setPreviews(next);

    return () => {
      next.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [clips]);

  const clearRecorderTimers = useCallback(() => {
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    clearRecorderTimers();

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch (error) {
        console.error('Property clip recorder stop failed:', error);
      }
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) videoRef.current.srcObject = null;

    setRecording(false);
    setSeconds(0);
    setCameraOpen(false);
    setCameraLoading(false);
  }, [clearRecorderTimers]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(
    async (mode = facingMode) => {
      if (disabled) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t('live_property_capture.camera_not_supported', 'Camera is not supported on this browser.'));
        return;
      }

      setCameraError('');
      setCameraLoading(true);
      stopCamera();

      try {
        let stream;
        const constraints = {
          audio: true,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
          // Some laptops have no microphone; a silent clip is still useful.
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: constraints.video,
          });
        }

        streamRef.current = stream;
        setFacingMode(mode);
        setCameraOpen(true);

        window.setTimeout(async () => {
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (error) {
            console.error('Property clip camera playback failed:', error);
          }
        }, 0);
      } catch (error) {
        console.error('Property clip camera failed:', error);
        setCameraError(
          t('live_property_capture.camera_permission_denied', 'Camera permission was denied. Allow camera access and try again.')
        );
      } finally {
        setCameraLoading(false);
      }
    },
    [disabled, facingMode, stopCamera, t]
  );

  const switchCamera = useCallback(() => {
    startCamera(facingMode === 'environment' ? 'user' : 'environment');
  }, [facingMode, startCamera]);

  const saveClip = useCallback(
    async (blob) => {
      if (!blob) {
        toast.error(t('live_property_clip.record_failed', 'Could not record the clip. Please try again.'));
        return;
      }

      setSaving(true);

      try {
        const session = await propertyService.createLiveCaptureSession();
        const token = session?.data?.token;

        if (!session?.success || !token) {
          toast.error(t('live_property_capture.verify_failed_retake', 'Could not verify live capture. Please retake the photo.'));
          return;
        }

        const file = new File([blob], `property-clip-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
        const nextClips = [...clips, file];
        const nextTokens = [...captureTokens, token];

        onChange?.(nextClips, nextTokens);
        onTokensChange?.(nextTokens);
      } catch (error) {
        console.error('Property clip session failed:', error);
        toast.error(error?.response?.data?.message || t('live_property_capture.verify_failed_try_again', 'Could not verify live capture. Please try again.'));
      } finally {
        setSaving(false);
      }
    },
    [captureTokens, clips, onChange, onTokensChange, t]
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      toast.error(t('live_property_clip.open_camera_first', 'Open the camera before recording.'));
      return;
    }

    if (clips.length >= maxClips) {
      toast.error(t('live_property_clip.max_clips_reached', 'You can record up to {{max}} property clips.', { max: maxClips }));
      return;
    }

    if (typeof window.MediaRecorder === 'undefined') {
      toast.error(t('live_property_clip.recorder_unsupported', 'Clip recording is not supported on this browser. Use the app or a newer browser.'));
      return;
    }

    try {
      const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      const mimeType = preferred.find((type) => window.MediaRecorder.isTypeSupported?.(type));
      const recorder = new window.MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearRecorderTimers();
        setRecording(false);
        setSeconds(0);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        chunksRef.current = [];
        recorderRef.current = null;

        // A tap that stops instantly usually means a mistake, not a clip.
        if (blob.size < 4096) {
          toast.info(t('live_property_clip.too_short', 'That clip was too short. Hold the record button for a moment.'));
          return;
        }

        saveClip(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      elapsedTimerRef.current = window.setInterval(() => {
        setSeconds((current) => current + 1);
      }, 1000);

      autoStopRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_CLIP_SECONDS * 1000);
    } catch (error) {
      console.error('Property clip recording failed:', error);
      toast.error(t('live_property_clip.record_failed', 'Could not record the clip. Please try again.'));
    }
  }, [clips.length, clearRecorderTimers, maxClips, saveClip, stopRecording, t]);

  const removeClip = useCallback(
    (index) => {
      const nextClips = clips.filter((_, clipIndex) => clipIndex !== index);
      const nextTokens = captureTokens.filter((_, tokenIndex) => tokenIndex !== index);

      onChange?.(nextClips, nextTokens);
      onTokensChange?.(nextTokens);
    },
    [captureTokens, clips, onChange, onTokensChange]
  );

  const clearClips = useCallback(() => {
    onChange?.([], []);
    onTokensChange?.([]);
  }, [onChange, onTokensChange]);

  const canAddMore = clips.length < maxClips;

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="block text-sm font-semibold text-gray-900">{t('live_property_clip.property_clips', 'Property Clips (optional)')}</label>
          <p className="mt-1 text-xs text-gray-500">
            {t('live_property_clip.clip_help', 'Record up to {{max}} short clips. They are slowed down and added to your automatic tour video.', { max: maxClips })}
          </p>
          <p className="mt-1 text-xs text-gray-400">{t('live_property_clip.clips_captured', '{{count}}/{{max}} clips recorded', { count: clips.length, max: maxClips })}</p>
        </div>

        <button
          type="button"
          onClick={() => startCamera('environment')}
          disabled={disabled || cameraLoading || !canAddMore}
          className="btn btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FaVideo className="text-sm" />
          {cameraLoading ? t('live_property_capture.opening_camera', 'Opening camera...') : cameraOpen ? t('live_property_capture.camera_ready', 'Camera ready') : t('live_property_clip.open_camera', 'Open clip camera')}
        </button>
      </div>

      {cameraError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{cameraError}</div>
      )}

      {cameraOpen && (
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {recording && (
              <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white">
                <FaCircle className="text-[8px]" />
                {t('live_property_clip.recording', 'Recording')} {seconds}s / {MAX_CLIP_SECONDS}s
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={switchCamera}
              disabled={recording}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <FaRedo className="text-xs" />
              {t('live_property_capture.switch', 'Switch')}
            </button>
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="btn inline-flex items-center justify-center gap-2 bg-red-600 text-sm text-white hover:bg-red-700"
              >
                <FaStop className="text-xs" />
                {t('live_property_clip.stop', 'Stop')}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={!canAddMore || saving}
                className="btn btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <FaCircle className="text-xs" />
                {saving ? t('live_property_capture.saving', 'Saving...') : t('live_property_clip.record', 'Record clip')}
              </button>
            )}
            <button type="button" onClick={stopCamera} className="btn inline-flex items-center justify-center gap-2 text-sm">
              <FaTimes className="text-xs" />
              {t('live_property_capture.close', 'Close')}
            </button>
          </div>
        </div>
      )}

      {clips.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {clips.map((clip, index) => (
              <div key={`${clip.name}-${index}`} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
                <video src={previews[index]?.url} className="h-full w-full object-cover" muted playsInline />
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                  {t('live_property_clip.clip_number', 'Clip {{number}}', { number: index + 1 })}
                </span>
                <button
                  type="button"
                  onClick={() => removeClip(index)}
                  className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-600"
                  aria-label={t('live_property_clip.remove_clip', 'Remove clip {{number}}', { number: index + 1 })}
                >
                  <FaTrash className="text-sm" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={clearClips}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <FaTrash className="text-xs" />
            {t('live_property_clip.clear_clips', 'Clear recorded clips')}
          </button>
        </div>
      ) : (
        <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
          <FaVideo className="mb-2 text-xl text-gray-400" />
          {t('live_property_clip.no_clips', 'No clips yet. Clips are optional but make the tour video move.')}
        </div>
      )}
    </section>
  );
};

export default LivePropertyClipCapture;
