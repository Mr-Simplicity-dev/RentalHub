import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  FaGlobe, FaFileCode, FaMapMarkedAlt, FaHome, FaLink,
  FaSyncAlt, FaSearch, FaExternalLinkAlt, FaCheckCircle,
  FaExclamationTriangle, FaChartBar,
} from 'react-icons/fa';
import api from '../services/api';

const SeoDashboard = () => {
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
      toast.error(err.response?.data?.message || 'Failed to load SEO dashboard');
    } finally {
      if (isInitial) setLoading(false); else setRefreshing(false);
    }
  }, []);

  const loadRankings = useCallback(async () => {
    try {
      const res = await api.get('/admin/seo/rankings');
      setRankings(res.data?.data || { latestByKeyword: [], history: [] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load Google rankings');
    }
  }, []);

  useEffect(() => {
    loadData(true);
    loadRankings();
  }, [loadData, loadRankings]);

  const handleRegenerate = async () => {
    if (!window.confirm('Regenerate sitemap? This will recalculate all SEO URLs.')) return;
    try {
      setRefreshing(true);
      const res = await api.post('/admin/seo/regenerate-sitemap');
      toast.success(`Sitemap regenerated — ${res.data?.data?.urlCount || 0} URLs`);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate');
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
      toast.error(err.response?.data?.message || 'Failed to fetch sitemap');
    } finally {
      setRefreshing(false);
    }
  };

  const handlePingGoogle = async () => {
    try {
      const res = await api.post('/admin/seo/ping-google');
      toast.success(res.data?.data?.success ? 'Google pinged successfully' : 'Google ping completed (check logs)');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to ping Google');
    }
  };

  const handleRankingCheck = async () => {
    if (!window.confirm('Check Google rankings now? This uses one SerpAPI credit per configured keyword.')) return;

    try {
      setCheckingRankings(true);
      const res = await api.post('/admin/seo/rankings/check');
      toast.success(res.data?.message || 'Google ranking check completed');
      await loadRankings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to check Google rankings');
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
    { label: 'State Pages', value: summary.statePages, icon: FaGlobe, color: 'bg-blue-50 text-blue-600' },
    { label: 'LGA Pages', value: summary.lgaPages, icon: FaMapMarkedAlt, color: 'bg-green-50 text-green-600' },
    { label: 'Area Pages', value: summary.areaPages, icon: FaHome, color: 'bg-purple-50 text-purple-600' },
    { label: 'Property Pages', value: summary.propertyPages, icon: FaFileCode, color: 'bg-orange-50 text-orange-600' },
    { label: 'Sitemap URLs', value: summary.sitemapUrls, icon: FaLink, color: 'bg-teal-50 text-teal-600' },
  ];

  const maxValue = Math.max(
    summary.statePages || 0, summary.lgaPages || 0,
    summary.areaPages || 0, summary.propertyPages || 0, 1
  );

  const barData = [
    { label: 'States', value: summary.statePages || 0, color: 'bg-blue-500' },
    { label: 'LGAs', value: summary.lgaPages || 0, color: 'bg-green-500' },
    { label: 'Areas', value: summary.areaPages || 0, color: 'bg-purple-500' },
    { label: 'Properties', value: summary.propertyPages || 0, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">SEO Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing && <span className="text-xs text-slate-400 animate-pulse">Syncing...</span>}
          <button onClick={handleRegenerate} disabled={refreshing} className="btn btn-secondary gap-2">
            <FaSyncAlt className={refreshing ? 'animate-spin' : ''} /> Regenerate Sitemap
          </button>
          <button onClick={handleViewSitemap} disabled={refreshing} className="btn btn-secondary gap-2">
            <FaSearch /> View Sitemap XML
          </button>
          <button onClick={handlePingGoogle} className="btn btn-primary gap-2">
            <FaExternalLinkAlt /> Ping Google
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Page Type Distribution</h3>
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Total SEO Pages</h3>
          <div className="flex items-center justify-center py-6">
            <div className="text-center">
              <p className="text-5xl font-bold text-primary-600">{summary.totalSeoPages ?? 0}</p>
              <p className="mt-1 text-sm text-gray-500">indexable pages</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <FaCheckCircle /> {summary.statesWithPages ?? 0} states with properties
            </div>
            {summary.statesWithNoProperties > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <FaExclamationTriangle /> {summary.statesWithNoProperties} states with no properties
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-soft bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Health Overview</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
              <span className="font-medium text-green-700">State SEO pages</span>
              <span className="text-green-600">{summary.statePages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
              <span className="font-medium text-blue-700">LGA SEO pages</span>
              <span className="text-blue-600">{summary.lgaPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
              <span className="font-medium text-purple-700">Area SEO pages</span>
              <span className="text-purple-600">{summary.areaPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
              <span className="font-medium text-orange-700">Property detail pages</span>
              <span className="text-orange-600">{summary.propertyPages}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-teal-50 p-3">
              <span className="font-medium text-teal-700">Sitemap URLs</span>
              <span className="text-teal-600">{summary.sitemapUrls}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-soft bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FaChartBar className="text-primary-600" /> Google Ranking History
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Real Nigerian Google results recorded through SerpAPI
            </p>
          </div>
          <button
            onClick={handleRankingCheck}
            disabled={checkingRankings}
            className="btn btn-primary gap-2"
          >
            <FaSyncAlt className={checkingRankings ? 'animate-spin' : ''} />
            {checkingRankings ? 'Checking Google...' : 'Check Google Now'}
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
                  {ranking.found ? `#${ranking.position}` : `Not in top ${ranking.searchDepth || 100}`}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">Keyword</th>
                <th className="px-5 py-3">Position</th>
                <th className="px-5 py-3">Google Result</th>
                <th className="px-5 py-3">Checked</th>
              </tr>
            </thead>
            <tbody>
              {rankings.history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                    No verified rankings yet. Run the first Google check to begin tracking.
                  </td>
                </tr>
              ) : rankings.history.map((ranking) => (
                <tr key={ranking._id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{ranking.keyword}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${ranking.found ? 'text-green-600' : 'text-gray-500'}`}>
                      {ranking.found ? `#${ranking.position}` : `Not found (top ${ranking.searchDepth || 100})`}
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
          <h3 className="text-sm font-semibold text-gray-900">State Coverage</h3>
          <div className="relative max-w-xs">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={stateSearch} onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Search states..."
              className="input pl-9 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Properties</th>
                <th className="px-5 py-3">SEO URL</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStates.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">No states found.</td></tr>
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
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">No Properties</span>
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
            <h3 className="text-sm font-semibold text-gray-900">Sitemap XML</h3>
            <button onClick={() => setShowSitemap(false)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
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
