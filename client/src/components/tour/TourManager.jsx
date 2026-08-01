import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import WelcomeModal from './WelcomeModal';
import TourOverlay from './TourOverlay';
import { useTour } from '../../hooks/useTour';
import { useAuth } from '../../hooks/useAuth';
import {
  getTourDashboardRoute,
  getTourDashboardType,
  getTourStepsByUserRole,
} from '../../config/tourConfig';

const routeMatches = (location, expectedRoute) => {
  if (!expectedRoute) return true;

  const [expectedPath, expectedQuery = ''] = expectedRoute.split('?');
  const normalizePath = (value) => value.replace(/\/+$/, '') || '/';
  if (normalizePath(location.pathname) !== normalizePath(expectedPath)) return false;

  const expectedParams = new URLSearchParams(expectedQuery);
  const currentParams = new URLSearchParams(location.search);
  return Array.from(expectedParams.entries()).every(
    ([key, value]) => currentParams.get(key) === value,
  );
};

const getEffectiveTourRole = (user) => (
  user?.is_recruitment_admin === true && user?.user_type !== 'super_admin'
    ? 'recruitment_admin'
    : user?.user_type
);

/**
 * TourManager Component
 * Manages both the welcome modal and overlay tour components
 * This should be rendered at the app level within TourProvider context
 */
const TourManager = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const prevPathRef = useRef(location.pathname + location.search);

  const {
    showWelcomeModal,
    showTourOverlay,
    currentStep,
    currentDashboard,
    tourSteps,
    hasResumableTour,
    startTour,
    nextStep,
    previousStep,
    skipCurrentStep,
    skipTour,
    dismissWelcomeModal,
    completeStepAction,
    reportStepAvailability,
  } = useTour();

  const { user } = useAuth();

  // Dismiss welcome modal on navigation so it doesn't persist on other pages
  useEffect(() => {
    const routeKey = location.pathname + location.search;
    if (routeKey !== prevPathRef.current) {
      prevPathRef.current = routeKey;
      if (showWelcomeModal && !showTourOverlay) dismissWelcomeModal();
    }
  }, [
    dismissWelcomeModal,
    location.pathname,
    location.search,
    showTourOverlay,
    showWelcomeModal,
  ]);

  // Replays can be started from Profile or Settings. Keep every tour anchored to
  // the correct dashboard (and tab, where a step provides a route) before the
  // overlay resolves its target.
  useEffect(() => {
    if (!showTourOverlay || !user) return;

    const stepRoute = tourSteps[currentStep]?.route;
    const desiredRoute = stepRoute || getTourDashboardRoute(getEffectiveTourRole(user));
    if (desiredRoute && !routeMatches(location, desiredRoute)) {
      navigate(desiredRoute);
    }
  }, [
    currentStep,
    location,
    navigate,
    showTourOverlay,
    tourSteps,
    user,
  ]);

  const handleStartTour = () => {
    if (user) {
      const tourRole = getEffectiveTourRole(user);
      const roleSteps = getTourStepsByUserRole(tourRole, t, { user });
      startTour(tourRole, roleSteps);

      const desiredRoute = roleSteps[0]?.route || getTourDashboardRoute(tourRole);
      if (desiredRoute && !routeMatches(location, desiredRoute)) {
        navigate(desiredRoute);
      }
    }
  };

  const effectiveRole = getEffectiveTourRole(user);
  const isReturningUser = localStorage.getItem(
    `tour_last_dismissal_${user?.id}_${getTourDashboardType(effectiveRole)}`
  );

  return (
    <>
      <WelcomeModal
        isOpen={showWelcomeModal}
        onStartTour={handleStartTour}
        onSkip={dismissWelcomeModal}
        isReturningUser={!!isReturningUser}
        canResume={hasResumableTour}
      />

      <TourOverlay
        isOpen={showTourOverlay}
        steps={tourSteps}
        currentStep={currentStep}
        onNext={nextStep}
        onPrevious={previousStep}
        onSkipStep={skipCurrentStep}
        onSkip={skipTour}
        onActionComplete={completeStepAction}
        onTargetUnavailable={reportStepAvailability}
        dashboardTitle={t('tour.ui.dashboard_title', 'RentalHub dashboard')}
      />
    </>
  );
};

export default TourManager;
