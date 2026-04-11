import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../common/Modal';
import Loader from '../common/Loader';
import { propertyService } from '../../services/propertyService';

const DAMAGE_TYPES = [
  ['scratch', '🔨 Scratch', 'Surface-level marks or scrapes'],
  ['crack', '⚡ Crack', 'Line or fissure in material'],
  ['hole', '🕳️ Hole', 'Opening or puncture'],
  ['dent', '▼ Dent', 'Indentation or depression'],
  ['stain', '🩹 Stain', 'Discoloration or marking'],
  ['water_damage', '💧 Water Damage', 'Moisture damage or mold'],
  ['mold', '🍃 Mold', 'Fungal growth'],
  ['other', '❓ Other', 'Something else'],
];

const SEVERITY_LEVELS = [
  { value: 'minor', label: '🟢 Minor', description: 'Cosmetic only, no functional impact' },
  { value: 'moderate', label: '🟡 Moderate', description: 'Noticeable, may need attention' },
  { value: 'severe', label: '🔴 Severe', description: 'Significant damage, repair needed' },
];

const DEPTH_LEVELS = [
  { value: 'surface', label: 'Surface', description: 'Top layer only' },
  { value: 'shallow', label: 'Shallow', description: 'Slight depth penetration' },
  { value: 'deep', label: 'Deep', description: 'Significant depth' },
];

const URGENCY_LEVELS = [
  { value: 'low', label: 'Low', description: 'Can be addressed when convenient' },
  { value: 'medium', label: 'Medium', description: 'Should be addressed soon' },
  { value: 'high', label: 'High', description: 'Urgent attention required' },
];

const ROOMS = [
  'Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3',
  'Bathroom 1', 'Bathroom 2', 'Hallway', 'Entrance', 'Balcony',
  'Corridor', 'Dining Room', 'Study', 'Storage', 'Other'
];

/**
 * DamageReportCapture - Reusable component for landlords and agents to report property damage
 * Guides users through: capture → AI analysis → review → confirm → save
 */
