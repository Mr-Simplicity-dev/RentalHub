import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const isExternalUrl = (url) => /^https?:\/\//i.test(String(url || ''));
const isInternalUrl = (url) => String(url || '').startsWith('/') && !String(url || '').startsWith('//');
const normalizeTargetUrl = (url) => {
  const target = String(url || '').trim();
  if (!target) return '';
  if (isExternalUrl(target) || isInternalUrl(target)) return target;
  return `/${target.replace(/^\/+/, '')}`;
};

const normalizeLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(Math.max(Math.floor(numeric), 1), 10);
};

const AdSpace = ({
  placement,
  className = '',
  limit = 10,
  contained = true,
  variant = 'cards',
}) => {
  const navigate = useNavigate();
  const [ads, setAds] = useState([]);
  const requestLimit = useMemo(() => normalizeLimit(limit), [limit]);
  const isMarquee = variant === 'marquee';

  useEffect(() => {
    let isMounted = true;

    const loadAd = async () => {
      try {
        const response = await api.get('/ads', {
          params: {
            placement,
            limit: requestLimit,
          },
        });

        if (isMounted) {
          setAds(Array.isArray(response.data?.data) ? response.data.data : []);
        }
      } catch {
        if (isMounted) {
          setAds([]);
        }
      }
    };

    loadAd();

    return () => {
      isMounted = false;
    };
  }, [placement, requestLimit]);

  const adIds = useMemo(
    () => ads.map((item) => item.id).filter(Boolean).join(','),
    [ads]
  );

  useEffect(() => {
    if (!adIds) return;

    adIds.split(',').forEach((id) => {
      api.post(`/ads/${id}/impression`).catch(() => {});
    });
  }, [adIds]);

  if (ads.length === 0) return null;

  const hasMultipleAds = ads.length > 1;

  const renderAd = (ad, { duplicate = false } = {}) => {
    const targetUrl = normalizeTargetUrl(ad.target_url);
    const hasTarget = Boolean(targetUrl);
    const external = isExternalUrl(targetUrl);
    const internal = isInternalUrl(targetUrl);
    const adStyle = {
      backgroundColor: ad.background_color || '#ffffff',
      color: ad.text_color || '#111827',
    };

    const handleClick = () => {
      if (ad?.id) {
        api.post(`/ads/${ad.id}/click`).catch(() => {});
      }
    };

    const ctaLabel = hasTarget ? (ad.cta_label || 'Click to open') : '';
    const clickableClass = hasTarget ? 'cursor-pointer' : '';

    const handleActivate = (event) => {
      handleClick();

      if (internal) {
        event.preventDefault();
        navigate(targetUrl);
      }
    };

    const card = (
      <div
        className={`group h-full overflow-hidden rounded-lg border border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${clickableClass}`}
        style={adStyle}
      >
        <div
          className={`flex h-full ${
            isMarquee
              ? 'flex-row items-stretch'
              : `flex-col ${hasMultipleAds ? '' : 'md:flex-row md:items-stretch'}`
          }`}
        >
          {ad.image_url && (
            <div
              className={`w-full shrink-0 overflow-hidden bg-gray-100 ${
                isMarquee
                  ? 'hidden w-32 sm:block md:w-44'
                  : hasMultipleAds
                    ? 'h-40'
                    : 'h-40 md:h-auto md:w-56 lg:w-72'
              }`}
            >
              <img
                src={ad.image_url}
                alt={ad.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          )}

          <div className={`flex flex-1 flex-col justify-center gap-3 ${isMarquee ? 'min-h-[112px] p-4 md:p-5' : 'min-h-[140px] p-5 md:p-6'}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-75">
              <span>Sponsored</span>
              {ad.sponsor_name && (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{ad.sponsor_name}</span>
                </>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold leading-snug md:text-xl">
                {ad.title}
              </h2>
              {ad.description && (
                <p className="mt-1 max-w-3xl text-sm leading-relaxed opacity-80 md:text-base">
                  {ad.description}
                </p>
              )}
            </div>

            {hasTarget && (
              <span className="inline-flex w-fit items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-300 group-hover:bg-primary-700">
                {ctaLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    );

    if (!hasTarget) {
      return card;
    }

    return (
      <a
        href={targetUrl}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer sponsored' : 'sponsored'}
        onClick={handleActivate}
        aria-label={`Sponsored: ${ad.title}`}
        className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        tabIndex={duplicate ? -1 : undefined}
      >
        {card}
      </a>
    );
  };

  const content = isMarquee ? (
    <div
      className="ad-marquee"
      style={{ '--ad-marquee-duration': `${Math.max(22, ads.length * 12)}s` }}
    >
      <div className="ad-marquee-track">
        <div className="ad-marquee-group">
          {ads.map((ad) => (
            <div key={ad.id || `${placement}-${ad.title}`} className="ad-marquee-item">
              {renderAd(ad)}
            </div>
          ))}
        </div>
        <div className="ad-marquee-group" aria-hidden="true">
          {ads.map((ad, index) => (
            <div key={`${ad.id || `${placement}-${ad.title}`}-duplicate-${index}`} className="ad-marquee-item">
              {renderAd(ad, { duplicate: true })}
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div className={hasMultipleAds ? 'grid gap-4 lg:grid-cols-2' : ''}>
      {ads.map((ad) => (
        <div key={ad.id || `${placement}-${ad.title}`} className="min-w-0">
          {renderAd(ad)}
        </div>
      ))}
    </div>
  );

  return (
    <section className={className}>
      {contained ? (
        <div className="container mx-auto px-4">{content}</div>
      ) : (
        content
      )}
    </section>
  );
};

export default AdSpace;
