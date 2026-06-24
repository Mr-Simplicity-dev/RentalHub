import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaTimes, FaPaperPlane, FaCheckCircle, FaCommentAlt } from 'react-icons/fa';
import api from '../../services/api';

const FloatingContactWidget = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', state: '', lga: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || locationsLoaded) return;
    api.get('/property-utils/location-options').then((res) => {
      if (res.data?.success) setLocations(res.data.data || []);
    }).catch(() => {}).finally(() => setLocationsLoaded(true));
  }, [open, locationsLoaded]);

  const states = useMemo(() => {
    if (locations.length > 0) return locations.map((l) => l.state_name).filter(Boolean);
    return [];
  }, [locations]);

  const selectedState = useMemo(() => {
    const s = String(form.state || '').trim().toLowerCase();
    return locations.find((l) => String(l.state_name || '').trim().toLowerCase() === s);
  }, [locations, form.state]);

  const lgas = selectedState?.lgas || [];

  const reset = () => {
    setForm({ name: '', email: '', state: '', lga: '', subject: '', message: '' });
    setDone(false);
    setError('');
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(reset, 300);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.state || !form.message.trim()) {
      setError('Please fill in name, email, state, and message.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await api.post('/support/contact', form);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-all duration-300 hover:scale-110 hover:shadow-xl animate-pulse"
        aria-label="Contact us"
        title="Contact us"
      >
        <FaCommentAlt className="w-5 h-5" />
      </button>

      {open && (
        <div
          ref={widgetRef}
          className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ animation: 'slideUp 0.25s ease-out' }}
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-700 px-5 py-4 text-white">
            <div>
              <p className="font-semibold text-sm">Contact us</p>
              <p className="text-xs text-primary-100 mt-0.5">We typically reply within minutes</p>
            </div>
            <button type="button" onClick={handleClose} className="text-white/80 hover:text-white transition p-1">
              <FaTimes />
            </button>
          </div>

          <div className="p-5 max-h-[70vh] overflow-y-auto">
            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <FaCheckCircle className="text-green-500 text-4xl mb-3" />
                <p className="font-semibold text-slate-900">Message sent!</p>
                <p className="text-sm text-slate-600 mt-1">We'll get back to you shortly.</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-4 text-sm text-primary-600 hover:underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State *</label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, lga: '' }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition"
                  >
                    <option value="">Select your state</option>
                    {states.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {lgas.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Local Government Area</label>
                    <select
                      value={form.lga}
                      onChange={(e) => setForm((p) => ({ ...p, lga: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition"
                    >
                      <option value="">Select your LGA</option>
                      {lgas.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition"
                    placeholder="How can we help?"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Message *</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition resize-none"
                    placeholder="Tell us more..."
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center justify-center gap-2 w-full bg-primary-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition"
                >
                  {sending ? 'Sending...' : <><FaPaperPlane className="w-3.5 h-3.5" /> Send message</>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingContactWidget;
