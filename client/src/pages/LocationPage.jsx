import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function LocationPage() {
  const { t } = useTranslation();
  const currency = (amount) =>
    Number.isFinite(Number(amount))
      ? `₦${Math.round(Number(amount)).toLocaleString('en-NG')}`
      : t('location_page.na');

  const PropertyCard = ({ property }) => (
    <Link
      to={property.url}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {property.primary_photo ? (
        <img
          src={property.primary_photo}
          alt={property.title}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 items-center justify-center bg-gray-100 text-sm text-gray-500">
          {t('location_page.no_photo')}
        </div>
      )}

      <div className="space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          {property.property_type || t('location_page.property_fallback_type')}
        </p>
        <h3 className="text-base font-semibold text-gray-900">{property.title}</h3>
        <p className="text-sm text-gray-600">
          {[property.area, property.city, property.state_name].filter(Boolean).join(', ')}
        </p>
        <p className="text-lg font-bold text-gray-900">{currency(property.rent_amount)}</p>
      </div>
    </Link>
  );

  const { stateSlug, lgaSlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          lgaSlug ? `/nigeria/${stateSlug}/${lgaSlug}` : `/nigeria/${stateSlug}`
        );

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || t('location_page.load_failed'));
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || t('location_page.load_failed'));
          setData(null);
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
  }, [stateSlug, lgaSlug]);

  if (loading) {
    return <div className="px-4 py-16 text-center text-gray-600">{t('location_page.loading')}</div>;
  }

  if (error || !data?.success) {
    return <div className="px-4 py-16 text-center text-red-600">{error || t('location_page.not_found')}</div>;
  }

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

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('location_page.home'),
        item: `${window.location.origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('location_page.nigeria'),
        item: `${window.location.origin}/nigeria`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: data.location.state,
        item: `${window.location.origin}/nigeria/${data.location.stateSlug}`,
      },
      ...(data.location.lga
        ? [
            {
              '@type': 'ListItem',
              position: 4,
              name: data.location.lga,
              item: `${window.location.origin}/nigeria/${data.location.stateSlug}/${data.location.lgaSlug}`,
            },
          ]
        : []),
    ],
  };

  const locationLabel = data.location.lga
    ? `${data.location.lga}, ${data.location.state}`
    : data.location.state;

  return (
    <>
      <Helmet>
        <title>{data.seo.title}</title>
        <meta name="description" content={data.seo.description} />
        <meta name="keywords" content={(data.seo.keywords || []).join(', ')} />
        <link rel="canonical" href={data.canonical} />
        <meta property="og:title" content={data.seo.title} />
        <meta property="og:description" content={data.seo.description} />
        <meta property="og:url" content={data.canonical} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="mb-6 text-sm text-gray-500">
            <Link to="/" className="hover:text-primary-700">
              {t('location_page.home')}
            </Link>{' '}
            /{' '}
            <Link to="/nigeria" className="hover:text-primary-700">
              {t('location_page.nigeria')}
            </Link>{' '}
            /{' '}
            <Link to={`/nigeria/${data.location.stateSlug}`} className="hover:text-primary-700">
              {data.location.state}
            </Link>
            {data.location.lga ? ` / ${data.location.lga}` : ''}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-3xl bg-white p-8 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary-700">
                {t('location_page.title')}
              </p>
              <h1 className="max-w-3xl text-3xl font-bold text-gray-900 md:text-4xl">
                {data.seo.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                {data.seo.description}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t('location_page.verified_listings')}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {Number(data.stats?.total_properties || 0).toLocaleString('en-NG')}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t('location_page.average_rent')}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {currency(data.stats?.avg_rent)}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-100 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t('location_page.target_query')}</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {data.keyword_targets?.[2] || t('location_page.cheap_rent_in', { location: locationLabel })}
                  </p>
                </div>
              </div>
            </section>

            <aside className="rounded-3xl bg-primary-900 p-8 text-white shadow-sm">
              <h2 className="text-xl font-semibold">{t('location_page.ranking_strategy')}</h2>
              <p className="mt-3 text-sm leading-7 text-primary-100">{data.content?.strategy}</p>

              <div className="mt-6 space-y-2">
                {(data.keyword_targets || []).map((keyword) => (
                  <div
                    key={keyword}
                    className="rounded-full border border-white/20 px-4 py-2 text-sm text-primary-50"
                  >
                    {keyword}
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{t('location_page.market_overview')}</h2>
                <p className="mt-3 leading-7 text-gray-700">{data.content?.overview}</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{t('location_page.renter_know')}</h3>
                <p className="mt-3 leading-7 text-gray-700">{data.content?.marketSummary}</p>
              </div>
            </section>

            <section className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {t('location_page.nearby_intent_pages')}
                </h2>
                <div className="mt-4 grid gap-3">
                  {(data.links?.areas || []).map((item) => (
                    <Link
                      key={item.url}
                      to={item.url}
                      className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:border-primary-300 hover:text-primary-700"
                    >
                      <span>{item.name}</span>
                      <span>{t('location_page.count_listings', { count: Number(item.property_count || 0) })}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {data.links?.statePage && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{t('location_page.state_page')}</h3>
                  <Link
                    to={data.links.statePage.url}
                    className="mt-3 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    {t('location_page.explore', { name: data.links.statePage.name })}
                  </Link>
                </div>
              )}
            </section>
          </div>

          {data.links?.lgas?.length > 0 && (
            <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-gray-900">
                {t('location_page.all_lgas', { state: data.location.state })}
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.links.lgas.map((item) => (
                  <Link
                    key={item.url}
                    to={item.url}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:border-primary-300 hover:text-primary-700"
                  >
                    {t('location_page.houses_for_rent', { name: item.name })}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {t('location_page.verified_properties', { location: locationLabel })}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  {t('location_page.seo_note')}
                </p>
              </div>
              <Link
                to="/properties"
                className="rounded-full border border-primary-200 px-4 py-2 text-sm font-medium text-primary-700"
              >
                {t('location_page.browse_properties')}
              </Link>
            </div>

            {data.properties?.length ? (
              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {data.properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            ) : (
              <p className="mt-6 text-gray-500">
                {t('location_page.no_properties')}
              </p>
            )}
          </section>

          <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">{t('location_page.faq')}</h2>
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
