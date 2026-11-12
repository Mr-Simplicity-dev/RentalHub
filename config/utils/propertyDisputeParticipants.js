const db = require('../middleware/database');

const getPropertyDisputeParticipants = async (propertyId, queryable = db) => {
  const propertyResult = await queryable.query(
    `SELECT
       p.id,
       p.title,
       p.landlord_id AS landlord_user_id
     FROM properties p
     WHERE p.id = $1
     LIMIT 1`,
    [propertyId]
  );

  if (!propertyResult.rows.length) {
    return null;
  }

  const property = propertyResult.rows[0];
  const participantsResult = await queryable.query(
    `WITH property_people AS (
       SELECT
         u.id,
         u.full_name,
         u.user_type,
         'landlord'::text AS relation,
         NULL::text AS application_status
       FROM users u
       WHERE u.id = $2

       UNION

       SELECT
         tenant.id,
         tenant.full_name,
         tenant.user_type,
         'tenant'::text AS relation,
         a.status::text AS application_status
       FROM applications a
       JOIN users tenant ON tenant.id = a.tenant_id
       WHERE a.property_id = $1
         -- Only approved tenancies are real participants; pending/rejected
         -- applicants must not be able to see other applicants' PII here.
         AND a.status = 'approved'
     )
     SELECT DISTINCT
       id,
       full_name,
       user_type,
       relation,
       application_status
     FROM property_people
     WHERE id IS NOT NULL
     ORDER BY
       CASE relation
         WHEN 'landlord' THEN 0
         ELSE 1
       END,
       full_name ASC`,
    [propertyId, property.landlord_user_id]
  );

  return {
    ...property,
    participants: participantsResult.rows,
  };
};

module.exports = {
  getPropertyDisputeParticipants,
};
