const db = require('../config/middleware/database');
const {
  LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
  getLawyerDirectoryUnlockStatus,
} = require('../config/utils/lawyerDirectoryAccess');
const {
  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
  ensurePlatformLawyerSchema,
  fetchPublicPlatformLawyers,
  getLatestPlatformLawyerRecruitmentBroadcast,
} = require('../config/utils/platformLawyerProgram');
const {
  ensureLawyerCaseNotesSchema,
} = require('../config/utils/legalSchema');
const { statesMatch } = require('../config/utils/stateScope');

const maskEmail = (value = '') => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue.includes('@')) return 'Hidden until payment';

  const [localPart, domainPart] = cleanValue.split('@');
  const safeLocal = localPart.length <= 2
    ? `${localPart.slice(0, 1)}***`
    : `${localPart.slice(0, 2)}***`;
  const safeDomain = domainPart.length <= 4
    ? `${domainPart.slice(0, 1)}***`
    : `${domainPart.slice(0, 2)}***${domainPart.slice(-4)}`;

  return `${safeLocal}@${safeDomain}`;
};

const maskPhone = (value = '') => {
  const digits = String(value || '').replace(/\s+/g, '').trim();
  if (!digits) return 'Hidden until payment';
  if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
};

const maskText = (value = '', fallback = 'Hidden until payment') => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return fallback;
  if (cleanValue.length <= 3) return `${cleanValue[0]}***`;
  return `${cleanValue.slice(0, 2)}***${cleanValue.slice(-1)}`;
};

const mapPublicLawyer = (row) => ({
  id: row.id,
  full_name: row.full_name,
  nationality: row.nationality || 'Nigeria',
  identity_verified: row.identity_verified === true,
  email: maskEmail(row.email),
  phone: maskPhone(row.phone),
  chamber_name: maskText(row.chamber_name, 'Hidden until payment'),
  chamber_phone: maskPhone(row.chamber_phone),
  details_locked: true,
});

const mapUnlockedLawyer = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email || '',
  phone: row.phone || '',
  nationality: row.nationality || 'Nigeria',
  chamber_name: row.chamber_name || 'Not provided',
  chamber_phone: row.chamber_phone || 'Not provided',
  identity_verified: row.identity_verified === true,
  details_locked: false,
});

const ALLOWED_EVIDENCE_STATUSES = new Set([
  'pending',
  'verified',
  'flagged',
  'rejected',
]);

const getLawyerDisputeAccess = async (lawyerId, disputeId) => {
  const result = await db.query(
    `SELECT
       la.id,
       la.property_id,
       la.client_user_id,
       d.id AS dispute_id,
       d.property_id AS dispute_property_id,
       d.status AS dispute_status,
       u.assigned_state AS lawyer_assigned_state,
       p.state AS property_state
     FROM legal_authorizations la
     JOIN disputes d ON d.id = $2
     JOIN users u ON u.id = la.lawyer_user_id
     JOIN properties p ON p.id = d.property_id
     WHERE la.lawyer_user_id = $1
       AND la.status = 'active'
       AND (
         la.property_id = d.property_id
         OR (
           la.property_id IS NULL
           AND la.client_user_id IN (d.opened_by, d.against_user)
         )
       )
     ORDER BY la.id DESC
     LIMIT 1`,
    [lawyerId, disputeId]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  if (!row.lawyer_assigned_state || !statesMatch(row.lawyer_assigned_state, row.property_state)) {
    return null;
  }

  return row;
};

/* ---------------------------------------------------
   Public Lawyers Directory
--------------------------------------------------- */

exports.getPublicLawyerDirectory = async (_req, res) => {
  try {
    const lawyers = await fetchPublicPlatformLawyers();

    return res.json({
      success: true,
      data: lawyers.map(mapPublicLawyer),
      meta: {
        unlock_amount: LAWYER_DIRECTORY_UNLOCK_PRICE_NGN,
        unlock_scope: 'directory',
        unlock_source: 'wallet',
      },
    });
  } catch (error) {
    console.error('Get public lawyer directory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load platform lawyers',
    });
  }
};

exports.getUnlockedLawyerDirectory = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userType = req.user?.user_type;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (!['tenant', 'landlord'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Only tenant and landlord accounts can unlock lawyer details',
      });
    }

    const unlockStatus = await getLawyerDirectoryUnlockStatus(userId);

    if (!unlockStatus.unlocked) {
      return res.status(402).json({
        success: false,
        message: 'Pay to unlock full lawyer details first',
      });
    }

    const lawyers = await fetchPublicPlatformLawyers();

    return res.json({
      success: true,
      data: lawyers.map(mapUnlockedLawyer),
      meta: {
        unlocked_at: unlockStatus.unlock?.unlocked_at || null,
        unlock_reference: unlockStatus.unlock?.transaction_reference || null,
      },
    });
  } catch (error) {
    console.error('Get unlocked lawyer directory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load unlocked lawyer details',
    });
  }
};

