/**
 * Tenancy agreement lifecycle.
 *
 * A property application is NOT itself a tenancy. Approving an application
 * creates a DRAFT agreement which both parties must review and electronically
 * execute. The server is authoritative for every status transition; the client
 * never decides that an agreement is executed.
 *
 * Phase 1 scope: data model, status machine, lifecycle API, audit trail and
 * document hashing. PDF rendering and jurisdiction-specific clause templates
 * are later phases.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { logAction } = require('../config/utils/auditLogger');
const { createNotification } = require('../config/utils/notificationService');

const TENANCY_AGREEMENT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_LANDLORD_REVIEW: 'PENDING_LANDLORD_REVIEW',
  PENDING_LANDLORD_SIGNATURE: 'PENDING_LANDLORD_SIGNATURE',
  PENDING_TENANT_REVIEW: 'PENDING_TENANT_REVIEW',
  PENDING_TENANT_SIGNATURE: 'PENDING_TENANT_SIGNATURE',
  PARTIALLY_EXECUTED: 'PARTIALLY_EXECUTED',
  FULLY_EXECUTED: 'FULLY_EXECUTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  AMENDED: 'AMENDED',
  SUPERSEDED: 'SUPERSEDED',
};

const TENANCY_AGREEMENT_EVENTS = {
  AGREEMENT_CREATED: 'AGREEMENT_CREATED',
  AGREEMENT_SENT_TO_LANDLORD: 'AGREEMENT_SENT_TO_LANDLORD',
  LANDLORD_VIEWED: 'LANDLORD_VIEWED',
  LANDLORD_ACCEPTED_TERMS: 'LANDLORD_ACCEPTED_TERMS',
  LANDLORD_SIGNED: 'LANDLORD_SIGNED',
  AGREEMENT_SENT_TO_TENANT: 'AGREEMENT_SENT_TO_TENANT',
  TENANT_VIEWED: 'TENANT_VIEWED',
  TENANT_ACCEPTED_TERMS: 'TENANT_ACCEPTED_TERMS',
  TENANT_SIGNED: 'TENANT_SIGNED',
  AGREEMENT_FULLY_EXECUTED: 'AGREEMENT_FULLY_EXECUTED',
  AGREEMENT_DECLINED: 'AGREEMENT_DECLINED',
  AMENDMENT_REQUESTED: 'AMENDMENT_REQUESTED',
  NEW_VERSION_CREATED: 'NEW_VERSION_CREATED',
  AGREEMENT_EXPIRED: 'AGREEMENT_EXPIRED',
  AGREEMENT_CANCELLED: 'AGREEMENT_CANCELLED',
};

// Statuses from which no further signature/amendment action is possible.
const TERMINAL_STATUSES = new Set([
  TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED,
  TENANCY_AGREEMENT_STATUS.DECLINED,
  TENANCY_AGREEMENT_STATUS.CANCELLED,
  TENANCY_AGREEMENT_STATUS.EXPIRED,
  TENANCY_AGREEMENT_STATUS.SUPERSEDED,
]);

const canViewAllAgreements = (user) => user && user.user_type === 'super_admin';

let schemaEnsured = false;
const ensureTenancyAgreementSchema = async () => {
  if (schemaEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenancy_agreements (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      current_version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      executed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tenancy_agreement_versions (
      id SERIAL PRIMARY KEY,
      agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
      terms JSONB NOT NULL DEFAULT '{}'::jsonb,
      jurisdiction JSONB NOT NULL DEFAULT '{}'::jsonb,
      document_hash VARCHAR(128),
      document_path VARCHAR(500),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      locked_at TIMESTAMP,
      UNIQUE (agreement_id, version)
    );
    CREATE TABLE IF NOT EXISTS tenancy_agreement_signatures (
      id SERIAL PRIMARY KEY,
      agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      signer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      signer_role VARCHAR(20) NOT NULL,
      signatory_name VARCHAR(200) NOT NULL,
      signature_event_id VARCHAR(64) NOT NULL,
      authentication_method VARCHAR(40),
      document_hash VARCHAR(128),
      ip_address VARCHAR(64),
      user_agent TEXT,
      consent_given BOOLEAN NOT NULL DEFAULT FALSE,
      signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tenancy_agreement_events (
      id SERIAL PRIMARY KEY,
      agreement_id INTEGER NOT NULL REFERENCES tenancy_agreements(id) ON DELETE CASCADE,
      version INTEGER,
      event_type VARCHAR(60) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20),
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch((error) => {
    // Non-fatal if the migration has already created the tables.
    logger.warn('Tenancy agreement schema ensure failed', { error: error.message });
  });
  schemaEnsured = true;
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const toDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const deriveExpiryDate = (commencementDate, paymentFrequency) => {
  if (!commencementDate) return null;
  const start = new Date(commencementDate);
  if (Number.isNaN(start.getTime())) return null;
  const months = String(paymentFrequency || '').toLowerCase() === 'monthly' ? 1 : 12;
  return toDateOnly(addMonths(start, months));
};

const computeDocumentHash = ({ agreementId, version, terms, jurisdiction }) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify({ agreementId, version, terms, jurisdiction }))
    .digest('hex');

const buildAgreementTerms = (application, property) => {
  const commencementDate = toDateOnly(application.move_in_date) || toDateOnly(new Date());
  const rentAmount = Number(application.agreed_rent || application.rent_amount || 0);
  return {
    propertyId: property.id,
    propertyAddress: property.full_address || property.title || null,
    state: property.state || null,
    lga: property.lga_name || property.city || null,
    propertyType: property.property_type || null,
    bedrooms: property.bedrooms || null,
    bathrooms: property.bathrooms || null,
    tenancyType: 'residential',
    commencementDate,
    expiryDate: deriveExpiryDate(commencementDate, property.payment_frequency),
    rentAmount,
    paymentFrequency: property.payment_frequency || 'yearly',
    deposit: Number(property.caution_deposit || 0),
    disclosedFees: [],
    serviceCharge: 0,
    utilities: [],
    occupants: 1,
    permittedUse: 'residential',
    specialTerms: [],
    noticeConfiguration: { noticePeriodDays: 30 },
    attachments: [],
  };
};

const recordEvent = async ({ agreementId, version = null, eventType, actorId = null, actorRole = null, detail = {}, ip = null, client = db }) => {
  await client.query(
    `INSERT INTO tenancy_agreement_events
       (agreement_id, version, event_type, actor_id, actor_role, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [agreementId, version, eventType, actorId, actorRole, JSON.stringify(detail || {}), ip]
  );
};

const notify = async (userId, type, title, message, link) => {
  try {
    await createNotification(userId, type, title, message, link);
  } catch (error) {
    logger.warn('Tenancy agreement notification failed', { error: error.message, userId });
  }
};

const createDraftAgreementFromApplication = async ({ applicationId, actorUserId = null, ip = null }) => {
  await ensureTenancyAgreementSchema();

  const applicationResult = await db.query(
    `SELECT a.*, p.landlord_id, p.title AS property_title, p.full_address,
            p.state, p.city, p.lga_name, p.property_type, p.bedrooms, p.bathrooms,
            p.rent_amount, p.payment_frequency, p.caution_deposit
       FROM applications a
       JOIN properties p ON p.id = a.property_id
      WHERE a.id = $1`,
    [applicationId]
  );

  if (!applicationResult.rows.length) {
    throw Object.assign(new Error('Application not found'), { status: 404 });
  }
  const application = applicationResult.rows[0];

  const existing = await db.query(
    'SELECT id, status FROM tenancy_agreements WHERE application_id = $1 LIMIT 1',
    [applicationId]
  );
  if (existing.rows.length) {
    return { agreementId: existing.rows[0].id, created: false };
  }

  const property = application;
  const terms = buildAgreementTerms(application, property);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const agreementResult = await client.query(
      `INSERT INTO tenancy_agreements
         (application_id, property_id, landlord_id, tenant_id, current_version, status, created_by)
       VALUES ($1, $2, $3, $4, 1, $5, $6)
       RETURNING id`,
      [
        applicationId,
        application.property_id,
        application.landlord_id,
        application.tenant_id,
        TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW,
        actorUserId,
      ]
    );
    const agreementId = agreementResult.rows[0].id;
    const documentHash = computeDocumentHash({ agreementId, version: 1, terms, jurisdiction: {} });

    await client.query(
      `INSERT INTO tenancy_agreement_versions
         (agreement_id, version, status, terms, jurisdiction, document_hash, created_by)
       VALUES ($1, 1, $2, $3::jsonb, '{}'::jsonb, $4, $5)`,
      [
        agreementId,
        1,
        TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW,
        JSON.stringify(terms),
        documentHash,
        actorUserId,
      ]
    );

    await recordEvent({
      agreementId,
      version: 1,
      eventType: TENANCY_AGREEMENT_EVENTS.AGREEMENT_CREATED,
      actorId: actorUserId,
      actorRole: 'landlord',
      detail: { applicationId },
      ip,
      client,
    });
    await recordEvent({
      agreementId,
      version: 1,
      eventType: TENANCY_AGREEMENT_EVENTS.AGREEMENT_SENT_TO_LANDLORD,
      actorId: actorUserId,
      actorRole: 'landlord',
      ip,
      client,
    });

    await client.query('COMMIT');
    return { agreementId, created: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const loadAgreement = async (agreementId) => {
  const result = await db.query(
    `SELECT a.*,
            p.title AS property_title, p.full_address, p.state, p.city, p.lga_name
       FROM tenancy_agreements a
       JOIN properties p ON p.id = a.property_id
      WHERE a.id = $1`,
    [agreementId]
  );
  return result.rows[0] || null;
};

const assertAccess = (agreement, user) => {
  if (!agreement) throw Object.assign(new Error('Agreement not found'), { status: 404 });
  if (canViewAllAgreements(user)) return;
  const userId = Number(user.id);
  if (agreement.landlord_id !== userId && agreement.tenant_id !== userId && agreement.agent_id !== userId) {
    throw Object.assign(new Error('You do not have access to this agreement'), { status: 403 });
  }
};

const getAgreementVersion = async (agreementId, version) => {
  const result = await db.query(
    'SELECT * FROM tenancy_agreement_versions WHERE agreement_id = $1 AND version = $2 LIMIT 1',
    [agreementId, version]
  );
  return result.rows[0] || null;
};

const getAgreementDetail = async (agreementId, user, ip = null) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);

  const version = await getAgreementVersion(agreementId, agreement.current_version);
  const signatures = await db.query(
    'SELECT id, version, signer_id, signer_role, signatory_name, signature_event_id, signed_at FROM tenancy_agreement_signatures WHERE agreement_id = $1 ORDER BY signed_at ASC',
    [agreementId]
  );

  if (user.user_type === 'landlord') {
    await recordEvent({ agreementId, version: agreement.current_version, eventType: TENANCY_AGREEMENT_EVENTS.LANDLORD_VIEWED, actorId: user.id, actorRole: 'landlord', ip });
  } else if (user.user_type === 'tenant') {
    await recordEvent({ agreementId, version: agreement.current_version, eventType: TENANCY_AGREEMENT_EVENTS.TENANT_VIEWED, actorId: user.id, actorRole: 'tenant', ip });
  }

  return {
    ...agreement,
    terms: version ? version.terms : null,
    jurisdiction: version ? version.jurisdiction : null,
    document_hash: version ? version.document_hash : null,
    signatures: signatures.rows,
  };
};

const listAgreementsForUser = async (user, filters = {}) => {
  await ensureTenancyAgreementSchema();
  const params = [];
  const clauses = [];

  if (!canViewAllAgreements(user)) {
    params.push(user.id);
    clauses.push(`(a.landlord_id = $${params.length} OR a.tenant_id = $${params.length} OR a.agent_id = $${params.length})`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`a.status = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT a.id, a.application_id, a.property_id, a.landlord_id, a.tenant_id,
            a.current_version, a.status, a.created_at, a.updated_at, a.executed_at,
            p.title AS property_title, p.full_address
       FROM tenancy_agreements a
       JOIN properties p ON p.id = a.property_id
       ${where}
      ORDER BY a.updated_at DESC
      LIMIT 100`,
    params
  );
  return result.rows;
};

const reviewAgreement = async ({ agreementId, user, role, accepted = true, ip = null }) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);

  if (role === 'landlord' && agreement.landlord_id !== Number(user.id)) {
    throw Object.assign(new Error('Only the landlord may review as landlord'), { status: 403 });
  }
  if (role === 'tenant' && agreement.tenant_id !== Number(user.id)) {
    throw Object.assign(new Error('Only the tenant may review as tenant'), { status: 403 });
  }

  const expected = role === 'landlord'
    ? TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW
    : TENANCY_AGREEMENT_STATUS.PENDING_TENANT_REVIEW;
  if (agreement.status !== expected) {
    throw Object.assign(new Error(`Agreement is not awaiting ${role} review`), { status: 409 });
  }

  const nextStatus = role === 'landlord'
    ? TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_SIGNATURE
    : TENANCY_AGREEMENT_STATUS.PENDING_TENANT_SIGNATURE;

  await db.query('UPDATE tenancy_agreements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [nextStatus, agreementId]);
  await recordEvent({
    agreementId,
    version: agreement.current_version,
    eventType: role === 'landlord' ? TENANCY_AGREEMENT_EVENTS.LANDLORD_ACCEPTED_TERMS : TENANCY_AGREEMENT_EVENTS.TENANT_ACCEPTED_TERMS,
    actorId: user.id,
    actorRole: role,
    ip,
  });
  await logAction({ actorId: user.id, action: `Tenancy agreement ${role} review accepted`, targetType: 'tenancy_agreement', targetId: agreementId, ip });

  return { status: nextStatus };
};

const signAgreement = async ({ agreementId, user, role, consent, signatoryName, authenticationMethod = 'authenticated_session', ip = null, userAgent = null }) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);

  if (!consent) {
    throw Object.assign(new Error('You must confirm you have reviewed the agreement before signing'), { status: 400 });
  }
  if (role === 'landlord' && agreement.landlord_id !== Number(user.id)) {
    throw Object.assign(new Error('Only the landlord may sign as landlord'), { status: 403 });
  }
  if (role === 'tenant' && agreement.tenant_id !== Number(user.id)) {
    throw Object.assign(new Error('Only the tenant may sign as tenant'), { status: 403 });
  }
  if (TERMINAL_STATUSES.has(agreement.status)) {
    throw Object.assign(new Error(`Agreement is ${agreement.status} and cannot be signed`), { status: 409 });
  }

  const expected = role === 'landlord'
    ? TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_SIGNATURE
    : TENANCY_AGREEMENT_STATUS.PENDING_TENANT_SIGNATURE;
  if (agreement.status !== expected) {
    throw Object.assign(new Error(`Agreement is not awaiting ${role} signature`), { status: 409 });
  }

  const version = await getAgreementVersion(agreementId, agreement.current_version);
  if (!version) throw Object.assign(new Error('Agreement version missing'), { status: 500 });

  // Idempotency: a repeated signature for the same version/role returns the
  // existing event instead of creating a second one.
  const existing = await db.query(
    'SELECT id, signature_event_id, signed_at FROM tenancy_agreement_signatures WHERE agreement_id = $1 AND version = $2 AND signer_role = $3 AND signer_id = $4 LIMIT 1',
    [agreementId, agreement.current_version, role, user.id]
  );
  if (existing.rows.length) {
    return { status: agreement.status, signatureEventId: existing.rows[0].signature_event_id, deduplicated: true };
  }

  const signatureEventId = uuidv4();
  const signerName = String(signatoryName || user.full_name || user.email || '').trim();

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenancy_agreement_signatures
         (agreement_id, version, signer_id, signer_role, signatory_name, signature_event_id,
          authentication_method, document_hash, ip_address, user_agent, consent_given)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)`,
      [
        agreementId,
        agreement.current_version,
        user.id,
        role,
        signerName,
        signatureEventId,
        authenticationMethod,
        version.document_hash,
        ip,
        userAgent,
      ]
    );

    // Determine the next status: landlord first, then tenant, then executed.
    let nextStatus;
    if (role === 'landlord') {
      nextStatus = TENANCY_AGREEMENT_STATUS.PENDING_TENANT_REVIEW;
    } else {
      const landlordSigned = await client.query(
        "SELECT 1 FROM tenancy_agreement_signatures WHERE agreement_id = $1 AND version = $2 AND signer_role = 'landlord' LIMIT 1",
        [agreementId, agreement.current_version]
      );
      nextStatus = landlordSigned.rows.length
        ? TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED
        : TENANCY_AGREEMENT_STATUS.PARTIALLY_EXECUTED;
    }

    await client.query(
      `UPDATE tenancy_agreements
          SET status = $1,
              executed_at = CASE WHEN $1 = 'FULLY_EXECUTED' THEN CURRENT_TIMESTAMP ELSE executed_at END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [nextStatus, agreementId]
    );
    await client.query(
      'UPDATE tenancy_agreement_versions SET status = $1, locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP) WHERE agreement_id = $2 AND version = $3',
      [nextStatus, agreementId, agreement.current_version]
    );

    await recordEvent({
      agreementId,
      version: agreement.current_version,
      eventType: role === 'landlord' ? TENANCY_AGREEMENT_EVENTS.LANDLORD_SIGNED : TENANCY_AGREEMENT_EVENTS.TENANT_SIGNED,
      actorId: user.id,
      actorRole: role,
      detail: { signatureEventId },
      ip,
      client,
    });
    if (nextStatus === TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED) {
      await recordEvent({
        agreementId,
        version: agreement.current_version,
        eventType: TENANCY_AGREEMENT_EVENTS.AGREEMENT_FULLY_EXECUTED,
        actorId: user.id,
        actorRole: role,
        detail: { signatureEventId },
        ip,
        client,
      });
    } else if (role === 'landlord') {
      await recordEvent({
        agreementId,
        version: agreement.current_version,
        eventType: TENANCY_AGREEMENT_EVENTS.AGREEMENT_SENT_TO_TENANT,
        actorId: user.id,
        actorRole: role,
        ip,
        client,
      });
    }

    await client.query('COMMIT');

    const counterpartyId = role === 'landlord' ? agreement.tenant_id : agreement.landlord_id;
    await notify(
      counterpartyId,
      'tenancy_agreement',
      nextStatus === TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED ? 'Tenancy agreement fully executed' : 'Tenancy agreement awaiting your signature',
      nextStatus === TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED
        ? 'Both parties have signed the tenancy agreement.'
        : `The ${role} has signed the tenancy agreement. Please review and sign.`,
      `/tenancy-agreements/${agreementId}`
    );
    await logAction({ actorId: user.id, action: `Tenancy agreement ${role} signed`, targetType: 'tenancy_agreement', targetId: agreementId, ip });

    return { status: nextStatus, signatureEventId, deduplicated: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const declineAgreement = async ({ agreementId, user, role, reason = null, ip = null }) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);
  if (TERMINAL_STATUSES.has(agreement.status)) {
    throw Object.assign(new Error(`Agreement is ${agreement.status}`), { status: 409 });
  }

  await db.query('UPDATE tenancy_agreements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [TENANCY_AGREEMENT_STATUS.DECLINED, agreementId]);
  await recordEvent({
    agreementId,
    version: agreement.current_version,
    eventType: TENANCY_AGREEMENT_EVENTS.AGREEMENT_DECLINED,
    actorId: user.id,
    actorRole: role || (agreement.landlord_id === Number(user.id) ? 'landlord' : 'tenant'),
    detail: { reason },
    ip,
  });
  await logAction({ actorId: user.id, action: 'Tenancy agreement declined', targetType: 'tenancy_agreement', targetId: agreementId, ip });

  const counterpartyId = agreement.landlord_id === Number(user.id) ? agreement.tenant_id : agreement.landlord_id;
  await notify(counterpartyId, 'tenancy_agreement', 'Tenancy agreement declined', reason || 'The agreement was declined.', `/tenancy-agreements/${agreementId}`);

  return { status: TENANCY_AGREEMENT_STATUS.DECLINED };
};

const requestAmendment = async ({ agreementId, user, role, changes, note = null, ip = null }) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);

  if (agreement.status !== TENANCY_AGREEMENT_STATUS.FULLY_EXECUTED) {
    throw Object.assign(new Error('Only a fully executed agreement can be amended'), { status: 409 });
  }
  if (!changes || typeof changes !== 'object' || !Object.keys(changes).length) {
    throw Object.assign(new Error('Amendment changes are required'), { status: 400 });
  }

  const current = await getAgreementVersion(agreementId, agreement.current_version);
  const nextVersion = agreement.current_version + 1;
  const nextTerms = { ...(current ? current.terms : {}), ...changes };

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE tenancy_agreements
          SET status = $1, current_version = $2, updated_at = CURRENT_TIMESTAMP, executed_at = NULL
        WHERE id = $3`,
      [TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW, nextVersion, agreementId]
    );
    await client.query(
      `INSERT INTO tenancy_agreement_versions
         (agreement_id, version, status, terms, jurisdiction, document_hash, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [
        agreementId,
        nextVersion,
        TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW,
        JSON.stringify(nextTerms),
        JSON.stringify(current ? current.jurisdiction : {}),
        computeDocumentHash({ agreementId, version: nextVersion, terms: nextTerms, jurisdiction: current ? current.jurisdiction : {} }),
        user.id,
      ]
    );
    await recordEvent({
      agreementId,
      version: agreement.current_version,
      eventType: TENANCY_AGREEMENT_EVENTS.AMENDMENT_REQUESTED,
      actorId: user.id,
      actorRole: role || 'landlord',
      detail: { note },
      ip,
      client,
    });
    await recordEvent({
      agreementId,
      version: nextVersion,
      eventType: TENANCY_AGREEMENT_EVENTS.NEW_VERSION_CREATED,
      actorId: user.id,
      actorRole: role || 'landlord',
      detail: { fromVersion: agreement.current_version },
      ip,
      client,
    });

    await client.query('COMMIT');

    const counterpartyId = agreement.landlord_id === Number(user.id) ? agreement.tenant_id : agreement.landlord_id;
    await notify(counterpartyId, 'tenancy_agreement', 'Tenancy agreement amendment requested', note || 'A new version of the agreement is awaiting review.', `/tenancy-agreements/${agreementId}`);
    await logAction({ actorId: user.id, action: 'Tenancy agreement amendment requested', targetType: 'tenancy_agreement', targetId: agreementId, ip });

    return { status: TENANCY_AGREEMENT_STATUS.PENDING_LANDLORD_REVIEW, version: nextVersion };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const getAgreementAudit = async (agreementId, user) => {
  const agreement = await loadAgreement(agreementId);
  assertAccess(agreement, user);
  const events = await db.query(
    'SELECT id, version, event_type, actor_id, actor_role, detail, ip_address, created_at FROM tenancy_agreement_events WHERE agreement_id = $1 ORDER BY created_at ASC',
    [agreementId]
  );
  return events.rows;
};

exports.TENANCY_AGREEMENT_STATUS = TENANCY_AGREEMENT_STATUS;
exports.TENANCY_AGREEMENT_EVENTS = TENANCY_AGREEMENT_EVENTS;
exports.ensureTenancyAgreementSchema = ensureTenancyAgreementSchema;
exports.createDraftAgreementFromApplication = createDraftAgreementFromApplication;
exports.listAgreementsForUser = listAgreementsForUser;
exports.getAgreementDetail = getAgreementDetail;
exports.reviewAgreement = reviewAgreement;
exports.signAgreement = signAgreement;
exports.declineAgreement = declineAgreement;
exports.requestAmendment = requestAmendment;
exports.getAgreementAudit = getAgreementAudit;
exports.buildAgreementTerms = buildAgreementTerms;
