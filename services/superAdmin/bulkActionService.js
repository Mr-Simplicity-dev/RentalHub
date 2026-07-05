const db = require('../../config/middleware/database');
const logger = require('../../config/utils/logger');
const { logAction } = require('./schemaHelpers');

// Bulk actions
const bulkUserAction = async (req, res) => {
  const { ids, action } = req.body;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensureVerificationAuditSchema();
    await ensureAdminAccountOperationSchema();

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No users selected' });
    }

    let query;
    let params = [ids];
    let logActionName;

    switch (action) {
      case 'ban':
        if (!reason) {
          return res.status(400).json({ message: 'A bulk ban reason is required' });
        }
        query = `
          UPDATE users
          SET is_active = FALSE,
              account_suspended_reason = $2,
              account_suspended_at = NOW(),
              account_suspended_by = $3,
              updated_at = NOW()
          WHERE id = ANY($1)
            AND user_type <> 'super_admin'
            AND deleted_at IS NULL
          RETURNING id, full_name, email, user_type, is_active, account_suspended_reason
        `;
        params = [ids, reason, req.user.id];
        logActionName = 'BULK_BAN_USERS';
        break;
      case 'verify':
        query = `
          UPDATE users
          SET identity_verified = TRUE,
              identity_verification_status = 'verified',
              identity_verified_by = $2,
              identity_verified_at = NOW(),
              updated_at = NOW()
          WHERE id = ANY($1)
            AND user_type <> 'super_admin'
            AND passport_photo_url IS NOT NULL
            AND (nin IS NOT NULL OR international_passport_number IS NOT NULL)
        `;
        params = [ids, req.user.id];
        logActionName = 'BULK_VERIFY_USERS';
        break;
      case 'promote':
        query = `UPDATE users SET user_type = 'admin', updated_at = NOW() WHERE id = ANY($1) AND user_type <> 'super_admin'`;
        logActionName = 'BULK_PROMOTE_USERS';
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    const actionResult = await db.query(query, params);

    if (action === 'ban') {
      for (const row of actionResult.rows) {
        await createAdminAccountOperation({
          adminUserId: row.id,
          actorId: req.user.id,
          actorName: getAdminOperationActorName(req.user),
          eventType: 'user_bulk_suspended',
          note: reason,
          adminSnapshot: row,
          metadata: {
            bulk_action: true,
          },
        });
      }
    }

    await logAction(req.user.id, logActionName, 'user', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};

const bulkPropertyAction = async (req, res) => {
  const { ids, action } = req.body;
  const reason = String(req.body?.reason || req.body?.note || '').trim();

  try {
    await ensurePropertyOperationSchema();

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'No properties selected' });
    }

    if (action !== 'unlist') {
      return res.status(400).json({ message: 'Invalid action' });
    }

    if (!reason) {
      return res.status(400).json({ message: 'A bulk unlist reason is required' });
    }

    const actionResult = await db.query(
      `UPDATE properties
       SET is_available = FALSE,
           updated_at = NOW()
       WHERE id = ANY($1)
       RETURNING id, title, landlord_id, user_id, is_available, featured`,
      [ids]
    );

    await db.query(
      'DELETE FROM saved_properties WHERE property_id = ANY($1)',
      [ids]
    );

    for (const row of actionResult.rows) {
      await createPropertyOperation({
        propertyId: row.id,
        actor: req.user,
        eventType: 'property_bulk_unlisted',
        note: reason,
        metadata: {
          ...row,
          bulk_action: true,
        },
      });
    }

    await logAction(req.user.id, 'BULK_UNLIST_PROPERTIES', 'property', null);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bulk action failed' });
  }
};


module.exports = {
  bulkUserAction,
  bulkPropertyAction,
};