exports.getPlatformLawyerProgram = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const [broadcast, applicationResult] = await Promise.all([
      getLatestPlatformLawyerRecruitmentBroadcast(),
      db.query(
        `SELECT
           pla.*,
           reviewer.full_name AS reviewed_by_name,
           pl.id AS platform_lawyer_id,
           pl.is_active AS directory_active
         FROM platform_lawyer_applications pla
         LEFT JOIN users reviewer ON reviewer.id = pla.reviewed_by
         LEFT JOIN platform_lawyers pl ON pl.application_id = pla.id
         WHERE pla.lawyer_user_id = $1
         LIMIT 1`,
        [req.user.id]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        broadcast,
        application: applicationResult.rows[0] || null,
        recruitment_type: PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
      },
    });
  } catch (error) {
    console.error('Get platform lawyer program error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load platform lawyer program',
    });
  }
};

exports.applyToPlatformLawyerProgram = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const broadcast = await getLatestPlatformLawyerRecruitmentBroadcast();

    if (!broadcast) {
      return res.status(400).json({
        success: false,
        message: 'There is no active platform lawyer recruitment announcement right now',
      });
    }

    const existingResult = await db.query(
      `SELECT id, status
       FROM platform_lawyer_applications
       WHERE lawyer_user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    let application;

    if (!existingResult.rows.length) {
      application = (
        await db.query(
          `INSERT INTO platform_lawyer_applications (lawyer_user_id, broadcast_id, status)
           VALUES ($1, $2, 'pending')
           RETURNING *`,
          [req.user.id, broadcast.id]
        )
      ).rows[0];
    } else if (existingResult.rows[0].status === 'pending') {
      application = (
        await db.query(
          `UPDATE platform_lawyer_applications
           SET broadcast_id = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [existingResult.rows[0].id, broadcast.id]
        )
      ).rows[0];
    } else if (existingResult.rows[0].status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'You are already approved as a RentalHub NG lawyer',
      });
    } else {
      application = (
        await db.query(
          `UPDATE platform_lawyer_applications
           SET status = 'pending',
               broadcast_id = $2,
               review_note = NULL,
               reviewed_at = NULL,
               reviewed_by = NULL,
               applied_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [existingResult.rows[0].id, broadcast.id]
        )
      ).rows[0];
    }

    return res.json({
      success: true,
      message: 'Your application has been submitted',
      data: application,
    });
  } catch (error) {
    console.error('Apply to platform lawyer program error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit your lawyer application',
    });
  }
};


/* ---------------------------------------------------
   Grant Lawyer Access to a Property
--------------------------------------------------- */

exports.grantLawyerAccess = async (req, res) => {
  try {

    const { property_id, lawyer_id, client_user_id } = req.body;
    const requesterId = Number(req.user?.id);

    if (!property_id || !lawyer_id || !client_user_id) {
      return res.status(400).json({
        success: false,
        message: "property_id, lawyer_id and client_user_id are required"
      });
    }

    // Tenant/Landlord can only grant legal access on their own behalf
    if (Number(client_user_id) !== requesterId) {
      return res.status(403).json({
        success: false,
        message: 'You can only grant legal access for your own account',
      });
    }

    // Ensure requester has control over the property in question
    const propertyAccessCheck = await db.query(
      `SELECT id
       FROM properties
       WHERE id = $1
         AND owner_id = $2
       UNION
       SELECT id
       FROM rental_applications
       WHERE property_id = $1
         AND tenant_id = $2
         AND status = 'approved'
       LIMIT 1`,
      [property_id, requesterId]
    );

    if (propertyAccessCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to grant legal access for this property',
      });
    }

    // Verify the target user is actually a lawyer
    const lawyerCheck = await db.query(
      `SELECT id, assigned_state, lawyer_client_scope
       FROM users
       WHERE id = $1 AND user_type IN ('lawyer', 'state_lawyer', 'super_lawyer')
       LIMIT 1`,
      [lawyer_id]
    );
    if (lawyerCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "The specified user is not a registered lawyer"
      });
    }

    const propertyStateResult = await db.query(
      `SELECT state
       FROM properties
       WHERE id = $1
       LIMIT 1`,
      [property_id]
    );

    const propertyState = propertyStateResult.rows[0]?.state || null;
    const lawyerAssignedState = lawyerCheck.rows[0]?.assigned_state || null;
    const lawyerClientScope = String(lawyerCheck.rows[0]?.lawyer_client_scope || '').trim().toLowerCase();

    if (!lawyerAssignedState || !statesMatch(lawyerAssignedState, propertyState)) {
      return res.status(403).json({
        success: false,
        message: 'Lawyer state lock violation: selected lawyer is outside this property state',
      });
    }

    const clientTypeResult = await db.query(
      `SELECT user_type
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [requesterId]
    );
    const clientUserType = String(clientTypeResult.rows[0]?.user_type || '').trim().toLowerCase();

    if (!['tenant', 'landlord'].includes(clientUserType)) {
      return res.status(403).json({
        success: false,
        message: 'Only tenant or landlord clients can grant legal access',
      });
    }

    if (lawyerClientScope && lawyerClientScope !== clientUserType) {
      return res.status(403).json({
        success: false,
        message: `Selected lawyer is restricted to ${lawyerClientScope} clients`,
      });
    }

    // Verify the client is actually connected to this property (owner or tenant)
    const clientCheck = await db.query(
      `SELECT 1 FROM properties WHERE id = $1 AND owner_id = $2
       UNION
       SELECT 1 FROM rental_applications
       WHERE property_id = $1 AND tenant_id = $2 AND status = 'approved'
       LIMIT 1`,
      [property_id, requesterId]
    );
    if (clientCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "The client is not connected to this property"
      });
    }

    // Prevent duplicate active authorizations
    const dupCheck = await db.query(
      `SELECT id FROM legal_authorizations
       WHERE property_id = $1
         AND lawyer_user_id = $2
         AND client_user_id = $3
         AND status = 'active'
       LIMIT 1`,
      [property_id, lawyer_id, client_user_id]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This lawyer already has active access to this property for this client"
      });
    }

    const result = await db.query(
      `INSERT INTO legal_authorizations
       (property_id, client_user_id, lawyer_user_id, granted_by)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [property_id, client_user_id, lawyer_id, req.user?.id]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user?.id,
        'Granted lawyer access to property',
        'property',
        property_id,
        JSON.stringify({ lawyer_id, client_user_id })
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Lawyer access granted successfully",
      data: result.rows[0]
    });

  } catch (error) {

    console.error("Grant lawyer access error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to grant lawyer access"
    });

  }
};



/* ---------------------------------------------------
   Get Properties Lawyer Has Access To
--------------------------------------------------- */

exports.getAuthorizedProperties = async (req, res) => {

  try {

    const lawyerId = req.user?.id;

    if (!lawyerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const result = await db.query(
      `SELECT DISTINCT ON (p.id)
         p.*,
         client.full_name AS client_name,
         client.email AS client_email,
         granter.full_name AS assigned_by_name,
         granter.email AS assigned_by_email,
         lawyer.assigned_state AS lawyer_assigned_state
       FROM properties p
       JOIN legal_authorizations la
         ON (
           la.property_id = p.id
           OR (
             la.property_id IS NULL
             AND EXISTS (
               SELECT 1
               FROM disputes d
               WHERE d.property_id = p.id
                 AND la.client_user_id IN (d.opened_by, d.against_user)
             )
           )
         )
       LEFT JOIN users client ON client.id = la.client_user_id
       LEFT JOIN users granter ON granter.id = la.granted_by
       LEFT JOIN users lawyer ON lawyer.id = la.lawyer_user_id
       WHERE la.lawyer_user_id = $1
         AND la.status = 'active'
         AND lawyer.assigned_state IS NOT NULL
         AND LOWER(lawyer.assigned_state) = LOWER(p.state)
       ORDER BY p.id, p.created_at DESC, la.id DESC`,
      [lawyerId]
    );

    return res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {

    console.error("Get authorized properties error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch authorized properties"
    });

  }
};

/* ---------------------------------------------------
   Resolve Dispute (Lawyer)
--------------------------------------------------- */

exports.resolveDispute = async (req, res) => {

  try {

    const { disputeId } = req.params;
    const { resolution_note } = req.body;
    const lawyerId = req.user?.id;

    if (!disputeId) {
      return res.status(400).json({
        success: false,
        message: "Dispute ID is required"
      });
    }

    // Verify this lawyer has been granted access to this specific dispute
    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to resolve this dispute"
      });
    }

    const result = await db.query(
      `UPDATE disputes
       SET status = 'resolved',
           resolution_note = $1,
           resolved_by = $2,
           resolved_at = NOW()
       WHERE id = $3
         AND is_legally_sealed = FALSE
       RETURNING *`,
      [
        resolution_note || null,
        lawyerId,
        disputeId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Dispute not found or it is legally sealed and cannot be modified"
      });
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        'Lawyer resolved dispute',
        'dispute',
        disputeId,
        JSON.stringify({ resolution_note: resolution_note || null })
      ]
    );

    return res.json({
      success: true,
      message: "Dispute resolved successfully",
      data: result.rows[0]
    });

  } catch (error) {

    console.error("Resolve dispute error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to resolve dispute"
    });

  }

};

/* ---------------------------------------------------
   Legal Audit Logs
--------------------------------------------------- */

exports.getLegalAuditLogs = async (req, res) => {
  try {
    const { disputeId = null, limit = 50 } = req.query;
    const params = [];
    const where = [];

    if (disputeId) {
      params.push(disputeId);
      where.push(`l.target_type = 'dispute' AND l.target_id = $${params.length}`);
    } else {
      where.push(`(
        l.target_type = 'dispute'
        OR l.action ILIKE '%lawyer%'
        OR l.action ILIKE '%legal%'
      )`);
    }

    params.push(Math.min(Number(limit) || 50, 200));

    const result = await db.query(
      `SELECT
         l.*,
         u.full_name AS actor_name,
         u.email AS actor_email,
         u.user_type AS actor_role
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.id DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get legal audit logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal audit logs',
    });
  }
};

  /* ---------------------------------------------------
   Lawyer Evidence Verification
--------------------------------------------------- */

