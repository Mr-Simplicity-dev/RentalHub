import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import MapPicker from '../components/MapPicker';

const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
  'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

const PROPERTY_TYPES = [
  'apartment',
  'house',
  'bungalow',
  'duplex',
  'studio',
  'flat',
  'room',
];

const AddProperty = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    state: '',
    city: '',
    area: '',
    property_type: '',
    rent_amount: '',
    payment_frequency: 'yearly',
    bedrooms: '',
    bathrooms: '',
    amenities: '',
    is_available: true,
    latitude: '',
    longitude: '',
  });

  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [code, setCode] = useState(['', '', '', '', '', '']);

  // ── Damage capture state ──────────────────────────────────────────────────
  const [damageReports, setDamageReports] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [damageForm, setDamageForm] = useState({
    room_location: '',
    damage_type: '',
    description: '',
    width_cm: '',
    height_cm: '',
    depth_level: '',
    severity: '',
  });
  const [analyzingDamage, setAnalyzingDamage] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;

    const updated = [...code];
    updated[index] = value;
    setCode(updated);

    const next = document.getElementById(`otp-${index + 1}`);
    if (value && next) next.focus();
  };

  // ── Camera helpers ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      setCameraStream(stream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch (err) {
      toast.error('Camera access denied. Please allow camera access.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  }, [cameraStream]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const addDamageReport = () => {
    if (!capturedPhoto) return toast.error('Please capture a photo first');
    if (!damageForm.room_location) return toast.error('Room location is required');

    const report = {
      ...damageForm,
      photo: capturedPhoto,
      ai_result: aiResult,
      id: Date.now(),
    };

    setDamageReports(prev => [...prev, report]);
    setCapturedPhoto(null);
    setAiResult(null);
    setDamageForm({ room_location: '', damage_type: '', description: '', width_cm: '', height_cm: '', depth_level: '', severity: '' });
    toast.success('Damage report added');
  };

  const removeDamageReport = (id) => {
    setDamageReports(prev => prev.filter(r => r.id !== id));
  };

  const proceedToVerification = (e) => {
    e.preventDefault();

    if (!form.title || !form.state || !form.city || !form.property_type || !form.rent_amount) {
      toast.error(t('add_property.required'));
      return;
    }

    if (!form.latitude || !form.longitude) {
      toast.error('Please pick the property location on the map.');
      return;
    }

    setStep(2); // Go to damage capture step
  };

  const submitProperty = async () => {
    const enteredCode = code.join('');

    if (enteredCode !== '123456') {
      toast.error(t('add_property.invalid_code'));
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();

      Object.entries(form).forEach(([key, value]) => {
        fd.append(key, value);
      });

      const amenities = form.amenities
        ? form.amenities.split(',').map(a => a.trim())
        : [];
      fd.append('amenities', JSON.stringify(amenities));

      images.forEach((img) => fd.append('images', img));
      if (video) fd.append('video', video);

      const res = await propertyService.createProperty(fd, true);

      if (res.success) {
        // Upload damage reports if any were captured
        if (damageReports.length > 0 && res.data?.id) {
          const propertyId = res.data.id;
          for (const report of damageReports) {
            try {
              const dfd = new FormData();
              dfd.append('room_location', report.room_location);
              dfd.append('damage_type', report.damage_type || '');
              dfd.append('description', report.description || '');
              dfd.append('width_cm', report.width_cm || '');
              dfd.append('height_cm', report.height_cm || '');
              dfd.append('depth_level', report.depth_level || '');
              dfd.append('severity', report.severity || '');

              // Convert base64 photo to blob
              if (report.photo) {
                const blob = await fetch(report.photo).then(r => r.blob());
                dfd.append('photos', blob, `damage_${report.id}.jpg`);
              }

              await propertyService.saveDamageReport(propertyId, dfd);
            } catch (damageErr) {
              console.error('Damage report upload error:', damageErr.message);
            }
          }
        }

        toast.success(res.message || t('add_property.success'));
        navigate('/my-properties');
      } else {
        toast.error(res.message || t('add_property.failed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('add_property.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{t('add_property.title')}</h1>

      {step === 1 && (
        <form onSubmit={proceedToVerification} className="card space-y-4">
          <input name="title" value={form.title} onChange={handleChange} className="input" placeholder={t('add_property.form.title')} />
          <textarea name="description" value={form.description} onChange={handleChange} className="input" rows="4" placeholder={t('add_property.form.description')} />

          <div className="grid grid-cols-2 gap-4">
            <select name="state" value={form.state} onChange={handleChange} className="input">
              <option value="">{t('add_property.form.state')}</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <input name="city" value={form.city} onChange={handleChange} className="input" placeholder={t('add_property.form.city')} />
          </div>

          <input name="area" value={form.area} onChange={handleChange} className="input" placeholder={t('add_property.form.area')} />

          <select name="property_type" value={form.property_type} onChange={handleChange} className="input">
            <option value="">{t('add_property.form.type')}</option>
            {PROPERTY_TYPES.map(tpe => (
              <option key={tpe} value={tpe}>{tpe}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="rent_amount" value={form.rent_amount} onChange={handleChange} className="input" placeholder={t('add_property.form.rent')} />
            <select name="payment_frequency" value={form.payment_frequency} onChange={handleChange} className="input">
              <option value="yearly">{t('add_property.form.yearly')}</option>
              <option value="monthly">{t('add_property.form.monthly')}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="bedrooms" value={form.bedrooms} onChange={handleChange} className="input" placeholder={t('add_property.form.bedrooms')} />
            <input type="number" name="bathrooms" value={form.bathrooms} onChange={handleChange} className="input" placeholder={t('add_property.form.bathrooms')} />
          </div>

          <input name="amenities" value={form.amenities} onChange={handleChange} className="input" placeholder={t('add_property.form.amenities')} />

          <div className="space-y-2">
            <label className="text-sm font-medium">Pick Property Location</label>
            <MapPicker
              value={
                form.latitude && form.longitude
                  ? { lat: Number(form.latitude), lng: Number(form.longitude) }
                  : null
              }
              onChange={({ lat, lng }) =>
                setForm(prev => ({ ...prev, latitude: lat, longitude: lng }))
              }
            />
            {form.latitude && form.longitude && (
              <p className="text-xs text-gray-500">
                {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Property Images</label>
            <input type="file" multiple accept="image/*" onChange={(e) => setImages([...e.target.files])} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Short Video Clip</label>
            <input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files[0])} />
          </div>

          <label className="flex items-center space-x-2">
            <input type="checkbox" name="is_available" checked={form.is_available} onChange={handleChange} />
            <span>{t('add_property.form.available')}</span>
          </label>

          <button className="btn btn-primary w-full">{t('add_property.continue')}</button>
        </form>
      )}

      {/* STEP 2 — Damage Capture */}
      {step === 2 && (
        <div className="card space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Property Condition Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Document any existing damages before listing. This protects both you and your tenants.
            </p>
          </div>

          {/* Camera + capture */}
          {!capturedPhoto && (
            <div>
              {showCamera ? (
                <div className="space-y-3">
                  <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute inset-0 pointer-events-none border-2 border-yellow-400/60 rounded-xl" />
                    <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs">
                      Position the damage in frame, then capture
                    </p>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-3">
                    <button type="button" onClick={stopCamera} className="btn w-full">Cancel</button>
                    <button type="button" onClick={capturePhoto} className="btn btn-primary w-full">📸 Capture Photo</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl py-10 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition"
                >
                  <div className="text-4xl mb-2">📷</div>
                  <p className="font-medium">Open Camera to Capture Damage</p>
                  <p className="text-xs mt-1">Tap to start your camera</p>
                </button>
              )}
            </div>
          )}

          {/* Preview + form */}
          {capturedPhoto && (
            <div className="space-y-4">
              <div className="relative">
                <img src={capturedPhoto} alt="Damage" className="w-full rounded-xl object-cover max-h-64" />
                <button
                  type="button"
                  onClick={() => { setCapturedPhoto(null); setAiResult(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                >✕</button>
                {analyzingDamage && (
                  <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center text-white text-sm">
                    🔍 Analyzing damage with AI...
                  </div>
                )}
              </div>

              {/* AI result display */}
              {aiResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-blue-800">AI Analysis Result</p>
                  {aiResult.damage_type && <p className="text-blue-700">Type: <strong>{aiResult.damage_type}</strong></p>}
                  {aiResult.severity && <p className="text-blue-700">Severity: <strong className={aiResult.severity === 'severe' ? 'text-red-600' : aiResult.severity === 'moderate' ? 'text-yellow-600' : 'text-green-600'}>{aiResult.severity}</strong></p>}
                  {(aiResult.estimated_width_cm || aiResult.estimated_height_cm) && (
                    <p className="text-blue-700">Est. Size: <strong>{aiResult.estimated_width_cm || '?'}cm × {aiResult.estimated_height_cm || '?'}cm</strong></p>
                  )}
                  {aiResult.depth_level && <p className="text-blue-700">Depth: <strong>{aiResult.depth_level}</strong></p>}
                  {aiResult.description && <p className="text-blue-700 italic">{aiResult.description}</p>}
                  {aiResult.repair_recommendation && <p className="text-blue-600 text-xs">💡 {aiResult.repair_recommendation}</p>}
                </div>
              )}

              {/* Damage form */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room / Location *</label>
                  <input
                    value={damageForm.room_location}
                    onChange={e => setDamageForm(p => ({ ...p, room_location: e.target.value }))}
                    className="input w-full"
                    placeholder="e.g. Living Room, Master Bedroom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Damage Type</label>
                  <select value={damageForm.damage_type} onChange={e => setDamageForm(p => ({ ...p, damage_type: e.target.value }))} className="input w-full">
                    <option value="">Select type</option>
                    <option value="scratch">Scratch</option>
                    <option value="crack">Crack</option>
                    <option value="hole">Hole</option>
                    <option value="dent">Dent</option>
                    <option value="stain">Stain</option>
                    <option value="water_damage">Water Damage</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select value={damageForm.severity} onChange={e => setDamageForm(p => ({ ...p, severity: e.target.value }))} className="input w-full">
                    <option value="">Select</option>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (cm)</label>
                  <input type="number" value={damageForm.width_cm} onChange={e => setDamageForm(p => ({ ...p, width_cm: e.target.value }))} className="input w-full" placeholder="e.g. 5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
                  <input type="number" value={damageForm.height_cm} onChange={e => setDamageForm(p => ({ ...p, height_cm: e.target.value }))} className="input w-full" placeholder="e.g. 2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Depth Level</label>
                  <select value={damageForm.depth_level} onChange={e => setDamageForm(p => ({ ...p, depth_level: e.target.value }))} className="input w-full">
                    <option value="">Select</option>
                    <option value="surface">Surface (paint only)</option>
                    <option value="shallow">Shallow (under 1cm)</option>
                    <option value="deep">Deep (1–5cm)</option>
                    <option value="structural">Structural (5cm+)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={damageForm.description} onChange={e => setDamageForm(p => ({ ...p, description: e.target.value }))} className="input w-full resize-none" rows={2} placeholder="Describe the damage..." />
                </div>
              </div>

              <button type="button" onClick={addDamageReport} className="btn btn-primary w-full">
                ✅ Add This Damage Report
              </button>
            </div>
          )}

          {/* List of added reports */}
          {damageReports.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">{damageReports.length} damage report{damageReports.length > 1 ? 's' : ''} added:</p>
              {damageReports.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-gray-50 border rounded-xl p-3">
                  <img src={r.photo} alt="damage" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.room_location}</p>
                    <p className="text-xs text-gray-500">{r.damage_type || 'unknown'} · {r.severity || 'unknown severity'}</p>
                    {(r.width_cm || r.height_cm) && (
                      <p className="text-xs text-gray-500">{r.width_cm || '?'}cm × {r.height_cm || '?'}cm · {r.depth_level || ''}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => removeDamageReport(r.id)} className="text-red-400 hover:text-red-600 text-lg shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStep(1)} className="btn w-full">Back</button>
            <button type="button" onClick={() => setStep(3)} className="btn btn-primary w-full">
              {damageReports.length > 0 ? `Continue with ${damageReports.length} report${damageReports.length > 1 ? 's' : ''}` : 'Skip — No Damages'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Verification Code */}
      {step === 3 && (
        <div className="card text-center space-y-6">
          <h2 className="text-xl font-semibold">{t('add_property.verify_title')}</h2>

          <div className="flex justify-center space-x-2">
            {code.map((v, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                value={v}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                maxLength="1"
                className="w-12 h-12 text-center text-xl border rounded"
              />
            ))}
          </div>

          <div className="flex space-x-3">
            <button onClick={() => setStep(2)} className="btn btn-secondary flex-1">
              {t('add_property.back')}
            </button>
            <button onClick={submitProperty} disabled={loading} className="btn btn-primary flex-1">
              {loading ? t('add_property.submitting') : t('add_property.publish')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddProperty;