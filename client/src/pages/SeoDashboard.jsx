import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaGlobe, FaFileCode, FaMapMarkedAlt, FaHome, FaLink,
  FaSyncAlt, FaSearch, FaExternalLinkAlt, FaCheckCircle,
  FaExclamationTriangle, FaChartBar,
} from 'react-icons/fa';
import api from '../services/api';
import { useTranslation } from 'react-i18next';

const SeoDashboard = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sitemapXml, setSitemapXml] = useState(null);
  const [showSitemap, setShowSitemap] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [rankings, setRankings] = useState({ latestByKeyword: [], history: [] });
  const [checkingRankings, setCheckingRankings] = useState(false);

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get('/admin/seo');
      setData(res.data?.data || res.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.load_failed'));
    } finally {
      if (isInitial) setLoading(false); else setRefreshing(false);
    }
  }, []);

  const loadRankings = useCallback(async () => {
    try {
      const res = await api.get('/admin/seo/rankings');
      setRankings(res.data?.data || { latestByKeyword: [], history: [] });
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.rankings_load_failed'));
    }
  }, []);

  useEffect(() => {
    loadData(true);
    loadRankings();
  }, [loadData, loadRankings]);

  const handleRegenerate = async () => {
    if (!window.confirm(t('seo_dashboard.regenerate_confirm'))) return;
    try {
      setRefreshing(true);
      const res = await api.post('/admin/seo/regenerate-sitemap');
      toast.success(t('seo_dashboard.regenerated', { count: res.data?.data?.urlCount || 0 }));
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.regenerate_failed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewSitemap = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/admin/seo/sitemap-xml');
      setSitemapXml(res.data?.data?.xml);
      setShowSitemap(true);
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.sitemap_fetch_failed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handlePingGoogle = async () => {
    try {
      const res = await api.post('/admin/seo/ping-google');
      toast.success(res.data?.data?.success ? t('seo_dashboard.ping_success') : t('seo_dashboard.ping_completed'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.ping_failed'));
    }
  };

  const handleRankingCheck = async () => {
    if (!window.confirm(t('seo_dashboard.check_confirm'))) return;

    try {
      setCheckingRankings(true);
      const res = await api.post('/admin/seo/rankings/check');
      toast.success(res.data?.message || t('seo_dashboard.check_completed'));
      await loadRankings();
    } catch (err) {
      toast.error(err.response?.data?.message || t('seo_dashboard.check_failed'));
    } finally {
      setCheckingRankings(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>;
  }

  const summary = data?.summary || {};
  const stateBreakdown = data?.stateBreakdown || [];
  const filteredStates = stateSearch
    ? stateBreakdown.filter(s => s.state_name?.toLowerCase().includes(stateSearch.toLowerCase()))
    : stateBreakdown;

  const statCards = [
    { label: t('seo_dashboard.state_pages'), value: summary.statePages, icon: FaGlobe, color: 'bg-blue-50 text-blue-600' },
    { label: t('seo_dashboard.lga_pages'), value: summary.lgaPages, icon: FaMapMarkedAlt, color: 'bg-green-50 text-green-600' },
    { label: t('seo_dashboard.area_pages'), value: summary.areaPages, icon: FaHome, color: 'bg-purple-50 text-purple-600' },
    { label: t('seo_dashboard.property_pages'), value: summary.propertyPages, icon: FaFileCode, color: 'bg-orange-50 text-orange-600' },
    { label: t('seo_dashboard.sitemap_urls'), value: summary.sitemapUrls, icon: FaLink, color: 'bg-teal-50 text-teal-600' },
  ];

  const maxValue = Math.max(
    summary.statePages || 0, summary.lgaPages || 0,
    summary.areaPages || 0, summary.propertyPages || 0, 1
  );

  const barData = [
    { label: t('seo_dashboard.states_bar'), value: summary.statePages || 0, color: 'bg-blue-500' },
    { label: t('seo_dashboard.lgas_bar'), value: summary.lgaPages || 0, color: 'bg-green-500' },
    { label: t('seo_dashboard.areas_bar'), value: summary.areaPages || 0, color: 'bg-purple-500' },
    { label: t('seo_dashboard.properties_bar'), value: summary.propertyPages || 0, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('seo_dashboard.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing && <span className="text-xs text-slate-400 animate-pulse">{t('seo_dashboard.syncing')}</span>}
          <button onClick={handleRegenerate} disabled={refreshing} className="btn btn-secondary gap-2">
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} /> {t('seo_dashboard.regenerate_btn')}
          </button>
          <button onClick={handleViewSitemap} disabled={refreshing} className="btn btn-secondary gap-2">
            <FaSearch /> {t('seo_dashboard.view_sitemap_btn')}
          </button>
          <button onClick={handlePingGoogle} className="btn btn-primary gap-2">
            <FaExternalLinkAlt /> {t('seo_dashboard.ping_btn')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-soft bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-3 ${card.color}`}>
                <card.icon className="text-lg" />
              </div>
              <div>
                <p className="text-2xl font-bold">{card.value ?? 0}</p>
                <p className="text-xs text-gray-500">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('seo_dashboard.page_type_dist')}</h3>
          <div className="space-y-3">
            {barData.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <span className="text-gray-500">{item.value}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${item.color} transition-all`}
                    style={{ width: `${(item.value / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('seo_dashboard.total_pages')}</h3>
          <div className="flex items-center justify-center py-6">
            <div className="text-center">
              <p className="text-5xl font-bold text-primary-600">{summary.totalSeoPages ?? 0}</p>
              <p className="mt-1 text-sm text-gray-500">{t('seo_dashboard.indexable_pages')}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <FaCheckCircle /> {t('seo_dashboard.states_with_properties', { count: summary.statesWithPages ?? 0 })}
            </div>
            {summary.statesWithNoProperties > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <FaExclamationTriangle /> {t('seo_dashboard.states_no_properties', { count: summary.statesWithNoProperties })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">{t('seo_dashboard.health_overview')}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
              <span className="font-medium text-green-700">{t('seo_dashboard.health_state_pages')}</span>
              <span className="text-green-600">{summary.statePages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
              <span className="font-medium text-blue-700">{t('seo_dashboard.health_lga_pages')}</span>
              <span className="text-blue-600">{summary.lgaPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
              <span className="font-medium text-purple-700">{t('seo_dashboard.health_area_pages')}</span>
              <span className="text-purple-600">{summary.areaPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
              <span className="font-medium text-orange-700">{t('seo_dashboard.health_property_pages')}</span>
              <span className="text-orange-600">{summary.propertyPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-teal-50 p-3">
              <span className="font-medium text-teal-700">{t('seo_dashboard.health_sitemap_urls')}</span>
              <span className="text-teal-600">{summary.sitemapUrls}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-soft bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FaChartBar className="text-primary-600" /> {t('seo_dashboard.ranking_history')}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {t('seo_dashboard.ranking_desc')}
            </p>
          </div>
          <button
            onClick={handleRankingCheck}
            disabled={checkingRankings}
            className="btn btn-primary gap-2"
          >
            <FaSyncAlt className={checkingRankings ? 'animate-spin' : ''} />
            {checkingRankings ? t('seo_dashboard.checking_google') : t('seo_dashboard.check_now_btn')}
          </button>
        </div>

        {rankings.latestByKeyword.length > 0 && (
          <div className="grid gap-3 border-b border-gray-100 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {rankings.latestByKeyword.map((ranking) => (
              <div key={ranking._id} className="rounded-lg bg-gray-50 p-4">
                <p className="truncate text-xs font-medium text-gray-600" title={ranking.keyword}>
                  {ranking.keyword}
                </p>
                <p className={`mt-2 text-2xl font-bold ${ranking.found ? 'text-green-600' : 'text-gray-500'}`}>
                  {ranking.found ? `#${ranking.position}` : t('seo_dashboard.not_in_top', { depth: ranking.searchDepth || 100 })}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">{t('seo_dashboard.keyword')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.position')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.google_result')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.checked')}</th>
              </tr>
            </thead>
            <tbody>
              {rankings.history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                    {t('seo_dashboard.no_rankings')}
                  </td>
                </tr>
              ) : rankings.history.map((ranking) => (
                <tr key={ranking._id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{ranking.keyword}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${ranking.found ? 'text-green-600' : 'text-gray-500'}`}>
                      {ranking.found ? `#${ranking.position}` : t('seo_dashboard.not_found_top', { depth: ranking.searchDepth || 100 })}
                    </span>
                  </td>
                  <td className="max-w-xs px-5 py-3">
                    {ranking.resultUrl ? (
                      <a
                        href={ranking.resultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-primary-600 hover:underline"
                        title={ranking.resultTitle || ranking.resultUrl}
                      >
                        {ranking.resultTitle || ranking.resultUrl}
                        <FaExternalLinkAlt className="shrink-0 text-[10px]" />
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                    {ranking.checkedAt ? new Date(ranking.checkedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-soft bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('seo_dashboard.state_coverage')}</h3>
          <div className="relative max-w-xs">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={stateSearch} onChange={(e) => setStateSearch(e.target.value)}
              placeholder={t('seo_dashboard.search_states')}
              className="input pl-9 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">{t('seo_dashboard.state')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.slug')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.properties')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.seo_url')}</th>
                <th className="px-5 py-3">{t('seo_dashboard.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStates.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">{t('seo_dashboard.no_states')}</td></tr>
              ) : filteredStates.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 transition hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{s.state_name}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{s.state_slug}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${s.property_count > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {s.property_count}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <a
                      href={`/nigeria/${s.state_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary-600 hover:underline"
                    >
                      /nigeria/{s.state_slug} <FaExternalLinkAlt className="text-[10px]" />
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    {s.property_count > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{t('seo_dashboard.active')}</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{t('seo_dashboard.no_properties')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showSitemap && sitemapXml && (
        <div className="rounded-xl border border-soft bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">{t('seo_dashboard.sitemap_title')}</h3>
            <button onClick={() => setShowSitemap(false)} className="text-sm text-gray-500 hover:text-gray-700">{t('seo_dashboard.close')}</button>
          </div>
          <div className="max-h-96 overflow-auto p-5">
            <pre className="rounded-lg bg-gray-50 p-4 text-xs text-gray-700 whitespace-pre-wrap break-all">{sitemapXml}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeoDashboard;
