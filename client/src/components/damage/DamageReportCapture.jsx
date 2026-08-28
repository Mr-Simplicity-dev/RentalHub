import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../common/Modal';
import Loader from '../common/Loader';
import { useTranslation } from 'react-i18next';
import { propertyService } from '../../services/propertyService';

const DAMAGE_TYPES = (t) => [
  ['scratch', t('damage_capture.type_scratch', '🔨 Scratch'), t('damage_capture.type_scratch_desc', 'Surface-level marks or scrapes')],
  ['crack', t('damage_capture.type_crack', '⚡ Crack'), t('damage_capture.type_crack_desc', 'Line or fissure in material')],
  ['hole', t('damage_capture.type_hole', '🕳️ Hole'), t('damage_capture.type_hole_desc', 'Opening or puncture')],
  ['dent', t('damage_capture.type_dent', '▼ Dent'), t('damage_capture.type_dent_desc', 'Indentation or depression')],
  ['stain', t('damage_capture.type_stain', '🩹 Stain'), t('damage_capture.type_stain_desc', 'Discoloration or marking')],
  ['water_damage', t('damage_capture.type_water', '💧 Water Damage'), t('damage_capture.type_water_desc', 'Moisture damage or mold')],
  ['mold', t('damage_capture.type_mold', '🍃 Mold'), t('damage_capture.type_mold_desc', 'Fungal growth')],
  ['other', t('damage_capture.type_other', '❓ Other'), t('damage_capture.type_other_desc', 'Something else')],
];

const SEVERITY_LEVELS = (t) => [
  { value: 'minor', label: t('damage_capture.sev_minor', '🟢 Minor'), description: t('damage_capture.sev_minor_desc', 'Cosmetic only, no functional impact') },
  { value: 'moderate', label: t('damage_capture.sev_moderate', '🟡 Moderate'), description: t('damage_capture.sev_moderate_desc', 'Noticeable, may need attention') },
  { value: 'severe', label: t('damage_capture.sev_severe', '🔴 Severe'), description: t('damage_capture.sev_severe_desc', 'Significant damage, repair needed') },
];

const DEPTH_LEVELS = (t) => [
  { value: 'surface', label: t('damage_capture.depth_surface', 'Surface'), description: t('damage_capture.depth_surface_desc', 'Top layer only') },
  { value: 'shallow', label: t('damage_capture.depth_shallow', 'Shallow'), description: t('damage_capture.depth_shallow_desc', 'Slight depth penetration') },
  { value: 'deep', label: t('damage_capture.depth_deep', 'Deep'), description: t('damage_capture.depth_deep_desc', 'Significant depth') },
];

const URGENCY_LEVELS = (t) => [
  { value: 'low', label: t('damage_capture.urg_low', 'Low'), description: t('damage_capture.urg_low_desc', 'Can be addressed when convenient') },
  { value: 'medium', label: t('damage_capture.urg_medium', 'Medium'), description: t('damage_capture.urg_medium_desc', 'Should be addressed soon') },
  { value: 'high', label: t('damage_capture.urg_high', 'High'), description: t('damage_capture.urg_high_desc', 'Urgent attention required') },
];

const ROOMS = (t) => [
  t('damage_capture.room_living', 'Living Room'), t('damage_capture.room_kitchen', 'Kitchen'), t('damage_capture.room_bed1', 'Bedroom 1'), t('damage_capture.room_bed2', 'Bedroom 2'), t('damage_capture.room_bed3', 'Bedroom 3'),
  t('damage_capture.room_bath1', 'Bathroom 1'), t('damage_capture.room_bath2', 'Bathroom 2'), t('damage_capture.room_hallway', 'Hallway'), t('damage_capture.room_entrance', 'Entrance'), t('damage_capture.room_balcony', 'Balcony'),
  t('damage_capture.room_corridor', 'Corridor'), t('damage_capture.room_dining', 'Dining Room'), t('damage_capture.room_study', 'Study'), t('damage_capture.room_storage', 'Storage'), t('damage_capture.room_other', 'Other')
];

