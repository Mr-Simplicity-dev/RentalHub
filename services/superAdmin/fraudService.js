const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const jwt = require('jsonwebtoken');
const {
  ensureVerificationAuditSchema,
  ensureUserSuspensionSchema,
  ensureAdminAccountOperationSchema,
  ensureIdentityVerificationOperationSchema,
  createAdminAccountOperation,
  createIdentityVerificationOperation,
  buildDeletedEmail,
  buildDeletedUniqueValue,
  logAction,
  getDashboardPathForRole,
} = require('./schemaHelpers');
const {
  ensureLawyerCaseNotesSchema,
} = require('../../config/utils/legalSchema');
const {
  createRegistrationAccessRule,
  listRegistrationAccessRules,
  updateRegistrationAccessRule,
  deleteRegistrationAccessRule,
  getRegistrationAccessTargets,
} = require('../../config/utils/registrationAccess');
const {
  createLocationPricingRule,
  deleteLocationPricingRule,
  updateLocationPricingRule,
  listLocationPricingRules,
  getPricingTargets,
} = require('../../config/utils/locationPricing');

// fraud
const ensureFraudOperationSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fraud_flag_operations (
      id SERIAL PRIMARY KEY,
      fraud_flag_id INTEGER REFERENCES fraud_flags(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(255),
      event_type VARCHAR(80) NOT NULL,
      note TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_flag
      ON fraud_flag_operations(fraud_flag_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fraud_flag_operations_created
      ON fraud_flag_operations(created_at DESC)
  `);
};

const createFraudFlagOperation = async ({
  fraudFlagId,
  actor,
  eventType,
  note,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO fraud_flag_operations (
       fraud_flag_id, actor_id, actor_name, event_type, note, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      fraudFlagId,
      actor?.id || null,
      getAdminOperationActorName(actor),
      eventType,
      note || null,
      JSON.stringify(metadata || {}),
    ]
  );
};

const getFraudFlags = async (req, res) => {
  try {
    await ensureFraudOperationSchema();

    const { rows } = await db.query(
      `SELECT ff.*,
              COALESCE(ops.operations, '[]'::json) AS operations
       FROM fraud_flags ff
       LEFT JOIN LATERAL (
         SELECT json_agg(row_to_json(operation_rows) ORDER BY operation_rows.created_at DESC, operation_rows.id DESC) AS operations
         FROM (
           SELECT id, actor_id, actor_name, event_type, note, metadata, created_at
           FROM fraud_flag_operations
           WHERE fraud_flag_id = ff.id
           ORDER BY created_at DESC, id DESC
           LIMIT 3
         ) operation_rows
       ) ops ON TRUE
       WHERE ff.resolved = FALSE
       ORDER BY score DESC, created_at DESC`
    );


    res.json({ success: true, flags: rows });

  } catch {

    res.status(500).json({ message: 'Failed to load fraud flags' });

  }

};



const resolveFraudFlag = async (req, res) => {
  const { id } = req.params;
  const note = String(req.body?.note || req.body?.reason || '').trim();

  try {
    await ensureFraudOperationSchema();

    if (!note) {
      return res.status(400).json({ message: 'A fraud resolution note is required' });
    }

    const existing = await db.query(`SELECT * FROM fraud_flags WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Fraud flag not found' });
    }

    await db.query(`UPDATE fraud_flags SET resolved = TRUE WHERE id = $1`, [id]);

    await createFraudFlagOperation({
      fraudFlagId: Number(id),
      actor: req.user,
      eventType: 'fraud_flag_resolved',
      note,
      metadata: {
        entity_type: existing.rows[0].entity_type,
        entity_id: existing.rows[0].entity_id,
        rule: existing.rows[0].rule,
        score: existing.rows[0].score,
      },
    });

    await logAction(req.user.id, 'RESOLVE_FRAUD_FLAG', 'fraud', id);

    res.json({ success: true });
  } catch (err) {
    req.logger.error('Resolve fraud flag error:', err);
    res.status(500).json({ message: 'Failed to resolve fraud flag' });
  }
};


const getRangeStart = (timeRange) => {

  const now = Date.now();



  switch (String(timeRange || '7days')) {

    case '24h':

      return new Date(now - 24 * 60 * 60 * 1000);

    case '30days':

      return new Date(now - 30 * 24 * 60 * 60 * 1000);

    case '90days':

      return new Date(now - 90 * 24 * 60 * 60 * 1000);

    case 'all':

      return null;

    case '7days':

    default:

      return new Date(now - 7 * 24 * 60 * 60 * 1000);

  }

};



