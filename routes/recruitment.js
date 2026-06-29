const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const recruitmentController = require('../controllers/recruitmentController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const {
  recruitmentApplyLimiter,
  recruitmentPaymentLimiter,
  recruitmentInterviewLimiter,
} = require('../config/middleware/securityRateLimiters');

// Multer config for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'recruitment');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `recruit-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = new Set(['.jpeg', '.jpg', '.png', '.pdf', '.doc', '.docx']);
    const allowedMimes = new Set([
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const isAllowed = allowedExtensions.has(ext) && allowedMimes.has(file.mimetype);
    if (isAllowed) return cb(null, true);
    cb(new Error('Only PDF, images, and Word documents are allowed'));
  }
});

const recordingUpload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(webm|mp4|mpeg|mp3|wav)$/i.test(file.originalname);
    const allowedMime = /^(video|audio)\//i.test(file.mimetype);
    if (allowedExt && allowedMime) return cb(null, true);
    cb(new Error('Only interview audio/video recordings are allowed'));
  }
});

// ==================== PUBLIC ROUTES ====================

// Check if recruitment is active
router.get('/status', recruitmentController.getRecruitmentStatus);

// Get active cycles and roles (public)
router.get('/cycles/active', recruitmentController.getActiveCycles);
router.get('/roles/active', recruitmentController.getActiveRoles);

// Get states and LGAs for location dropdowns
router.get('/locations/states', recruitmentController.getStates);
router.get('/locations/lgas/:state', recruitmentController.getLGAs);

// ==================== PUBLIC / GUEST ROUTES ====================

// Applicant routes (no authentication required - guests can apply)
router.post('/apply',
  [body('full_name').optional().isString().trim().isLength({ max: 255 }),
   body('email').optional().isEmail().normalizeEmail(),
   body('phone').optional().isString().trim().isLength({ max: 20 }),
   body('state_id').optional().isInt(),
   body('lga_id').optional().isInt(),
   body('role_id').optional().isInt()],
  validateRequest,
  recruitmentApplyLimiter, recruitmentController.createApplication);
router.put('/applications/:id', [param('id').isInt()], validateRequest, recruitmentController.updateApplication);
router.get('/my-application', recruitmentController.getMyApplication);
router.get('/my-applications', recruitmentController.getMyApplications);

// Payment initiation
router.post('/payments/initiate',
  [body('amount').isFloat({ min: 0 }), body('application_id').optional().isInt()],
  validateRequest,
  recruitmentPaymentLimiter, recruitmentController.initiatePayment);
router.post('/payments/verify/:reference', [param('reference').isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.verifyPayment);
router.post('/payments/webhook', recruitmentPaymentLimiter, recruitmentController.paystackWebhook);

// Access code verification
router.post('/verify-access-code', [body('code').isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.verifyAccessCode);

// Document upload (after access code)
router.post('/documents/upload/:applicationId', [param('applicationId').isInt()], validateRequest, upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'cover_letter', maxCount: 1 },
  { name: 'guarantor_letter', maxCount: 1 },
  { name: 'government_id', maxCount: 1 },
  { name: 'proof_of_address', maxCount: 1 },
  { name: 'certificates', maxCount: 5 }
]), recruitmentController.uploadDocuments);

// Submit application
router.post('/applications/:id/submit', [param('id').isInt()], validateRequest, recruitmentController.submitApplication);

// Download own documents
router.get('/documents/download/:docId', recruitmentController.downloadDocument);
router.get('/documents/download-all/:applicationId', recruitmentController.downloadMyDocumentsZip);
router.post('/documents/generate-cv/:applicationId', [param('applicationId').isInt()], validateRequest, recruitmentController.generatePlatformCv);

// Interview routes
router.post('/interview/start',
  [body('application_id').isInt(), body('access_code').optional().isString().trim().isLength({ max: 50 })],
  validateRequest, recruitmentInterviewLimiter, recruitmentController.startInterview);
router.get('/interview/start', recruitmentInterviewLimiter, recruitmentController.startInterview);
router.post('/interview/ping',
  [body('application_id').isInt(), body('session_id').optional().isString().trim().isLength({ max: 255 })],
  validateRequest, recruitmentInterviewLimiter, recruitmentController.interviewPing);
router.post('/interview/answer',
  [body('application_id').isInt(), body('question_id').isInt(), body('answer').isString().trim().isLength({ min: 1 })],
  validateRequest, recruitmentInterviewLimiter, recruitmentController.submitAnswer);
router.post('/interview/violation',
  [body('application_id').isInt(), body('type').optional().isString().trim().isLength({ max: 100 }), body('details').optional().isString().trim().isLength({ max: 2000 })],
  validateRequest, recruitmentInterviewLimiter, recruitmentController.reportViolation);
router.post('/interview/complete',
  [body('application_id').isInt()],
  validateRequest, recruitmentInterviewLimiter, recruitmentController.completeInterview);
