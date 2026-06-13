import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

export const TourContext = createContext();

const TOUR_CONFIG = {
  INACTIVITY_THRESHOLD_DAYS: 7,
  VERSION: '1',
  LOCAL_STORAGE_KEYS: {
    LAST_TOUR_DISMISSAL: 'tour_last_dismissal',
    TOUR_COMPLETED: 'tour_completed',
    TOUR_SHOWN_VERSION: 'tour_version',
  },
};

export const TourProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showTourOverlay, setShowTourOverlay] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentDashboard, setCurrentDashboard] = useState(null);
  const [tourSteps, setTourSteps] = useState([]);
  const [userTourData, setUserTourData] = useState(null);
  const [tourDataLoaded, setTourDataLoaded] = useState(false);

  const getLocalLastDismissal = useCallback(() => {
    if (!user?.id) return null;
    return localStorage.getItem(
      `${TOUR_CONFIG.LOCAL_STORAGE_KEYS.LAST_TOUR_DISMISSAL}_${user.id}`
    );
  }, [user?.id]);

  const saveLocalLastDismissal = useCallback((value) => {
    if (!user?.id || !value) return;
    localStorage.setItem(
      `${TOUR_CONFIG.LOCAL_STORAGE_KEYS.LAST_TOUR_DISMISSAL}_${user.id}`,
      value
    );
  }, [user?.id]);

  const trackTourEvent = useCallback(async (eventType, details = {}) => {
    if (!isAuthenticated || !user) return null;

    try {
      const response = await api.post('/users/tour/events', {
        event_type: eventType,
        dashboard_type: details.dashboardType || currentDashboard,
        tour_version: TOUR_CONFIG.VERSION,
        step_id: details.stepId,
        current_step: details.currentStep,
        total_steps: details.totalSteps,
        metadata: details.metadata || {},
      });

      if (response.data?.success) {
        setUserTourData(response.data.data);
        return response.data.data;
      }
    } catch (error) {
      console.error('Tour analytics event failed:', error);
    }

    return null;
  }, [currentDashboard, isAuthenticated, user]);

  // Check if tour should be shown based on 7-day inactivity
  const shouldShowTour = useCallback(() => {
    if (!isAuthenticated || !user || !tourDataLoaded) return false;

    const lastDismissal =
      userTourData?.last_dismissed_at ||
      userTourData?.last_completed_at ||
      getLocalLastDismissal();

    if (!lastDismissal) {
      // First time user - always show
      return true;
    }

    const lastDismissalDate = new Date(lastDismissal);
    const now = new Date();
    const daysSinceDismissal = Math.floor((now - lastDismissalDate) / (1000 * 60 * 60 * 24));

    return daysSinceDismissal >= TOUR_CONFIG.INACTIVITY_THRESHOLD_DAYS;
  }, [getLocalLastDismissal, isAuthenticated, tourDataLoaded, user, userTourData]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setUserTourData(null);
      setTourDataLoaded(false);
      return undefined;
    }

    let cancelled = false;

    const loadTourState = async () => {
      try {
        const response = await api.get('/users/tour');
        if (!cancelled) {
          setUserTourData(response.data?.data || null);
        }
      } catch (error) {
        console.error('Tour state load failed:', error);
        if (!cancelled) {
          setUserTourData(null);
        }
      } finally {
        if (!cancelled) {
          setTourDataLoaded(true);
        }
      }
    };

    loadTourState();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  // Initialize tour when user logs in
  useEffect(() => {
    if (isAuthenticated && user && !showWelcomeModal && shouldShowTour()) {
      setShowWelcomeModal(true);
      trackTourEvent('welcome_shown', {
        dashboardType: user.user_type,
        metadata: { source: 'auto_prompt' },
      });
    }
  }, [isAuthenticated, shouldShowTour, showWelcomeModal, trackTourEvent, user]);

  const startTour = useCallback((dashboardType, steps, options = {}) => {
    setCurrentDashboard(dashboardType);
    setTourSteps(steps);
    setCurrentStep(0);
    setShowWelcomeModal(false);
    setShowTourOverlay(true);
    trackTourEvent(options.replay ? 'replayed' : 'started', {
      dashboardType,
      currentStep: 0,
      totalSteps: steps?.length || 0,
      metadata: { source: options.source || 'tour_manager' },
    });
  }, [trackTourEvent]);

  const completeTour = useCallback((eventType = 'completed') => {
    const now = new Date().toISOString();
    if (user) {
      saveLocalLastDismissal(now);
    }
    trackTourEvent(eventType, {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: tourSteps[currentStep]?.id,
    });
    setShowTourOverlay(false);
    setShowWelcomeModal(false);
    setCurrentStep(0);
    setCurrentDashboard(null);
    setTourSteps([]);
  }, [currentDashboard, currentStep, saveLocalLastDismissal, tourSteps, trackTourEvent, user]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < tourSteps.length - 1) {
        return prev + 1;
      }

      completeTour('completed');
      return prev;
    });
  }, [completeTour, tourSteps.length]);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const skipTour = useCallback(() => {
    completeTour('skipped');
  }, [completeTour]);

  const replayTour = useCallback((dashboardType, steps) => {
    startTour(dashboardType, steps, { replay: true, source: 'settings' });
  }, [startTour]);

  const dismissWelcomeModal = useCallback(() => {
    const now = new Date().toISOString();
    saveLocalLastDismissal(now);
    trackTourEvent('dismissed', {
      dashboardType: user?.user_type,
      metadata: { source: 'welcome_modal' },
    });
    setShowWelcomeModal(false);
  }, [saveLocalLastDismissal, trackTourEvent, user?.user_type]);

  const value = {
    // State
    showWelcomeModal,
    showTourOverlay,
    currentStep,
    currentDashboard,
    tourSteps,
    userTourData,
    shouldShowTour: shouldShowTour(),

    // Actions
    startTour,
    nextStep,
    previousStep,
    skipTour,
    completeTour,
    replayTour,
    dismissWelcomeModal,
    setCurrentDashboard,
    setTourSteps,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};
