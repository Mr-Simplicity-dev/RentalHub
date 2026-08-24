const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { logAction } = require('./schemaHelpers');
const {
  PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE,
  PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
  createPlatformLawyerInvite,
  ensurePlatformLawyerSchema,
} = require('../../config/utils/platformLawyerProgram');
const {
  ensurePlatformAgentSchema,
} = require('../../config/utils/platformAgentProgram');
const {
  sendPlatformLawyerInviteEmail,
} = require('../../config/utils/emailService');

// ================= PLATFORM LAWYERS =================

const getPlatformLawyerActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createPlatformLawyerApplicationOperation = async ({
  applicationId,
  adminId,
  actorName,
  eventType,
  note = null,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO platform_lawyer_application_operations (
       application_id,
       admin_id,
       actor_name,
       event_type,
       note,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      applicationId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const ensurePlatformLawyerOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_lawyer_operations (
      id SERIAL PRIMARY KEY,
      platform_lawyer_id INTEGER,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_platform_lawyer_operations_lawyer
      ON platform_lawyer_operations(platform_lawyer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_platform_lawyer_operations_created
      ON platform_lawyer_operations(created_at DESC);
  `);
};

const createPlatformLawyerOperation = async ({
  platformLawyerId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO platform_lawyer_operations (
       platform_lawyer_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      platformLawyerId || null,
      actor?.id || null,
      getPlatformLawyerActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const requirePlatformLawyerReason = (req, message) => {
  const reason = String(req.body?.reason || req.body?.note || '').trim();
  if (!reason) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return reason;
};

const getPlatformLawyerManagementData = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();
    await ensurePlatformLawyerOperationSchema();

    const [entriesResult, applicationsResult, broadcastsResult] = await Promise.all([
      db.query(
        `SELECT
           pl.*,
           COALESCE(NULLIF(u.full_name, ''), pl.full_name) AS display_name,
           COALESCE(NULLIF(u.email, ''), pl.email) AS display_email,
           COALESCE(NULLIF(u.phone, ''), pl.phone) AS display_phone,
           COALESCE(NULLIF(u.nationality, ''), pl.nationality, 'Nigeria') AS display_nationality,
           COALESCE(NULLIF(u.chamber_name, ''), pl.chamber_name) AS display_chamber_name,
           COALESCE(NULLIF(u.chamber_phone, ''), pl.chamber_phone) AS display_chamber_phone,
           COALESCE(u.identity_verified, FALSE) AS identity_verified,
           li.id AS latest_invite_id,
           li.status AS latest_invite_status,
           li.expires_at AS latest_invite_expires_at,
           li.accepted_at AS latest_invite_accepted_at,
           li.last_sent_at AS latest_invite_last_sent_at,
           li.resent_count AS latest_invite_resent_count,
           COALESCE(ops.operations, '[]'::json) AS operations
         FROM platform_lawyers pl
         LEFT JOIN users u ON u.id = pl.lawyer_user_id
         LEFT JOIN LATERAL (
           SELECT pli.id, pli.status, pli.expires_at, pli.accepted_at, pli.last_sent_at, pli.resent_count
           FROM platform_lawyer_invites pli
           WHERE pli.platform_lawyer_id = pl.id
           ORDER BY pli.created_at DESC
           LIMIT 1
         ) li ON TRUE
         LEFT JOIN LATERAL (
           SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
           FROM (
             SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
             FROM platform_lawyer_operations
             WHERE platform_lawyer_id = pl.id
             ORDER BY created_at DESC, id DESC
             LIMIT 3
           ) operation_rows
         ) ops ON TRUE
         ORDER BY pl.is_active DESC, pl.created_at DESC`
      ),
      db.query(
        `SELECT
           pla.*,
           u.full_name,
           u.email,
           u.phone,
           u.nationality,
           u.chamber_name,
           u.chamber_phone,
           COALESCE(u.identity_verified, FALSE) AS identity_verified,
           reviewer.full_name AS reviewed_by_name,
           b.title AS broadcast_title,
           pl.id AS platform_lawyer_id,
           pl.is_active AS directory_active
         FROM platform_lawyer_applications pla
         JOIN users u ON u.id = pla.lawyer_user_id
         LEFT JOIN users reviewer ON reviewer.id = pla.reviewed_by
         LEFT JOIN broadcasts b ON b.id = pla.broadcast_id
         LEFT JOIN platform_lawyers pl ON pl.application_id = pla.id
         ORDER BY
           CASE pla.status
             WHEN 'pending' THEN 0
             WHEN 'approved' THEN 1
             ELSE 2
           END,
           pla.applied_at DESC`
      ),
      db.query(
        `SELECT b.*, u.full_name AS sender_name
         FROM broadcasts b
         LEFT JOIN users u ON u.id = b.sender_id
         WHERE b.broadcast_type = $1
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE]
      ),
    ]);

    const applicationIds = applicationsResult.rows.map((application) => application.id);
    let operationsByApplication = {};

    if (applicationIds.length) {
      const operationsResult = await db.query(
        `SELECT
           id,
           application_id,
           admin_id,
           actor_name,
           event_type,
           note,
           metadata,
           created_at
         FROM platform_lawyer_application_operations
         WHERE application_id = ANY($1::int[])
         ORDER BY created_at DESC, id DESC`,
        [applicationIds]
      );

      operationsByApplication = operationsResult.rows.reduce((acc, operation) => {
        if (!acc[operation.application_id]) {
          acc[operation.application_id] = [];
        }
        acc[operation.application_id].push(operation);
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: {
        entries: entriesResult.rows,
        applications: applicationsResult.rows.map((application) => ({
          ...application,
          review_history: operationsByApplication[application.id] || [],
        })),
        recruitment_broadcasts: broadcastsResult.rows,
        invite_expiry_hours: PLATFORM_LAWYER_INVITE_EXPIRY_HOURS,
      },
    });
  } catch (error) {
    req.logger.error('Get platform lawyer management data error:', error);
    res.status(500).json({ message: 'Failed to load platform lawyers' });
  }
};

const createManualPlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').replace(/\s+/g, '');
    const nationality = String(req.body.nationality || 'Nigeria').trim() || 'Nigeria';
    const chamberName = String(req.body.chamber_name || '').trim();
    const chamberPhone = String(req.body.chamber_phone || '').replace(/\s+/g, '');
    const isActive = req.body.is_active !== false;

    if (!fullName || !email || !phone || !chamberName || !chamberPhone) {
      return res.status(400).json({
        message: 'Full name, email, phone, chamber name, and chamber phone are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid lawyer email address' });
    }

    const duplicateEntry = await db.query(
      `SELECT id
       FROM platform_lawyers
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (duplicateEntry.rows.length) {
      return res.status(409).json({
        message: 'A platform lawyer record already exists for this email',
      });
    }

    const existingUserResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (
      existingUserResult.rows.length &&
      existingUserResult.rows[0].user_type !== 'lawyer'
    ) {
      return res.status(409).json({
        message: 'This email already belongs to a non-lawyer account',
      });
    }

    const lawyerUserId = existingUserResult.rows[0]?.id || null;

    const entryResult = await db.query(
      `INSERT INTO platform_lawyers (
         source_type,
         lawyer_user_id,
         full_name,
         email,
         phone,
         nationality,
         chamber_name,
         chamber_phone,
         is_active,
         created_by,
         updated_by
       )
       VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        lawyerUserId,
        fullName,
        email,
        phone,
        nationality,
        chamberName,
        chamberPhone,
        isActive,
        req.user.id,
      ]
    );

    const entry = entryResult.rows[0];
    const invite = await createPlatformLawyerInvite({
      platformLawyerId: entry.id,
      lawyerEmail: email,
      createdBy: req.user.id,
    });

    const emailResult = await sendPlatformLawyerInviteEmail({
      email,
      inviteUrl: invite.invite_url,
      expiresInHours: invite.expires_in_hours,
      assignedByName: req.user.full_name || 'RentalHub NG',
    });

    await logAction(req.user.id, 'CREATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

    res.status(201).json({
      success: true,
      data: {
        entry,
        invite: {
          ...invite,
          email_sent: !!emailResult?.success,
          email_error: emailResult?.success ? null : emailResult?.error || 'Invite email failed',
        },
      },
    });
  } catch (error) {
    req.logger.error('Create manual platform lawyer error:', error);
    res.status(500).json({ message: 'Failed to create platform lawyer record' });
  }
};

