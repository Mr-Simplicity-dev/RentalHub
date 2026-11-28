const db = require('../middleware/database');
const logger = require('./logger');
const { createNotification } = require('./notificationService');

const ANNOUNCEMENT_TITLE = 'New property available!';

const validBedroomCount = (value) => {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= 20 ? count : null;
};

const buildArrivalMessage = (property) => {
  const bedrooms = validBedroomCount(property?.bedrooms);
  return bedrooms
    ? `A new ${bedrooms}-bedroom apartment has arrived on Amana RentalHub. Explore the listing now.`
    : 'A new property has arrived on Amana RentalHub. Explore the listing now.';
};

const loadLiveProperty = async (input, deps) => {
  const dbQuery = deps.dbQuery || db.query;
  const id = Number(input?.id ?? input);
  if (!Number.isInteger(id) || id <= 0) return null;

  const conditions = [
    'p.id = $1',
    'p.is_available = TRUE',
    'p.is_verified = TRUE',
    "LOWER(COALESCE(p.status, '')) = 'available'",
    'p.deleted_at IS NULL',
    '(p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)',
  ];
  const params = [id];

  try {
    const getFlags = deps.getFeatureFlagsMap || (async () => {
      const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
      return getFeatureFlagsMap();
    });
    const flags = await getFlags();
    if (flags?.require_property_ownership_verification) {
      const { rows } = await dbQuery(
        `SELECT ownership_gate_enabled_at FROM feature_flags WHERE key = 'require_property_ownership_verification'`
      );
      const enabledAt = rows[0]?.ownership_gate_enabled_at || null;
      if (enabledAt) {
        conditions.push(`(p.ownership_verification_status = 'verified' OR p.created_at <= $2)`);
        params.push(enabledAt);
      } else {
        conditions.push(`p.ownership_verification_status = 'verified'`);
      }
    }
  } catch {
    return null;
  }

  const { rows } = await dbQuery(
    `SELECT p.id, p.landlord_id, p.state_id, p.bedrooms
     FROM properties p
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return rows[0] || null;
};

exports.notifyNewPropertyArrival = async (input, deps = {}) => {
  const dbQuery = deps.dbQuery || db.query;
  const create = deps.createNotification || createNotification;
  try {
    const property = await loadLiveProperty(input, deps);
    if (!property) return { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } };

    const stateId = Number(property.state_id);
    const ownerId = Number(property.landlord_id);
    const title = ANNOUNCEMENT_TITLE;
    const message = buildArrivalMessage(property);
    const link = `/properties/${property.id}`;

    let tenants = { matched: 0, sent: 0 };
    if (Number.isInteger(stateId)) {
      const recipients = await dbQuery(
        `SELECT id FROM users
         WHERE user_type = 'tenant'
           AND is_active = TRUE
           AND preferred_state_id = $1
           AND deleted_at IS NULL
           AND account_suspended_at IS NULL
           AND id <> $2
         LIMIT 5000`,
        [stateId, Number.isInteger(ownerId) ? ownerId : 0]
      );
      let sent = 0;
      for (const row of recipients.rows) {
        const created = await create(
          row.id,
          'property_posted',
          title,
          message,
          link,
          `property-arrival:${property.id}:tenant:${row.id}`
        );
        if (created) sent += 1;
      }
      tenants = { matched: recipients.rows.length, sent };
    }

    let landlord = { matched: 0, sent: 0 };
    if (Number.isInteger(ownerId) && ownerId > 0) {
      const eligible = await dbQuery(
        `SELECT id FROM users
         WHERE id = $1
           AND user_type IN ('landlord', 'agent', 'user')
           AND is_active = TRUE
           AND deleted_at IS NULL
           AND account_suspended_at IS NULL`,
        [ownerId]
      );
      if (eligible.rows.length) {
        const created = await create(
          ownerId,
          'property_approved',
          title,
          message,
          link,
          `property-arrival:${property.id}:landlord:${ownerId}`
        );
        landlord = { matched: 1, sent: created ? 1 : 0 };
      }
    }

    return { tenants, landlord };
  } catch (error) {
    logger.error('New property arrival announcement error:', error);
    return { tenants: { matched: 0, sent: 0 }, landlord: { matched: 0, sent: 0 } };
  }
};

exports.notifyTenantsOfLiveProperty = exports.notifyNewPropertyArrival;
