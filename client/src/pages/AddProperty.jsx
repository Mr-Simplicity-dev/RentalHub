import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import { toast } from 'react-toastify';

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
      toast.error('Please complete all required fields');
      return;
    }

    setStep(2);
  };

  const submitProperty = async () => {
    const enteredCode = code.join('');

    // Example static validation – replace later with API check if needed
    if (enteredCode !== '123456') {
      toast.error('Invalid verification code');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        amenities: form.amenities
          ? form.amenities.split(',').map(a => a.trim())
          : [],
      };

      const res = await propertyService.createProperty(payload);

      if (res.success) {
        toast.success('Property listed successfully');
        navigate('/my-properties');
      } else {
        toast.error(res.message || 'Failed to create property');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create property');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Add Property</h1>

      {step === 1 && (
        <form onSubmit={proceedToVerification} className="card space-y-4">
          <input name="title" value={form.title} onChange={handleChange} className="input" placeholder="Property title *" />
          <textarea name="description" value={form.description} onChange={handleChange} className="input" rows="4" placeholder="Description" />

          <div className="grid grid-cols-2 gap-4">
            <select name="state" value={form.state} onChange={handleChange} className="input">
              <option value="">Select State *</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <input name="city" value={form.city} onChange={handleChange} className="input" placeholder="City *" />
          </div>

          <input name="area" value={form.area} onChange={handleChange} className="input" placeholder="Area / Estate" />

          <select name="property_type" value={form.property_type} onChange={handleChange} className="input">
            <option value="">Property Type *</option>
            {PROPERTY_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="rent_amount" value={form.rent_amount} onChange={handleChange} className="input" placeholder="Rent Amount (₦) *" />
            <select name="payment_frequency" value={form.payment_frequency} onChange={handleChange} className="input">
              <option value="yearly">Per Year</option>
              <option value="monthly">Per Month</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <input type="number" name="bedrooms" value={form.bedrooms} onChange={handleChange} className="input" placeholder="Bedrooms" />
            <input type="number" name="bathrooms" value={form.bathrooms} onChange={handleChange} className="input" placeholder="Bathrooms" />
          </div>

          <input
            name="amenities"
            value={form.amenities}
            onChange={handleChange}
            className="input"
            placeholder="Amenities (comma separated)"
          />

          <label className="flex items-center space-x-2">
            <input type="checkbox" name="is_available" checked={form.is_available} onChange={handleChange} />
            <span>Available</span>
          </label>

          <button className="btn btn-primary w-full">Continue</button>
        </form>
      )}

      {step === 2 && (
        <div className="card text-center space-y-6">
          <h2 className="text-xl font-semibold">Enter Verification Code</h2>
          <p className="text-sm text-gray-600">
            Enter the 6-digit code provided to you to activate this listing.
          </p>

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
              Back
            </button>
            <button onClick={submitProperty} disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'Submitting...' : 'Verify & Publish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddProperty;
