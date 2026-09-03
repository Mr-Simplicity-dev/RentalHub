const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate, optionalAuthenticate } = require('../config/middleware/auth');
const { requireTurnstile } = require('../config/middleware/turnstileVerify');
const {
  getMySurveyStatus,
  startSurvey,
  saveSurvey,
  completePartA,
  completeSurvey,
  getSurveyDefinition,
  submitPublicSurvey,
  savePublicDraft,
  resumeSurvey,
  claimSurveyDraft,
  restartSurvey,
} = require('../services/surveyService');
const surveyController = require('../services/surveyService');
const { getMarketingAgentOverview } = require('../services/surveyAnalysisService');
const pushService = require('../services/pushService');

// #1 Public anonymous write routes get IP rate limits — drafts/autosaves are
// not Turnstile-gated (no token exists mid-survey), so this keeps bots from
// flooding the responses table with junk incomplete rows.
const publicWriteLimiter = rateLimit({
  windowMs: Number(process.env.SURVEY_PUBLIC_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.SURVEY_PUBLIC_MAX) || 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many survey requests. Please wait a moment.' },
});

// #4 When the "Public Survey" flag is OFF, anonymous visitors may not reach
// the public write/resume endpoints. Marketing agents (authenticated) still can.
const blockWhenSurveyDisabled = async (req, res, next) => {
  if (req.user?.user_type === 'marketing_agent') return next();
  const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
  const flags = await getFeatureFlagsMap();
  if (flags.survey_public_enabled === true) return next();
  return res.status(403).json({
    success: false,
    code: 'SURVEY_DISABLED',
    message: 'The public survey is currently turned off.',
  });
};

// Public: site-wide feature flags relevant to visitors (footer link etc.)
router.get('/public-flags', async (req, res) => {
  try {
    const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
    const flags = await getFeatureFlagsMap();
    return res.json({
      success: true,
      data: {
        survey_public_enabled: flags.survey_public_enabled === true,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load flags' });
  }
});

// Public: VAPID public key for Web Push subscriptions
router.get('/push/public-key', pushService.getPublicKey);

// Public: location gate status + check
router.get('/location-config', surveyController.getSurveyLocationConfig);
router.get('/location-check', surveyController.checkSurveyLocation);
router.post('/location-verify', publicWriteLimiter, surveyController.verifySurveyLocation);

// Public: push subscription (optionalAuthenticate so agents/logged-in users are linked)
router.post('/push/subscribe', optionalAuthenticate, pushService.subscribe);
router.post('/push/unsubscribe', pushService.unsubscribe);

// Public: question definitions (used by wizard + public page)
router.get('/definition', getSurveyDefinition);

router.post(
  '/public/gate',
  publicWriteLimiter,
  blockWhenSurveyDisabled,
  optionalAuthenticate,
  requireTurnstile('rentalhub_survey_entry'),
  (req, res) => {
    res.json({ success: true });
  }
);

// Public: anonymous submissions from rentalhub.com.ng/survey
// (optionalAuthenticate lets a logged-in marketing agent be attributed).
router.post(
  '/public/submit',
  publicWriteLimiter,
  blockWhenSurveyDisabled,
  optionalAuthenticate,
  requireTurnstile('rentalhub_survey'),
  submitPublicSurvey
);

// Public: draft save + resume (no login needed; token-based)
router.post('/public/draft', publicWriteLimiter, blockWhenSurveyDisabled, optionalAuthenticate, savePublicDraft);
router.get('/resume', publicWriteLimiter, blockWhenSurveyDisabled, resumeSurvey);

// Authenticated: gate status + response lifecycle
router.get('/my-status', authenticate, getMySurveyStatus);
router.post('/start', authenticate, startSurvey);
router.post('/save', authenticate, saveSurvey);
router.post('/complete-part-a', authenticate, completePartA);
router.post('/complete', authenticate, completeSurvey);

// Authenticated: claim an anonymous draft on registration; restart on change
router.post('/claim', authenticate, claimSurveyDraft);
router.post('/restart', authenticate, restartSurvey);

// Marketing agent dashboard
router.get('/marketing-agent/overview', authenticate, (req, res, next) => {
  if (req.user.user_type !== 'marketing_agent') {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
}, getMarketingAgentOverview);

module.exports = router;
