const logger = require('../config/utils/logger');
const cron = require('node-cron');
const fs = require('fs');
const db = require('../config/middleware/database');
const { sendEmail } = require('../config/utils/mailer');

let archiver = null;
try {
  archiver = require('archiver');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
  logger.error('Recruitment closure ZIP dependency "archiver" is not installed. Document ZIP attachments will be skipped until npm install is run.');
}

const RECRUITMENT_EMAIL = process.env.RECRUITMENT_EMAIL || 'recruitment@rentalhub.com.ng';
const RECRUITMENT_CLOSURE_CRON = process.env.RECRUITMENT_CLOSURE_CRON || '15 0 * * *';
const MAX_EMAIL_ATTACHMENT_BYTES = Number(process.env.RECRUITMENT_MAX_EMAIL_ATTACHMENT_BYTES || 18 * 1024 * 1024);
const STALE_PAYMENT_HOURS = Number(process.env.RECRUITMENT_STALE_PAYMENT_HOURS || 24);

const safeFileSegment = (value) =>
  String(value || 'file')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'file';

const csvEscape = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

const createDocumentsZipBuffer = async (docs) =>
  new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('warning', (error) => logger.warn('Recruitment ZIP warning:', error.message));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    docs.forEach((doc) => {
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        archive.file(doc.file_path, {
          name: `${safeFileSegment(doc.reference_number || doc.application_id)}/${safeFileSegment(doc.document_type)}_${safeFileSegment(doc.file_name)}`,
        });
      }
    });

    const finalizeResult = archive.finalize();
    if (finalizeResult?.catch) {
      finalizeResult.catch(reject);
    }
  });

const buildApplicantsCsv = (applications) => {
  const rows = [
    ['Reference', 'Name', 'Email', 'Phone', 'Role', 'State', 'LGA', 'Area', 'Payment', 'Status', 'Score'].join(','),
    ...applications.map((row) => [
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
      row.interview_score,
    ].map(csvEscape).join(',')),
  ];

  return rows.join('\n');
};

const deleteCycleRecordings = async (cycleId) => {
  const recordings = await db.query(
    `SELECT r.id, r.recording_path
     FROM recruitment_interview_recordings r
     JOIN recruitment_applications a ON a.id = r.application_id
     WHERE a.cycle_id = $1`,
    [cycleId]
  );

  const deletedIds = [];
  for (const recording of recordings.rows) {
    if (recording.recording_path && fs.existsSync(recording.recording_path)) {
      try {
        fs.unlinkSync(recording.recording_path);
      } catch (error) {
        logger.error('Failed to delete recruitment recording:', error.message);
        continue;
      }
    }
    deletedIds.push(recording.id);
  }

  if (deletedIds.length) {
    await db.query(
      'DELETE FROM recruitment_interview_recordings WHERE id = ANY($1::int[])',
      [deletedIds]
    );
  }

  return deletedIds.length;
};

