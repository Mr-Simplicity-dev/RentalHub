const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../config/middleware/database');
const { clearAuthCookies } = require('../config/utils/authCookies');
const { logAction } = require('../config/utils/auditLogger');

const DIRECT_EXPORT_SOURCES = [
  { key: 'properties', table: 'properties', column: 'landlord_id' },
  {
    key: 'payments',
    table: 'payments',
    column: 'user_id',
    select: `id, user_id, payment_type, amount, currency, property_id,
             subscription_duration_days, payment_method, transaction_reference,
             payment_status, created_at, completed_at`,
  },
  { key: 'applications', table: 'applications', column: 'tenant_id' },
  { key: 'saved_properties', table: 'saved_properties', column: 'tenant_id' },
  { key: 'reviews', table: 'reviews', column: 'tenant_id' },
  { key: 'notifications', table: 'notifications', column: 'user_id' },
  { key: 'property_views', table: 'property_views', column: 'viewer_id' },
  { key: 'wallet_transactions', table: 'wallet_transactions', column: 'user_id' },
  { key: 'user_tour_state', table: 'user_tour_states', column: 'user_id' },
  { key: 'user_tour_events', table: 'user_tour_events', column: 'user_id' },
  { key: 'fumigation_bookings', table: 'fumigation_cleaning_bookings', column: 'tenant_id' },
  { key: 'transportation_bookings', table: 'transportation_bookings', column: 'tenant_id' },
  { key: 'commission_ledger', table: 'agent_commission_ledger', column: 'agent_user_id' },
  {
    key: 'notification_preferences',
    table: 'user_notification_preferences',
    column: 'user_id',
  },
  {
    key: 'push_devices',
    table: 'push_device_tokens',
    column: 'user_id',
    // Expo push tokens are delivery credentials and are intentionally omitted.
    select: 'id, user_id, platform, device_id, enabled, last_seen_at, created_at, updated_at',
  },
  {
    key: 'mobile_crash_reports',
    table: 'mobile_crash_reports',
    column: 'user_id',
    // Raw stack traces can contain source and infrastructure details.
    select: 'id, message, platform, app_version, route_name, metadata, created_at',
  },
  {
    key: 'credential_revalidation_requests',
    table: 'credential_revalidation_requests',
    column: 'user_id',
    select: `id, user_id, requested_fields, reason, instructions, status, due_at,
             pending_identity_type, pending_nationality, submitted_at,
             reviewed_at, created_at, updated_at`,
  },
];

const NON_ESSENTIAL_DELETE_TARGETS = [
  { table: 'saved_properties', columns: ['tenant_id'] },
  { table: 'property_views', columns: ['viewer_id'] },
  { table: 'user_tour_states', columns: ['user_id'] },
  { table: 'user_tour_events', columns: ['user_id'] },
  { table: 'notifications', columns: ['user_id'] },
  { table: 'call_sessions', columns: ['caller_id', 'receiver_id'] },
  { table: 'push_device_tokens', columns: ['user_id'] },
  { table: 'user_notification_preferences', columns: ['user_id'] },
  { table: 'mobile_crash_reports', columns: ['user_id'] },
  { table: 'landlord_agents', columns: ['landlord_user_id', 'agent_user_id'] },
  { table: 'agent_invites', columns: ['landlord_user_id', 'agent_user_id'] },
  { table: 'lawyer_invites', columns: ['client_user_id', 'lawyer_user_id'] },
];

const RECRUITMENT_CHILD_EXPORTS = [
  {
    key: 'documents',
    table: 'recruitment_documents',
    select: `child.id, child.application_id, child.document_type, child.file_name,
             child.file_size, child.mime_type, child.uploaded_at`,
  },
  {
    key: 'interview_answers',
    table: 'recruitment_interview_assignments',
    select: `child.id, child.application_id, child.question_id, child.question_order,
             child.answer_given, child.is_correct, child.answered_at`,
  },
  {
    key: 'interview_recordings',
    table: 'recruitment_interview_recordings',
    select: `child.id, child.application_id, child.recording_duration,
             child.violation_log, child.created_at`,
  },
  {
    key: 'application_history',
    table: 'recruitment_application_operations',
    select: `child.id, child.application_id, child.event_type, child.note,
             child.metadata, child.created_at`,
  },
];

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const quoteIdentifier = (identifier) => {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error('Unsafe SQL identifier');
  }
  return `"${identifier}"`;
};

