const db = require('../config/middleware/database');
const { validationResult } = require('express-validator');
const {
  sendApplicationNotification,
  sendApplicationStatusUpdate,
} = require('../config/utils/emailService');

let applicationNegotiationSchemaReady = false;

const NEGOTIATION_STATUSES = {
  NONE: 'none',
  TENANT_OFFERED: 'tenant_offered',
  LANDLORD_COUNTERED: 'landlord_countered',
  AGREED: 'agreed',
  DECLINED: 'declined',
};

const ACTION_TYPES = {
  TENANT_OFFER: 'tenant_offer',
  LANDLORD_COUNTER: 'landlord_counter',
  LANDLORD_ACCEPT: 'landlord_accept_offer',
  TENANT_ACCEPT: 'tenant_accept_counter',
  TENANT_REJECT: 'tenant_reject_counter',
};

const ensureApplicationNegotiationSchema = async () => {
  if (applicationNegotiationSchemaReady) return;

  await db.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS proposed_rent DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS counter_offer_rent DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS agreed_rent DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS negotiation_status VARCHAR(30) NOT NULL DEFAULT 'none';

    CREATE TABLE IF NOT EXISTS application_negotiations (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_role VARCHAR(20) NOT NULL,
      action_type VARCHAR(40) NOT NULL,
      offer_amount DECIMAL(12, 2),
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_application_negotiations_application
      ON application_negotiations(application_id);

    CREATE INDEX IF NOT EXISTS idx_application_negotiations_actor
      ON application_negotiations(actor_user_id);

    CREATE INDEX IF NOT EXISTS idx_applications_negotiation_status
      ON applications(negotiation_status);
  `);

  applicationNegotiationSchemaReady = true;
};

const normalizeAmount = (value) => {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : null;
};

const createNegotiationEvent = async ({
  applicationId,
  actorUserId,
  actorRole,
  actionType,
  offerAmount = null,
  note = null,
}) => {
  await db.query(
    `INSERT INTO application_negotiations
     (application_id, actor_user_id, actor_role, action_type, offer_amount, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [applicationId, actorUserId, actorRole, actionType, offerAmount, note]
  );
};

const getApplicationForTenant = async (applicationId, userId) => {
  const result = await db.query(
    `SELECT
       a.*,
       p.title AS property_title,
       p.rent_amount,
       p.payment_frequency,
       p.full_address,
       p.description,
       p.city,
       p.area,
       p.landlord_id,
       s.state_name,
       u.full_name AS landlord_name,
       u.phone AS landlord_phone,
       u.email AS landlord_email
     FROM applications a
     JOIN properties p ON a.property_id = p.id
     LEFT JOIN states s ON p.state_id = s.id
     JOIN users u ON p.landlord_id = u.id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [applicationId, userId]
  );

  return result.rows[0] || null;
};

const getApplicationForLandlord = async (applicationId, userId) => {
  const result = await db.query(
    `SELECT
       a.*,
       p.id AS property_id,
       p.title AS property_title,
       p.rent_amount,
       p.payment_frequency,
       p.landlord_id,
       p.city,
       p.area,
       u.full_name AS tenant_name,
       u.phone AS tenant_phone,
       u.email AS tenant_email,
       u.nin AS tenant_nin,
       u.identity_document_type AS tenant_identity_document_type,
       u.international_passport_number AS tenant_passport_number,
       u.nationality AS tenant_nationality,
       u.identity_verified AS tenant_verified
     FROM applications a
     JOIN properties p ON a.property_id = p.id
     JOIN users u ON a.tenant_id = u.id
     WHERE a.id = $1 AND p.landlord_id = $2`,
    [applicationId, userId]
  );

  return result.rows[0] || null;
};

const getNegotiationHistory = async (applicationId) => {
  const result = await db.query(
    `SELECT
       an.*,
       u.full_name AS actor_name,
       u.email AS actor_email
     FROM application_negotiations an
     JOIN users u ON u.id = an.actor_user_id
     WHERE an.application_id = $1
     ORDER BY an.created_at ASC, an.id ASC`,
    [applicationId]
  );

  return result.rows;
};

const attachHistory = async (row) => ({
  ...row,
  negotiation_history: await getNegotiationHistory(row.id),
});

exports.submitApplication = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { property_id, message, move_in_date, proposed_rent } = req.body;
    const normalizedProposedRent = normalizeAmount(proposed_rent);

    const propertyResult = await db.query(
      `SELECT p.id, p.title, p.landlord_id, p.is_available,
              p.rent_amount,
              u.email AS landlord_email,
              u.full_name AS landlord_name
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       WHERE p.id = $1`,
      [property_id]
    );

    if (!propertyResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    const property = propertyResult.rows[0];

    if (!property.is_available) {
      return res.status(400).json({ success: false, message: 'Property is no longer available' });
    }

    const existingApplication = await db.query(
      `SELECT id, status FROM applications WHERE property_id = $1 AND tenant_id = $2`,
      [property_id, userId]
    );

    if (existingApplication.rows.length > 0) {
      const status = existingApplication.rows[0].status;
      return res.status(400).json({
        success: false,
        message:
          status === 'pending'
            ? 'You already have a pending application for this property'
            : status === 'approved'
              ? 'Your application for this property was already approved'
              : 'You already applied for this property',
      });
    }

    const tenantResult = await db.query(
      `SELECT email, full_name, phone FROM users WHERE id = $1`,
      [userId]
    );

    const tenant = tenantResult.rows[0];

    const result = await db.query(
      `INSERT INTO applications
       (property_id, tenant_id, message, move_in_date, status, proposed_rent, negotiation_status)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING *`,
      [
        property_id,
        userId,
        message || null,
        move_in_date || null,
        normalizedProposedRent,
        normalizedProposedRent ? NEGOTIATION_STATUSES.TENANT_OFFERED : NEGOTIATION_STATUSES.NONE,
      ]
    );

    const application = result.rows[0];

    if (normalizedProposedRent) {
      await createNegotiationEvent({
        applicationId: application.id,
        actorUserId: userId,
        actorRole: 'tenant',
        actionType: ACTION_TYPES.TENANT_OFFER,
        offerAmount: normalizedProposedRent,
        note: message || null,
      });
    }

    await sendApplicationNotification(
      property.landlord_email,
      property.landlord_name,
      tenant.full_name,
      property.title,
      application.id
    );

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: await attachHistory(application),
    });
  } catch (error) {
    console.error('Submit application error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit application',
      error: error.message,
    });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE a.tenant_id = $1';
    const params = [userId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount += 1;
    }

    const result = await db.query(
      `SELECT
         a.*,
         p.title AS property_title,
         p.rent_amount,
         p.payment_frequency,
         p.city,
         p.area,
         s.state_name,
         u.full_name AS landlord_name,
         u.phone AS landlord_phone,
         u.email AS landlord_email,
         (SELECT photo_url FROM property_photos
          WHERE property_id = p.id AND is_primary = TRUE LIMIT 1) AS property_photo
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       LEFT JOIN states s ON p.state_id = s.id
       JOIN users u ON p.landlord_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM applications a ${whereClause}`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  } catch (error) {
    console.error('Get my applications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const { applicationId } = req.params;
    const userId = req.user.id;
    const userType = req.user.user_type;

    const row = userType === 'tenant'
      ? await getApplicationForTenant(applicationId, userId)
      : await getApplicationForLandlord(applicationId, userId);

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Application not found or unauthorized',
      });
    }

    return res.json({
      success: true,
      data: await attachHistory(row),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch application' });
  }
};

exports.withdrawApplication = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const { applicationId } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE applications
       SET status = 'withdrawn',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [applicationId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Application not found, unauthorized, or cannot be withdrawn',
      });
    }

    return res.json({
      success: true,
      message: 'Application withdrawn successfully',
      data: result.rows[0],
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to withdraw application' });
  }
};

exports.getReceivedApplications = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.landlord_id = $1';
    const params = [userId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount += 1;
    }

    const result = await db.query(
      `SELECT
         a.*,
         p.id AS property_id,
         p.title AS property_title,
         p.rent_amount,
         p.city,
         p.area,
         u.full_name AS tenant_name,
         u.phone AS tenant_phone,
         u.email AS tenant_email,
         u.identity_verified AS tenant_verified
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       JOIN users u ON a.tenant_id = u.id
       ${whereClause}
       ORDER BY
         CASE a.status
           WHEN 'pending' THEN 1
           WHEN 'approved' THEN 2
           WHEN 'rejected' THEN 3
           WHEN 'withdrawn' THEN 4
         END,
         a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       ${whereClause}`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  } catch (error) {
    console.error('Get received applications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
};

exports.getPropertyApplications = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const { propertyId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const propertyCheck = await db.query(
      'SELECT id FROM properties WHERE id = $1 AND landlord_id = $2',
      [propertyId, userId]
    );

    if (!propertyCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Property not found or unauthorized' });
    }

    const result = await db.query(
      `SELECT
         a.*, u.full_name AS tenant_name, u.phone AS tenant_phone,
         u.email AS tenant_email, u.identity_verified AS tenant_verified
       FROM applications a
       JOIN users u ON a.tenant_id = u.id
       WHERE a.property_id = $1
       ORDER BY
         CASE a.status
           WHEN 'pending' THEN 1
           WHEN 'approved' THEN 2
           WHEN 'rejected' THEN 3
           WHEN 'withdrawn' THEN 4
         END,
         a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [propertyId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM applications WHERE property_id = $1',
      [propertyId]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch property applications' });
  }
};

exports.landlordAcceptOffer = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const application = await getApplicationForLandlord(req.params.applicationId, req.user.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found or unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    if (!application.proposed_rent) {
      return res.status(400).json({ success: false, message: 'There is no tenant offer to accept' });
    }

    const result = await db.query(
      `UPDATE applications
       SET agreed_rent = $2,
           counter_offer_rent = NULL,
           negotiation_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [application.id, application.proposed_rent, NEGOTIATION_STATUSES.AGREED]
    );

    await createNegotiationEvent({
      applicationId: application.id,
      actorUserId: req.user.id,
      actorRole: 'landlord',
      actionType: ACTION_TYPES.LANDLORD_ACCEPT,
      offerAmount: application.proposed_rent,
      note: req.body?.note || null,
    });

    return res.json({
      success: true,
      message: 'Tenant offer accepted. You can now approve the application.',
      data: await attachHistory(result.rows[0]),
    });
  } catch (error) {
    console.error('Landlord accept offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to accept tenant offer' });
  }
};

exports.landlordCounterOffer = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const application = await getApplicationForLandlord(req.params.applicationId, req.user.id);
    const counterOfferRent = normalizeAmount(req.body?.counter_offer_rent);
    const note = String(req.body?.note || '').trim();

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found or unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    if (!counterOfferRent) {
      return res.status(400).json({ success: false, message: 'A valid counter-offer rent is required' });
    }

    const result = await db.query(
      `UPDATE applications
       SET counter_offer_rent = $2,
           agreed_rent = NULL,
           negotiation_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [application.id, counterOfferRent, NEGOTIATION_STATUSES.LANDLORD_COUNTERED]
    );

    await createNegotiationEvent({
      applicationId: application.id,
      actorUserId: req.user.id,
      actorRole: 'landlord',
      actionType: ACTION_TYPES.LANDLORD_COUNTER,
      offerAmount: counterOfferRent,
      note: note || null,
    });

    return res.json({
      success: true,
      message: 'Counter-offer sent to tenant',
      data: await attachHistory(result.rows[0]),
    });
  } catch (error) {
    console.error('Landlord counter offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send counter-offer' });
  }
};

