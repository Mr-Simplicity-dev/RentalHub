import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaCheckCircle, FaGavel, FaShieldAlt, FaClipboardList } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const LegalSupport = () => {
  const { t } = useTranslation();
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
      toast.error(t('lawyers_directory.fill_required'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/legal/request-help', form);
      toast.success(t('lawyers_directory.request_submitted'));
      setShowForm(false);
      setForm({ subject: '', description: '', urgency: 'normal' });
      await loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t('lawyers_directory.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-lg mx-auto p-8">
          <FaShieldAlt className="mx-auto text-5xl text-primary-600 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('lawyers_directory.title')}</h1>
          <p className="text-slate-600 mb-6">{t('lawyers_directory.not_auth_desc')}</p>
          <Link to="/login?redirect=/legal-support" className="inline-block bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700">
            {t('lawyers_directory.login_cta')}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">{t('lawyers_directory.loading')}</p>
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
{t('lawyers_directory.title')}
            </p>
            <h1 className="mt-6 text-4xl font-extrabold md:text-5xl">
              {t('lawyers_directory.hero_title')}
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-200">
              {t('lawyers_directory.hero_desc')}
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        {!hasCoverage ? (
          <div className="max-w-lg mx-auto rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <FaGavel className="mx-auto text-4xl text-amber-600 mb-3" />
            <h2 className="text-xl font-bold text-amber-900 mb-2">{t('lawyers_directory.no_coverage_title')}</h2>
            <p className="text-amber-800 text-sm mb-6">
              {t('lawyers_directory.no_coverage_desc')}
            </p>
            <Link to="/dashboard" className="inline-block bg-amber-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-700">
              {t('lawyers_directory.go_dashboard')}
            </Link>
          </div>
        ) : (
          <>
            {/* Coverage active banner */}
            <div className="mb-8 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 text-green-800">
              <div className="flex items-start gap-3">
                <FaCheckCircle className="mt-1 text-green-600" />
                <div>
                  <p className="font-semibold">{t('lawyers_directory.coverage_active')}</p>
                  <p className="mt-1 text-sm text-green-700">
                    {t('lawyers_directory.coverage_desc')}
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
                  {t('lawyers_directory.request_assistance')}
                </button>
              ) : (
                <form onSubmit={handleSubmitRequest} className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900">{t('lawyers_directory.form_title')}</h3>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('lawyers_directory.subject_label')}</label>
                    <input
                      type="text"
                      value={form.subject}
                      onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                      placeholder={t('lawyers_directory.subject_placeholder')}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('lawyers_directory.description_label')}</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                      placeholder={t('lawyers_directory.description_placeholder')}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('lawyers_directory.urgency_label')}</label>
                    <select
                      value={form.urgency}
                      onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                    >
                      <option value="normal">{t('lawyers_directory.normal')}</option>
                      <option value="urgent">{t('lawyers_directory.urgent')}</option>
                      <option value="emergency">{t('lawyers_directory.emergency')}</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-primary-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
                    >
                      {submitting ? t('lawyers_directory.submitting') : t('lawyers_directory.submit_request')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="border border-slate-300 px-6 py-2.5 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      {t('lawyers_directory.cancel')}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Previous requests */}
            {requests.length > 0 && (
              <div className="max-w-2xl mx-auto">
                <h3 className="text-lg font-bold text-slate-900 mb-4">{t('lawyers_directory.previous_requests')}</h3>
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
                          {req.status === 'in_progress' ? t('lawyers_directory.in_progress') :
                           req.status === 'resolved' ? t('lawyers_directory.resolved') :
                           req.status === 'cancelled' ? t('lawyers_directory.cancelled') :
                           t('lawyers_directory.pending')}
                        </span>
                      </div>
                      {req.assigned_lawyer_name && (
                        <p className="text-xs text-slate-500 mt-2">
                          {t('lawyers_directory.assigned_to')}{req.assigned_lawyer_name}
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
