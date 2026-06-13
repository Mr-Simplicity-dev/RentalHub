import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

const HIGHLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const DESKTOP_TOOLTIP_WIDTH = 360;
const MOBILE_BREAKPOINT = 640;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const TourOverlay = ({ 
  isOpen, 
  steps = [], 
  currentStep = 0, 
  onNext, 
  onPrevious, 
  onSkip,
  dashboardTitle = 'Dashboard' 
}) => {
  const [highlightBox, setHighlightBox] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    placement: 'bottom',
    isMobile: false,
  });

  const step = steps[currentStep];

  const updatePosition = useCallback(() => {
    if (!step || !isOpen) return;

    const element = document.querySelector(step.target);
    if (!element) {
      setHighlightBox(null);
      setTooltipPosition({
        top: window.innerHeight - 24,
        left: window.innerWidth / 2,
        placement: 'bottom',
        isMobile: window.innerWidth < MOBILE_BREAKPOINT,
      });
      return;
    }

    const rect = element.getBoundingClientRect();
    const paddedBox = {
      top: clamp(rect.top - HIGHLIGHT_PADDING, 8, window.innerHeight - 24),
      left: clamp(rect.left - HIGHLIGHT_PADDING, 8, window.innerWidth - 24),
      width: Math.min(rect.width + HIGHLIGHT_PADDING * 2, window.innerWidth - 16),
      height: Math.min(rect.height + HIGHLIGHT_PADDING * 2, window.innerHeight - 16),
    };

    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    setHighlightBox(paddedBox);

    if (isMobile) {
      setTooltipPosition({
        top: window.innerHeight - 16,
        left: window.innerWidth / 2,
        placement: 'mobile',
        isMobile: true,
      });
      return;
    }

    const tooltipWidth = Math.min(DESKTOP_TOOLTIP_WIDTH, window.innerWidth - 32);
    let placement = step.placement || 'bottom';
    let top = paddedBox.top + paddedBox.height + TOOLTIP_GAP;
    let left = paddedBox.left + paddedBox.width / 2;

    if (placement === 'top') {
      top = paddedBox.top - TOOLTIP_GAP;
    } else if (placement === 'left') {
      top = paddedBox.top + paddedBox.height / 2;
      left = paddedBox.left - TOOLTIP_GAP;
    } else if (placement === 'right') {
      top = paddedBox.top + paddedBox.height / 2;
      left = paddedBox.left + paddedBox.width + TOOLTIP_GAP;
    }

    const wouldOverflowBottom = placement === 'bottom' && top + 260 > window.innerHeight;
    const wouldOverflowTop = placement === 'top' && top - 260 < 0;
    const wouldOverflowLeft = placement === 'left' && left - tooltipWidth < 16;
    const wouldOverflowRight = placement === 'right' && left + tooltipWidth > window.innerWidth - 16;

    if (wouldOverflowBottom && paddedBox.top > 280) {
      placement = 'top';
      top = paddedBox.top - TOOLTIP_GAP;
      left = paddedBox.left + paddedBox.width / 2;
    } else if (wouldOverflowTop || wouldOverflowLeft || wouldOverflowRight) {
      placement = 'bottom';
      top = paddedBox.top + paddedBox.height + TOOLTIP_GAP;
      left = paddedBox.left + paddedBox.width / 2;
    }

    setTooltipPosition({
      top,
      left: clamp(left, 16 + tooltipWidth / 2, window.innerWidth - 16 - tooltipWidth / 2),
      placement,
      isMobile: false,
    });
  }, [isOpen, step]);

  useEffect(() => {
    if (!step || !isOpen) return undefined;

    const element = document.querySelector(step.target);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: window.innerWidth < MOBILE_BREAKPOINT ? 'center' : 'nearest',
        inline: 'nearest',
      });
    }

    const timer = window.setTimeout(updatePosition, 350);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step, isOpen, currentStep, updatePosition]);

  if (!isOpen || !step) return null;

  const progress = ((currentStep + 1) / steps.length) * 100;
  const tooltipTransform = tooltipPosition.isMobile
    ? 'translate(-50%, 0)'
    : tooltipPosition.placement === 'right'
      ? 'translateY(-50%)'
      : tooltipPosition.placement === 'left'
        ? 'translate(-100%, -50%)'
        : tooltipPosition.placement === 'top'
          ? 'translate(-50%, -100%)'
          : 'translateX(-50%)';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Highlight Box */}
          {highlightBox && (
            <motion.div
              key={`highlight-${currentStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed z-40 rounded-xl border-4 border-blue-500 pointer-events-none"
              style={{
                top: `${highlightBox.top}px`,
                left: `${highlightBox.left}px`,
                width: `${highlightBox.width}px`,
                height: `${highlightBox.height}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58), 0 0 28px rgba(59, 130, 246, 0.9)',
              }}
            />
          )}

          {/* Tooltip */}
          <motion.div
            key={`tooltip-${currentStep}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="fixed z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl bg-white p-5 shadow-2xl sm:p-6"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              transform: tooltipTransform,
              maxHeight: tooltipPosition.isMobile ? 'calc(48vh - 1rem)' : 'calc(100vh - 2rem)',
              overflowY: 'auto',
            }}
          >
            {/* Close Button */}
            <button
              onClick={onSkip}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes size={18} />
            </button>

            {/* Step Title */}
            <h3 className="text-lg font-bold text-gray-900 mb-2 pr-6">
              {step.title}
            </h3>

            {/* Step Description */}
            <p className="text-gray-600 text-sm mb-4 leading-relaxed">
              {step.description}
            </p>

            {/* Progress Bar */}
            <div className="mb-4 bg-gray-200 rounded-full h-1 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
              />
            </div>

            {/* Step Counter */}
            <div className="text-xs text-gray-500 mb-4">
              Step {currentStep + 1} of {steps.length}
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-2">
              <button
                onClick={onPrevious}
                disabled={currentStep === 0}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FaChevronLeft size={14} />
                Back
              </button>
              <button
                onClick={onNext}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                {currentStep < steps.length - 1 && <FaChevronRight size={14} />}
              </button>
            </div>

            {/* Skip Link */}
            <button
              onClick={onSkip}
              className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip Tour
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TourOverlay;