const createTableInspector = (queryable) => {
  const cache = new Map();

  return async (tableName) => {
    quoteIdentifier(tableName);
    if (!cache.has(tableName)) {
      cache.set(
        tableName,
        queryable
          .query(
            `SELECT EXISTS (
               SELECT 1
               FROM information_schema.tables
               WHERE table_name = $1
                 AND table_schema = ANY(current_schemas(FALSE))
             ) AS exists`,
            [tableName]
          )
          .then((result) => result.rows[0]?.exists === true)
      );
    }
    return cache.get(tableName);
  };
};

const collectTableData = async (
  queryable,
  tableExists,
  { table, column, select = '*' },
  userId
) => {
  if (!(await tableExists(table))) return null;
  const result = await queryable.query(
    `SELECT ${select}
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(column)} = $1`,
    [userId]
  );
  return result.rows;
};

const collectPartyData = async (
  queryable,
  tableExists,
  table,
  firstColumn,
  secondColumn,
  userId,
  select = '*'
) => {
  if (!(await tableExists(table))) {
    return { first: null, second: null };
  }

  const first = await queryable.query(
    `SELECT ${select}
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(firstColumn)} = $1`,
    [userId]
  );
  const second = await queryable.query(
    `SELECT ${select}
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(secondColumn)} = $1`,
    [userId]
  );
  return { first: first.rows, second: second.rows };
};

const collectRecruitmentData = async (queryable, tableExists, userId) => {
  if (!(await tableExists('recruitment_applications'))) {
    return null;
  }

  const applications = await queryable.query(
    `SELECT id, user_id, cycle_id, role_id,
            full_name, phone_number, email_address, state_name, lga_name,
            area_locality, residential_address, date_of_birth,
            highest_education, years_of_experience, current_employment_status,
            skills_qualifications, suitability_reason,
            application_fee, payment_status, payment_reference, payment_date,
            access_code_used, access_code_sent_email,
            access_code_sent_sms, application_track,
            status, shortlist_reason, current_stage, reviewed_at,
            interview_date, interview_activated, interview_score,
            interview_passed, interview_completed, interview_started_at,
            interview_completed_at,
            disqualified_reason, disqualified_at, violation_detected,
            violation_details, documents_emailed, documents_emailed_at,
            reference_number, created_at, updated_at
     FROM recruitment_applications
     WHERE user_id = $1`,
    [userId]
  );
  const data = { applications: applications.rows };

  for (const child of RECRUITMENT_CHILD_EXPORTS) {
    if (!(await tableExists(child.table))) {
      data[child.key] = null;
      continue;
    }
    const result = await queryable.query(
      `SELECT ${child.select}
       FROM ${quoteIdentifier(child.table)} child
       WHERE child.application_id IN (
         SELECT id FROM recruitment_applications WHERE user_id = $1
       )`,
      [userId]
    );
    data[child.key] = result.rows;
  }

  return data;
};

const collectSupportData = async (queryable, tableExists, userId) => {
  if (!(await tableExists('support_tickets'))) return null;

  const tickets = await queryable.query(
    `SELECT id, subject, description, state, lga, contact_email, priority, status,
            category, related_type, related_id, escalation_department,
            escalation_status, sla_due_at, last_escalated_at, resolution_summary,
            escalated_at, resolved_at, created_at, updated_at
     FROM support_tickets
     WHERE user_id = $1`,
    [userId]
  );
  let replies = null;

  if (await tableExists('support_ticket_replies')) {
    const replyResult = await queryable.query(
      `SELECT reply.id, reply.ticket_id,
              CASE WHEN reply.user_id = $1 THEN reply.user_id ELSE NULL END AS user_id,
              reply.author_name, reply.message, reply.is_admin,
              reply.attachment_url, reply.attachment_name, reply.attachment_type,
              reply.edited_at, reply.read_at, reply.created_at
       FROM support_ticket_replies reply
       INNER JOIN support_tickets ticket ON ticket.id = reply.ticket_id
       WHERE ticket.user_id = $1`,
      [userId]
    );
    replies = replyResult.rows;
  }

  return { tickets: tickets.rows, replies };
};