const resendManualPlatformLawyerInvite = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const entryResult = await db.query(
      `SELECT id, source_type, email
       FROM platform_lawyers
       WHERE id = $1
       LIMIT 1`,
      [req.params.lawyerId]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ message: 'Platform lawyer record not found' });
    }

    const entry = entryResult.rows[0];

    if (entry.source_type !== 'manual') {
      return res.status(400).json({
        message: 'Only manually entered lawyers can receive setup invites from here',
      });
    }

    const invite = await createPlatformLawyerInvite({
      platformLawyerId: entry.id,
      lawyerEmail: entry.email,
      createdBy: req.user.id,
    });

    const emailResult = await sendPlatformLawyerInviteEmail({
      email: entry.email,
      inviteUrl: invite.invite_url,
      expiresInHours: invite.expires_in_hours,
      assignedByName: req.user.full_name || 'RentalHub NG',
    });

    await logAction(req.user.id, 'RESEND_PLATFORM_LAWYER_INVITE', 'platform_lawyer', entry.id);

    res.json({
      success: true,
      data: {
        invite: {
          ...invite,
          email_sent: !!emailResult?.success,
          email_error: emailResult?.success ? null : emailResult?.error || 'Invite email failed',
        },
      },
      message: emailResult?.success
        ? 'Platform lawyer invite resent'
        : 'Platform lawyer record updated, but the invite email failed to send',
    });
  } catch (error) {
    req.logger.error('Resend manual platform lawyer invite error:', error);
    res.status(500).json({ message: 'Failed to resend platform lawyer invite' });
  }
};

const updatePlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();
    await ensurePlatformLawyerOperationSchema();

    const entryResult = await db.query(
      `SELECT *
       FROM platform_lawyers
       WHERE id = $1
       LIMIT 1`,
      [req.params.lawyerId]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ message: 'Platform lawyer record not found' });
    }

    const entry = entryResult.rows[0];
    const nextIsActive =
      typeof req.body.is_active === 'boolean' ? req.body.is_active : entry.is_active;
    const statusChanged = entry.is_active !== nextIsActive;
    const statusReason = statusChanged
      ? requirePlatformLawyerReason(
          req,
          nextIsActive
            ? 'An activation reason is required'
            : 'A deactivation reason is required'
        )
      : String(req.body?.reason || req.body?.note || '').trim();

    if (entry.source_type !== 'manual') {
      const result = await db.query(
        `UPDATE platform_lawyers
         SET is_active = $2,
             updated_by = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [entry.id, nextIsActive, req.user.id]
      );

      if (statusChanged || statusReason) {
        await createPlatformLawyerOperation({
          platformLawyerId: entry.id,
          actor: req.user,
          eventType: statusChanged
            ? nextIsActive
              ? 'platform_lawyer_activated'
              : 'platform_lawyer_deactivated'
            : 'platform_lawyer_updated',
          note: statusReason || null,
          metadata: {
            full_name: entry.full_name,
            email: entry.email,
            source_type: entry.source_type,
            previous_is_active: entry.is_active,
            new_is_active: result.rows[0].is_active,
          },
        });
      }

      await logAction(req.user.id, 'UPDATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

      return res.json({ success: true, data: result.rows[0] });
    }

    const fullName = String(req.body.full_name || entry.full_name || '').trim();
    const email = String(req.body.email || entry.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || entry.phone || '').replace(/\s+/g, '');
    const nationality = String(req.body.nationality || entry.nationality || 'Nigeria').trim() || 'Nigeria';
    const chamberName = String(req.body.chamber_name || entry.chamber_name || '').trim();
    const chamberPhone = String(req.body.chamber_phone || entry.chamber_phone || '').replace(/\s+/g, '');

    if (!fullName || !email || !phone || !chamberName || !chamberPhone) {
      return res.status(400).json({
        message: 'Full name, email, phone, chamber name, and chamber phone are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid lawyer email address' });
    }

    const duplicateEntry = await db.query(
      `SELECT id
       FROM platform_lawyers
       WHERE LOWER(email) = LOWER($1)
         AND id <> $2
       LIMIT 1`,
      [email, entry.id]
    );

    if (duplicateEntry.rows.length) {
      return res.status(409).json({
        message: 'Another platform lawyer record already uses this email',
      });
    }

    const existingUserResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (
      existingUserResult.rows.length &&
      existingUserResult.rows[0].user_type !== 'lawyer'
    ) {
      return res.status(409).json({
        message: 'This email already belongs to a non-lawyer account',
      });
    }

    const lawyerUserId = existingUserResult.rows[0]?.id || entry.lawyer_user_id || null;

    const result = await db.query(
      `UPDATE platform_lawyers
       SET lawyer_user_id = $2,
           full_name = $3,
           email = $4,
           phone = $5,
           nationality = $6,
           chamber_name = $7,
           chamber_phone = $8,
           is_active = $9,
           updated_by = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        entry.id,
        lawyerUserId,
        fullName,
        email,
        phone,
        nationality,
        chamberName,
        chamberPhone,
        nextIsActive,
        req.user.id,
      ]
    );

    if (statusChanged || statusReason) {
      await createPlatformLawyerOperation({
        platformLawyerId: entry.id,
        actor: req.user,
        eventType: statusChanged
          ? nextIsActive
            ? 'platform_lawyer_activated'
            : 'platform_lawyer_deactivated'
          : 'platform_lawyer_updated',
        note: statusReason || null,
        metadata: {
          full_name: result.rows[0].full_name,
          email: result.rows[0].email,
          source_type: result.rows[0].source_type,
          previous_is_active: entry.is_active,
          new_is_active: result.rows[0].is_active,
        },
      });
    }

    await logAction(req.user.id, 'UPDATE_PLATFORM_LAWYER', 'platform_lawyer', entry.id);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    req.logger.error('Update platform lawyer error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update platform lawyer',
    });
  }
};

