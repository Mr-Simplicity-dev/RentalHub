const crypto = require("crypto");
const {
  fail,
  text,
  uuid,
  SERVICE_STAGES,
} = require("./propertyProtectionPolicy");
function confirmed(payment, request, stored) {
  return (
    payment?.status === "success" &&
    payment.reference === stored.transaction_reference &&
    payment.currency === request.currency &&
    Number(payment.amount) === Math.round(Number(request.amount) * 100) &&
    String(payment.customer?.email || "").toLowerCase() ===
      String(request.payment_email).toLowerCase()
  );
}
function createPaymentService({
  db,
  protection,
  pricing,
  post,
  get,
  notify,
  audit,
  receipt = async () => {},
  env = process.env,
}) {
  const catalogue = async (actor, id) => {
    const { p } = await protection.access(actor, id);
    const services = (
      await db.query("SELECT * FROM protection_services ORDER BY code")
    ).rows;
    const rows = [];
    for (const s of services) {
      let quote = null;
      try {
        quote = await pricing({
          appliesTo: "protection_" + s.code,
          stateId: p.state_id,
          lgaName: p.lga_name,
        });
      } catch {}
      const available =
        s.enabled &&
        (!s.available_states.length ||
          s.available_states.map(Number).includes(Number(p.state_id))) &&
        quote?.matched_rule &&
        quote.currency === "NGN" &&
        Number(quote.amount) > 0 &&
        (s.code !== "monitoring" || (s.period_days && s.cadence_days));
      rows.push({
        ...s,
        available: Boolean(available),
        amount: available ? Number(quote.amount) : null,
        currency: "NGN",
      });
    }
    return rows;
  };
  const configure = async (actor, code, body) => {
    if (actor.user_type !== "super_admin")
      fail(403, "Only Super Admin may define protection services.");
    if (
      ![
        "registry",
        "survey",
        "inspection",
        "professional",
        "monitoring",
      ].includes(code) ||
      text(body.description).length < 30
    )
      fail(400, "Choose a service and clearly define its scope.");
    const states = Array.isArray(body.available_states)
      ? [...new Set(body.available_states.map(Number))]
      : [];
    if (states.some((s) => !Number.isInteger(s) || s <= 0))
      fail(400, "Choose valid service states.");
    const period = code === "monitoring" ? Number(body.period_days) : null,
      cadence = code === "monitoring" ? Number(body.cadence_days) : null;
    if (
      code === "monitoring" &&
      (!Number.isInteger(period) ||
        period < 1 ||
        period > 366 ||
        !Number.isInteger(cadence) ||
        cadence < 1 ||
        cadence > period)
    )
      fail(400, "Set the monitoring period and check frequency.");
    await db.query(
      "UPDATE protection_services SET description=$2,enabled=$3,available_states=$4,period_days=$5,cadence_days=$6,updated_by=$7,updated_at=NOW() WHERE code=$1",
      [
        code,
        text(body.description),
        body.enabled === true,
        JSON.stringify(states),
        period,
        cadence,
        actor.id,
      ],
    );
    await audit({
      actorId: actor.id,
      action: "PROTECTION_SERVICE_CONFIGURED",
      targetType: "protection_service",
    });
    return {
      success: true,
    };
  };
  const request = async (actor, id, body) => {
    if (!env.PAYSTACK_SECRET_KEY)
      fail(503, "Checkout is not configured. No payment has been created.");
    const a = await protection.access(actor, id);
    if (!a.owner && !a.rep?.can_request_services)
      fail(
        403,
        "Your representative authority does not permit service requests.",
      );
    if (body.consent !== true || !uuid(body.request_id))
      fail(400, "Confirm the service scope and provide a retry identifier.");
    const email = String(actor.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(
        409,
        "A verified payment email is needed before checkout. Update your account contact details first.",
      );
    const product = (await catalogue(actor, id)).find(
      (s) => s.code === body.service_code,
    );
    if (!product?.available)
      fail(
        409,
        "This service has not been defined, priced or made available for this location.",
      );
    const order = await protection.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock($1,$2)", [2051, Number(id)]);
      const byKey = (
        await c.query(
          "SELECT r.*,p.transaction_reference FROM protection_service_requests r LEFT JOIN payments p ON p.id=r.payment_id WHERE r.id=$1",
          [body.request_id],
        )
      ).rows[0];
      if (
        byKey &&
        (Number(byKey.property_id) !== Number(id) ||
          byKey.service_code !== product.code)
      )
        fail(409, "This retry identifier belongs to another property service.");
      const existing =
        byKey ||
        (
          await c.query(
            "SELECT r.*,p.transaction_reference FROM protection_service_requests r LEFT JOIN payments p ON p.id=r.payment_id WHERE r.property_id=$1 AND r.service_code=$2 AND r.status IN ('pending_payment','paid','in_progress') ORDER BY r.created_at DESC LIMIT 1",
            [id, product.code],
          )
        ).rows[0];
      if (existing) {
        if (Number(existing.user_id) !== Number(actor.id))
          fail(
            409,
            "There is already an active service request for this property.",
          );
        return existing;
      }
      const reference = "ARH-PP-" + crypto.randomUUID().replace(/-/g, "");
      const pay = (
        await c.query(
          "INSERT INTO payments(user_id,payer_user_id,payment_type,amount,currency,payment_method,transaction_reference,payment_status,consent_confirmed) VALUES($1,$1,'general_platform_fee',$2,'NGN','paystack',$3,'pending',TRUE) RETURNING id",
          [actor.id, product.amount, reference],
        )
      ).rows[0];
      const r = (
        await c.query(
          "INSERT INTO protection_service_requests(id,property_id,service_code,user_id,payment_id,amount,currency,payment_email,scope_snapshot,period_days,cadence_days) VALUES($1,$2,$3,$4,$5,$6,'NGN',$7,$8,$9,$10) RETURNING *",
          [
            body.request_id,
            id,
            product.code,
            actor.id,
            pay.id,
            product.amount,
            email,
            product.description,
            product.period_days,
            product.cadence_days,
          ],
        )
      ).rows[0];
      return {
        ...r,
        transaction_reference: reference,
        new_request: true,
      };
    });
    if (
      !order.new_request &&
      (order.status !== "pending_payment" || order.authorization_url)
    )
      return {
        ...order,
        reference: order.transaction_reference,
        new_request: undefined,
      };
    if (!env.PAYSTACK_SECRET_KEY)
      fail(
        503,
        "Checkout is not configured. Your unpaid request is saved; do not create another payment.",
      );
    try {
      const r = await post(
        "https://api.paystack.co/transaction/initialize",
        {
          email,
          amount: Math.round(Number(order.amount) * 100),
          currency: "NGN",
          reference: order.transaction_reference,
          callback_url:
            require("../config/utils/frontendUrl").getFrontendUrl() +
            "/property-protection?request=" +
            order.id,
          metadata: JSON.stringify({
            payment_type: "general_platform_fee",
            purpose: "property_protection",
            protection_request_id: order.id,
          }),
        },
        {
          headers: {
            Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY,
          },
          timeout: 20000,
        },
      );
      const url = r.data?.data?.authorization_url;
      if (
        !r.data?.status ||
        !/^https:\/\/(?:checkout\.)?paystack\.com\//i.test(url || "")
      )
        fail(
          502,
          "The checkout provider did not return an approved checkout link.",
        );
      await db.query(
        "UPDATE protection_service_requests SET authorization_url=$2,access_code=$3 WHERE id=$1",
        [order.id, url, r.data.data.access_code || null],
      );
      return {
        ...order,
        authorization_url: url,
        access_code: r.data.data.access_code || null,
        reference: order.transaction_reference,
        new_request: undefined,
      };
    } catch (e) {
      fail(
        e.status || 502,
        "Checkout could not be opened. The request and reference were saved. Check payment status before trying another payment.",
      );
    }
  };
  const reconcile = async (id, actor) => {
    const order = (
      await db.query(
        "SELECT r.*,p.transaction_reference,p.payment_status FROM protection_service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1",
        [id],
      )
    ).rows[0];
    if (!order) fail(404, "Service request not found.");
    if (actor) {
      const a = await protection.access(actor, order.property_id);
      if (!a.owner && Number(order.user_id) !== Number(actor.id) && !a.manager)
        fail(403, "You cannot check this payment.");
    }
    if (order.status !== "pending_payment") return order;
    if (!env.PAYSTACK_SECRET_KEY)
      fail(503, "Payment verification is unavailable.");
    await db.query(
      "UPDATE protection_service_requests SET last_checked_at=NOW() WHERE id=$1",
      [id],
    );
    const r = await get(
      "https://api.paystack.co/transaction/verify/" +
        encodeURIComponent(order.transaction_reference),
      {
        headers: {
          Authorization: "Bearer " + env.PAYSTACK_SECRET_KEY,
        },
        timeout: 20000,
      },
    );
    if (!r.data?.status || !confirmed(r.data.data, order, order))
      fail(
        409,
        "Payment is not confirmed. Check the same reference rather than paying again.",
      );
    const result = await protection.transaction(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM protection_service_requests WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (row.status !== "pending_payment") return row;
      await c.query(
        "UPDATE payments SET payment_status='completed',completed_at=COALESCE(completed_at,NOW()),gateway_response=$2 WHERE id=$1",
        [
          row.payment_id,
          JSON.stringify({
            reference: order.transaction_reference,
            status: "success",
            purpose: "property_protection",
          }),
        ],
      );
      await c.query(
        "UPDATE protection_service_requests SET status=$2::text,paid_at=NOW(),completed_at=CASE WHEN $2::text='completed' THEN NOW() ELSE NULL END WHERE id=$1",
        [id, row.service_code === "monitoring" ? "completed" : "paid"],
      );
      if (row.service_code === "inspection")
        await c.query(
          "INSERT INTO property_inspection_requests(tenant_id,protection_property_id,protection_request_id,protection_purpose,payment_id,amount,status,paid_at) VALUES($1,$2,$3,'verification',$4,$5,'paid',NOW()) ON CONFLICT DO NOTHING",
          [row.user_id, row.property_id, row.id, row.payment_id, row.amount],
        );
      if (SERVICE_STAGES[row.service_code]) {
        await c.query(
          "UPDATE protection_checks SET history=history||jsonb_build_array(to_jsonb(protection_checks)-'history'),status='pending',assigned_to=NULL,public_summary=NULL,private_findings=NULL,source_details='{}',document_ids='[]',submitted_by=NULL,reviewed_by=NULL,review_reason=NULL,submitted_at=NULL,reviewed_at=NULL,updated_at=NOW() WHERE property_id=$1 AND stage IN ($2,'final')",
          [row.property_id, SERVICE_STAGES[row.service_code]],
        );
        await protection.setStatus(row.property_id, "under_review", c);
      }
      if (row.service_code === "monitoring")
        await c.query(
          "INSERT INTO protection_monitoring(property_id,request_id,active_until,next_check_at,cadence_days) VALUES($1,$2,NOW()+($3::int*INTERVAL '1 day'),NOW(),$4) ON CONFLICT(property_id) DO UPDATE SET request_id=EXCLUDED.request_id,active_until=GREATEST(protection_monitoring.active_until,NOW())+($3::int*INTERVAL '1 day'),next_check_at=LEAST(protection_monitoring.next_check_at,NOW()),cadence_days=EXCLUDED.cadence_days,cancelled_at=NULL,updated_at=NOW()",
          [row.property_id, row.id, row.period_days, row.cadence_days],
        );
      return {
        ...row,
        status: row.service_code === "monitoring" ? "completed" : "paid",
        just_paid: true,
      };
    });
    if (result.just_paid) {
      if (protection.notifyOperations)
        await protection.notifyOperations(
          await protection.raw(order.property_id),
          "property_protection",
          "Property service needs assignment",
          "A defined property service has a confirmed payment and is ready for assignment.",
          "pp:paidqueue:" + id,
        );
      await notify(
        order.user_id,
        "property_protection",
        "Property service payment confirmed",
        "Your payment is confirmed. Follow the service progress in Property Protection.",
        "/property-protection",
        `pp:payment:${id}`,
      );
      await audit({
        actorId: order.user_id,
        action: "PROTECTION_SERVICE_PAID",
        targetType: "protection_property",
        targetId: order.property_id,
      });
      try {
        await receipt(order.payment_id);
      } catch {}
    }
    return result;
  };
  const resume = async (actor, id) => {
    const row = (
      await db.query("SELECT * FROM protection_service_requests WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!row) fail(404, "Service request not found.");
    await protection.access(actor, row.property_id);
    if (Number(row.user_id) !== Number(actor.id))
      fail(403, "Only the original payer may resume this checkout.");
    return request(actor, row.property_id, {
      request_id: id,
      service_code: row.service_code,
      consent: true,
    });
  };
  const byReference = async (reference) => {
    const row = (
      await db.query(
        "SELECT r.id FROM protection_service_requests r JOIN payments p ON p.id=r.payment_id WHERE p.transaction_reference=$1",
        [reference],
      )
    ).rows[0];
    return row ? reconcile(row.id) : null;
  };
  const sweep = async () => {
    const rows = (
      await db.query(
        "SELECT id FROM protection_service_requests WHERE status='pending_payment' AND created_at>NOW()-INTERVAL '7 days' ORDER BY COALESCE(last_checked_at,created_at) LIMIT 25",
      )
    ).rows;
    for (const row of rows) {
      try {
        await reconcile(row.id);
      } catch (e) {
        if (![404, 409].includes(e.status)) throw e;
      }
    }
  };
  return {
    catalogue,
    configure,
    request,
    reconcile,
    resume,
    byReference,
    sweep,
  };
}
let instance;
const getService = () =>
  instance ||
  (instance = createPaymentService({
    db: require("../config/middleware/database"),
    protection: require("./propertyProtectionService").getService(),
    pricing: require("../config/utils/locationPricing").getLocationPricingQuote,
    receipt: require("../config/utils/paymentReceipt").sendReceiptForPayment,
    post: require("axios").post,
    get: require("axios").get,
    notify: (...args) =>
      require("../config/utils/notificationService").createNotification(
        ...args,
      ),
    audit: require("../config/utils/auditLogger").logAction,
  }));
module.exports = {
  createPaymentService,
  confirmed,
  ...Object.fromEntries(
    [
      "catalogue",
      "configure",
      "request",
      "reconcile",
      "resume",
      "byReference",
      "sweep",
    ].map((k) => [k, (...args) => getService()[k](...args)]),
  ),
};
