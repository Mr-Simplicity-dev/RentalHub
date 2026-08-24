import React, { useEffect, useMemo, useState } from 'react';
import { FaRegStar, FaStar, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

const DISMISS_MS = 24 * 60 * 60 * 1000;
const PROMPT_ROLES = new Set(['tenant', 'landlord', 'agent']);
const HIDDEN_PATH_PREFIXES = ['/admin', '/super-admin', '/lawyer', '/login', '/register'];

const getDismissKey = (opportunityId) => `rentalhub_rating_prompt_dismissed_${opportunityId}`;

const wasRecentlyDismissed = (opportunityId) => {
  if (!opportunityId || typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(getDismissKey(opportunityId));
  const timestamp = Number(raw || 0);
  return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_MS;
};

const dismissOpportunity = (opportunityId) => {
  if (!opportunityId || typeof window === 'undefined') return;
  window.localStorage.setItem(getDismissKey(opportunityId), String(Date.now()));
};

const StarPicker = ({ value, onChange, t }) => (
  <div className="flex items-center justify-center gap-1 sm:justify-start">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(star)}
        className="rounded-full p-1 text-2xl text-amber-400 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label={t('platform_ratings.rate_stars', { count: star })}
      >
        {star <= value ? <FaStar /> : <FaRegStar />}
      </button>
    ))}
  </div>
);

const PlatformRatingPrompt = ({ disabled = false }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [opportunities, setOpportunities] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [displayNameMode, setDisplayNameMode] = useState('first_name');
  const [allowPublicImage, setAllowPublicImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isHiddenPath = useMemo(
    () => HIDDEN_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix)),
    [location.pathname]
  );

  useEffect(() => {
    let mounted = true;

    const loadOpportunities = async () => {
      if (
        disabled ||
        isHiddenPath ||
        !isAuthenticated ||
        !PROMPT_ROLES.has(String(user?.user_type || '').toLowerCase())
      ) {
        if (mounted) setOpportunities([]);
        return;
      }

      try {
        const response = await api.get('/platform-ratings/opportunities');
        const next = (response.data?.data || []).filter(
          (item) => !wasRecentlyDismissed(item.opportunity_id)
        );
        if (mounted) {
          setOpportunities(next);
          setActiveIndex(0);
        }
      } catch {
        if (mounted) setOpportunities([]);
      }
    };

    loadOpportunities();

    return () => {
      mounted = false;
    };
  }, [disabled, isAuthenticated, isHiddenPath, user?.user_type, location.pathname]);

  const opportunity = opportunities[activeIndex];

  useEffect(() => {
    setStars(0);
    setComment('');
    setDisplayNameMode('first_name');
    setAllowPublicImage(false);
  }, [opportunity?.opportunity_id]);

  if (!opportunity) return null;

  const translatedTitle = t(`platform_ratings.prompt_titles.${opportunity.rating_context}`, {
    defaultValue: opportunity.title,
  });
  const translatedDetail = t(`platform_ratings.prompt_details.${opportunity.rating_context}`, {
    source: opportunity.source_title || t('platform_ratings.this_service'),
    defaultValue: opportunity.detail,
  });

  const closePrompt = () => {
    dismissOpportunity(opportunity.opportunity_id);
    setOpportunities((prev) => prev.filter((item) => item.opportunity_id !== opportunity.opportunity_id));
    setActiveIndex(0);
  };

  const submitRating = async (event) => {
    event.preventDefault();
    if (!stars) {
      toast.error(t('platform_ratings.choose_stars'));
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/platform-ratings', {
        rating_context: opportunity.rating_context,
        source_type: opportunity.source_type,
        source_ref: opportunity.source_ref,
        stars,
        comment,
        display_name_mode: displayNameMode,
        allow_public_image: allowPublicImage,
      });
      toast.success(t('platform_ratings.submitted'));
      closePrompt();
    } catch (error) {
      toast.error(error.response?.data?.message || t('platform_ratings.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-3 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[420px] sm:px-0 sm:pb-0">
      <form
        onSubmit={submitRating}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">
              {t('platform_ratings.verified_experience')}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">
              {translatedTitle}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {translatedDetail}
            </p>
          </div>
          <button
            type="button"
            onClick={closePrompt}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('platform_ratings.close_prompt')}
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <StarPicker value={stars} onChange={setStars} t={t} />

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="min-h-[82px] w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            maxLength={800}
            placeholder={t('platform_ratings.optional_note')}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              {t('platform_ratings.public_name')}
              <select
                value={displayNameMode}
                onChange={(event) => setDisplayNameMode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              >
                <option value="first_name">{t('platform_ratings.first_name_only')}</option>
                <option value="initials">{t('platform_ratings.initials_only')}</option>
                <option value="role_location">{t('platform_ratings.role_location')}</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={allowPublicImage}
                onChange={(event) => setAllowPublicImage(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              {t('platform_ratings.allow_image')}
            </label>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {t('platform_ratings.privacy_note')}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={closePrompt}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {t('platform_ratings.skip')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? t('platform_ratings.submitting') : t('platform_ratings.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PlatformRatingPrompt;
