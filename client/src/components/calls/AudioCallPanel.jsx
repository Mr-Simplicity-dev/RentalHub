import React, { useEffect, useRef } from 'react';
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaDesktop,
  FaVideo,
  FaVideoSlash,
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const AudioCallPanel = ({
  call,
  currentUserId,
  status,
  microphoneEnabled,
  cameraEnabled,
  screenSharing,
  screenShareSupported,
  localStream,
  remoteStream,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onEnd,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  const statusText = {
    requesting_microphone: t('audio_call.requesting_microphone', 'Requesting microphone access'),
    requesting_camera: t('audio_call.requesting_camera', 'Requesting camera and microphone access'),
    connecting: t('audio_call.connecting', 'Connecting call'),
    connected: t('audio_call.connected', 'Call connected'),
    reconnecting: t('audio_call.reconnecting', 'Reconnecting call'),
    failed: t('audio_call.failed', 'Call connection failed'),
  };

  const otherPartyName = (call, currentUserId) => {
    if (!call) return t('audio_call.participant', 'Participant');
    return Number(call.caller?.id) === Number(currentUserId)
      ? call.receiver?.full_name || t('audio_call.receiver', 'Receiver')
      : call.caller?.full_name || t('audio_call.caller', 'Caller');
  };

  const getCallLabel = (call) => {
    if (call?.callType === 'virtual_tour') return t('audio_call.virtual_tour', 'Virtual tour');
    if (call?.callType === 'video') return t('audio_call.video', 'Video');
    return t('audio_call.audio', 'Audio');
  };

  const isVideoCall = ['video', 'virtual_tour'].includes(call?.callType);
  const mediaLabel = getCallLabel(call);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!call) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[125] mx-auto max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-2xl sm:bottom-4 sm:left-auto sm:right-6 sm:max-w-md sm:rounded-2xl">
      {!isVideoCall && <audio ref={audioRef} autoPlay playsInline />}

      {isVideoCall && (
        <div className="relative aspect-video bg-gray-950">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {!remoteStream?.getVideoTracks?.().length &&
              t('audio_call.waiting_for_video', 'Waiting for video')}
          </div>

          <div className="absolute bottom-2 right-2 h-20 w-28 overflow-hidden rounded-lg border border-white/30 bg-gray-900 shadow-lg sm:bottom-3 sm:right-3 sm:h-28 sm:w-40 sm:rounded-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {screenSharing && (
              <div className="absolute left-1 top-1 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                {t('audio_call.screen', 'Screen')}
              </div>
            )}
            {!cameraEnabled && !screenSharing && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-xs font-semibold text-white">
                {t('audio_call.camera_off', 'Camera off')}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700">
          {isVideoCall ? <FaVideo /> : microphoneEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {t('audio_call.call_with', '{{label}} call with {{name}}', {
              label: mediaLabel,
              name: otherPartyName(call, currentUserId),
            })}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {statusText[status] ||
              t('audio_call.preparing_call', 'Preparing {{label}} call', {
                label: mediaLabel.toLowerCase(),
              })}
          </p>

          {call.propertyTitle && (
            <p className="mt-2 truncate rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">
              {t('audio_call.property', 'Property: {{title}}', { title: call.propertyTitle })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:w-auto ${
                microphoneEnabled
                  ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              }`}
            >
              {microphoneEnabled ? (
                <FaMicrophone className="text-xs" />
              ) : (
                <FaMicrophoneSlash className="text-xs" />
              )}
              {microphoneEnabled
                ? t('audio_call.mute', 'Mute')
                : t('audio_call.unmute', 'Unmute')}
            </button>

            {isVideoCall && (
              <button
                type="button"
                onClick={onToggleCamera}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:w-auto ${
                  cameraEnabled
                    ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                {cameraEnabled ? (
                  <FaVideo className="text-xs" />
                ) : (
                  <FaVideoSlash className="text-xs" />
                )}
                {cameraEnabled
                  ? t('audio_call.camera_off_button', 'Camera off')
                  : t('audio_call.camera_on_button', 'Camera on')}
              </button>
            )}

            {isVideoCall && (
              <button
                type="button"
                onClick={onToggleScreenShare}
                disabled={!screenShareSupported}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:w-auto ${
                  screenSharing
                    ? 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FaDesktop className="text-xs" />
                {screenSharing
                  ? t('audio_call.stop_share', 'Stop share')
                  : t('audio_call.share_screen', 'Share screen')}
              </button>
            )}

            <button
              type="button"
              onClick={() => onEnd(call.callId)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto"
            >
              <FaPhoneSlash className="text-xs" />
              {t('audio_call.end_call', 'End call')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioCallPanel;