/**
 * DamageReportCapture - Reusable component for landlords and agents to submit Property Maintenance Assessments
 * Guides users through: capture → AI analysis → review → confirm → save
 */
const DamageReportCapture = ({ propertyId, onSaved, onClose, initiatedBy = 'landlord' }) => {
  const { t } = useTranslation();
  const [stage, setStage] = useState('workflow'); // workflow | camera | preview | review | confirm
  const [, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState('');
  const [analyzingDamage, setAnalyzingDamage] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [, setForceEditMode] = useState(false);

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
      setCameraError(t('damage_capture.cam_not_supported', '📱 Camera is not supported on this device or browser.'));
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
        setCameraError(t('damage_capture.cam_denied', '❌ Camera access was denied. Please allow camera permissions and try again.'));
      } else {
        setCameraError(t('damage_capture.cam_error', '❌ Unable to open camera. Please check your device and try again.'));
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
        setAnalysisError(t('damage_capture.ai_unavailable', 'AI analysis unavailable. You can complete the report manually.'));
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      setAnalysisError(t('damage_capture.ai_failed', 'AI analysis failed. You can still complete the report manually.'));
    } finally {
      setAnalyzingDamage(false);
    }
  }, [autoFillDamageForm]);

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
          toast.error(t('damage_capture.capture_failed', '❌ Could not capture photo. Please try again.'));
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
  }, [stopCamera, cleanupPreview, analyzeDamagePhoto]);

  const saveDamageReport = useCallback(async () => {
    if (!capturedPhoto || !damageForm.room_location) {
      toast.error(t('damage_capture.missing_info', 'Missing required information'));
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
        toast.success(t('damage_capture.saved', '✅ Property Maintenance Assessment saved successfully'));
        cleanup();
        onSaved?.();
        onClose?.();
      } else {
        toast.error(res.message || t('damage_capture.save_failed', 'Failed to save Property Maintenance Assessment'));
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error?.response?.data?.message || t('damage_capture.save_failed', 'Failed to save Property Maintenance Assessment'));
    } finally {
      setSaving(false);
    }
  }, [capturedPhoto, damageForm, aiResult, propertyId, cleanup, onSaved, onClose]);

  return (
    <Modal isOpen={true} onClose={onClose} title={t('damage_capture.title', '📸 Property Maintenance Assessment')}>
      <div className="space-y-4">
        {/* WORKFLOW GUIDE */}
        {stage === 'workflow' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-sky-50 p-4">
              <h3 className="mb-3 font-semibold text-sky-900">{t('damage_capture.how_to', 'How to Report Damage:')}</h3>
              <div className="space-y-2 text-sm text-sky-800">
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">1</span>
                  <div>
                    <strong>{t('damage_capture.step_capture', '📸 Capture')}</strong>
                    <p>{t('damage_capture.step_capture_desc', 'Take a clear photo of the damage area')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">2</span>
                  <div>
                    <strong>{t('damage_capture.step_ai', '🤖 AI Review')}</strong>
                    <p>{t('damage_capture.step_ai_desc', 'Our AI analyzes damage type, size, and severity')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-sky-200 px-2.5 py-0.5 font-bold">3</span>
                  <div>
                    <strong>{t('damage_capture.step_edit', '✏️ Edit & Confirm')}</strong>
                    <p>{t('damage_capture.step_edit_desc', 'Review AI findings or fill in manually, then save')}</p>
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
              {cameraLoading ? t('damage_capture.preparing', '⏳ Preparing camera...') : t('damage_capture.start_capture', '📸 Start Capture')}
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

            <p className="text-center text-xs text-gray-500">{t('damage_capture.focus_hint', 'Focus clearly on the damaged area within the frame')}</p>
          </div>
        )}

        {/* PHOTO PREVIEW & AI ANALYSIS */}
        {stage === 'preview' && (
          <div className="space-y-4">
            {capturedPhotoPreview && (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <img src={capturedPhotoPreview} alt={t('damage_capture.captured_alt', 'Captured damage')} className="h-auto w-full" />
              </div>
            )}

            {analyzingDamage && (
              <div className="rounded-lg bg-blue-50 p-4 text-center">
                <Loader size="small" className="mx-auto mb-2" />
                <p className="text-sm text-blue-800">{t('damage_capture.ai_analyzing', '🤖 AI is analyzing your damage photo...')}</p>
              </div>
            )}

            {analysisError && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{analysisError}</div>
            )}

            {aiResult && !analyzingDamage && (
              <div className="space-y-3 rounded-lg bg-emerald-50 p-4">
                <h4 className="font-semibold text-emerald-900">{t('damage_capture.ai_result', '✅ AI Analysis Result')}</h4>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {aiResult.damage_type && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">{t('damage_capture.damage_type_short', 'Damage Type')}</p>
                      <p className="font-medium text-emerald-700">{aiResult.damage_type}</p>
                    </div>
                  )}
                  {aiResult.severity && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">{t('damage_capture.severity_short', 'Severity')}</p>
                      <p className="font-medium text-emerald-700">{aiResult.severity}</p>
                    </div>
                  )}
                  {aiResult.depth_level && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">{t('damage_capture.depth_short', 'Depth')}</p>
                      <p className="font-medium text-emerald-700">{aiResult.depth_level}</p>
                    </div>
                  )}
                  {aiResult.urgency && (
                    <div className="rounded bg-white p-2">
                      <p className="text-xs text-gray-600">{t('damage_capture.urgency_short', 'Urgency')}</p>
                      <p className="font-medium text-emerald-700">{aiResult.urgency}</p>
                    </div>
                  )}
                </div>

                {(aiResult.estimated_width_cm || aiResult.estimated_height_cm) && (
                  <div className="rounded bg-white p-2">
                    <p className="text-xs text-gray-600">{t('damage_capture.est_size', 'Estimated Size')}</p>
                    <p className="font-medium text-emerald-700">
                      {aiResult.estimated_width_cm || '?'} cm × {aiResult.estimated_height_cm || '?'} cm
                    </p>
                  </div>
                )}

                {aiResult.description && (
                  <div className="rounded bg-white p-2">
                    <p className="text-xs text-gray-600">{t('damage_capture.description', 'Description')}</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('damage_capture.room_label', 'Room/Location *')}</label>
              <select
                value={damageForm.room_location}
                onChange={(e) => setDamageForm((prev) => ({ ...prev, room_location: e.target.value }))}
                className="input w-full"
              >
                <option value="">{t('damage_capture.select_location', 'Select location...')}</option>
                {ROOMS(t).map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
            </div>

            {/* Damage Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('damage_capture.damage_type', 'Damage Type *')}</label>
              <div className="grid grid-cols-2 gap-2">
                {DAMAGE_TYPES(t).map(([value, label]) => (
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('damage_capture.severity', 'Severity *')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {SEVERITY_LEVELS(t).map(({ value, label, description }) => (
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('damage_capture.depth', 'Depth')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DEPTH_LEVELS(t).map(({ value, label, description }) => (
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('damage_capture.width', 'Width (cm)')}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('damage_capture.height', 'Height (cm)')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('damage_capture.urgency', 'Urgency')}</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {URGENCY_LEVELS(t).map(({ value, label, description }) => (
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('damage_capture.notes', 'Additional Notes')}</label>
              <textarea
                value={damageForm.description}
                onChange={(e) => setDamageForm((prev) => ({ ...prev, description: e.target.value }))}
                className="input h-20 resize-none"
                placeholder={t('damage_capture.notes_placeholder', 'Any other relevant details...')}
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
                onClick={saveDamageReport}
                disabled={saving || !damageForm.room_location || !damageForm.damage_type || !damageForm.severity}
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
