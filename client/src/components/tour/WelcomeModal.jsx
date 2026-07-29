import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  FaCheck,
  FaClock,
  FaCompass,
  FaTimes,
} from 'react-icons/fa';

const BRAND = {
  navy: '#071A3D',
  navySoft: '#102B5C',
  gold: '#FFC928',
  goldSoft: '#FFE58A',
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
    + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
};

const WelcomeModal = ({
  isOpen,
  onStartTour,
  onSkip,
  isReturningUser = false,
}) => {
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
    }, prefersReducedMotion ? 0 : 180);

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
    : { type: 'spring', stiffness: 280, damping: 27, mass: 0.85 };

  const benefits = [
    'Highlights the real controls on your dashboard',
    'Personalized for your RentalHub account role',
    'Available to replay whenever you need a refresher',
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
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22 }}
        >
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default border-0"
            style={{
              background: 'rgba(3, 12, 30, 0.76)',
              backdropFilter: 'blur(7px)',
            }}
            aria-label="Close guided tour introduction"
            onClick={onSkip}
          />

          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rentalhub-tour-welcome-title"
            aria-describedby="rentalhub-tour-welcome-description"
            tabIndex={-1}
            className="relative my-auto w-full max-w-lg overflow-hidden rounded-[28px] border bg-white shadow-2xl outline-none"
            style={{
              borderColor: 'rgba(255, 201, 40, 0.56)',
              boxShadow: '0 34px 90px rgba(3, 12, 30, 0.42), 0 10px 32px rgba(3, 12, 30, 0.25)',
            }}
            initial={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.94, y: 22 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.97, y: 10 }}
            transition={transition}
          >
            <div
              className="relative overflow-hidden px-6 pb-8 pt-7 text-center sm:px-9 sm:pb-9 sm:pt-8"
              style={{
                background: `linear-gradient(145deg, ${BRAND.navy} 0%, #0B285A 62%, ${BRAND.navySoft} 100%)`,
              }}
            >
              <div
                aria-hidden="true"
                className="absolute -left-20 -top-24 h-64 w-64 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255, 201, 40, 0.2), transparent 68%)',
                }}
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(56, 189, 248, 0.16), transparent 68%)',
                }}
              />

              <button
                type="button"
                onClick={onSkip}
                aria-label="Skip the guided tour"
                className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  '--tw-ring-color': BRAND.gold,
                  '--tw-ring-offset-color': BRAND.navy,
                }}
              >
                <FaTimes size={16} aria-hidden="true" />
              </button>

              <div
                className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border p-2.5"
                style={{
                  borderColor: 'rgba(255, 229, 138, 0.72)',
                  background: 'linear-gradient(145deg, rgba(255, 229, 138, 0.96), rgba(255, 201, 40, 0.76))',
                  boxShadow: '0 16px 36px rgba(255, 201, 40, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
                }}
              >
                <img
                  src="/rentalhub-mark.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full rounded-[16px] object-contain"
                />
              </div>

              <p
                className="relative mb-2 text-[11px] font-extrabold uppercase tracking-[0.22em]"
                style={{ color: BRAND.goldSoft }}
              >
                Your personal dashboard guide
              </p>
              <h1
                id="rentalhub-tour-welcome-title"
                className="relative text-2xl font-black leading-tight text-white sm:text-3xl"
              >
                {isReturningUser ? 'Welcome back to RentalHub' : 'Welcome to RentalHub NG'}
              </h1>
              <p
                id="rentalhub-tour-welcome-description"
                className="relative mx-auto mt-3 max-w-md text-sm leading-6 text-slate-200 sm:text-[15px]"
              >
                {isReturningUser
                  ? 'Take a quick refresher and rediscover the controls that matter most for your account.'
                  : 'Let us show you the most useful controls for your account with a short, focused walkthrough.'}
              </p>
            </div>

            <div className="max-h-[48vh] overflow-y-auto px-6 py-6 sm:px-9 sm:py-7">
              <div className="space-y-3">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                  >
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: BRAND.gold, color: BRAND.navy }}
                    >
                      <FaCheck size={10} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium leading-6 text-slate-700">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onSkip}
                  className="order-2 inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 sm:order-1"
                  style={{ '--tw-ring-color': BRAND.navySoft }}
                >
                  Maybe later
                </button>
                <button
                  ref={startButtonRef}
                  type="button"
                  onClick={onStartTour}
                  className="order-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:order-2"
                  style={{
                    color: BRAND.navy,
                    background: `linear-gradient(135deg, ${BRAND.goldSoft}, ${BRAND.gold})`,
                    boxShadow: '0 10px 24px rgba(255, 201, 40, 0.24)',
                    '--tw-ring-color': BRAND.gold,
                  }}
                >
                  <FaCompass size={14} aria-hidden="true" />
                  Start guided tour
                </button>
              </div>

              <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                <FaClock size={12} aria-hidden="true" />
                About 2 minutes · you remain in control
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
