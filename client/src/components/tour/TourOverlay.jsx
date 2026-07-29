import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  FaChevronLeft,
  FaChevronRight,
  FaMapMarkerAlt,
  FaRedo,
  FaTimes,
} from 'react-icons/fa';

const BRAND = {
  navy: '#071A3D',
  navySoft: '#102B5C',
  gold: '#FFC928',
  goldSoft: '#FFE58A',
};

const HIGHLIGHT_PADDING = 10;
const TOOLTIP_GAP = 18;
const TOOLTIP_MAX_WIDTH = 384;
const VIEWPORT_MARGIN = 12;
const DEFAULT_TOOLTIP_HEIGHT = 300;
const DEFAULT_TARGET_WAIT_MS = 4500;
const POSITION_UPDATE_DELAY_MS = 80;
const LAYER_BASE = 2147483000;

const clamp = (value, min, max) => {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

const getViewport = () => {
  const visualViewport = window.visualViewport;
  const left = visualViewport?.offsetLeft || 0;
  const top = visualViewport?.offsetTop || 0;
  const width = visualViewport?.width || window.innerWidth;
  const height = visualViewport?.height || window.innerHeight;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
};

const isUsableTarget = (element) => {
  if (!element || !element.isConnected) return false;

  const style = window.getComputedStyle(element);
  if (
    style.display === 'none'
    || style.visibility === 'hidden'
    || Number(style.opacity) === 0
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
};

const resolveTarget = (target) => {
  if (!target) return null;

  if (typeof target === 'function') {
    try {
      const result = target();
      return isUsableTarget(result) ? result : null;
    } catch {
      return null;
    }
  }

  if (typeof Element !== 'undefined' && target instanceof Element) {
    return isUsableTarget(target) ? target : null;
  }

  const selectors = Array.isArray(target) ? target : [target];
  for (const selector of selectors) {
    if (typeof selector !== 'string' || !selector.trim()) continue;

    try {
      const matches = document.querySelectorAll(selector);
      const visibleMatch = Array.from(matches).find(isUsableTarget);
      if (visibleMatch) return visibleMatch;
    } catch {
      // Invalid selectors are treated like unavailable targets so the tour can recover.
    }
  }

  return null;
};

const getPaddedTargetBox = (element, viewport) => {
  const rect = element.getBoundingClientRect();
  const left = clamp(
    rect.left - HIGHLIGHT_PADDING,
    viewport.left + 6,
    viewport.right - 8,
  );
  const top = clamp(
    rect.top - HIGHLIGHT_PADDING,
    viewport.top + 6,
    viewport.bottom - 8,
  );
  const right = clamp(
    rect.right + HIGHLIGHT_PADDING,
    left + 2,
    viewport.right - 6,
  );
  const bottom = clamp(
    rect.bottom + HIGHLIGHT_PADDING,
    top + 2,
    viewport.bottom - 6,
  );

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    radius: clamp(parseFloat(window.getComputedStyle(element).borderRadius) || 12, 10, 28),
    viewport,
  };
};

const getIntersectionArea = (first, second) => {
  const width = Math.max(
    0,
    Math.min(first.left + first.width, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.top + first.height, second.bottom) - Math.max(first.top, second.top),
  );
  return width * height;
};

const getPlacementOrder = (preferred, isCompact) => {
  const compactOrder = ['bottom', 'top', 'right', 'left'];
  const desktopOrder = [preferred, 'bottom', 'right', 'left', 'top'];
  const base = isCompact && !['top', 'bottom'].includes(preferred)
    ? compactOrder
    : [preferred, ...(isCompact ? compactOrder : desktopOrder)];

  return [...new Set(base.filter((placement) => (
    ['top', 'bottom', 'left', 'right'].includes(placement)
  )))];
};

const calculateTooltipPosition = ({
  targetBox,
  preferredPlacement,
  measuredHeight,
  viewport,
}) => {
  const width = Math.min(TOOLTIP_MAX_WIDTH, viewport.width - (VIEWPORT_MARGIN * 2));
  const height = Math.min(
    measuredHeight || DEFAULT_TOOLTIP_HEIGHT,
    viewport.height - (VIEWPORT_MARGIN * 2),
  );
  const isCompact = viewport.width < 680;
  const placements = getPlacementOrder(preferredPlacement || 'bottom', isCompact);

  const candidates = placements.map((placement, priority) => {
    let left = targetBox.left + ((targetBox.width - width) / 2);
    let top = targetBox.bottom + TOOLTIP_GAP;

    if (placement === 'top') {
      top = targetBox.top - TOOLTIP_GAP - height;
    } else if (placement === 'left') {
      left = targetBox.left - TOOLTIP_GAP - width;
      top = targetBox.top + ((targetBox.height - height) / 2);
    } else if (placement === 'right') {
      left = targetBox.right + TOOLTIP_GAP;
      top = targetBox.top + ((targetBox.height - height) / 2);
    }

    const overflow =
      Math.max(0, viewport.left + VIEWPORT_MARGIN - left)
      + Math.max(0, (left + width) - (viewport.right - VIEWPORT_MARGIN))
      + Math.max(0, viewport.top + VIEWPORT_MARGIN - top)
      + Math.max(0, (top + height) - (viewport.bottom - VIEWPORT_MARGIN));

    const constrainedLeft = clamp(
      left,
      viewport.left + VIEWPORT_MARGIN,
      viewport.right - VIEWPORT_MARGIN - width,
    );
    const constrainedTop = clamp(
      top,
      viewport.top + VIEWPORT_MARGIN,
      viewport.bottom - VIEWPORT_MARGIN - height,
    );
    const tooltipBox = {
      left: constrainedLeft,
      top: constrainedTop,
      width,
      height,
    };
    const overlap = getIntersectionArea(tooltipBox, targetBox);

    const availableHeight = placement === 'bottom'
      ? viewport.bottom - targetBox.bottom - TOOLTIP_GAP - VIEWPORT_MARGIN
      : placement === 'top'
        ? targetBox.top - viewport.top - TOOLTIP_GAP - VIEWPORT_MARGIN
        : viewport.height - (VIEWPORT_MARGIN * 2);
    const heightShortfall = Math.max(0, height - availableHeight);

    return {
      placement,
      left: constrainedLeft,
      top: constrainedTop,
      width,
      height,
      availableHeight,
      score: (overflow * 120) + (overlap * 12) + (heightShortfall * 10) + priority,
    };
  });

  const best = candidates.sort((first, second) => first.score - second.score)[0];
  const maxHeight = clamp(
    best.availableHeight,
    Math.min(148, viewport.height - (VIEWPORT_MARGIN * 2)),
    viewport.height - (VIEWPORT_MARGIN * 2),
  );
  const arrowOffset = ['top', 'bottom'].includes(best.placement)
    ? clamp(
      (targetBox.left + (targetBox.width / 2)) - best.left,
      28,
      best.width - 28,
    )
    : clamp(
      (targetBox.top + (targetBox.height / 2)) - best.top,
      28,
      Math.min(best.height, maxHeight) - 28,
    );

  return {
    ...best,
    maxHeight,
    arrowOffset,
    isCompact,
  };
};

const getFallbackPosition = (measuredHeight) => {
  const viewport = getViewport();
  const width = Math.min(TOOLTIP_MAX_WIDTH, viewport.width - (VIEWPORT_MARGIN * 2));
  const height = Math.min(
    measuredHeight || DEFAULT_TOOLTIP_HEIGHT,
    viewport.height - (VIEWPORT_MARGIN * 2),
  );

  return {
    left: viewport.left + ((viewport.width - width) / 2),
    top: viewport.top + ((viewport.height - height) / 2),
    width,
    height,
    maxHeight: viewport.height - (VIEWPORT_MARGIN * 2),
    placement: 'center',
    arrowOffset: 0,
    isCompact: viewport.width < 680,
  };
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
    + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
};

const Backdrop = ({ box }) => {
  const backdropStyle = {
    position: 'fixed',
    background: 'rgba(3, 12, 30, 0.76)',
    backdropFilter: 'blur(1.5px)',
    pointerEvents: 'auto',
  };

  if (!box) {
    return (
      <div
        aria-hidden="true"
        style={{
          ...backdropStyle,
          inset: 0,
        }}
      />
    );
  }

  const { viewport } = box;
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          ...backdropStyle,
          top: viewport.top,
          left: viewport.left,
          width: viewport.width,
          height: Math.max(0, box.top - viewport.top),
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...backdropStyle,
          top: box.bottom,
          left: viewport.left,
          width: viewport.width,
          height: Math.max(0, viewport.bottom - box.bottom),
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...backdropStyle,
          top: box.top,
          left: viewport.left,
          width: Math.max(0, box.left - viewport.left),
          height: box.height,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...backdropStyle,
          top: box.top,
          left: box.right,
          width: Math.max(0, viewport.right - box.right),
          height: box.height,
        }}
      />
    </>
  );
};

