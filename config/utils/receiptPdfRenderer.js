const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { RECEIPT_NOTICE } = require('./receiptFormat');
const { registerMoneyFont } = require('./pdfMoneyFont');

/**
 * Render ANY canonical Amana RentalHub financial document (payment, rent,
 * service, wallet transaction record, rent savings contribution, payout, or
 * refund confirmation) to a PDFKit stream using the exact same canonical
 * data object displayed on Web, Mobile, and Email.
 */
const renderReceiptPdf = (receipt, res, { filename } = {}) => {
  const safeFilename =
    filename ||
    `${String(receipt.receiptNumber || 'receipt')
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .toLowerCase()}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  doc.pipe(res);

  const logoPath = path.join(__dirname, '..', '..', 'assets', 'rentalhub-mark.png');
  const amanaFontPath = path.join(__dirname, '..', '..', 'assets', 'AmanaScript.ttf');
  let amanaFont = 'Helvetica-Bold';
  try {
    if (fs.existsSync(amanaFontPath)) {
      doc.registerFont('AmanaScript', amanaFontPath);
      amanaFont = 'AmanaScript';
    }
  } catch {
    // Fall back gracefully to Helvetica-Bold if font file is unavailable
  }

  const moneyFont = registerMoneyFont(doc);

  // Header: logo + Amana wordmark + company name + contact
  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 46, { width: 56, height: 56 });
    }
  } catch {
    // Logo asset optional in test environments
  }
  doc.font(amanaFont).fontSize(21).fillColor('#6e1b2b').text('Amana', 122, 50, { width: 200 });
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a').text('Amana RentalHub NG', 122, 74, { width: 230 });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#64748b')
    .text('rentalhub.com.ng   •   support@rentalhub.com.ng', 122, 98, { width: 260 });
  doc.moveTo(50, 126).lineTo(545, 126).strokeColor('#e2e8f0').lineWidth(1).stroke();

  // Document classification title + prominent ARH number
  doc.moveDown(1.1);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#0f172a')
    .text(receipt.documentType || 'OFFICIAL PAYMENT RECEIPT', { align: 'center' });
  if (receipt.subtitle) {
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(receipt.subtitle, { align: 'center' });
  }
  doc.moveDown(0.25);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#0284c7')
    .text(receipt.receiptNumber || '', { align: 'center' });
  doc.moveDown(1.2);

  const drawRow = (label, value, { money = false } = {}) => {
    if (value === null || value === undefined || value === '') return;
    if (doc.y > 720) {
      doc.addPage();
    }
    const yStart = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(String(label).toUpperCase(), 50, yStart, { width: 130 });
    doc
      .font(money ? moneyFont : 'Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#0f172a')
      .text(String(value), 190, yStart - 1, { width: 355 });
    doc.moveDown(0.4);
  };

  // Primary metadata rows — driven by canonical receipt fields
  if (Array.isArray(receipt.detailRows) && receipt.detailRows.length) {
    receipt.detailRows.forEach((row) => drawRow(row.label, row.value, { money: Boolean(row.money) }));
  } else {
    const method =
      receipt.methodLine ||
      (receipt.channel ? `${receipt.method} — ${receipt.channel}` : receipt.method);
    const defaultRows = [
      [receipt.partyLabel || 'Paid by', receipt.fullName || receipt.email],
      ['Email', receipt.email || null],
      ['Recipient', receipt.recipientName || null],
      ['Date', receipt.date],
      ['Reference', receipt.reference || '—'],
      ['Status', receipt.status],
      ['Payment method', method || null],
      ['Currency', receipt.currency || 'NGN'],
    ];
    defaultRows.forEach(([label, value]) => drawRow(label, value));
  }

  // Detailed rent context (payments with rent_payment)
  if (receipt.rent) {
    const rentRows = [
      ['Payment For', receipt.rent.paymentFor],
      ['Property', receipt.rent.propertyTitle],
      ['Property Address', receipt.rent.propertyAddress],
      ['Tenant', receipt.rent.tenantName],
      ['Landlord', receipt.rent.landlordName],
      [
        'Rental Period',
        receipt.rent.rentalPeriod
          ? receipt.rent.rentalPeriod.end
            ? `${receipt.rent.rentalPeriod.start} - ${receipt.rent.rentalPeriod.end}`
            : receipt.rent.rentalPeriod.start
          : null,
      ],
    ].filter(([, value]) => value);
    if (rentRows.length) {
      doc.moveDown(0.5);
      rentRows.forEach(([label, value]) => drawRow(label, value));
    }
  }

  // Service / booking details (transportation, fumigation, inspection, protection, evidence)
  if (Array.isArray(receipt.contextRows) && receipt.contextRows.length) {
    doc.moveDown(0.5);
    receipt.contextRows.forEach((row) => drawRow(row.label, row.value, { money: Boolean(row.money) }));
  }

  // Payout bank details (ALWAYS masked)
  if (receipt.payout) {
    doc.moveDown(0.5);
    drawRow('Withdrawal ID', `#${receipt.payout.withdrawalId}`);
    drawRow('Transfer Reference', receipt.payout.transferReference || receipt.reference);
    drawRow('Bank Name', receipt.payout.bankName);
    drawRow('Account Number', receipt.payout.maskedAccountNumber);
    drawRow('Account Name', receipt.payout.accountName);
    if (receipt.payout.payoutDate) drawRow('Payout Date', receipt.payout.payoutDate);
  }

  // Refund link details
  if (receipt.refund) {
    doc.moveDown(0.5);
    drawRow('Original Receipt', receipt.refund.originalReceiptNumber);
    drawRow('Original Reference', receipt.refund.originalReference);
    drawRow('Refund Reference', receipt.refund.refundReference);
    drawRow('Refund Type', receipt.refund.refundTypeLabel);
    drawRow('Original Amount', receipt.refund.originalAmountFormatted, { money: true });
    drawRow('Amount Refunded', receipt.refund.refundedAmountFormatted, { money: true });
    if (receipt.refund.remainingAmount > 0) {
      drawRow('Remaining Amount', receipt.refund.remainingAmountFormatted, { money: true });
    }
    if (receipt.refund.propertyTitle) drawRow('Property', receipt.refund.propertyTitle);
    if (receipt.refund.reason) drawRow('Reason', receipt.refund.reason);
  }

  // Diaspora FX quote
  if (Number(receipt.quoteUsd) > 0) {
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#166534');
    doc.text(
      `Diaspora registration quote: $${Number(receipt.quoteUsd).toFixed(2)} USD${
        receipt.quoteCurrency ? ` (${receipt.quoteCurrency})` : ''
      }`
    );
    if (receipt.fxRate) {
      doc.font(moneyFont).text(`FX rate applied: ₦${Number(receipt.fxRate).toLocaleString()} / USD`);
    }
    if (receipt.fxMarkupPct) {
      doc.font('Helvetica').text(`FX markup: ${Number(receipt.fxMarkupPct).toFixed(2)}%`);
    }
    doc.font(moneyFont).text(`Amount charged: ${receipt.total} NGN`);
    doc.font('Helvetica');
  }

  // Notice / alert box (e.g., failed/reversed payout funds returned notice)
  if (receipt.noticeBanner) {
    doc.moveDown(0.6);
    const boxY = doc.y;
    doc.rect(50, boxY, 495, 36).fillAndStroke('#fef2f2', '#fecaca');
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#991b1b')
      .text(receipt.noticeBanner, 60, boxY + 10, { width: 475 });
    doc.y = boxY + 44;
  }

  // Line items table
  if (Array.isArray(receipt.items) && receipt.items.length) {
    doc.moveDown(0.8);
    if (doc.y > 650) doc.addPage();
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text('DESCRIPTION', 50, tableTop);
    doc.text('AMOUNT', 400, tableTop, { width: 145, align: 'right' });
    doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).strokeColor('#e2e8f0').stroke();

    let y = tableTop + 24;
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    receipt.items.forEach((item) => {
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      doc.font('Helvetica').text(item.label, 50, y, { width: 330 });
      doc.font(moneyFont).text(item.amount, 400, y, { width: 145, align: 'right' });
      y += 22;
    });

    doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#e2e8f0').stroke();
    doc.y = y + 14;
  }

  // Total row — NEVER says "TOTAL PAID" for pending/failed/refund/wallet-record documents
  const totalLabel = receipt.totalLabel || (receipt.isPaid === false ? 'AMOUNT' : 'TOTAL PAID');
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(totalLabel, 50, doc.y);
  doc
    .font(moneyFont)
    .fontSize(14)
    .fillColor('#0284c7')
    .text(receipt.total || '₦0', 400, doc.y - 16, { width: 145, align: 'right' });

  // Landlord / platform fee footnote
  if (Number(receipt.rent?.platformFee) > 0) {
    doc.moveDown(1.1);
    doc.font(moneyFont).fontSize(9).fillColor('#475569');
    const feeText =
      receipt.viewerPerspective === 'landlord'
        ? `Platform/Service Fee deducted: ₦${Number(receipt.rent.platformFee).toLocaleString()}  •  Net Rent Credited to Landlord Wallet: ₦${Math.max(0, Number(receipt.totalAmount || 0) - Number(receipt.rent.platformFee)).toLocaleString()}`
        : `Platform/Service Fee: ₦${Number(receipt.rent.platformFee).toLocaleString()} (deducted from the landlord's payout - not charged to you)`;
    doc.text(feeText, { width: 495 });
  }

  // Footer
  doc.moveDown(2.5);
  doc.font('Helvetica').fontSize(9).fillColor('#94a3b8').text('Thank you for using Amana RentalHub NG.', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor('#cbd5e1').text(RECEIPT_NOTICE, { align: 'center' });

  doc.end();
};

module.exports = { renderReceiptPdf };
