const express = require('express');
const router = express.Router();
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
const { getMarketingAgentOverview } = require('../services/surveyAnalysisService');

// Public: question definitions (used by wizard + public page)
router.get('/definition', getSurveyDefinition);

// Public: anonymous submissions from rentalhub.com.ng/survey
// (optionalAuthenticate lets a logged-in marketing agent be attributed).
router.post(
  '/public/submit',
  optionalAuthenticate,
  requireTurnstile('rentalhub_survey'),
  submitPublicSurvey
);

// Public: draft save + resume (no login needed; token-based)
router.post('/public/draft', optionalAuthenticate, savePublicDraft);
router.get('/resume', resumeSurvey);

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
