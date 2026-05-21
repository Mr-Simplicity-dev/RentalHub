import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCopy,
  FaFacebookF,
  FaShareAlt,
  FaTelegramPlane,
  FaWhatsapp,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
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

const copyTextToClipboard = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const getShareUrl = (targetUrl) => {
  if (typeof window === 'undefined') return targetUrl || '';
  if (isExternalUrl(targetUrl)) return targetUrl;
  if (isInternalUrl(targetUrl)) return `${window.location.origin}${targetUrl}`;
  return window.location.href;
};

const AdShareButton = ({ ad, targetUrl }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const shareUrl = useMemo(() => getShareUrl(targetUrl), [targetUrl]);
  const canUseNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareTitle = ad?.title || t('ads.default_share_title');
  const shareText = ad?.description
    ? `${t('ads.share_text', { title: shareTitle })} ${ad.description}`
    : t('ads.share_text', { title: shareTitle });

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  const shouldUseNativeShareFirst = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare) return false;

    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      setOpen(false);
      return true;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        toast.error(t('ads.share_failed'));
        return false;
      }
      return true;
    }
  };

  const handlePrimaryShare = async () => {
    if (canUseNativeShare && shouldUseNativeShareFirst()) {
      const handled = await handleNativeShare();
      if (handled) return;
    }

    setOpen((prev) => !prev);
  };

  const handleCopyLink = async () => {
    try {
      await copyTextToClipboard(shareUrl);
      toast.success(t('ads.link_copied'));
      setOpen(false);
    } catch {
      toast.error(t('ads.copy_failed'));
    }
  };

  const shareTargets = [
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
      icon: <FaWhatsapp className="text-green-600" />,
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      icon: <FaFacebookF className="text-blue-600" />,
    },
    {
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      icon: <FaTelegramPlane className="text-sky-500" />,
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      icon: <span className="font-semibold text-gray-900">X</span>,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-3 top-3 z-10"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={handlePrimaryShare}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-md ring-1 ring-black/5 transition hover:bg-white hover:text-primary-700 sm:h-9 sm:w-9"
        aria-label={t('ads.share_ad')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FaShareAlt className="text-sm" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-2 text-gray-700 shadow-xl sm:top-11">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('ads.share_ad')}
          </div>

          {canUseNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-gray-50 sm:py-2"
            >
              <FaShareAlt className="text-gray-600" />
              {t('ads.share_device')}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition hover:bg-gray-50 sm:py-2"
          >
            <FaCopy className="text-gray-600" />
            {t('ads.copy_link')}
          </button>

          {shareTargets.map((target) => (
            <a
              key={target.label}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-gray-50 sm:py-2"
            >
              {target.icon}
              {t('ads.share_on', { platform: target.label })}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const AdSpace = ({
  placement,
  className = '',
  limit = 10,
  contained = true,
  variant = 'cards',
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

    const ctaLabel = hasTarget ? (ad.cta_label || t('ads.default_cta')) : '';
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
              <span>{t('ads.sponsored')}</span>
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

    const linkedCard = hasTarget ? (
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
    ) : card;

    if (!ad.sharing_enabled || duplicate) {
      return linkedCard;
    }

    return (
      <div className="relative h-full">
        {linkedCard}
        <AdShareButton ad={ad} targetUrl={targetUrl} />
      </div>
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
