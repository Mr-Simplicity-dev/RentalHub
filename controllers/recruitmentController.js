const db = require('../config/middleware/database');
const crypto = require('crypto');
const net = require('net');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { sendEmail } = require('../config/utils/mailer');
const { sendSMS } = require('../config/utils/smsService');
const { getFrontendUrl } = require('../config/utils/frontendUrl');

const optionalRequire = (moduleName, featureName) => {
  try {
    return require(moduleName);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }

    console.error(`${featureName} dependency "${moduleName}" is not installed. Run npm install before using this feature.`);
    return null;
  }
};

const PDFDocument = optionalRequire('pdfkit', 'Recruitment PDF');
const archiver = optionalRequire('archiver', 'Recruitment ZIP export');

const sendMissingDependency = (res, featureName, packageName) =>
  res.status(503).json({
    success: false,
    message: `${featureName} is temporarily unavailable because ${packageName} is not installed on the server.`,
  });

// ==================== Helper Functions ====================

const normalizePhoneForCheck = (value) => String(value || '').replace(/\D/g, '');

const generateAccessCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RH-CR-${code}`;
};

const generateReferenceNumber = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RH-APP-${ref}`;
};

const isRecruitmentAdmin = async (userId) => {
  let result;
  try {
    result = await db.query(
      `SELECT user_type, is_recruitment_admin FROM users WHERE id = $1`,
      [userId]
    );
  } catch (e) {
    // Fallback if is_recruitment_admin column doesn't exist (migration 063 not run)
    result = await db.query(
      `SELECT user_type FROM users WHERE id = $1`,
      [userId]
    );
  }
  if (!result.rows.length) return false;
  const user = result.rows[0];
  return user.user_type === 'super_admin' || 
         user.user_type === 'admin' || 
         user.user_type === 'recruitment_admin' ||
         user.is_recruitment_admin === true;
};