const TooltipArrow = ({ position }) => {
  if (!position || position.placement === 'center') return null;

  const style = {
    position: 'absolute',
    width: 16,
    height: 16,
    zIndex: -1,
    transform: 'rotate(45deg)',
    background: BRAND.navy,
    border: `1px solid ${BRAND.gold}`,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  };

  if (position.placement === 'bottom') {
    style.top = -7;
    style.left = position.arrowOffset - 8;
  } else if (position.placement === 'top') {
    style.bottom = -7;
    style.left = position.arrowOffset - 8;
  } else if (position.placement === 'right') {
    style.left = -7;
    style.top = position.arrowOffset - 8;
  } else {
    style.right = -7;
    style.top = position.arrowOffset - 8;
  }

  return <span aria-hidden="true" style={style} />;
};

const TourOverlay = ({
  isOpen,
  steps = [],
  currentStep = 0,
  onNext,
  onPrevious,
  onSkip,
  dashboardTitle = 'Dashboard',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [highlightBox, setHighlightBox] = useState(null);
  const [targetStatus, setTargetStatus] = useState('searching');
  const [retryToken, setRetryToken] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState(() => (
    typeof window === 'undefined'
      ? {
        left: 12,
        top: 12,
        width: TOOLTIP_MAX_WIDTH,
        maxHeight: DEFAULT_TOOLTIP_HEIGHT,
        placement: 'center',
      }
      : getFallbackPosition(DEFAULT_TOOLTIP_HEIGHT)
  ));
  const targetRef = useRef(null);
  const tooltipRef = useRef(null);
  const previousFocusRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const titleId = useMemo(
    () => `rentalhub-tour-title-${step?.id || currentStep}`,
    [currentStep, step?.id],
  );
  const descriptionId = useMemo(
    () => `rentalhub-tour-description-${step?.id || currentStep}`,
    [currentStep, step?.id],
  );

  const updatePosition = useCallback((target = targetRef.current) => {
    if (!isOpen || typeof window === 'undefined') return;

    const measuredHeight = tooltipRef.current?.getBoundingClientRect().height
      || DEFAULT_TOOLTIP_HEIGHT;
    const viewport = getViewport();

    if (!target || !isUsableTarget(target)) {
      setHighlightBox(null);
      setTooltipPosition(getFallbackPosition(measuredHeight));
      return;
    }

    const targetBox = getPaddedTargetBox(target, viewport);
    setHighlightBox(targetBox);
    setTooltipPosition(calculateTooltipPosition({
      targetBox,
      preferredPlacement: step?.placement,
      measuredHeight,
      viewport,
    }));
  }, [isOpen, step?.placement]);

  useEffect(() => {
    if (!isOpen || !step || typeof window === 'undefined') return undefined;

    let cancelled = false;
    let animationFrame = null;
    let missingTimer = null;
    let mutationObserver = null;
    let pollTimer = null;
    let missingSince = Date.now();
    const delayedUpdates = [];
    const waitMs = Number(step.targetWaitMs) > 0
      ? Number(step.targetWaitMs)
      : DEFAULT_TARGET_WAIT_MS;

    targetRef.current = null;
    setHighlightBox(null);
    setTargetStatus('searching');

    const schedulePositionUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updatePosition();
      });
    };

    const watchTargetSize = (target) => {
      resizeObserverRef.current?.disconnect();
      if (typeof ResizeObserver === 'undefined') return;

      resizeObserverRef.current = new ResizeObserver(schedulePositionUpdate);
      resizeObserverRef.current.observe(target);
    };

    const activateTarget = (target) => {
      if (cancelled || !target) return;

      const isNewTarget = targetRef.current !== target;
      targetRef.current = target;
      missingSince = null;
      setTargetStatus('found');

      if (isNewTarget) {
        watchTargetSize(target);
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: window.innerWidth < 680 ? 'center' : 'nearest',
          inline: 'nearest',
        });
      }

      schedulePositionUpdate();
      delayedUpdates.push(window.setTimeout(schedulePositionUpdate, POSITION_UPDATE_DELAY_MS));
      delayedUpdates.push(window.setTimeout(
        schedulePositionUpdate,
        prefersReducedMotion ? 120 : 420,
      ));
    };

    const seekTarget = () => {
      const target = resolveTarget(step.target);
      if (target) {
        activateTarget(target);
        return true;
      }

      if (targetRef.current) {
        targetRef.current = null;
        resizeObserverRef.current?.disconnect();
        setHighlightBox(null);
      }

      if (missingSince === null) missingSince = Date.now();
      setTargetStatus(Date.now() - missingSince >= waitMs ? 'missing' : 'searching');
      return false;
    };

    if (!seekTarget()) {
      updatePosition(null);
    }

    pollTimer = window.setInterval(seekTarget, 240);
    missingTimer = window.setTimeout(() => {
      if (!cancelled && !resolveTarget(step.target)) {
        targetRef.current = null;
        setHighlightBox(null);
        setTargetStatus('missing');
        updatePosition(null);
      }
    }, waitMs);

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(seekTarget);
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      });
    }

    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('orientationchange', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('scroll', schedulePositionUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(missingTimer);
      delayedUpdates.forEach(window.clearTimeout);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      mutationObserver?.disconnect();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('orientationchange', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('scroll', schedulePositionUpdate);
    };
  }, [
    currentStep,
    isOpen,
    prefersReducedMotion,
    retryToken,
    step,
    updatePosition,
  ]);

  useEffect(() => {
    if (!isOpen || !tooltipRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const tooltipResizeObserver = new ResizeObserver(() => updatePosition());
    tooltipResizeObserver.observe(tooltipRef.current);
    return () => tooltipResizeObserver.disconnect();
  }, [isOpen, targetStatus, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    previousFocusRef.current = document.activeElement;
    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !step || typeof document === 'undefined') return undefined;

    const focusTimer = window.setTimeout(() => {
      tooltipRef.current?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : 160);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onSkip();
        return;
      }

      if (event.key === 'ArrowRight' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        onNext();
        return;
      }

      if (
        event.key === 'ArrowLeft'
        && currentStep > 0
        && !event.altKey
        && !event.ctrlKey
        && !event.metaKey
      ) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(tooltipRef.current);
      if (!focusable.length) {
        event.preventDefault();
        tooltipRef.current?.focus({ preventScroll: true });
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
    };
  }, [
    currentStep,
    isOpen,
    onNext,
    onPrevious,
    onSkip,
    prefersReducedMotion,
    step,
  ]);

  if (typeof document === 'undefined') return null;

  const progress = steps.length ? ((currentStep + 1) / steps.length) * 100 : 0;
  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] };
  const targetIsUnavailable = targetStatus !== 'found';

  return createPortal(
    <AnimatePresence>
      {isOpen && step && (
        <motion.div
          key="rentalhub-web-tour"
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: LAYER_BASE }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          data-testid="rentalhub-tour-overlay"
        >
          <Backdrop box={highlightBox} />

          {highlightBox && (
            <motion.div
              key={`highlight-${step.id || currentStep}`}
              aria-hidden="true"
              className="fixed pointer-events-auto"
              style={{
                top: highlightBox.top,
                left: highlightBox.left,
                width: highlightBox.width,
                height: highlightBox.height,
                borderRadius: highlightBox.radius,
                border: `3px solid ${BRAND.gold}`,
                background: 'rgba(255, 201, 40, 0.035)',
                boxShadow: '0 0 0 3px rgba(255, 201, 40, 0.18), 0 0 34px rgba(255, 201, 40, 0.62)',
                zIndex: LAYER_BASE + 1,
              }}
              initial={{ opacity: 0 }}
              animate={prefersReducedMotion
                ? { opacity: 1 }
                : {
                  opacity: 1,
                  boxShadow: [
                    '0 0 0 3px rgba(255, 201, 40, 0.16), 0 0 22px rgba(255, 201, 40, 0.42)',
                    '0 0 0 6px rgba(255, 201, 40, 0.08), 0 0 38px rgba(255, 201, 40, 0.7)',
                    '0 0 0 3px rgba(255, 201, 40, 0.16), 0 0 22px rgba(255, 201, 40, 0.42)',
                  ],
                }}
              transition={prefersReducedMotion
                ? { duration: 0 }
                : {
                  opacity: { duration: 0.2 },
                  boxShadow: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
                }}
            />
          )}

          <motion.div
            key={`tooltip-${step.id || currentStep}-${targetStatus}`}
            ref={tooltipRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            aria-label={`${dashboardTitle} guided tour`}
            tabIndex={-1}
            className="fixed pointer-events-auto outline-none"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              width: tooltipPosition.width,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
              zIndex: LAYER_BASE + 2,
            }}
            initial={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.97, y: 5 }}
            transition={transition}
          >
            <TooltipArrow position={tooltipPosition} />

            <div
              className="flex flex-col overflow-hidden rounded-[22px] border shadow-2xl"
              style={{
                maxHeight: tooltipPosition.maxHeight,
                borderColor: 'rgba(255, 201, 40, 0.72)',
                background: `linear-gradient(155deg, ${BRAND.navy} 0%, #0A2452 58%, ${BRAND.navySoft} 100%)`,
                boxShadow: '0 24px 70px rgba(3, 12, 30, 0.42), 0 8px 28px rgba(3, 12, 30, 0.3)',
              }}
            >
              <div className="relative shrink-0 overflow-hidden px-5 pb-4 pt-5 sm:px-6">
                <div
                  aria-hidden="true"
                  className="absolute -right-16 -top-20 h-44 w-44 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(255, 201, 40, 0.2), transparent 67%)',
                  }}
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: BRAND.goldSoft }}
                    >
                      RentalHub guided tour
                    </p>
                    <h2
                      id={titleId}
                      className="pr-2 text-xl font-extrabold leading-tight text-white"
                    >
                      {step.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onSkip}
                    aria-label="Close and skip the guided tour"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{ '--tw-ring-color': BRAND.gold, '--tw-ring-offset-color': BRAND.navy }}
                  >
                    <FaTimes size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
                <p
                  id={descriptionId}
                  className="text-sm leading-6 text-slate-200"
                >
                  {step.description}
                </p>

                {targetStatus === 'searching' && (
                  <div
                    className="mt-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs"
                    style={{
                      borderColor: 'rgba(255, 201, 40, 0.28)',
                      background: 'rgba(255, 201, 40, 0.08)',
                      color: BRAND.goldSoft,
                    }}
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className={prefersReducedMotion ? '' : 'animate-spin'}
                      aria-hidden="true"
                    >
                      <FaMapMarkerAlt />
                    </span>
                    Finding this control on the dashboard…
                  </div>
                )}

                {targetStatus === 'missing' && (
                  <div
                    className="mt-4 rounded-xl border p-3"
                    style={{
                      borderColor: 'rgba(255, 201, 40, 0.32)',
                      background: 'rgba(255, 255, 255, 0.075)',
                    }}
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-sm font-semibold text-white">
                      This dashboard section is not available yet.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      It may still be loading or unavailable for this account. Retry, or continue
                      without interrupting the tour.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRetryToken((value) => value + 1)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': BRAND.gold }}
                      >
                        <FaRedo size={11} aria-hidden="true" />
                        Retry target
                      </button>
                      <button
                        type="button"
                        onClick={onNext}
                        className="rounded-lg px-3 py-2 text-xs font-bold transition-colors hover:bg-white/10 focus:outline-none focus:ring-2"
                        style={{ color: BRAND.goldSoft, '--tw-ring-color': BRAND.gold }}
                      >
                        {isLastStep ? 'Finish tour' : 'Skip this step'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold">
                    <span className="uppercase tracking-[0.16em]" style={{ color: BRAND.goldSoft }}>
                      Step {currentStep + 1} of {steps.length}
                    </span>
                    <span className="text-slate-300">{Math.round(progress)}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ background: 'rgba(255, 255, 255, 0.14)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${BRAND.gold}, ${BRAND.goldSoft})`,
                        boxShadow: '0 0 12px rgba(255, 201, 40, 0.65)',
                      }}
                      initial={false}
                      animate={{ width: `${progress}%` }}
                      transition={prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 0.35, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={onPrevious}
                    disabled={currentStep === 0}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-35"
                    style={{ '--tw-ring-color': BRAND.gold }}
                  >
                    <FaChevronLeft size={12} aria-hidden="true" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{
                      color: BRAND.navy,
                      background: `linear-gradient(135deg, ${BRAND.goldSoft}, ${BRAND.gold})`,
                      boxShadow: '0 8px 22px rgba(255, 201, 40, 0.24)',
                      '--tw-ring-color': BRAND.goldSoft,
                      '--tw-ring-offset-color': BRAND.navy,
                    }}
                  >
                    {isLastStep ? 'Finish' : 'Next'}
                    {!isLastStep && <FaChevronRight size={12} aria-hidden="true" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onSkip}
                  className="mt-3 w-full rounded-lg py-2 text-xs font-semibold text-slate-300 transition-colors hover:text-white focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': BRAND.gold }}
                >
                  Skip the complete tour
                </button>

                {targetIsUnavailable && (
                  <span className="sr-only" aria-live="polite">
                    {targetStatus === 'searching'
                      ? 'Searching for the dashboard control.'
                      : 'The dashboard control is currently unavailable.'}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default TourOverlay;