const collectMarketingData = async (
  queryable,
  tableExists,
  userId,
  accountEmail,
  accountPhone
) => {
  const data = {
    email_subscription: null,
    email_deliveries: null,
    sms_subscription: null,
    sms_deliveries: null,
  };

  if (await tableExists('email_subscribers')) {
    const emailResult = await queryable.query(
      `SELECT id, email, full_name, source, source_id, user_type, tags,
              subscribed, unsubscribed_at, created_at, updated_at
       FROM email_subscribers
       WHERE (source = 'user' AND source_id = $1)
          OR LOWER(email) = LOWER($2)`,
      [userId, accountEmail]
    );
    data.email_subscription = emailResult.rows;

    if (await tableExists('email_campaign_recipients')) {
      const deliveries = await queryable.query(
        `SELECT recipient.id, recipient.campaign_id, recipient.status,
                recipient.sent_at, recipient.opened_at, recipient.clicked_at,
                recipient.created_at
         FROM email_campaign_recipients recipient
         WHERE LOWER(recipient.email) = LOWER($2)
            OR recipient.subscriber_id IN (
              SELECT id
              FROM email_subscribers
              WHERE (source = 'user' AND source_id = $1)
                 OR LOWER(email) = LOWER($2)
            )`,
        [userId, accountEmail]
      );
      data.email_deliveries = deliveries.rows;
    }
  }

  if (await tableExists('sms_subscribers')) {
    const smsResult = await queryable.query(
      `SELECT id, phone, full_name, source, source_id, user_type, tags,
              subscribed, unsubscribed_at, created_at, updated_at
       FROM sms_subscribers
       WHERE (source = 'user' AND source_id = $1)
          OR phone = $2`,
      [userId, accountPhone]
    );
    data.sms_subscription = smsResult.rows;

    if (await tableExists('sms_campaign_recipients')) {
      const deliveries = await queryable.query(
        `SELECT recipient.id, recipient.campaign_id, recipient.status,
                recipient.sent_at, recipient.created_at
         FROM sms_campaign_recipients recipient
         WHERE recipient.phone = $2
            OR recipient.subscriber_id IN (
              SELECT id
              FROM sms_subscribers
              WHERE (source = 'user' AND source_id = $1)
                 OR phone = $2
            )`,
        [userId, accountPhone]
      );
      data.sms_deliveries = deliveries.rows;
    }
  }

  return data;
};

const deleteRowsForUser = async (queryable, tableExists, target, userId) => {
  if (!(await tableExists(target.table))) return;
  const where = target.columns
    .map((column) => `${quoteIdentifier(column)} = $1`)
    .join(' OR ');
  await queryable.query(
    `DELETE FROM ${quoteIdentifier(target.table)} WHERE ${where}`,
    [userId]
  );
};

