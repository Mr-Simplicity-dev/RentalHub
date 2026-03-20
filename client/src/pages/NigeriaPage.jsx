import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

export default function NigeriaPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      try {
        const response = await fetch('/nigeria');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.message || 'Failed to load Nigeria directory');
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Nigeria directory');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="px-4 py-16 text-center text-gray-600">Loading Nigeria rental directory...</div>;
  }

  if (error || !data?.success) {
    return <div className="px-4 py-16 text-center text-red-600">{error || 'Directory unavailable'}</div>;
  }

  return (
    <>
      <Helmet>
        <title>{data.seo.title}</title>
        <meta name="description" content={data.seo.description} />
        <link rel="canonical" href={data.canonical} />
      </Helmet>

      <div className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <section className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-700">
              Nigeria SEO Hub
            </p>
            <h1 className="mt-3 text-4xl font-bold text-gray-900">
              Nigeria rental directory by state, LGA, and area
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
              {data.seo.description}
            </p>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">All States</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.states.map((state) => (
                <Link
                  key={state.id}
                  to={state.url}
                  className="rounded-2xl border border-gray-200 px-5 py-4 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <p className="font-semibold text-gray-900">{state.state_name}</p>
                  <p className="mt-2 text-sm text-gray-500">{state.lga_count} LGAs</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">High-intent area pages</h2>
            <p className="mt-2 text-sm text-gray-600">
              These pages help target queries like "cheap rent in Lugbe" and similar location-intent searches.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(data.popular_areas || []).map((area) => (
                <Link
                  key={area.url}
                  to={area.url}
                  className="rounded-2xl border border-gray-200 p-5 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <p className="font-semibold text-gray-900">{area.area_name}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {area.city_name}, {area.state_name}
                  </p>
                  <p className="mt-3 text-sm text-gray-600">
                    {Number(area.property_count || 0)} verified listing
                    {Number(area.property_count || 0) === 1 ? '' : 's'}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
