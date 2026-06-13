import React from 'react';
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