const redactSupportData = async (queryable, tableExists, userId) => {
  if (!(await tableExists('support_tickets'))) return [];

  const attachmentPaths = [];
  if (await tableExists('support_ticket_replies')) {
    const attachments = await queryable.query(
      `SELECT attachment_url
       FROM support_ticket_replies
       WHERE attachment_url IS NOT NULL
         AND (
           user_id = $1
           OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1)
         )`,
      [userId]
    );
    attachmentPaths.push(
      ...attachments.rows.map((row) => row.attachment_url).filter(Boolean)
    );
    await queryable.query(
      `UPDATE support_ticket_replies
       SET message = '[redacted]',
           author_name = CASE WHEN user_id = $1 THEN '[redacted]' ELSE author_name END,
           attachment_url = NULL,
           attachment_name = NULL,
           attachment_type = NULL
       WHERE user_id = $1
          OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1)`,
      [userId]
    );
  }

  await queryable.query(
    `UPDATE support_tickets
     SET user_id = NULL,
         subject = '[redacted]',
         description = '[redacted]',
         state = NULL,
         lga = NULL,
         contact_email = NULL,
         escalation_note = NULL,
         resolution_summary = NULL,
         guest_access_token_hash = NULL,
         guest_access_token_created_at = NULL,
         guest_access_token_last_used_at = NULL,
         guest_access_token_revoked_at = CURRENT_TIMESTAMP,
         guest_legacy_access_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId]
  );

  return attachmentPaths;
};

const redactRecruitmentData = async (queryable, tableExists, userId) => {
  if (!(await tableExists('recruitment_applications'))) {
    return [];
  }

  const filePaths = [];
  if (await tableExists('recruitment_documents')) {
    const documents = await queryable.query(
      `SELECT child.file_path
       FROM recruitment_documents child
       WHERE child.application_id IN (
         SELECT id FROM recruitment_applications WHERE user_id = $1
       )`,
      [userId]
    );
    filePaths.push(...documents.rows.map((row) => row.file_path).filter(Boolean));
    await queryable.query(
      `DELETE FROM recruitment_documents
       WHERE application_id IN (
         SELECT id FROM recruitment_applications WHERE user_id = $1
       )`,
      [userId]
    );
  }

  if (await tableExists('recruitment_interview_recordings')) {
    const recordings = await queryable.query(
      `SELECT child.recording_path
       FROM recruitment_interview_recordings child
       WHERE child.application_id IN (
         SELECT id FROM recruitment_applications WHERE user_id = $1
       )`,
      [userId]
    );
    filePaths.push(...recordings.rows.map((row) => row.recording_path).filter(Boolean));
  }

  for (const table of ['recruitment_interview_assignments', 'recruitment_interview_recordings']) {
    if (await tableExists(table)) {
      await queryable.query(
        `DELETE FROM ${quoteIdentifier(table)}
         WHERE application_id IN (
           SELECT id FROM recruitment_applications WHERE user_id = $1
         )`,
        [userId]
      );
    }
  }

  if (await tableExists('recruitment_application_operations')) {
    await queryable.query(
      `UPDATE recruitment_application_operations
       SET actor_name = NULL, note = NULL, metadata = '{}'::jsonb
       WHERE application_id IN (
         SELECT id FROM recruitment_applications WHERE user_id = $1
       )`,
      [userId]
    );
  }

  // Payment/status history is retained, while direct applicant identifiers and
  // free-form profile information are removed.
  await queryable.query(
    `UPDATE recruitment_applications
     SET full_name = '[redacted]',
         phone_number = '[redacted]',
         email_address = CONCAT('deleted+', id, '@redacted.invalid'),
         state_name = '[redacted]',
         lga_name = '[redacted]',
         area_locality = '[redacted]',
         residential_address = NULL,
         date_of_birth = NULL,
         highest_education = NULL,
         years_of_experience = NULL,
         current_employment_status = NULL,
         skills_qualifications = NULL,
         suitability_reason = NULL,
         access_code = NULL,
         admin_notes = NULL,
         shortlist_reason = NULL,
         disqualified_reason = NULL,
         violation_details = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId]
  );

  return filePaths;
};

const redactMarketingData = async (
  queryable,
  tableExists,
  userId,
  accountEmail,
  accountPhone
) => {
  if (await tableExists('email_subscribers')) {
    if (await tableExists('email_campaign_recipients')) {
      await queryable.query(
        `UPDATE email_campaign_recipients recipient
         SET email = CONCAT('deleted+', recipient.id, '@redacted.invalid'),
             full_name = NULL,
             error_message = NULL
         WHERE recipient.subscriber_id IN (
           SELECT id
           FROM email_subscribers
           WHERE (source = 'user' AND source_id = $1)
              OR LOWER(email) = LOWER($2)
         )
            OR LOWER(recipient.email) = LOWER($2)`,
        [userId, accountEmail]
      );
    }
    await queryable.query(
      `DELETE FROM email_subscribers
       WHERE (source = 'user' AND source_id = $1)
          OR LOWER(email) = LOWER($2)`,
      [userId, accountEmail]
    );
  }

  if (await tableExists('sms_subscribers')) {
    if (await tableExists('sms_campaign_recipients')) {
      await queryable.query(
        `UPDATE sms_campaign_recipients recipient
         SET phone = CONCAT('deleted-', recipient.id),
             full_name = NULL,
             error_message = NULL
         WHERE recipient.subscriber_id IN (
           SELECT id
           FROM sms_subscribers
           WHERE (source = 'user' AND source_id = $1)
              OR phone = $2
         )
            OR recipient.phone = $2`,
        [userId, accountPhone]
      );
    }
    await queryable.query(
      `DELETE FROM sms_subscribers
       WHERE (source = 'user' AND source_id = $1)
          OR phone = $2`,
      [userId, accountPhone]
    );
  }
};