router.post('/interview/recording',
  [body('application_id').isInt()],
  validateRequest, recordingUpload.single('recording'), recruitmentController.uploadInterviewRecording);

// ==================== ADMIN ROUTES ====================

// Master toggle
router.put('/admin/settings/toggle', authenticate, [body('is_active').isBoolean()], validateRequest, recruitmentController.toggleRecruitment);

// Cycles management
router.post('/admin/cycles', authenticate, [body('name').isString().trim().isLength({ min: 1 }), body('start_date').optional().isString(), body('end_date').optional().isString()], validateRequest, recruitmentController.createCycle);
router.put('/admin/cycles/:id', authenticate, [param('id').isInt(), body('name').optional().isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.updateCycle);
router.get('/admin/cycles', authenticate, recruitmentController.getAllCycles);
router.delete('/admin/cycles/:id', authenticate, [param('id').isInt()], validateRequest, recruitmentController.deleteCycle);

// Roles management
router.post('/admin/roles', authenticate, [body('title').isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.createRole);
router.put('/admin/roles/:id', authenticate, [param('id').isInt(), body('title').optional().isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.updateRole);
router.get('/admin/roles', authenticate, recruitmentController.getAllRoles);
router.delete('/admin/roles/:id', authenticate, [param('id').isInt()], validateRequest, recruitmentController.deleteRole);

// Location activation
router.put('/admin/locations/toggle', authenticate, [body('state_id').isInt(), body('lga_id').optional().isInt()], validateRequest, recruitmentController.toggleLocation);
router.get('/admin/locations', authenticate, recruitmentController.getLocationActivations);
router.post('/admin/locations/bulk-activate', authenticate, [body('locations').isArray({ min: 1 })], validateRequest, recruitmentController.bulkActivateLocations);

// Applicant list with filters
router.get('/admin/applicants', authenticate, recruitmentController.getApplicants);
router.get('/admin/applicants/:id', authenticate, recruitmentController.getApplicationDetail);

// Process applications
router.post('/admin/applicants/:id/approve', authenticate, [param('id').isInt(), body('note').optional().isString().trim().isLength({ max: 2000 })], validateRequest, recruitmentController.approveApplicant);
router.post('/admin/applicants/:id/reject', authenticate, [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 2000 })], validateRequest, recruitmentController.rejectApplicant);
router.post('/admin/applicants/:id/shortlist', authenticate, [param('id').isInt()], validateRequest, recruitmentController.shortlistApplicant);
router.post('/admin/applicants/bulk-process', authenticate, [body('applicant_ids').isArray({ min: 1 }), body('applicant_ids.*').isInt(), body('action').isString().trim().isIn(['approve', 'reject', 'shortlist'])], validateRequest, recruitmentController.bulkProcessApplicants);

// Interview management
router.post('/admin/applicants/:id/set-interview', authenticate, [param('id').isInt(), body('interview_date').isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.setInterviewDate);
router.post('/admin/interviews/trigger', authenticate, [body('cycle_id').optional().isInt()], validateRequest, recruitmentController.triggerInterview);

// Document download (admin)
router.get('/admin/documents/download/:applicationId', authenticate, recruitmentController.downloadApplicationDocs);
router.get('/admin/documents/bulk-download', authenticate, recruitmentController.bulkDownloadDocs);

// PDF Reports
router.get('/admin/reports/applicant/:id', authenticate, recruitmentController.generateApplicantPdf);
router.get('/admin/reports/role/:roleId', authenticate, recruitmentController.generateRolePdf);
router.get('/admin/reports/state/:state', authenticate, recruitmentController.generateStatePdf);
router.get('/admin/reports/lga/:lga', authenticate, recruitmentController.generateLgaPdf);
router.get('/admin/reports/area', authenticate, recruitmentController.generateAreaPdf);

// Analytics
router.get('/admin/analytics', authenticate, recruitmentController.getAnalytics);

// Email documents
router.post('/admin/email-documents', authenticate, [body('application_ids').isArray({ min: 1 }), body('application_ids.*').isInt()], validateRequest, recruitmentController.emailDocuments);
router.post('/admin/email-documents/auto', authenticate, [body('cycle_id').optional().isInt()], validateRequest, recruitmentController.autoEmailDocuments);

// Questions management
router.post('/admin/questions/bulk', authenticate, [body('questions').isArray({ min: 1 })], validateRequest, recruitmentController.bulkUploadQuestions);
router.post('/admin/questions', authenticate, [body('question_text').isString().trim().isLength({ min: 1 }), body('role_id').optional().isInt()], validateRequest, recruitmentController.createQuestion);
router.get('/admin/questions', authenticate, recruitmentController.getQuestions);
router.put('/admin/questions/:id', authenticate, [param('id').isInt(), body('question_text').optional().isString().trim().isLength({ min: 1 })], validateRequest, recruitmentController.updateQuestion);
router.delete('/admin/questions/:id', authenticate, [param('id').isInt()], validateRequest, recruitmentController.deleteQuestion);

module.exports = router;
