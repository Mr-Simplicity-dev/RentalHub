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

    if (!property_id || !lawyer_id || !client_user_id) {
      return res.status(400).json({
        success: false,
        message: "property_id, lawyer_id and client_user_id are required"
      });
    }

    const result = await db.query(
      `INSERT INTO legal_authorizations
       (property_id, client_user_id, lawyer_user_id, granted_by)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [property_id, client_user_id, lawyer_id, req.user?.id]
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
         granter.email AS assigned_by_email
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
       WHERE la.lawyer_user_id = $1
         AND la.status = 'active'
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

    if (!disputeId) {
      return res.status(400).json({
        success: false,
        message: "Dispute ID is required"
      });
    }

    const result = await db.query(
      `UPDATE disputes
       SET status = 'resolved',
           resolution_note = $1,
           resolved_by = $2,
           resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [
        resolution_note || null,
        req.user?.id,
        disputeId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Dispute not found"
      });
    }

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