const getLawyerActivities = async (req, res) => {

  try {

    await ensureLawyerCaseNotesSchema();



    const timeRange = String(req.query.time_range || '7days');

    const rangeStart = getRangeStart(timeRange);



    const lawyersResult = await db.query(

      `SELECT

         id,

         full_name,

         email,

         phone,

         chamber_name,

         identity_verified,

         created_at

       FROM users

       WHERE user_type = 'lawyer'

       ORDER BY created_at DESC`

    );



    const lawyers = lawyersResult.rows;

    if (!lawyers.length) {

      return res.json({

        success: true,

        data: {

          lawyers: [],

          stats: {

            totalLawyers: 0,

            activeLawyers: 0,

            totalVerifications: 0,

            totalResolutions: 0,

            avgResponseTime: 0,

          },

          time_range: timeRange,

        },

      });

    }



    const verificationsPromise = db.query(

      `SELECT

         verified_by AS lawyer_user_id,

         COUNT(*)::INT AS total_verifications

       FROM dispute_evidence

       WHERE verified_by IS NOT NULL

         ${rangeStart ? 'AND verified_at >= $1' : ''}

       GROUP BY verified_by`,

      rangeStart ? [rangeStart] : []

    );



    const resolutionsPromise = db.query(

      `SELECT

         resolved_by AS lawyer_user_id,

         COUNT(*)::INT AS total_resolutions

       FROM disputes

       WHERE resolved_by IS NOT NULL

         ${rangeStart ? 'AND resolved_at >= $1' : ''}

       GROUP BY resolved_by`,

      rangeStart ? [rangeStart] : []

    );



    const notesPromise = db.query(

      `SELECT

         lawyer_user_id,

         COUNT(*)::INT AS total_case_notes

       FROM lawyer_case_notes

       WHERE 1 = 1

         ${rangeStart ? 'AND created_at >= $1' : ''}

       GROUP BY lawyer_user_id`,

      rangeStart ? [rangeStart] : []

    );



    const authorizationsPromise = db.query(

      `SELECT

         lawyer_user_id,

         COUNT(DISTINCT property_id)::INT AS active_authorizations

       FROM legal_authorizations

       WHERE status = 'active'

         AND property_id IS NOT NULL

       GROUP BY lawyer_user_id`

    );



    const activeDisputesPromise = db.query(

      `SELECT

         la.lawyer_user_id,

         COUNT(DISTINCT d.id)::INT AS active_disputes

       FROM legal_authorizations la

       JOIN disputes d

         ON (

           la.property_id = d.property_id

           OR (

             la.property_id IS NULL

             AND la.client_user_id IN (d.opened_by, d.against_user)

           )

         )

       WHERE la.status = 'active'

         AND COALESCE(d.status, 'open') <> 'resolved'

       GROUP BY la.lawyer_user_id`

    );



    const activityPromise = db.query(

      `SELECT

         activity.lawyer_user_id,

         MAX(activity.happened_at) AS last_activity_at,

         MIN(activity.happened_at) AS first_activity_at

       FROM (

         SELECT verified_by AS lawyer_user_id, verified_at AS happened_at

         FROM dispute_evidence

         WHERE verified_by IS NOT NULL

           ${rangeStart ? 'AND verified_at >= $1' : ''}

         UNION ALL

         SELECT resolved_by AS lawyer_user_id, resolved_at AS happened_at

         FROM disputes

         WHERE resolved_by IS NOT NULL

           ${rangeStart ? 'AND resolved_at >= $1' : ''}

         UNION ALL

         SELECT lawyer_user_id, created_at AS happened_at

         FROM lawyer_case_notes

         WHERE 1 = 1

           ${rangeStart ? 'AND created_at >= $1' : ''}

       ) activity

       GROUP BY activity.lawyer_user_id`,

      rangeStart ? [rangeStart] : []

    );



    const firstAssignedPromise = db.query(

      `SELECT

         lawyer_user_id,

         MIN(created_at) AS first_assigned_at

       FROM legal_authorizations

       WHERE status = 'active'

       GROUP BY lawyer_user_id`

    );



    const [

      verificationsResult,

      resolutionsResult,

      notesResult,

      authorizationsResult,

      activeDisputesResult,

      activityResult,

      firstAssignedResult,

    ] = await Promise.all([

      verificationsPromise,

      resolutionsPromise,

      notesPromise,

      authorizationsPromise,

      activeDisputesPromise,

      activityPromise,

      firstAssignedPromise,

    ]);



    const toNumberMap = (rows, key, valueKey) =>

      new Map(rows.map((row) => [Number(row[key]), Number(row[valueKey] || 0)]));

    const toDateMap = (rows, key, valueKey) =>

      new Map(rows.map((row) => [Number(row[key]), row[valueKey] || null]));



    const verificationsMap = toNumberMap(verificationsResult.rows, 'lawyer_user_id', 'total_verifications');

    const resolutionsMap = toNumberMap(resolutionsResult.rows, 'lawyer_user_id', 'total_resolutions');

    const notesMap = toNumberMap(notesResult.rows, 'lawyer_user_id', 'total_case_notes');

    const authorizationsMap = toNumberMap(authorizationsResult.rows, 'lawyer_user_id', 'active_authorizations');

    const activeDisputesMap = toNumberMap(activeDisputesResult.rows, 'lawyer_user_id', 'active_disputes');

    const lastActivityMap = toDateMap(activityResult.rows, 'lawyer_user_id', 'last_activity_at');

    const firstActivityMap = toDateMap(activityResult.rows, 'lawyer_user_id', 'first_activity_at');

    const firstAssignedMap = toDateMap(firstAssignedResult.rows, 'lawyer_user_id', 'first_assigned_at');



    const lawyerRows = lawyers.map((lawyer) => {

      const lawyerId = Number(lawyer.id);

      const firstAssignedAt = firstAssignedMap.get(lawyerId);

      const firstActivityAt = firstActivityMap.get(lawyerId);



      let avgResponseMinutes = null;

      if (firstAssignedAt && firstActivityAt) {

        const assignedTime = new Date(firstAssignedAt).getTime();

        const activityTime = new Date(firstActivityAt).getTime();

        if (!Number.isNaN(assignedTime) && !Number.isNaN(activityTime) && activityTime >= assignedTime) {

          avgResponseMinutes = Math.round((activityTime - assignedTime) / 60000);

        }

      }



      return {

        ...lawyer,

        total_verifications: verificationsMap.get(lawyerId) || 0,

        total_resolutions: resolutionsMap.get(lawyerId) || 0,

        total_case_notes: notesMap.get(lawyerId) || 0,

        active_authorizations: authorizationsMap.get(lawyerId) || 0,

        active_disputes: activeDisputesMap.get(lawyerId) || 0,

        last_activity_at: lastActivityMap.get(lawyerId),

        avg_response_minutes: avgResponseMinutes,

      };

    });



    const responseTimes = lawyerRows

      .map((lawyer) => lawyer.avg_response_minutes)

      .filter((value) => Number.isFinite(value) && value >= 0);



    const stats = {

      totalLawyers: lawyerRows.length,

      activeLawyers: lawyerRows.filter(

        (lawyer) =>

          lawyer.total_verifications > 0 ||

          lawyer.total_resolutions > 0 ||

          lawyer.total_case_notes > 0

      ).length,

      totalVerifications: lawyerRows.reduce((sum, lawyer) => sum + lawyer.total_verifications, 0),

      totalResolutions: lawyerRows.reduce((sum, lawyer) => sum + lawyer.total_resolutions, 0),

      avgResponseTime: responseTimes.length

        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)

        : 0,

    };



    res.json({

      success: true,

      data: {

        lawyers: lawyerRows,

        stats,

        time_range: timeRange,

      },

    });

  } catch (error) {

    req.logger.error('Get lawyer activities error:', error);

    res.status(500).json({ message: 'Failed to load lawyer activities' });

  }

};



