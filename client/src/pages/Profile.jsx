import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

const DEFAULT_LIVENESS = {
  faceDetected: false,
  centered: false,
  blink: false,
  mouthOpen: false,
  headLeft: false,
  headRight: false,
  movedCloser: false,
  movedFarther: false,
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
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available.'));
  }
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (existing.getAttribute('data-loaded') === 'true') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load script: ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load script: ${src}`));
    document.body.appendChild(script);
  });
};

const Profile = () => {
  const POST_VERIFY_REDIRECT_KEY = 'pending_unlock_redirect';
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [passport, setPassport] = useState(null);
  const [passportPreview, setPassportPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [livenessError, setLivenessError] = useState('');
  const [livenessChecks, setLivenessChecks] = useState(DEFAULT_LIVENESS);
  const [faceBox, setFaceBox] = useState(null);
  const [faceMeshReady, setFaceMeshReady] = useState(false);
  const [liveCaptureToken, setLiveCaptureToken] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const detectionEnabledRef = useRef(false);
  const metricsRef = useRef({
    baselineEar: null,
    eyesClosed: false,
    baseArea: null,
  });

  const canCaptureLive = useMemo(() => (
    livenessChecks.faceDetected &&
    livenessChecks.centered &&
    livenessChecks.blink &&
    livenessChecks.mouthOpen &&
    livenessChecks.headLeft &&
    livenessChecks.headRight &&
    livenessChecks.movedCloser &&
    livenessChecks.movedFarther
  ), [livenessChecks]);

  const missingChecks = useMemo(() => {
    const checks = [];
    if (!livenessChecks.faceDetected) checks.push('Face not detected');
    if (!livenessChecks.centered) checks.push('Center your face in the frame');
    if (!livenessChecks.blink) checks.push('Blink your eyes once');
    if (!livenessChecks.mouthOpen) checks.push('Open your mouth once');
    if (!livenessChecks.headLeft) checks.push('Turn your head left');
    if (!livenessChecks.headRight) checks.push('Turn your head right');
    if (!livenessChecks.movedCloser) checks.push('Move closer to camera');
    if (!livenessChecks.movedFarther) checks.push('Move farther from camera');
    return checks;
  }, [livenessChecks]);

  useEffect(() => {
    const nextFromQuery = searchParams.get('next');
    if (nextFromQuery && nextFromQuery.startsWith('/')) {
      localStorage.setItem(POST_VERIFY_REDIRECT_KEY, nextFromQuery);
      setPendingRedirect(nextFromQuery);
      return;
    }

    const storedTarget = localStorage.getItem(POST_VERIFY_REDIRECT_KEY);
    if (storedTarget && storedTarget.startsWith('/')) {
      setPendingRedirect(storedTarget);
      return;
    }

    setPendingRedirect(null);
  }, [searchParams]);

  useEffect(() => {
    if (!pendingRedirect || !user?.identity_verified) return;
    localStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
    navigate(pendingRedirect, { replace: true });
  }, [pendingRedirect, user?.identity_verified, navigate]);

  useEffect(() => {
    if (!pendingRedirect || user?.identity_verified) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get('/auth/me');
        if (!res.data?.success) return;

        const latestUser = res.data.data;
        updateUser(latestUser);

        if (latestUser?.identity_verified) {
          localStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
          toast.success('Identity verified. Redirecting to property unlock payment...');
          navigate(pendingRedirect, { replace: true });
        }
      } catch (error) {
        console.error('Identity status polling failed:', error);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [pendingRedirect, user?.identity_verified, navigate, updateUser]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
      if (faceMeshRef.current?.close) {
        faceMeshRef.current.close();
      }
      if (passportPreview) {
        URL.revokeObjectURL(passportPreview);
      }
    };
  }, [passportPreview]);

  const stopCamera = useCallback(() => {
    detectionEnabledRef.current = false;
    if (detectionLoopRef.current) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (faceMeshRef.current?.close) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
    setCountdown(0);
    setFaceMeshReady(false);
    setFaceBox(null);
    setLivenessChecks(DEFAULT_LIVENESS);
    setLivenessError('');
    metricsRef.current = {
      baselineEar: null,
      eyesClosed: false,
      baseArea: null,
    };
  }, []);

  const handleFaceResults = useCallback((results) => {
    const landmarks = results?.multiFaceLandmarks?.[0];
    if (!landmarks) {
      setFaceBox(null);
      setLivenessChecks((prev) => ({
        ...prev,
        faceDetected: false,
        centered: false,
      }));
      return;
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    landmarks.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    const faceWidth = Math.max(maxX - minX, 0.0001);
    const faceHeight = Math.max(maxY - minY, 0.0001);
    const faceArea = faceWidth * faceHeight;
    const faceCenterX = minX + faceWidth / 2;
    const faceCenterY = minY + faceHeight / 2;

    const centered =
      faceCenterX > 0.35 &&
      faceCenterX < 0.65 &&
      faceCenterY > 0.3 &&
      faceCenterY < 0.7;

    setFaceBox({
      left: `${Math.max(minX * 100, 0)}%`,
      top: `${Math.max(minY * 100, 0)}%`,
      width: `${Math.min(faceWidth * 100, 100)}%`,
      height: `${Math.min(faceHeight * 100, 100)}%`,
    });

    const nose = landmarks[1];
    const noseOffset = nose ? (nose.x - faceCenterX) : 0;

    const leftEar = computeEAR(landmarks, [33, 160, 158, 133, 153, 144]);
    const rightEar = computeEAR(landmarks, [362, 385, 387, 263, 373, 380]);
    const ear = (leftEar + rightEar) / 2;

    if (!metricsRef.current.baselineEar && ear > 0) {
      metricsRef.current.baselineEar = ear;
    } else if (ear > 0 && metricsRef.current.baselineEar) {
      metricsRef.current.baselineEar = (metricsRef.current.baselineEar * 0.92) + (ear * 0.08);
    }

    const earBaseline = metricsRef.current.baselineEar || ear || 0;
    const eyeClosedThreshold = earBaseline * 0.72;
    const eyeOpenThreshold = earBaseline * 0.9;

    let blink = false;
    if (ear > 0 && earBaseline > 0) {
      if (ear < eyeClosedThreshold) {
        metricsRef.current.eyesClosed = true;
      } else if (metricsRef.current.eyesClosed && ear > eyeOpenThreshold) {
        blink = true;
        metricsRef.current.eyesClosed = false;
      }
    }

    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const mouthLeft = landmarks[78];
    const mouthRight = landmarks[308];
    let mouthOpen = false;
    if (upperLip && lowerLip && mouthLeft && mouthRight) {
      const mouthOpenRatio = distance(upperLip, lowerLip) / Math.max(distance(mouthLeft, mouthRight), 0.0001);
      mouthOpen = mouthOpenRatio > 0.2;
    }

    if (!metricsRef.current.baseArea) {
      metricsRef.current.baseArea = faceArea;
    } else {
      metricsRef.current.baseArea = (metricsRef.current.baseArea * 0.9) + (faceArea * 0.1);
    }

    const baseArea = metricsRef.current.baseArea || faceArea;
    const movedCloser = faceArea > baseArea * 1.18;
    const movedFarther = faceArea < baseArea * 0.84;

    setLivenessChecks((prev) => ({
      faceDetected: true,
      centered,
      blink: prev.blink || blink,
      mouthOpen: prev.mouthOpen || mouthOpen,
      headLeft: prev.headLeft || noseOffset < -0.03,
      headRight: prev.headRight || noseOffset > 0.03,
      movedCloser: prev.movedCloser || movedCloser,
      movedFarther: prev.movedFarther || movedFarther,
    }));
  }, []);

  const runDetectionLoop = useCallback(async () => {
    if (!detectionEnabledRef.current) return;
    const video = videoRef.current;
    if (video && video.readyState >= 2 && faceMeshRef.current) {
      try {
        await faceMeshRef.current.send({ image: video });
      } catch (error) {
        console.error('FaceMesh frame processing failed:', error);
      }
    }
    detectionLoopRef.current = requestAnimationFrame(runDetectionLoop);
  }, []);

  const initFaceMesh = useCallback(async () => {
    setLivenessError('');
    setFaceMeshReady(false);

    try {
      if (typeof window === 'undefined') return;

      if (!window.FaceMesh) {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
      }

      if (!window.FaceMesh) {
        throw new Error('FaceMesh library unavailable');
      }

      const faceMesh = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      faceMesh.onResults(handleFaceResults);

      faceMeshRef.current = faceMesh;
      detectionEnabledRef.current = true;
      setFaceMeshReady(true);
      runDetectionLoop();
    } catch (error) {
      console.error('FaceMesh init failed:', error);
      setLivenessError('Live checks unavailable. Use a supported browser and stable internet.');
      setFaceMeshReady(false);
    }
  }, [handleFaceResults, runDetectionLoop]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported on this device/browser.');
      return;
    }

    setCameraError('');
    setCameraLoading(true);
    try {
      // Always open camera first; secure session token can be requested at upload time.
      setLiveCaptureToken('');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLivenessChecks(DEFAULT_LIVENESS);
      setFaceBox(null);
      setLivenessError('');
      metricsRef.current = {
        baselineEar: null,
        eyesClosed: false,
        baseArea: null,
      };
      setCameraActive(true);
      setShowCameraModal(true);
    } catch (error) {
      console.error('Camera access failed:', error);
      if (error?.name === 'NotAllowedError') {
        setCameraError('Camera permission denied in Chrome. Allow camera access for this site and retry.');
      } else if (error?.name === 'NotFoundError') {
        setCameraError('No camera device found. Connect a camera and retry.');
      } else if (error?.name === 'NotReadableError') {
        setCameraError('Camera is busy in another app. Close other apps using camera and retry.');
      } else {
        setCameraError('Unable to start live capture. Allow camera permission and try again.');
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const requestLiveCaptureSession = useCallback(async () => {
    try {
      const sessionRes = await api.post('/users/verification/live-capture/session');
      const nextToken = sessionRes?.data?.data?.token;
      if (!sessionRes?.data?.success || !nextToken) {
        return '';
      }
      setLiveCaptureToken(nextToken);
      return nextToken;
    } catch (error) {
      console.error('Live capture session request failed:', error);
      return '';
    }
  }, []);

  const setPassportFromFile = useCallback((file) => {
    if (!file) return;
    setPassport(file);
    setPassportPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const captureFromCamera = useCallback(async () => {
    if (!canCaptureLive) {
      const reason = missingChecks[0] || 'Complete all liveness checks first.';
      toast.error(reason);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Could not capture image. Please try again.');
        return;
      }

      const file = new File([blob], `passport-capture-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      setPassportFromFile(file);
      setShowCameraModal(false);
      stopCamera();
    }, 'image/jpeg', 0.92);
  }, [canCaptureLive, missingChecks, setPassportFromFile, stopCamera]);

  useEffect(() => {
    if (!cameraActive || countdown <= 0) return undefined;

    const timer = setTimeout(() => {
      if (countdown === 1) {
        captureFromCamera();
      }
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, cameraActive, captureFromCamera]);

  useEffect(() => {
    if (!showCameraModal || !cameraActive || !streamRef.current || !videoRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch((error) => {
      console.error('Video play failed:', error);
    });
  }, [showCameraModal, cameraActive]);

  useEffect(() => {
    if (!showCameraModal || !cameraActive) return undefined;

    let cancelled = false;
    const setup = async () => {
      await initFaceMesh();
      if (cancelled) return;
    };

    setup();

    return () => {
      cancelled = true;
      detectionEnabledRef.current = false;
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
        detectionLoopRef.current = null;
      }
      if (faceMeshRef.current?.close) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      setFaceMeshReady(false);
      setFaceBox(null);
    };
  }, [showCameraModal, cameraActive, initFaceMesh]);

  useEffect(() => {
    if (countdown <= 0) return;
    if (!canCaptureLive) {
      setCountdown(0);
    }
  }, [canCaptureLive, countdown]);

  const startAutoCapture = () => {
    if (!cameraActive) return;
    if (!canCaptureLive) {
      toast.error(missingChecks[0] || 'Complete all liveness checks first.');
      return;
    }
    setCountdown(3);
  };

  const handleUpload = async () => {
    if (!passport) {
      toast.error('Capture a live passport photo first.');
      return;
    }

    setUploading(true);
    try {
      let tokenToUse = liveCaptureToken;
      if (!tokenToUse) {
        tokenToUse = await requestLiveCaptureSession();
      }

      if (!tokenToUse) {
        toast.error('Could not create secure capture session. Check network and try again.');
        return;
      }

      const sendUpload = async (token) => {
        const formData = new FormData();
        formData.append('passport', passport);
        formData.append('capture_source', 'live_camera');
        formData.append('live_capture_token', token);

        return api.post('/users/upload-passport', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      };

      let res;
      try {
        res = await sendUpload(tokenToUse);
      } catch (error) {
        const isSessionError =
          error?.response?.status === 403 &&
          (error?.response?.data?.message || '').toLowerCase().includes('live capture session');

        if (!isSessionError) throw error;

        const refreshedToken = await requestLiveCaptureSession();
        if (!refreshedToken) throw error;
        tokenToUse = refreshedToken;
        res = await sendUpload(tokenToUse);
      }

      if (res.data?.success) {
        toast.success(t('profile.upload_success'));
        if (res.data.user) {
          updateUser(res.data.user);
        }
        setPassport(null);
        setLiveCaptureToken('');
        if (passportPreview) {
          URL.revokeObjectURL(passportPreview);
          setPassportPreview('');
        }
        if (pendingRedirect && !res.data.user?.identity_verified) {
          toast.info('Document uploaded. Waiting for admin verification before redirect to payment.');
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('profile.upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">{t('profile.account_title')}</h2>
        <div className="space-y-2 text-sm">
          <div><strong>{t('profile.name')}:</strong> {user?.full_name}</div>
          <div><strong>{t('profile.email')}:</strong> {user?.email}</div>
          <div><strong>{t('profile.phone')}:</strong> {user?.phone}</div>
          <div><strong>{t('profile.role')}:</strong> {user?.user_type}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">{t('profile.verify_title')}</h2>

        {user?.identity_verified ? (
          <div className="text-green-600 font-semibold">
            {t('profile.verified')}
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Live Passport Capture</h3>
              <p className="text-sm text-gray-700">{t('profile.verify_text')}</p>
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                <p>1. Start camera and complete all liveness checks.</p>
                <p>2. Capture a clear face photo inside the frame.</p>
                <p>3. Upload after capture. File upload is disabled.</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {!cameraActive ? (
                  <button
                    onClick={startCamera}
                    disabled={cameraLoading}
                    className="btn btn-secondary w-full"
                    type="button"
                  >
                    {cameraLoading ? 'Opening camera...' : 'Start Live Capture'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowCameraModal(true)}
                    className="btn btn-secondary w-full"
                    type="button"
                  >
                    Open Live Camera
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={startCamera}
                  disabled={cameraLoading}
                >
                  Retake Live Photo
                </button>
              </div>

              <div className="mt-3 flex justify-center">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !passport}
                  className="btn btn-primary w-full sm:w-72"
                >
                  {uploading ? t('profile.uploading') : t('profile.upload')}
                </button>
              </div>
            </div>

            {cameraError && (
              <p className="text-sm text-red-600 mb-4">{cameraError}</p>
            )}

            {passportPreview && (
              <div className="mb-5 rounded-xl border border-gray-200 p-4 bg-white">
                <p className="text-sm font-medium text-gray-700 mb-3">Captured passport preview</p>
                <img
                  src={passportPreview}
                  alt="Passport preview"
                  className="w-full max-w-xs rounded-lg border mx-auto"
                />
                <div className="mt-3 text-xs text-gray-500 text-center">
                  Ensure your face is sharp and fully visible before uploading.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCameraModal && cameraActive && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/20 bg-zinc-950 p-4">
            <div className="mb-3">
              <h3 className="text-white font-semibold text-lg">Live Passport Capture</h3>
              <p className="text-zinc-300 text-sm">Keep your face inside the guide and complete all checks.</p>
            </div>

            <div className="relative aspect-[4/5] sm:aspect-[3/4] max-h-[52vh] overflow-hidden rounded-xl border border-white/20 bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`h-[78%] w-[65%] border-2 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ${canCaptureLive ? 'border-green-400' : 'border-white'}`}
                />
              </div>

              {faceBox && (
                <div
                  className="absolute border-2 border-green-500 rounded-md pointer-events-none"
                  style={{
                    left: faceBox.left,
                    top: faceBox.top,
                    width: faceBox.width,
                    height: faceBox.height,
                  }}
                />
              )}

              {countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white text-7xl font-bold drop-shadow-lg">{countdown}</div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl bg-black/40 px-3 py-3 text-xs text-white">
              <div className="font-semibold mb-2">
                {faceMeshReady ? 'Live Checks' : 'Initializing live checks...'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span>{livenessChecks.faceDetected ? 'Done' : 'Pending'} Face</span>
                <span>{livenessChecks.centered ? 'Done' : 'Pending'} Center</span>
                <span>{livenessChecks.blink ? 'Done' : 'Pending'} Blink</span>
                <span>{livenessChecks.mouthOpen ? 'Done' : 'Pending'} Mouth</span>
                <span>{livenessChecks.headLeft ? 'Done' : 'Pending'} Head Left</span>
                <span>{livenessChecks.headRight ? 'Done' : 'Pending'} Head Right</span>
                <span>{livenessChecks.movedCloser ? 'Done' : 'Pending'} Move Closer</span>
                <span>{livenessChecks.movedFarther ? 'Done' : 'Pending'} Move Farther</span>
              </div>
            </div>

            <div className="mt-3 text-center text-white text-sm">
              {canCaptureLive
                ? 'Liveness checks passed. You can capture now.'
                : (missingChecks[0] || 'Center your face inside the frame.')}
            </div>

            {livenessError && (
              <div className="mt-2 text-center text-red-300 text-sm">
                {livenessError}
              </div>
            )}

            <div className="sticky bottom-0 mt-4 grid grid-cols-2 gap-2 bg-zinc-950/95 pt-3 pb-1">
              <button
                type="button"
                className="btn btn-primary"
                onClick={startAutoCapture}
                disabled={countdown > 0 || !canCaptureLive}
              >
                {countdown > 0 ? 'Capturing...' : 'Auto Capture (3s)'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={captureFromCamera}
                disabled={countdown > 0 || !canCaptureLive}
              >
                Capture Now
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCameraModal(false)}
                disabled={countdown > 0}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCameraModal(false);
                  stopCamera();
                }}
                disabled={countdown > 0}
              >
                Stop Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
