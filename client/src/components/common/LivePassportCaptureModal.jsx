import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaTimes, FaCheckCircle, FaRedo } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

const DEFAULT_LIVENESS = {
  faceDetected: false, centered: false, blink: false, mouthOpen: false,
  headLeft: false, headRight: false, movedCloser: false, movedFarther: false,
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const computeEAR = (landmarks, eyeIdx) => {
  const [p1, p2, p3, p4, p5, p6] = eyeIdx.map((i) => landmarks[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const vertical = distance(p2, p6) + distance(p3, p5);
  const horizontal = distance(p1, p4);
  if (!horizontal) return 0;
  return vertical / (2 * horizontal);
};

const loadExternalScript = (src) => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (existing.getAttribute('data-loaded') === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load script: ${src}`)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.setAttribute('data-loaded', 'true'); resolve(); };
    script.onerror = () => reject(new Error(`Could not load script: ${src}`));
    document.body.appendChild(script);
  });
};

const LivePassportCaptureModal = ({ onCapture, onClose, title = 'Live Passport Capture' }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [livenessError, setLivenessError] = useState('');
  const [livenessChecks, setLivenessChecks] = useState(DEFAULT_LIVENESS);
  const [faceBox, setFaceBox] = useState(null);
  const [liveCaptureToken, setLiveCaptureToken] = useState('');
  const [captured, setCaptured] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const detectionEnabledRef = useRef(false);
  const metricsRef = useRef({ baselineEar: null, eyesClosed: false, baseArea: null });
  const autoCaptureTriggeredRef = useRef(false);

  const LEFT_EYE = [33, 160, 158, 133, 153, 144];
  const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

  const canCaptureLive = useMemo(() => (
    livenessChecks.faceDetected && livenessChecks.centered && livenessChecks.blink &&
    livenessChecks.mouthOpen && livenessChecks.headLeft && livenessChecks.headRight &&
    livenessChecks.movedCloser && livenessChecks.movedFarther
  ), [livenessChecks]);

  const stopResources = useCallback(() => {
    detectionEnabledRef.current = false;
    if (detectionLoopRef.current) { cancelAnimationFrame(detectionLoopRef.current); detectionLoopRef.current = null; }
    if (faceMeshRef.current?.close) { faceMeshRef.current.close(); faceMeshRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setFaceBox(null);
    setLivenessChecks(DEFAULT_LIVENESS);
    setLivenessError('');
    autoCaptureTriggeredRef.current = false;
    metricsRef.current = { baselineEar: null, eyesClosed: false, baseArea: null };
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas;
  }, []);

  const handleFaceResults = useCallback((results) => {
    const landmarks = results?.multiFaceLandmarks?.[0];
    if (!landmarks) {
      setFaceBox(null);
      setLivenessChecks((prev) => ({ ...prev, faceDetected: false, centered: false }));
      return;
    }
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    landmarks.forEach(({ x, y }) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; });
    const w = maxX - minX, h = maxY - minY;
    setFaceBox({ x: minX, y: minY, width: w, height: h });
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const centered = Math.abs(centerX - 0.5) < 0.15 && Math.abs(centerY - 0.5) < 0.15;
    const faceArea = w * h;
    const noseTip = landmarks[1];
    const headLeft = noseTip ? noseTip.x - centerX < -0.04 : false;
    const headRight = noseTip ? noseTip.x - centerX > 0.04 : false;
    const earLeft = computeEAR(landmarks, LEFT_EYE);
    const earRight = computeEAR(landmarks, RIGHT_EYE);
    const avgEAR = (earLeft + earRight) / 2;

    const { baselineEar, baseArea } = metricsRef.current;
    let blink = false;
    if (avgEAR > 0.01 && baselineEar === null) {
      metricsRef.current.baselineEar = avgEAR;
    } else if (avgEAR > 0.01 && baselineEar) {
      if (!metricsRef.current.eyesClosed && avgEAR < baselineEar * 0.72) {
        metricsRef.current.eyesClosed = true;
      }
      if (metricsRef.current.eyesClosed && avgEAR > baselineEar * 0.9) {
        blink = true;
        metricsRef.current.eyesClosed = false;
      }
    }
    if (!baseArea && faceArea > 0) metricsRef.current.baseArea = faceArea;
    const mouthOpen = faceArea > 0
      ? distance(landmarks[13], landmarks[14]) / h > 0.2
      : false;
    const movedCloser = baseArea ? faceArea > baseArea * 1.18 : false;
    const movedFarther = baseArea ? faceArea < baseArea * 0.84 : false;

    setLivenessChecks((prev) => ({
      ...prev,
      faceDetected: true,
      centered,
      blink: prev.blink || blink,
      mouthOpen: prev.mouthOpen || mouthOpen,
      headLeft: prev.headLeft || headLeft,
      headRight: prev.headRight || headRight,
      movedCloser: prev.movedCloser || movedCloser,
      movedFarther: prev.movedFarther || movedFarther,
    }));
  }, [LEFT_EYE, RIGHT_EYE]);

  const startCamera = useCallback(async () => {
    setCameraLoading(true);
    setCameraError('');
    setLivenessError('');
    stopResources();
    try {
      await loadExternalScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
      const FaceMesh = window.FaceMesh;
      if (!FaceMesh) throw new Error('FaceMesh not loaded');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const mesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      mesh.onResults((results) => { if (detectionEnabledRef.current) handleFaceResults(results); });
      faceMeshRef.current = mesh;
      detectionEnabledRef.current = true;
      const loop = async () => {
        if (!detectionEnabledRef.current || !videoRef.current || videoRef.current.readyState < 2) {
          detectionLoopRef.current = requestAnimationFrame(loop);
          return;
        }
        await mesh.send({ image: videoRef.current });
        detectionLoopRef.current = requestAnimationFrame(loop);
      };
      loop();
      setCameraActive(true);
      setCameraLoading(false);
      setCaptured(false);
      setCapturedImage(null);
      autoCaptureTriggeredRef.current = false;
      metricsRef.current = { baselineEar: null, eyesClosed: false, baseArea: null };
      setLivenessChecks(DEFAULT_LIVENESS);
      try {
        const res = await api.post('/users/verification/live-capture/session');
        if (res.data?.success && res.data?.data?.token) {
          setLiveCaptureToken(res.data.data.token);
        }
      } catch {}
    } catch (err) {
      setCameraError(err.message || 'Could not access camera');
      setCameraLoading(false);
    }
  }, [stopResources, handleFaceResults]);

  useEffect(() => {
    if (!canCaptureLive || autoCaptureTriggeredRef.current || !cameraActive) return;
    autoCaptureTriggeredRef.current = true;
    setTimeout(() => {
      const canvas = capturePhoto();
      if (canvas) {
        canvas.toBlob((blob) => {
          if (!blob) return;
          setCapturedImage(URL.createObjectURL(blob));
          setCaptured(true);
        }, 'image/jpeg', 0.92);
      }
    }, 650);
  }, [canCaptureLive, cameraActive, capturePhoto]);

  const handleUpload = useCallback(async () => {
    if (!capturedImage) return;
    setUploadingPhoto(true);
    try {
      const blob = await fetch(capturedImage).then((r) => r.blob());
      const formData = new FormData();
      formData.append('passport', blob, `passport-capture-${Date.now()}.jpg`);
      formData.append('capture_source', 'live_camera');
      if (liveCaptureToken) formData.append('live_capture_token', liveCaptureToken);
      await api.post('/users/upload-passport', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Passport photo uploaded successfully');
      onCapture?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }, [capturedImage, liveCaptureToken, onCapture, onClose]);

  useEffect(() => { return () => stopResources(); }, [stopResources]);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-950 p-4 text-white shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:text-white hover:bg-zinc-800"><FaTimes /></button>
        </div>

        {!cameraActive && !captured && (
          <div className="text-center py-8 space-y-4">
            <p className="text-sm text-zinc-400">Position your face clearly in a well-lit area. Follow the on-screen steps to prove liveness.</p>
            {cameraError && <p className="text-sm text-red-400">{cameraError}</p>}
            <button onClick={startCamera} disabled={cameraLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 transition disabled:opacity-60">
              {cameraLoading ? 'Starting camera...' : 'Open Camera'}
            </button>
          </div>
        )}

        {captured && !cameraActive && (
          <div className="text-center py-4 space-y-4">
            <img src={capturedImage} alt="Captured" className="mx-auto max-h-60 rounded-lg border-2 border-green-500" />
            <p className="text-sm text-green-400 font-medium">Liveness checks passed. Tap upload to proceed.</p>
            <div className="flex justify-center gap-3">
              <button onClick={startCamera} disabled={cameraLoading} className="inline-flex items-center gap-1 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 transition">
                <FaRedo /> Retake
              </button>
              <button onClick={handleUpload} disabled={uploadingPhoto} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-60">
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
          </div>
        )}

        {cameraActive && !captured && (
          <div className="relative">
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full scale-x-[-1]" />
              <canvas ref={canvasRef} className="hidden" />
              {faceBox && (
                <div className="absolute border-2 border-green-500 rounded-lg transition-all duration-150"
                  style={{ left: `${(1 - faceBox.x - faceBox.width) * 100}%`, top: `${faceBox.y * 100}%`, width: `${faceBox.width * 100}%`, height: `${faceBox.height * 100}%` }} />
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {Object.entries(livenessChecks).map(([key, done]) => (
                <div key={key} className={`flex items-center gap-1.5 rounded px-2 py-1.5 ${done ? 'bg-green-900/40 text-green-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  <FaCheckCircle className={done ? 'text-green-400' : 'text-zinc-600'} size={12} />
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
              ))}
            </div>
            {!canCaptureLive && <p className="mt-3 text-center text-sm text-amber-400">Complete all liveness checks. The photo will capture automatically.</p>}
            {canCaptureLive && !captured && <p className="mt-3 text-center text-sm text-green-400 font-medium">Liveness checks passed. Capturing now...</p>}
            {livenessError && <p className="mt-2 text-center text-sm text-red-400">{livenessError}</p>}
            <button onClick={stopResources} className="mt-3 w-full rounded-lg bg-zinc-800 py-2 text-sm text-zinc-400 hover:bg-zinc-700 transition">Close Camera</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivePassportCaptureModal;
