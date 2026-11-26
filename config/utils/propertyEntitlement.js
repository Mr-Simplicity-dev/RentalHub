// Authoritative full-description entitlement shared by the property detail
// endpoint and translation. Read-only; callers decide how to handle failures.
const getTenantPropertyUnlock = async ({ userId, propertyId, dbQuery }) => dbQuery(
  `SELECT id, unlocked_at
   FROM tenant_property_unlocks
   WHERE tenant_id = $1 AND property_id = $2`,
  [userId, propertyId]
);

module.exports = { getTenantPropertyUnlock };
