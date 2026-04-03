import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import MapPicker from '../components/MapPicker';
import { propertyService } from '../services/propertyService';
import { useAuth } from '../hooks/useAuth';

const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
  'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

const PROPERTY_TYPES = ['apartment', 'house', 'bungalow', 'duplex', 'studio', 'flat', 'room'];
const EMPTY_DAMAGE = { room_location: '', damage_type: '', description: '', width_cm: '', height_cm: '', depth_level: '', severity: '' };
const TYPE_OPTIONS = [['scratch', 'Scratch'], ['crack', 'Crack'], ['hole', 'Hole'], ['dent', 'Dent'], ['stain', 'Stain'], ['water_damage', 'Water Damage'], ['mold', 'Mold'], ['other', 'Other']];
const SEVERITY_STYLES = { minor: 'bg-emerald-100 text-emerald-700', moderate: 'bg-amber-100 text-amber-700', severe: 'bg-red-100 text-red-700' };
const URGENCY_STYLES = { low: 'bg-sky-100 text-sky-700', medium: 'bg-orange-100 text-orange-700', high: 'bg-red-100 text-red-700' };
const DAMAGE_WORKFLOW = [
  { title: '1. Capture', description: 'Open the camera and focus clearly on the damaged area.' },
  { title: '2. Review AI', description: 'Check the AI reading for type, severity, size, depth, and urgency.' },
  { title: '3. Confirm', description: 'Edit anything that needs correction, then save the report.' },
];