// Send verification reminder notification to a user

const sendUserVerificationReminder = async (req, res) => {

  try {

    const { userId } = req.params;

    const { message } = req.body;



    if (!userId) {

      return res.status(400).json({ success: false, message: 'User ID is required' });

    }



    // Verify user exists

    const userResult = await db.query(

      `SELECT id, full_name, email, email_verified, phone_verified,

              nin, nin_verified, passport_photo_url,

              international_passport_number, identity_verified,

              identity_verification_status

       FROM users WHERE id = $1 AND deleted_at IS NULL`,

      [userId]

    );



    if (!userResult.rows.length) {

      return res.status(404).json({ success: false, message: 'User not found' });

    }



    const user = userResult.rows[0];



    // Build a detailed message if none provided

    const steps = [];

    if (!user.email_verified) steps.push('Verify your email address');

    if (!user.phone_verified) steps.push('Verify your phone number');

    if (!user.passport_photo_url) steps.push('Upload your identity document (passport photo)');

    if (!user.nin && !user.international_passport_number) steps.push('Provide your NIN or International Passport number');



    const finalMessage = message || (

      steps.length > 0

        ? `You have pending verification steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nPlease complete these steps to proceed.`

        : 'Your account verification is complete. No action needed at this time.'

    );



    // Create the notification using the utility

    const { createNotification } = require('../../config/utils/notificationService');

    await createNotification(

      Number(userId),

      'verification_reminder',

      'Verification Reminder from Admin',

      finalMessage,

      '/verification-status'

    );



    res.json({

      success: true,

      message: 'Verification reminder sent to user successfully'

    });

  } catch (error) {

    req.logger.error('Send verification reminder error:', error);

    res.status(500).json({ success: false, message: 'Failed to send verification reminder' });

  }

};



module.exports = {
  ensureFraudOperationSchema,
  createFraudFlagOperation,
  getFraudFlags,
  resolveFraudFlag,
  getLawyerActivities,
  sendUserVerificationReminder,
};

