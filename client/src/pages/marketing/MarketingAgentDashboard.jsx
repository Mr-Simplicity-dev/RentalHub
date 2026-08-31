import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FaClipboardCheck, FaFileAlt, FaEnvelope, FaPhone, FaPlus } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import BackToDashboard from '../../components/common/BackToDashboard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const MarketingAgentDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/survey/marketing-agent/overview');
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const stats = data?.stats || { captured: 0, in_progress: 0, with_email: 0, with_phone: 0 };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('marketing_agent.title', 'Marketing Agent Dashboard')}
            </h1>
            <p className="text-sm text-gray-500">
              {t('marketing_agent.welcome', 'Welcome, {{name}} — conduct surveys and track your captured respondents.', {
                name: user?.full_name || 'Agent',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BackToDashboard />
            <button
              type="button"
              onClick={() => navigate('/survey?agent=1')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <FaPlus /> {t('marketing_agent.conduct', 'Conduct Survey')}
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-soft bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
                  <FaClipboardCheck className="text-emerald-500" /> {t('marketing_agent.captured', 'Captured')}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.captured}</p>
              </div>
              <div className="rounded-xl border border-soft bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
                  <FaFileAlt className="text-amber-500" /> {t('marketing_agent.in_progress', 'In progress')}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.in_progress}</p>
              </div>
              <div className="rounded-xl border border-soft bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
                  <FaEnvelope className="text-blue-500" /> {t('marketing_agent.with_email', 'With email')}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.with_email}</p>
              </div>
              <div className="rounded-xl border border-soft bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
                  <FaPhone className="text-purple-500" /> {t('marketing_agent.with_phone', 'With phone')}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.with_phone}</p>
              </div>
            </div>

            {data?.by_lga?.length > 0 && (
              <div className="mt-6 rounded-xl border border-soft bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-700">
                  {t('marketing_agent.by_lga', 'Responses by LGA')}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.by_lga}>
                    <XAxis dataKey="lga" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-6 overflow-x-auto rounded-xl border border-soft bg-white shadow-sm">
              <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
                {t('marketing_agent.my_responses', 'My captured respondents')}
              </p>
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Respondent</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Phone</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">LGA</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(data?.responses || []).map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.respondent_code}</td>
                      <td className="px-3 py-2 capitalize text-gray-600">{r.survey_type}</td>
                      <td className="px-3 py-2 text-gray-700">{r.respondent_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{r.respondent_phone || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{r.agent_lga || '—'}</td>
                      <td className="px-3 py-2">
                        {r.completed_at ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Completed</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Draft</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data?.responses?.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                        {t('marketing_agent.no_responses', 'No surveys captured yet. Click "Conduct Survey" to start.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MarketingAgentDashboard;
