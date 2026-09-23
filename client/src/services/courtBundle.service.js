const PDFDocument = require('pdfkit');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/middleware/database');
const { buildMerkleRoot } = require('./merkleEvidence.service');
const QRCode = require('qrcode');

exports.generateCourtBundle = async (disputeId) => {

  const dispute = await db.query(
    `SELECT d.*, 
            u1.full_name AS opened_by_name,
            u2.full_name AS against_name
     FROM disputes d
     JOIN users u1 ON d.opened_by = u1.id
     JOIN users u2 ON d.against_user = u2.id
     WHERE d.id = $1`,
    [disputeId]
  );

  const messages = await db.query(
    `SELECT m.*, u.full_name
     FROM dispute_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE dispute_id = $1
     ORDER BY m.created_at`,
    [disputeId]
  );

  const evidence = await db.query(
    `SELECT * FROM dispute_evidence
     WHERE dispute_id = $1`,
    [disputeId]
  );

  // =========================
// Evidence Merkle Root
// =========================

const evidenceHashes = evidence.rows.map(e => e.file_hash);

const merkleRoot = buildMerkleRoot(evidenceHashes);

  const audit = await db.query(
    `SELECT action, previous_hash, current_hash, created_at
     FROM audit_logs
     WHERE target_type = 'dispute'
     AND target_id = $1
     ORDER BY id`,
    [disputeId]
  );

  const d = dispute.rows[0];

  // =========================
// Verification QR Code
// =========================

const verificationUrl =
  `${process.env.APP_URL}/verify-case?dispute=${disputeId}`;

const qrImage = await QRCode.toDataURL(verificationUrl);

  // =========================
  // Evidence Verification
  // =========================

  const evidenceVerification = [];

  for (const ev of evidence.rows) {

    const fileBuffer = fs.readFileSync(ev.file_path);

    const recalculatedHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    evidenceVerification.push({
      file: ev.file_name,
      storedHash: ev.file_hash,
      recalculatedHash,
      valid: ev.file_hash === recalculatedHash
    });

  }

  // =========================
  // Audit Chain Verification
  // =========================

  let auditValid = true;

  for (let i = 1; i < audit.rows.length; i++) {

    if (audit.rows[i].previous_hash !== audit.rows[i - 1].current_hash) {
      auditValid = false;
      break;
    }

  }

  const filePath = `uploads/court_bundle_dispute_${disputeId}.pdf`;

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  // =========================
  // SECTION 1 — Case Summary
  // =========================

  doc.fontSize(20).text('Court Evidence Bundle', { align: 'center' });
  doc.moveDown();

  // Convert base64 QR image
const qrBase64 = qrImage.replace(/^data:image\/png;base64,/, '');
const qrBuffer = Buffer.from(qrBase64, 'base64');

doc.image(qrBuffer, {
  fit: [120, 120],
  align: 'right'
});

doc.moveDown();
doc.fontSize(10).text('Scan QR Code to Verify Evidence Online');
doc.moveDown();

  doc.fontSize(14).text(`Dispute ID: ${d.id}`);
  doc.text(`Opened By: ${d.opened_by_name}`);
  doc.text(`Against: ${d.against_name}`);
  doc.text(`Title: ${d.title}`);
  doc.text(`Description: ${d.description}`);
  doc.text(`Status: ${d.status}`);
  doc.text(`Created At: ${d.created_at}`);
  doc.moveDown();

  // =========================
  // SECTION 2 — Messages
  // =========================

  doc.fontSize(16).text('Messages Timeline');
  doc.moveDown();

  messages.rows.forEach(msg => {

    doc.fontSize(12).text(
      `${msg.created_at} - ${msg.full_name}: ${msg.message}`
    );

  });

  doc.moveDown();

  // =========================
  // SECTION 3 — Evidence
  // =========================

  doc.fontSize(16).text('Evidence List');
  doc.moveDown();

  doc.fontSize(12).text('Evidence Merkle Root:');
doc.text(merkleRoot);
doc.moveDown();

// =========================
// Evidence Public Anchor
// =========================

doc.moveDown();
doc.fontSize(14).text('Evidence Public Anchor');

doc.fontSize(10).text(`Merkle Root: ${d.evidence_merkle_root}`);
doc.text(`Timestamp Proof: ${d.evidence_anchor || 'Not Anchored'}`);
doc.moveDown();

  evidence.rows.forEach(ev => {

    doc.fontSize(12).text(`File: ${ev.file_name}`);
    doc.text(`Hash (SHA256): ${ev.file_hash}`);
    doc.moveDown();

  });

  // =========================
  // SECTION 4 — Audit Ledger
  // =========================

  doc.fontSize(16).text('Audit Ledger');
  doc.moveDown();

  audit.rows.forEach(a => {

    doc.fontSize(10).text(`${a.created_at} | ${a.action}`);
    doc.text(`Prev: ${a.previous_hash}`);
    doc.text(`Hash: ${a.current_hash}`);
    doc.moveDown();

  });

  // =========================
  // SECTION 5 — Verification
  // =========================

  doc.addPage();

  doc.fontSize(18).text('Verification Report');
  doc.moveDown();

  doc.fontSize(14).text('Dispute Seal');
  doc.text(d.is_legally_sealed ? 'SEALED ✓' : 'NOT SEALED ✗');

  doc.moveDown();

  doc.fontSize(14).text('Audit Chain Integrity');
  doc.text(auditValid ? 'VALID ✓' : 'BROKEN ✗');

  doc.moveDown();

  doc.fontSize(14).text('Evidence Verification');
  doc.moveDown();

  evidenceVerification.forEach(e => {

    doc.fontSize(10).text(`File: ${e.file}`);
    doc.text(`Stored Hash: ${e.storedHash}`);
    doc.text(`Recalculated Hash: ${e.recalculatedHash}`);
    doc.text(`Integrity: ${e.valid ? 'VALID ✓' : 'TAMPERED ✗'}`);
    doc.moveDown();

  });

  doc.end();

  return filePath;

};