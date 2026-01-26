import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

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
  'bungalow',
  'duplex',
  'detached',
  'semi-detached',
  'terrace',
  'land',
  'shop',
  'office',
  'warehouse',
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
  });

  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);

  const [code, setCode] = useState(['', '', '', '', '', '']);

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

  const proceedToVerification = (e) => {
    e.preventDefault();

    if (!form.title || !form.state || !form.city || !form.property_type || !form.rent_amount) {
      toast.error(t('add_property.required'));
      return;
    }

    setStep(2);
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

      const res = await propertyService.createProperty(fd, true); // true = multipart

      if (res.success) {
        toast.success(t('add_property.success'));
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

      {step === 2 && (
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
            <button onClick={() => setStep(1)} className="btn btn-secondary flex-1">
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
