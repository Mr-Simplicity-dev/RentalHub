import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCheckCircle } from 'react-icons/fa';

const WelcomeModal = ({ isOpen, onStartTour, onSkip, isReturningUser = false }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onSkip}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-8">
              <button
                onClick={onSkip}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
              >
                <FaTimes size={22} className="sm:text-2xl" />
              </button>

              <div className="text-center">
                <div className="mb-4 sm:mb-6">
                  <div className="inline-block bg-gradient-to-r from-blue-500 to-blue-600 rounded-full p-3 sm:p-4">
                    <FaCheckCircle className="text-white text-2xl sm:text-4xl" />
                  </div>
                </div>

                <h2 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
                  {isReturningUser ? 'Welcome Back!' : 'Welcome to RentalHub NG!'}
                </h2>

                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-8 leading-relaxed">
                  {isReturningUser
                    ? "It's been a while! Let's refresh you on how to make the most of RentalHub."
                    : 'Get the most out of your account with a guided tour of the powerful features available to you.'}
                </p>

                <div className="bg-gray-50 rounded-lg p-4 sm:p-6 mb-5 sm:mb-8 text-left space-y-2 sm:space-y-3">
                  <div className="flex items-start">
                    <FaCheckCircle className="text-green-500 mt-0.5 mr-3 shrink-0" />
                    <span className="text-sm sm:text-base text-gray-700">Learn key features step-by-step</span>
                  </div>
                  <div className="flex items-start">
                    <FaCheckCircle className="text-green-500 mt-0.5 mr-3 shrink-0" />
                    <span className="text-sm sm:text-base text-gray-700">Get personalized for your role</span>
                  </div>
                  <div className="flex items-start">
                    <FaCheckCircle className="text-green-500 mt-0.5 mr-3 shrink-0" />
                    <span className="text-sm sm:text-base text-gray-700">Replay anytime from settings</span>
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={onSkip}
                    className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 text-gray-700 font-semibold text-sm sm:text-base rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Skip for Now
                  </button>
                  <button
                    onClick={onStartTour}
                    className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-sm sm:text-base rounded-lg hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                  >
                    Start Tour
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-4 sm:mt-6">
                  This tour takes about 2-3 minutes
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