exports.verifyEvidence = async (req, res) => {
  try {
    const { disputeId, evidenceId } = req.params;
    const verificationStatus = String(req.body?.verification_status || '').trim().toLowerCase();
    const notes = String(req.body?.notes || '').trim();
    const lawyerId = req.user?.id;

    if (!disputeId || !evidenceId || !verificationStatus) {
      return res.status(400).json({
        success: false,
        message: 'disputeId, evidenceId and verification_status are required',
      });
    }

    if (!ALLOWED_EVIDENCE_STATUSES.has(verificationStatus)) {
      return res.status(400).json({
        success: false,
        message: `verification_status must be one of: ${Array.from(ALLOWED_EVIDENCE_STATUSES).join(', ')}`,
      });
    }

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to verify evidence for this dispute',
      });
    }

    // Block mutations once a dispute is legally sealed — the merkle root is final
    const sealCheck = await db.query(
      `SELECT is_legally_sealed FROM disputes WHERE id = $1`,
      [disputeId]
    );
    if (sealCheck.rows[0]?.is_legally_sealed) {
      return res.status(403).json({
        success: false,
        message: 'This dispute is legally sealed. Evidence verification status cannot be changed.',
      });
    }

    const result = await db.query(
      `UPDATE dispute_evidence
       SET verification_status = $1,
           verified_by = $2,
           verified_at = CURRENT_TIMESTAMP,
           lawyer_notes = $3
       WHERE id = $4
         AND dispute_id = $5
       RETURNING *`,
      [
        verificationStatus,
        lawyerId,
        notes || null,
        evidenceId,
        disputeId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found',
      });
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        `Verified evidence as ${verificationStatus}`,
        'evidence',
        evidenceId,
        JSON.stringify({
          dispute_id: disputeId,
          verification_status: verificationStatus,
          notes: notes || null,
        }),
      ]
    );

    return res.json({
      success: true,
      message: `Evidence marked as ${verificationStatus}`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Verify evidence error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify evidence',
    });
  }
};

