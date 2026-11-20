const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { requirePrivilegedMfa } = require('../config/utils/twoFactor');
const {
  getAnalysis,
  getProjections,
  listResponses,
  paperEntry,
  deleteResponse,
  computeAnalysis,
  saveLocationConfig,
  getLocationConfigForAdmin,
  enableAllLocationConfig,
  disableAllLocationConfig,
  getFxConfigForAdmin,
  saveFxConfig,
} = require('../services/surveyAnalysisService');
const pushService = require('../services/pushService');
const { requireDiasporaAdmin } = require('../services/diasporaAdminService');

// The survey admin panel is restricted to the same financial/super roles.
router.use(authenticate);
router.use(requireDiasporaAdmin);
router.use(requirePrivilegedMfa);

// Analysis + projections
router.get('/analysis', getAnalysis);
router.get('/projections', getProjections);

// Responses (paper entry + review)
router.get('/responses', listResponses);
router.post('/paper-entry', paperEntry);
router.delete('/responses/:responseId', deleteResponse);

// Push reminder admin controls
router.post('/reminders/send', async (req, res) => {
  await pushService.sendSurveyReminders(req, res);
});

// Location gate admin controls
router.get('/location-config', getLocationConfigForAdmin);
router.post('/location-config', saveLocationConfig);
router.post('/location-config/enable-all', enableAllLocationConfig);
router.post('/location-config/disable-all', disableAllLocationConfig);

// Foreign-card FX rules
router.get('/fx-config', getFxConfigForAdmin);
router.post('/fx-config', saveFxConfig);

// PDF + CSV export
router.get('/export.pdf', async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const type = String(req.query.type || 'tenant').toLowerCase();

    const data = await computeAnalysis({
      type,
      from: req.query.from || null,
      to: req.query.to || null,
      source: req.query.source || null,
    });
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="survey-analysis-${type}-${Date.now()}.pdf"`
    );
    doc.pipe(res);

    doc.fontSize(20).text('Amana RentalHub NG', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(13).text(
      `${type === 'landlord' ? 'Landlord' : 'Tenant'} Survey Analysis Report`,
      { align: 'center' }
    );
    doc.fontSize(9).fillColor('#64748b').text(`Generated ${new Date().toLocaleString('en-NG')}`, { align: 'center' });
    doc.moveDown();

    // Overview
    doc.fontSize(12).fillColor('#0f172a').text('1. Overview');
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(`Total responses: ${data.meta.total}`);
    doc.text(`Completed: ${data.meta.completed}`);
    doc.text(`Average time spent: ${Math.round(data.meta.avg_time_seconds / 60)} minutes`);
    doc.text(`NPS score: ${data.nps.score === null ? 'n/a' : data.nps.score} (${data.nps.promoters} promoters, ${data.nps.detractors} detractors)`);
    doc.text(`Responses by state:`);
    data.meta.by_state.forEach((s) => doc.text(`   - ${s.state}: ${s.count}`));
    doc.moveDown();

    // Pain points
    const pain = data.frequencies.filter((f) => f.analysis === 'pain' && f.mean !== null);
    if (pain.length) {
      doc.fontSize(12).fillColor('#0f172a').text('2. Top Pain Points (1–5 agreement means)');
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      pain
        .sort((a, b) => b.mean - a.mean)
        .slice(0, 12)
        .forEach((p, i) => {
          doc.text(`${i + 1}. [${p.mean}] ${p.prompt}`, { width: 480 });
        });
      doc.moveDown();
    }

    // Feature ranking
    doc.fontSize(12).fillColor('#0f172a').text('3. Feature Priority');
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    data.feature.importance.slice(0, 10).forEach((f, i) => {
      doc.text(`${i + 1}. [${f.mean === null ? 'n/a' : f.mean}] ${f.prompt}`, { width: 480 });
    });
    doc.text('Most-picked features (top 3 choices):');
    data.feature.picks.slice(0, 10).forEach((p) => doc.text(`   - ${p.label} (${p.count} picks)`));
    doc.moveDown();

    // Fraud + cost highlights
    const fraud = data.frequencies.find((f) => f.key === 'T4.1') ||
                  data.frequencies.find((f) => f.key === 'L3.2');
    if (fraud) {
      doc.fontSize(12).fillColor('#0f172a').text('4. Key Signals');
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      const yesCount = fraud.counts['yes'] || 0;
      doc.text(`${fraud.prompt}`);
      doc.text(`   Yes: ${yesCount} of ${fraud.answered} respondents`);
      doc.moveDown();
    }

    // Open answers
    doc.fontSize(12).fillColor('#0f172a').text('5. Open-Ended Answers (first 10 per question)');
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    for (const section of data.open_answers) {
      if (!section.answers.length) continue;
      doc.font('Helvetica-Bold').text(section.prompt);
      doc.font('Helvetica');
      section.answers.slice(0, 10).forEach((a) => {
        doc.text(`   • ${a.text}`, { width: 480 });
      });
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#94a3b8').text('Thank you for using Amana RentalHub NG.', { align: 'center' });
    doc.end();
  } catch (error) {
    req.logger.error('Survey PDF export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate survey report PDF' });
    }
  }
});

// CSV export of raw responses (flattened single/multi answers)
router.get('/export.csv', async (req, res) => {
  try {
    const type = String(req.query.type || 'tenant').toLowerCase();
    const { buildSurveyCsv } = require('../config/utils/surveyCsv');

    // Reuse analysis to get full rows? listResponses is paginated; instead
    // query directly here.
    const db = require('../config/middleware/database');
    const result = await db.query(
      `SELECT sr.respondent_code, sr.source, sr.admin_mode, sr.admin_date,
              s.state_name, sr.lga_name, sr.agent_user_id, sr.consent_flags,
              u.full_name AS user_full_name, u.phone AS user_phone, u.email AS user_email,
              sr.respondent_name, sr.respondent_phone, sr.respondent_email,
              sr.respondent_location, sr.respondent_state_of_origin, sr.has_email,
              COALESCE(NULLIF(sr.agent_name,''),ag.full_name) AS agent_name,
              COALESCE(NULLIF(sr.agent_phone,''),ag.phone) AS agent_phone,
              COALESCE(NULLIF(sr.agent_lga,''),NULLIF(ag.assigned_lga,''),NULLIF(ag.assigned_city,'')) AS agent_lga, sr.agent_location,
              sr.created_at, sr.completed_at,
              sr.time_spent_seconds, sr.answers
       FROM survey_responses sr
       LEFT JOIN states s ON s.id = sr.state_id
       LEFT JOIN users u ON u.id = sr.user_id
       LEFT JOIN users ag ON ag.id = sr.agent_user_id
       WHERE sr.survey_type = $1 AND sr.completed_at IS NOT NULL AND sr.superseded_at IS NULL
       ORDER BY sr.created_at DESC`,
      [type]
    );

    const { getQuestions } = require('../config/survey');
    const questions = getQuestions(type);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="survey-responses-${type}-${Date.now()}.csv"`
    );
    return res.send(buildSurveyCsv(result.rows, questions));
  } catch (error) {
    req.logger.error('Survey CSV export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export survey CSV' });
  }
});

module.exports = router;
