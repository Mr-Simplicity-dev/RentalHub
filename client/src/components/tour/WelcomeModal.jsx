import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCheckCircle } from 'react-icons/fa';

const WelcomeModal = ({ isOpen, onStartTour, onSkip, isReturningUser = false }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onSkip}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 z-50"
          >
            {/* Close Button */}
            <button
              onClick={onSkip}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes size={24} />
            </button>

            {/* Content */}
            <div className="text-center">
              {/* Icon/Badge */}
              <div className="mb-6">
                <div className="inline-block bg-gradient-to-r from-blue-500 to-blue-600 rounded-full p-4">
                  <FaCheckCircle className="text-white" size={40} />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-3xl font-bold text-gray-900 mb-3">
                {isReturningUser ? '👋 Welcome Back!' : '🎉 Welcome to RentalHub!'}
              </h2>

              {/* Description */}
              <p className="text-gray-600 mb-8 leading-relaxed">
                {isReturningUser
                  ? "It's been a while! Let's refresh you on how to make the most of RentalHub. We'll show you a quick tour of the features."
                  : "Get the most out of your account with a guided tour. We'll show you all the powerful features available to you."}
              </p>

              {/* Features List */}
              <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left space-y-3">
                <div className="flex items-start">
                  <FaCheckCircle className="text-green-500 mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Learn key features step-by-step</span>
                </div>
                <div className="flex items-start">
                  <FaCheckCircle className="text-green-500 mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Get personalized for your role</span>
                </div>
                <div className="flex items-start">
                  <FaCheckCircle className="text-green-500 mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Replay anytime from settings</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onSkip}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  onClick={onStartTour}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                >
                  Start Tour
                </button>
              </div>

              {/* Footer Note */}
              <p className="text-xs text-gray-500 mt-6">
                ⏱️ This tour takes about 2-3 minutes
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