const emailClosedCycleDocuments = async (cycle) => {
  const applications = await db.query(
    `SELECT a.*, r.title AS role_title
     FROM recruitment_applications a
     JOIN recruitment_roles r ON r.id = a.role_id
     WHERE a.cycle_id = $1
       AND a.status <> 'draft'
       AND COALESCE(a.documents_emailed, FALSE) = FALSE
     ORDER BY a.created_at`,
    [cycle.id]
  );

  if (!applications.rows.length) {
    const recordingsDeleted = await deleteCycleRecordings(cycle.id);
    return { emailed: 0, recordingsDeleted };
  }

  const applicationIds = applications.rows.map((row) => row.id);
  const docs = await db.query(
    `SELECT d.*, a.reference_number
     FROM recruitment_documents d
     JOIN recruitment_applications a ON a.id = d.application_id
     WHERE d.application_id = ANY($1::int[])
     ORDER BY a.reference_number, d.document_type`,
    [applicationIds]
  );

  const csv = buildApplicantsCsv(applications.rows);
  const attachments = [
    {
      filename: `recruitment_cycle_${safeFileSegment(cycle.id)}_summary.csv`,
      content: Buffer.from(csv).toString('base64'),
    },
  ];

  let docsNote = 'No uploaded documents were found for this cycle.';
  if (docs.rows.length) {
    if (!archiver) {
      docsNote = `Uploaded documents were found (${docs.rows.length}), but ZIP attachment generation is unavailable because archiver is not installed on the server. Use the Recruitment Admin dashboard after dependencies are installed.`;
    } else {
      const zipBuffer = await createDocumentsZipBuffer(docs.rows);
      if (zipBuffer.length <= MAX_EMAIL_ATTACHMENT_BYTES) {
        attachments.push({
          filename: `recruitment_cycle_${safeFileSegment(cycle.id)}_documents.zip`,
          content: zipBuffer.toString('base64'),
        });
        docsNote = `Attached ZIP contains ${docs.rows.length} uploaded document file(s).`;
      } else {
        docsNote = `Document ZIP was ${Math.ceil(zipBuffer.length / 1024 / 1024)}MB, above the configured email attachment limit. Use the Recruitment Admin dashboard bulk download for documents.`;
      }
    }
  }

  await sendEmail({
    to: RECRUITMENT_EMAIL,
    subject: `RentalHub NG Recruitment Cycle Closed - ${cycle.title || cycle.id}`,
    html: `
      <p>The recruitment cycle <strong>${cycle.title || cycle.id}</strong> has closed.</p>
      <p>Applicants exported: <strong>${applications.rows.length}</strong>.</p>
      <p>${docsNote}</p>
    `,
    attachments,
  });

  await db.query(
    `UPDATE recruitment_applications
     SET documents_emailed = TRUE,
         documents_emailed_at = NOW()
     WHERE id = ANY($1::int[])`,
    [applicationIds]
  );

  const recordingsDeleted = await deleteCycleRecordings(cycle.id);
  return { emailed: applications.rows.length, recordingsDeleted };
};

const runRecruitmentClosureJob = async () => {
  const cycles = await db.query(
    `SELECT id, title, close_date, extension_date
     FROM recruitment_cycles
     WHERE COALESCE(extension_date, close_date) <= CURRENT_DATE`
  );

  for (const cycle of cycles.rows) {
    try {
      const result = await emailClosedCycleDocuments(cycle);
      if (result.emailed || result.recordingsDeleted) {
        logger.info('Recruitment closure job completed', { cycleId: cycle.id, ...result });
      }
    } catch (error) {
      logger.error(`Recruitment closure job failed for cycle ${cycle.id}:`, error.message);
    }
  }
};

const cleanupStaleRecruitmentPayments = async () => {
  const result = await db.query(
    `UPDATE recruitment_applications
     SET payment_reference = NULL,
         updated_at = NOW(),
         admin_notes = CONCAT_WS(E'\n', admin_notes, $2)
     WHERE payment_status = 'pending'
       AND payment_reference IS NOT NULL
       AND updated_at < NOW() - ($1::int * INTERVAL '1 hour')
     RETURNING id`,
    [STALE_PAYMENT_HOURS, `Stale recruitment payment reference cleared after ${STALE_PAYMENT_HOURS} hours.`]
  );

  if (result.rowCount) {
    logger.info(`Cleared ${result.rowCount} stale recruitment payment reference(s)`);
  }
};

const startRecruitmentJobs = () => {
  const runJobs = async () => {
    await cleanupStaleRecruitmentPayments();
    await runRecruitmentClosureJob();
  };

  cron.schedule(RECRUITMENT_CLOSURE_CRON, runJobs);
  logger.info(`Recruitment closure scheduler started (${RECRUITMENT_CLOSURE_CRON})`);
};

module.exports = {
  cleanupStaleRecruitmentPayments,
  runRecruitmentClosureJob,
  startRecruitmentJobs,
};