const anonymizeRetainedRecords = async (queryable, tableExists, userId) => {
  if (await tableExists('messages')) {
    // A deleted user's authored content is redacted. Messages written by the
    // other participant are not destroyed merely because this user received them.
    await queryable.query(
      `UPDATE messages
       SET message_text = '[redacted]'
       WHERE sender_id = $1`,
      [userId]
    );
  }

  if (await tableExists('property_damage_reports')) {
    await queryable.query(
      `UPDATE property_damage_reports
       SET description = '[redacted]'
       WHERE tenant_id = $1`,
      [userId]
    );
  }
};

const redactIdentityWorkflowData = async (queryable, tableExists, userId) => {
  if (await tableExists('credential_revalidation_requests')) {
    await queryable.query(
      `UPDATE credential_revalidation_requests
       SET reason = '[redacted]',
           instructions = NULL,
           status = CASE
             WHEN status IN ('requested', 'submitted', 'rejected') THEN 'cancelled'
             ELSE status
           END,
           baseline_snapshot = '{}'::jsonb,
           submitted_summary = '{}'::jsonb,
           pending_identity_value = NULL,
           pending_identity_hash = NULL,
           pending_identity_type = NULL,
           pending_nationality = NULL,
           verification_metadata = '{}'::jsonb,
           review_note = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );
  }

  if (await tableExists('identity_verification_operations')) {
    await queryable.query(
      `UPDATE identity_verification_operations
       SET note = NULL,
           user_snapshot = '{}'::jsonb,
           metadata = '{}'::jsonb
       WHERE user_id = $1`,
      [userId]
    );
  }

  if (await tableExists('user_account_operations')) {
    await queryable.query(
      `UPDATE user_account_operations
       SET note = NULL,
           metadata = '{}'::jsonb
       WHERE user_id = $1`,
      [userId]
    );
  }
};

const redactUser = async (queryable, userId) => {
  await queryable.query(
    `UPDATE users
     SET email = CONCAT('deleted+', id, '@redacted.invalid'),
         phone = CONCAT('deleted-', id),
         full_name = '[deleted user]',
         nin = NULL,
         nin_hash = NULL,
         international_passport_number = NULL,
         nationality = NULL,
         passport_photo_url = NULL,
         chamber_name = NULL,
         chamber_phone = NULL,
         kyc_metadata = NULL,
         password_hash = 'PURGED',
         identity_document_type = NULL,
         email_verified = FALSE,
         phone_verified = FALSE,
         nin_verified = FALSE,
         identity_verified = FALSE,
         identity_verified_by = NULL,
         identity_verified_at = NULL,
         identity_verification_status = NULL,
         preferred_state_id = NULL,
         preferred_lga_name = NULL,
         assigned_state = NULL,
         assigned_city = NULL,
         account_suspended_reason = NULL,
         account_suspended_at = NULL,
         account_suspended_by = NULL,
         token_version = token_version + 1,
         deleted_at = CURRENT_TIMESTAMP,
         is_active = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
};

const safeDeleteLocalFile = (filePath, allowedDirectory) => {
  if (!filePath || !allowedDirectory) return false;
  const resolvedFile = path.resolve(
    path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath)
  );
  const resolvedDirectory = path.resolve(allowedDirectory);
  const relative = path.relative(resolvedDirectory, resolvedFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  if (!fs.existsSync(resolvedFile)) return true;
  fs.unlinkSync(resolvedFile);
  return true;
};

const deleteLocalMedia = (
  req,
  passportPhotoUrl,
  recruitmentFilePaths,
  supportAttachmentPaths
) => {
  const failures = [];
  const passportDirectory = path.join(__dirname, '..', 'uploads', 'passports');
  const recruitmentDirectory = path.join(__dirname, '..', 'uploads', 'recruitment');
  const supportDirectory = path.join(__dirname, '..', 'uploads', 'tickets');

  if (passportPhotoUrl && !/^https?:\/\//i.test(passportPhotoUrl)) {
    const passportPath = path.join(passportDirectory, path.basename(passportPhotoUrl));
    try {
      safeDeleteLocalFile(passportPath, passportDirectory);
    } catch (error) {
      failures.push('passport');
      req.logger?.warn?.('Failed to remove a local passport file after account purge', {
        error: error.message,
      });
    }
  }

  for (const filePath of recruitmentFilePaths) {
    if (/^https?:\/\//i.test(filePath)) continue;
    try {
      safeDeleteLocalFile(filePath, recruitmentDirectory);
    } catch (error) {
      failures.push('recruitment');
      req.logger?.warn?.('Failed to remove a local recruitment file after account purge', {
        error: error.message,
      });
    }
  }

  for (const filePath of supportAttachmentPaths) {
    if (/^https?:\/\//i.test(filePath)) continue;
    try {
      safeDeleteLocalFile(
        String(filePath).replace(/^[/\\]+/, ''),
        supportDirectory
      );
    } catch (error) {
      failures.push('support');
      req.logger?.warn?.('Failed to remove a local support attachment after account purge', {
        error: error.message,
      });
    }
  }

  return failures;
};

const sendControllerError = (req, res, label, error, fallbackMessage) => {
  req.logger?.error?.(label, error);
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : fallbackMessage,
    ...(error.code ? { code: error.code } : {}),
  });
};

const requestError = (statusCode, message, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

exports.exportPersonalData = async (req, res) => {
  try {
    const userId = req.user.id;
    const tableExists = createTableInspector(db);
    const profileResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, email_verified, phone_verified,
              nin_verified, identity_verified, identity_document_type, nationality,
              identity_verification_status, passport_photo_url,
              subscription_active, subscription_expires_at,
              preferred_state_id, preferred_lga_name, is_active,
              created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (!profileResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const data = { profile: profileResult.rows[0] };
    for (const source of DIRECT_EXPORT_SOURCES) {
      data[source.key] = await collectTableData(db, tableExists, source, userId);
    }

    const messages = await collectPartyData(
      db,
      tableExists,
      'messages',
      'sender_id',
      'receiver_id',
      userId,
      'id, sender_id, receiver_id, property_id, message_text, is_read, created_at'
    );
    data.messages = { sent: messages.first, received: messages.second };

    const disputes = await collectPartyData(
      db,
      tableExists,
      'disputes',
      'complainant_id',
      'respondent_id',
      userId
    );
    data.disputes = {
      as_complainant: disputes.first,
      as_respondent: disputes.second,
    };

    const referrals = await collectPartyData(
      db,
      tableExists,
      'user_referrals',
      'referrer_id',
      'referred_user_id',
      userId
    );
    data.referrals = { given: referrals.first, received: referrals.second };

    const agents = await collectPartyData(
      db,
      tableExists,
      'landlord_agents',
      'landlord_user_id',
      'agent_user_id',
      userId
    );
    data.agent_relationships = {
      as_landlord: agents.first,
      as_agent: agents.second,
    };

    const legalAuthorizations = await collectPartyData(
      db,
      tableExists,
      'legal_authorizations',
      'client_user_id',
      'lawyer_user_id',
      userId
    );
    data.legal_authorizations = legalAuthorizations.first;
    data.lawyer_authorizations = legalAuthorizations.second;

    const calls = await collectPartyData(
      db,
      tableExists,
      'call_sessions',
      'caller_id',
      'receiver_id',
      userId
    );
    data.call_sessions = { as_caller: calls.first, as_receiver: calls.second };
    data.tour = {
      state: data.user_tour_state,
      events: data.user_tour_events,
    };
    delete data.user_tour_state;
    delete data.user_tour_events;

    const recruitment = await collectRecruitmentData(db, tableExists, userId);
    data.recruitments = recruitment?.applications ?? null;
    data.recruitment = recruitment;
    data.support = await collectSupportData(db, tableExists, userId);
    data.marketing = await collectMarketingData(
      db,
      tableExists,
      userId,
      data.profile.email,
      data.profile.phone
    );
    data.exported_at = new Date().toISOString();
    data.export_scope = {
      description:
        'Data linked to this authenticated account in the platform records covered by the automated export.',
      security_exclusions: [
        'password hashes and authentication secrets',
        'full government identity numbers',
        'security-only device fingerprints and challenge tokens',
        'raw push-delivery tokens',
        'raw diagnostic stack traces',
        'internal support notes and security-only records',
      ],
      note:
        'Some records may require a verified manual privacy request when they cannot be safely attributed to one account or contain another person’s protected data.',
    };

    return res.json({
      success: true,
      message: 'Your automated personal-data export is ready.',
      data,
    });
  } catch (error) {
    return sendControllerError(
      req,
      res,
      'Data export error:',
      error,
      'Failed to export personal data'
    );
  }
};

exports.purgeAccount = async (req, res) => {
  const userId = req.user.id;
  const client = await db.connect().catch((error) => {
    req.logger?.error?.('Account purge connection error:', error);
    return null;
  });

  if (!client) {
    return res.status(500).json({ success: false, message: 'Failed to purge account' });
  }

  let transactionStarted = false;
  let committed = false;
  let passportPhotoUrl = null;
  let accountEmail = null;
  let accountPhone = null;
  let recruitmentFilePaths = [];
  let supportAttachmentPaths = [];

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT password_hash, passport_photo_url, email, phone
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );
    if (!userResult.rows.length) {
      throw requestError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const password = req.body.password;
    const isValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isValid) {
      throw requestError(401, 'Incorrect password', 'INVALID_PASSWORD');
    }
    passportPhotoUrl = userResult.rows[0].passport_photo_url;
    accountEmail = userResult.rows[0].email;
    accountPhone = userResult.rows[0].phone;

    const activeDataCheck = await client.query(
      `SELECT
         EXISTS(
           SELECT 1 FROM properties
           WHERE landlord_id = $1 AND is_available = TRUE
         ) AS has_active_properties,
         EXISTS(
           SELECT 1 FROM disputes
           WHERE (complainant_id = $1 OR respondent_id = $1)
             AND status IN ('pending', 'investigating', 'escalated')
         ) AS has_active_disputes,
         EXISTS(
           SELECT 1 FROM payments
           WHERE user_id = $1 AND payment_status = 'pending'
         ) AS has_pending_payments`,
      [userId]
    );
    const activeWarnings = activeDataCheck.rows[0];
    if (
      activeWarnings.has_active_properties ||
      activeWarnings.has_active_disputes ||
      activeWarnings.has_pending_payments
    ) {
      const warnings = [];
      if (activeWarnings.has_active_properties) warnings.push('active property listings');
      if (activeWarnings.has_active_disputes) warnings.push('ongoing disputes');
      if (activeWarnings.has_pending_payments) warnings.push('pending payments');
      throw requestError(
        409,
        `Cannot purge account with ${warnings.join(', ')}. Please resolve these first or contact support.`,
        'ACCOUNT_HAS_ACTIVE_DATA'
      );
    }

    const tableExists = createTableInspector(client);
    for (const target of NON_ESSENTIAL_DELETE_TARGETS) {
      await deleteRowsForUser(client, tableExists, target, userId);
    }

    await anonymizeRetainedRecords(client, tableExists, userId);
    await redactIdentityWorkflowData(client, tableExists, userId);
    supportAttachmentPaths = await redactSupportData(
      client,
      tableExists,
      userId
    );
    recruitmentFilePaths = await redactRecruitmentData(client, tableExists, userId);
    await redactMarketingData(
      client,
      tableExists,
      userId,
      accountEmail,
      accountPhone
    );
    await redactUser(client, userId);

    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    if (transactionStarted && !committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        req.logger?.error?.('Account purge rollback failed:', rollbackError);
      }
    }
    return sendControllerError(
      req,
      res,
      'Account purge error:',
      error,
      'Failed to purge account'
    );
  } finally {
    client.release();
  }

  const mediaCleanupFailures = deleteLocalMedia(
    req,
    passportPhotoUrl,
    recruitmentFilePaths,
    supportAttachmentPaths
  );

  await logAction({
    actorId: userId,
    action: 'NDPR_ACCOUNT_PURGE',
    targetType: 'user',
    targetId: userId,
    ip: req.ip,
  });

  try {
    clearAuthCookies(res);
  } catch (error) {
    req.logger?.warn?.('Failed to clear cookies after account purge', {
      error: error.message,
    });
  }

  return res.json({
    success: true,
    message:
      'Account purge completed. Direct account identifiers and non-essential data were removed or anonymized. Records required for transactions, disputes, fraud prevention, security, or legal obligations may be retained with restricted access.',
    data: {
      status: 'purged',
      retained_record_categories: [
        'transactions and settlement records',
        'joint communications and case records',
        'security and audit records',
      ],
      ...(mediaCleanupFailures.length ? { media_cleanup_pending: true } : {}),
    },
  });
};
