import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaCamera, FaImages, FaRedo, FaTimes, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { propertyService } from '../../services/propertyService';

const DEFAULT_MAX_PHOTOS = 20;

const getCameraErrorMessage = (error) => {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Camera permission was denied. Allow camera access and try again.';
  }

  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No camera was found on this device.';
  }

  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'Camera is already in use by another app.';
  }

  return 'Unable to open camera. Use HTTPS or localhost and try again.';
};

const buildCameraConstraints = (facingMode) => ({
  audio: false,
  video: {
    facingMode: { ideal: facingMode },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});

const LivePropertyPhotoCapture = ({
  photos = [],
  captureTokens = [],
  onChange,
  onTokensChange,
  maxPhotos = DEFAULT_MAX_PHOTOS,
  disabled = false,
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const nextPreviews = photos.map((file, index) => ({
        key: `${file.name || 'property'}-${file.size || 0}-${file.lastModified || index}-${index}`,
        name: file.name || `property-photo-${index + 1}.jpg`,
        url: URL.createObjectURL(file),
    }));

    setPreviews(nextPreviews);

    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [photos]);

  const attachStream = useCallback(async (stream) => {
    streamRef.current = stream;
    setCameraOpen(true);

    window.setTimeout(async () => {
      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (error) {
        console.error('Property camera playback failed:', error);
      }
    }, 0);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setCameraLoading(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(
    async (mode = facingMode) => {
      if (disabled) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported on this browser.');
        return;
      }

      setCameraError('');
      setCameraLoading(true);
      stopCamera();

      try {
        let stream;

        try {
          stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints(mode));
        } catch (error) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }

        setFacingMode(mode);
        await attachStream(stream);
      } catch (error) {
        console.error('Property camera failed:', error);
        setCameraError(getCameraErrorMessage(error));
      } finally {
        setCameraLoading(false);
      }
    },
    [attachStream, disabled, facingMode, stopCamera]
  );

  const switchCamera = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextMode);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      toast.error('Camera is not ready yet.');
      return;
    }

    if (photos.length >= maxPhotos) {
      toast.error(`You can capture up to ${maxPhotos} property photos.`);
      return;
    }

    if (captureLoading) {
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          toast.error('Could not capture photo. Please try again.');
          return;
        }

        setCaptureLoading(true);

        try {
          const session = await propertyService.createLiveCaptureSession();
          const token = session?.data?.token;

          if (!session?.success || !token) {
            toast.error('Could not verify live capture. Please retake the photo.');
            return;
          }

          const file = new File(
            [blob],
            `property-live-${Date.now()}-${photos.length + 1}.jpg`,
            { type: 'image/jpeg' }
          );
          const nextPhotos = [...photos, file];
          const nextTokens = [...captureTokens, token];

          onChange?.(nextPhotos, nextTokens);
          onTokensChange?.(nextTokens);
        } catch (error) {
          console.error('Property capture session failed:', error);
          toast.error(error?.response?.data?.message || 'Could not verify live capture. Please try again.');
        } finally {
          setCaptureLoading(false);
        }
      },
      'image/jpeg',
      0.92
    );
  }, [captureLoading, captureTokens, maxPhotos, onChange, onTokensChange, photos]);

  const removePhoto = useCallback(
    (index) => {
      const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
      const nextTokens = captureTokens.filter((_, tokenIndex) => tokenIndex !== index);

      onChange?.(nextPhotos, nextTokens);
      onTokensChange?.(nextTokens);
    },
    [captureTokens, onChange, onTokensChange, photos]
  );

  const clearPhotos = useCallback(() => {
    onChange?.([], []);
    onTokensChange?.([]);
  }, [onChange, onTokensChange]);

  const canCaptureMore = photos.length < maxPhotos;

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="block text-sm font-semibold text-gray-900">Property Images</label>
          <p className="mt-1 text-xs text-gray-500">{photos.length}/{maxPhotos} live photos captured</p>
        </div>

        <button
          type="button"
          onClick={() => startCamera('environment')}
          disabled={disabled || cameraLoading || !canCaptureMore}
          className="btn btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FaCamera className="text-sm" />
          {cameraLoading ? 'Opening camera...' : cameraOpen ? 'Camera ready' : 'Open camera'}
        </button>
      </div>

      {cameraError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {cameraError}
        </div>
      )}

      {cameraOpen && (
        <div className="space-y-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 border-[10px] border-black/10" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={switchCamera}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 text-sm"
            >
              <FaRedo className="text-xs" />
              Switch
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!canCaptureMore || captureLoading}
              className="btn btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <FaCamera className="text-xs" />
              {captureLoading ? 'Saving...' : 'Capture'}
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="btn inline-flex items-center justify-center gap-2 text-sm"
            >
              <FaTimes className="text-xs" />
              Close
            </button>
          </div>
        </div>
      )}

      {previews.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {previews.map((preview, index) => (
              <div key={preview.key} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                <img
                  src={preview.url}
                  alt={`Captured property ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Remove property photo ${index + 1}`}
                >
                  <FaTrash className="text-sm" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={clearPhotos}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <FaTrash className="text-xs" />
            Clear captured photos
          </button>
        </div>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          <FaImages className="mb-2 text-2xl text-gray-400" />
          No property photo captured yet.
        </div>
      )}
    </section>
  );
};

export default LivePropertyPhotoCapture;
