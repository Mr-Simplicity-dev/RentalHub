/**
 * Tenancy agreement document rendering (PDF).
 *
 * Renders a professional Residential Tenancy Agreement from the structured
 * agreement version. The document is generated on demand from server-side
 * data; the client never supplies the content.
 *
 * The layout intentionally does NOT fabricate any legal seal, court stamp or
 * government authentication.
 */

const PDFDocument = require('pdfkit');
const db = require('../config/middleware/database');

const formatCurrency = (value) =>
  `NGN ${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-NG');
};

const loadParties = async (agreement) => {
  const result = await db.query(
    `SELECT id, full_name, email, user_type FROM users WHERE id = ANY($1::int[])`,
    [[agreement.landlord_id, agreement.tenant_id, agreement.agent_id].filter(Boolean)]
  );
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  return {
    landlord: byId.get(agreement.landlord_id) || null,
    tenant: byId.get(agreement.tenant_id) || null,
    agent: agreement.agent_id ? byId.get(agreement.agent_id) || null : null,
  };
};

const renderAgreementDocument = (doc, { agreement, parties, terms, jurisdiction, signatures }) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // Header
  doc.fontSize(10).fillColor('#64748b').text('RENTALHUB NG', { align: 'center', characterSpacing: 2 });
  doc.moveDown(0.3);
  doc.fontSize(20).fillColor('#0f172a').text('RESIDENTIAL TENANCY AGREEMENT', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(1);

  // Summary
  doc.fontSize(11).fillColor('#0f172a');
  const rows = [
    ['Agreement ID', `#${agreement.id}`],
    ['Version', String(agreement.current_version)],
    ['Property', terms.propertyAddress || agreement.property_title || '—'],
    ['Jurisdiction', [jurisdiction?.state, jurisdiction?.lga].filter(Boolean).join(', ') || 'Nigeria'],
    ['Landlord', parties.landlord?.full_name || `User #${agreement.landlord_id}`],
    ['Tenant', parties.tenant?.full_name || `User #${agreement.tenant_id}`],
    ['Tenancy period', `${formatDate(terms.commencementDate)} – ${formatDate(terms.expiryDate)}`],
    ['Rent', `${formatCurrency(terms.rentAmount)} (${terms.paymentFrequency || 'yearly'})`],
    ['Deposit', formatCurrency(terms.deposit)],
    ['Notice period', `${terms.noticeConfiguration?.noticePeriodDays ?? '—'} days`],
  ];
  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fillColor('#475569').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#0f172a').text(String(value));
  });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('1. Terms');
  doc.font('Helvetica').fontSize(11).fillColor('#334155');
  doc.text(`The landlord lets and the tenant takes the premises described above for a ${String(terms.tenancyType || 'residential')} tenancy, at the rent and for the period stated, subject to the terms below.`);
  if (terms.tenancyLawReference) {
    doc.moveDown(0.4);
    doc.text(`This agreement is subject to: ${terms.tenancyLawReference}.`);
  }

  if (Array.isArray(terms.statutoryClauses) && terms.statutoryClauses.length) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('2. Statutory and standard clauses');
    doc.font('Helvetica').fontSize(11).fillColor('#334155');
    terms.statutoryClauses.forEach((clause, index) => doc.text(`${index + 1}. ${clause}`));
  }

  if (Array.isArray(terms.specialTerms) && terms.specialTerms.length) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('3. Special terms');
    doc.font('Helvetica').fontSize(11).fillColor('#334155');
    terms.specialTerms.forEach((clause, index) => doc.text(`${index + 1}. ${clause}`));
  }

  // Execution
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text('Execution');
  doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(
    'This agreement is executed electronically. Execution is subject to applicable Nigerian law and any required formalities.'
  );
  doc.moveDown(0.8);

  const signers = ['landlord', 'tenant'];
  signers.forEach((role) => {
    const signature = signatures.find((entry) => entry.signer_role === role);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(role.toUpperCase());
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    if (signature) {
      doc.text(`Signed by: ${signature.signatory_name}`);
      doc.text(`Signed at: ${formatDateTime(signature.signed_at)}`);
      doc.text(`Signature event reference: ${signature.signature_event_id}`);
    } else {
      doc.fillColor('#b45309').text('Not signed');
    }
    doc.moveDown(0.6);
  });

  if (agreement.document_hash || (signatures[0] && signatures[0].document_hash)) {
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(
      `Document integrity reference: ${agreement.document_hash || signatures[0].document_hash}`,
      { width }
    );
  }
};

const streamAgreementDocument = async (res, agreement) => {
  const versionResult = await db.query(
    'SELECT terms, jurisdiction FROM tenancy_agreement_versions WHERE agreement_id = $1 AND version = $2 LIMIT 1',
    [agreement.id, agreement.current_version]
  );
  const version = versionResult.rows[0] || { terms: {}, jurisdiction: {} };
  const signaturesResult = await db.query(
    'SELECT signer_role, signatory_name, signature_event_id, signed_at, document_hash FROM tenancy_agreement_signatures WHERE agreement_id = $1 ORDER BY signed_at ASC',
    [agreement.id]
  );
  const parties = await loadParties(agreement);

  const doc = new PDFDocument({ margin: 56, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="tenancy-agreement-${agreement.id}-v${agreement.current_version}.pdf"`);
  doc.pipe(res);

  renderAgreementDocument(doc, {
    agreement,
    parties,
    terms: version.terms || {},
    jurisdiction: version.jurisdiction || {},
    signatures: signaturesResult.rows,
  });

  doc.end();
};

exports.streamAgreementDocument = streamAgreementDocument;