const deletePlatformLawyer = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();
    await ensurePlatformLawyerOperationSchema();
    const reason = requirePlatformLawyerReason(req, 'A deletion reason is required');

    const entryResult = await db.query(
      `SELECT *
       FROM platform_lawyers
       WHERE id = $1
         AND source_type = 'manual'
       LIMIT 1`,
      [req.params.lawyerId]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({
        message: 'Manual platform lawyer record not found',
      });
    }

    const result = await db.query(
      `DELETE FROM platform_lawyers
       WHERE id = $1
         AND source_type = 'manual'
       RETURNING id`,
      [req.params.lawyerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: 'Manual platform lawyer record not found',
      });
    }

    await createPlatformLawyerOperation({
      platformLawyerId: Number(req.params.lawyerId),
      actor: req.user,
      eventType: 'platform_lawyer_deleted',
      note: reason,
      metadata: {
        full_name: entryResult.rows[0].full_name,
        email: entryResult.rows[0].email,
        phone: entryResult.rows[0].phone,
        chamber_name: entryResult.rows[0].chamber_name,
        was_active: entryResult.rows[0].is_active,
      },
    });

    await logAction(req.user.id, 'DELETE_PLATFORM_LAWYER', 'platform_lawyer', req.params.lawyerId);

    res.json({ success: true });
  } catch (error) {
    req.logger.error('Delete platform lawyer error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to delete platform lawyer',
    });
  }
};

const createPlatformLawyerRecruitmentBroadcast = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();

    if (!title || !message) {
      return res.status(400).json({
        message: 'Title and message are required',
      });
    }

    const result = await db.query(
      `INSERT INTO broadcasts (sender_id, target_role, title, message, broadcast_type)
       VALUES ($1, 'lawyer', $2, $3, $4)
       RETURNING *`,
      [req.user.id, title, message, PLATFORM_LAWYER_RECRUITMENT_BROADCAST_TYPE]
    );

    await logAction(req.user.id, 'CREATE_PLATFORM_LAWYER_BROADCAST', 'broadcast', result.rows[0].id);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    req.logger.error('Create platform lawyer recruitment broadcast error:', error);
    res.status(500).json({ message: 'Failed to send lawyer recruitment broadcast' });
  }
};

