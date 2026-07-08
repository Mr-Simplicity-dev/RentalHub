import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NigeriaPage() {
  const { t } = useTranslation();
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
          throw new Error(payload?.message || t('nigeria_page.load_failed'));
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || t('nigeria_page.load_failed'));
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
    return <div className="px-4 py-16 text-center text-gray-600">{t('nigeria_page.loading')}</div>;
  }

  if (error || !data?.success) {
    return <div className="px-4 py-16 text-center text-red-600">{error || t('nigeria_page.unavailable')}</div>;
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
              {t('nigeria_page.title')}
            </p>
            <h1 className="mt-3 text-4xl font-bold text-gray-900">
              {t('nigeria_page.subtitle')}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
              {data.seo.description}
            </p>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">{t('nigeria_page.all_states')}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.states.map((state) => (
                <Link
                  key={state.id}
                  to={state.url}
                  className="rounded-2xl border border-gray-200 px-5 py-4 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <p className="font-semibold text-gray-900">{state.state_name}</p>
                  <p className="mt-2 text-sm text-gray-500">{t('nigeria_page.lgas_count', { count: state.lga_count })}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">{t('nigeria_page.high_intent')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('nigeria_page.high_intent_desc')}
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
                    {t('nigeria_page.verified_listing', { count: Number(area.property_count || 0) })}
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
