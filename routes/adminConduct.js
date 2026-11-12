const {requirePrivilegedMfa}=require('../config/utils/twoFactor');
const express = require('express'),
  crypto = require('crypto'),
  path = require('path'),
  fs = require('fs'),
  axios = require('axios');
const router = express.Router(),
  db = require('../config/middleware/database');
const {
  authenticate,
  requireNotImpersonating
} = require('../config/middleware/auth');
const {
  ALL_ADMIN_ROLES,
  normalizeRole
} = require('../config/utils/roleHierarchy');
const {
  logAction
} = require('../config/utils/auditLogger');
const {
  getFrontendUrl
} = require('../config/utils/frontendUrl');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const ROOT = path.resolve(__dirname, '../private/admin-conduct');
const CONSENT = 'I have read this Code of Conduct, understand it and agree to follow it. I intend my typed full name to be my electronic signature on this document.';
const review = u => u.user_type === 'super_admin' || u.user_type === 'recruitment_admin' || u.is_recruitment_admin === true;
const eligible = u => ALL_ADMIN_ROLES.includes(normalizeRole(u.user_type)) && u.user_type !== 'super_admin';
const fail = (status, message) => {
  throw Object.assign(new Error(message), {
    status
  });
};
const safe = fn => async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await fn(req, res);
  } catch (e) {
    req.logger?.error('Conduct service failed', {
      code: e.code
    });
    if (!res.headersSent) res.status(e.status || 503).json({
      message: e.status ? e.message : 'The conduct service is temporarily unavailable. Please retry; do not pay again.'
    });
  }
};
router.use(authenticate, requirePrivilegedMfa, requireNotImpersonating, rateLimit({
  windowMs: 60000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
}));
router.use((req, res, next) => eligible(req.user) || review(req.user) ? next() : res.status(403).json({
  message: 'Administrator access required'
}));
router.get('/mine', safe(async (req, res) => {
  const documents = (await db.query('SELECT id,role,version,sha256,active FROM admin_conduct_documents WHERE role=$1 AND active=TRUE', [normalizeRole(req.user.user_type)])).rows;
  const submissions = (await db.query('SELECT * FROM admin_conduct_submissions WHERE user_id=$1 ORDER BY signed_at DESC', [req.user.id])).rows;
  res.json({
    data: {
      documents,
      submissions,
      fee: 5000,
      consent: CONSENT,
      physical_submission_free: true
    }
  });
}));
router.get('/documents', safe(async (req, res) => {
  if (req.user.user_type !== 'super_admin') fail(403, 'Super Admin approval required');
  res.json({
    data: (await db.query('SELECT * FROM admin_conduct_documents ORDER BY role,version')).rows
  });
}));
router.post('/documents/:id/adopt', safe(async (req, res) => {
  if (req.user.user_type !== 'super_admin' || req.body.confirm !== true) fail(403, 'Super Admin must confirm adoption');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const d = (await client.query('SELECT * FROM admin_conduct_documents WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!d) fail(404, 'Document not found');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [d.role]);
    const file = path.join(ROOT, d.file_name);
    if (path.dirname(file) !== ROOT || !fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== d.sha256) fail(409, 'Document file is missing or changed');
    await client.query('UPDATE admin_conduct_documents SET active=FALSE WHERE role=$1', [d.role]);
    await client.query('UPDATE admin_conduct_documents SET active=TRUE,adopted_by=$1,adopted_at=NOW() WHERE id=$2', [req.user.id, d.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await logAction({
    actorId: req.user.id,
    action: 'ADMIN_CONDUCT_ADOPTED',
    targetType: 'conduct_document',
    targetId: req.params.id
  });
  res.json({
    message: 'Document adopted and available for this admin role.'
  });
}));
router.get('/documents/:id/download', safe(async (req, res) => {
  const d = (await db.query('SELECT * FROM admin_conduct_documents WHERE id=$1', [req.params.id])).rows[0];
  if (!d || !review(req.user) && (d.role !== normalizeRole(req.user.user_type) || !d.active)) fail(404, 'Document not available');
  const file = path.join(ROOT, d.file_name);
  if (path.dirname(file) !== ROOT || !fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== d.sha256) fail(409, 'Document file is missing or changed');
  res.download(file, d.file_name);
}));
router.post('/sign', safe(async (req, res) => {
  if (!eligible(req.user)) fail(403, 'Super Admin does not submit this form');
  const name = String(req.body.signed_name || '').trim().replace(/\s+/g, ' ');
  if (req.body.consent !== true || name.toLocaleLowerCase() !== String(req.user.full_name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase() || name.length < 3 || name.length > 255) fail(400, 'Read the document, accept the signing statement and type your account full name.');
  const d = (await db.query('SELECT * FROM admin_conduct_documents WHERE id=$1 AND role=$2 AND active=TRUE', [req.body.document_id, normalizeRole(req.user.user_type)])).rows[0];
  if (!d || req.body.document_hash !== d.sha256) fail(409, 'Read the current approved document before signing.');
  const id = crypto.randomUUID(),
    reference = 'CONDUCT-' + crypto.randomBytes(16).toString('hex');
  const r = await db.query(`INSERT INTO admin_conduct_submissions(id,user_id,document_id,signed_name,signature_consent,document_hash,payment_reference,payment_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,document_id) DO NOTHING RETURNING *`, [id, req.user.id, d.id, name, CONSENT, d.sha256, reference, require('../config/utils/paymentEmail')(req.user.email)]);
  let record = r.rows[0] || (await db.query('SELECT * FROM admin_conduct_submissions WHERE user_id=$1 AND document_id=$2', [req.user.id, d.id])).rows[0];
  if(record.status==='returned'){
    const corrected=await db.query(`UPDATE admin_conduct_submissions SET signature_history=signature_history || jsonb_build_array(jsonb_build_object('signed_name',signed_name,'signature_consent',signature_consent,'document_hash',document_hash,'signed_at',signed_at)),signed_name=$1,signed_at=NOW(),status='submitted',submitted_at=NOW(),notified_at=NULL WHERE id=$2 AND user_id=$3 AND status='returned' AND paid_at IS NOT NULL RETURNING *`,[name,record.id,req.user.id]);
    if(corrected.rows[0])record=corrected.rows[0];
  }
  await logAction({
    actorId: req.user.id,
    action: 'ADMIN_CONDUCT_SIGNED',
    targetType: 'conduct_document',
    targetId: d.id
  });
  res.json({
    data: record
  });
}));
const gateway = () => {
  if (!process.env.PAYSTACK_SECRET_KEY) fail(503, 'Payment service is not configured');
  return {
    headers: {
      Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY
    },
    timeout: 20000
  };
};
router.post('/:id/pay', safe(async (req, res) => {
  const s = (await db.query('SELECT * FROM admin_conduct_submissions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
  if (!s) fail(404, 'Submission not found');
  if (s.status !== 'pending_payment') fail(409, 'This submission is already paid.');
  if (s.checkout_url) return res.json({
    data: {
      authorization_url: s.checkout_url,
      reference: s.payment_reference
    }
  });
  const result = await axios.post('https://api.paystack.co/transaction/initialize', {
    email: s.payment_email,
    amount: 500000,
    currency: 'NGN',
    reference: s.payment_reference,
    callback_url: getFrontendUrl() + '/admin/code-of-conduct?reference=' + encodeURIComponent(s.payment_reference),
    metadata: {
      type: 'admin_conduct_submission',
      submission_id: s.id
    }
  }, gateway());
  if (!result.data?.status || !result.data?.data?.authorization_url) fail(502, 'Checkout could not be opened.');
  await db.query('UPDATE admin_conduct_submissions SET checkout_url=$1 WHERE id=$2', [result.data.data.authorization_url, s.id]);
  res.json({
    data: {
      authorization_url: result.data.data.authorization_url,
      reference: s.payment_reference
    }
  });
}));
router.post('/:id/verify', safe(async (req, res) => {
  const data = await require('../services/conductPaymentService').reconcile(req.params.id, req.user.id);
  res.json({
    data,
    message: 'Payment confirmed. Submitted to Recruitment Admin.'
  });
}));
router.get('/queue', safe(async (req, res) => {
  if (!review(req.user)) fail(403, 'Recruitment access required');
  res.json({
    data: (await db.query("SELECT s.*,u.full_name,u.user_type,d.version FROM admin_conduct_submissions s JOIN users u ON u.id=s.user_id JOIN admin_conduct_documents d ON d.id=s.document_id WHERE s.status<>'pending_payment' ORDER BY s.submitted_at DESC LIMIT 200")).rows
  });
}));
router.post('/:id/review', safe(async (req, res) => {
  if (!review(req.user) || !['accepted', 'returned'].includes(req.body.status)) fail(403, 'Recruitment review required');
  if (String(req.body.note || '').trim().length < 5) fail(400, 'Enter a review note.');
  const r = await db.query("UPDATE admin_conduct_submissions SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW() WHERE id=$4 AND user_id<>$2 AND status IN ('submitted','returned') RETURNING user_id", [req.body.status, req.user.id, String(req.body.note).slice(0, 2000), req.params.id]);
  if (!r.rows.length) fail(409, 'Submission cannot be reviewed. You cannot review yourself.');
  await logAction({
    actorId: req.user.id,
    action: 'ADMIN_CONDUCT_' + req.body.status.toUpperCase(),
    targetType: 'user',
    targetId: r.rows[0].user_id
  });
  res.json({
    message: 'Review recorded.'
  });
}));
router.get('/:id/receipt', safe(async (req, res) => {
  const s = (await db.query('SELECT * FROM admin_conduct_submissions WHERE id=$1', [req.params.id])).rows[0];
  if (!s || !review(req.user) && Number(s.user_id) !== Number(req.user.id) || !s.paid_at) fail(404, 'Paid submission not found');
  res.type('pdf').attachment('conduct-signature-and-receipt.pdf');
  const pdf = new PDFDocument({
    margin: 50
  });
  pdf.pipe(res);
  pdf.fontSize(18).text('Amana RentalHub NG');
  pdf.fontSize(14).text('Code of Conduct — signature record and payment receipt');
  pdf.moveDown();
  pdf.fontSize(11).text('This record accompanies the exact Code of Conduct identified below.');
  for (const [label, value] of Object.entries({
    Signer: s.signed_name,
    'Document ID': s.document_id,
    'Document SHA-256': s.document_hash,
    'Signed at': s.signed_at,
    'Signing statement': s.signature_consent,
    'Payment reference': s.payment_reference,
    'Amount paid': 'NGN 5,000',
    'Paid at': s.paid_at,
    'Submitted at': s.submitted_at,
    'Previous signature records': JSON.stringify(s.signature_history||[]),
    Status: s.status
  })) pdf.moveDown().text(label + ': ' + value);
  pdf.end();
}));
router.get('/:id/signed-copy', safe(async (req, res) => {
  const s = (await db.query('SELECT s.*,d.file_name FROM admin_conduct_submissions s JOIN admin_conduct_documents d ON d.id=s.document_id WHERE s.id=$1', [req.params.id])).rows[0];
  if (!s || !review(req.user) && Number(s.user_id) !== Number(req.user.id) || !s.paid_at) fail(404, 'Paid submission not found');
  const file = path.join(ROOT, s.file_name);
  if (path.dirname(file) !== ROOT || !fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== s.document_hash) fail(409, 'The signed document copy is unavailable.');
  const pdf = new PDFDocument({
      margin: 50
    }),
    chunks = [];
  pdf.on('data', c => chunks.push(c));
  const ready = new Promise((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });
  pdf.fontSize(18).text('Amana RentalHub NG — Electronic signature');
  pdf.moveDown().fontSize(11);
  for (const [key, v] of Object.entries({
    Signer: s.signed_name,
    Consent: s.signature_consent,
    'Signed at': s.signed_at,
    'Document SHA-256': s.document_hash,
    'Payment reference': s.payment_reference,
    'Amount paid': 'NGN 5,000',
    'Paid at': s.paid_at,
    'Submitted at': s.submitted_at,
    'Previous signature records': JSON.stringify(s.signature_history||[])
  })) pdf.moveDown().text(key + ': ' + v);
  pdf.end();
  await ready;
  res.type('zip').attachment('Signed-Code-of-Conduct.zip');
  const zip = require('archiver')('zip', {
    zlib: {
      level: 9
    }
  });
  zip.on('error', () => res.destroy());
  zip.pipe(res);
  zip.file(file, {
    name: 'Code-of-Conduct.pdf'
  });
  zip.append(Buffer.concat(chunks), {
    name: 'Electronic-signature-and-receipt.pdf'
  });
  await zip.finalize();
}));
module.exports = router;