exports.tenantUpdateOffer = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const application = await getApplicationForTenant(req.params.applicationId, req.user.id);
    const proposedRent = normalizeAmount(req.body?.proposed_rent);
    const note = String(req.body?.note || '').trim();

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found or unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    if (!proposedRent) {
      return res.status(400).json({ success: false, message: 'A valid proposed rent is required' });
    }

    const result = await db.query(
      `UPDATE applications
       SET proposed_rent = $2,
           counter_offer_rent = NULL,
           agreed_rent = NULL,
           negotiation_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [application.id, proposedRent, NEGOTIATION_STATUSES.TENANT_OFFERED]
    );

    await createNegotiationEvent({
      applicationId: application.id,
      actorUserId: req.user.id,
      actorRole: 'tenant',
      actionType: ACTION_TYPES.TENANT_OFFER,
      offerAmount: proposedRent,
      note: note || null,
    });

    return res.json({
      success: true,
      message: 'Offer sent to landlord',
      data: await attachHistory(result.rows[0]),
    });
  } catch (error) {
    console.error('Tenant update offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit offer' });
  }
};

exports.tenantRespondToCounter = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const application = await getApplicationForTenant(req.params.applicationId, req.user.id);
    const action = String(req.body?.action || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim();

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found or unauthorized' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    if (application.negotiation_status !== NEGOTIATION_STATUSES.LANDLORD_COUNTERED || !application.counter_offer_rent) {
      return res.status(400).json({ success: false, message: 'There is no landlord counter-offer to respond to' });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be accept or reject' });
    }

    const nextStatus = action === 'accept'
      ? NEGOTIATION_STATUSES.AGREED
      : NEGOTIATION_STATUSES.DECLINED;

    const agreedRent = action === 'accept' ? application.counter_offer_rent : null;

    const result = await db.query(
      `UPDATE applications
       SET agreed_rent = $2,
           negotiation_status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [application.id, agreedRent, nextStatus]
    );

    await createNegotiationEvent({
      applicationId: application.id,
      actorUserId: req.user.id,
      actorRole: 'tenant',
      actionType: action === 'accept' ? ACTION_TYPES.TENANT_ACCEPT : ACTION_TYPES.TENANT_REJECT,
      offerAmount: application.counter_offer_rent,
      note: note || null,
    });

    return res.json({
      success: true,
      message: action === 'accept' ? 'Counter-offer accepted' : 'Counter-offer rejected',
      data: await attachHistory(result.rows[0]),
    });
  } catch (error) {
    console.error('Tenant respond to counter error:', error);
    return res.status(500).json({ success: false, message: 'Failed to respond to counter-offer' });
  }
};