/* ---------------------------------------------------
   Get Evidence Verification Status
--------------------------------------------------- */

exports.getEvidenceVerification = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const lawyerId = req.user?.id;

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view evidence for this dispute',
      });
    }

    const result = await db.query(
      `SELECT
         de.id,
         de.file_name,
         de.file_hash,
         de.mime_type,
         de.file_size,
         COALESCE(de.uploaded_at, de.created_at) AS uploaded_at,
         de.verification_status,
         de.verified_at,
         de.lawyer_notes,
         uploaded_by.full_name AS uploaded_by_name,
         uploaded_by.email AS uploaded_by_email,
         u.full_name AS verified_by_name,
         u.email AS verified_by_email
       FROM dispute_evidence de
       LEFT JOIN users uploaded_by ON uploaded_by.id = de.uploaded_by
       LEFT JOIN users u ON u.id = de.verified_by
       WHERE de.dispute_id = $1
       ORDER BY COALESCE(de.uploaded_at, de.created_at) ASC, de.id ASC`,
      [disputeId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get evidence verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch evidence verification status',
    });
  }
};

/* ---------------------------------------------------
   Lawyer Case Notes
--------------------------------------------------- */

exports.createCaseNote = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const { disputeId } = req.params;
    const { title, content, note_type = 'case_analysis', is_visible_to_client = false } = req.body;
    const lawyerId = req.user?.id;

    if (!disputeId || !content) {
      return res.status(400).json({
        success: false,
        message: 'disputeId and content are required',
      });
    }

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to add notes to this dispute',
      });
    }

    const result = await db.query(
      `INSERT INTO lawyer_case_notes
       (dispute_id, lawyer_user_id, title, content, note_type, is_visible_to_client)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        disputeId,
        lawyerId,
        title || null,
        content,
        note_type,
        is_visible_to_client,
      ]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        'Added case note',
        'dispute',
        disputeId,
        JSON.stringify({
          note_type,
          note_id: result.rows[0].id,
          is_visible_to_client,
        }),
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Case note added successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create case note error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add case note',
    });
  }
};

exports.getCaseNotes = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const { disputeId } = req.params;
    const lawyerId = req.user?.id;

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view case notes for this dispute',
      });
    }

    const result = await db.query(
      `SELECT
         lcn.id,
         lcn.title,
         lcn.content,
         lcn.note_type,
         lcn.is_visible_to_client,
         lcn.lawyer_user_id,
         lcn.created_at,
         lcn.updated_at,
         u.full_name AS lawyer_name,
         u.email AS lawyer_email
       FROM lawyer_case_notes lcn
       JOIN users u ON u.id = lcn.lawyer_user_id
       WHERE lcn.dispute_id = $1
       ORDER BY lcn.updated_at DESC, lcn.id DESC`,
      [disputeId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get case notes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch case notes',
    });
  }
};

exports.updateCaseNote = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const { disputeId, noteId } = req.params;
    const lawyerId = req.user?.id;
    const { title, content, note_type, is_visible_to_client } = req.body;

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update notes for this dispute',
      });
    }

    const result = await db.query(
      `UPDATE lawyer_case_notes
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           note_type = COALESCE($3, note_type),
           is_visible_to_client = COALESCE($4, is_visible_to_client),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
         AND dispute_id = $6
         AND lawyer_user_id = $7
       RETURNING *`,
      [
        title ?? null,
        content ?? null,
        note_type ?? null,
        typeof is_visible_to_client === 'boolean' ? is_visible_to_client : null,
        noteId,
        disputeId,
        lawyerId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Case note not found or you cannot edit it',
      });
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        'Updated case note',
        'dispute',
        disputeId,
        JSON.stringify({
          note_id: noteId,
        }),
      ]
    );

    return res.json({
      success: true,
      message: 'Case note updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update case note error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update case note',
    });
  }
};

exports.deleteCaseNote = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const { disputeId, noteId } = req.params;
    const lawyerId = req.user?.id;

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete notes for this dispute',
      });
    }

    const result = await db.query(
      `DELETE FROM lawyer_case_notes
       WHERE id = $1
         AND dispute_id = $2
         AND lawyer_user_id = $3
       RETURNING id`,
      [noteId, disputeId, lawyerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Case note not found or you cannot delete it',
      });
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        'Deleted case note',
        'dispute',
        disputeId,
        JSON.stringify({
          note_id: noteId,
        }),
      ]
    );

    return res.json({
      success: true,
      message: 'Case note deleted successfully',
    });
  } catch (error) {
    console.error('Delete case note error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete case note',
    });
  }
};

exports.updateDisputeSummary = async (req, res) => {
  try {
    await ensureLawyerCaseNotesSchema();

    const { disputeId } = req.params;
    const lawyerId = req.user?.id;
    const lawyerSummary = String(req.body?.lawyer_summary || '').trim();

    if (!lawyerSummary) {
      return res.status(400).json({
        success: false,
        message: 'lawyer_summary is required',
      });
    }

    const access = await getLawyerDisputeAccess(lawyerId, disputeId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this dispute summary',
      });
    }

    const result = await db.query(
      `UPDATE disputes
       SET lawyer_summary = $1,
           lawyer_summary_by = $2,
           lawyer_summary_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, lawyer_summary, lawyer_summary_by, lawyer_summary_at`,
      [lawyerSummary, lawyerId, disputeId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found',
      });
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        lawyerId,
        'Updated dispute summary',
        'dispute',
        disputeId,
        JSON.stringify({
          lawyer_summary_length: lawyerSummary.length,
        }),
      ]
    );

    return res.json({
      success: true,
      message: 'Dispute summary updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update dispute summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update dispute summary',
    });
  }
};
