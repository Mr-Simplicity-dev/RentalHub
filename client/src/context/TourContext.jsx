import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import i18n from '../i18n';
import { getTourDashboardType } from '../config/tourConfig';

export const TourContext = createContext();

const TOUR_CONFIG = {
  INACTIVITY_THRESHOLD_DAYS: 7,
  VERSION: '4',
  LOCAL_STORAGE_KEYS: {
    LAST_TOUR_DISMISSAL: 'tour_last_dismissal',
    TOUR_COMPLETED: 'tour_completed',
    TOUR_SHOWN_VERSION: 'tour_version',
    TOUR_RESUME_STATE: 'tour_resume_state',
    TOUR_SESSION: 'tour_session',
  },
};

const normalizeDashboardType = (value, fallbackRole) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (
    candidate.endsWith('_dashboard')
    || candidate.startsWith('workflow_')
    || candidate.endsWith('_workflow')
  ) {
    return candidate;
  }
  return getTourDashboardType(candidate || fallbackRole);
};

let tourEventSequence = 0;
const createTourEventId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  tourEventSequence = (tourEventSequence + 1) % 1000000;
  return [
    'web',
    Date.now().toString(36),
    tourEventSequence.toString(36),
    Math.random().toString(36).slice(2, 12),
  ].join('-');
};

const getLatestTourActivity = (...values) => values.reduce((latest, value) => {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return latest;
  return !latest || timestamp > latest.timestamp
    ? { timestamp, value }
    : latest;
}, null)?.value || null;

const parseStepIndex = (state, steps) => {
  const savedStepId = state?.current_step_id || state?.last_step_id;
  if (savedStepId) {
    const index = steps.findIndex(({ id }) => id === savedStepId);
    if (index >= 0) return index;
  }
  const numericIndex = Number(state?.current_step);
  return Number.isInteger(numericIndex) && numericIndex >= 0 ? numericIndex : 0;
};