const isAdmin = async (userId) => {
  const result = await db.query(
    `SELECT user_type FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows.length) return false;
  const user = result.rows[0];
  return ['super_admin', 'admin', 'recruitment_admin'].includes(user.user_type);
};

// ==================== PUBLIC ROUTES ====================
exports.getActiveCycles = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM recruitment_cycles 
       WHERE is_active = TRUE 
       AND open_date <= CURRENT_DATE 
       AND COALESCE(extension_date, close_date) >= CURRENT_DATE
       ORDER BY open_date DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getActiveCycles error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getActiveRoles = async (req, res) => {
  try {
    const { cycle_id } = req.query;
    let query;
    let params;
    
    if (cycle_id) {
      query = `SELECT * FROM recruitment_roles WHERE is_active = TRUE AND cycle_id = $1 ORDER BY title`;
      params = [cycle_id];
    } else {
      query = `SELECT r.* FROM recruitment_roles r
               JOIN recruitment_cycles c ON r.cycle_id = c.id
               WHERE r.is_active = TRUE AND c.is_active = TRUE 
               AND c.open_date <= CURRENT_DATE AND COALESCE(c.extension_date, c.close_date) >= CURRENT_DATE
               ORDER BY r.title`;
      params = [];
    }
    
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getActiveRoles error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getStates = async (req, res) => {
  try {
    const locations = require('../data/nigeriaLocations');
    const states = locations.map(l => ({
      name: l.state,
      displayName: l.displayName,
      slug: l.slug
    }));
    res.json({ success: true, data: states });
  } catch (err) {
    console.error('getStates error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getLGAs = async (req, res) => {
  try {
    const { state } = req.params;
    const locations = require('../data/nigeriaLocations');
    const found = locations.find(l => 
      l.state.toLowerCase() === state.toLowerCase() || 
      l.displayName.toLowerCase() === state.toLowerCase() ||
      l.slug.toLowerCase() === state.toLowerCase()
    );
    
    if (!found) {
      return res.status(404).json({ success: false, message: 'State not found' });
    }
    
    res.json({ success: true, data: found.lgas });
  } catch (err) {
    console.error('getLGAs error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== AUTHENTICATED ROUTES ====================

exports.updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    const app = await db.query(
      'SELECT * FROM recruitment_applications WHERE id = $1',
      [id]
    );
    if (!app.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    const application = app.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;
    if (application.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Can only edit draft applications' });
    }
    
    const allowedFields = [
      'full_name', 'phone_number', 'email_address', 'state_name', 'lga_name',
      'area_locality', 'residential_address', 'date_of_birth', 'highest_education',
      'years_of_experience', 'current_employment_status', 'skills_qualifications',
      'suitability_reason'
    ];
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }
    
    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE recruitment_applications SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
    
    const result = await db.query(query, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateApplication error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getMyApplication = async (req, res) => {
  try {
    const { email, referenceNumber } = getApplicantAccessInput(req);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required' });
    }
    const params = [email];
    const referenceFilter = referenceNumber
      ? `AND UPPER(a.reference_number) = $${params.push(referenceNumber)}`
      : '';
    const result = await db.query(
      `SELECT a.*, r.title as role_title, r.type as role_type,
              c.title as cycle_title, c.close_date as cycle_close_date
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       WHERE LOWER(a.email_address) = LOWER($1)
       ${referenceFilter}
       ORDER BY a.created_at DESC
       LIMIT 1`,
      params
    );
    
    if (!result.rows.length) {
      return res.json({ success: true, data: null });
    }
    
    // Get documents
    const docs = await db.query(
      'SELECT * FROM recruitment_documents WHERE application_id = $1',
      [result.rows[0].id]
    );
    
    const application = stripPublicApplicationSecrets(result.rows[0]);
    if (!referenceNumber) {
      delete application.access_code;
    }

    res.json({ 
      success: true, 
      data: { ...application, documents: referenceNumber ? docs.rows : [] }
    });
  } catch (err) {
    console.error('getMyApplication error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const { email } = getApplicantAccessInput(req);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required' });
    }
    const result = await db.query(
      `SELECT a.*, r.title as role_title, r.type as role_type,
              c.title as cycle_title
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       WHERE LOWER(a.email_address) = LOWER($1)
       ORDER BY a.created_at DESC`,
      [email]
    );
    const rows = result.rows.map((row) => {
      const safeRow = stripPublicApplicationSecrets(row);
      delete safeRow.access_code;
      delete safeRow.payment_reference;
      return safeRow;
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getMyApplications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== PAYMENT ====================


exports.verifyAccessCode = async (req, res) => {
  try {
    const { access_code, application_id } = req.body;
    
    if (!access_code || !application_id) {
      return res.status(400).json({ success: false, message: 'Access code and application ID required' });
    }
    
    const app = await db.query(
      'SELECT * FROM recruitment_applications WHERE id = $1',
      [application_id]
    );
    if (!app.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    const application = app.rows[0];
    if (!requirePublicApplicationAccess(req, res, application, { allowAccessCode: true })) return;

    if (application.access_code_used) {
      return res.status(400).json({ success: false, message: 'Access code has already been used' });
    }
    
    if (application.access_code !== access_code.trim().toUpperCase()) {
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }
    
    // Check expiry in the database timezone (based on cycle close/extension date)
    const cycleResult = await db.query(
      `SELECT id
       FROM recruitment_cycles
       WHERE id = $1
         AND COALESCE(extension_date, close_date) >= CURRENT_DATE`,
      [application.cycle_id]
    );
    if (!cycleResult.rows.length) {
      return res.status(400).json({ success: false, message: 'Access code has expired' });
    }
    
    // Mark as used
    await db.query(
      'UPDATE recruitment_applications SET access_code_used = TRUE, updated_at = NOW() WHERE id = $1',
      [application_id]
    );
    
    res.json({
      success: true,
      message: 'Access code verified successfully. You can now upload your documents.'
    });
  } catch (err) {
    console.error('verifyAccessCode error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== DOCUMENTS ====================

exports.uploadDocuments = async (req, res) => {
  try {
    const { applicationId } = req.params;
    
    const app = await db.query(
      'SELECT * FROM recruitment_applications WHERE id = $1',
      [applicationId]
    );
    if (!app.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    const application = app.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;

    if (!application.access_code_used || application.payment_status !== 'paid') {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your access code before uploading documents' 
      });
    }
    
    const docs = [];
    const documentTypes = ['cv', 'cover_letter', 'guarantor_letter', 'government_id', 'proof_of_address', 'certificates'];
    
    for (const docType of documentTypes) {
      const files = req.files[docType];
      if (files && files.length > 0) {
        for (const file of files) {
          const result = await db.query(
            `INSERT INTO recruitment_documents (application_id, document_type, file_name, file_path, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [applicationId, docType === 'certificates' ? 'certificate' : docType, 
             file.originalname, file.path, file.size, file.mimetype]
          );
          docs.push(result.rows[0]);
        }
      }
    }
    
    res.json({ success: true, data: docs, message: 'Documents uploaded successfully' });
  } catch (err) {
    console.error('uploadDocuments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.submitApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    const app = await db.query(
      'SELECT * FROM recruitment_applications WHERE id = $1',
      [id]
    );
    if (!app.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    const application = app.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;

    if (application.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Application already submitted' });
    }
    
    // Check payment
    if (application.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Payment is required before submission' });
    }
    
    // Check access code used
    if (!application.access_code_used) {
      return res.status(400).json({ success: false, message: 'Please verify your access code first' });
    }
    
    // Check required documents (CV, Cover Letter, Guarantor Letter, Gov ID, Proof of Address)
    const docCheck = await db.query(
      `SELECT DISTINCT document_type FROM recruitment_documents WHERE application_id = $1`,
      [id]
    );
    const uploadedTypes = docCheck.rows.map(r => r.document_type);
    const required = ['cv', 'cover_letter', 'guarantor_letter', 'government_id', 'proof_of_address'];
    const missing = required.filter(r => !uploadedTypes.includes(r));
    
    if (missing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required documents: ${missing.join(', ')}` 
      });
    }
    
    await db.query(
      `UPDATE recruitment_applications SET status = 'submitted', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    
    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    console.error('submitApplication error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    
    const doc = await db.query(
      `SELECT d.*, a.email_address, a.reference_number, a.access_code
       FROM recruitment_documents d
       JOIN recruitment_applications a ON a.id = d.application_id
       WHERE d.id = $1`,
      [docId]
    );
    
    if (!doc.rows.length) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    
    if (!requirePublicApplicationAccess(req, res, doc.rows[0])) return;

    const filePath = doc.rows[0].file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }
    
    res.download(filePath, doc.rows[0].file_name);
  } catch (err) {
    console.error('downloadDocument error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.downloadMyDocumentsZip = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const app = await db.query(
      'SELECT id, email_address, reference_number, access_code FROM recruitment_applications WHERE id = $1',
      [applicationId]
    );

    if (!app.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    if (!requirePublicApplicationAccess(req, res, app.rows[0])) return;

    const docs = await db.query(
      `SELECT d.*, a.reference_number
       FROM recruitment_documents d
       JOIN recruitment_applications a ON a.id = d.application_id
       WHERE d.application_id = $1`,
      [applicationId]
    );

    if (!docs.rows.length) {
      return res.status(404).json({ success: false, message: 'No submitted documents found' });
    }

    return streamDocumentsZip(
      res,
      docs.rows,
      `${safeFileSegment(app.rows[0].reference_number || applicationId)}_documents.zip`
    );
  } catch (err) {
    console.error('downloadMyDocumentsZip error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to download documents' });
  }
};

exports.generatePlatformCv = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const appResult = await db.query(
      `SELECT a.*, r.title AS role_title
       FROM recruitment_applications a
       JOIN recruitment_roles r ON r.id = a.role_id
       WHERE a.id = $1`,
      [applicationId]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const application = appResult.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;

    if (!application.access_code_used || application.payment_status !== 'paid') {
      return res.status(403).json({
        success: false,
        message: 'Please pay and verify your access code before generating a CV',
      });
    }

    const cv = req.body || {};
    const requiredFields = {
      bio: cv.bio,
      address: cv.address,
      phone: cv.phone,
      email: cv.email,
      education: cv.education,
      experience: cv.experience,
      skills: cv.skills,
    };

    const missing = Object.entries(requiredFields)
      .filter(([, value]) => !String(value || '').trim())
      .map(([key]) => key);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing CV fields: ${missing.join(', ')}`,
      });
    }

    const uploadDir = path.join(__dirname, '..', 'uploads', 'recruitment');
    fs.mkdirSync(uploadDir, { recursive: true });

    if (!PDFDocument) {
      return sendMissingDependency(res, 'CV PDF generation', 'pdfkit');
    }

    const filename = `platform-cv-${application.id}-${Date.now()}.pdf`;
    const filePath = path.join(uploadDir, filename);

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const stream = fs.createWriteStream(filePath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      doc.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(22).font('Helvetica-Bold').text(application.full_name || cv.full_name || 'Applicant');
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text(`${cv.phone} | ${cv.email}`);
      doc.text(cv.address);
      doc.moveDown();

      const section = (title, body) => {
        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(title.toUpperCase());
        doc.moveDown(0.3);
        doc.fillColor('#334155').fontSize(10).font('Helvetica').text(String(body || '-'), {
          lineGap: 3,
        });
        doc.moveDown();
      };

      section('Professional Profile', cv.bio);
      section('Education', cv.education);
      section('Experience', cv.experience);
      section('Skills and Qualifications', cv.skills);
      section('Role Applied For', application.role_title || 'RentalHub NG recruitment role');

      doc.fontSize(8).fillColor('#94a3b8').text(
        `Generated by RentalHub NG Careers on ${new Date().toLocaleString('en-NG')}`,
        48,
        780,
        { align: 'center' }
      );

      doc.end();
    });

    const stat = fs.statSync(filePath);
    const inserted = await db.query(
      `INSERT INTO recruitment_documents (application_id, document_type, file_name, file_path, file_size, mime_type)
       VALUES ($1, 'cv', $2, $3, $4, 'application/pdf')
       RETURNING *`,
      [application.id, filename, filePath, stat.size]
    );

    res.json({
      success: true,
      data: inserted.rows[0],
      message: 'Platform CV generated and attached successfully',
    });
  } catch (err) {
    console.error('generatePlatformCv error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate platform CV' });
  }
};

// ==================== INTERVIEW ====================

exports.startInterview = async (req, res) => {
  try {
    const submittedPhone = normalizePhoneForCheck(req.body?.phone_number || req.query?.phone_number);
    const fingerprint = normalizeText(req.body?.fingerprint || req.query?.fingerprint).slice(0, 300);
    const userAgent = normalizeText(req.headers['user-agent']).slice(0, 500);
    const requestedApplicationId = req.body?.application_id || req.query?.application_id;
    const { email, referenceNumber } = getApplicantAccessInput(req);

    if (!submittedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number confirmation is required before starting the interview',
      });
    }

    const identityParams = [];
    let identitySQL = '';
    if (requestedApplicationId) {
      identityParams.push(requestedApplicationId);
      identitySQL = `a.id = $${identityParams.length}`;
    } else if (email && referenceNumber) {
      identityParams.push(email, referenceNumber);
      identitySQL = `LOWER(a.email_address) = LOWER($1) AND UPPER(a.reference_number) = $2`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Application reference is required before starting the interview',
      });
    }
    
    const app = await db.query(
      `SELECT a.*, c.close_date, c.extension_date
       FROM recruitment_applications a
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       WHERE ${identitySQL}
         AND a.status = 'shortlisted'
         AND a.interview_activated = TRUE
         AND COALESCE(c.extension_date, c.close_date) >= CURRENT_DATE
       ORDER BY a.interview_date NULLS LAST, a.created_at DESC
       LIMIT 1`,
      identityParams
    );
    
    if (!app.rows.length) {
      return res.status(403).json({ 
        success: false, 
        message: 'You have not been invited for an interview or interview is not yet activated' 
      });
    }
    
    const application = app.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;

    if (normalizePhoneForCheck(application.phone_number) !== submittedPhone) {
      return res.status(403).json({
        success: false,
        message: 'Phone number does not match this recruitment application',
      });
    }
    
    // Check if interview date is today
    if (application.interview_date) {
      const interviewDate = new Date(application.interview_date);
      const now = new Date();
      if (now < interviewDate) {
        return res.status(403).json({ 
          success: false, 
          message: 'Your interview has not started yet. Please wait until the scheduled time.' 
        });
      }
    }
    
    let questions = await db.query(
      `SELECT q.id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.category, ia.question_order
       FROM recruitment_interview_assignments ia
       JOIN recruitment_questions q ON q.id = ia.question_id
       WHERE ia.application_id = $1
       ORDER BY ia.question_order`,
      [application.id]
    );

    if (questions.rows.length < 50) {
      await db.query('DELETE FROM recruitment_interview_assignments WHERE application_id = $1', [application.id]);
      questions = await db.query(
        `SELECT id, question, option_a, option_b, option_c, option_d, category
         FROM recruitment_questions
         WHERE is_active = TRUE
         ORDER BY RANDOM()
         LIMIT 50`
      );

      if (questions.rows.length < 50) {
        return res.status(400).json({
          success: false,
          message: 'Not enough questions in the pool. Contact support.',
        });
      }

      const values = [];
      const valueParams = [];
      questions.rows.forEach((q, index) => {
        const offset = index * 2;
        valueParams.push(`($${offset + 1}, $${offset + 2}, ${index + 1})`);
        values.push(application.id, q.id);
      });

      await db.query(
        `INSERT INTO recruitment_interview_assignments (application_id, question_id, question_order)
         VALUES ${valueParams.join(', ')}`,
        values
      );
    }

    const challengeToken = crypto.randomBytes(32).toString('hex');
    
    // Mark interview as started
    await db.query(
      `UPDATE recruitment_applications
       SET interview_started_at = COALESCE(interview_started_at, NOW()),
           interview_completed = FALSE,
           interview_fingerprint = COALESCE(NULLIF($2, ''), interview_fingerprint),
           interview_user_agent = COALESCE(NULLIF($3, ''), interview_user_agent),
           interview_challenge_token = $4,
           interview_last_ping_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [application.id, fingerprint, userAgent, challengeToken]
    );
    
    res.json({
      success: true,
      data: {
        application_id: application.id,
        total_questions: questions.rows.length,
        challenge_token: challengeToken,
        questions: questions.rows.map(q => ({
          id: q.id,
          question: q.question,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          category: q.category
        }))
      }
    });
  } catch (err) {
    console.error('startInterview error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const { question_id, answer, challenge_token, fingerprint, application_id } = req.body;
    const normalizedAnswer = String(answer || '').trim().toUpperCase().slice(0, 1);
    
    if (!question_id || !normalizedAnswer) {
      return res.status(400).json({ success: false, message: 'Question ID and answer required' });
    }

    if (!['A', 'B', 'C', 'D', 'X'].includes(normalizedAnswer)) {
      return res.status(400).json({ success: false, message: 'Answer must be A, B, C, D, or X for timeout' });
    }

    if (!application_id) {
      return res.status(400).json({ success: false, message: 'Application ID is required' });
    }
    
    // Get application
    const appResult = await db.query(
      `SELECT id, interview_started_at, interview_challenge_token, interview_fingerprint,
              interview_user_agent, interview_security_log
       FROM recruitment_applications
       WHERE id = $1
         AND interview_started_at IS NOT NULL
         AND interview_completed = FALSE`,
      [application_id]
    );
    if (!appResult.rows.length) {
      return res.status(403).json({ success: false, message: 'No active interview found' });
    }
    
    const application = appResult.rows[0];
    const applicationId = application.id;

    if (application.interview_challenge_token && challenge_token !== application.interview_challenge_token) {
      return res.status(403).json({ success: false, message: 'Interview session challenge failed' });
    }

    if (
      application.interview_fingerprint &&
      fingerprint &&
      normalizeText(fingerprint) !== normalizeText(application.interview_fingerprint)
    ) {
      await db.query(
        `UPDATE recruitment_applications
         SET interview_security_log = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [applicationId, appendSecurityLog(application.interview_security_log, 'Browser fingerprint changed during interview')]
      );
      return res.status(403).json({ success: false, message: 'Interview browser fingerprint changed' });
    }
    
    // Check for violations
    const violationCheck = await db.query(
      'SELECT violation_detected FROM recruitment_applications WHERE id = $1',
      [applicationId]
    );
    if (violationCheck.rows[0]?.violation_detected) {
      return res.status(403).json({ 
        success: false, 
        message: 'Interview disqualified due to violation' 
      });
    }
    
    const assignmentResult = await db.query(
      `SELECT ia.*, q.correct_answer
       FROM recruitment_interview_assignments ia
       JOIN recruitment_questions q ON q.id = ia.question_id
       WHERE ia.application_id = $1
       ORDER BY ia.question_order`,
      [applicationId]
    );

    const assignments = assignmentResult.rows;
    const nextAssignment = assignments.find((item) => !item.answered_at);
    if (!nextAssignment) {
      return res.status(400).json({ success: false, message: 'All interview questions have already been answered' });
    }

    if (String(nextAssignment.question_id) !== String(question_id)) {
      return res.status(409).json({
        success: false,
        message: 'Questions must be answered in the assigned order',
      });
    }
    
    const previousAnsweredAt = assignments
      .filter((item) => item.answered_at)
      .map((item) => new Date(item.answered_at).getTime())
      .sort((a, b) => b - a)[0];
    const baselineTime = previousAnsweredAt || new Date(application.interview_started_at).getTime();
    const elapsedSeconds = Math.max((Date.now() - baselineTime) / 1000, 0);
    const lateAnswer = normalizedAnswer !== 'X' && elapsedSeconds > QUESTION_TIME_LIMIT_SECONDS + QUESTION_TIME_GRACE_SECONDS;
    const tooFastAnswer = normalizedAnswer !== 'X' && elapsedSeconds < MIN_ANSWER_SECONDS;
    const timingViolation = lateAnswer || tooFastAnswer;
    const correctAnswer = nextAssignment.correct_answer;
    const isCorrect = normalizedAnswer === correctAnswer;
    
    await db.query(
      `UPDATE recruitment_interview_assignments 
       SET answer_given = $1,
           is_correct = $2,
           answered_at = NOW(),
           answer_elapsed_seconds = $5,
           timing_violation = $6
       WHERE application_id = $3 AND question_id = $4`,
      [normalizedAnswer, isCorrect, applicationId, question_id, Math.round(elapsedSeconds), timingViolation]
    );

    if (timingViolation) {
      const reason = lateAnswer
        ? `Late answer on question ${nextAssignment.question_order}: ${Math.round(elapsedSeconds)} seconds`
        : `Suspiciously fast answer on question ${nextAssignment.question_order}: ${elapsedSeconds.toFixed(2)} seconds`;
      await db.query(
        `UPDATE recruitment_applications
         SET interview_security_log = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [applicationId, appendSecurityLog(application.interview_security_log, reason)]
      );
    }
    
    res.json({ success: true, data: { is_correct: isCorrect, timing_violation: timingViolation } });
  } catch (err) {
    console.error('submitAnswer error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.reportViolation = async (req, res) => {
  try {
    const { violation_type, details, challenge_token, fingerprint, application_id } = req.body;
    
    if (!application_id) {
      return res.status(400).json({ success: false, message: 'Application ID is required' });
    }
    
    const appResult = await db.query(
      `SELECT id, interview_challenge_token, interview_fingerprint
       FROM recruitment_applications
       WHERE id = $1 AND interview_started_at IS NOT NULL`,
      [application_id]
    );
    if (!appResult.rows.length) {
      return res.status(403).json({ success: false, message: 'No active interview found' });
    }
    
    const application = appResult.rows[0];

    if (application.interview_challenge_token && challenge_token !== application.interview_challenge_token) {
      return res.status(403).json({ success: false, message: 'Interview session challenge failed' });
    }

    if (
      application.interview_fingerprint &&
      fingerprint &&
      normalizeText(fingerprint) !== normalizeText(application.interview_fingerprint)
    ) {
      return res.status(403).json({ success: false, message: 'Interview browser fingerprint changed' });
    }
    
    await db.query(
      `UPDATE recruitment_applications 
       SET violation_detected = TRUE, 
           violation_details = COALESCE(violation_details || E'\n', '') || $1,
           status = 'disqualified',
           disqualified_reason = $1,
           disqualified_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [`Violation: ${violation_type || 'Unknown'} - ${details || 'No details'}`, application.id]
    );
    
    res.json({ 
      success: true, 
      message: 'Violation recorded. Interview terminated.',
      disqualified: true
    });
  } catch (err) {
    console.error('reportViolation error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.interviewPing = async (req, res) => {
  try {
    const { challenge_token, fingerprint, application_id } = req.body || {};

    if (!application_id) {
      return res.status(400).json({ success: false, message: 'Application ID is required' });
    }

    const appResult = await db.query(
      `SELECT id, interview_challenge_token, interview_fingerprint, interview_security_log
       FROM recruitment_applications
       WHERE id = $1
         AND interview_started_at IS NOT NULL
         AND interview_completed = FALSE
       LIMIT 1`,
      [application_id]
    );

    if (!appResult.rows.length) {
      return res.status(403).json({ success: false, message: 'No active interview found' });
    }

    const application = appResult.rows[0];
    if (application.interview_challenge_token && challenge_token !== application.interview_challenge_token) {
      return res.status(403).json({ success: false, message: 'Interview session challenge failed' });
    }

    if (
      application.interview_fingerprint &&
      fingerprint &&
      normalizeText(fingerprint) !== normalizeText(application.interview_fingerprint)
    ) {
      await db.query(
        `UPDATE recruitment_applications
         SET interview_security_log = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [application.id, appendSecurityLog(application.interview_security_log, 'Browser fingerprint changed on interview ping')]
      );
      return res.status(403).json({ success: false, message: 'Interview browser fingerprint changed' });
    }

    await db.query(
      `UPDATE recruitment_applications
       SET interview_last_ping_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [application.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('interviewPing error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.completeInterview = async (req, res) => {
  try {
    const { application_id, challenge_token, fingerprint } = req.body;

    if (!application_id) {
      return res.status(400).json({ success: false, message: 'Application ID is required' });
    }
    
    const appResult = await db.query(
      `SELECT id, interview_last_ping_at, interview_security_log,
              interview_challenge_token, interview_fingerprint
       FROM recruitment_applications
       WHERE id = $1
         AND interview_started_at IS NOT NULL
         AND interview_completed = FALSE`,
      [application_id]
    );
    if (!appResult.rows.length) {
      return res.status(403).json({ success: false, message: 'No active interview found' });
    }
    
    const application = appResult.rows[0];
    const applicationId = application.id;

    if (application.interview_challenge_token && challenge_token !== application.interview_challenge_token) {
      return res.status(403).json({ success: false, message: 'Interview session challenge failed' });
    }

    if (
      application.interview_fingerprint &&
      fingerprint &&
      normalizeText(fingerprint) !== normalizeText(application.interview_fingerprint)
    ) {
      await db.query(
        `UPDATE recruitment_applications
         SET interview_security_log = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [applicationId, appendSecurityLog(application.interview_security_log, 'Browser fingerprint changed before interview completion')]
      );
      return res.status(403).json({ success: false, message: 'Interview browser fingerprint changed' });
    }

    if (
      application.interview_last_ping_at &&
      ((Date.now() - new Date(application.interview_last_ping_at).getTime()) / 1000) > INTERVIEW_PING_STALE_SECONDS
    ) {
      await db.query(
        `UPDATE recruitment_applications
         SET interview_security_log = $2
         WHERE id = $1`,
        [applicationId, appendSecurityLog(application.interview_security_log, 'Interview completed after stale heartbeat')]
      );
    }
    
    // Calculate score
    const answered = await db.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
       FROM recruitment_interview_assignments WHERE application_id = $1`,
      [applicationId]
    );
    
    const total = parseInt(answered.rows[0].total) || 0;
    const correct = parseInt(answered.rows[0].correct) || 0;
    const score = total > 0 ? (correct / total) * 100 : 0;
    const passed = score >= 50; // Pass mark 50%
    
    await db.query(
      `UPDATE recruitment_applications 
       SET interview_score = $1, interview_passed = $2, 
           interview_completed = TRUE, interview_completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [score, passed, applicationId]
    );
    
    res.json({
      success: true,
      data: {
        total_questions: total,
        correct_answers: correct,
        score: Math.round(score),
        passed
      }
    });
  } catch (err) {
    console.error('completeInterview error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN ROUTES ====================

exports.createCycle = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { title, open_date, close_date, extension_date } = req.body;
    
    const result = await db.query(
      `INSERT INTO recruitment_cycles (title, open_date, close_date, extension_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, open_date, close_date, extension_date, req.user.id]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createCycle error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateCycle = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { title, open_date, close_date, extension_date, is_active } = req.body;
    
    const result = await db.query(
      `UPDATE recruitment_cycles 
       SET title = COALESCE($1, title),
           open_date = COALESCE($2, open_date),
           close_date = COALESCE($3, close_date),
           extension_date = COALESCE($4, extension_date),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title, open_date, close_date, extension_date, is_active, id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Cycle not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateCycle error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getAllCycles = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const result = await db.query(
      'SELECT * FROM recruitment_cycles ORDER BY created_at DESC'
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getAllCycles error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteCycle = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    await db.query('DELETE FROM recruitment_cycles WHERE id = $1', [id]);
    res.json({ success: true, message: 'Cycle deleted' });
  } catch (err) {
    console.error('deleteCycle error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Roles CRUD
exports.createRole = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { title, type, description, application_fee, premium_fee, cycle_id } = req.body;
    
    const result = await db.query(
      `INSERT INTO recruitment_roles (title, type, description, application_fee, premium_fee, cycle_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, type, description, application_fee || 5000, premium_fee || 8000, cycle_id]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createRole error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { title, type, description, application_fee, premium_fee, is_active } = req.body;
    
    const result = await db.query(
      `UPDATE recruitment_roles 
       SET title = COALESCE($1, title),
           type = COALESCE($2, type),
           description = COALESCE($3, description),
           application_fee = COALESCE($4, application_fee),
           premium_fee = COALESCE($5, premium_fee),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
            [title, type, description, application_fee, premium_fee, is_active, id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateRole error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getAllRoles = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { cycle_id } = req.query;
    let query;
    let params;
    
    if (cycle_id) {
      query = 'SELECT * FROM recruitment_roles WHERE cycle_id = $1 ORDER BY title';
      params = [cycle_id];
    } else {
      query = `SELECT r.*, c.title as cycle_title 
               FROM recruitment_roles r 
               JOIN recruitment_cycles c ON r.cycle_id = c.id 
               ORDER BY c.created_at DESC, r.title`;
      params = [];
    }
    
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getAllRoles error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    await db.query('DELETE FROM recruitment_roles WHERE id = $1', [id]);
    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    console.error('deleteRole error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN: APPLICATIONS ====================

exports.getAllApplications = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { status, cycle_id, role_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClauses = [];
    let params = [];
    let paramCount = 1;
    
    if (status) {
      whereClauses.push(`a.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }
    
    if (cycle_id) {
      whereClauses.push(`a.cycle_id = $${paramCount}`);
      params.push(cycle_id);
      paramCount++;
    }
    
    if (role_id) {
      whereClauses.push(`a.role_id = $${paramCount}`);
      params.push(role_id);
      paramCount++;
    }
    
    if (search) {
      whereClauses.push(`(a.full_name ILIKE $${paramCount} OR a.reference_number ILIKE $${paramCount} OR a.email_address ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }
    
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const countResult = await db.query(
      `SELECT COUNT(*) FROM recruitment_applications a ${whereSQL}`, params
    );
    const total = parseInt(countResult.rows[0].count);
    
    params.push(limit);
    params.push(offset);
    
    const result = await db.query(
      `SELECT a.*, r.title as role_title, r.type as role_type, c.title as cycle_title
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       ${whereSQL}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('getAllApplications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getApplicationDetail = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT a.*, r.title as role_title, r.type as role_type, r.description as role_description,
              c.title as cycle_title, c.open_date, c.close_date,
              u.email as user_email, u.phone as user_phone
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    // Get documents
    const docs = await db.query(
      'SELECT * FROM recruitment_documents WHERE application_id = $1',
      [id]
    );
    
    // Get interview answers if any
    let interviewAnswers = [];
    if (result.rows[0].interview_started_at) {
      const answers = await db.query(
        `SELECT ia.*, q.question, q.category
         FROM recruitment_interview_assignments ia
         JOIN recruitment_questions q ON ia.question_id = q.id
         WHERE ia.application_id = $1
         ORDER BY ia.question_order`,
        [id]
      );
      interviewAnswers = answers.rows;
    }
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        documents: docs.rows,
        interview_answers: interviewAnswers
      }
    });
  } catch (err) {
    console.error('getApplicationDetail error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { status, admin_notes, shortlist_reason, rejection_reason } = req.body;
    
    const validStatuses = ['submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'disqualified'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    const updateFields = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let paramCount = 2;
    
    if (admin_notes !== undefined) {
      updateFields.push(`admin_notes = $${paramCount}`);
      params.push(admin_notes);
      paramCount++;
    }
    
    if (shortlist_reason !== undefined && status === 'shortlisted') {
      updateFields.push(`shortlist_reason = $${paramCount}`);
      params.push(shortlist_reason);
      paramCount++;
    }
    
    if (rejection_reason !== undefined && (status === 'rejected' || status === 'disqualified')) {
      updateFields.push(`disqualified_reason = $${paramCount}`);
      params.push(rejection_reason);
      paramCount++;
    }
    
    params.push(id);
    
    const result = await db.query(
      `UPDATE recruitment_applications SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    // Generate access code if shortlisted
    if (status === 'shortlisted') {
      const accessCode = generateAccessCode();
      await db.query(
        'UPDATE recruitment_applications SET access_code = $1 WHERE id = $2',
        [accessCode, id]
      );
      result.rows[0].access_code = accessCode;
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateApplicationStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.assignApplicationToStage = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { stage } = req.body;
    
    const validStages = ['document_review', 'interview', 'background_check', 'final_review', 'onboarding'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ success: false, message: 'Invalid stage' });
    }
    
    const result = await db.query(
      `UPDATE recruitment_applications SET current_stage = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [stage, id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('assignApplicationToStage error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN: INTERVIEW MANAGEMENT ====================

exports.activateInterview = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { interview_date } = req.body;
    
    const result = await db.query(
      `UPDATE recruitment_applications 
       SET interview_activated = TRUE, interview_date = $1, updated_at = NOW() 
       WHERE id = $2 RETURNING *`,
      [interview_date, id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('activateInterview error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN: BULK DOWNLOAD ====================

exports.bulkDownloadDocuments = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!archiver) {
      return sendMissingDependency(res, 'Recruitment document ZIP download', 'archiver');
    }
    
    const { application_ids } = req.body;
    
    if (!application_ids || !application_ids.length) {
      return res.status(400).json({ success: false, message: 'No applications selected' });
    }
    
    const placeholders = application_ids.map((_, i) => `$${i + 1}`).join(',');
    
    const docs = await db.query(
      `SELECT d.*, a.full_name, a.reference_number 
       FROM recruitment_documents d
       JOIN recruitment_applications a ON d.application_id = a.id
       WHERE d.application_id IN (${placeholders})`,
      application_ids
    );
    
    // Create a zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('recruitment_documents.zip');
    archive.pipe(res);
    
    for (const doc of docs.rows) {
      if (fs.existsSync(doc.file_path)) {
        archive.file(doc.file_path, {
          name: `${doc.reference_number}/${doc.document_type}_${doc.file_name}`
        });
      }
    }
    
    await archive.finalize();
  } catch (err) {
    console.error('bulkDownloadDocuments error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN: QUESTIONS ====================

exports.createQuestion = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { question, option_a, option_b, option_c, option_d, correct_answer, category } = req.body;
    
    if (!question || !option_a || !option_b || !option_c || !option_d || !correct_answer || !category) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    const validAnswers = ['A', 'B', 'C', 'D'];
    if (!validAnswers.includes(correct_answer.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Correct answer must be A, B, C, or D' });
    }
    
    const result = await db.query(
      `INSERT INTO recruitment_questions (question, option_a, option_b, option_c, option_d, correct_answer, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [question, option_a, option_b, option_c, option_d, correct_answer.toUpperCase(), category, req.user.id]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createQuestion error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getAllQuestions = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { category, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    let params = [];
    let paramCount = 1;
    
    if (category) {
      whereClause = `WHERE category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    const countResult = await db.query(
      `SELECT COUNT(*) FROM recruitment_questions ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);
    
    params.push(limit);
    params.push(offset);
    
    const result = await db.query(
      `SELECT * FROM recruitment_questions ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('getAllQuestions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    const { question, option_a, option_b, option_c, option_d, correct_answer, category, is_active } = req.body;
    
    const result = await db.query(
      `UPDATE recruitment_questions 
       SET question = COALESCE($1, question),
           option_a = COALESCE($2, option_a),
           option_b = COALESCE($3, option_b),
           option_c = COALESCE($4, option_c),
           option_d = COALESCE($5, option_d),
           correct_answer = COALESCE($6, correct_answer),
           category = COALESCE($7, category),
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [question, option_a, option_b, option_c, option_d, correct_answer ? correct_answer.toUpperCase() : null, category, is_active, id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateQuestion error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { id } = req.params;
    await db.query('DELETE FROM recruitment_questions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error('deleteQuestion error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ADMIN: DASHBOARD / STATS ====================

exports.getRecruitmentStats = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { cycle_id } = req.query;
    
    let cycleFilter = '';
    let params = [];
    
    if (cycle_id) {
      cycleFilter = 'WHERE cycle_id = $1';
      params = [cycle_id];
    }
    
    const totalResult = await db.query(
      `SELECT COUNT(*) FROM recruitment_applications ${cycleFilter}`,
      params.length ? params : []
    );
    
    const statusResult = await db.query(
      `SELECT status, COUNT(*) as count FROM recruitment_applications ${cycleFilter} GROUP BY status`,
      params.length ? params : []
    );
    
    const paymentResult = await db.query(
      `SELECT payment_status, COUNT(*) as count FROM recruitment_applications ${cycleFilter} GROUP BY payment_status`,
      params.length ? params : []
    );
    
    const roleResult = await db.query(
      `SELECT r.title, COUNT(a.id) as count 
       FROM recruitment_roles r
       LEFT JOIN recruitment_applications a ON a.role_id = r.id ${cycle_id ? 'AND a.cycle_id = $1' : ''}
       GROUP BY r.id, r.title
       ORDER BY count DESC`,
      cycle_id ? [cycle_id] : []
    );
    
    res.json({
      success: true,
      data: {
        total: parseInt(totalResult.rows[0]?.count || 0),
        by_status: statusResult.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {}),
        by_payment: paymentResult.rows.reduce((acc, r) => ({ ...acc, [r.payment_status]: parseInt(r.count) }), {}),
        by_role: roleResult.rows.map(r => ({ title: r.title, count: parseInt(r.count) }))
      }
    });
  } catch (err) {
    console.error('getRecruitmentStats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== EXPORTS (PDF/CSV) ====================

exports.exportApplicationsPDF = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { status, cycle_id } = req.query;
    
    let whereClauses = [];
    let params = [];
    let paramCount = 1;
    
    if (status) {
      whereClauses.push(`a.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }
    
    if (cycle_id) {
      whereClauses.push(`a.cycle_id = $${paramCount}`);
      params.push(cycle_id);
      paramCount++;
    }
    
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const result = await db.query(
      `SELECT a.*, r.title as role_title, c.title as cycle_title
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       ${whereSQL}
       ORDER BY a.created_at DESC`,
      params
    );
    
    if (!PDFDocument) {
      return sendMissingDependency(res, 'Recruitment PDF export', 'pdfkit');
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=recruitment_applications.pdf');
    doc.pipe(res);
    
    // Title
    doc.fontSize(18).font('Helvetica-Bold').text('Recruitment Applications Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown(2);
    
    // Table headers
    const headers = ['Ref #', 'Name', 'Role', 'Track', 'Status', 'Date'];
    const colWidths = [100, 120, 100, 60, 80, 80];
    let y = doc.y;
    
    doc.fontSize(8).font('Helvetica-Bold');
    let x = 30;
    headers.forEach((header, i) => {
      doc.text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    
    doc.moveDown(0.5);
    y = doc.y;
    doc.moveTo(30, y).lineTo(30 + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    doc.moveDown(0.5);
    
    // Table rows
    doc.fontSize(7).font('Helvetica');
    for (const app of result.rows) {
      y = doc.y;
      if (y > 750) {
        doc.addPage();
        y = doc.y;
      }
      
      x = 30;
      const rowData = [
        app.reference_number || 'N/A',
        app.full_name?.substring(0, 20) || 'N/A',
        app.role_title?.substring(0, 15) || 'N/A',
        app.application_track || 'N/A',
        app.status || 'N/A',
        app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A'
      ];
      
      rowData.forEach((data, i) => {
        doc.text(data, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      
      doc.moveDown(0.8);
    }
    
    doc.end();
  } catch (err) {
    console.error('exportApplicationsPDF error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.exportApplicationsCSV = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { status, cycle_id } = req.query;
    
    let whereClauses = [];
    let params = [];
    let paramCount = 1;
    
    if (status) {
      whereClauses.push(`a.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }
    
    if (cycle_id) {
      whereClauses.push(`a.cycle_id = $${paramCount}`);
      params.push(cycle_id);
      paramCount++;
    }
    
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const result = await db.query(
      `SELECT a.reference_number, a.full_name, a.email_address, a.phone_number,
              a.state_name, a.lga_name, a.highest_education, a.years_of_experience,
              a.application_track, a.application_fee, a.payment_status, a.status,
              r.title as role_title, c.title as cycle_title,
              a.created_at, a.updated_at
       FROM recruitment_applications a
       JOIN recruitment_roles r ON a.role_id = r.id
       JOIN recruitment_cycles c ON a.cycle_id = c.id
       ${whereSQL}
       ORDER BY a.created_at DESC`,
      params
    );
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=recruitment_applications.csv');
    
    const headers = ['Reference', 'Full Name', 'Email', 'Phone', 'State', 'LGA', 'Education', 'Experience (Years)', 'Track', 'Fee', 'Payment', 'Status', 'Role', 'Cycle', 'Submitted', 'Last Updated'];
    
    let csv = headers.join(',') + '\n';
    
    for (const app of result.rows) {
      const row = [
        `"${app.reference_number || ''}"`,
        `"${app.full_name || ''}"`,
        `"${app.email_address || ''}"`,
        `"${app.phone_number || ''}"`,
        `"${app.state_name || ''}"`,
        `"${app.lga_name || ''}"`,
        `"${app.highest_education || ''}"`,
        app.years_of_experience || 0,
        app.application_track || '',
        app.application_fee || 0,
        app.payment_status || '',
        app.status || '',
        `"${app.role_title || ''}"`,
        `"${app.cycle_title || ''}"`,
        app.created_at ? new Date(app.created_at).toISOString().split('T')[0] : '',
        app.updated_at ? new Date(app.updated_at).toISOString().split('T')[0] : ''
      ];
      csv += row.join(',') + '\n';
    }
    
    res.send(csv);
  } catch (err) {
    console.error('exportApplicationsCSV error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ==================== ROUTE-COMPLETE RECRUITMENT IMPLEMENTATION ====================
// The earlier functions above are kept for compatibility. The assignments below make
// every route in routes/recruitment.js point to a complete, production-safe handler.

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const RECRUITMENT_EMAIL = process.env.RECRUITMENT_EMAIL || 'recruitment@rentalhub.com.ng';
const ALL_LGAS = '__ALL__';
const QUESTION_TIME_LIMIT_SECONDS = Number(process.env.RECRUITMENT_QUESTION_TIME_LIMIT_SECONDS || 30);
const QUESTION_TIME_GRACE_SECONDS = Number(process.env.RECRUITMENT_QUESTION_GRACE_SECONDS || 12);
const MIN_ANSWER_SECONDS = Number(process.env.RECRUITMENT_MIN_ANSWER_SECONDS || 1);
const INTERVIEW_PING_STALE_SECONDS = Number(process.env.RECRUITMENT_INTERVIEW_PING_STALE_SECONDS || 90);
const PAYSTACK_WEBHOOK_IP_ALLOWLIST = String(process.env.PAYSTACK_WEBHOOK_IPS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const normalizeText = (value) => String(value || '').trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const parseLimit = (value, fallback = 20, max = 100) => Math.min(Math.max(Number(value) || fallback, 1), max);
const parsePage = (value) => Math.max(Number(value) || 1, 1);
const naira = (value) => `NGN ${Number(value || 0).toLocaleString('en-NG')}`;

const safeFileSegment = (value) =>
  normalizeText(value || 'file')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'file';

const getApplicantAccessInput = (req = {}) => ({
  email: normalizeLower(
    req.body?.applicant_email ||
    req.body?.email_address ||
    req.query?.applicant_email ||
    req.query?.email_address ||
    req.query?.email
  ),
  referenceNumber: normalizeText(
    req.body?.reference_number ||
    req.body?.application_reference ||
    req.query?.reference_number ||
    req.query?.application_reference
  ).toUpperCase(),
  accessCode: normalizeText(req.body?.access_code || req.query?.access_code).toUpperCase(),
});

const hasPublicApplicationAccess = (req, application, { allowAccessCode = false } = {}) => {
  if (!application) return false;
  const { email, referenceNumber, accessCode } = getApplicantAccessInput(req);
  const emailMatches = email && normalizeLower(application.email_address) === email;
  const referenceMatches = referenceNumber &&
    normalizeText(application.reference_number).toUpperCase() === referenceNumber;
  const accessCodeMatches = allowAccessCode &&
    accessCode &&
    normalizeText(application.access_code).toUpperCase() === accessCode;

  return (emailMatches && referenceMatches) || accessCodeMatches;
};

const requirePublicApplicationAccess = (req, res, application, options) => {
  if (hasPublicApplicationAccess(req, application, options)) return true;
  res.status(403).json({
    success: false,
    message: 'Applicant verification failed. Please reopen your applicant dashboard from the same application reference.',
  });
  return false;
};

const stripPublicApplicationSecrets = (application = {}) => {
  const copy = { ...application };
  delete copy.payment_gateway_payload;
  delete copy.interview_challenge_token;
  delete copy.interview_fingerprint;
  delete copy.interview_user_agent;
  return copy;
};

const addSqlParam = (params, value) => {
  params.push(value);
  return `$${params.length}`;
};

const getApplicantWhere = (query = {}) => {
  const where = [];
  const params = [];
  const addClause = (sql, ...values) => {
    let clause = sql;
    values.forEach((value) => {
      const placeholder = addSqlParam(params, value);
      clause = clause.replace('?', placeholder);
    });
    where.push(clause);
  };

  if (query.status) addClause('a.status = ?', query.status);
  if (query.payment_status) addClause('a.payment_status = ?', query.payment_status);
  if (query.cycle_id) addClause('a.cycle_id = ?', query.cycle_id);
  if (query.role_id) addClause('a.role_id = ?', query.role_id);
  if (query.state) addClause('a.state_name ILIKE ?', normalizeText(query.state));
  if (query.lga) addClause('a.lga_name ILIKE ?', normalizeText(query.lga));
  if (query.area) addClause('a.area_locality ILIKE ?', `%${normalizeText(query.area)}%`);
  if (query.search) {
    const searchParam = addSqlParam(params, [`%${normalizeText(query.search)}%`]);
    where.push(
      `(COALESCE(a.full_name, '') ILIKE ANY(${searchParam}::text[])
        OR COALESCE(a.email_address, '') ILIKE ANY(${searchParam}::text[])
        OR COALESCE(a.phone_number, '') ILIKE ANY(${searchParam}::text[])
        OR COALESCE(a.reference_number, '') ILIKE ANY(${searchParam}::text[]))`
    );
  }

  return {
    whereSQL: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const getApplicationRows = async (query = {}, { paginate = false } = {}) => {
  const { whereSQL, params } = getApplicantWhere(query);
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    `SELECT COUNT(*)::INT AS count
     FROM recruitment_applications a
     JOIN recruitment_roles r ON r.id = a.role_id
     JOIN recruitment_cycles c ON c.id = a.cycle_id
     ${whereSQL}`,
    params
  );

  const listParams = [...params];
  let pagingSQL = '';
  if (paginate) {
    listParams.push(limit, offset);
    pagingSQL = `LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`;
  }

  const result = await db.query(
    `SELECT a.*, r.title AS role_title, r.type AS role_type, c.title AS cycle_title,
            c.open_date, c.close_date, c.extension_date
     FROM recruitment_applications a
     JOIN recruitment_roles r ON r.id = a.role_id
     JOIN recruitment_cycles c ON c.id = a.cycle_id
     ${whereSQL}
     ORDER BY a.created_at DESC
     ${pagingSQL}`,
    listParams
  );

  return {
    rows: result.rows,
    pagination: {
      total: countResult.rows[0]?.count || 0,
      page,
      limit,
      totalPages: Math.max(Math.ceil((countResult.rows[0]?.count || 0) / limit), 1),
    },
  };
};

const ensureUniqueAccessCode = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateAccessCode();
    const existing = await db.query(
      'SELECT id FROM recruitment_applications WHERE access_code = $1 LIMIT 1',
      [code]
    );
    if (!existing.rows.length) return code;
  }
  return `RH-CR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

const appendSecurityLog = (currentLog, message) =>
  [normalizeText(currentLog), `[${new Date().toISOString()}] ${message}`]
    .filter(Boolean)
    .join('\n')
    .slice(-5000);

const safeJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const getClientIp = (req) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwardedFor || req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .trim();
};

const ipToLong = (ip) => ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)), 0) >>> 0;

const isIpInCidr = (ip, cidr) => {
  const [range, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  if (net.isIP(ip) !== 4 || net.isIP(range) !== 4 || Number.isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
};

const isWebhookIpAllowed = (ip) => {
  if (!PAYSTACK_WEBHOOK_IP_ALLOWLIST.length) return true;
  return PAYSTACK_WEBHOOK_IP_ALLOWLIST.some((allowed) => (
    allowed.includes('/') ? isIpInCidr(ip, allowed) : ip === allowed.replace(/^::ffff:/, '')
  ));
};

const timingSafeEqualHex = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sendAccessCodeNotice = async (application) => {
  const code = application.access_code;
  const email = application.email_address;
  const phone = application.phone_number;
  const dashboardUrl = `${getFrontendUrl()}/careers`;

  const tasks = [];
  if (email) {
    tasks.push(
      sendEmail({
        to: email,
        subject: 'RentalHub NG Career Access Code',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
            <h2>Your Recruitment Access Code</h2>
            <p>Hello ${application.full_name || 'Applicant'},</p>
            <p>Your Application Access Fee has been confirmed.</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:1px">${code}</p>
            <p>Enter this code on your applicant dashboard to unlock document upload. It expires when the recruitment cycle closes.</p>
            <p><a href="${dashboardUrl}">Open Applicant Dashboard</a></p>
          </div>
        `,
      }).then(() => db.query(
        `UPDATE recruitment_applications
         SET access_code_sent_email = TRUE,
             access_code_email_last_error = NULL
         WHERE id = $1`,
        [application.id]
      )).catch(async (error) => {
        console.error('Recruitment access email failed:', error.message);
        await db.query(
          'UPDATE recruitment_applications SET access_code_email_last_error = $2 WHERE id = $1',
          [application.id, error.message]
        ).catch(() => {});
      })
    );
  }

  if (phone) {
    tasks.push(
      sendSMS(phone, `RentalHub NG career access code: ${code}. Use it on ${dashboardUrl}. Do not share it.`)
        .then((result) => {
          if (!result?.success) {
            const errorMessage = result?.error || 'SMS provider did not accept the message';
            return db.query(
              `UPDATE recruitment_applications
               SET access_code_sent_sms = FALSE,
                   access_code_sms_status = 'failed',
                   access_code_sms_delivery_attempt_id = COALESCE($2, access_code_sms_delivery_attempt_id),
                   access_code_sms_last_error = $3
               WHERE id = $1`,
              [application.id, result?.delivery_attempt_id || null, errorMessage]
            );
          }

          return db.query(
            `UPDATE recruitment_applications
             SET access_code_sent_sms = TRUE,
                 access_code_sms_status = COALESCE($3, 'queued'),
                 access_code_sms_delivery_attempt_id = COALESCE($2, access_code_sms_delivery_attempt_id),
                 access_code_sms_last_error = NULL
             WHERE id = $1`,
            [application.id, result.delivery_attempt_id || null, result.status || result.normalized_status || 'queued']
          );
        })
        .catch(async (error) => {
          console.error('Recruitment access SMS failed:', error.message);
          await db.query(
            `UPDATE recruitment_applications
             SET access_code_sent_sms = FALSE,
                 access_code_sms_status = 'failed',
                 access_code_sms_last_error = $2
             WHERE id = $1`,
            [application.id, error.message]
          ).catch(() => {});
        })
    );
  }

  await Promise.allSettled(tasks);
};

const markApplicationPaid = async ({ application, reference, gatewayPayload }) => {
  const client = await db.connect();
  let paid;
  let shouldSendNotice = false;

  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT * FROM recruitment_applications WHERE id = $1 FOR UPDATE',
      [application.id]
    );

    if (!locked.rows.length) {
      throw new Error('Recruitment application not found while marking payment paid');
    }

    const current = locked.rows[0];
    const accessCode = current.access_code || await ensureUniqueAccessCode();

    if (current.payment_status === 'paid' && current.access_code) {
      paid = current;
    } else {
      const result = await client.query(
        `UPDATE recruitment_applications
         SET payment_status = 'paid',
             payment_reference = COALESCE($2, payment_reference),
             payment_date = COALESCE(payment_date, NOW()),
             payment_processed_at = COALESCE(payment_processed_at, NOW()),
             payment_gateway_payload = COALESCE($4::jsonb, payment_gateway_payload),
             access_code = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [current.id, reference, accessCode, safeJson(gatewayPayload)]
      );
      paid = result.rows[0];
      shouldSendNotice = true;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (
    paid &&
    (shouldSendNotice || !paid.access_code_sent_email || !paid.access_code_sent_sms)
  ) {
    await sendAccessCodeNotice(paid);
  }
  return paid;
};

const fetchRecruitmentStatusRow = async () => {
  const result = await db.query(
    `INSERT INTO recruitment_settings (is_active)
     SELECT FALSE
     WHERE NOT EXISTS (SELECT 1 FROM recruitment_settings)
     RETURNING *`
  );

  if (result.rows.length) return result.rows[0];

  const settings = await db.query(
    'SELECT * FROM recruitment_settings ORDER BY id DESC LIMIT 1'
  );
  return settings.rows[0] || { is_active: false };
};

exports.getRecruitmentStatus = async (_req, res) => {
  try {
    const row = await fetchRecruitmentStatusRow();
    res.json({ success: true, data: { is_active: Boolean(row.is_active) } });
  } catch (error) {
    console.error('getRecruitmentStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recruitment status' });
  }
};

exports.toggleRecruitment = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const nextActive = Boolean(req.body?.is_active);
    await fetchRecruitmentStatusRow();
    const result = await db.query(
      `UPDATE recruitment_settings
       SET is_active = $1, updated_by = $2, updated_at = NOW()
       WHERE id = (SELECT id FROM recruitment_settings ORDER BY id DESC LIMIT 1)
       RETURNING *`,
      [nextActive, req.user.id]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: `Recruitment ${nextActive ? 'opened' : 'closed'} successfully`,
    });
  } catch (error) {
    console.error('toggleRecruitment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update recruitment status' });
  }
};























































































































































exports.createApplication = async (req, res) => {
  try {
    const settings = await fetchRecruitmentStatusRow();
    if (!settings.is_active) {
      return res.status(403).json({ success: false, message: 'Recruitment is currently closed' });
    }
    const {
      role_id,
      full_name,
      phone_number,
      email_address,
      state_name,
      lga_name,
      area_locality,
      residential_address,
      date_of_birth,
      highest_education,
      years_of_experience,
      current_employment_status,
      skills_qualifications,
      suitability_reason,
      application_track = 'standard',
    } = req.body;
    const required = {
      role_id,
      full_name,
      phone_number,
      email_address,
      state_name,
      lga_name,
      area_locality,
      residential_address,
      highest_education,
      suitability_reason,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !normalizeText(value))
      .map(([key]) => key.replace(/_/g, ' '));
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    const roleResult = await db.query(
      `SELECT r.*, c.open_date, c.close_date, c.extension_date, c.is_active AS cycle_active
       FROM recruitment_roles r
       JOIN recruitment_cycles c ON c.id = r.cycle_id
       WHERE r.id = $1
         AND r.is_active = TRUE
         AND c.is_active = TRUE
         AND c.open_date <= CURRENT_DATE
         AND COALESCE(c.extension_date, c.close_date) >= CURRENT_DATE
       LIMIT 1`,
      [role_id]
    );
    if (!roleResult.rows.length) {
      return res.status(404).json({ success: false, message: 'This recruitment role is not currently open' });
    }
    const activationCount = await db.query(
      'SELECT COUNT(*)::INT AS count FROM recruitment_location_activation WHERE is_active = TRUE'
    );
    if (activationCount.rows[0]?.count > 0) {
      const locationResult = await db.query(
        `SELECT id
         FROM recruitment_location_activation
         WHERE is_active = TRUE
           AND LOWER(state_name) = LOWER($1)
           AND (LOWER(lga_name) = LOWER($2) OR lga_name = $3)
         LIMIT 1`,
        [state_name, lga_name, ALL_LGAS]
      );
      if (!locationResult.rows.length) {
        return res.status(403).json({
          success: false,
          message: 'Recruitment is not active for this state and local government area',
        });
      }
    }
    const role = roleResult.rows[0];
    const track = application_track === 'premium' ? 'premium' : 'standard';
    const fee = track === 'premium' ? Number(role.premium_fee || 8000) : Number(role.application_fee || 5000);
    const result = await db.query(
      `INSERT INTO recruitment_applications (
        cycle_id, role_id, full_name, phone_number, email_address,
        state_name, lga_name, area_locality, residential_address, date_of_birth,
        highest_education, years_of_experience, current_employment_status,
        skills_qualifications, suitability_reason, application_fee,
        application_track, reference_number, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft')
      RETURNING *`,
      [
        role.cycle_id,
        role_id,
        normalizeText(full_name),
        normalizeText(phone_number),
        normalizeText(email_address).toLowerCase(),
        normalizeText(state_name),
        normalizeText(lga_name),
        normalizeText(area_locality),
        normalizeText(residential_address),
        date_of_birth || null,
        normalizeText(highest_education),
        Number(years_of_experience) || 0,
        normalizeText(current_employment_status),
        normalizeText(skills_qualifications),
        normalizeText(suitability_reason),
        fee,
        track,
        generateReferenceNumber(),
      ]
    );
    res.status(201).json({
      success: true,
      data: { ...result.rows[0], role_title: role.title, role_type: role.type },
      message: 'Application started. Proceed to payment to receive your access code.',
    });
  } catch (error) {
    console.error('createApplication error:', error);
    res.status(500).json({ success: false, message: 'Failed to create application' });
  }
};

exports.initiatePayment = async (req, res) => {
  try {
    const { application_id } = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(503).json({ success: false, message: 'Payment gateway is not configured' });
    }

    const appResult = await db.query(
      `SELECT a.*, r.title AS role_title
       FROM recruitment_applications a
       JOIN recruitment_roles r ON r.id = a.role_id
       WHERE a.id = $1`,
      [application_id]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const application = appResult.rows[0];
    if (!requirePublicApplicationAccess(req, res, application)) return;

    if (application.payment_status === 'paid') {
      return res.status(400).json({ success: false, message: 'Application Access Fee has already been paid' });
    }

    const reference = `RH_CR_${application.id}_${Date.now()}`;
    await db.query(
      'UPDATE recruitment_applications SET payment_reference = $1, updated_at = NOW() WHERE id = $2',
      [reference, application.id]
    );

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
                email: application.email_address,
        amount: Math.round(Number(application.application_fee || 5000) * 100),
        reference,
        callback_url: `${getFrontendUrl()}/careers?payment_reference=${encodeURIComponent(reference)}`,
        metadata: {
          type: 'recruitment_application_access_fee',
          application_id: application.id,
          role_title: application.role_title,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({
      success: true,
      message: 'Application Access Fee payment initialized',
      data: {
        application_id: application.id,
        amount: Number(application.application_fee || 5000),
        reference,
        authorization_url: response.data?.data?.authorization_url,
        access_code: response.data?.data?.access_code,
      },
    });
  } catch (error) {
    console.error('initiatePayment error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to initialize recruitment payment' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(503).json({ success: false, message: 'Payment gateway is not configured' });
    }

    const appResult = await db.query(
      `SELECT * FROM recruitment_applications
       WHERE payment_reference = $1
       LIMIT 1`,
      [reference]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Payment reference not found' });
    }

    const application = appResult.rows[0];
    if (application.payment_status === 'paid' && application.access_code) {
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: { application: stripPublicApplicationSecrets(application), access_code: application.access_code },
      });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );

    const transaction = response.data?.data;
    if (transaction?.status !== 'success') {
      await db.query(
        `UPDATE recruitment_applications
         SET payment_status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [application.id]
      );
      return res.status(402).json({ success: false, message: 'Payment has not been completed' });
    }

    const paid = await markApplicationPaid({
      application,
      reference,
      gatewayPayload: transaction,
    });

    res.json({
      success: true,
      message: 'Payment confirmed. Your access code is ready.',
      data: { application: stripPublicApplicationSecrets(paid), access_code: paid.access_code },
    });
  } catch (error) {
    console.error('verifyPayment error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to verify recruitment payment' });
  }
};

exports.paystackWebhook = async (req, res) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody;
    const clientIp = getClientIp(req);

    if (!secretKey) {
      return res.status(503).json({ success: false, message: 'Payment gateway is not configured' });
    }

    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, message: 'Webhook raw body is required' });
    }

    if (!isWebhookIpAllowed(clientIp)) {
      console.warn(`Blocked recruitment Paystack webhook from non-allowlisted IP: ${clientIp}`);
      return res.status(403).json({ success: false, message: 'Webhook source not allowed' });
    }

    const expectedSignature = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');

    if (!signature || !timingSafeEqualHex(signature, expectedSignature)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body || {};
    const transaction = event.data || {};
    const reference = transaction.reference;
    const metadata = transaction.metadata || {};

    if (event.event !== 'charge.success' || metadata.type !== 'recruitment_application_access_fee') {
      return res.json({ success: true, ignored: true });
    }

    const params = [];
    const filters = [];
    if (metadata.application_id) {
      params.push(metadata.application_id);
      filters.push(`id = $${params.length}`);
    }
    if (reference) {
      params.push(reference);
      filters.push(`payment_reference = $${params.length}`);
    }

    if (!filters.length) {
      return res.status(400).json({ success: false, message: 'Webhook missing application reference' });
    }

    const appResult = await db.query(
      `SELECT * FROM recruitment_applications WHERE ${filters.join(' OR ')} LIMIT 1`,
      params
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Recruitment payment reference not found' });
    }

    await markApplicationPaid({
      application: appResult.rows[0],
      reference: reference || appResult.rows[0].payment_reference,
      gatewayPayload: transaction,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('paystackWebhook recruitment error:', error);
    res.status(500).json({ success: false, message: 'Failed to process recruitment webhook' });
  }
};

exports.getApplicants = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { rows, pagination } = await getApplicationRows(req.query, { paginate: true });
    res.json({ success: true, data: rows, pagination });
  } catch (error) {
    console.error('getApplicants error:', error);
    res.status(500).json({ success: false, message: 'Failed to load applicants' });
  }
};

const setApplicantStatus = async (req, res, status) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { id } = req.params;
    const notes = normalizeText(req.body?.notes || req.body?.admin_notes || req.body?.reason);
    const interviewDate = req.body?.interview_date || null;

    const result = await db.query(
      `UPDATE recruitment_applications
       SET status = $1,
           admin_notes = COALESCE(NULLIF($2, ''), admin_notes),
           reviewed_by = $3,
           reviewed_at = NOW(),
           interview_date = COALESCE($4, interview_date),
           interview_activated = CASE WHEN $4::timestamptz IS NULL THEN interview_activated ELSE TRUE END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, notes, req.user.id, interviewDate, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, data: result.rows[0], message: `Application marked ${status}` });
  } catch (error) {
    console.error(`setApplicantStatus ${status} error:`, error);
    res.status(500).json({ success: false, message: 'Failed to update applicant status' });
  }
};

exports.approveApplicant = (req, res) => setApplicantStatus(req, res, 'approved');
exports.rejectApplicant = (req, res) => setApplicantStatus(req, res, 'rejected');
exports.shortlistApplicant = (req, res) => setApplicantStatus(req, res, 'shortlisted');

exports.bulkProcessApplicants = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const ids = Array.isArray(req.body?.application_ids) ? req.body.application_ids : [];
    const status = normalizeLower(req.body?.status);
    const allowed = new Set(['under_review', 'shortlisted', 'approved', 'rejected', 'disqualified']);
    if (!ids.length || !allowed.has(status)) {
      return res.status(400).json({ success: false, message: 'Application IDs and valid status are required' });
    }

    const result = await db.query(
      `UPDATE recruitment_applications
       SET status = $1,
           admin_notes = COALESCE(NULLIF($2, ''), admin_notes),
           reviewed_by = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($4::int[])
       RETURNING id`,
      [status, normalizeText(req.body?.notes), req.user.id, ids]
    );

    res.json({ success: true, data: { updated: result.rowCount }, message: `${result.rowCount} applications updated` });
  } catch (error) {
    console.error('bulkProcessApplicants error:', error);
    res.status(500).json({ success: false, message: 'Failed to process applicants' });
  }
};

exports.toggleLocation = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const stateName = normalizeText(req.body?.state_name);
    const lgaName = normalizeText(req.body?.lga_name || ALL_LGAS);
    const isActive = Boolean(req.body?.is_active);

    if (!stateName) {
      return res.status(400).json({ success: false, message: 'State is required' });
    }

    const result = await db.query(
      `INSERT INTO recruitment_location_activation (state_name, lga_name, is_active, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (state_name, lga_name)
       DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING *`,
      [stateName, lgaName, isActive]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('toggleLocation error:', error);
    res.status(500).json({ success: false, message: 'Failed to update recruitment location' });
  }
};

exports.getLocationActivations = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await db.query(
      'SELECT * FROM recruitment_location_activation ORDER BY state_name, lga_name'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getLocationActivations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recruitment locations' });
  }
};

exports.bulkActivateLocations = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
    if (!locations.length) {
      return res.status(400).json({ success: false, message: 'No locations supplied' });
    }

    let updated = 0;
    for (const item of locations) {
      const stateName = normalizeText(item.state_name);
      const lgaName = normalizeText(item.lga_name || ALL_LGAS);
      if (!stateName) continue;
      await db.query(
        `INSERT INTO recruitment_location_activation (state_name, lga_name, is_active, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (state_name, lga_name)
         DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()`,
        [stateName, lgaName, item.is_active !== false]
      );
      updated += 1;
    }

    res.json({ success: true, data: { updated } });
  } catch (error) {
    console.error('bulkActivateLocations error:', error);
    res.status(500).json({ success: false, message: 'Failed to update recruitment locations' });
  }
};

exports.setInterviewDate = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await db.query(
      `UPDATE recruitment_applications
       SET interview_date = $1,
           interview_activated = TRUE,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.body?.interview_date, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    res.json({ success: true, data: result.rows[0], message: 'Interview date set' });
  } catch (error) {
    console.error('setInterviewDate error:', error);
    res.status(500).json({ success: false, message: 'Failed to set interview date' });
  }
};

exports.triggerInterview = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { cycle_id, role_id, interview_date } = req.body || {};
    const where = ["status = 'shortlisted'"];
    const params = [interview_date];
    if (cycle_id) {
      params.push(cycle_id);
      where.push(`cycle_id = $${params.length}`);
    }
    if (role_id) {
      params.push(role_id);
      where.push(`role_id = $${params.length}`);
    }

    const result = await db.query(
      `UPDATE recruitment_applications
       SET interview_date = COALESCE($1, interview_date),
           interview_activated = TRUE,
           updated_at = NOW()
       WHERE ${where.join(' AND ')}
       RETURNING id, user_id, email_address, phone_number, full_name, interview_date`,
      params
    );

    const frontendUrl = getFrontendUrl();
    const dashboardUrl = `${frontendUrl}/careers`;

    for (const applicant of result.rows) {
      const interviewDateStr = applicant.interview_date
        ? new Date(applicant.interview_date).toLocaleDateString('en-NG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'To be announced';

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0ea5e9, #2563eb); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">RentalHub NG</h1>
            <p style="color: #bfdbfe; margin: 8px 0 0;">Interview Invitation</p>
          </div>
          <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin: 0 0 16px;">Interview Activated</h2>
            <p style="color: #475569; line-height: 1.6;">Hello <strong>${applicant.full_name || 'Applicant'}</strong>,</p>
            <p style="color: #475569; line-height: 1.6;">Your recruitment interview has been activated for the RentalHub NG recruitment process.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px;"><strong>Interview Date:</strong> ${interviewDateStr}</p>
              <p style="margin: 0;"><strong>Portal:</strong> <a href="${dashboardUrl}" style="color: #2563eb;">${dashboardUrl}</a></p>
            </div>
            <p style="color: #475569; line-height: 1.6;">
              Please sign in to your applicant dashboard on the scheduled date to join the proctored interview.
              You will need your camera and microphone ready. The interview includes face detection monitoring.
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              This is an automated message from RentalHub NG. Do not reply to this email.
            </p>
          </div>
        </div>
      `;

      // Send email notification
      if (applicant.email_address) {
        sendEmail({
          to: applicant.email_address,
          subject: 'RentalHub NG - Interview Invitation',
          html: emailHtml,
        }).catch((error) => console.error('Interview email failed:', error.message));
      }

      // Send SMS notification
      if (applicant.phone_number) {
        const smsMessage = `RentalHub NG: Your interview has been activated for ${interviewDateStr}. Sign in at ${dashboardUrl} to join the proctored interview.`;
        sendSMS(applicant.phone_number, smsMessage)
          .catch((error) => console.error('Interview SMS failed:', error.message));
      }

      // Create in-app notification
      try {
        const { createNotification } = require('../config/utils/notificationService');
        await createNotification(
          applicant.user_id,
          'interview_activated',
          'Interview Activated',
          `Your interview has been scheduled for ${interviewDateStr}. Please sign in on the scheduled date to join.`,
          '/careers'
        );
      } catch (notifErr) {
        console.error('Interview notification error:', notifErr.message);
      }
    }

    res.json({ success: true, data: { updated: result.rowCount }, message: `${result.rowCount} interviews activated` });
  } catch (error) {
    console.error('triggerInterview error:', error);
    res.status(500).json({ success: false, message: 'Failed to activate interviews' });
  }
};

const appendApplicationToPdf = async (doc, application, index) => {
  if (doc.y > 640) doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text(`${index}. ${application.full_name || 'Applicant'} (${application.reference_number || 'No reference'})`);
  doc.fontSize(9).font('Helvetica');
  const rows = [
    ['Role', application.role_title],
    ['Cycle', application.cycle_title],
    ['Phone', application.phone_number],
    ['Email', application.email_address],
    ['Location', `${application.state_name || '-'} / ${application.lga_name || '-'} / ${application.area_locality || '-'}`],
    ['Address', application.residential_address],
    ['Date of birth', application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString() : '-'],
    ['Education', application.highest_education],
    ['Experience', `${application.years_of_experience || 0} years`],
    ['Employment status', application.current_employment_status],
    ['Skills', application.skills_qualifications],
    ['Suitability', application.suitability_reason],
    ['Track/Fee', `${application.application_track || 'standard'} / ${naira(application.application_fee)}`],
    ['Payment status', application.payment_status],
    ['Application status', application.status],
  ];

  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(normalizeText(value) || '-');
  });

  const docs = await db.query(
    'SELECT document_type, file_name, uploaded_at FROM recruitment_documents WHERE application_id = $1 ORDER BY uploaded_at',
    [application.id]
  );
  doc.font('Helvetica-Bold').text('Documents:');
  if (!docs.rows.length) {
    doc.font('Helvetica').text('- No documents uploaded');
  } else {
    docs.rows.forEach((row) => doc.font('Helvetica').text(`- ${row.document_type}: ${row.file_name}`));
  }
  doc.moveDown();
};

const sendApplicantsPdf = async (res, applications, filename, title) => {
  if (!PDFDocument) {
    return sendMissingDependency(res, 'Recruitment PDF export', 'pdfkit');
  }

  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown();

  if (!applications.length) {
    doc.text('No applicants matched this filter.');
  } else {
    for (let i = 0; i < applications.length; i += 1) {
      await appendApplicationToPdf(doc, applications[i], i + 1);
    }
  }
  doc.end();
};

exports.generateApplicantPdf = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await getApplicationRows({ ...req.query, search: undefined }, { paginate: false });
    const application = result.rows.find((row) => String(row.id) === String(req.params.id));
    if (!application) {
      const direct = await db.query(
        `SELECT a.*, r.title AS role_title, c.title AS cycle_title
         FROM recruitment_applications a
         JOIN recruitment_roles r ON r.id = a.role_id
         JOIN recruitment_cycles c ON c.id = a.cycle_id
         WHERE a.id = $1`,
        [req.params.id]
      );
      if (!direct.rows.length) return res.status(404).json({ success: false, message: 'Applicant not found' });
      return sendApplicantsPdf(res, direct.rows, `recruitment_${req.params.id}.pdf`, 'Recruitment Applicant Report');
    }
    return sendApplicantsPdf(res, [application], `recruitment_${req.params.id}.pdf`, 'Recruitment Applicant Report');
  } catch (error) {
    console.error('generateApplicantPdf error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate applicant PDF' });
  }
};

const generateFilteredPdf = async (req, res, filter, filename, title) => {
  if (!(await isRecruitmentAdmin(req.user.id))) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const { rows } = await getApplicationRows({ ...req.query, ...filter }, { paginate: false });
  return sendApplicantsPdf(res, rows, filename, title);
};

exports.generateRolePdf = (req, res) =>
  generateFilteredPdf(req, res, { role_id: req.params.roleId }, `role_${safeFileSegment(req.params.roleId)}.pdf`, 'Recruitment Role Report');
exports.generateStatePdf = (req, res) =>
  generateFilteredPdf(req, res, { state: req.params.state }, `state_${safeFileSegment(req.params.state)}.pdf`, 'Recruitment State Report');
exports.generateLgaPdf = (req, res) =>
  generateFilteredPdf(req, res, { lga: req.params.lga }, `lga_${safeFileSegment(req.params.lga)}.pdf`, 'Recruitment LGA Report');
exports.generateAreaPdf = (req, res) =>
  generateFilteredPdf(req, res, { area: req.query.area }, `area_${safeFileSegment(req.query.area)}.pdf`, 'Recruitment Area Report');

const streamDocumentsZip = async (res, docs, filename) => {
  if (!archiver) {
    return sendMissingDependency(res, 'Recruitment document ZIP download', 'archiver');
  }

  res.attachment(filename);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (error) => {
    throw error;
  });
  archive.pipe(res);

  for (const item of docs) {
    if (item.file_path && fs.existsSync(item.file_path)) {
      archive.file(item.file_path, {
        name: `${safeFileSegment(item.reference_number || item.application_id)}/${safeFileSegment(item.document_type)}_${safeFileSegment(item.file_name)}`,
      });
    }
  }

  await archive.finalize();
};

exports.downloadApplicationDocs = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const docs = await db.query(
      `SELECT d.*, a.reference_number
       FROM recruitment_documents d
       JOIN recruitment_applications a ON a.id = d.application_id
       WHERE d.application_id = $1`,
      [req.params.applicationId]
    );
    return streamDocumentsZip(res, docs.rows, `recruitment_${safeFileSegment(req.params.applicationId)}_documents.zip`);
  } catch (error) {
    console.error('downloadApplicationDocs error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to download documents' });
  }
};

exports.bulkDownloadDocs = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { rows } = await getApplicationRows(req.query, { paginate: false });
    const ids = rows.map((row) => row.id);
    if (!ids.length) {
      return res.status(404).json({ success: false, message: 'No applicants matched this filter' });
    }
    const docs = await db.query(
      `SELECT d.*, a.reference_number
       FROM recruitment_documents d
       JOIN recruitment_applications a ON a.id = d.application_id
       WHERE d.application_id = ANY($1::int[])`,
      [ids]
    );
    return streamDocumentsZip(res, docs.rows, 'recruitment_documents.zip');
  } catch (error) {
    console.error('bulkDownloadDocs error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to download documents' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const params = [];
    const cycleFilter = req.query?.cycle_id ? 'WHERE a.cycle_id = $1' : '';
    if (req.query?.cycle_id) params.push(req.query.cycle_id);

    const safeQuery = async (sql, p) => {
      try {
        return await db.query(sql, p);
      } catch (err) {
        console.error('Analytics sub-query error:', err.message);
        return { rows: [] };
      }
    };

    const [total, fees, perRole, monthly, interview, funnel, completionTime, locationHeatmap] = await Promise.all([
      safeQuery(`SELECT COUNT(*)::INT AS count FROM recruitment_applications a ${cycleFilter}`, params),
      safeQuery(`SELECT COALESCE(SUM(application_fee), 0)::NUMERIC AS total FROM recruitment_applications a ${cycleFilter ? `${cycleFilter} AND` : 'WHERE'} payment_status = 'paid'`, params),
      safeQuery(
        `SELECT r.title, COUNT(a.id)::INT AS applicants,
                COALESCE(SUM(CASE WHEN a.payment_status = 'paid' THEN a.application_fee ELSE 0 END), 0)::NUMERIC AS revenue
         FROM recruitment_roles r
         LEFT JOIN recruitment_applications a ON a.role_id = r.id ${req.query?.cycle_id ? 'AND a.cycle_id = $1' : ''}
         GROUP BY r.id, r.title
         ORDER BY applicants DESC`,
        params
      ),
      safeQuery(
        `SELECT TO_CHAR(DATE_TRUNC('month', a.created_at), 'YYYY-MM') AS month, COUNT(*)::INT AS applicants
         FROM recruitment_applications a
         ${cycleFilter}
         GROUP BY DATE_TRUNC('month', a.created_at)
         ORDER BY month`,
        params
      ),
      safeQuery(
        `SELECT
           COUNT(*) FILTER (WHERE interview_completed = TRUE)::INT AS completed,
           COUNT(*) FILTER (WHERE interview_passed = TRUE)::INT AS passed,
           COALESCE(AVG(interview_score), 0)::NUMERIC AS average_score
         FROM recruitment_applications a
         ${cycleFilter}`,
        params
      ),
      safeQuery(
        `SELECT status, COUNT(*)::INT AS count
         FROM recruitment_applications a
         ${cycleFilter}
         GROUP BY status`,
        params
      ),
      safeQuery(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600), 0)::NUMERIC AS avg_hours
         FROM recruitment_applications a
         ${cycleFilter ? `${cycleFilter} AND` : 'WHERE'} status <> 'draft'`,
        params
      ),
      safeQuery(
        `SELECT state_name, lga_name, COUNT(*)::INT AS applicants
         FROM recruitment_applications a
         ${cycleFilter}
         GROUP BY state_name, lga_name
         ORDER BY applicants DESC
         LIMIT 25`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: {
        total_applicants: total.rows[0]?.count || 0,
        total_fees_collected: Number(fees.rows[0]?.total || 0),
        per_role: perRole.rows,
        monthly_trends: monthly.rows,
        interview: interview.rows[0] || { completed: 0, passed: 0, average_score: 0 },
        conversion_funnel: funnel.rows,
        average_completion_hours: Number(completionTime.rows[0]?.avg_hours || 0),
        location_heatmap: locationHeatmap.rows,
      },
    });
  } catch (error) {
    console.error('getAnalytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to load recruitment analytics' });
  }
};

exports.emailDocuments = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { rows } = await getApplicationRows(req.body || req.query || {}, { paginate: false });
    const csvRows = [
      ['Reference', 'Name', 'Email', 'Phone', 'Role', 'State', 'LGA', 'Area', 'Payment', 'Status'].join(','),
      ...rows.map((row) => [
        row.reference_number,
        row.full_name,
        row.email_address,
        row.phone_number,
        row.role_title,
        row.state_name,
        row.lga_name,
        row.area_locality,
        row.payment_status,
        row.status,
      ].map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(',')),
    ];

    await sendEmail({
      to: req.body?.recipient_email || RECRUITMENT_EMAIL,
      subject: 'RentalHub NG Recruitment Export',
      html: `<p>Attached is the recruitment applicant summary export. Matching applicants: <strong>${rows.length}</strong>.</p><p>Use the Recruitment Dashboard to download bulk document ZIP files when needed.</p>`,
      attachments: [
        {
          filename: 'recruitment_applicants.csv',
          content: Buffer.from(csvRows.join('\n')).toString('base64'),
        },
      ],
    });

    if (rows.length) {
      await db.query(
        'UPDATE recruitment_applications SET documents_emailed = TRUE, documents_emailed_at = NOW() WHERE id = ANY($1::int[])',
        [rows.map((row) => row.id)]
      );
    }

    res.json({ success: true, message: 'Recruitment export email sent', data: { count: rows.length } });
  } catch (error) {
    console.error('emailDocuments error:', error);
    res.status(500).json({ success: false, message: 'Failed to send recruitment email' });
  }
};

exports.autoEmailDocuments = exports.emailDocuments;

exports.bulkUploadQuestions = async (req, res) => {
  try {
    if (!(await isRecruitmentAdmin(req.user.id))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!questions.length) {
      return res.status(400).json({ success: false, message: 'Questions array is required' });
    }

    const invalid = [];
    const valid = [];
    questions.forEach((item, index) => {
      const answer = String(item.correct_answer || '').trim().toUpperCase().slice(0, 1);
      const missing = ['question', 'option_a', 'option_b', 'option_c', 'option_d']
        .filter((field) => !normalizeText(item[field]));
      if (!['A', 'B', 'C', 'D'].includes(answer)) {
        missing.push('correct_answer');
      }
      if (missing.length) {
        invalid.push({ index, missing });
        return;
      }
      valid.push({ ...item, correct_answer: answer });
    });

    if (invalid.length) {
      return res.status(400).json({
        success: false,
        message: `${invalid.length} question(s) have invalid or missing fields`,
        errors: invalid,
      });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      for (const item of valid) {
        await client.query(
          `INSERT INTO recruitment_questions (question, option_a, option_b, option_c, option_d, correct_answer, category, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            normalizeText(item.question),
            normalizeText(item.option_a),
            normalizeText(item.option_b),
            normalizeText(item.option_c),
            normalizeText(item.option_d),
            item.correct_answer,
            normalizeText(item.category) || 'general',
            req.user.id,
          ]
        );
        inserted += 1;
      }
      await client.query('COMMIT');
      res.json({ success: true, data: { inserted } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('bulkUploadQuestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload questions' });
  }
};

exports.getQuestions = exports.getAllQuestions;

exports.uploadInterviewRecording = async (req, res) => {
  try {
    const { application_id, challenge_token, fingerprint } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Recording file is required' });
    }

    if (!application_id) {
      return res.status(400).json({ success: false, message: 'Application ID is required' });
    }

    const appResult = await db.query(
      `SELECT id, interview_challenge_token, interview_fingerprint
       FROM recruitment_applications
       WHERE id = $1
         AND interview_started_at IS NOT NULL
       LIMIT 1`,
      [application_id]
    );

    if (!appResult.rows.length) {
      return res.status(403).json({ success: false, message: 'No interview session found' });
    }

    const application = appResult.rows[0];
    if (application.interview_challenge_token && challenge_token !== application.interview_challenge_token) {
      return res.status(403).json({ success: false, message: 'Interview session challenge failed' });
    }

    if (
      application.interview_fingerprint &&
      fingerprint &&
      normalizeText(fingerprint) !== normalizeText(application.interview_fingerprint)
    ) {
      return res.status(403).json({ success: false, message: 'Interview browser fingerprint changed' });
    }

    const result = await db.query(
      `INSERT INTO recruitment_interview_recordings
         (application_id, recording_path, recording_duration, violation_log)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        application.id,
        req.file.path,
        Number(req.body?.duration_seconds) || null,
        normalizeText(req.body?.violation_log) || null,
      ]
    );

    res.json({ success: true, data: result.rows[0], message: 'Interview recording saved' });
  } catch (error) {
    console.error('uploadInterviewRecording error:', error);
    res.status(500).json({ success: false, message: 'Failed to save interview recording' });
  }
};
