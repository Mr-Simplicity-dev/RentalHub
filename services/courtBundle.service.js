const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const db = require('../config/middleware/database');

/**
 * Generate a court bundle PDF for a dispute and return its file path.
 * @param {string|number} disputeId
 * @returns {Promise<string>} Absolute path to the generated PDF
 */
async function generateCourtBundle(disputeId) {
  const disputeRes = await db.query(
    `SELECT d.id, d.status, d.created_at, d.description,
            p.title AS property_title, p.address AS property_address
     FROM disputes d
     LEFT JOIN properties p ON p.id = d.property_id
     WHERE d.id = $1`,
    [disputeId]
  );

  if (disputeRes.rows.length === 0) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }

  const dispute = disputeRes.rows[0];

  const evidenceRes = await db.query(
    `SELECT file_name, file_hash, uploaded_at
     FROM dispute_evidence
     WHERE dispute_id = $1
     ORDER BY uploaded_at ASC`,
    [disputeId]
  );

  const outputDir = path.join(__dirname, '..', 'uploads', 'court-bundles');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `court-bundle-dispute-${disputeId}-${Date.now()}.pdf`;
  const filePath = path.join(outputDir, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Court Bundle', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text(`Dispute #${dispute.id}`);
    doc.fontSize(11).text(`Status: ${dispute.status}`);
    doc.text(`Filed: ${new Date(dispute.created_at).toLocaleDateString()}`);
    if (dispute.property_title) {
      doc.text(`Property: ${dispute.property_title}`);
    }
    if (dispute.property_address) {
      doc.text(`Address: ${dispute.property_address}`);
    }
    if (dispute.description) {
      doc.moveDown().text('Description:').text(dispute.description);
    }

    if (evidenceRes.rows.length > 0) {
      doc.moveDown().fontSize(14).text('Evidence Index');
      evidenceRes.rows.forEach((ev, i) => {
        doc
          .fontSize(11)
          .text(
            `${i + 1}. ${ev.file_name || 'Unnamed'} — ${new Date(ev.uploaded_at).toLocaleDateString()} — Hash: ${ev.file_hash || 'N/A'}`
          );
      });
    } else {
      doc.moveDown().text('No evidence files attached.');
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return filePath;
}

module.exports = { generateCourtBundle };