const DamageReportCapture = ({ propertyId, onSaved, onClose, initiatedBy = 'landlord' }) => {
  const [stage, setStage] = useState('workflow'); // workflow | camera | preview | review | confirm
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState('');
  const [analyzingDamage, setAnalyzingDamage] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const [damageForm, setDamageForm] = useState({
    room_location: '',
    damage_type: '',
    severity: '',
    depth_level: '',
    width_cm: '',
    height_cm: '',
    urgency: '',
    description: '',
  });

  const [saving, setSaving] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef('');

  // Cleanup function for preview URLs
  const cleanupPreview = useCallback(() => {
    if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    cleanupPreview();
  }, [cleanupPreview]);

  React.useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('📱 Camera is not supported on this device or browser.');
      return;
    }
    setCameraError('');
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setStage('camera');

      setTimeout(async () => {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (error) {
            console.error('Video play failed:', error);
          }
        }
      }, 100);
    } catch (error) {
      console.error('Camera error:', error);
      if (error?.name === 'NotAllowedError') {
        setCameraError('❌ Camera access was denied. Please allow camera permissions and try again.');
      } else {
        setCameraError('❌ Unable to open camera. Please check your device and try again.');
      }
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('❌ Could not capture photo. Please try again.');
          return;
        }

        cleanupPreview();
        const file = new File([blob], `damage-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const preview = URL.createObjectURL(file);

        setCapturedPhoto(file);
        setCapturedPhotoPreview(preview);
        previewUrlRef.current = preview;

        stopCamera();
        setStage('preview');
        analyzeDamagePhoto(file);
      },
      'image/jpeg',
      0.92
    );
  }, [stopCamera, cleanupPreview]);

  const analyzeDamagePhoto = useCallback(async (file) => {
    setAnalyzingDamage(true);
    setAnalysisError('');
    setAiResult(null);

    try {
      const fd = new FormData();
      fd.append('photos', file);
      const res = await propertyService.analyzeDamagePhoto(fd);
      const analysis = res?.data?.ai_analysis;

      if (analysis && !analysis.error) {
        setAiResult(analysis);
        autoFillDamageForm(analysis);
      } else {
        setAnalysisError('⚠️ AI analysis unavailable. You can complete the report manually.');
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      setAnalysisError('⚠️ AI analysis failed. You can still complete the report manually.');
    } finally {
      setAnalyzingDamage(false);
    }
  }, [autoFillDamageForm]);

  const autoFillDamageForm = useCallback((analysis) => {
    if (!analysis) return;
    setDamageForm((prev) => ({
      ...prev,
      damage_type: analysis.damage_type || prev.damage_type,
      severity: analysis.severity || prev.severity,
      depth_level: analysis.depth_level || prev.depth_level,
      width_cm: analysis.estimated_width_cm ? String(analysis.estimated_width_cm) : prev.width_cm,
      height_cm: analysis.estimated_height_cm ? String(analysis.estimated_height_cm) : prev.height_cm,
      urgency: analysis.urgency || prev.urgency,
      description: analysis.description || prev.description,
    }));
  }, []);

  const proceedToReview = useCallback(() => {
    if (!damageForm.room_location.trim()) {
      toast.error('Room location is required');
      return;
    }
    if (!damageForm.damage_type) {
      toast.error('Damage type is required');
      return;
    }
    if (!damageForm.severity) {
      toast.error('Severity level is required');
      return;
    }
    setStage('review');
  }, [damageForm]);

  const saveDamageReport = useCallback(async () => {
    if (!capturedPhoto || !damageForm.room_location) {
      toast.error('Missing required information');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('room_location', damageForm.room_location);
      fd.append('damage_type', damageForm.damage_type);
      fd.append('severity', damageForm.severity);
      fd.append('depth_level', damageForm.depth_level);
      fd.append('width_cm', damageForm.width_cm || '');
      fd.append('height_cm', damageForm.height_cm || '');
      fd.append('urgency', damageForm.urgency || '');
      fd.append('description', damageForm.description);
      fd.append('photos', capturedPhoto, capturedPhoto.name);

      if (aiResult) {
        fd.append('ai_analysis', JSON.stringify(aiResult));
      }

      const res = await propertyService.saveDamageReport(propertyId, fd);

      if (res.success) {
        toast.success('✅ Damage report saved successfully');
        cleanup();
        onSaved?.();
        onClose?.();
      } else {
        toast.error(res.message || 'Failed to save damage report');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error?.response?.data?.message || 'Failed to save damage report');
    } finally {
      setSaving(false);
    }
  }, [capturedPhoto, damageForm, aiResult, propertyId, cleanup, onSaved, onClose]);

  return (
    <Modal isOpen={true} onClose={onClose} title="📸 Damage Report">
      <div className="space-y-4">
        {/* WORKFLOW GUIDE */}
        {stage === 'workflow' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-sky-50 p-4">
              <h3 className="mb-3 font-semibold text-sky-900">How to Report Damage:</h3>
              <div className="space-y-2 text-sm text-sky-800">
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">1</span>
                  <div>
                    <strong>📸 Capture</strong>
                    <p>Take a clear photo of the damage area</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">2</span>
                  <div>
                    <strong>🤖 AI Review</strong>
                    <p>Our AI analyzes damage type, size, and severity</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">3</span>
                  <div>
                    <strong>✏️ Edit & Confirm</strong>
                    <p>Review AI findings or fill in manually, then save</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={startCamera}
              disabled={cameraLoading}
              className="btn btn-primary w-full"
            >
              {cameraLoading ? '⏳ Preparing camera...' : '📸 Start Capture'}
            </button>

            {cameraError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{cameraError}</div>}
          </div>
        )}

        {/* CAMERA CAPTURE */}
        {stage === 'camera' && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border-2 border-gray-300 bg-black">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="h-auto w-full"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="border-4 border-yellow-400 opacity-60" style={{ width: '70%', aspectRatio: '4/3' }} />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStage('workflow');
                }}
                className="btn btn-outline flex-1"
              >
                ❌ Cancel
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="btn btn-primary flex-1"
              >
                📷 Capture Photo
              </button>
            </div>

            <p className="text-center text-xs text-gray-500">Focus clearly on the damaged area within the frame</p>
          </div>
        )}

        {/* PHOTO PREVIEW & AI ANALYSIS */}
        {stage === 'preview' && (
          <div className="space-y-4">
            {capturedPhotoPreview && (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <img src={capturedPhotoPreview} alt="Captured damage" className="h-auto w-full" />
              </div>
            )}

            {analyzingDamage && (
              <div className="rounded-lg bg-blue-50 p-4 text-center">
                <Loader size="small" className="mx-auto mb-2" />
                <p className="text-sm text-blue-800">🤖 AI is analyzing your damage photo...</p>
              </div>
            )}

            {analysisError && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{analysisError}</div>
            )}

            {aiResult && !analyzingDamage && (
              <div className="space-y-3 rounded-lg bg-emerald-50 p-4">
                <h4 className="font-semibold text-emerald-900">✅ AI Analysis Result</h4>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {aiResult.damage_type && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Damage Type</p>
                      <p className="font-medium text-emerald-700">{aiResult.damage_type}</p>
                    </div>
                  )}
                  {aiResult.severity && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Severity</p>
                      <p className="font-medium text-emerald-700">{aiResult.severity}</p>
                    </div>
                  )}
                  {aiResult.depth_level && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Depth</p>
                      <p className="font-medium text-emerald-700">{aiResult.depth_level}</p>
                    </div>
                  )}
                  {aiResult.urgency && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">Urgency</p>
                      <p className="font-medium text-emerald-700">{aiResult.urgency}</p>
                    </div>
                  )}
                </div>

                {(aiResult.estimated_width_cm || aiResult.estimated_height_cm) && (
                  <div className="rounded bg-white p-2">
                    <p className="text-xs text-gray-600">Estimated Size</p>
                    <p className="font-medium text-emerald-700">
                      {aiResult.estimated_width_cm || '?'} cm × {aiResult.estimated_height_cm || '?'} cm
                    </p>
                  </div>
                )}

                {aiResult.description && (
                  <div className="rounded bg-white p-2">
                    <p className="text-xs text-gray-600">Description</p>
                    <p className="text-sm text-emerald-700">{aiResult.description}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  cleanupPreview();
                  setCapturedPhoto(null);
                  setCapturedPhotoPreview('');
                  setAiResult(null);
                  setAnalysisError('');
                  setStage('workflow');
                }}
                className="btn btn-outline flex-1"
              >
                🔄 Retake
              </button>
              <button
                type="button"
                onClick={() => {
                  setForceEditMode(false);
                  setStage('review');
                }}
                disabled={!damageForm.damage_type}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                ✏️ Review
              </button>
            </div>
          </div>
        )}

        {/* DAMAGE DETAILS FORM */}
        {stage === 'review' && (
          <div className="space-y-4">
            {/* Room Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Room/Location *</label>
              <select
                value={damageForm.room_location}
                onChange={(e) => setDamageForm((prev) => ({ ...prev, room_location: e.target.value }))}
                className="input w-full"
              >
                <option value="">Select location...</option>
                {ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
            </div>

            {/* Damage Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Damage Type *</label>
              <div className="grid grid-cols-2 gap-2">
                {DAMAGE_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDamageForm((prev) => ({ ...prev, damage_type: value }))}
                    className={`rounded-lg p-2 text-left text-xs transition ${
                      damageForm.damage_type === value
                        ? 'border-2 border-indigo-600 bg-indigo-50'
                        : 'border border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Severity *</label>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_LEVELS.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDamageForm((prev) => ({ ...prev, severity: value }))}
                    className={`rounded-lg p-2 text-center text-xs transition ${
                      damageForm.severity === value
                        ? 'border-2 border-indigo-600 bg-indigo-50'
                        : 'border border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <strong>{label}</strong>
                    <p className="text-xs text-gray-600">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Depth */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Depth</label>
              <div className="grid grid-cols-3 gap-2">
                {DEPTH_LEVELS.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDamageForm((prev) => ({ ...prev, depth_level: value }))}
                    className={`rounded-lg p-2 text-center text-xs transition ${
                      damageForm.depth_level === value
                        ? 'border-2 border-indigo-600 bg-indigo-50'
                        : 'border border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <strong>{label}</strong>
                    <p className="text-xs text-gray-600">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (cm)</label>
                <input
                  type="number"
                  min="0"
                  value={damageForm.width_cm}
                  onChange={(e) => setDamageForm((prev) => ({ ...prev, width_cm: e.target.value }))}
                  className="input w-full"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
                <input
                  type="number"
                  min="0"
                  value={damageForm.height_cm}
                  onChange={(e) => setDamageForm((prev) => ({ ...prev, height_cm: e.target.value }))}
                  className="input w-full"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Urgency</label>
              <div className="grid grid-cols-3 gap-2">
                {URGENCY_LEVELS.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDamageForm((prev) => ({ ...prev, urgency: value }))}
                    className={`rounded-lg p-2 text-center text-xs transition ${
                      damageForm.urgency === value
                        ? 'border-2 border-indigo-600 bg-indigo-50'
                        : 'border border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <strong>{label}</strong>
                    <p className="text-xs text-gray-600">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
              <textarea
                value={damageForm.description}
                onChange={(e) => setDamageForm((prev) => ({ ...prev, description: e.target.value }))}
                className="input h-20 resize-none"
                placeholder="Any other relevant details..."
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStage('preview')}
                className="btn btn-outline flex-1"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={proceedToReview}
                disabled={!damageForm.room_location || !damageForm.damage_type || !damageForm.severity}
                className="btn btn-primary flex-1 disabled:opacity-50"
              >
                ✅ Confirm & Save
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default DamageReportCapture;
