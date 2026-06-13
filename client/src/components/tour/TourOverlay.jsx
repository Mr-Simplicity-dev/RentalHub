import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

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
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const step = steps[currentStep];

  // Update highlight box and tooltip position when step changes
  useEffect(() => {
    if (!step || !isOpen) return;

    const timer = setTimeout(() => {
      const element = document.querySelector(step.target);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightBox({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });

        // Calculate tooltip position based on placement
        let top = rect.top + rect.height + 15;
        let left = rect.left + rect.width / 2;

        if (step.placement === 'top') {
          top = rect.top - 15;
        } else if (step.placement === 'left') {
          left = rect.left - 15;
        } else if (step.placement === 'right') {
          left = rect.left + rect.width + 15;
        }

        setTooltipPosition({ top, left });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [step, isOpen, currentStep]);

  if (!isOpen || !step) return null;

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dark Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-40 z-40 pointer-events-none"
          />

          {/* Highlight Box */}
          {highlightBox && (
            <motion.div
              key={`highlight-${currentStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed z-40 border-4 border-blue-500 rounded-lg pointer-events-none shadow-xl shadow-blue-500/50"
              style={{
                top: `${highlightBox.top}px`,
                left: `${highlightBox.left}px`,
                width: `${highlightBox.width}px`,
                height: `${highlightBox.height}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4), 0 0 30px rgba(59, 130, 246, 0.8)',
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
            className="fixed z-50 bg-white rounded-xl shadow-2xl p-6 max-w-sm"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              transform: step.placement === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
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
