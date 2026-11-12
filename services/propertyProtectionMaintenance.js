const db = require("../config/middleware/database");
const { createNotification } = require("../config/utils/notificationService");
async function runProtectionMaintenance() {
  await require("./propertyProtectionPayments").sweep();
  const expired = (
    await db.query(
      "UPDATE protection_properties SET verification_status='verification_expired' WHERE verification_status='verified_within_scope' AND verified_until<=NOW() RETURNING id,owner_id,verified_until",
    )
  ).rows;
  for (const p of expired)
    await createNotification(
      p.owner_id,
      "property_protection",
      "Property verification needs review",
      "The stated verification period ended. Open the record to arrange an updated check.",
      "/property-protection",
      `pp:expiry:${p.id}:${new Date(p.verified_until).toISOString()}`,
    );
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const rows = (
      await c.query(
        "SELECT m.*,p.owner_id FROM protection_monitoring m JOIN protection_properties p ON p.id=m.property_id WHERE m.cancelled_at IS NULL AND m.active_until>NOW() AND m.next_check_at<=NOW() ORDER BY m.next_check_at LIMIT 30 FOR UPDATE OF m SKIP LOCKED",
      )
    ).rows;
    for (const m of rows) {
      const active = (
        await c.query(
          "SELECT id FROM property_inspection_requests WHERE protection_property_id=$1 AND protection_purpose='monitoring' AND status IN ('paid','assigned','inspecting')",
          [m.property_id],
        )
      ).rows;
      if (!active.length) {
        const request = (
          await c.query(
            "SELECT payment_id FROM protection_service_requests WHERE id=$1",
            [m.request_id],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO property_inspection_requests(tenant_id,protection_property_id,protection_request_id,protection_purpose,payment_id,amount,status,paid_at) VALUES($1,$2,$3,'monitoring',$4,0,'paid',NOW())",
          [m.owner_id, m.property_id, m.request_id, request.payment_id],
        );
      }
      await c.query(
        "UPDATE protection_monitoring SET next_check_at=NOW()+($2::int*INTERVAL '1 day'),updated_at=NOW() WHERE property_id=$1",
        [m.property_id, m.cadence_days],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  const ended = (
    await db.query(
      "SELECT p.id,p.owner_id,m.active_until FROM protection_monitoring m JOIN protection_properties p ON p.id=m.property_id WHERE m.active_until<=NOW() AND m.cancelled_at IS NULL LIMIT 100",
    )
  ).rows;
  for (const p of ended)
    await createNotification(
      p.owner_id,
      "property_protection",
      "Property monitoring period ended",
      "No new monitoring checks will be scheduled unless you choose to renew.",
      "/property-protection",
      `pp:monitor:end:${p.id}:${new Date(p.active_until).toISOString()}`,
    );
}
module.exports = { runProtectionMaintenance };
