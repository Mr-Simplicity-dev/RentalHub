import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';

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

const LawyerVerification = ({ children }) => {

  const LAWYER_VERIFICATION_KEY = 'lawyer_passport_verified';

  const [passport, setPassport] = useState(null);
  const [passportPreview, setPassportPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [livenessError, setLivenessError] = useState('');
  const [livenessChecks, setLivenessChecks] = useState(DEFAULT_LIVENESS);
  const [faceBox, setFaceBox] = useState(null);
  const [_faceMeshReady, setFaceMeshReady] = useState(false);
  const [liveCaptureToken, setLiveCaptureToken] = useState('');
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [fraudAlert, setFraudAlert] = useState(null);

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
  const autoCaptureTriggeredRef = useRef(false);

  // Check if already verified
  useEffect(() => {
    const verified = localStorage.getItem(LAWYER_VERIFICATION_KEY);
    if (verified === 'true') {
      setVerificationComplete(true);
    }
  }, [LAWYER_VERIFICATION_KEY]);

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
    setFaceMeshReady(false);
    setFaceBox(null);
    setLivenessChecks(DEFAULT_LIVENESS);
    setLivenessError('');
    autoCaptureTriggeredRef.current = false;
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
      autoCaptureTriggeredRef.current = false;
      setCameraActive(true);
      setShowCameraModal(true);
    } catch (error) {
      console.error('Camera access failed:', error);
      if (error?.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Allow camera access for this site and retry.');
      } else if (error?.name === 'NotFoundError') {
        setCameraError('No camera device found. Connect a camera and retry.');
      } else if (error?.name === 'NotReadableError') {
        setCameraError('Camera is busy in another app. Close other apps using camera and retry.');
      } else {
        setCameraError('Unable to Capture. Allow camera permission and try again.');
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

      const file = new File([blob], `lawyer-passport-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      setPassportFromFile(file);
      setShowCameraModal(false);
      stopCamera();
    }, 'image/jpeg', 0.92);
  }, [canCaptureLive, setPassportFromFile, stopCamera]);

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
      autoCaptureTriggeredRef.current = false;
    };
  }, [showCameraModal, cameraActive, initFaceMesh]);

  useEffect(() => {
    if (!showCameraModal || !cameraActive || !canCaptureLive) return undefined;
    if (autoCaptureTriggeredRef.current) return undefined;

    autoCaptureTriggeredRef.current = true;
    const timer = setTimeout(() => {
      captureFromCamera();
    }, 650);

    return () => clearTimeout(timer);
  }, [showCameraModal, cameraActive, canCaptureLive, captureFromCamera]);

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

      const sendUpload = async (token) => {
        const formData = new FormData();
        formData.append('passport', passport);
        formData.append('capture_source', 'lawyer_live_capture');
        if (token) {
          formData.append('live_capture_token', token);
        }

        return api.post('/auth/check-lawyer-passport-fraud', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      };

      let res;
      try {
        res = await sendUpload(tokenToUse);
      } catch (error) {
        if (error?.response?.status === 403) {
          const refreshedToken = await requestLiveCaptureSession();
          if (!refreshedToken) throw error;
          tokenToUse = refreshedToken;
          res = await sendUpload(tokenToUse);
        } else {
          throw error;
        }
      }

      if (!res.data?.success) {
        // Fraud detected
        setFraudAlert({
          isFraudulent: true,
          message: res.data?.message || 'Passport verification failed: Duplicate identity detected',
          matchedUser: res.data?.data?.matched_user,
        });
        toast.error('Fraud detected: Your passport matches an existing user. Super admin has been notified.');
        setPassport(null);
      } else {
        // Verification passed
        localStorage.setItem(LAWYER_VERIFICATION_KEY, 'true');
        toast.success('Passport verification passed! Dashboard access granted.');
        setVerificationComplete(true);
        setPassport(null);
        setLiveCaptureToken('');
        if (passportPreview) {
          URL.revokeObjectURL(passportPreview);
          setPassportPreview('');
        }
      }
    } catch (err) {
      setFraudAlert({
        isFraudulent: true,
        message: err?.response?.data?.message || 'Passport verification failed',
      });
      toast.error(err?.response?.data?.message || 'Passport verification failed');
    } finally {
      setUploading(false);
    }
  };

  // If verification is complete, render children (dashboard)
  if (verificationComplete && !fraudAlert?.isFraudulent) {
    return children;
  }

  // Fraud alert shown
  if (fraudAlert?.isFraudulent) {
    return (
      <div className="container mx-auto px-3 py-6 max-w-full sm:max-w-2xl">
        <div className="mb-6 flex justify-center">
          <div className="rounded-xl border-2 border-red-400 bg-red-50 px-6 py-3">
            <h1 className="text-2xl font-bold text-red-700">🚨 Verification Failed</h1>
          </div>
        </div>

        <div className="card bg-red-50 border-2 border-red-300 mb-6">
          <h2 className="font-bold text-lg text-red-700 mb-4">Fraud Alert: Duplicate Identity Detected</h2>
          <p className="text-red-900 mb-4">{fraudAlert.message}</p>
          
          {fraudAlert.matchedUser && (
            <div className="bg-white p-4 rounded border border-red-200 mb-4">
              <p className="text-sm text-gray-600 mb-2"><strong>This passport matches an existing user:</strong></p>
              <ul className="text-sm text-gray-700">
                <li><strong>Name:</strong> {fraudAlert.matchedUser.full_name}</li>
                <li><strong>Email:</strong> {fraudAlert.matchedUser.email}</li>
                <li><strong>Type:</strong> {fraudAlert.matchedUser.user_type}</li>
              </ul>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
            <p className="text-sm text-yellow-900">
              <strong>⚠️ Important:</strong> Your account has been flagged and our super admin team has been notified. If you believe this is an error, please contact support immediately.
            </p>
          </div>

          <button
            onClick={() => {
              setFraudAlert(null);
              setPassport(null);
            }}
            className="btn btn-secondary w-full"
          >
            Try Different Passport
          </button>
        </div>
      </div>
    );
  }

  // Verification gateway UI
  return (
    <div className="container mx-auto px-3 py-6 max-w-full sm:max-w-3xl">
      <div className="mb-6 flex justify-center">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-6 py-2">
          <h1 className="text-2xl font-bold text-teal-700">Lawyer Dashboard Access</h1>
        </div>
      </div>

      <div className="card mb-6 border-2 border-teal-200">
        <h2 className="font-bold text-lg mb-3 text-teal-700 text-center">Passport Verification Required</h2>
        <p className="text-gray-600 mb-4 text-center">
          Before you can access the lawyer dashboard, we need to verify your identity by capturing a live passport photo with face detection. This is a security measure to prevent fraud.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
          <p className="text-sm text-blue-900">
            <strong>ℹ️ Security Note:</strong> Your passport will be compared against existing user records to ensure no duplicate identities. If fraud is detected, super admin will be notified immediately.
          </p>
        </div>

        {passportPreview && (
          <div className="mb-6">
            <p className="text-sm font-semibold mb-2">Captured Passport:</p>
            <img
              src={passportPreview}
              alt="Captured Passport"
              className="w-full max-w-sm rounded border border-gray-300 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="btn btn-primary flex-1"
              >
                {uploading ? 'Verifying & Checking for Fraud...' : 'Verify Passport'}
              </button>
              <button
                onClick={() => {
                  setPassport(null);
                  setPassportPreview('');
                }}
                disabled={uploading}
                className="btn btn-secondary flex-1"
              >
                Retake
              </button>
            </div>
          </div>
        )}

        {showCameraModal && cameraActive && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-lg max-w-sm sm:max-w-md w-full p-3">
              <h3 className="font-bold text-sm mb-2">Live Passport Capture</h3>

              {livenessError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-red-700 text-xs">
                  {livenessError}
                </div>
              )}

              {cameraError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-red-700 text-xs">
                  {cameraError}
                </div>
              )}

              <div className="relative bg-black rounded-lg overflow-hidden mb-2 w-full" style={{ width: '100%', maxWidth: '100%', height: '200px', aspectRatio: '4/3' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {faceBox && (
                  <div
                    className="absolute border-2 border-green-400"
                    style={{
                      left: faceBox.left,
                      top: faceBox.top,
                      width: faceBox.width,
                      height: faceBox.height,
                    }}
                  />
                )}
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold mb-1">Liveness Checks:</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(livenessChecks).map(([key, value]) => (
                    <div key={key} className={`text-xs p-1 rounded ${value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {value ? '✓' : '○'} {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                  ))}
                </div>
              </div>

              {missingChecks.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2 text-xs text-yellow-900">
                  <p className="font-semibold mb-1">Still needed:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {missingChecks.map((check, idx) => <li key={idx}>{check}</li>)}
                  </ul>
                </div>
              )}

              <button
                onClick={() => {
                  setShowCameraModal(false);
                  stopCamera();
                }}
                className="btn btn-secondary w-full"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {!passportPreview && !showCameraModal && (
          <button
            onClick={startCamera}
            disabled={cameraLoading}
            className="btn btn-primary w-full"
          >
            {cameraLoading ? 'Starting Camera...' : '📷 Capture'}
          </button>
        )}
      </div>
    </div>
  );
};

export default LawyerVerification;