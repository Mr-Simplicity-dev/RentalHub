import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import MapPicker from '../components/MapPicker';
import { DamageReportButton } from '../components/damage';
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
const SEVERITY_STYLES = { minor: 'bg-emerald-100 text-emerald-700', moderate: 'bg-amber-100 text-amber-700', severe: 'bg-red-100 text-red-700' };
const URGENCY_STYLES = { low: 'bg-sky-100 text-sky-700', medium: 'bg-orange-100 text-orange-700', high: 'bg-red-100 text-red-700' };

const AddProperty = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAgent = user?.user_type === 'agent';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [createdPropertyId, setCreatedPropertyId] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', state: '', city: '', area: '', property_type: '',
    rent_amount: '', payment_frequency: 'yearly', bedrooms: '', bathrooms: '',
    amenities: '', is_available: true, latitude: '', longitude: '',
  });
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [code, setCode] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    capturedPreviewRef.current = capturedPhotoPreview;
  useEffect(() => () => {
    // Component cleanup
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
      
      // Set the created property ID to show post-publish UI
      setCreatedPropertyId(res.data?.id);
      setStep(2);
      
      toast.success(res.message || t('add_property.success'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('add_property.failed'));
    } finally {
      setLoading(false);
    }
  };

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

      {step === 2 && !createdPropertyId && (
        <div className="card space-y-6">
          <div className="space-y-3 text-center">
            <h2 className="text-xl font-semibold">Verify & Publish Property</h2>
            <p className="text-sm text-gray-500">Complete the verification step to publish your property listing.</p>
            {isAgent && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-800">
                ℹ️ You are adding this property on behalf of your assigned landlord.
              </div>
            )}
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              <strong>Tip:</strong> You can add damage reports after publishing the property. Click "Continue" now to verify and publish your listing.
            </p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn w-full">
              ← Back
            </button>
            <button type="button" onClick={() => setStep(2)} className="btn btn-primary w-full">
              Continue to Verification
            </button>
          </div>
        </div>
      )}

      {step === 2 && createdPropertyId && (
        <div className="card space-y-6">
          <div className="space-y-3 text-center">
            <h2 className="text-xl font-semibold">🎉 Property Published!</h2>
            <p className="text-sm text-gray-500">Your property is now live. You can add damage reports now if needed.</p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-sm text-emerald-800">✅ Property ID: {createdPropertyId}</p>
          </div>

          <DamageReportButton propertyId={createdPropertyId} variant="primary" />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/my-properties')}
              className="btn w-full"
            >
              Go to My Properties
            </button>
            <button
              type="button"
              onClick={() => navigate(`/property/${createdPropertyId}`)}
              className="btn btn-primary w-full"
            >
              View Property
            </button>
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
    </div>
  );
};

export default AddProperty;
