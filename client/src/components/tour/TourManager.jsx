import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import WelcomeModal from './WelcomeModal';
import TourOverlay from './TourOverlay';
import { useTour } from '../../hooks/useTour';
import { useAuth } from '../../hooks/useAuth';
import { getTourStepsByUserRole } from '../../config/tourConfig';

/**
 * TourManager Component
 * Manages both the welcome modal and overlay tour components
 * This should be rendered at the app level within TourProvider context
 */
const TourManager = () => {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname + location.search);

  const {
    showWelcomeModal,
    showTourOverlay,
    currentStep,
    tourSteps,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    dismissWelcomeModal,
  } = useTour();

  const { user } = useAuth();

  // Dismiss welcome modal on navigation so it doesn't persist on other pages
  useEffect(() => {
    const routeKey = location.pathname + location.search;
    if (routeKey !== prevPathRef.current) {
      prevPathRef.current = routeKey;
      if (showWelcomeModal) dismissWelcomeModal();
    }
  }, [dismissWelcomeModal, location.pathname, location.search, showWelcomeModal]);

  const handleStartTour = () => {
    if (user) {
      const tourSteps = getTourStepsByUserRole(user.user_type);
      startTour(user.user_type, tourSteps);
    }
  };

  const isReturningUser = localStorage.getItem(
    `tour_last_dismissal_${user?.id}`
  );

  return (
    <>
      <WelcomeModal
        isOpen={showWelcomeModal}
        onStartTour={handleStartTour}
        onSkip={dismissWelcomeModal}
        isReturningUser={!!isReturningUser}
      />

      <TourOverlay
        isOpen={showTourOverlay}
        steps={tourSteps}
        currentStep={currentStep}
        onNext={nextStep}
        onPrevious={previousStep}
        onSkip={skipTour}
        dashboardTitle={currentStep < tourSteps.length ? tourSteps[currentStep]?.title : 'Tour Complete'}
      />
    </>
  );
};

export default TourManager;
