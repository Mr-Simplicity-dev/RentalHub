import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function AreaPage() {
  const { t } = useTranslation();
  const currency = (amount) =>
    Number.isFinite(Number(amount))
      ? `₦${Math.round(Number(amount)).toLocaleString('en-NG')}`
      : t('area_page.na');

  const { stateSlug, citySlug, areaSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      try {
        const response = await fetch(`/areas/${stateSlug}/${citySlug}/${areaSlug}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.message || t('area_page.load_failed'));
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || t('area_page.load_failed'));
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
  }, [areaSlug, citySlug, stateSlug]);

  if (loading) {
    return <div className="px-4 py-16 text-center text-gray-600">{t('area_page.loading')}</div>;
  }

  if (error || !data?.success) {
    return <div className="px-4 py-16 text-center text-red-600">{error || t('area_page.not_found')}</div>;
  }

  const areaLabel = `${data.area.name}, ${data.area.state}`;
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (data.faq || []).map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <Helmet>
        <title>{data.seo.title}</title>
        <meta name="description" content={data.seo.description} />
        <meta name="keywords" content={(data.seo.keywords || []).join(', ')} />
        <link rel="canonical" href={data.canonical} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="mb-6 text-sm text-gray-500">
            <Link to="/" className="hover:text-primary-700">
              {t('area_page.home')}
            </Link>{' '}
            /{' '}
            <Link to="/nigeria" className="hover:text-primary-700">
              {t('area_page.nigeria')}
            </Link>{' '}
            /{' '}
            <Link to={`/nigeria/${data.area.stateSlug}`} className="hover:text-primary-700">
              {data.area.state}
            </Link>{' '}
            / {data.area.name}
          </div>

          <section className="grid gap-6 rounded-3xl bg-white p-8 shadow-sm lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-700">
                {t('area_page.title')}
              </p>
              <h1 className="mt-3 text-4xl font-bold text-gray-900">{data.seo.title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                {data.seo.description}
              </p>
            </div>

            <div className="rounded-3xl bg-primary-900 p-6 text-white">
              <p className="text-xs uppercase tracking-[0.3em] text-primary-200">{t('area_page.search_intent')}</p>
              <div className="mt-4 space-y-2">
                {(data.keyword_targets || []).map((keyword) => (
                  <div
                    key={keyword}
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-primary-50"
                  >
                    {keyword}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">{t('area_page.verified_listings')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {Number(data.stats?.total_properties || 0).toLocaleString('en-NG')}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">{t('area_page.average_rent')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {currency(data.stats?.avg_rent)}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">{t('area_page.best_longtail')}</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {data.keyword_targets?.[2] || t('area_page.cheap_rent_in', { area: areaLabel })}
              </p>
            </div>
          </section>

          <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{t('area_page.overview')}</h2>
                <p className="mt-3 leading-7 text-gray-700">{data.content?.overview}</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{t('area_page.rankings')}</h3>
                <p className="mt-3 leading-7 text-gray-700">{data.content?.strategy}</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{t('area_page.market_notes')}</h3>
                <p className="mt-3 leading-7 text-gray-700">{data.content?.marketSummary}</p>
              </div>
            </div>

            <div className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{t('area_page.nearby')}</h2>
                <div className="mt-4 grid gap-3">
                  {(data.links?.nearbyAreas || []).map((item) => (
                    <Link
                      key={item.url}
                      to={item.url}
                      className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:border-primary-300 hover:text-primary-700"
                    >
                      <span>
                        {item.name}, {item.city_name}
                      </span>
                      <span>{t('area_page.count_listings', { count: Number(item.property_count || 0) })}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('area_page.back_to_state')}</h3>
                <Link
                  to={data.links?.statePage?.url || `/nigeria/${data.area.stateSlug}`}
                  className="mt-3 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  {t('area_page.explore', { state: data.area.state })}
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {t('area_page.live_properties_in', { area: areaLabel })}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  {t('area_page.seo_note')}
                </p>
              </div>
            </div>

            {data.properties?.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {data.properties.map((property) => (
                  <Link
                    key={property.id}
                    to={property.url}
                    className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-primary-300 hover:text-primary-700"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                      {property.property_type || t('area_page.property_fallback_type')}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-gray-900">{property.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      {[property.area, property.city, property.state_name].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-3 text-xl font-bold text-gray-900">
                      {currency(property.rent_amount)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-gray-500">{t('area_page.no_properties')}</p>
            )}
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">{t('area_page.faq')}</h2>
            <div className="mt-5 space-y-4">
              {(data.faq || []).map((item) => (
                <div key={item.question} className="rounded-2xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-gray-700">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
