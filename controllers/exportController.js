const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../config/middleware/database');

exports.exportDisputeBundle = async (req, res) => {
  try {
    const { disputeId } = req.params;

    // Fetch dispute
    const disputeResult = await db.query(
      `SELECT d.*, 
              u1.full_name AS opened_by_name,
              u2.full_name AS against_name,
              p.title AS property_title
       FROM disputes d
       JOIN users u1 ON d.opened_by = u1.id
       JOIN users u2 ON d.against_user = u2.id
       JOIN properties p ON d.property_id = p.id
       WHERE d.id = $1`,
      [disputeId]
    );

    if (disputeResult.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    const dispute = disputeResult.rows[0];

    const messages = await db.query(
      `SELECT m.*, u.full_name
       FROM dispute_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE dispute_id = $1
       ORDER BY m.created_at ASC`,
      [disputeId]
    );

    const evidence = await db.query(
      `SELECT * FROM dispute_evidence
       WHERE dispute_id = $1`,
      [disputeId]
    );

    const logs = await db.query(
      `SELECT * FROM audit_logs
       WHERE target_type = 'dispute'
       AND target_id = $1
       ORDER BY created_at ASC`,
      [disputeId]
    );

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dispute-${disputeId}.pdf`
    );

    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Dispute Report', { underline: true });
    doc.moveDown();

    // Dispute Info
    doc.fontSize(12);
    doc.text(`Dispute ID: ${dispute.id}`);
    doc.text(`Property: ${dispute.property_title}`);
    doc.text(`Opened By: ${dispute.opened_by_name}`);
    doc.text(`Against: ${dispute.against_name}`);
    doc.text(`Status: ${dispute.status}`);
    doc.text(`Escalated: ${dispute.escalated ? 'Yes' : 'No'}`);
    doc.moveDown();

    doc.text('Description:', { underline: true });
    doc.text(dispute.description);
    doc.moveDown();

    // Messages
    doc.addPage();
    doc.fontSize(16).text('Message Thread', { underline: true });
    doc.moveDown();

    messages.rows.forEach(msg => {
      doc.fontSize(10);
      doc.text(`[${msg.created_at}] ${msg.full_name}:`);
      doc.text(msg.message);
      doc.moveDown();
    });

    // Evidence
    doc.addPage();
    doc.fontSize(16).text('Evidence Files', { underline: true });
    doc.moveDown();

    evidence.rows.forEach(ev => {
      doc.fontSize(10);
      doc.text(`File: ${ev.file_name}`);
      doc.text(`Hash: ${ev.file_hash}`);
      doc.text(`Uploaded: ${ev.uploaded_at}`);
      doc.moveDown();
    });

    // Audit Trail
    doc.addPage();
    doc.fontSize(16).text('Audit Trail', { underline: true });
    doc.moveDown();

    logs.rows.forEach(log => {
      doc.fontSize(9);
      doc.text(`[${log.created_at}] ${log.action}`);
    });

    doc.end();

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export dispute'
    });
  }
};