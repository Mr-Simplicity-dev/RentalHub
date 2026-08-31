const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { requireTurnstile } = require('../config/middleware/turnstileVerify');
const {
  getMySurveyStatus,
  startSurvey,
  saveSurvey,
  completePartA,
  completeSurvey,
  getSurveyDefinition,
  submitPublicSurvey,
} = require('../services/surveyService');

// Public: question definitions (used by wizard + public page)
router.get('/definition', getSurveyDefinition);

// Public: anonymous submissions from rentalhub.com.ng/survey
router.post(
  '/public/submit',
  requireTurnstile('rentalhub_survey'),
  submitPublicSurvey
);

// Authenticated: gate status + response lifecycle
router.get('/my-status', authenticate, getMySurveyStatus);
router.post('/start', authenticate, startSurvey);
router.post('/save', authenticate, saveSurvey);
router.post('/complete-part-a', authenticate, completePartA);
router.post('/complete', authenticate, completeSurvey);

module.exports = router;