const AddProperty = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAgent = user?.user_type === 'agent';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', state: '', city: '', area: '', property_type: '',
    rent_amount: '', payment_frequency: 'yearly', bedrooms: '', bathrooms: '',
    amenities: '', is_available: true, latitude: '', longitude: '',
  });
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [code, setCode] = useState(['', '', '', '', '', '']);

  const [damageReports, setDamageReports] = useState([]);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState('');
  const [capturedPhotoFile, setCapturedPhotoFile] = useState(null);
  const [damageForm, setDamageForm] = useState(EMPTY_DAMAGE);
  const [aiResult, setAiResult] = useState(null);
  const [analyzingDamage, setAnalyzingDamage] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const capturedPreviewRef = useRef('');
  const damageReportsRef = useRef([]);

  useEffect(() => {
    capturedPreviewRef.current = capturedPhotoPreview;
  }, [capturedPhotoPreview]);

  useEffect(() => {
    damageReportsRef.current = damageReports;
  }, [damageReports]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    if (capturedPreviewRef.current) URL.revokeObjectURL(capturedPreviewRef.current);
    damageReportsRef.current.forEach((report) => {
      if (report.photoPreview) URL.revokeObjectURL(report.photoPreview);
    });
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const nextCode = [...code];
    nextCode[index] = value;
    setCode(nextCode);
    const next = document.getElementById(`otp-${index + 1}`);
    if (value && next) next.focus();
  };

  const clearCapturedPhoto = useCallback(() => {
    if (capturedPhotoPreview) URL.revokeObjectURL(capturedPhotoPreview);
    setCapturedPhotoPreview('');
    setCapturedPhotoFile(null);
    setAiResult(null);
    setAnalysisError('');
  }, [capturedPhotoPreview]);

  const resetDamageEntry = useCallback(() => {
    clearCapturedPhoto();
    setDamageForm(EMPTY_DAMAGE);
  }, [clearCapturedPhoto]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setShowCameraModal(false);
    setCameraLoading(false);
  }, []);

  const applyAiToForm = useCallback((analysis) => {
    if (!analysis || analysis.error) return;
    setDamageForm((prev) => ({
      ...prev,
      damage_type: analysis.damage_type || prev.damage_type,
      severity: analysis.severity || prev.severity,
      width_cm: analysis.estimated_width_cm != null ? String(analysis.estimated_width_cm) : prev.width_cm,
      height_cm: analysis.estimated_height_cm != null ? String(analysis.estimated_height_cm) : prev.height_cm,
      depth_level: analysis.depth_level || prev.depth_level,
      description: analysis.description || prev.description,
    }));
  }, []);

  const analyzeCapturedDamage = useCallback(async (file) => {
    if (!file) return;
    setAnalyzingDamage(true);
    setAnalysisError('');
    setAiResult(null);
    try {
      const fd = new FormData();
      fd.append('photos', file);
      const res = await propertyService.analyzeDamagePhoto(fd);
      const analysis = res?.data?.ai_analysis || null;
      setAiResult(analysis);
      applyAiToForm(analysis);
      if (analysis?.error) setAnalysisError('AI analysis is unavailable for this photo, but you can still complete the report manually.');
    } catch (error) {
      console.error('Damage AI analysis failed:', error);
      setAnalysisError(error?.response?.data?.message || 'AI analysis failed. You can still fill the report manually.');
    } finally {
      setAnalyzingDamage(false);
    }
  }, [applyAiToForm]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported on this device or browser.');
      return;
    }
    setCameraError('');
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setShowCameraModal(true);
      setCameraActive(true);
      setTimeout(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch (error) { console.error('Video play failed:', error); }
        }
      }, 80);
    } catch (error) {
      console.error('Damage camera error:', error);
      setCameraError(error?.name === 'NotAllowedError' ? 'Camera access was denied. Please allow camera access and try again.' : 'Unable to open the camera right now. Please try again.');
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Could not capture the damage photo. Please try again.');
        return;
      }
      const file = new File([blob], `damage-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      clearCapturedPhoto();
      setCapturedPhotoFile(file);
      setCapturedPhotoPreview(URL.createObjectURL(file));
      stopCamera();
      analyzeCapturedDamage(file);
    }, 'image/jpeg', 0.92);
  }, [analyzeCapturedDamage, clearCapturedPhoto, stopCamera]);

  const addDamageReport = () => {
    if (!capturedPhotoFile || !capturedPhotoPreview) return toast.error('Please capture a photo first');
    if (!String(damageForm.room_location || '').trim()) return toast.error('Room location is required');
    setDamageReports((prev) => [...prev, { ...damageForm, id: Date.now(), photoFile: capturedPhotoFile, photoPreview: capturedPhotoPreview, ai_result: aiResult }]);
    setCapturedPhotoFile(null);
    setCapturedPhotoPreview('');
    setDamageForm(EMPTY_DAMAGE);
    setAiResult(null);
    setAnalysisError('');
    toast.success('Damage report added');
  };

  const removeDamageReport = (reportId) => {
    setDamageReports((prev) => {
      const target = prev.find((report) => report.id === reportId);
      if (target?.photoPreview) URL.revokeObjectURL(target.photoPreview);
      return prev.filter((report) => report.id !== reportId);
    });
  };

  const proceedToVerification = (e) => {
    e.preventDefault();
    if (!form.title || !form.state || !form.city || !form.property_type || !form.rent_amount) return toast.error(t('add_property.required'));
    if (!form.latitude || !form.longitude) return toast.error('Please pick the property location on the map.');
    setStep(2);
  };

  const submitProperty = async () => {
    if (code.join('') !== '123456') return toast.error(t('add_property.invalid_code'));
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      fd.append('amenities', JSON.stringify(form.amenities ? form.amenities.split(',').map((item) => item.trim()).filter(Boolean) : []));
      images.forEach((image) => fd.append('images', image));
      if (video) fd.append('video', video);
      const res = await propertyService.createProperty(fd);
      if (!res.success) return toast.error(res.message || t('add_property.failed'));
      if (damageReports.length > 0 && res.data?.id) {
        for (const report of damageReports) {
          const damageData = new FormData();
          damageData.append('room_location', report.room_location);
          damageData.append('damage_type', report.damage_type || '');
          damageData.append('description', report.description || '');
          damageData.append('width_cm', report.width_cm || '');
          damageData.append('height_cm', report.height_cm || '');
          damageData.append('depth_level', report.depth_level || '');
          damageData.append('severity', report.severity || '');
          if (report.ai_result) damageData.append('ai_analysis', JSON.stringify(report.ai_result));
          if (report.photoFile) damageData.append('photos', report.photoFile, report.photoFile.name);
          try { await propertyService.saveDamageReport(res.data.id, damageData); } catch (error) { console.error('Damage report upload error:', error); }
        }
      }
      toast.success(res.message || t('add_property.success'));
      navigate('/my-properties');
    } catch (error) {
      toast.error(error?.response?.data?.message || t('add_property.failed'));
    } finally {
      setLoading(false);
    }
  };

  const analysisSize = aiResult?.estimated_width_cm || aiResult?.estimated_height_cm ? `${aiResult?.estimated_width_cm || '?'} cm x ${aiResult?.estimated_height_cm || '?'} cm` : 'Not estimated';

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('add_property.title')}</h1>

      {step === 1 && (
        <form onSubmit={proceedToVerification} className="card space-y-4">
          <input name="title" value={form.title} onChange={handleChange} className="input" placeholder={t('add_property.form.title')} />
          <textarea name="description" value={form.description} onChange={handleChange} className="input" rows="4" placeholder={t('add_property.form.description')} />
          <div className="grid grid-cols-2 gap-4">
            <select name="state" value={form.state} onChange={handleChange} className="input"><option value="">{t('add_property.form.state')}</option>{STATES.map((stateName) => <option key={stateName} value={stateName}>{stateName}</option>)}</select>
            <input name="city" value={form.city} onChange={handleChange} className="input" placeholder={t('add_property.form.city')} />
          </div>
          <input name="area" value={form.area} onChange={handleChange} className="input" placeholder={t('add_property.form.area')} />
          <select name="property_type" value={form.property_type} onChange={handleChange} className="input"><option value="">{t('add_property.form.type')}</option>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="rent_amount" value={form.rent_amount} onChange={handleChange} className="input" placeholder={t('add_property.form.rent')} />
            <select name="payment_frequency" value={form.payment_frequency} onChange={handleChange} className="input"><option value="yearly">{t('add_property.form.yearly')}</option><option value="monthly">{t('add_property.form.monthly')}</option></select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="bedrooms" value={form.bedrooms} onChange={handleChange} className="input" placeholder={t('add_property.form.bedrooms')} />
            <input type="number" name="bathrooms" value={form.bathrooms} onChange={handleChange} className="input" placeholder={t('add_property.form.bathrooms')} />
          </div>
          <input name="amenities" value={form.amenities} onChange={handleChange} className="input" placeholder={t('add_property.form.amenities')} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Pick Property Location</label>
            <MapPicker value={form.latitude && form.longitude ? { lat: Number(form.latitude), lng: Number(form.longitude) } : null} onChange={({ lat, lng }) => setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }))} />
            {form.latitude && form.longitude && <p className="text-xs text-gray-500">{Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</p>}
          </div>
          <div><label className="mb-1 block text-sm font-medium">Property Images</label><input type="file" multiple accept="image/*" onChange={(e) => setImages(Array.from(e.target.files || []))} /></div>
          <div><label className="mb-1 block text-sm font-medium">Short Video Clip</label><input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files?.[0] || null)} /></div>
          <label className="flex items-center space-x-2"><input type="checkbox" name="is_available" checked={form.is_available} onChange={handleChange} /><span>{t('add_property.form.available')}</span></label>
          <button className="btn btn-primary w-full">{t('add_property.continue')}</button>
        </form>
      )}

      {step === 2 && (
        <div className="card space-y-6">
          <div className="space-y-3 text-center">
            <h2 className="text-xl font-semibold">Property Condition Report</h2>
            <p className="text-sm text-gray-500">Capture any existing damage, review the AI summary, then confirm or edit the details before saving.</p>
            {isAgent && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-800">You are documenting this property on behalf of your assigned landlord.</div>}
          </div>
          {!capturedPhotoPreview && (
            <div className="space-y-3">
              {cameraError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cameraError}</div>}
              <button type="button" onClick={startCamera} disabled={cameraLoading} className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white py-12 text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60">
                <div className="text-3xl font-semibold">{cameraLoading ? 'Opening...' : 'Open Camera'}</div>
                <p className="mt-2 text-sm">Use the same cleaner capture style as the profile camera flow.</p>
              </button>
            </div>
          )}
          {capturedPhotoPreview && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative">
                  <img src={capturedPhotoPreview} alt="Damage preview" className="max-h-80 w-full object-cover" />
                  {analyzingDamage && <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-6 text-center text-sm font-medium text-white">Analyzing the captured damage photo with AI...</div>}
                </div>
                <div className="flex gap-3 border-t px-4 py-3">
                  <button type="button" onClick={resetDamageEntry} className="btn w-full">Retake Photo</button>
                  <button type="button" onClick={() => capturedPhotoFile && analyzeCapturedDamage(capturedPhotoFile)} disabled={analyzingDamage || !capturedPhotoFile} className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">{analyzingDamage ? 'Analyzing...' : 'Refresh AI Analysis'}</button>
                </div>
              </div>
              {analysisError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{analysisError}</div>}
              {aiResult && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><h3 className="text-base font-semibold text-indigo-900">AI Damage Summary</h3><p className="mt-1 text-sm text-indigo-700">Review these suggestions, then edit anything that needs correction before saving.</p></div>
                    {aiResult.urgency && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${URGENCY_STYLES[aiResult.urgency] || 'bg-gray-100 text-gray-700'}`}>{aiResult.urgency} urgency</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white px-4 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">Damage type</p><p className="mt-1 font-semibold text-gray-900">{aiResult.damage_type || 'Not identified'}</p></div>
                    <div className="rounded-xl bg-white px-4 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">Severity</p><div className="mt-1"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_STYLES[aiResult.severity] || 'bg-gray-100 text-gray-700'}`}>{aiResult.severity || 'Not identified'}</span></div></div>
                    <div className="rounded-xl bg-white px-4 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">Estimated size</p><p className="mt-1 font-semibold text-gray-900">{analysisSize}</p></div>
                    <div className="rounded-xl bg-white px-4 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">Depth</p><p className="mt-1 font-semibold text-gray-900">{aiResult.depth_level || 'Not identified'}</p></div>
                    <div className="rounded-xl bg-white px-4 py-3 md:col-span-2"><p className="text-xs uppercase tracking-wide text-gray-500">Recommendation</p><p className="mt-1 text-sm font-medium text-gray-900">{aiResult.repair_recommendation || 'No repair recommendation available'}</p></div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-gray-700">Room / Location *</label><input value={damageForm.room_location} onChange={(e) => setDamageForm((prev) => ({ ...prev, room_location: e.target.value }))} className="input w-full" placeholder="e.g. Living Room wall, Kitchen sink area" /></div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Damage Type</label><select value={damageForm.damage_type} onChange={(e) => setDamageForm((prev) => ({ ...prev, damage_type: e.target.value }))} className="input w-full"><option value="">Select type</option>{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Severity</label><select value={damageForm.severity} onChange={(e) => setDamageForm((prev) => ({ ...prev, severity: e.target.value }))} className="input w-full"><option value="">Select severity</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Width (cm)</label><input type="number" value={damageForm.width_cm} onChange={(e) => setDamageForm((prev) => ({ ...prev, width_cm: e.target.value }))} className="input w-full" placeholder="e.g. 12" /></div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Height (cm)</label><input type="number" value={damageForm.height_cm} onChange={(e) => setDamageForm((prev) => ({ ...prev, height_cm: e.target.value }))} className="input w-full" placeholder="e.g. 5" /></div>
                <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-gray-700">Depth</label><select value={damageForm.depth_level} onChange={(e) => setDamageForm((prev) => ({ ...prev, depth_level: e.target.value }))} className="input w-full"><option value="">Select depth</option><option value="surface">Surface</option><option value="shallow">Shallow</option><option value="deep">Deep</option><option value="structural">Structural</option></select></div>
                <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-gray-700">Description</label><textarea value={damageForm.description} onChange={(e) => setDamageForm((prev) => ({ ...prev, description: e.target.value }))} className="input w-full resize-none" rows={3} placeholder="Add any extra detail the AI may have missed." /></div>
              </div>
              <button type="button" onClick={addDamageReport} disabled={analyzingDamage || !damageForm.room_location.trim()} className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">Save This Damage Report</button>
            </div>
          )}
          {damageReports.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">{damageReports.length} damage report{damageReports.length > 1 ? 's' : ''} added</p>
              {damageReports.map((report) => (
                <div key={report.id} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <img src={report.photoPreview} alt="Damage preview" className="h-20 w-20 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{report.room_location}</p>
                      {report.severity && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLES[report.severity] || 'bg-gray-100 text-gray-700'}`}>{report.severity}</span>}
                      {report.ai_result?.urgency && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${URGENCY_STYLES[report.ai_result.urgency] || 'bg-gray-100 text-gray-700'}`}>{report.ai_result.urgency} urgency</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{report.damage_type || 'Damage type not set'}{(report.width_cm || report.height_cm) ? ` - ${report.width_cm || '?'} cm x ${report.height_cm || '?'} cm` : ''}{report.depth_level ? ` - ${report.depth_level}` : ''}</p>
                    {report.ai_result?.repair_recommendation && <p className="mt-1 text-xs text-gray-500">Recommendation: {report.ai_result.repair_recommendation}</p>}
                  </div>
                  <button type="button" onClick={() => removeDamageReport(report.id)} className="shrink-0 text-lg text-red-400 transition hover:text-red-600">x</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStep(1)} className="btn w-full">Back</button>
            <button type="button" onClick={() => setStep(3)} className="btn btn-primary w-full">{damageReports.length > 0 ? `Continue with ${damageReports.length} report${damageReports.length > 1 ? 's' : ''}` : 'Skip - No Damages'}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-6 text-center">
          <h2 className="text-xl font-semibold">{t('add_property.verify_title')}</h2>
          <div className="flex justify-center space-x-2">
            {code.map((value, index) => <input key={index} id={`otp-${index}`} value={value} onChange={(e) => handleCodeChange(index, e.target.value)} maxLength="1" className="h-12 w-12 rounded border text-center text-xl" />)}
          </div>
          <div className="flex space-x-3">
            <button onClick={() => setStep(2)} className="btn btn-secondary flex-1">{t('add_property.back')}</button>
            <button onClick={submitProperty} disabled={loading} className="btn btn-primary flex-1">{loading ? t('add_property.submitting') : t('add_property.publish')}</button>
          </div>
        </div>
      )}

      {showCameraModal && cameraActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div><h3 className="text-lg font-semibold text-white">Capture Property Damage</h3><p className="text-sm text-zinc-300">Frame the damaged area clearly, then capture and review the preview before saving.</p></div>
              <button type="button" onClick={stopCamera} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white transition hover:bg-white/20">Close</button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="relative overflow-hidden rounded-2xl bg-black">
                <video ref={videoRef} autoPlay playsInline className="max-h-[70vh] w-full object-cover" />
                <div className="pointer-events-none absolute inset-4 rounded-[28px] border-2 border-dashed border-white/60" />
                <div className="pointer-events-none absolute bottom-4 left-0 right-0 px-6 text-center text-sm text-white/85">Keep the damaged area inside the guide so the preview and AI reading come out clearly.</div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={stopCamera} className="btn w-full">Cancel</button>
                <button type="button" onClick={captureFromCamera} className="btn btn-primary w-full">Capture Photo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddProperty;
