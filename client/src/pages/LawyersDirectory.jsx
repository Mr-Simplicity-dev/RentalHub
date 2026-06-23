import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaGavel, FaShieldAlt, FaClipboardList } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const LegalSupport = () => {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasCoverage, setHasCoverage] = useState(false);
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    description: '',
    urgency: 'normal',
  });

  const loadCoverageStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setHasCoverage(false);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/legal/coverage-status');
      setHasCoverage(res.data?.data?.has_coverage === true);
    } catch {
      setHasCoverage(false);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await api.get('/legal/my-requests');
      setRequests(res.data?.data || []);
    } catch {
      // not critical
    }
  }, []);

  useEffect(() => {
    loadCoverageStatus();
    if (isAuthenticated) loadRequests();
  }, [isAuthenticated, loadCoverageStatus, loadRequests]);

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Please fill in both subject and description');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/legal/request-help', form);
      toast.success('Your legal assistance request has been submitted. A lawyer will reach out to you.');
      setShowForm(false);
      setForm({ subject: '', description: '', urgency: 'normal' });
      await loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-lg mx-auto p-8">
          <FaShieldAlt className="mx-auto text-5xl text-primary-600 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Legal Protection Coverage</h1>
          <p className="text-slate-600 mb-6">Sign up for Legal Protection Coverage during registration to get access to qualified legal assistance when you need it.</p>
          <Link to="/login?redirect=/legal-support" className="inline-block bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700">
            Log In to Check Your Coverage
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-primary-100">
              <FaShieldAlt />
              Legal Protection Coverage
            </p>
            <h1 className="mt-6 text-4xl font-extrabold md:text-5xl">
              Qualified legal assistance when you need it
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-200">
              As a Legal Protection Coverage subscriber, you can submit a request and a qualified lawyer from your area will be assigned to assist you — no directory browsing needed.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        {!hasCoverage ? (
          <div className="max-w-lg mx-auto rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <FaGavel className="mx-auto text-4xl text-amber-600 mb-3" />
            <h2 className="text-xl font-bold text-amber-900 mb-2">You don't have Legal Protection Coverage yet</h2>
            <p className="text-amber-800 text-sm mb-6">
              Legal Protection Coverage provides you with access to qualified legal assistance. Upgrade your account from your dashboard to get covered.
            </p>
            <Link to="/dashboard" className="inline-block bg-amber-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-700">
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Coverage active banner */}
            <div className="mb-8 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 text-green-800">
              <div className="flex items-start gap-3">
                <FaCheckCircle className="mt-1 text-green-600" />
                <div>
                  <p className="font-semibold">Legal Protection Coverage is active on your account.</p>
                  <p className="mt-1 text-sm text-green-700">
                    Submit a request below and a qualified lawyer from your area will be assigned to assist you.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit request */}
            <div className="mb-8">
              {!showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition"
                >
                  <FaClipboardList />
                  Request Legal Assistance
                </button>
              ) : (
                <form onSubmit={handleSubmitRequest} className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900">Submit a Legal Assistance Request</h3>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={form.subject}
                      onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                      placeholder="e.g. Lease agreement review"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                      placeholder="Describe your legal issue in detail..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Urgency</label>
                    <select
                      value={form.urgency}
                      onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
                    >
                      {submitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="border border-slate-300 px-6 py-2.5 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Previous requests */}
            {requests.length > 0 && (
              <div className="max-w-2xl mx-auto">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Your Previous Requests</h3>
                <div className="space-y-3">
                  {requests.map((req) => (
                    <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{req.subject}</h4>
                          <p className="text-sm text-slate-600 mt-1">{req.description}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          req.status === 'resolved' ? 'bg-green-100 text-green-700' :
                          req.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          req.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {req.status === 'in_progress' ? 'In Progress' :
                           req.status === 'resolved' ? 'Resolved' :
                           req.status === 'cancelled' ? 'Cancelled' :
                           'Pending'}
                        </span>
                      </div>
                      {req.assigned_lawyer_name && (
                        <p className="text-xs text-slate-500 mt-2">
                          Assigned to: {req.assigned_lawyer_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default LegalSupport;