const approvePlatformLawyerApplication = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const reviewNote = String(req.body.review_note || '').trim() || null;

    await db.query('BEGIN');

    const applicationResult = await db.query(
      `SELECT
         pla.*,
         u.full_name,
         u.email,
         u.phone,
         u.nationality,
         u.chamber_name,
         u.chamber_phone
       FROM platform_lawyer_applications pla
       JOIN users u ON u.id = pla.lawyer_user_id
       WHERE pla.id = $1
       FOR UPDATE`,
      [req.params.applicationId]
    );

    if (!applicationResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const application = applicationResult.rows[0];
    const previousStatus = application.status;

    let platformLawyerResult = await db.query(
      `SELECT *
       FROM platform_lawyers
       WHERE lawyer_user_id = $1
          OR LOWER(email) = LOWER($2)
       ORDER BY CASE source_type WHEN 'manual' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [application.lawyer_user_id, application.email]
    );

    let platformLawyer;

    if (platformLawyerResult.rows.length) {
      platformLawyer = (
        await db.query(
          `UPDATE platform_lawyers
           SET lawyer_user_id = $2,
               application_id = $3,
               full_name = $4,
               email = $5,
               phone = $6,
               nationality = $7,
               chamber_name = $8,
               chamber_phone = $9,
               is_active = TRUE,
               updated_by = $10,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [
            platformLawyerResult.rows[0].id,
            application.lawyer_user_id,
            application.id,
            application.full_name,
            application.email,
            application.phone,
            application.nationality || 'Nigeria',
            application.chamber_name,
            application.chamber_phone,
            req.user.id,
          ]
        )
      ).rows[0];
    } else {
      platformLawyer = (
        await db.query(
          `INSERT INTO platform_lawyers (
             source_type,
             lawyer_user_id,
             application_id,
             full_name,
             email,
             phone,
             nationality,
             chamber_name,
             chamber_phone,
             is_active,
             created_by,
             updated_by
           )
           VALUES ('application', $1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9)
           RETURNING *`,
          [
            application.lawyer_user_id,
            application.id,
            application.full_name,
            application.email,
            application.phone,
            application.nationality || 'Nigeria',
            application.chamber_name,
            application.chamber_phone,
            req.user.id,
          ]
        )
      ).rows[0];
    }

    await db.query(
      `UPDATE platform_lawyer_applications
       SET status = 'approved',
           review_note = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        application.id,
        reviewNote,
        req.user.id,
      ]
    );

    await createPlatformLawyerApplicationOperation({
      applicationId: application.id,
      adminId: req.user.id,
      actorName: getPlatformLawyerActorName(req.user),
      eventType: 'application_approved',
      note: reviewNote,
      metadata: {
        old_status: previousStatus,
        new_status: 'approved',
        platform_lawyer_id: platformLawyer.id,
      },
    });

    await db.query('COMMIT');
    await logAction(req.user.id, 'APPROVE_PLATFORM_LAWYER_APPLICATION', 'platform_lawyer_application', application.id);

    res.json({
      success: true,
      data: {
        application_id: application.id,
        platform_lawyer_id: platformLawyer.id,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK');
    req.logger.error('Approve platform lawyer application error:', error);
    res.status(500).json({ message: 'Failed to approve lawyer application' });
  }
};

const rejectPlatformLawyerApplication = async (req, res) => {
  try {
    await ensurePlatformLawyerSchema();

    const reviewNote = String(req.body.review_note || '').trim();

    if (!reviewNote) {
      return res.status(400).json({ message: 'A rejection reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT id, status
       FROM platform_lawyer_applications
       WHERE id = $1
       FOR UPDATE`,
      [req.params.applicationId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const previousStatus = existingResult.rows[0].status;

    const applicationResult = await db.query(
      `UPDATE platform_lawyer_applications
       SET status = 'rejected',
           review_note = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [
        req.params.applicationId,
        reviewNote,
        req.user.id,
      ]
    );

    if (!applicationResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    await db.query(
      `UPDATE platform_lawyers
       SET is_active = FALSE,
           updated_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE application_id = $1
         AND source_type = 'application'`,
      [req.params.applicationId, req.user.id]
    );

    await createPlatformLawyerApplicationOperation({
      applicationId: Number(req.params.applicationId),
      adminId: req.user.id,
      actorName: getPlatformLawyerActorName(req.user),
      eventType: 'application_rejected',
      note: reviewNote,
      metadata: {
        old_status: previousStatus,
        new_status: 'rejected',
      },
    });

    await db.query('COMMIT');

    await logAction(req.user.id, 'REJECT_PLATFORM_LAWYER_APPLICATION', 'platform_lawyer_application', req.params.applicationId);

    res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    req.logger.error('Reject platform lawyer application error:', error);
    res.status(500).json({ message: 'Failed to reject lawyer application' });
  }
};

const getPlatformAgentManagementData = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const { rows } = await db.query(
      `SELECT
         pa.*,
         pa.agent_user_id AS linked_user_id,
         COALESCE(NULLIF(u.full_name, ''), pa.full_name) AS display_name,
         COALESCE(NULLIF(u.email, ''), pa.email) AS display_email,
         COALESCE(NULLIF(u.phone, ''), pa.phone) AS display_phone,
         COALESCE(NULLIF(u.nationality, ''), pa.nationality, 'Nigeria') AS display_nationality,
         creator.full_name AS created_by_name,
         updater.full_name AS updated_by_name
       FROM platform_agents pa
       LEFT JOIN users u ON u.id = pa.agent_user_id
       LEFT JOIN users creator ON creator.id = pa.created_by
       LEFT JOIN users updater ON updater.id = pa.updated_by
       ORDER BY pa.created_at DESC`
    );

    const agentIds = rows.map((entry) => entry.id);
    let operationsByAgent = {};

    if (agentIds.length) {
      const operationsResult = await db.query(
        `SELECT
           id,
           agent_id,
           admin_id,
           actor_name,
           event_type,
           note,
           agent_snapshot,
           metadata,
           created_at
         FROM platform_agent_operations
         WHERE agent_id = ANY($1::int[])
         ORDER BY created_at DESC, id DESC`,
        [agentIds]
      );

      operationsByAgent = operationsResult.rows.reduce((acc, operation) => {
        if (!acc[operation.agent_id]) {
          acc[operation.agent_id] = [];
        }
        acc[operation.agent_id].push(operation);
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: {
        entries: rows.map((entry) => ({
          ...entry,
          operations: operationsByAgent[entry.id] || [],
        })),
      },
    });
  } catch (error) {
    req.logger.error('Get platform agent management data error:', error);
    res.status(500).json({ message: 'Failed to load platform agents' });
  }
};

const getPlatformAgentActorName = (user = {}) =>
  user.full_name || user.name || user.email || `Admin #${user.id || 'unknown'}`;

const createPlatformAgentOperation = async ({
  agentId = null,
  adminId,
  actorName,
  eventType,
  note = null,
  agentSnapshot = {},
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO platform_agent_operations (
       agent_id,
       admin_id,
       actor_name,
       event_type,
       note,
       agent_snapshot,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      agentId,
      adminId || null,
      actorName || null,
      eventType,
      note || null,
      JSON.stringify(agentSnapshot || {}),
      JSON.stringify(metadata || {}),
    ]
  );
};

const createManualPlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const nationality = String(req.body.nationality || 'Nigeria').trim();
    const isActive = req.body.is_active !== false;

    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    const userResult = await db.query(
      `SELECT id
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND user_type = 'agent'
         AND deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    const linkedUserId = userResult.rows[0]?.id || null;

    const duplicateResult = await db.query(
      `SELECT id
       FROM platform_agents
       WHERE LOWER(email) = LOWER($1)
          OR ($2::INTEGER IS NOT NULL AND agent_user_id = $2)
       LIMIT 1`,
      [email, linkedUserId]
    );

    if (duplicateResult.rows.length) {
      return res.status(409).json({ message: 'This platform agent already exists' });
    }

    const { rows } = await db.query(
      `INSERT INTO platform_agents (
         source_type, agent_user_id, full_name, email, phone, nationality,
         is_active, created_by, updated_by
       )
       VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        linkedUserId,
        fullName,
        email,
        phone || null,
        nationality || 'Nigeria',
        isActive,
        req.user.id,
      ]
    );

    await createPlatformAgentOperation({
      agentId: rows[0].id,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: 'agent_created',
      note: String(req.body.governance_note || '').trim() || null,
      agentSnapshot: rows[0],
      metadata: {
        source_type: rows[0].source_type,
        is_active: rows[0].is_active,
      },
    });

    await logAction(req.user.id, 'CREATE_PLATFORM_AGENT', 'platform_agent', rows[0].id);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    req.logger.error('Create platform agent error:', error);
    res.status(500).json({ message: 'Failed to create platform agent record' });
  }
};

const updatePlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const agentId = Number(req.params.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ message: 'Invalid platform agent id' });
    }

    const nextActive = req.body.is_active !== false;
    const governanceNote = String(req.body.governance_note || req.body.reason || req.body.note || '').trim();

    const existingResult = await db.query(
      `SELECT *
       FROM platform_agents
       WHERE id = $1`,
      [agentId]
    );

    if (!existingResult.rows.length) {
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    const existing = existingResult.rows[0];

    if (existing.is_active !== nextActive && !governanceNote) {
      return res.status(400).json({
        message: nextActive
          ? 'An activation reason is required'
          : 'A deactivation reason is required',
      });
    }

    const result = await db.query(
      `UPDATE platform_agents
       SET is_active = $2,
           updated_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [agentId, nextActive, req.user.id]
    );

    const updated = result.rows[0];

    await createPlatformAgentOperation({
      agentId,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: nextActive ? 'agent_activated' : 'agent_deactivated',
      note: governanceNote || null,
      agentSnapshot: updated,
      metadata: {
        old_is_active: existing.is_active,
        new_is_active: updated.is_active,
      },
    });

    await logAction(req.user.id, 'UPDATE_PLATFORM_AGENT', 'platform_agent', agentId);

    res.json({ success: true, data: updated });
  } catch (error) {
    req.logger.error('Update platform agent error:', error);
    res.status(500).json({ message: 'Failed to update platform agent record' });
  }
};

const deletePlatformAgent = async (req, res) => {
  try {
    await ensurePlatformAgentSchema();

    const agentId = Number(req.params.agentId);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ message: 'Invalid platform agent id' });
    }

    const governanceNote = String(req.body.governance_note || req.body.reason || req.body.note || '').trim();

    if (!governanceNote) {
      return res.status(400).json({ message: 'A deletion reason is required' });
    }

    await db.query('BEGIN');

    const existingResult = await db.query(
      `SELECT *
       FROM platform_agents
       WHERE id = $1
       FOR UPDATE`,
      [agentId]
    );

    if (!existingResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    const existing = existingResult.rows[0];

    await createPlatformAgentOperation({
      agentId,
      adminId: req.user.id,
      actorName: getPlatformAgentActorName(req.user),
      eventType: 'agent_deleted',
      note: governanceNote,
      agentSnapshot: existing,
      metadata: {
        source_type: existing.source_type,
        was_active: existing.is_active,
      },
    });

    const result = await db.query(
      `DELETE FROM platform_agents WHERE id = $1 RETURNING id`,
      [agentId]
    );

    if (!result.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Platform agent not found' });
    }

    await db.query('COMMIT');

    await logAction(req.user.id, 'DELETE_PLATFORM_AGENT', 'platform_agent', agentId);

    res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    req.logger.error('Delete platform agent error:', error);
    res.status(500).json({ message: 'Failed to delete platform agent record' });
  }
};


module.exports = {
  createPlatformLawyerApplicationOperation,
  ensurePlatformLawyerOperationSchema,
  createPlatformLawyerOperation,
  getPlatformLawyerManagementData,
  createManualPlatformLawyer,
  resendManualPlatformLawyerInvite,
  updatePlatformLawyer,
  deletePlatformLawyer,
  createPlatformLawyerRecruitmentBroadcast,
  approvePlatformLawyerApplication,
  rejectPlatformLawyerApplication,
  getPlatformAgentManagementData,
  createPlatformAgentOperation,
  createManualPlatformAgent,
  updatePlatformAgent,
  deletePlatformAgent,
};

