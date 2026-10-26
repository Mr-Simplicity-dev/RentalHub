const db = require('../config/middleware/database');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const {
  getFeatureFlagsMap
} = require('../config/middleware/featureFlags');
const {
  resolveLocationSelection
} = require('../config/utils/locationDirectory');
const {
  assertRegistrationAllowed
} = require('../config/utils/registrationAccess');
const {
  buildReference
} = require('../config/utils/referenceGenerator');
const {
  roles,
  supervisors,
  phoneKey,
  safeUser,
  validateAccount,
  otpHash,
  requireScope,
  fail
} = require('./assistedRegistrationPolicy');
const activity = require('./activityLogger');
const auth = () => require('./authService').assistedRegistrationInternals;
const money = value => Math.round(Number(value) * 100) / 100;
const audit = (actor, action, id, metadata = {}) => activity.log({
  userId: actor.id,
  userType: actor.user_type,
  action,
  entityType: 'assisted_registration',
  entityId: id,
  metadata
});
const scopeWhere = actor => {
  if (!roles.has(actor?.user_type)) throw fail(403, 'Support registration access required');
  if (supervisors.has(actor.user_type)) return {
    sql: 'TRUE',
    params: []
  };
  if (actor.user_type === 'zonal_admin') {
    const {
      ZONE_STATES,
      canonicalZone
    } = require('../config/utils/territorialZones');
    const states = ZONE_STATES[canonicalZone(actor.assigned_zone)] || [];
    if (!states.length) throw fail(403, 'Your assigned zone is required');
    return {
      sql: 's.state_name = ANY($1::text[])',
      params: [states]
    };
  }
  if (!actor.assigned_state) throw fail(403, 'Your assigned state is required');
  if (actor.user_type === 'lga_support_admin') {
    const lga = actor.assigned_lga || actor.assigned_city;
    if (!lga) throw fail(403, 'Your assigned local government area is required');
    return {
      sql: 'LOWER(s.state_name)=LOWER($1) AND LOWER(ar.lga_name)=LOWER($2)',
      params: [actor.assigned_state, lga]
    };
  }
  return {
    sql: 'LOWER(s.state_name)=LOWER($1)',
    params: [actor.assigned_state]
  };
};
const getRecord = async reference => (await db.query(`SELECT ar.*,u.full_name,u.email,u.phone,u.user_type,u.phone_verified,s.state_name FROM assisted_registrations ar JOIN users u ON u.id=ar.user_id JOIN states s ON s.id=ar.state_id WHERE ar.reference=$1`, [reference])).rows[0];
const recordForStaff = async (actor, reference) => {
  const row = await getRecord(reference);
  if (!row) throw fail(404, 'Assisted registration not found');
  requireScope(actor, row);
  return row;
};
const recordForUser = async userId => {
  const row = (await db.query('SELECT reference FROM assisted_registrations WHERE user_id=$1', [userId])).rows[0];
  if (!row) throw fail(404, 'Assisted registration not found');
  return getRecord(row.reference);
};
const quote = async (actor, body) => {
  if (!['tenant', 'landlord'].includes(body.user_type)) throw fail(400, 'Choose Tenant or Landlord');
  const location = await resolveLocationSelection({
    stateId: body.state_id,
    lgaName: body.lga_name,
    requireState: true,
    requireLga: true
  });
  requireScope(actor, location);
  const flags = await getFeatureFlagsMap();
  if (body.is_foreigner === true) throw fail(400, 'Use the existing diaspora registration flow for foreign applicants');
  await assertRegistrationAllowed({
    userType: body.user_type,
    flags,
    stateId: location.state_id,
    lgaName: location.lga_name
  });
  const pricing = await auth().buildRegistrationPricingQuote({
    userType: body.user_type,
    flags,
    stateId: location.state_id,
    lgaName: location.lga_name,
    strictLocation: true,
    tier: 'local'
  });
  const base = pricing.enabled ? money(pricing.amount) : 0;
  const lawyer = body.use_rentalhub_lawyers === true ? 2000 : 0;
  const agent = body.user_type === 'landlord' && body.use_rentalhub_agents === true ? 5000 : 0;
  return {
    base_amount: base,
    lawyer_amount: lawyer,
    agent_amount: agent,
    amount: money(base + lawyer + agent),
    currency: 'NGN',
    location,
    rule_scope: pricing.rule_scope || 'base'
  };
};
const create = async (actor, body) => {
  validateAccount(body);
  const pricing = await quote(actor, body);
  if (Number(body.expected_amount) !== pricing.amount) throw Object.assign(fail(409, 'The fee has changed. Review the latest registration fee before creating the account.'), { code: 'REGISTRATION_QUOTE_CHANGED' });
  const claimed = await db.query(`INSERT INTO assisted_registration_requests(staff_id,request_id) VALUES($1,$2) ON CONFLICT(staff_id,request_id) DO UPDATE SET state='processing',lease_expires_at=NOW()+INTERVAL '10 minutes' WHERE assisted_registration_requests.state='failed' OR (assisted_registration_requests.state='processing' AND assisted_registration_requests.lease_expires_at<NOW()) RETURNING request_id`, [actor.id, body.request_id]);
  if (!claimed.rows.length) {
    const previous = (await db.query('SELECT registration_reference FROM assisted_registration_requests WHERE staff_id=$1 AND request_id=$2', [actor.id, body.request_id])).rows[0];
    if (previous?.registration_reference) return recordForStaff(actor, previous.registration_reference);
    throw fail(409, 'This registration is still processing. Retry with the same request identifier.');
  }
  try {
    const input = {
      email: body.email ? String(body.email).trim().toLowerCase() : null,
      phone: phoneKey(body.phone),
      full_name: String(body.full_name).trim(),
      user_type: body.user_type,
      password: 'Aa1!' + crypto.randomBytes(32).toString('hex'),
      lawyer_email: body.use_rentalhub_lawyers===true?null:body.lawyer_email ? String(body.lawyer_email).trim().toLowerCase() : null,
      use_rentalhub_lawyers: body.use_rentalhub_lawyers === true,
      use_rentalhub_agents: body.user_type === 'landlord' && body.use_rentalhub_agents === true,
      nin: body.nin,
      date_of_birth: body.date_of_birth,
      identity_document_type: 'nin',
      nationality: 'Nigeria',
      state_id: pricing.location.state_id,
      lga_name: pricing.location.lga_name
    };
    if (input.lawyer_email && !require('validator').isEmail(input.lawyer_email)) throw fail(400, 'Enter a valid lawyer email');
    if (!input.lawyer_email && !input.use_rentalhub_lawyers) throw fail(400, 'A lawyer selection is required');
    if (input.email && !require('validator').isEmail(input.email)) throw fail(400, 'Enter a valid email');
    const prepared = await auth().validateAndPrepareRegistration(input, {
      allowMissingEmail: true,
      logger: console
    });
    const registration = auth().withPreparedRegistrationLocation(prepared.preparedRegistration, pricing.location);
    const reference = buildReference('ASSIST', crypto.randomBytes(24).toString('hex'));
    const paymentPayload = {
      assisted_registration: true,
      useRentalhubLawyers: input.use_rentalhub_lawyers,
      useRentalhubAgents: input.use_rentalhub_agents,
      base_registration_amount: pricing.base_amount,
      lawyer_access_fee_ngn: pricing.lawyer_amount,
      agent_access_fee_ngn: pricing.agent_amount,
      verified_identity_name: prepared.verificationMeta?.verified_name || null,
      full_name: registration.full_name
    };
    await auth().createUserFromPreparedRegistration({
      preparedRegistration: registration,
      passwordHash: await bcrypt.hash(input.password, 10),
      verificationMeta: prepared.verificationMeta,
      kycResult: prepared.kycResult,
      deferPaidBenefits: true,
      assistedRegistration: true,
      beforeCommit: async (client, user) => {
        await client.query('UPDATE users SET assisted_registration=TRUE WHERE id=$1', [user.id]);
        await client.query(`INSERT INTO tenant_registration_payments(user_type,email,phone,full_name,amount,transaction_reference,registration_payload,verification_meta,payment_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'bank_transfer')`, [user.user_type, user.email, input.phone, user.full_name, pricing.amount, reference, JSON.stringify(paymentPayload), JSON.stringify(prepared.verificationMeta || {})]);
        await client.query(`INSERT INTO assisted_registrations(reference,user_id,staff_id,state_id,lga_name,amount_due,quote) VALUES($1,$2,$3,$4,$5,$6,$7)`, [reference, user.id, actor.id, pricing.location.state_id, pricing.location.lga_name, pricing.amount, JSON.stringify(pricing)]);
        if(pricing.amount===0){
          await client.query("UPDATE assisted_registrations SET status='paid',collection_method='waived',paid_at=NOW(),benefits_completed_at=NOW() WHERE reference=$1",[reference]);
          await client.query("UPDATE tenant_registration_payments SET payment_status='completed',payment_method='waived',registered_user_id=$2,completed_at=NOW(),consumed_at=NOW() WHERE transaction_reference=$1",[reference,user.id]);
        }
        await client.query(`UPDATE assisted_registration_requests SET state='completed',registration_reference=$3 WHERE staff_id=$1 AND request_id=$2`, [actor.id, body.request_id, reference]);
      }
    });
    await audit(actor, 'ASSISTED_ACCOUNT_CREATED', null, {
      reference,
      user_type: body.user_type
    });
    return recordForStaff(actor, reference);
  } catch (error) {
    const committed = (await db.query('SELECT registration_reference FROM assisted_registration_requests WHERE staff_id=$1 AND request_id=$2', [actor.id, body.request_id])).rows[0];
    if (committed?.registration_reference) return recordForStaff(actor, committed.registration_reference);
    await db.query(`UPDATE assisted_registration_requests SET state='failed' WHERE staff_id=$1 AND request_id=$2`, [actor.id, body.request_id]);
    throw error;
  }
};
const settleVerifiedPayment = async ({
  reference,
  payment,
  actor,
  logger = console
}) => {
  if (payment.payment_status !== 'completed') throw fail(409, 'The payment has not been confirmed');
  const client = await db.connect();
  let row,
    parts = [];
  try {
    await client.query('BEGIN');
    row = (await client.query('SELECT * FROM assisted_registrations WHERE reference=$1 FOR UPDATE', [reference])).rows[0];
    if (!row) throw fail(404, 'Assisted registration not found');
    if (row.status === 'paid') {
      await client.query('COMMIT');
      return {
        registration_paid: true,
        user_id: row.user_id,
        reference
      };
    }
    const confirmed = Number(payment.gateway_response?.amount_confirmed ?? payment.amount);
    if (!Number.isFinite(confirmed) || confirmed < Number(row.amount_due)) throw fail(409, 'The confirmed payment does not cover the registration fee');
    const q = row.quote;
    const definitions = [['general_platform_fee', q.base_amount, reference], ['lawyer_access_fee', q.lawyer_amount, reference + '_LAWYER_FEE'], ['agent_access_fee', q.agent_amount, reference + '_AGENT_FEE']];
    for (const [type, amount, ref] of definitions) {
      if (Number(amount) <= 0) continue;
      const inserted = await client.query(`INSERT INTO payments(user_id,payment_type,amount,currency,payment_method,transaction_reference,payment_status,gateway_response,completed_at) VALUES($1,$2,$3,'NGN',$4,$5,'completed',$6,NOW()) RETURNING id`, [row.user_id, type, amount, payment.payment_method, ref, JSON.stringify({
        ...payment.gateway_response,
        assisted_registration: true,
        collected_by: actor?.id || null
      })]);
      parts.push({
        id: inserted.rows[0].id,
        type
      });
    }
    await client.query(`UPDATE assisted_registrations SET status='paid',payment_id=$2,paid_at=NOW(),collection_method=$3,collected_by=$4,remittance_status=$5 WHERE reference=$1`, [reference, parts[0]?.id || null, payment.payment_method, actor?.id || null, payment.payment_method === 'cash' ? 'outstanding' : 'not_applicable']);
    await client.query(`UPDATE tenant_registration_payments SET registered_user_id=$2,payment_status='completed',payment_method=$3,gateway_response=$4,completed_at=NOW(),consumed_at=NOW() WHERE transaction_reference=$1`, [reference, row.user_id, payment.payment_method, JSON.stringify(payment.gateway_response || {})]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await reconcileBenefits(reference, logger);
  const customer = (await db.query('SELECT email FROM users WHERE id=$1', [row.user_id])).rows[0];
  if (customer?.email && parts[0]) require('../config/utils/paymentReceipt').sendReceiptForPayment(parts[0].id).catch(() => {});
  if (actor) await audit(actor, 'ASSISTED_CASH_COLLECTED', row.user_id, {
    reference,
    amount: row.amount_due
  });
  return {
    registration_paid: true,
    user_id: row.user_id,
    reference
  };
};
const reconcileBenefits = async (reference, logger = console) => {
  const client = await db.connect();
  try {
    const lock = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', ['assisted-benefits:' + reference])).rows[0];
    if (!lock?.acquired) return;
    const row = await getRecord(reference);
    if (!row || row.status !== 'paid' || row.benefits_completed_at) return;
    await db.query('UPDATE assisted_registrations SET benefits_last_attempt_at=NOW() WHERE reference=$1', [reference]);
    const location = {
      stateId: row.state_id,
      lgaName: row.lga_name
    };
    let lawyerId = null,
      agentId = null;
    if (Number(row.quote.lawyer_amount) > 0) {
      const existing = (await db.query("SELECT lawyer_user_id FROM legal_authorizations WHERE client_user_id=$1 AND property_id IS NULL AND status='active' ORDER BY id DESC LIMIT 1", [row.user_id])).rows[0];
      lawyerId = existing?.lawyer_user_id;
      if (!lawyerId) lawyerId = (await auth().assignLawyerRoundRobin({
        clientUserId: row.user_id,
        ...location
      }))?.assignedLawyer?.id || null;
    }
    if (Number(row.quote.agent_amount) > 0) {
      const existing = (await db.query("SELECT agent_user_id AS assigned_agent_id FROM landlord_agents WHERE landlord_user_id=$1 AND status='active' ORDER BY id DESC LIMIT 1", [row.user_id])).rows[0];
      agentId = existing?.assigned_agent_id;
      if (!agentId) {
        agentId = (await auth().assignAgentRoundRobin({
          landlordUserId: row.user_id,
          ...location
        }))?.assignedAgent?.id || null;
        if (agentId) await db.query('UPDATE assisted_registrations SET assigned_agent_id=$2 WHERE reference=$1', [reference, agentId]);
      }
    }
    if (Number(row.quote.lawyer_amount) > 0 && !lawyerId) throw new Error('Coverage assignment is waiting for an available provider');
    if (Number(row.quote.agent_amount) > 0 && !agentId) throw new Error('Agent assignment is waiting for an available provider');
    if (row.collection_method === 'cash' && row.remittance_status !== 'received') return;
    const commission = require('./commissionService');
    const parts = (await db.query('SELECT id,payment_type FROM payments WHERE transaction_reference=ANY($1::text[])', [[reference + '_LAWYER_FEE', reference + '_AGENT_FEE']])).rows;
    for (const part of parts) {
      const lawyer = part.payment_type === 'lawyer_access_fee';
      const table = lawyer ? 'lawyer_access_fee_distributions' : 'agent_access_fee_distributions';
      if ((await db.query('SELECT 1 FROM ' + table + ' WHERE payment_id=$1', [part.id])).rows.length) continue;
      const fn = lawyer ? commission.distributeLawyerAccessFee : commission.distributeAgentAccessFee;
      const result = await fn({
        paymentId: part.id,
        userId: row.user_id,
        assignedLawyerId: lawyerId,
        assignedAgentId: agentId,
        ...location
      });
      if (!result) throw new Error('Payment distribution is awaiting reconciliation');
    }
    await db.query('UPDATE assisted_registrations SET benefits_completed_at=NOW() WHERE reference=$1', [reference]);
  } catch (error) {
    logger.error('Assisted payment follow-up needs reconciliation', {
      reference,
      error: error.message
    });
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['assisted-benefits:' + reference]);
    } finally {
      client.release();
    }
  }
};
const reconcilePendingBenefits = async () => {
  const rows = (await db.query("SELECT reference FROM assisted_registrations WHERE status='paid' AND benefits_completed_at IS NULL AND (collection_method<>'cash' OR remittance_status='received') ORDER BY benefits_last_attempt_at ASC NULLS FIRST,paid_at LIMIT 50")).rows;
  for (const row of rows) await reconcileBenefits(row.reference);
};
const collectCash = async (actor, reference, body) => {
  const row = await recordForStaff(actor, reference);
  if (body.cash_received !== true || money(body.amount) !== Number(row.amount_due)) throw fail(400, 'Confirm receipt of the exact system-calculated cash amount');
  await settleVerifiedPayment({
    reference,
    actor,
    payment: {
      payment_status: 'completed',
      payment_method: 'cash',
      amount: row.amount_due,
      gateway_response: {
        amount_confirmed: Number(row.amount_due),
        collected_by: actor.id,
        note: String(body.note || '').slice(0, 500)
      }
    }
  });
  return recordForStaff(actor, reference);
};
const list = async (actor, search = '') => {
  const scope = scopeWhere(actor);
  const params = [...scope.params, '%' + String(search).trim().slice(0, 100) + '%'];
  return (await db.query(`SELECT ar.reference,ar.user_id,ar.staff_id,ar.status,ar.amount_due,ar.collection_method,ar.remittance_status,ar.created_at,u.full_name,u.phone,u.email,u.user_type,s.state_name,ar.lga_name FROM assisted_registrations ar JOIN users u ON u.id=ar.user_id JOIN states s ON s.id=ar.state_id WHERE (${scope.sql}) AND (u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR ar.reference ILIKE $${params.length}) ORDER BY ar.created_at DESC LIMIT 100`, params)).rows;
};
const remit = async (actor, reference) => {
  if (!supervisors.has(actor.user_type)) throw fail(403, 'Supervisor access required');
  const row = await recordForStaff(actor, reference);
  if (String(row.collected_by) === String(actor.id)) throw fail(403, 'A different supervisor must acknowledge the collected money');
  if(row.status!=='paid'||row.collection_method!=='cash')throw fail(409,'Only confirmed cash collections can be remitted');
  if(row.remittance_status==='received')return row;
  await db.query(`UPDATE assisted_registrations SET remittance_status='received',remitted_by=$2,remitted_at=NOW() WHERE reference=$1 AND status='paid' AND collection_method='cash' AND remittance_status='outstanding'`, [reference, actor.id]);
  await reconcileBenefits(reference);
  await audit(actor, 'ASSISTED_CASH_REMITTED', row.user_id, {
    reference
  });
  return recordForStaff(actor, reference);
};
const requestPhoneCode = async body => {
  const phone = phoneKey(body.phone);
  if (!phone) throw fail(400, 'Enter a valid phone number');
  const purpose = body.purpose === 'recovery' ? 'recovery' : 'access';
  const id = crypto.randomUUID();
  const count = (await db.query(`SELECT COUNT(*)::int AS count FROM assisted_phone_challenges WHERE phone_key=$1 AND created_at>NOW()-INTERVAL '10 minutes'`, [phone])).rows[0]?.count || 0;
  if (count >= 3) return {
    challenge_id: id,
    message: 'If this phone is eligible, a verification code will be sent.'
  };
  const users = (await db.query(`SELECT id,phone FROM users WHERE rentalhub_phone_key(phone)=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE AND user_type IN ('tenant','landlord') AND (assisted_registration=TRUE OR (phone_verified=TRUE AND email_verified=TRUE))`, [phone])).rows;
  const code = String(crypto.randomInt(100000, 1000000));
  await db.query(`INSERT INTO assisted_phone_challenges(id,phone_key,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '5 minutes')`, [id, phone, purpose, otpHash(id, code)]);
  if (users.length === 1) {
    try {
      const result = await require('../config/utils/smsService').sendSMS(users[0].phone, 'Your Amana RentalHub NG sign-in code is: ' + code + '. Valid for 5 minutes. Do not share this code with anyone, including support staff.', {
        purpose: 'otp_verification',
        verificationCode: code,
        expiresAt: Date.now() + 300000
      });
      if (!result.success) await db.query('UPDATE assisted_phone_challenges SET consumed_at=NOW() WHERE id=$1', [id]);
    } catch {
      await db.query('UPDATE assisted_phone_challenges SET consumed_at=NOW() WHERE id=$1', [id]);
    }
  }
  return {
    challenge_id: id,
    message: 'If this phone is eligible, a verification code will be sent.'
  };
};
const verifyPhoneCode = async (body, purpose = 'access') => {
  if (!/^[0-9a-f-]{36}$/i.test(body.challenge_id || '') || !/^\d{6}$/.test(String(body.code || ''))) throw fail(401, 'Invalid or expired verification code');
  const client = await db.connect();
  let phone,
    committed = false;
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM assisted_phone_challenges WHERE id=$1 FOR UPDATE', [body.challenge_id])).rows[0];
    if (!row || row.consumed_at || new Date(row.expires_at) <= new Date() || row.attempts >= 5 || row.purpose !== purpose) throw fail(401, 'Invalid or expired verification code');
    const actual = Buffer.from(otpHash(row.id, String(body.code)));
    const expected = Buffer.from(row.code_hash);
    await client.query('UPDATE assisted_phone_challenges SET attempts=attempts+1 WHERE id=$1', [row.id]);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      await client.query('COMMIT');
      committed = true;
      throw fail(401, 'Invalid or expired verification code');
    }
    await client.query('UPDATE assisted_phone_challenges SET consumed_at=NOW() WHERE id=$1', [row.id]);
    phone = row.phone_key;
    await client.query('COMMIT');
  } catch (error) {
    if (!committed) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const rows = (await db.query(`SELECT id,email,phone,full_name,user_type,email_verified,phone_verified,assisted_registration,is_active,deleted_at,approval_status,locked_until,token_version FROM users WHERE rentalhub_phone_key(phone)=$1 AND deleted_at IS NULL`, [phone])).rows;
  if (rows.length !== 1) throw fail(401, 'Unable to verify this account');
  const user = rows[0];
  if (user.deleted_at || user.is_active === false || user.approval_status === 'pending' || user.locked_until && new Date(user.locked_until) > new Date() || !['tenant', 'landlord'].includes(user.user_type) || !user.assisted_registration && (!user.email_verified || !user.phone_verified)) throw fail(401, 'Unable to verify this account');
  if (user.assisted_registration) {
    await db.query('UPDATE users SET phone_verified=TRUE WHERE id=$1', [user.id]);
    user.phone_verified = true;
  }
  return user;
};
const decorateUser = async user => {
  if (user.assisted_registration === true) {
    const row = await recordForUser(user.id);
    user.registration_payment_required = row.status !== 'paid';
  }
  return user;
};
const initializePayment = async (user, method) => {
  const row = await recordForUser(user.id);
  if (row.status === 'paid') return {
    paid: true
  };
  const registration = (await db.query('SELECT * FROM tenant_registration_payments WHERE transaction_reference=$1', [row.reference])).rows[0];
  if (method === 'paystack') {
    if (!row.email) throw fail(400, 'Card payments need your own email address. Use bank transfer or pay an authorized agent in cash.');
    if (!process.env.PAYSTACK_SECRET_KEY) throw fail(503, 'Card payments are unavailable');
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email: row.email,
      amount: Math.round(Number(row.amount_due) * 100),
      reference: row.reference,
      callback_url: require('../config/utils/frontendUrl').getFrontendUrl() + '/registration-payment',
      metadata: {
        assisted_registration: true,
        registration_reference: row.reference
      }
    }, {
      headers: {
        Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY
      },
      timeout: 15000
    });
    if (!response.data?.status) throw fail(502, 'Unable to initialize payment');
    await db.query(`UPDATE tenant_registration_payments SET payment_method='paystack' WHERE transaction_reference=$1`, [row.reference]);
    return {
      authorization_url: response.data.data.authorization_url,
      reference: row.reference
    };
  }
  let automatic = {
    available: false
  };
  try {
    automatic = await require('./virtualAccountService').createRegistrationAccount({
      registration
    });
  } catch (error) {
    console.error('Assisted transfer account unavailable', {
      reference: row.reference,
      error: error.message
    });
  }
  return {
    ...automatic,
    reference: row.reference,
    amount: row.amount_due,
    bank_accounts: await require('./bankTransferService').listActiveAccounts()
  };
};
const verifyPayment = async user => {
  const row = await recordForUser(user.id);
  if (row.status === 'paid') return {
    paid: true
  };
  if (!process.env.PAYSTACK_SECRET_KEY) throw fail(503, 'Card payment verification is unavailable');
  const response = await axios.get('https://api.paystack.co/transaction/verify/' + encodeURIComponent(row.reference), {
    headers: {
      Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY
    },
    timeout: 15000
  });
  const p = response.data?.data;
  if (!response.data?.status || p?.status !== 'success' || p.currency !== 'NGN' || p.reference !== row.reference || Number(p.amount) < Math.round(Number(row.amount_due) * 100)) throw fail(409, 'Payment has not been confirmed for this registration');
  await settleVerifiedPayment({
    reference: row.reference,
    payment: {
      payment_status: 'completed',
      payment_method: 'paystack',
      amount: Number(row.amount_due),
      gateway_response: {
        amount_confirmed: Number(p.amount) / 100,
        reference: p.reference
      }
    }
  });
  return {
    paid: true
  };
};
module.exports = {
  quote,
  create,
  list,
  recordForStaff,
  recordForUser,
  collectCash,
  remit,
  requestPhoneCode,
  verifyPhoneCode,
  decorateUser,
  initializePayment,
  verifyPayment,
  settleVerifiedPayment,
  scopeWhere,
  reconcilePendingBenefits
};
