const bcrypt = require('bcryptjs');
const db = require('../config/middleware/database');

const BASE = 'http://localhost:5000/api';
const suffix = Date.now();
const password = 'TestPass123!';

const landlord = {
  email: `flow_landlord_${suffix}@example.com`,
  phone: `+23480${String(suffix).slice(-8)}`,
  nin: String(10000000000 + (suffix % 89999999999)),
  full_name: `Flow Landlord ${suffix}`,
};

const admin = {
  email: `flow_admin_${suffix}@example.com`,
  phone: `+23481${String(suffix).slice(-8)}`,
  nin: String(20000000000 + (suffix % 79999999999)),
  full_name: `Flow Admin ${suffix}`,
};

const tenant = {
  email: `flow_tenant_${suffix}@example.com`,
  phone: `+23470${String(suffix).slice(-8)}`,
  nin: String(30000000000 + (suffix % 69999999999)),
  full_name: `Flow Tenant ${suffix}`,
};

async function api(path, { method = 'GET', token, body, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

async function upsertUser(u, userType) {
  const hash = await bcrypt.hash(password, 10);

  await db.query('DELETE FROM users WHERE email = $1', [u.email]);

  const result = await db.query(
    `INSERT INTO users (
      email, phone, password_hash, full_name, user_type, nin,
      identity_document_type, nationality,
      nin_verified, email_verified, phone_verified, identity_verified,
      subscription_active
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id`,
    [
      u.email,
      u.phone,
      hash,
      u.full_name,
      userType,
      u.nin,
      'nin',
      'Nigeria',
      true,
      true,
      true,
      true,
      false,
    ]
  );

  return result.rows[0].id;
}

async function main() {
  const out = {
    landlord_post_property: null,
    featured_home_display: null,
    visitor_paywall: null,
    tenant_alert_trigger: null,
    details: {},
  };

  try {
    console.log('STEP: states');
    const statesRes = await api('/properties/states');
    const state = statesRes.data?.data?.[0];
    if (!state?.id) throw new Error('No states found in database');

    console.log('STEP: create users');
    const landlordId = await upsertUser(landlord, 'landlord');
    const adminId = await upsertUser(admin, 'admin');
    const tenantId = await upsertUser(tenant, 'tenant');

    console.log('STEP: login users');
    const landlordLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: landlord.email, password },
    });
    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: admin.email, password },
    });
    const tenantLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: tenant.email, password },
    });

    const landlordToken = landlordLogin.data?.data?.token;
    const adminToken = adminLogin.data?.data?.token;
    const tenantToken = tenantLogin.data?.data?.token;

    if (!landlordToken || !adminToken || !tenantToken) {
      throw new Error(`Token failure: ${JSON.stringify({ landlordLogin, adminLogin, tenantLogin })}`);
    }

    console.log('STEP: landlord post property');
    const propertyPayload = {
      state_id: state.id,
      city: 'Lokoja',
      area: 'Phase 1',
      full_address: 'No 12 Test Avenue, Phase 1, Lokoja',
      property_type: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      rent_amount: 550000,
      payment_frequency: 'yearly',
      title: `Flow Test Property ${suffix}`,
      description: 'Live flow test property for landlord posting and paywall.',
      amenities: ['water', 'security'],
    };

    const postProperty = await api('/properties', {
      method: 'POST',
      token: landlordToken,
      body: propertyPayload,
    });

    const propertyId = postProperty.data?.data?.id;
    out.landlord_post_property = {
      status: postProperty.status,
      success: !!postProperty.data?.success,
      property_id: propertyId || null,
      message: postProperty.data?.message || null,
      errors: postProperty.data?.errors || null,
    };

    if (!propertyId) throw new Error(`Property post failed: ${JSON.stringify(postProperty)}`);

    console.log('STEP: browse before');
    const browseBefore = await api('/properties/browse?limit=50');
    const browseBeforeIds = (browseBefore.data?.data || []).map((p) => p.id);

    console.log('STEP: alert request');
    const alertReq = await api('/property-alerts/request', {
      method: 'POST',
      body: {
        full_name: tenant.full_name,
        email: tenant.email,
        phone: tenant.phone,
        property_type: 'apartment',
        state_id: state.id,
        city: 'Lokoja',
        min_price: 300000,
        max_price: 800000,
        bedrooms: 1,
        bathrooms: 1,
      },
    });

    console.log('STEP: admin approve property');
    const approve = await api(`/admin/properties/${propertyId}/approve`, {
      method: 'PATCH',
      token: adminToken,
      timeoutMs: 30000,
    });

    console.log('STEP: alert db check');
    const alertRow = await db.query(
      `SELECT id, notified_at, matched_property_id
       FROM tenant_property_alerts
       WHERE email = $1
       ORDER BY id DESC
       LIMIT 1`,
      [tenant.email]
    );
    const latestAlert = alertRow.rows[0] || null;

    console.log('STEP: browse/featured after');
    const browseAfter = await api('/properties/browse?limit=50');
    const browseAfterIds = (browseAfter.data?.data || []).map((p) => p.id);

    await db.query('UPDATE properties SET featured = TRUE WHERE id = $1', [propertyId]);
    const featuredAfter = await api('/properties/featured?limit=50');
    const featuredIds = (featuredAfter.data?.data || []).map((p) => p.id);

    out.featured_home_display = {
      browse_before_contains_property: browseBeforeIds.includes(propertyId),
      browse_after_contains_property: browseAfterIds.includes(propertyId),
      featured_after_contains_property: featuredIds.includes(propertyId),
    };

    console.log('STEP: paywall checks');
    const publicDetail = await api(`/properties/${propertyId}`);
    const fullNoToken = await api(`/properties/${propertyId}/details`);
    const fullTenantNoSub = await api(`/properties/${propertyId}/details`, { token: tenantToken });

    await db.query(
      `UPDATE users
       SET subscription_active = TRUE,
           subscription_expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $1`,
      [tenantId]
    );

    const fullTenantSub = await api(`/properties/${propertyId}/details`, { token: tenantToken });

    out.visitor_paywall = {
      public_detail_status: publicDetail.status,
      public_requires_subscription_flag: !!publicDetail.data?.data?.requires_subscription,
      full_details_no_token_status: fullNoToken.status,
      full_details_tenant_no_sub_status: fullTenantNoSub.status,
      full_details_tenant_with_sub_status: fullTenantSub.status,
      full_details_has_landlord_phone: !!fullTenantSub.data?.data?.landlord_phone,
    };

    out.tenant_alert_trigger = {
      alert_request_status: alertReq.status,
      approve_status: approve.status,
      approve_success: !!approve.data?.success,
      alert_notified: !!latestAlert?.notified_at,
      alert_matched_property_id: latestAlert?.matched_property_id || null,
    };

    out.details = {
      landlord_id: landlordId,
      admin_id: adminId,
      tenant_id: tenantId,
      property_id: propertyId,
    };

    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('FLOW_TEST_ERROR:', err.message);
    console.error(JSON.stringify(out, null, 2));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
