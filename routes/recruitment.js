const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const recruitmentController = require('../controllers/recruitmentController');
const { authenticate } = require('../config/middleware/auth');
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
router.post('/apply', recruitmentApplyLimiter, recruitmentController.createApplication);
router.put('/applications/:id', recruitmentController.updateApplication);
router.get('/my-application', recruitmentController.getMyApplication);
router.get('/my-applications', recruitmentController.getMyApplications);

// Payment initiation
router.post('/payments/initiate', recruitmentPaymentLimiter, recruitmentController.initiatePayment);
router.post('/payments/verify/:reference', recruitmentController.verifyPayment);
router.post('/payments/webhook', recruitmentPaymentLimiter, recruitmentController.paystackWebhook);

// Access code verification
router.post('/verify-access-code', recruitmentController.verifyAccessCode);

// Document upload (after access code)
router.post('/documents/upload/:applicationId', upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'cover_letter', maxCount: 1 },
  { name: 'guarantor_letter', maxCount: 1 },
  { name: 'government_id', maxCount: 1 },
  { name: 'proof_of_address', maxCount: 1 },
  { name: 'certificates', maxCount: 5 }
]), recruitmentController.uploadDocuments);

// Submit application
router.post('/applications/:id/submit', recruitmentController.submitApplication);

// Download own documents
router.get('/documents/download/:docId', recruitmentController.downloadDocument);
router.get('/documents/download-all/:applicationId', recruitmentController.downloadMyDocumentsZip);
router.post('/documents/generate-cv/:applicationId', recruitmentController.generatePlatformCv);

// Interview routes
router.post('/interview/start', recruitmentInterviewLimiter, recruitmentController.startInterview);
router.get('/interview/start', recruitmentInterviewLimiter, recruitmentController.startInterview);
router.post('/interview/ping', recruitmentInterviewLimiter, recruitmentController.interviewPing);
router.post('/interview/answer', recruitmentInterviewLimiter, recruitmentController.submitAnswer);
router.post('/interview/violation', recruitmentInterviewLimiter, recruitmentController.reportViolation);
router.post('/interview/complete', recruitmentInterviewLimiter, recruitmentController.completeInterview);
router.post('/interview/recording', recordingUpload.single('recording'), recruitmentController.uploadInterviewRecording);

// ==================== ADMIN ROUTES ====================

// Master toggle
router.put('/admin/settings/toggle', authenticate, recruitmentController.toggleRecruitment);

// Cycles management
router.post('/admin/cycles', authenticate, recruitmentController.createCycle);
router.put('/admin/cycles/:id', authenticate, recruitmentController.updateCycle);
router.get('/admin/cycles', authenticate, recruitmentController.getAllCycles);
router.delete('/admin/cycles/:id', authenticate, recruitmentController.deleteCycle);

// Roles management
router.post('/admin/roles', authenticate, recruitmentController.createRole);
router.put('/admin/roles/:id', authenticate, recruitmentController.updateRole);
router.get('/admin/roles', authenticate, recruitmentController.getAllRoles);
router.delete('/admin/roles/:id', authenticate, recruitmentController.deleteRole);

// Location activation
router.put('/admin/locations/toggle', authenticate, recruitmentController.toggleLocation);
router.get('/admin/locations', authenticate, recruitmentController.getLocationActivations);
router.post('/admin/locations/bulk-activate', authenticate, recruitmentController.bulkActivateLocations);

// Applicant list with filters
router.get('/admin/applicants', authenticate, recruitmentController.getApplicants);
router.get('/admin/applicants/:id', authenticate, recruitmentController.getApplicationDetail);

// Process applications
router.post('/admin/applicants/:id/approve', authenticate, recruitmentController.approveApplicant);
router.post('/admin/applicants/:id/reject', authenticate, recruitmentController.rejectApplicant);
router.post('/admin/applicants/:id/shortlist', authenticate, recruitmentController.shortlistApplicant);
router.post('/admin/applicants/bulk-process', authenticate, recruitmentController.bulkProcessApplicants);

// Interview management
router.post('/admin/applicants/:id/set-interview', authenticate, recruitmentController.setInterviewDate);
router.post('/admin/interviews/trigger', authenticate, recruitmentController.triggerInterview);

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
router.post('/admin/email-documents', authenticate, recruitmentController.emailDocuments);
router.post('/admin/email-documents/auto', authenticate, recruitmentController.autoEmailDocuments);

// Questions management
router.post('/admin/questions/bulk', authenticate, recruitmentController.bulkUploadQuestions);
router.post('/admin/questions', authenticate, recruitmentController.createQuestion);
router.get('/admin/questions', authenticate, recruitmentController.getQuestions);
router.put('/admin/questions/:id', authenticate, recruitmentController.updateQuestion);
router.delete('/admin/questions/:id', authenticate, recruitmentController.deleteQuestion);

module.exports = router;