exports.approveApplication = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const { applicationId } = req.params;
    const userId = req.user.id;

    const application = await getApplicationForLandlord(applicationId, userId);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    if (application.negotiation_status === NEGOTIATION_STATUSES.LANDLORD_COUNTERED) {
      return res.status(400).json({
        success: false,
        message: 'The tenant has not responded to your counter-offer yet',
      });
    }

    const finalRent = application.agreed_rent
      || (application.negotiation_status === NEGOTIATION_STATUSES.TENANT_OFFERED ? application.proposed_rent : null)
      || application.rent_amount;

    const result = await db.query(
      `UPDATE applications
       SET status = 'approved',
           agreed_rent = COALESCE(agreed_rent, $2),
           negotiation_status = CASE
             WHEN negotiation_status = $3 THEN $4
             ELSE negotiation_status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        applicationId,
        finalRent,
        NEGOTIATION_STATUSES.TENANT_OFFERED,
        NEGOTIATION_STATUSES.AGREED,
      ]
    );

    if (application.negotiation_status === NEGOTIATION_STATUSES.TENANT_OFFERED && application.proposed_rent) {
      await createNegotiationEvent({
        applicationId,
        actorUserId: userId,
        actorRole: 'landlord',
        actionType: ACTION_TYPES.LANDLORD_ACCEPT,
        offerAmount: application.proposed_rent,
        note: 'Offer accepted during application approval',
      });
    }

    await sendApplicationStatusUpdate(
      application.tenant_email,
      application.tenant_name,
      application.property_title,
      'approved'
    );

    return res.json({
      success: true,
      message: 'Application approved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Approve application error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve application' });
  }
};

exports.rejectApplication = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const { applicationId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const application = await getApplicationForLandlord(applicationId, userId);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status}` });
    }

    const result = await db.query(
      `UPDATE applications
       SET status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [applicationId]
    );

    await sendApplicationStatusUpdate(
      application.tenant_email,
      application.tenant_name,
      application.property_title,
      'rejected',
      reason
    );

    return res.json({
      success: true,
      message: 'Application rejected',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Reject application error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject application' });
  }
};

exports.getApplicationStats = async (req, res) => {
  try {
    await ensureApplicationNegotiationSchema();

    const userId = req.user.id;

    const stats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE a.status = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE a.status = 'rejected') AS rejected_count,
         COUNT(*) FILTER (WHERE a.status = 'withdrawn') AS withdrawn_count,
         COUNT(*) FILTER (WHERE a.negotiation_status = 'tenant_offered') AS tenant_offer_count,
         COUNT(*) FILTER (WHERE a.negotiation_status = 'landlord_countered') AS landlord_counter_count,
         COUNT(*) FILTER (WHERE a.negotiation_status = 'agreed') AS agreed_count,
         COUNT(*) AS total_applications
       FROM applications a
       JOIN properties p ON a.property_id = p.id
       WHERE p.landlord_id = $1`,
      [userId]
    );

    return res.json({ success: true, data: stats.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch application statistics' });
  }
};

module.exports = exports;
