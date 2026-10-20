const db = require('../middleware/database');
const logger = require('./logger');
const { createNotification } = require('./notificationService');

/**
 * When a property goes live:
 *  - the tenants who signed up for that state are told a new property exists
 *    ("signed up for that state" = the tenant's preferred state), and
 *  - the landlord who owns it is told his own listing is now live. He used to
 *    get an email only, so nothing appeared in his in-app notifications and
 *    his badge never moved.
 *
 * Notifications are written to the database (so they survive an app restart)
 * and pushed, which also updates the unread badge.
 */

const buildTenantMessage = (property) => {
  const where = [property?.area, property?.city].filter(Boolean).join(', ');
  const type = property?.property_type ? `${property.property_type} ` : '';
  return where
    ? `A new ${type}property is now available in ${where}.`
    : `A new ${type}property is now available in your state.`;
};

const notifyTenants = async (property) => {
  const stateId = Number(property?.state_id);
  if (!Number.isInteger(stateId)) return { matched: 0, sent: 0 };

  const recipients = await db.query(
    `SELECT id FROM users
     WHERE user_type IN ('tenant', 'user')
       AND preferred_state_id = $1
       AND deleted_at IS NULL
       AND account_suspended_at IS NULL
       AND id <> $2
     LIMIT 5000`,
    [stateId, Number(property.landlord_id) || 0]
  );

  const title = 'New property in your state';
  const message = buildTenantMessage(property);
  const link = `/properties/${property.id}`;

  let sent = 0;
  for (const row of recipients.rows) {
    const created = await createNotification(row.id, 'property_posted', title, message, link);
    if (created) sent += 1;
  }

  return { matched: recipients.rows.length, sent };
};

const notifyLandlord = async (property) => {
  const landlordId = Number(property?.landlord_id) || Number(property?.user_id);
  if (!Number.isInteger(landlordId) || landlordId <= 0) return { matched: 0, sent: 0 };

  const title = 'Your property is live';
  const message = `Your property "${String(property?.title || 'listing').slice(0, 80)}" has been approved and is now visible to tenants.`;
  const link = `/properties/${property.id}`;

  const created = await createNotification(
    landlordId,
    'property_approved',
    title,
    message,
    link
  );

  return { matched: 1, sent: created ? 1 : 0 };
};

exports.notifyTenantsOfLiveProperty = async (property) => {
  try {
    if (!property?.id) return { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } };

    const tenants = await notifyTenants(property);
    const landlord = await notifyLandlord(property);

    return { tenants, landlord };
  } catch (error) {
    logger.error('Notify on live property error:', error);
    return { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } };
  }
};
