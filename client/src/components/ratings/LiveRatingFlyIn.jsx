import React, { useEffect, useMemo, useState } from 'react';
import { FaStar, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

const DEFAULT_FREQUENCY_SECONDS = 45;

const RatingStars = ({ stars, label }) => (
  <div className="flex items-center gap-0.5 text-amber-400" aria-label={label}>
    {[1, 2, 3, 4, 5].map((star) => (
      <FaStar
        key={star}
        className={star <= stars ? 'opacity-100' : 'opacity-25'}
        aria-hidden="true"
      />
    ))}
  </div>
);

const LiveRatingFlyIn = ({ disabled = false }) => {
  const { t } = useTranslation();
  const [ratings, setRatings] = useState([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [frequencySeconds, setFrequencySeconds] = useState(DEFAULT_FREQUENCY_SECONDS);

  useEffect(() => {
    let mounted = true;

    const loadRatings = async () => {
      if (disabled) {
        if (mounted) setRatings([]);
        return;
      }

      try {
        const response = await api.get('/platform-ratings/public', {
          params: { limit: 12 },
        });
        if (!mounted) return;
        setRatings(response.data?.data || []);
        setFrequencySeconds(
          Number(response.data?.settings?.flyin_frequency_seconds) || DEFAULT_FREQUENCY_SECONDS
        );
      } catch {
        if (mounted) setRatings([]);
      }
    };

    loadRatings();
    const refreshTimer = window.setInterval(loadRatings, 5 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, [disabled]);

  useEffect(() => {
    if (!ratings.length || disabled) return undefined;

    const showTimer = window.setTimeout(() => setVisible(true), 3500);
    const rotateTimer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % ratings.length);
        setVisible(true);
      }, 550);
    }, Math.max(15, frequencySeconds) * 1000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearInterval(rotateTimer);
    };
  }, [ratings.length, frequencySeconds, disabled]);

  const rating = ratings[index % Math.max(ratings.length, 1)];

  const message = useMemo(() => {
    if (!rating) return '';
    const contextLabel = t(`platform_ratings.contexts.${rating.rating_context}`, {
      defaultValue: rating.context_label,
    });
    return t('platform_ratings.flyin_message', {
      name: rating.display_name,
      stars: rating.stars,
      context: contextLabel,
    });
  }, [rating, t]);

  if (!rating) return null;

  return (
    <aside
      className={`fixed inset-x-3 bottom-3 z-[60] transition-all duration-500 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px] ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-live="polite"
    >
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-bold text-primary-700 ring-1 ring-primary-100">
            {rating.image_url ? (
              <img
                src={rating.image_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              rating.initials
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <RatingStars
                stars={rating.stars}
                label={t('platform_ratings.star_rating', { count: rating.stars })}
              />
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={t('platform_ratings.dismiss_notification')}
              >
                <FaTimes className="text-xs" />
              </button>
            </div>

            <p className="mt-1 text-sm font-medium leading-5 text-slate-800">
              {message}
            </p>

            {rating.location && (
              <p className="mt-1 text-xs text-slate-500">
                {t('platform_ratings.verified_in', { location: rating.location })}
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default LiveRatingFlyIn;
