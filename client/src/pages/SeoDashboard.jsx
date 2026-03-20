import { useEffect, useState } from 'react';

export default function SeoDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/admin/seo')
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.message || 'Failed to load SEO dashboard');
        }
        setData(payload);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load SEO dashboard');
      });
  }, []);

  if (error) return <p>{error}</p>;
  if (!data) return <p>Loading...</p>;

  const summary = data.summary || {};

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">SEO Dashboard</h1>

      <div>State pages: {summary.statePages ?? 0}</div>
      <div>LGA pages: {summary.lgaPages ?? 0}</div>
      <div>Area pages: {summary.areaPages ?? 0}</div>
      <div>Property pages: {summary.propertyPages ?? 0}</div>
      <div>Sitemap URLs: {summary.sitemapUrls ?? 0}</div>
    </div>
  );
}
