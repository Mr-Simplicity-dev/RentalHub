import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaChartLine,
  FaCheckCircle,
  FaExclamationTriangle,
  FaPauseCircle,
  FaPlayCircle,
  FaRedo,
  FaRoute,
  FaUsers,
} from 'react-icons/fa';
import api from '../../services/api';

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const MetricCard = ({ icon, label, value, detail, tone = 'navy' }) => {
  const tones = {
    navy: 'border-slate-200 bg-white text-[#071A3D]',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.navy}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">{label}</p>
          <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
          {detail && <p className="mt-1 text-xs opacity-70">{detail}</p>}
        </div>
        <span className="rounded-xl bg-white/70 p-3 text-lg shadow-sm" aria-hidden="true">
          {icon}
        </span>
      </div>
    </article>
  );
};

const ProgressBar = ({ label, value, count }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="tabular-nums text-slate-500">{count} · {clampPercent(value)}%</span>
    </div>
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#071A3D] via-[#164A8A] to-[#FFC928] transition-all"
        style={{ width: `${clampPercent(value)}%` }}
      />
    </div>
  </div>
);

const EmptyState = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
    {children}
  </div>
);

const TourAnalytics = () => {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState({
    days: '30',
    platform: '',
    locale: '',
    tour_key: '',
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== '')
      );
      const response = await api.get('/users/tour/analytics', { params });
      setData(response.data?.data || null);
      setRefreshedAt(new Date());
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message
        || t('tour.analytics.load_failed', 'Tour analytics could not be loaded.')
      );
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const overview = data?.overview || {};
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language || 'en'),
    [i18n.language, i18n.resolvedLanguage]
  );
  const formatNumber = (value) => numberFormatter.format(Number(value) || 0);
  const completionBase = Math.max(Number(overview.engaged_users) || 0, 1);
  const funnel = [
    {
      label: t('tour.analytics.engaged', 'Engaged users'),
      count: Number(overview.engaged_users) || 0,
      rate: 100,
    },
    {
      label: t('tour.analytics.started', 'Started'),
      count: Number(overview.started_users) || 0,
      rate: ((Number(overview.started_users) || 0) / completionBase) * 100,
    },
    {
      label: t('tour.analytics.resumed', 'Resumed'),
      count: Number(overview.resumed_users) || 0,
      rate: ((Number(overview.resumed_users) || 0) / completionBase) * 100,
    },
    {
      label: t('tour.analytics.completed', 'Completed'),
      count: Number(overview.completed_users) || 0,
      rate: Number(overview.completion_rate) || 0,
    },
  ];
  const topProblems = (data?.problems || []).slice(0, 8);
  const issues = (data?.issues || []).slice(0, 12);

  const updateFilter = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#071A3D] via-[#0B2F69] to-[#164A8A] p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#FFE58A]">
                {t('tour.analytics.eyebrow', 'Product adoption intelligence')}
              </p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                {t('tour.analytics.title', 'Guided tour analytics')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                {t('tour.analytics.description', 'See where users succeed, resume, skip, or encounter unavailable controls across web and mobile tours.')}
              </p>
            </div>
            <button
              type="button"
              onClick={loadAnalytics}
              disabled={loading}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#FFC928] px-5 py-3 text-sm font-extrabold text-[#071A3D] shadow-lg transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
            >
              <FaRedo className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              {t('tour.analytics.refresh', 'Refresh data')}
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={t('tour.analytics.filters', 'Analytics filters')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-bold text-slate-600">
              {t('tour.analytics.period', 'Period')}
              <select value={filters.days} onChange={updateFilter('days')} className="input mt-1 w-full">
                <option value="7">{t('tour.analytics.days_7', 'Last 7 days')}</option>
                <option value="30">{t('tour.analytics.days_30', 'Last 30 days')}</option>
                <option value="90">{t('tour.analytics.days_90', 'Last 90 days')}</option>
                <option value="365">{t('tour.analytics.days_365', 'Last year')}</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              {t('tour.analytics.platform', 'Platform')}
              <select value={filters.platform} onChange={updateFilter('platform')} className="input mt-1 w-full">
                <option value="">{t('tour.analytics.all_platforms', 'All platforms')}</option>
                <option value="web">Web</option>
                <option value="mobile">{t('tour.analytics.mobile_apps', 'Mobile apps')}</option>
                <option value="legacy">{t('tour.analytics.legacy', 'Legacy')}</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">
              {t('tour.analytics.locale', 'Language')}
              <select value={filters.locale} onChange={updateFilter('locale')} className="input mt-1 w-full">
                <option value="">{t('tour.analytics.all_languages', 'All languages')}</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="ru">Русский</option>
                <option value="zh">中文</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 lg:col-span-2">
              {t('tour.analytics.tour_key', 'Tour key')}
              <input
                value={filters.tour_key}
                onChange={updateFilter('tour_key')}
                className="input mt-1 w-full"
                placeholder={t('tour.analytics.all_tours', 'All tours')}
              />
            </label>
          </div>
          {refreshedAt && (
            <p className="mt-3 text-right text-xs text-slate-400">
              {t('tour.analytics.updated', {
                time: refreshedAt.toLocaleTimeString(),
                defaultValue: 'Updated {{time}}',
              })}
            </p>
          )}
        </section>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="flex items-center gap-2 font-bold"><FaExclamationTriangle /> {error}</div>
          </div>
        )}

        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('common.loading', 'Loading')}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<FaUsers />}
                label={t('tour.analytics.unique_users', 'Unique users')}
                value={formatNumber(overview.unique_users)}
                detail={t('tour.analytics.engaged_detail', { count: formatNumber(overview.engaged_users), defaultValue: '{{count}} engaged' })}
              />
              <MetricCard
                icon={<FaCheckCircle />}
                label={t('tour.analytics.completion_rate', 'Completion rate')}
                value={`${clampPercent(overview.completion_rate)}%`}
                detail={t('tour.analytics.completed_detail', { count: formatNumber(overview.completed_users), defaultValue: '{{count}} completions' })}
                tone="green"
              />
              <MetricCard
                icon={<FaPauseCircle />}
                label={t('tour.analytics.resumable', 'Resumable tours')}
                value={formatNumber(overview.resumable_tours)}
                detail={t('tour.analytics.paused_detail', { count: formatNumber(overview.paused_tours), defaultValue: '{{count}} paused' })}
                tone="amber"
              />
              <MetricCard
                icon={<FaExclamationTriangle />}
                label={t('tour.analytics.target_problems', 'Target problems')}
                value={formatNumber((overview.target_missing_events || 0) + (overview.step_unavailable_events || 0))}
                detail={t('tour.analytics.target_problem_detail', 'Missing or unavailable controls')}
                tone={(overview.target_missing_events || 0) > 0 ? 'red' : 'green'}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><FaChartLine /></span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{t('tour.analytics.funnel', 'Adoption funnel')}</h2>
                    <p className="text-xs text-slate-500">{t('tour.analytics.funnel_description', 'Unique users moving through the guided experience.')}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-5">
                  {funnel.map((item) => (
                    <ProgressBar key={item.label} label={item.label} count={formatNumber(item.count)} value={item.rate} />
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-50 p-3 text-amber-700"><FaPlayCircle /></span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{t('tour.analytics.active_state', 'Current tour state')}</h2>
                    <p className="text-xs text-slate-500">{t('tour.analytics.active_state_description', 'Live aggregate status for saved tour sessions.')}</p>
                  </div>
                </div>
                {(data?.statuses || []).length ? (
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {data.statuses.map((status) => (
                      <div key={status.status} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {String(status.status || 'unknown').replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(status.tour_count)}</p>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState>{t('tour.analytics.no_state_data', 'No tour state data matches these filters yet.')}</EmptyState>}
                <div className="mt-5 rounded-xl bg-[#071A3D] p-4 text-white">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('tour.analytics.average_progress', 'Average progress')}</span>
                    <strong>{clampPercent(overview.average_progress_percent)}%</strong>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-[#FFC928]" style={{ width: `${clampPercent(overview.average_progress_percent)}%` }} />
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><FaRoute className="text-blue-700" /> {t('tour.analytics.by_tour', 'Performance by tour')}</h2>
              </div>
              {(data?.by_tour || []).length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">{t('tour.analytics.tour', 'Tour')}</th>
                        <th className="px-5 py-3">{t('tour.analytics.platform', 'Platform')}</th>
                        <th className="px-5 py-3 text-right">{t('tour.analytics.users', 'Users')}</th>
                        <th className="px-5 py-3 text-right">{t('tour.analytics.completion', 'Completion')}</th>
                        <th className="px-5 py-3 text-right">{t('tour.analytics.progress', 'Progress')}</th>
                        <th className="px-5 py-3 text-right">{t('tour.analytics.skips', 'Skips')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.by_tour.map((tour) => (
                        <tr key={`${tour.platform}:${tour.tour_key}`} className="hover:bg-slate-50">
                          <td className="max-w-xs px-5 py-4 font-bold text-slate-800">{tour.tour_key}</td>
                          <td className="px-5 py-4 capitalize text-slate-600">{tour.platform}</td>
                          <td className="px-5 py-4 text-right tabular-nums">{formatNumber(tour.unique_users)}</td>
                          <td className="px-5 py-4 text-right font-bold text-emerald-700">{clampPercent(tour.completion_rate)}%</td>
                          <td className="px-5 py-4 text-right">{clampPercent(tour.average_progress_percent)}%</td>
                          <td className="px-5 py-4 text-right">{formatNumber(tour.skipped_users)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="p-5"><EmptyState>{t('tour.analytics.no_tours', 'No tour activity matches these filters yet.')}</EmptyState></div>}
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                <h2 className="text-lg font-black text-slate-900">{t('tour.analytics.diagnostics', 'Target and step diagnostics')}</h2>
                <p className="mt-1 text-xs text-slate-500">{t('tour.analytics.diagnostics_description', 'The controls and routes that need product attention first.')}</p>
                {issues.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="text-left uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-2 pr-4">{t('tour.analytics.issue', 'Issue')}</th>
                          <th className="px-4 py-2">{t('tour.analytics.step', 'Step')}</th>
                          <th className="px-4 py-2">{t('tour.analytics.route', 'Route')}</th>
                          <th className="py-2 pl-4 text-right">{t('tour.analytics.count', 'Count')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {issues.map((issue, index) => (
                          <tr key={`${issue.event_type}:${issue.step_id}:${issue.route}:${index}`}>
                            <td className="py-3 pr-4 font-bold text-red-700">{String(issue.event_type).replace(/_/g, ' ')}</td>
                            <td className="px-4 py-3 text-slate-700">{issue.step_id || issue.target_id || '—'}</td>
                            <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={issue.route}>{issue.route || '—'}</td>
                            <td className="py-3 pl-4 text-right font-black">{formatNumber(issue.event_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="mt-4"><EmptyState>{t('tour.analytics.no_issues', 'No missing targets or unavailable steps were recorded.')}</EmptyState></div>}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black text-slate-900">{t('tour.analytics.languages', 'Language adoption')}</h2>
                <div className="mt-4 space-y-3">
                  {(data?.locales || []).length ? data.locales.map((locale) => {
                    const localeCompletionRate = locale.completion_rate ?? (
                      Number(locale.unique_users) > 0
                        ? (Number(locale.completed_users) / Number(locale.unique_users)) * 100
                        : 0
                    );
                    return (
                    <div key={locale.locale} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="uppercase text-slate-800">{locale.locale}</strong>
                        <span className="text-xs text-slate-500">{formatNumber(locale.unique_users)} {t('tour.analytics.users_lower', 'users')}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${clampPercent(localeCompletionRate)}%` }} />
                      </div>
                      <p className="mt-1 text-right text-xs font-bold text-emerald-700">{clampPercent(localeCompletionRate)}%</p>
                    </div>
                    );
                  }) : <EmptyState>{t('tour.analytics.no_language_data', 'No language data is available yet.')}</EmptyState>}
                </div>
              </article>
            </section>

            {topProblems.length > 0 && (
              <p className="sr-only">{t('tour.analytics.problem_count_sr', { count: topProblems.length, defaultValue: '{{count}} problem steps detected.' })}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TourAnalytics;