const pickFreshestResumeState = (serverState, localState) => {
  if (!serverState) return localState;
  if (!localState) return serverState;
  const serverTime = new Date(
    serverState.progress_updated_at || serverState.updated_at || 0
  ).getTime();
  const localTime = new Date(localState.updatedAt || 0).getTime();
  if (!Number.isFinite(serverTime)) return localState;
  if (!Number.isFinite(localTime)) return serverState;
  return localTime > serverTime ? localState : serverState;
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
  const activeSessionRef = useRef(null);
  const eventSequenceRef = useRef(0);
  const lastStepViewRef = useRef(null);
  const pauseSentRef = useRef(false);

  const effectiveTourRole =
    user?.is_recruitment_admin === true && user?.user_type !== 'super_admin'
      ? 'recruitment_admin'
      : user?.user_type;
  const userDashboardType = getTourDashboardType(effectiveTourRole);

  const getScopedStorageKey = useCallback((key, tourKey = userDashboardType) => (
    `${key}_${user?.id}_${tourKey}`
  ), [user?.id, userDashboardType]);

  const getLocalResumeState = useCallback((tourKey = userDashboardType) => {
    if (!user?.id) return null;
    try {
      const value = localStorage.getItem(
        getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_RESUME_STATE, tourKey)
      );
      const parsed = value ? JSON.parse(value) : null;
      if (!parsed || parsed.tourVersion !== TOUR_CONFIG.VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [getScopedStorageKey, user?.id, userDashboardType]);

  const saveLocalResumeState = useCallback((state, tourKey = userDashboardType) => {
    if (!user?.id || !state) return;
    localStorage.setItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_RESUME_STATE, tourKey),
      JSON.stringify({
        ...state,
        tourVersion: TOUR_CONFIG.VERSION,
        updatedAt: new Date().toISOString(),
      })
    );
  }, [getScopedStorageKey, user?.id, userDashboardType]);

  const clearLocalResumeState = useCallback((tourKey = userDashboardType) => {
    if (!user?.id) return;
    localStorage.removeItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_RESUME_STATE, tourKey)
    );
  }, [getScopedStorageKey, user?.id, userDashboardType]);

  const getSessionId = useCallback((tourKey = userDashboardType, forceNew = false) => {
    if (!user?.id) return createTourEventId();
    const key = getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_SESSION, tourKey);
    let sessionId = forceNew ? null : sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = createTourEventId();
      sessionStorage.setItem(key, sessionId);
    }
    activeSessionRef.current = sessionId;
    return sessionId;
  }, [getScopedStorageKey, user?.id, userDashboardType]);

  const getLocalLastDismissal = useCallback(() => {
    if (!user?.id) return null;
    return localStorage.getItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.LAST_TOUR_DISMISSAL)
    );
  }, [getScopedStorageKey, user?.id]);

  const saveLocalLastDismissal = useCallback((value) => {
    if (!user?.id || !value) return;
    localStorage.setItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.LAST_TOUR_DISMISSAL),
      value
    );
    localStorage.setItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_SHOWN_VERSION),
      TOUR_CONFIG.VERSION
    );
  }, [getScopedStorageKey, user?.id]);

  const trackTourEvent = useCallback(async (eventType, details = {}) => {
    if (!isAuthenticated || !user) return null;

    try {
      const tourKey = details.dashboardType || currentDashboard || userDashboardType;
      // Analytics routes intentionally exclude query strings and hashes because
      // they may contain reset tokens, search text, references, or other PII.
      const route = typeof window === 'undefined' ? null : window.location.pathname;
      const locale = i18n.resolvedLanguage || i18n.language || 'en';
      const sessionId = details.sessionId
        || activeSessionRef.current
        || getSessionId(tourKey);
      eventSequenceRef.current += 1;

      const response = await api.post('/users/tour/events', {
        event_id: createTourEventId(),
        platform: 'web',
        tour_key: tourKey,
        event_type: eventType,
        dashboard_type: tourKey,
        tour_version: TOUR_CONFIG.VERSION,
        step_id: details.stepId,
        current_step: details.currentStep,
        total_steps: details.totalSteps,
        locale,
        route,
        target_id: details.targetId,
        reason_code: details.reasonCode,
        session_id: sessionId,
        sequence_number: eventSequenceRef.current,
        duration_ms: details.durationMs,
        client_created_at: new Date().toISOString(),
        context: {
          route,
          locale,
          ...(details.context || {}),
        },
        metadata: {
          ...(details.metadata || {}),
          platform: 'web',
          locale,
        },
      });

      if (response.data?.success) {
        if (tourKey === userDashboardType) {
          setUserTourData(response.data.data);
        }
        return response.data.data;
      }
    } catch (error) {
      console.error('Tour analytics event failed:', error);
    }

    return null;
  }, [currentDashboard, getSessionId, isAuthenticated, user, userDashboardType]);

  const hasResumableTour = useMemo(() => {
    const serverCanResume = Boolean(
      userTourData?.can_resume
      && String(userTourData?.tour_version) === TOUR_CONFIG.VERSION
      && (userTourData?.tour_key || userDashboardType) === userDashboardType
    );
    return serverCanResume || Boolean(getLocalResumeState());
  }, [getLocalResumeState, userDashboardType, userTourData]);

  const shouldShowTour = useCallback(() => {
    if (!isAuthenticated || !user || !tourDataLoaded) return false;
    if (hasResumableTour) return true;

    if (
      userTourData?.tour_version
      && String(userTourData.tour_version) !== TOUR_CONFIG.VERSION
    ) {
      return true;
    }

    const localVersion = localStorage.getItem(
      getScopedStorageKey(TOUR_CONFIG.LOCAL_STORAGE_KEYS.TOUR_SHOWN_VERSION)
    );
    if (!userTourData && localVersion !== TOUR_CONFIG.VERSION) return true;

    const lastDismissal = getLatestTourActivity(
      userTourData?.last_dismissed_at,
      userTourData?.last_completed_at,
      userTourData?.last_skipped_at,
      getLocalLastDismissal()
    );
    if (!lastDismissal) return true;

    const daysSinceDismissal = Math.floor(
      (Date.now() - new Date(lastDismissal).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceDismissal >= TOUR_CONFIG.INACTIVITY_THRESHOLD_DAYS;
  }, [
    getLocalLastDismissal,
    getScopedStorageKey,
    hasResumableTour,
    isAuthenticated,
    tourDataLoaded,
    user,
    userTourData,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setUserTourData(null);
      setTourDataLoaded(false);
      setShowWelcomeModal(false);
      setShowTourOverlay(false);
      return undefined;
    }

    let cancelled = false;
    const loadTourState = async () => {
      try {
        const response = await api.get('/users/tour', {
          params: {
            dashboard_type: userDashboardType,
            platform: 'web',
            tour_key: userDashboardType,
          },
        });
        if (!cancelled) setUserTourData(response.data?.data || null);
      } catch (error) {
        console.error('Tour state load failed:', error);
        if (!cancelled) setUserTourData(null);
      } finally {
        if (!cancelled) setTourDataLoaded(true);
      }
    };
    loadTourState();
    return () => { cancelled = true; };
  }, [isAuthenticated, user, userDashboardType]);

  useEffect(() => {
    if (
      isAuthenticated
      && user
      && !showWelcomeModal
      && !showTourOverlay
      && shouldShowTour()
    ) {
      setShowWelcomeModal(true);
      trackTourEvent('welcome_shown', {
        dashboardType: userDashboardType,
        metadata: { source: hasResumableTour ? 'resume_prompt' : 'auto_prompt' },
      });
    }
  }, [
    hasResumableTour,
    isAuthenticated,
    shouldShowTour,
    showTourOverlay,
    showWelcomeModal,
    trackTourEvent,
    user,
    userDashboardType,
  ]);

  const startTour = useCallback((dashboardType, steps, options = {}) => {
    const tourKey = normalizeDashboardType(dashboardType, user?.user_type);
    const safeSteps = Array.isArray(steps) ? steps : [];
    const localResume = getLocalResumeState(tourKey);
    const serverResume = userTourData?.can_resume
      && String(userTourData?.tour_version) === TOUR_CONFIG.VERSION
      && (userTourData?.tour_key || tourKey) === tourKey
      ? userTourData
      : null;
    const resumeState = options.resume === false
      ? null
      : pickFreshestResumeState(serverResume, localResume);
    const requestedStep = Number.isInteger(options.initialStep)
      ? options.initialStep
      : parseStepIndex(resumeState, safeSteps);
    const initialStep = Math.min(
      Math.max(requestedStep, 0),
      Math.max(safeSteps.length - 1, 0)
    );
    const isResume = Boolean(resumeState && safeSteps.length);
    // Every visible run receives a fresh session so its sequence always starts
    // at zero and delayed events from an earlier run cannot rewind the cursor.
    eventSequenceRef.current = 0;
    const sessionId = getSessionId(tourKey, true);

    setCurrentDashboard(tourKey);
    setTourSteps(safeSteps);
    setCurrentStep(initialStep);
    setShowWelcomeModal(false);
    setShowTourOverlay(safeSteps.length > 0);
    pauseSentRef.current = false;
    lastStepViewRef.current = null;

    if (!safeSteps.length) return;
    saveLocalResumeState({
      current_step: initialStep,
      current_step_id: safeSteps[initialStep]?.id || null,
      total_steps: safeSteps.length,
      status: 'in_progress',
      tourKey,
    }, tourKey);

    const eventType = options.replay ? 'replayed' : isResume ? 'resumed' : 'started';
    trackTourEvent(eventType, {
      dashboardType: tourKey,
      currentStep: initialStep,
      totalSteps: safeSteps.length,
      stepId: safeSteps[initialStep]?.id,
      sessionId,
      context: {
        workflow_key: options.workflowKey || null,
        resumed_from: isResume ? (resumeState === localResume ? 'device' : 'server') : null,
      },
      metadata: { source: options.source || 'tour_manager' },
    });
  }, [
    getLocalResumeState,
    getSessionId,
    saveLocalResumeState,
    trackTourEvent,
    user?.user_type,
    userTourData,
  ]);

  const completeTour = useCallback((eventType = 'completed') => {
    const now = new Date().toISOString();
    if (user) saveLocalLastDismissal(now);
    trackTourEvent(eventType, {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: tourSteps[currentStep]?.id,
    });
    clearLocalResumeState(currentDashboard);
    setShowTourOverlay(false);
    setShowWelcomeModal(false);
    setCurrentStep(0);
    setCurrentDashboard(null);
    setTourSteps([]);
    activeSessionRef.current = null;
  }, [
    clearLocalResumeState,
    currentDashboard,
    currentStep,
    saveLocalLastDismissal,
    tourSteps,
    trackTourEvent,
    user,
  ]);

  const nextStep = useCallback(() => {
    const activeStep = tourSteps[currentStep];
    trackTourEvent('step_completed', {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: activeStep?.id,
      targetId: activeStep?.targetId || activeStep?.id,
    });

    if (currentStep >= tourSteps.length - 1) {
      completeTour('completed');
      return;
    }

    const nextIndex = currentStep + 1;
    saveLocalResumeState({
      current_step: nextIndex,
      current_step_id: tourSteps[nextIndex]?.id || null,
      total_steps: tourSteps.length,
      status: 'in_progress',
      tourKey: currentDashboard,
    }, currentDashboard);
    setCurrentStep(nextIndex);
  }, [
    completeTour,
    currentDashboard,
    currentStep,
    saveLocalResumeState,
    tourSteps,
    trackTourEvent,
  ]);

  const previousStep = useCallback(() => {
    const previousIndex = Math.max(currentStep - 1, 0);
    saveLocalResumeState({
      current_step: previousIndex,
      current_step_id: tourSteps[previousIndex]?.id || null,
      total_steps: tourSteps.length,
      status: 'in_progress',
      tourKey: currentDashboard,
    }, currentDashboard);
    setCurrentStep(previousIndex);
  }, [currentDashboard, currentStep, saveLocalResumeState, tourSteps]);

  const skipCurrentStep = useCallback((reasonCode = 'user_skipped_step') => {
    const activeStep = tourSteps[currentStep];
    trackTourEvent('step_skipped', {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: activeStep?.id,
      targetId: activeStep?.targetId || activeStep?.id,
      reasonCode,
    });

    if (currentStep >= tourSteps.length - 1) {
      completeTour('completed');
      return;
    }
    const nextIndex = currentStep + 1;
    saveLocalResumeState({
      current_step: nextIndex,
      current_step_id: tourSteps[nextIndex]?.id || null,
      total_steps: tourSteps.length,
      status: 'in_progress',
      tourKey: currentDashboard,
    }, currentDashboard);
    setCurrentStep(nextIndex);
  }, [
    completeTour,
    currentDashboard,
    currentStep,
    saveLocalResumeState,
    tourSteps,
    trackTourEvent,
  ]);

  const completeStepAction = useCallback((actionDetails = {}) => {
    const activeStep = tourSteps[currentStep];
    trackTourEvent('action_completed', {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: activeStep?.id,
      targetId: activeStep?.targetId || activeStep?.id,
      context: {
        action_type: actionDetails.actionType || activeStep?.action?.event || 'click',
        workflow_key: activeStep?.workflowKey || null,
      },
    });
    if (actionDetails.autoAdvance !== false && activeStep?.action?.autoAdvance !== false) {
      nextStep();
    }
  }, [currentDashboard, currentStep, nextStep, tourSteps, trackTourEvent]);

  const reportStepAvailability = useCallback((status, details = {}) => {
    const activeStep = tourSteps[currentStep];
    trackTourEvent(status === 'missing' ? 'target_missing' : 'step_unavailable', {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: activeStep?.id,
      targetId: activeStep?.targetId || activeStep?.id,
      reasonCode: details.reasonCode
        || (status === 'missing' ? 'target_not_found' : 'context_unavailable'),
      context: details.context,
    });
  }, [currentDashboard, currentStep, tourSteps, trackTourEvent]);

  const skipTour = useCallback(() => completeTour('skipped'), [completeTour]);

  const replayTour = useCallback((dashboardType, steps) => {
    startTour(dashboardType, steps, {
      replay: true,
      resume: false,
      source: 'settings',
    });
  }, [startTour]);

  const dismissWelcomeModal = useCallback(() => {
    const now = new Date().toISOString();
    saveLocalLastDismissal(now);
    if (hasResumableTour) {
      const resumeState = userTourData || getLocalResumeState();
      trackTourEvent('paused', {
        dashboardType: userDashboardType,
        currentStep: Number.isInteger(Number(resumeState?.current_step))
          ? Number(resumeState.current_step)
          : undefined,
        totalSteps: resumeState?.total_steps,
        stepId: resumeState?.current_step_id || resumeState?.last_step_id,
        reasonCode: 'resume_prompt_deferred',
        metadata: { source: 'welcome_modal' },
      });
    } else {
      trackTourEvent('dismissed', {
        dashboardType: userDashboardType,
        metadata: { source: 'welcome_modal' },
      });
    }
    setShowWelcomeModal(false);
  }, [
    getLocalResumeState,
    hasResumableTour,
    saveLocalLastDismissal,
    trackTourEvent,
    userDashboardType,
    userTourData,
  ]);

  useEffect(() => {
    const activeStep = tourSteps[currentStep];
    if (!showTourOverlay || !activeStep || !currentDashboard) return;
    const viewKey = `${currentDashboard}:${currentStep}:${activeStep.id}`;
    if (lastStepViewRef.current === viewKey) return;
    lastStepViewRef.current = viewKey;
    trackTourEvent('step_viewed', {
      dashboardType: currentDashboard,
      currentStep,
      totalSteps: tourSteps.length,
      stepId: activeStep.id,
      targetId: activeStep.targetId || activeStep.id,
      context: { workflow_key: activeStep.workflowKey || null },
    });
  }, [currentDashboard, currentStep, showTourOverlay, tourSteps, trackTourEvent]);

  useEffect(() => {
    if (!showTourOverlay || typeof window === 'undefined') return undefined;
    const pause = (reasonCode) => {
      if (pauseSentRef.current) return;
      pauseSentRef.current = true;
      const activeStep = tourSteps[currentStep];
      saveLocalResumeState({
        current_step: currentStep,
        current_step_id: activeStep?.id || null,
        total_steps: tourSteps.length,
        status: 'paused',
        tourKey: currentDashboard,
      }, currentDashboard);
      trackTourEvent('paused', {
        dashboardType: currentDashboard,
        currentStep,
        totalSteps: tourSteps.length,
        stepId: activeStep?.id,
        reasonCode,
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pause('document_hidden');
      else pauseSentRef.current = false;
    };
    const handlePageHide = () => pause('page_hidden');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [
    currentDashboard,
    currentStep,
    saveLocalResumeState,
    showTourOverlay,
    tourSteps,
    trackTourEvent,
  ]);

  const value = {
    showWelcomeModal,
    showTourOverlay,
    currentStep,
    currentDashboard,
    tourSteps,
    userTourData,
    hasResumableTour,
    shouldShowTour: shouldShowTour(),
    startTour,
    nextStep,
    previousStep,
    skipCurrentStep,
    skipTour,
    completeTour,
    replayTour,
    dismissWelcomeModal,
    completeStepAction,
    reportStepAvailability,
    trackTourEvent,
    setCurrentDashboard,
    setTourSteps,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};
