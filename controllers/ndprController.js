const db = require('../config/middleware/database');
const path = require('path');
const fs = require('fs');
const { logAction } = require('../config/utils/auditLogger');

const NDPR_DELETE_TABLES = ['saved_properties', 'property_views', 'user_tour_states', 'user_tour_events', 'notifications', 'call_sessions', 'subscription_credit_accounts', 'subscription_credit_ledger'];

const NDPR_DUAL_COLUMN_TABLES = ['call_sessions', 'landlord_agents', 'agent_invites', 'lawyer_invites', 'email_subscribers', 'sms_subscribers'];

const TABLE_COLUMN_MAP = {
  call_sessions: ['caller_id', 'receiver_id'],
  landlord_agents: ['landlord_user_id', 'agent_user_id'],
  agent_invites: ['landlord_user_id', 'agent_user_id'],
  lawyer_invites: ['client_user_id', 'lawyer_user_id'],
  email_subscribers: ['user_id'],
  sms_subscribers: ['user_id'],
};

const tableExists = async (tableName) => {
  try {
    const result = await db.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = $1
      ) AS exists`,
      [tableName]
    );
    return result.rows[0]?.exists || false;
  } catch {
    return false;
  }
};

const collectTableData = async (tableName, column, userId) => {
  const exists = await tableExists(tableName);
  if (!exists) return null;
  try {
    const result = await db.query(
      `SELECT * FROM "${tableName}" WHERE "${column}" = $1 ORDER BY created_at DESC NULLS LAST`,
      [userId]
    );
    return result.rows.length > 0 ? result.rows : [];
  } catch {
    return null;
  }
};

exports.exportPersonalData = async (req, res) => {
  try {
    const userId = req.user.id;

    const profileResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, email_verified, phone_verified,
              nin_verified, identity_verified, identity_document_type,
              identity_verification_status, passport_photo_url,
              subscription_active, subscription_expires_at,
              preferred_state_id, preferred_lga_name, is_active,
              created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!profileResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const profile = profileResult.rows[0];
    const data = { profile };

    const [
      properties,
      payments,
      messages,
      applications,
      savedProperties,
      disputes,
      reviews,
      notifications,
      propertyViews,
      walletTransactions,
      referralsGiven,
      referralsReceived,
      tourState,
      tourEvents,
      recruitments,
      legalAuthorizations,
      fumigationBookings,
      transportationBookings,
      agentData,
      commissionData,
    ] = await Promise.all([
      collectTableData('properties', 'landlord_id', userId),
      collectTableData('payments', 'user_id', userId),
      collectTableData('messages', 'sender_id', userId).then(async sentMessages => {
        const receivedMessages = await collectTableData('messages', 'receiver_id', userId);
        return { sent: sentMessages || [], received: receivedMessages || [] };
      }),
      collectTableData('applications', 'tenant_id', userId),
      collectTableData('saved_properties', 'tenant_id', userId),
      collectTableData('disputes', 'complainant_id', userId).then(async complaints => {
        const responses = await collectTableData('disputes', 'respondent_id', userId);
        return { as_complainant: complaints || [], as_respondent: responses || [] };
      }),
      collectTableData('reviews', 'tenant_id', userId),
      collectTableData('notifications', 'user_id', userId),
      collectTableData('property_views', 'viewer_id', userId),
      collectTableData('wallet_transactions', 'user_id', userId),
      collectTableData('user_referrals', 'referrer_id', userId),
      collectTableData('user_referrals', 'referred_user_id', userId),
      collectTableData('user_tour_states', 'user_id', userId),
      collectTableData('user_tour_events', 'user_id', userId),
      collectTableData('recruitment_applications', 'user_id', userId),
      collectTableData('legal_authorizations', 'client_user_id', userId),
      collectTableData('fumigation_cleaning_bookings', 'tenant_id', userId),
      collectTableData('transportation_bookings', 'tenant_id', userId),
      collectTableData('landlord_agents', 'landlord_user_id', userId).then(async asLandlord => {
        const asAgent = await collectTableData('landlord_agents', 'agent_user_id', userId);
        return { as_landlord: asLandlord || [], as_agent: asAgent || [] };
      }),
      collectTableData('agent_commission_ledger', 'agent_user_id', userId),
    ]);

    data.properties = properties;
    data.payments = payments;
    data.messages = messages;
    data.applications = applications;
    data.saved_properties = savedProperties;
    data.disputes = disputes;
    data.reviews = reviews;
    data.notifications = notifications;
    data.property_views = propertyViews;
    data.wallet_transactions = walletTransactions;
    data.referrals = { given: referralsGiven, received: referralsReceived };
    data.tour = { state: tourState, events: tourEvents };
    data.recruitments = recruitments;
    data.legal_authorizations = legalAuthorizations;
    data.fumigation_bookings = fumigationBookings;
    data.transportation_bookings = transportationBookings;
    data.agent_relationships = agentData;
    data.commission_ledger = commissionData;
    data.exported_at = new Date().toISOString();

    res.json({
      success: true,
      message: 'Your data export is ready. This file contains all personal data we hold about you.',
      data,
    });
  } catch (error) {
    req.logger.error('Data export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export personal data' });
  }
};

exports.purgeAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password required to purge account' });
    }

    const bcrypt = require('bcryptjs');
    const userResult = await db.query(
      `SELECT password_hash, passport_photo_url, email FROM users WHERE id = $1`,
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    const activeDataCheck = await db.query(
      `SELECT
         EXISTS(SELECT 1 FROM properties WHERE landlord_id = $1 AND is_available = TRUE) AS has_active_properties,
         EXISTS(SELECT 1 FROM disputes WHERE (complainant_id = $1 OR respondent_id = $1) AND status IN ('pending', 'investigating', 'escalated')) AS has_active_disputes,
         EXISTS(SELECT 1 FROM payments WHERE user_id = $1 AND payment_status = 'pending') AS has_pending_payments`,
      [userId]
    );
    const activeWarnings = activeDataCheck.rows[0];

    if (activeWarnings.has_active_properties || activeWarnings.has_active_disputes || activeWarnings.has_pending_payments) {
      const warnings = [];
      if (activeWarnings.has_active_properties) warnings.push('active property listings');
      if (activeWarnings.has_active_disputes) warnings.push('ongoing disputes');
      if (activeWarnings.has_pending_payments) warnings.push('pending payments');

      return res.status(409).json({
        success: false,
        message: `Cannot purge account with ${warnings.join(', ')}. Please resolve these first or contact support.`,
        code: 'ACCOUNT_HAS_ACTIVE_DATA',
      });
    }

    const purgeAllPII = async () => {
      const redactColumns = `email = '[redacted]',
          phone = '[redacted]',
          full_name = '[redacted]',
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
          account_suspended_reason = NULL,
          deleted_at = CURRENT_TIMESTAMP,
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP`;

      await db.query(
        `UPDATE users SET ${redactColumns} WHERE id = $1`,
        [userId]
      );
    };

    const deleteNonEssentialData = async () => {
      for (const tableName of NDPR_DELETE_TABLES) {
        const exists = await tableExists(tableName);
        if (!exists) continue;
        try {
          await db.query(`DELETE FROM "${tableName}" WHERE user_id = $1`, [userId]);
        } catch {}
      }

      for (const tableName of NDPR_DUAL_COLUMN_TABLES) {
        const exists = await tableExists(tableName);
        if (!exists) continue;
        const columns = TABLE_COLUMN_MAP[tableName] || ['user_id'];
        for (const column of columns) {
          try {
            await db.query(`DELETE FROM "${tableName}" WHERE "${column}" = $1`, [userId]);
          } catch {}
        }
      }
    };

    const anonymizeRetainedRecords = async () => {
      try {
        const msgExists = await tableExists('messages');
        if (msgExists) {
          await db.query(
            `UPDATE messages SET message = '[redacted]' WHERE sender_id = $1 OR receiver_id = $1`,
            [userId]
          );
        }
      } catch {}

      try {
        const rdExists = await tableExists('property_damage_reports');
        if (rdExists) {
          await db.query(
            `UPDATE property_damage_reports SET description = '[redacted]' WHERE tenant_id = $1`,
            [userId]
          );
        }
      } catch {}
    };

    const deletePassportPhoto = async () => {
      if (user.passport_photo_url) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'passports');
        const filename = path.basename(user.passport_photo_url);
        const filePath = path.join(uploadDir, filename);

        if (filename && !filename.includes('..') && !filename.includes('/') && !filename.includes('\\')) {
          const resolvedPath = path.resolve(filePath);
          if (resolvedPath.startsWith(path.resolve(uploadDir))) {
            try {
              if (fs.existsSync(resolvedPath)) {
                fs.unlinkSync(resolvedPath);
              }
            } catch (fileErr) {
              req.logger.warn('Failed to delete passport photo during purge:', fileErr.message);
            }
          }
        }
      }
    };

    await Promise.all([
      purgeAllPII(),
      deleteNonEssentialData(),
      anonymizeRetainedRecords(),
      deletePassportPhoto(),
    ]);

    await logAction({
      actorId: userId,
      action: 'NDPR_ACCOUNT_PURGE',
      targetType: 'user',
      targetId: userId,
      ip: req.ip,
    });

    const { clearAuthCookies } = require('../config/utils/authCookies');
    clearAuthCookies(res);

    res.json({
      success: true,
      message: 'Account purged successfully. All personal data has been permanently removed.',
    });
  } catch (error) {
    req.logger.error('Account purge error:', error);
    res.status(500).json({ success: false, message: 'Failed to purge account' });
  }
};
