import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FaArrowRight, FaCheck, FaTimes } from 'react-icons/fa';

const BRAND = {
  navy: '#071A3D',
  navyHover: '#0C244E',
  gold: '#C89B3C',
  goldSoft: '#E2C275',
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
        + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
};

const WelcomeModal = ({
  isOpen,
  onStartTour,
  onSkip,
  isReturningUser = false,
  canResume = false,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const dialogRef = useRef(null);
  const startButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      startButtonRef.current?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 120);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onSkip, prefersReducedMotion]);

  if (typeof document === 'undefined') return null;

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] };

  const benefits = [
    t('tour.welcome.benefit_controls', 'Highlights the real controls on your dashboard'),
    t('tour.welcome.benefit_role', 'Tailored to your Amana RentalHub account role'),
    t('tour.welcome.benefit_replay', 'Available to replay anytime from your profile or settings'),
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="rentalhub-tour-welcome"
          className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
          style={{ zIndex: 2147483000 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18 }}
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default border-0"
            style={{
              background: 'rgba(7, 20, 46, 0.64)',
              backdropFilter: 'blur(3px)',
            }}
            aria-label={t('tour.welcome.close_intro', 'Close guided tour introduction')}
            onClick={onSkip}
          />

          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rentalhub-tour-welcome-title"
            aria-describedby="rentalhub-tour-welcome-description"
            tabIndex={-1}
            className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none"
            style={{
              boxShadow: '0 24px 60px rgba(7, 20, 46, 0.32)',
            }}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={transition}
          >
            {/* Corporate Navy Header */}
            <div
              className="relative px-6 pb-5 pt-6 text-white"
              style={{
                backgroundColor: BRAND.navy,
                borderBottom: `2px solid ${BRAND.gold}`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/rentalhub-mark.svg"
                    alt="Amana RentalHub NG"
                    className="h-9 w-9 shrink-0 rounded-lg border border-white/15 bg-white/5 p-0.5"
                  />
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: BRAND.goldSoft }}
                  >
                    {t('tour.welcome.eyebrow', 'Dashboard orientation')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onSkip}
                  aria-label={t('tour.welcome.skip_label', 'Skip the guided tour')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C89B3C]"
                >
                  <FaTimes size={13} aria-hidden="true" />
                </button>
              </div>

              <h2
                id="rentalhub-tour-welcome-title"
                className="mt-4 text-xl font-semibold leading-snug tracking-tight text-white"
              >
                {canResume
                  ? t('tour.welcome.resume_title', 'Continue your dashboard guide')
                  : isReturningUser
                    ? t('tour.welcome.returning_title', 'Welcome back to Amana RentalHub')
                    : t('tour.welcome.new_title', 'Welcome to Amana RentalHub NG')}
              </h2>

              <p
                id="rentalhub-tour-welcome-description"
                className="mt-2 text-sm leading-6 text-slate-300"
              >
                {canResume
                  ? t(
                      'tour.welcome.resume_description',
                      'Your progress is saved. Resume from your last step or restart anytime from settings.',
                    )
                  : isReturningUser
                    ? t(
                        'tour.welcome.returning_description',
                        'Take a brief refresher on the primary controls available for your account.',
                      )
                    : t(
                        'tour.welcome.new_description',
                        'Review the key controls and workflows available on your dashboard in a short guided walkthrough.',
                      )}
              </p>
            </div>

            {/* Clean Neutral Content Body */}
            <div className="bg-white px-6 py-5">
              <ul className="space-y-2.5">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700"
                  >
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] text-white"
                      style={{ backgroundColor: BRAND.navy }}
                      aria-hidden="true"
                    >
                      <FaCheck />
                    </span>
                    <span className="leading-5">{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={onSkip}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {t('tour.welcome.maybe_later', 'Maybe later')}
                </button>

                <button
                  ref={startButtonRef}
                  type="button"
                  onClick={onStartTour}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:ring-offset-2"
                  style={{ backgroundColor: BRAND.navy }}
                >
                  <span>
                    {canResume
                      ? t('tour.welcome.resume_button', 'Resume guided tour')
                      : t('tour.welcome.start_button', 'Start guided tour')}
                  </span>
                  <FaArrowRight size={12} aria-hidden="true" />
                </button>
              </div>

              <p className="mt-3.5 text-center text-xs text-slate-500">
                {t('tour.welcome.duration', 'Takes under 2 minutes · pause or skip anytime')}
              </p>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default WelcomeModal;
