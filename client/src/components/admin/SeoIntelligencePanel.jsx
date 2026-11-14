import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
const tabs = ['Connections', 'Search performance', 'Keywords', 'Competitors', 'Opportunities', 'Content plans', 'Technical checks', 'History', 'Settings'];
const metric = value => value === null || value === undefined ? 'Not available' : Number(value).toLocaleString('en-NG', {
  maximumFractionDigits: 2
});
const Table = ({
  rows = [],
  columns
}) => !rows.length ? <p className="py-4 text-sm text-gray-600">No recorded data for this view.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map(([key, label]) => <th className="p-3 border-b" key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || row.label || i}>{columns.map(([key]) => <td className="p-3 border-b align-top max-w-xs break-words" key={key}>{typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? 'Not available')}</td>)}</tr>)}</tbody></table></div>;
export default function SeoIntelligencePanel() {
  const [tab, setTab] = useState('Connections'),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(''),
    [country, setCountry] = useState(''),
    [device, setDevice] = useState(''),
    [input, setInput] = useState(''),
    [result, setResult] = useState(null),
    [plan, setPlan] = useState({
      title: '',
      cluster: '',
      content: '',
      outline: '',
      keywords: [],
      intent: 'informational'
    }),
    [confirmed, setConfirmed] = useState(false),
    [dirty, setDirty] = useState(false),
    [legacyDrafts, setLegacyDrafts] = useState([]),
    [keywordOffset, setKeywordOffset] = useState(0),
    [researchResult, setResearchResult] = useState(null),
    [auditUrls, setAuditUrls] = useState('');
  const filters = {
    ...(start ? {
      start
    } : {}),
    ...(end ? {
      end
    } : {}),
    query,
    page,
    country,
    device
  };
  const call = async (path, body, method = 'post') => {
    setBusy(true);
    setError('');
    try {
      const r = await api[method]('/admin/seo' + path, body);
      setResult(r.data.data);
      return r.data.data;
    } catch (e) {
      setError(e.response?.data?.message || 'The request could not be completed.');
      return null;
    } finally {
      setBusy(false);
    }
  };
  const load = useCallback(async () => {
    const paths = {
      'Connections': '/integrations',
      'Search performance': '/search-console/performance',
      'Keywords': '/keywords',
      'Competitors': '/competitors',
      'Opportunities': '/opportunities',
      'Content plans': '/content-plans',
      'History': '/search-console/syncs',
      'Settings': '/settings'
    };
    setData(null);
    setError('');
    if (!paths[tab]) return;
    setBusy(true);
    try {
      const r = await api.get('/admin/seo' + paths[tab], tab === 'Keywords' ? {
        params: {
          limit: 50,
          offset: keywordOffset
        }
      } : undefined);
      setData(r.data.data);
    } catch (e) {
      setError(e.response?.data?.message || 'This data is not available.');
    } finally {
      setBusy(false);
    }
  }, [tab, keywordOffset]);
  useEffect(() => {
    setResult(null);
    load();
  }, [load]);
  const button = (label, fn) => <button type="button" disabled={busy} onClick={fn} className="rounded-lg border px-4 py-2 min-h-[44px] text-sm font-semibold disabled:opacity-50">{label}</button>;
  const field = (label, value, onChange, type = 'text') => <label className="text-sm grid gap-1">{label}<input className="rounded-lg border p-3 min-w-0" type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={e => onChange(e.target.value)} /></label>;
  return <section className="rounded-xl border bg-white p-4 md:p-6 space-y-5 min-w-0" aria-label="SEO intelligence"><div><h2 className="text-xl font-bold">Search intelligence</h2><p className="text-sm text-gray-600 mt-2">Google Search Console shows actual search results. Keyword Planner shows estimates. Rankings are separate SerpAPI checks. Missing access never means zero traffic.</p></div><nav className="flex gap-2 flex-wrap" aria-label="SEO sections">{tabs.map(name => <button type="button" key={name} onClick={() => setTab(name)} aria-pressed={tab === name} className={'rounded-lg px-3 py-2 text-sm border ' + (tab === name ? 'bg-blue-950 text-white' : 'bg-white')}>{name}</button>)}</nav>{button('Refresh section', load)}{busy && <p role="status">Working…</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
 {tab === 'Connections' && <div className="space-y-4">{(data || []).map(connection => <article className="border rounded-lg p-4 space-y-3" key={connection.provider}><h3 className="font-bold">{connection.provider === 'search_console' ? 'Google Search Console' : 'Google Ads Keyword Planner'}</h3><p>Status: {connection.status}</p>{connection.missing?.length > 0 && <p className="text-sm text-amber-900">Server setup needed: {connection.missing.join(', ')}. Keep all secrets on the server.</p>}<div className="flex flex-wrap gap-2">{button('Connect Google account', async () => {
            const r = await call('/google/' + connection.provider + '/connect', {});
            if (r?.url) window.location.assign(r.url);
          })}{connection.provider === 'search_console' && button('Connect with sitemap permission', async () => {
            const r = await call('/google/search_console/connect', {
              sitemap_write: true
            });
            if (r?.url) window.location.assign(r.url);
          })}{button('Disconnect', async () => {
            if (window.confirm('Disconnect this Google connection?')) {
              await call('/google/' + connection.provider + '/disconnect', {});
              load();
            }
          })}</div>{connection.property_url && <p className="text-sm break-all">Selected property: {connection.property_url}</p>}</article>)}{button('Find verified RentalHub properties', async () => {
        const r = await call('/search-console/sites', undefined, 'get');
        setResult(r);
      })}{Array.isArray(result) && result.map(site => <div key={site.siteUrl}>{button('Select ' + site.siteUrl, async () => {
          await call('/search-console/property', {
            siteUrl: site.siteUrl
          });
          load();
        })}</div>)}</div>}
 {tab === 'Search performance' && <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{field('Start date', start, setStart, 'date')}{field('End date', end, setEnd, 'date')}{field('Query contains', query, setQuery)}{field('Page contains', page, setPage)}{field('Country (for example nga)', country, setCountry)}<label className="text-sm grid gap-1">Device<select value={device} onChange={e => setDevice(e.target.value)} className="border rounded-lg p-3"><option value="">All</option>{['mobile', 'desktop', 'tablet'].map(d => <option key={d}>{d}</option>)}</select></label></div><div className="flex flex-wrap gap-2">{button('Apply filters', async () => {
          setBusy(true);
          try {
            const r = await api.get('/admin/seo/search-console/performance', {
              params: filters
            });
            setData(r.data.data);
            setError('');
          } catch (e) {
            setError(e.response?.data?.message || 'Could not load this period.');
          } finally {
            setBusy(false);
          }
        })}{button('Queue Google refresh', () => call('/search-console/sync', {
          ...(start ? {
            start
          } : {}),
          ...(end ? {
            end
          } : {})
        }))}{button('Export visible queries', async () => {
          try {
            const r = await api.get('/admin/seo/export', {
              params: {
                ...filters,
                type: 'queries'
              },
              responseType: 'blob'
            });
            const url = URL.createObjectURL(r.data),
              a = document.createElement('a');
            a.href = url;
            a.download = 'rentalhub-search-queries.csv';
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            setError('The export could not be downloaded.');
          }
        })}</div>{data?.summary ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Clicks', data.summary.clicks], ['Impressions', data.summary.impressions], ['CTR', data.summary.ctr == null ? 'Not available' : (Number(data.summary.ctr) * 100).toFixed(2) + '%'], ['Average position', data.summary.position]].map(([label, value]) => <div key={label} className="border rounded-lg p-4"><p className="text-sm">{label}</p><strong>{typeof value === 'number' ? metric(value) : value}</strong></div>)}</div> : <p>{data?.empty_message||'No imported performance data. Connect, select a property and request a refresh.'}</p>}<p className="text-xs text-gray-600">{data?.limitations}</p><p className="text-xs text-gray-600">Last completed import: {data?.last_sync_at?new Date(data.last_sync_at).toLocaleString():'Not yet completed'} · Connection: {(data?.connection_status||'Not connected').replaceAll('_',' ')}</p>{data?.comparison && data?.comparison_coverage?.complete!==false && <p className="text-sm">Previous equal period: {metric(data.comparison.clicks)} clicks; {metric(data.comparison.impressions)} impressions.</p>}<h3 className="font-bold">Daily trend</h3>{data?.trend?.length > 1 && <div className="h-64 w-full min-w-0" aria-label="Daily clicks and impressions"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend}><XAxis dataKey="date" tickFormatter={d => d.slice(5)} minTickGap={30} /><YAxis yAxisId="clicks" width={40} /><YAxis yAxisId="impressions" orientation="right" width={50} /><Tooltip /><Legend /><Line yAxisId="clicks" type="monotone" dataKey="clicks" name="Clicks" stroke="#0A66C2" dot={false} /><Line yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressions" stroke="#A36A00" strokeDasharray="5 3" dot={false} /></LineChart></ResponsiveContainer></div>}<Table rows={data?.trend} columns={[["date", "Date"], ["clicks", "Clicks"], ["impressions", "Impressions"], ["ctr", "CTR ratio"], ["position", "Position"]]} />{[['Top queries', 'topQueries'], ['Pages', 'topPages'], ['Countries', 'countries'], ['Devices', 'devices']].map(([label, key]) => <div key={key}><h3 className="font-bold">{label}</h3><Table rows={data?.[key]} columns={[["label", label], ["clicks", "Clicks"], ["impressions", "Impressions"], ["ctr", "CTR ratio"], ["position", "Position"]]} /></div>)}</div>}
 {tab === 'Keywords' && <div className="space-y-4">{field('Seed keywords (comma separated)', input, setInput)}<div className="flex flex-wrap gap-2">{button('Research Google Ads estimates', async () => {
          const r = await call('/keywords/research', {
            seeds: input.split(',').map(s => s.trim()).filter(Boolean)
          });
          if (r?.ideas) setResearchResult(r);
        })}{button('Import existing configured keywords', async () => {
          const r = await call('/keywords/import-configured', {});
          if (r) {
            setError('');
            load();
          }
        })}{button('Save manual keyword', async () => {
          await call('/keywords', {
            keyword: input
          });
          load();
        })}{button('Queue tracked ranking checks', () => call('/rankings/queue', {}))}{button('Export saved keywords', async () => {
          try {
            const r = await api.get('/admin/seo/export', {
              params: {
                type: 'keywords'
              },
              responseType: 'blob'
            });
            const url = URL.createObjectURL(r.data),
              a = document.createElement('a');
            a.href = url;
            a.download = 'rentalhub-keywords.csv';
            a.click();
            URL.revokeObjectURL(url);
            if (r.headers?.['x-seo-export-truncated'] === 'true') setError('The export reached its 10,000-keyword limit.');
          } catch {
            setError('The keyword export could not be downloaded.');
          }
        })}{button('Open Google Trends comparison', () => window.open('https://trends.google.com/trends/explore?geo=NG&q=' + encodeURIComponent(input), '_blank', 'noopener,noreferrer'))}</div><p className="text-xs text-gray-600">Trends is an external manual check. Advertising competition is not organic SEO difficulty. Rank checks use the saved daily budget.</p>{researchResult?.ideas && <div><p>{researchResult.note}</p>{researchResult.ideas.map(idea => <div key={idea.keyword} className="border-b py-3 flex flex-wrap items-center justify-between gap-2"><span>{idea.keyword} · Estimated monthly searches: {metric(idea.average_monthly_searches)} · Ads competition: {idea.competition || 'Not available'}</span>{button('Save', async () => {
            await call('/keywords', {
              keyword: idea.keyword,
              research_id: researchResult.id
            });
            load();
          })}</div>)}</div>}<Table rows={data} columns={[["keyword", "Keyword"], ["group_name", "Group"], ["target_url", "Target page"], ["location", "Location"], ["is_tracked", "Tracking"], ["metrics", "Saved estimates"]]} /><div className="flex flex-wrap items-center gap-2"><span className="text-sm">Saved keywords {data?.length ? keywordOffset + 1 : 0}–{keywordOffset + (data?.length || 0)} of {data?.[0]?.total_count || 0}</span>{button('Previous 50', () => setKeywordOffset(Math.max(0, keywordOffset - 50)))}{button('Next 50', () => {
          if (Number(data?.[0]?.total_count) > keywordOffset + 50) setKeywordOffset(keywordOffset + 50);
        })}</div>{(data || []).map(k => <div className="flex flex-wrap gap-2 items-center" key={k.id}><span className="text-sm">{k.keyword}</span>{button(k.is_tracked ? 'Stop tracking' : 'Track weekly', async () => {
          await call('/keywords', {
            ...k,
            is_tracked: !k.is_tracked
          });
          load();
        })}{button('Assign group and page', async () => {
          const group = window.prompt('Keyword group', k.group_name || '');
          if (group === null) return;
          const url = window.prompt('Clean public RentalHub target URL (blank removes it)', k.target_url || '');
          if (url === null) return;
          await call('/keywords', {
            ...k,
            group_name: group,
            target_url: url,
            is_target: !!url
          });
          load();
        })}{button('Tracking location and frequency', async () => {
          const location = window.prompt('Google search location, for example Lagos, Nigeria. Blank uses country targeting.', k.location || '');
          if (location === null) return;
          const frequency = window.prompt('Hours between checks (24 to 2160)', String(k.frequency_hours || 168));
          if (frequency === null) return;
          await call('/keywords', {
            ...k,
            location,
            frequency_hours: Number(frequency)
          });
          load();
        })}{button('Remove', async () => {
          await call('/keywords/' + k.id, undefined, 'delete');
          load();
        })}</div>)}</div>}
 {tab === 'Competitors' && <div className="space-y-4">{field('Competitor domain', input, setInput)}{button('Load recorded competitor positions',async()=>{const r=await call('/rankings',undefined,'get');if(r)setResult(r);})}{result?.history&&<Table rows={result.history.flatMap(record=>(record.competitors||[]).map(competitor=>({keyword:record.keyword,domain:competitor.domain,position:competitor.position,location:record.searchLocation||record.searchCountry,checked_at:record.checkedAt})))} columns={[["keyword","Keyword"],["domain","Observed domain"],["position","Position"],["location","Search location"],["checked_at","Checked"]]}/>} {button('Save competitor', async () => {
        await call('/competitors', {
          domain: input
        });
        load();
      })}<Table rows={data} columns={[["domain", "Domain"], ["label", "Label"]]} />{(data || []).map(c => <div key={c.domain}>{button('Remove ' + c.domain, async () => {
          await call('/competitors/' + encodeURIComponent(c.domain), undefined, 'delete');
          load();
        })}</div>)}<p className="text-sm">Competitor positions are recorded during real keyword checks. Saving a domain does not invent a ranking.</p></div>}
 {tab === 'Opportunities' && <div className="space-y-4">{button('Generate from recorded evidence', async () => {
        await call('/opportunities/generate', {});
        load();
      })}{(data || []).map(o => <article className="border rounded-lg p-4 space-y-2" key={o.id}><strong>{o.priority.toUpperCase()} · {o.rule.replaceAll('_', ' ')}</strong><p>{o.reason}</p><p className="text-sm">{o.action}</p><p className="text-xs break-all">{o.query || o.page} · Source: {o.source}</p><details><summary>Evidence</summary><pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(o.evidence, null, 2)}</pre></details>{button('Mark done', async () => {
          await call('/opportunities/' + o.id, {
            status: 'done'
          }, 'patch');
          load();
        })} {button('Dismiss', async () => {
          await call('/opportunities/' + o.id, {
            status: 'dismissed'
          }, 'patch');
          load();
        })}</article>)}</div>}
 {tab === 'Content plans' && <div className="space-y-4"><p className="text-sm">Drafts never publish automatically. Check facts and originality before approving.</p>{button('Find existing article drafts', async () => {
        try {
          const r = await api.get('/admin/seo/content-plans/legacy-drafts');
          setLegacyDrafts(r.data.data);
        } catch (e) {
          setError(e.response?.data?.message || 'Existing drafts are unavailable.');
        }
      })}{legacyDrafts.map(draft => <div className="border rounded-lg p-3 flex flex-wrap gap-2 items-center justify-between" key={draft._id}><span>{draft.title}</span>{button('Bring into review', async () => {
          const r = await call('/content-plans/import', {
            blog_id: draft._id
          });
          if (r) {
            setLegacyDrafts(previous => previous.filter(d => d._id !== draft._id));
            load();
          }
        })}</div>)}{field('Title', plan.title, v => {
        setPlan({
          ...plan,
          title: v
        });
        setDirty(true);
        setConfirmed(false);
      })}{field('Topic group', plan.cluster, v => {
        setPlan({
          ...plan,
          cluster: v
        });
        setDirty(true);
        setConfirmed(false);
      })}{field('Target public page (optional)', plan.target_url || '', v => {
        setPlan({
          ...plan,
          target_url: v
        });
        setDirty(true);
        setConfirmed(false);
      })}{field('Article keywords (comma separated)', plan.keywords_text ?? (plan.keywords || []).join(', '), v => {
        setPlan({
          ...plan,
          keywords_text: v,
          keywords: v.split(',').map(k => k.trim()).filter(Boolean)
        });
        setDirty(true);
        setConfirmed(false);
      })}{button('Suggest outlines from saved keyword groups', () => call('/content-plans/suggestions', undefined, 'get'))}{result?.groups?.map(group => <div className="border rounded-lg p-3" key={group.cluster}><strong>{group.cluster}</strong><p className="text-sm">{group.keywords.join(', ')}</p>{button('Use this outline', () => {
          setPlan({
            title: group.title,
            cluster: group.cluster,
            keywords: group.keywords,
            outline: group.outline,
            content: '',
            intent: 'informational'
          });
          setDirty(true);
          setConfirmed(false);
        })}<p className="text-xs text-gray-600">{group.note}</p></div>)}<label className="grid gap-1 text-sm">Outline<textarea rows="4" className="border rounded-lg p-3" value={plan.outline} onChange={e => {
          setPlan({
            ...plan,
            outline: e.target.value
          });
          setDirty(true);
          setConfirmed(false);
        }} /></label><label className="grid gap-1 text-sm">Article text<textarea rows="10" className="border rounded-lg p-3" value={plan.content} onChange={e => {
          setPlan({
            ...plan,
            content: e.target.value
          });
          setDirty(true);
          setConfirmed(false);
        }} /></label>{button('Save draft', async () => {
        const saved = await call('/content-plans', plan);
        if (saved) {
          setPlan(saved);
          setDirty(false);
          setConfirmed(false);
          load();
        }
      })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the facts and originality of the draft I choose to publish.</label>{(data || []).map(p => <article key={p.id} className="border rounded-lg p-4 space-y-2"><strong>{p.title}</strong><p>{p.status} · {p.cluster}</p>{button('Review draft', () => {
          setPlan(p);
          setConfirmed(false);
          setDirty(false);
        })}{p.status !== 'published' && button('Approve and publish', async () => {
          if (!confirmed || dirty || plan.id !== p.id) {
            setError('Open this draft, save any changes, then read and check its latest saved version first.');
            return;
          }
          const note = window.prompt('Write an approval note (at least ten characters).');
          if (!note) return;
          if (window.confirm('Publish this article publicly?')) {
            await call('/content-plans/' + p.id + '/publish', {
              confirm: true,
              facts_checked: true,
              originality_checked: true,
              approval_note: note,
              expected_revision: plan.revision
            });
            load();
          }
        })}</article>)}</div>}
 {tab === 'Technical checks' && <div className="space-y-4">{field('Clean public RentalHub URL', input, setInput)}<label className="grid gap-1 text-sm">Optional HTML audit batch (one public URL per line, maximum ten)<textarea rows="3" className="border rounded-lg p-3" value={auditUrls} onChange={event=>setAuditUrls(event.target.value)}/></label><div className="flex flex-wrap gap-2">{button('Audit returned HTML', () => call('/technical-audit', {
          urls: auditUrls.trim() ? auditUrls.split(/\r?\n/).map(url=>url.trim()).filter(Boolean) : [input]
        }))}{button('Inspect Google indexed version', () => call('/search-console/inspect', {
          url: input
        }))}{button('Run mobile PageSpeed', () => call('/pagespeed', {
          url: input,
          strategy: 'mobile'
        }))}{button('Submit official sitemap', () => {
          if (window.confirm('Submit the current sitemap to Google Search Console? This does not guarantee indexing.')) call('/search-console/submit-sitemap', {});
        })}</div><p className="text-sm">HTML audits, Google index inspection and PageSpeed are separate checks. Each result names its source and limits.</p></div>}
 {tab === 'History' && <div className="space-y-4"><h3 className="font-bold">Google import runs</h3><Table rows={data} columns={[["created_at", "Requested"], ["status", "Status"], ["start_date", "Start"], ["end_date", "End"], ["processed_rows", "Rows"], ["truncated", "Top-row limit reached"], ["error_code", "Last error"]]} /><div className="flex flex-wrap gap-2">{['keyword_research', 'url_inspection', 'technical_audit', 'sitemap', 'pagespeed'].map(kind => button(kind.replaceAll('_', ' '), () => call('/observations?kind=' + kind, undefined, 'get')))}</div></div>}
 {tab === 'Settings' && data?.config && <div className="space-y-4"><p className="text-sm">Daily limits apply on the server. Lower limits reduce provider spending.</p><div className="grid sm:grid-cols-2 gap-3">{Object.entries(data.config).map(([key, value]) => field(key.replaceAll('_', ' '), value, v => setData({
          ...data,
          config: {
            ...data.config,
            [key]: v
          }
        }), 'number'))}</div>{button('Save limits', () => call('/settings', data.config, 'put'))}<Table rows={data.usage} columns={[["provider", "Provider"], ["used", "Requests used today"]]} /></div>}
 {result && !['Connections', 'Keywords'].includes(tab) && <div className="border rounded-lg p-4 space-y-3"><h3 className="font-bold">Recorded result</h3>{result.source && <p className="text-xs text-gray-600">Source: {result.source.replaceAll('_', ' ')} · {result.checked_at || result.retrieved_at || ''}</p>}{result.pages?.map(report => <article key={report.url} className="border rounded-lg p-3 space-y-2"><p className="font-semibold break-all">{report.url}</p><p className="text-sm">HTTP {report.status ?? 'unavailable'} · {report.noindex ? 'Excluded from indexing' : 'Index directive reviewed'}</p>{report.issues?.length ? report.issues.map((issue, index) => <div key={index} className="rounded bg-amber-50 p-3 text-sm"><strong>{issue.severity.toUpperCase()}</strong><p>{issue.message}</p><p>{issue.action}</p></div>) : <p>No issues found in these limited checks.</p>}</article>)}{result.inspection?.indexStatusResult && <dl className="grid sm:grid-cols-2 gap-3">{Object.entries(result.inspection.indexStatusResult).filter(([, v]) => typeof v === 'string').map(([key, v]) => <div key={key}><dt className="text-xs text-gray-600">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="text-sm break-all">{v}</dd></div>)}</dl>}{result.lab && <div><p>Lab performance score: {result.lab.categories?.performance?.score == null ? 'Not available' : Math.round(result.lab.categories.performance.score * 100) + '/100'}</p><p className="text-sm">Real-user field data: {result.field?.overall_category || 'Not available'}. A missing result is not a pass.</p>{Object.entries(result.lab.audits || {}).filter(([key]) => ['largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'first-contentful-paint'].includes(key)).map(([key, a]) => <p className="text-sm" key={key}>{a.title}: {a.displayValue || 'Not available'}</p>)}</div>}{result.google_accepted && <p>Google accepted the sitemap. This does not confirm that its pages are indexed.</p>}{result.queued && <p>{result.message || 'Request queued.'}</p>}{result.run && <p>Google refresh: {result.run.status}. Check History for progress.</p>}{result.generated !== undefined && <p>{result.generated} recommendations were generated from recorded evidence.</p>}{result.note && <p className="text-sm text-gray-600">{result.note}</p>}{result.limitations && <p className="text-sm text-gray-600">{result.limitations}</p>}<details><summary className="text-sm cursor-pointer">Detailed report</summary><pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre></details></div>}
 </section>;
}
