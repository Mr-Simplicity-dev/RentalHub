const crypto = require('crypto');
const defaultDb = require('../config/middleware/database');
const defaultQrCode = require('qrcode');
const defaultActivityLogger = require('./activityLogger');
const defaultRealtimeEmitter = require('../config/utils/realtimeEmitter');
const { getFrontendUrl: defaultGetFrontendUrl } = require('../config/utils/frontendUrl');
const logger = require('../config/utils/logger');

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHALLENGE_TTL_SECONDS = 120;

const VERIFICATION_STATES = Object.freeze({
  ACTIVE_REGISTRATION: 'ACTIVE_REGISTRATION',
  LIVE_CONFIRMATION_SUCCESSFUL: 'LIVE_CONFIRMATION_SUCCESSFUL',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
  EXPIRED_STAFF_REGISTRATION: 'EXPIRED_STAFF_REGISTRATION',
  NOT_FOUND: 'NOT_FOUND',
});

const ENGAGEMENT_TYPES = Object.freeze({
  employee: 'Employee',
  contract_staff: 'Contract Staff',
  field_agent: 'Field Agent',
  volunteer: 'Volunteer',
  approved_representative: 'Approved Representative',
});

const APPROVED_ACTIVITY_CATALOG = Object.freeze([
  {
    code: 'coordinate_property_inspections',
    label: 'Coordinate property inspections',
    financial: false,
  },
  {
    code: 'assist_property_viewing',
    label: 'Assist with property viewing',
    financial: false,
  },
  {
    code: 'provide_platform_support',
    label: 'Provide approved platform support',
    financial: false,
  },
  {
    code: 'coordinate_scheduled_visits',
    label: 'Coordinate scheduled property visits',
    financial: false,
  },
  {
    code: 'assist_landlord_onboarding',
    label: 'Assist landlords with property onboarding',
    financial: false,
  },
  {
    code: 'verify_property_listings',
    label: 'Conduct property listing verification checks',
    financial: false,
  },
  {
    code: 'community_outreach_volunteer',
    label: 'Conduct approved community outreach and awareness',
    financial: false,
  },
  {
    code: 'coordinate_relocation_logistics',
    label: 'Coordinate approved relocation and transport logistics',
    financial: false,
  },
  {
    code: 'coordinate_fumigation_schedule',
    label: 'Coordinate approved fumigation and cleaning schedules',
    financial: false,
  },
  {
    code: 'assist_dispute_mediation',
    label: 'Facilitate approved platform dispute support',
    financial: false,
  },
]);

const ACTIVITY_MAP = new Map(APPROVED_ACTIVITY_CATALOG.map((item) => [item.code, item]));

const RESTRICTED_BY_DEFAULT_ACTIVITIES = Object.freeze([
  'Collect rent, deposits, or service fees into a personal bank account or wallet',
  'Sign binding contracts or alter property ownership records on behalf of Amana',
  'Make unauthorised financial or legal promises on behalf of Amana',
  'Collect sensitive identity documents outside approved RentalHub procedures',
]);

const IMPERSONATION_CATEGORIES = Object.freeze([
  'fake_identity',
  'stolen_staff_id',
  'photo_mismatch',
  'unauthorised_payment_request',
  'unauthorised_permissions_claimed',
  'refused_live_confirmation',
  'suspicious_or_rejected_request',
  'other',
]);

const PAYMENT_SAFETY_NOTICE = Object.freeze({
  title: 'IMPORTANT PAYMENT SAFETY NOTICE',
  paragraphs: [
    'Verifying an Amana staff member does not automatically authorise that person to collect rent, deposits, service fees or other payments on behalf of Amana.',
    "Always make payments through Amana's officially approved payment channels within the RentalHub platform.",
    "Never transfer money to a staff member's personal bank account or wallet based solely on their staff identity or verbal instructions.",
    'If anyone requests payment outside the official platform, stop and contact Amana through its official support channels.',
  ],
});

const FACE_MATCH_ADVISORY =
  'Live confirmation proves the registered Amana staff account intentionally approved this specific verification request. Always compare the person in front of you with the official registered photograph above when meeting physically.';

const ELIGIBLE_STAFF_USER_TYPES = Object.freeze([
  'admin',
  'agent',
  'marketing_agent',
  'lga_admin',
  'lga_support_admin',
  'lga_financial_admin',
  'lawyer',
  'fumigation_admin',
  'lga_fumigation_admin',
  'transportation_admin',
  'lga_transportation_admin',
  'state_admin',
  'state_support_admin',
  'state_financial_admin',
  'state_lawyer',
  'state_fumigation_admin',
  'state_transportation_admin',
  'zonal_admin',
  'zonal_financial_admin',
  'zonal_lawyer',
  'zonal_fumigation_admin',
  'zonal_transportation_admin',
  'super_admin',
  'super_support_admin',
  'super_financial_admin',
  'super_lawyer',
  'super_fumigation_admin',
  'super_transportation_admin',
  'financial_admin',
  'recruitment_admin',
]);

class StaffVerificationError extends Error {
  constructor(status, message, code = 'STAFF_VERIFICATION_ERROR', extra = {}) {
    super(message);
    this.name = 'StaffVerificationError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const randomFromAlphabet = (length) => {
  const bytes = crypto.randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
};

const generateStaffVerificationId = () =>
  `AMN-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;

const generateChallengeReference = () => `CHK-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;

const generateShortChallengeCode = () => `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;

const generateReportReference = () => `IMP-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;

const sha256Hex = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex');

const timingSafeHashEquals = (rawSecret, expectedHash) => {
  if (!rawSecret || !expectedHash) return false;
  const computed = sha256Hex(rawSecret);
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(String(expectedHash), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const normalizeCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');

const parseStaffLookupInput = (rawInput) => {
  const raw = String(rawInput || '').trim();
  if (!raw || raw.length > 512) return null;

  // Handle QR payload URL like https://rentalhub.com.ng/verify-staff/AMN-XXXX-XXXX-XXXX or ?id=...
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const queryId = parsed.searchParams.get('id') || parsed.searchParams.get('staff_id');
      if (queryId) return parseStaffLookupInput(queryId);
      const match = parsed.pathname.match(/\/verify-staff\/([A-Za-z0-9-]{6,32})\/?$/i);
      if (match) return normalizeCode(match[1]);
    } catch {
      return null;
    }
  }

  // Handle prefixed payload amana-staff:AMN-XXXX-XXXX-XXXX
  if (/^amana-staff:/i.test(raw)) {
    return parseStaffLookupInput(raw.slice('amana-staff:'.length));
  }

  // Handle JSON QR payload {"staff_verification_id":"AMN-..."}
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw);
      const id = obj.staff_verification_id || obj.staffId || obj.id;
      if (id) return parseStaffLookupInput(id);
    } catch {
      return null;
    }
  }

  const normalized = normalizeCode(raw);
  if (!/^[A-Z0-9-]{6,32}$/.test(normalized)) return null;
  return normalized;
};

const parseChallengeInput = (rawInput) => {
  const raw = String(rawInput || '').trim();
  if (!raw || raw.length > 512) return { token: null, shortCode: null };

  if (/^amana-staff-challenge:/i.test(raw)) {
    const token = raw.slice('amana-staff-challenge:'.length).trim();
    if (/^[A-Za-z0-9_-]{16,128}$/.test(token)) return { token, shortCode: null };
  }

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(parsed.token.trim())) {
        return { token: parsed.token.trim(), shortCode: null };
      }
      if (typeof parsed.short_code === 'string') {
        return parseChallengeInput(parsed.short_code);
      }
    } catch {
      return { token: null, shortCode: null };
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const token = url.searchParams.get('challenge_token') || url.searchParams.get('token');
      if (token && /^[A-Za-z0-9_-]{16,128}$/.test(token.trim())) {
        return { token: token.trim(), shortCode: null };
      }
    } catch {
      return { token: null, shortCode: null };
    }
  }

  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{8}$/.test(stripped)) {
    return { token: null, shortCode: `${stripped.slice(0, 4)}-${stripped.slice(4)}` };
  }

  return { token: null, shortCode: null };
};

const sanitizeApprovedActivities = (input) => {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set();
  const result = [];
  for (const item of arr) {
    const code = typeof item === 'string' ? item.trim() : String(item?.code || '').trim();
    if (!code || seen.has(code) || !ACTIVITY_MAP.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
};

const formatApprovedActivities = (codes) => {
  const list = Array.isArray(codes) ? codes : [];
  return list
    .map((code) => ACTIVITY_MAP.get(typeof code === 'string' ? code : code?.code))
    .filter(Boolean)
    .map((item) => ({ code: item.code, label: item.label }));
};

const evaluateStaffRegistrationState = (identity, now = new Date()) => {
  if (!identity) return VERIFICATION_STATES.NOT_FOUND;
  if (identity.status === 'pending_approval' || identity.status === 'rejected') {
    return VERIFICATION_STATES.NOT_FOUND;
  }
  if (identity.status === 'revoked') return VERIFICATION_STATES.REVOKED;
  if (identity.status === 'suspended') return VERIFICATION_STATES.SUSPENDED;
  if (identity.status === 'active') {
    if (identity.expires_at && new Date(identity.expires_at).getTime() <= now.getTime()) {
      return VERIFICATION_STATES.EXPIRED_STAFF_REGISTRATION;
    }
    if (identity.valid_from && new Date(identity.valid_from).getTime() > now.getTime()) {
      return VERIFICATION_STATES.NOT_FOUND;
    }
    return VERIFICATION_STATES.ACTIVE_REGISTRATION;
  }
  return VERIFICATION_STATES.NOT_FOUND;
};

const toPublicStaffProfile = (identity, now = new Date()) => {
  const state = evaluateStaffRegistrationState(identity, now);
  if (state === VERIFICATION_STATES.NOT_FOUND) return null;

  const isActive = state === VERIFICATION_STATES.ACTIVE_REGISTRATION;

  return {
    staff_verification_id: identity.staff_verification_id,
    full_name: identity.full_name,
    official_photo_url: identity.official_photo_url || null,
    official_role: identity.official_role,
    department: identity.department,
    engagement_type: identity.engagement_type,
    engagement_type_label:
      ENGAGEMENT_TYPES[identity.engagement_type] || 'Approved Representative',
    registration_status: state === VERIFICATION_STATES.EXPIRED_STAFF_REGISTRATION
      ? 'expired'
      : identity.status,
    verification_state: state,
    approved_activities: isActive ? formatApprovedActivities(identity.approved_activities) : [],
    restricted_by_default: RESTRICTED_BY_DEFAULT_ACTIVITIES,
    financial_collection_authorized: Boolean(
      isActive && identity.financial_collection_authorized === true
    ),
    valid_from: identity.valid_from || null,
    expires_at: identity.expires_at || null,
    can_request_live_confirmation: isActive,
  };
};

const toAdminStaffIdentity = (row, now = new Date()) => ({
  id: row.id,
  user_id: row.user_id,
  staff_verification_id: row.staff_verification_id,
  full_name: row.full_name,
  official_photo_url: row.official_photo_url || null,
  official_role: row.official_role,
  department: row.department,
  engagement_type: row.engagement_type,
  engagement_type_label:
    ENGAGEMENT_TYPES[row.engagement_type] || 'Approved Representative',
  status: row.status,
  effective_state: evaluateStaffRegistrationState(row, now),
  approved_activities: sanitizeApprovedActivities(row.approved_activities),
  approved_activities_detailed: formatApprovedActivities(row.approved_activities),
  financial_collection_authorized: Boolean(row.financial_collection_authorized),
  valid_from: row.valid_from || null,
  expires_at: row.expires_at || null,
  status_reason: row.status_reason || null,
  approved_by: row.approved_by || null,
  approved_at: row.approved_at || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  account_email: row.account_email || null,
  account_user_type: row.account_user_type || null,
  account_full_name: row.account_full_name || null,
  account_active: typeof row.account_active === 'boolean' ? row.account_active : undefined,
});

const sanitizeOptionalPhotoUrl = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('/uploads/staff-photos/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    throw new StaffVerificationError(400, 'Invalid photograph URL format.', 'INVALID_PHOTO_URL');
  }
  throw new StaffVerificationError(400, 'Photograph URL must use http(s) or approved upload path.', 'INVALID_PHOTO_URL');
};

function createStaffIdentityService(deps = {}) {
  const db = deps.db || defaultDb;
  const qrcode = deps.qrcode || defaultQrCode;
  const activityLogger = deps.activityLogger || defaultActivityLogger;
  const realtimeEmitter = deps.realtimeEmitter || defaultRealtimeEmitter;
  const getFrontendUrl = deps.getFrontendUrl || defaultGetFrontendUrl;

  const buildPublicVerifyUrl = (staffVerificationId) => {
    const base = String(getFrontendUrl() || 'https://rentalhub.com.ng').replace(/\/+$/, '');
    return `${base}/verify-staff/${encodeURIComponent(staffVerificationId)}`;
  };

  const renderQrDataUrl = async (payload) => {
    try {
      return await qrcode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      });
    } catch (err) {
      logger.warn('QR data URL generation failed:', err.message);
      return null;
    }
  };

  const logVerificationEvent = async (
    queryable,
    { staffIdentityId = null, challengeId = null, eventType, actorUserId = null, lookupIdentifier = null, outcome = null, ip = null, metadata = {} }
  ) => {
    try {
      await queryable.query(
        `INSERT INTO staff_verification_events
          (staff_identity_id, challenge_id, event_type, actor_user_id, lookup_identifier_hash, outcome, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          staffIdentityId,
          challengeId,
          eventType,
          actorUserId,
          lookupIdentifier ? sha256Hex(lookupIdentifier) : null,
          outcome,
          ip ? String(ip).slice(0, 64) : null,
          JSON.stringify(metadata || {}),
        ]
      );
    } catch (err) {
      logger.error('Failed to record staff_verification_events:', err.message);
    }
  };

  const createInAppNotification = async ({ userId, title, message, type = 'staff_verification', link = '/my-staff-identity' }) => {
    if (!userId) return;
    try {
      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, link, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
        [userId, title, message, type, link]
      );
    } catch (err) {
      logger.warn('Staff verification notification insert skipped:', err.message);
    }
  };

  const notifySuperAdmins = async ({ title, message, link = '/super-admin?tab=staff_identity' }) => {
    try {
      const admins = await db.query(
        `SELECT id FROM users WHERE user_type = 'super_admin' AND is_active = TRUE`
      );
      for (const admin of admins.rows) {
        await createInAppNotification({
          userId: admin.id,
          title,
          message,
          type: 'staff_impersonation_report',
          link,
        });
      }
      realtimeEmitter.emitToRole('super_admin', 'staff_impersonation_report', {
        title,
        message,
        link,
      });
    } catch (err) {
      logger.warn('Super-admin impersonation notification skipped:', err.message);
    }
  };

  // ---------------- PUBLIC VERIFICATION ----------------

  const lookupPublicStaff = async (rawStaffInput, { ip = null } = {}) => {
    const normalizedId = parseStaffLookupInput(rawStaffInput);
    if (!normalizedId) {
      await logVerificationEvent(db, {
        eventType: 'public_lookup_not_found',
        lookupIdentifier: rawStaffInput,
        outcome: VERIFICATION_STATES.NOT_FOUND,
        ip,
        metadata: { reason: 'malformed_id' },
      });
      return {
        verification_state: VERIFICATION_STATES.NOT_FOUND,
        staff_profile: null,
        face_match_advisory: FACE_MATCH_ADVISORY,
        payment_safety_notice: PAYMENT_SAFETY_NOTICE,
      };
    }

    const res = await db.query(
      `SELECT id, user_id, staff_verification_id, full_name, official_photo_url,
              official_role, department, engagement_type, status,
              approved_activities, financial_collection_authorized,
              valid_from, expires_at
       FROM staff_identities
       WHERE UPPER(staff_verification_id) = $1
       LIMIT 1`,
      [normalizedId]
    );

    const row = res.rows[0] || null;
    const now = new Date();
    const state = evaluateStaffRegistrationState(row, now);
    const publicProfile = toPublicStaffProfile(row, now);

    await logVerificationEvent(db, {
      staffIdentityId: row && state !== VERIFICATION_STATES.NOT_FOUND ? row.id : null,
      eventType:
        state === VERIFICATION_STATES.NOT_FOUND ? 'public_lookup_not_found' : 'public_lookup',
      lookupIdentifier: normalizedId,
      outcome: state,
      ip,
    });

    return {
      verification_state: state,
      staff_profile: publicProfile,
      face_match_advisory: FACE_MATCH_ADVISORY,
      payment_safety_notice: PAYMENT_SAFETY_NOTICE,
    };
  };

  const createLiveChallenge = async ({ staffIdInput, purpose, ip = null, userAgent = null }) => {
    const normalizedId = parseStaffLookupInput(staffIdInput);
    const cleanPurpose = String(purpose || '').trim().replace(/\s+/g, ' ');

    if (!normalizedId) {
      throw new StaffVerificationError(400, 'A valid Amana Staff Verification ID is required.', 'INVALID_STAFF_ID');
    }
    if (!cleanPurpose || cleanPurpose.length < 3 || cleanPurpose.length > 280) {
      throw new StaffVerificationError(
        400,
        'Please specify the verification purpose (3 to 280 characters).',
        'INVALID_PURPOSE'
      );
    }

    const res = await db.query(
      `SELECT id, user_id, staff_verification_id, full_name, status, valid_from, expires_at
       FROM staff_identities
       WHERE UPPER(staff_verification_id) = $1
       LIMIT 1`,
      [normalizedId]
    );

    const identity = res.rows[0] || null;
    const state = evaluateStaffRegistrationState(identity, new Date());

    if (state === VERIFICATION_STATES.NOT_FOUND) {
      throw new StaffVerificationError(
        404,
        'Staff verification record not found.',
        VERIFICATION_STATES.NOT_FOUND,
        { verification_state: VERIFICATION_STATES.NOT_FOUND }
      );
    }
    if (state !== VERIFICATION_STATES.ACTIVE_REGISTRATION) {
      throw new StaffVerificationError(
        403,
        `Live confirmation cannot be initiated because this staff registration is ${state.toLowerCase().replace(/_/g, ' ')}.`,
        state,
        { verification_state: state }
      );
    }

    const challengeReference = generateChallengeReference();
    const shortCode = generateShortChallengeCode();
    const challengeToken = crypto.randomBytes(24).toString('base64url');
    const visitorPollToken = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);

    const inserted = await db.query(
      `INSERT INTO staff_verification_challenges (
         staff_identity_id,
         challenge_reference,
         challenge_code_hash,
         challenge_token_hash,
         visitor_poll_token_hash,
         purpose,
         status,
         expires_at,
         requester_ip,
         requester_user_agent
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
       RETURNING id, challenge_reference, purpose, status, expires_at, created_at`,
      [
        identity.id,
        challengeReference,
        sha256Hex(shortCode),
        sha256Hex(challengeToken),
        sha256Hex(visitorPollToken),
        cleanPurpose,
        expiresAt,
        ip ? String(ip).slice(0, 64) : null,
        userAgent ? String(userAgent).slice(0, 255) : null,
      ]
    );

    const challenge = inserted.rows[0];
    const qrPayload = `amana-staff-challenge:${challengeToken}`;
    const qrDataUrl = await renderQrDataUrl(qrPayload);

    await logVerificationEvent(db, {
      staffIdentityId: identity.id,
      challengeId: challenge.id,
      eventType: 'challenge_created',
      outcome: VERIFICATION_STATES.PENDING,
      ip,
      metadata: {
        challenge_reference: challenge.challenge_reference,
        purpose: cleanPurpose,
      },
    });

    await createInAppNotification({
      userId: identity.user_id,
      title: 'Live Staff Identity Confirmation Request',
      message: `A visitor requested live identity confirmation (${challenge.challenge_reference}) for: "${cleanPurpose}". Review and respond in My Staff Identity before it expires.`,
      type: 'staff_verification_challenge',
      link: '/my-staff-identity',
    });

    realtimeEmitter.emitToUser(identity.user_id, 'staff_verification_challenge', {
      challenge_reference: challenge.challenge_reference,
      purpose: cleanPurpose,
      expires_at: challenge.expires_at,
      created_at: challenge.created_at,
    });

    return {
      challenge_reference: challenge.challenge_reference,
      short_code: shortCode,
      qr_payload: qrPayload,
      qr_data_url: qrDataUrl,
      visitor_poll_token: visitorPollToken,
      purpose: challenge.purpose,
      expires_at: challenge.expires_at,
      expires_in_seconds: CHALLENGE_TTL_SECONDS,
      verification_state: VERIFICATION_STATES.PENDING,
      face_match_advisory: FACE_MATCH_ADVISORY,
      payment_safety_notice: PAYMENT_SAFETY_NOTICE,
    };
  };

  const getPublicChallengeStatus = async ({ challengeReference, pollToken }) => {
    const ref = normalizeCode(challengeReference);
    if (!ref || !pollToken) {
      throw new StaffVerificationError(400, 'Challenge reference and verification token are required.', 'INVALID_CHALLENGE_POLL');
    }

    const res = await db.query(
      `SELECT c.id, c.challenge_reference, c.visitor_poll_token_hash, c.purpose, c.status,
              c.expires_at, c.responded_at, c.created_at,
              si.id AS staff_identity_id, si.staff_verification_id, si.full_name,
              si.official_photo_url, si.official_role, si.department, si.engagement_type,
              si.status AS staff_status, si.approved_activities,
              si.financial_collection_authorized, si.valid_from, si.expires_at AS staff_expires_at
       FROM staff_verification_challenges c
       INNER JOIN staff_identities si ON si.id = c.staff_identity_id
       WHERE c.challenge_reference = $1
       LIMIT 1`,
      [ref]
    );

    const row = res.rows[0];
    if (!row || !timingSafeHashEquals(pollToken, row.visitor_poll_token_hash)) {
      throw new StaffVerificationError(404, 'Verification challenge not found.', VERIFICATION_STATES.NOT_FOUND);
    }

    const now = new Date();
    const staffIdentityObj = {
      id: row.staff_identity_id,
      staff_verification_id: row.staff_verification_id,
      full_name: row.full_name,
      official_photo_url: row.official_photo_url,
      official_role: row.official_role,
      department: row.department,
      engagement_type: row.engagement_type,
      status: row.staff_status,
      approved_activities: row.approved_activities,
      financial_collection_authorized: row.financial_collection_authorized,
      valid_from: row.valid_from,
      expires_at: row.staff_expires_at,
    };

    const staffState = evaluateStaffRegistrationState(staffIdentityObj, now);
    const staffProfile = toPublicStaffProfile(staffIdentityObj, now);

    // Authoritative server-side re-check: suspended/revoked/expired staff NEVER show as confirmed
    if (staffState !== VERIFICATION_STATES.ACTIVE_REGISTRATION) {
      if (row.status === 'pending') {
        await db.query(
          `UPDATE staff_verification_challenges
           SET status = 'cancelled', response_note = $1
           WHERE id = $2 AND status = 'pending'`,
          [`Blocked: staff status is ${staffState}`, row.id]
        );
      }
      return {
        challenge_reference: row.challenge_reference,
        verification_state: staffState,
        purpose: row.purpose,
        expires_at: row.expires_at,
        responded_at: row.responded_at || null,
        staff_profile: staffProfile,
        face_match_advisory: FACE_MATCH_ADVISORY,
        payment_safety_notice: PAYMENT_SAFETY_NOTICE,
      };
    }

    let finalState = VERIFICATION_STATES.PENDING;
    if (row.status === 'confirmed') {
      finalState = VERIFICATION_STATES.LIVE_CONFIRMATION_SUCCESSFUL;
    } else if (row.status === 'rejected') {
      finalState = VERIFICATION_STATES.REJECTED;
    } else if (row.status === 'expired' || row.status === 'cancelled') {
      finalState = VERIFICATION_STATES.EXPIRED;
    } else if (row.status === 'pending' && new Date(row.expires_at).getTime() <= now.getTime()) {
      await db.query(
        `UPDATE staff_verification_challenges
         SET status = 'expired'
         WHERE id = $1 AND status = 'pending'`,
        [row.id]
      );
      await logVerificationEvent(db, {
        staffIdentityId: row.staff_identity_id,
        challengeId: row.id,
        eventType: 'challenge_expired',
        outcome: VERIFICATION_STATES.EXPIRED,
        metadata: { challenge_reference: row.challenge_reference },
      });
      finalState = VERIFICATION_STATES.EXPIRED;
    }

    return {
      challenge_reference: row.challenge_reference,
      verification_state: finalState,
      purpose: row.purpose,
      expires_at: row.expires_at,
      responded_at: row.responded_at || null,
      staff_profile: staffProfile,
      face_match_advisory: FACE_MATCH_ADVISORY,
      payment_safety_notice: PAYMENT_SAFETY_NOTICE,
    };
  };

  // ---------------- AUTHENTICATED STAFF ENDPOINTS ----------------

  const getMyStaffIdentity = async (userId) => {
    const res = await db.query(
      `SELECT si.*, u.email AS account_email, u.user_type AS account_user_type, u.full_name AS account_full_name
       FROM staff_identities si
       INNER JOIN users u ON u.id = si.user_id
       WHERE si.user_id = $1
       LIMIT 1`,
      [userId]
    );

    const row = res.rows[0];
    if (!row) {
      return {
        registered: false,
        identity: null,
        pending_challenges: [],
        history: [],
      };
    }

    // Expire stale pending challenges for this staff identity
    await db.query(
      `UPDATE staff_verification_challenges
       SET status = 'expired'
       WHERE staff_identity_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
      [row.id]
    );

    const [pendingRes, historyRes] = await Promise.all([
      db.query(
        `SELECT challenge_reference, purpose, status, expires_at, created_at
         FROM staff_verification_challenges
         WHERE staff_identity_id = $1 AND status = 'pending' AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 20`,
        [row.id]
      ),
      db.query(
        `SELECT challenge_reference, purpose, status, expires_at, responded_at, created_at
         FROM staff_verification_challenges
         WHERE staff_identity_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [row.id]
      ),
    ]);

    const verifyUrl = buildPublicVerifyUrl(row.staff_verification_id);
    const qrDataUrl = await renderQrDataUrl(verifyUrl);

    return {
      registered: true,
      identity: {
        ...toAdminStaffIdentity(row),
        verify_url: verifyUrl,
        qr_data_url: qrDataUrl,
      },
      pending_challenges: pendingRes.rows,
      history: historyRes.rows,
    };
  };

  const lookupMyChallengeByCode = async ({ userId, input }) => {
    const { token, shortCode } = parseChallengeInput(input);
    if (!token && !shortCode) {
      throw new StaffVerificationError(
        400,
        'Enter a valid 8-character verification code or scan the visitor challenge QR code.',
        'INVALID_CHALLENGE_INPUT'
      );
    }

    const identityRes = await db.query(
      `SELECT id, status, valid_from, expires_at FROM staff_identities WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const myIdentity = identityRes.rows[0];
    if (!myIdentity) {
      throw new StaffVerificationError(403, 'Your account does not have a registered Amana Staff Identity.', 'NO_STAFF_IDENTITY');
    }

    const whereCol = token ? 'challenge_token_hash' : 'challenge_code_hash';
    const hash = sha256Hex(token || shortCode);

    const res = await db.query(
      `SELECT id, staff_identity_id, challenge_reference, purpose, status, expires_at, created_at
       FROM staff_verification_challenges
       WHERE ${whereCol} = $1
       LIMIT 1`,
      [hash]
    );

    const challenge = res.rows[0];
    if (!challenge) {
      throw new StaffVerificationError(404, 'Verification request not found.', 'CHALLENGE_NOT_FOUND');
    }

    if (Number(challenge.staff_identity_id) !== Number(myIdentity.id)) {
      await logVerificationEvent(db, {
        staffIdentityId: challenge.staff_identity_id,
        challengeId: challenge.id,
        eventType: 'challenge_blocked_wrong_staff',
        actorUserId: userId,
        outcome: 'FORBIDDEN',
        metadata: { challenge_reference: challenge.challenge_reference },
      });
      throw new StaffVerificationError(
        403,
        'This verification request belongs to a different staff identity and cannot be accessed from your account.',
        'WRONG_STAFF_OWNER'
      );
    }

    if (challenge.status === 'pending' && new Date(challenge.expires_at).getTime() <= Date.now()) {
      await db.query(
        `UPDATE staff_verification_challenges SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [challenge.id]
      );
      throw new StaffVerificationError(410, 'This verification challenge has expired.', VERIFICATION_STATES.EXPIRED);
    }

    if (challenge.status !== 'pending') {
      throw new StaffVerificationError(
        409,
        `This verification request has already been ${challenge.status}.`,
        'CHALLENGE_ALREADY_USED'
      );
    }

    return {
      challenge_reference: challenge.challenge_reference,
      purpose: challenge.purpose,
      status: challenge.status,
      expires_at: challenge.expires_at,
      created_at: challenge.created_at,
    };
  };

  const respondToChallenge = async ({ userId, challengeReference, decision, note = '', ip = null }) => {
    const ref = normalizeCode(challengeReference);
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    if (!ref) {
      throw new StaffVerificationError(400, 'Challenge reference is required.', 'INVALID_CHALLENGE_REFERENCE');
    }
    if (!['confirm', 'reject'].includes(normalizedDecision)) {
      throw new StaffVerificationError(400, 'Decision must be either "confirm" or "reject".', 'INVALID_DECISION');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT c.id, c.staff_identity_id, c.challenge_reference, c.purpose, c.status, c.expires_at,
                si.user_id AS staff_user_id, si.status AS staff_status,
                si.valid_from AS staff_valid_from, si.expires_at AS staff_expires_at,
                si.staff_verification_id
         FROM staff_verification_challenges c
         INNER JOIN staff_identities si ON si.id = c.staff_identity_id
         WHERE c.challenge_reference = $1
         FOR UPDATE OF c, si`,
        [ref]
      );

      const row = lockRes.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new StaffVerificationError(404, 'Verification challenge not found.', 'CHALLENGE_NOT_FOUND');
      }

      if (Number(row.staff_user_id) !== Number(userId)) {
        await client.query('ROLLBACK');
        await logVerificationEvent(db, {
          staffIdentityId: row.staff_identity_id,
          challengeId: row.id,
          eventType: 'challenge_blocked_wrong_staff',
          actorUserId: userId,
          outcome: 'FORBIDDEN',
          ip,
          metadata: { challenge_reference: row.challenge_reference },
        });
        throw new StaffVerificationError(
          403,
          'You are not authorised to respond to another staff member\'s verification request.',
          'WRONG_STAFF_OWNER'
        );
      }

      if (row.status !== 'pending') {
        await client.query('ROLLBACK');
        throw new StaffVerificationError(
          409,
          `This verification challenge has already been ${row.status} and cannot be reused.`,
          'CHALLENGE_ALREADY_USED'
        );
      }

      const now = new Date();
      if (new Date(row.expires_at).getTime() <= now.getTime()) {
        await client.query(
          `UPDATE staff_verification_challenges SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
          [row.id]
        );
        await logVerificationEvent(client, {
          staffIdentityId: row.staff_identity_id,
          challengeId: row.id,
          eventType: 'challenge_expired',
          actorUserId: userId,
          outcome: VERIFICATION_STATES.EXPIRED,
          ip,
          metadata: { challenge_reference: row.challenge_reference },
        });
        await client.query('COMMIT');
        throw new StaffVerificationError(410, 'This verification challenge has expired.', VERIFICATION_STATES.EXPIRED);
      }

      const staffState = evaluateStaffRegistrationState(
        {
          status: row.staff_status,
          valid_from: row.staff_valid_from,
          expires_at: row.staff_expires_at,
        },
        now
      );

      if (staffState !== VERIFICATION_STATES.ACTIVE_REGISTRATION) {
        await client.query(
          `UPDATE staff_verification_challenges
           SET status = 'cancelled', response_note = $1
           WHERE id = $2 AND status = 'pending'`,
          [`Blocked: staff status is ${staffState}`, row.id]
        );
        await logVerificationEvent(client, {
          staffIdentityId: row.staff_identity_id,
          challengeId: row.id,
          eventType: 'challenge_blocked_status',
          actorUserId: userId,
          outcome: staffState,
          ip,
          metadata: { challenge_reference: row.challenge_reference, staff_state: staffState },
        });
        await client.query('COMMIT');
        throw new StaffVerificationError(
          403,
          `Confirmation is blocked because your staff identity status is ${staffState.toLowerCase().replace(/_/g, ' ')}.`,
          staffState,
          { verification_state: staffState }
        );
      }

      const nextStatus = normalizedDecision === 'confirm' ? 'confirmed' : 'rejected';
      const cleanNote = String(note || '').trim().slice(0, 280) || null;

      const updateRes = await client.query(
        `UPDATE staff_verification_challenges
         SET status = $1, responded_at = NOW(), responded_by = $2, response_note = $3
         WHERE id = $4 AND status = 'pending'
         RETURNING id, challenge_reference, status, responded_at, purpose`,
        [nextStatus, userId, cleanNote, row.id]
      );

      if (updateRes.rowCount !== 1) {
        await client.query('ROLLBACK');
        throw new StaffVerificationError(
          409,
          'This verification challenge was already processed.',
          'CHALLENGE_ALREADY_USED'
        );
      }

      const outcomeState =
        nextStatus === 'confirmed'
          ? VERIFICATION_STATES.LIVE_CONFIRMATION_SUCCESSFUL
          : VERIFICATION_STATES.REJECTED;

      await logVerificationEvent(client, {
        staffIdentityId: row.staff_identity_id,
        challengeId: row.id,
        eventType: nextStatus === 'confirmed' ? 'challenge_confirmed' : 'challenge_rejected',
        actorUserId: userId,
        outcome: outcomeState,
        ip,
        metadata: { challenge_reference: row.challenge_reference },
      });

      await client.query('COMMIT');

      const updated = updateRes.rows[0];
      return {
        challenge_reference: updated.challenge_reference,
        status: updated.status,
        verification_state: outcomeState,
        responded_at: updated.responded_at,
        purpose: updated.purpose,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Already rolled back or committed
      }
      throw err;
    } finally {
      client.release();
    }
  };

  // ---------------- IMPERSONATION REPORTING ----------------

  const createImpersonationReport = async ({
    reportedStaffId = '',
    challengeReference = '',
    category,
    description,
    incidentLocation = '',
    reporterName = '',
    reporterContact = '',
    ip = null,
  }) => {
    const cleanCategory = String(category || '').trim().toLowerCase();
    const cleanDescription = String(description || '').trim();
    if (!IMPERSONATION_CATEGORIES.includes(cleanCategory)) {
      throw new StaffVerificationError(400, 'Please select a valid impersonation report reason.', 'INVALID_CATEGORY');
    }
    if (cleanDescription.length < 10 || cleanDescription.length > 2000) {
      throw new StaffVerificationError(
        400,
        'Please provide clear incident details (10 to 2000 characters).',
        'INVALID_DESCRIPTION'
      );
    }

    const parsedStaffId = reportedStaffId ? parseStaffLookupInput(reportedStaffId) : null;
    let staffIdentityId = null;
    if (parsedStaffId) {
      const lookup = await db.query(
        `SELECT id FROM staff_identities WHERE UPPER(staff_verification_id) = $1 LIMIT 1`,
        [parsedStaffId]
      );
      staffIdentityId = lookup.rows[0]?.id || null;
    }

    const reportReference = generateReportReference();
    const cleanChallengeRef = challengeReference ? normalizeCode(challengeReference).slice(0, 32) : null;

    const inserted = await db.query(
      `INSERT INTO staff_impersonation_reports (
         report_reference,
         staff_identity_id,
         reported_staff_id,
         challenge_reference,
         category,
         description,
         incident_location,
         reporter_name,
         reporter_contact,
         status,
         ip_address
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
       RETURNING id, report_reference, category, status, created_at`,
      [
        reportReference,
        staffIdentityId,
        parsedStaffId || (reportedStaffId ? String(reportedStaffId).trim().slice(0, 64) : null),
        cleanChallengeRef,
        cleanCategory,
        cleanDescription,
        String(incidentLocation || '').trim().slice(0, 200) || null,
        String(reporterName || '').trim().slice(0, 150) || null,
        String(reporterContact || '').trim().slice(0, 150) || null,
        ip ? String(ip).slice(0, 64) : null,
      ]
    );

    const report = inserted.rows[0];
    await logVerificationEvent(db, {
      staffIdentityId,
      eventType: 'impersonation_reported',
      outcome: 'OPEN',
      ip,
      metadata: {
        report_reference: report.report_reference,
        category: cleanCategory,
      },
    });

    await notifySuperAdmins({
      title: `Suspected Staff Impersonation Report (${report.report_reference})`,
      message: `Category: ${cleanCategory.replace(/_/g, ' ')}. Staff ID referenced: ${parsedStaffId || 'Not supplied'}. Open Staff Identity Management to investigate.`,
    });

    // Return ONLY safe public receipt — never echo complainant contact back publicly
    return {
      report_reference: report.report_reference,
      category: report.category,
      status: report.status,
      created_at: report.created_at,
    };
  };

  // ---------------- SUPER-ADMIN MANAGEMENT ----------------

  const searchEligibleUsers = async ({ search = '', limit = 30 } = {}) => {
    const cleanSearch = String(search || '').trim();
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const params = [ELIGIBLE_STAFF_USER_TYPES];
    let searchSql = '';
    if (cleanSearch) {
      params.push(`%${cleanSearch}%`);
      searchSql = `AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.user_type ILIKE $${params.length})`;
    }
    params.push(safeLimit);

    const res = await db.query(
      `SELECT u.id, u.full_name, u.email, u.user_type, u.is_active,
              si.id AS staff_identity_id, si.staff_verification_id, si.status AS staff_identity_status
       FROM users u
       LEFT JOIN staff_identities si ON si.user_id = u.id
       WHERE u.user_type = ANY($1::text[])
       ${searchSql}
       ORDER BY (si.id IS NULL) DESC, u.full_name ASC
       LIMIT $${params.length}`,
      params
    );
    return res.rows;
  };

  const listStaffIdentities = async ({ status = '', search = '', limit = 50, offset = 0 } = {}) => {
    const conditions = [];
    const params = [];

    if (status && ['pending_approval', 'active', 'suspended', 'revoked', 'rejected'].includes(status)) {
      params.push(status);
      conditions.push(`si.status = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(
        `(si.full_name ILIKE $${params.length} OR si.staff_verification_id ILIKE $${params.length} OR si.department ILIKE $${params.length} OR si.official_role ILIKE $${params.length} OR u.email ILIKE $${params.length})`
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    params.push(safeLimit, safeOffset);

    const res = await db.query(
      `SELECT si.*, u.email AS account_email, u.user_type AS account_user_type,
              u.full_name AS account_full_name, u.is_active AS account_active
       FROM staff_identities si
       INNER JOIN users u ON u.id = si.user_id
       ${where}
       ORDER BY si.updated_at DESC, si.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const now = new Date();
    return res.rows.map((row) => ({
      ...toAdminStaffIdentity(row, now),
      verify_url: buildPublicVerifyUrl(row.staff_verification_id),
    }));
  };

  const createStaffIdentity = async ({
    userId,
    fullName,
    officialRole,
    department,
    engagementType,
    approvedActivities = [],
    financialCollectionAuthorized = false,
    validFrom = null,
    expiresAt = null,
    officialPhotoUrl = null,
    actorUser,
    ip = null,
  }) => {
    const parsedUserId = Number(userId);
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
      throw new StaffVerificationError(400, 'A valid existing user account is required.', 'INVALID_USER_ID');
    }
    if (!ENGAGEMENT_TYPES[engagementType]) {
      throw new StaffVerificationError(400, 'Invalid engagement type.', 'INVALID_ENGAGEMENT_TYPE');
    }

    const cleanRole = String(officialRole || '').trim();
    const cleanDepartment = String(department || '').trim();
    if (!cleanRole || cleanRole.length > 150) {
      throw new StaffVerificationError(400, 'Official role is required (max 150 characters).', 'INVALID_ROLE');
    }
    if (!cleanDepartment || cleanDepartment.length > 150) {
      throw new StaffVerificationError(400, 'Department is required (max 150 characters).', 'INVALID_DEPARTMENT');
    }

    const userRes = await db.query(
      `SELECT id, full_name, email, user_type, is_active FROM users WHERE id = $1 LIMIT 1`,
      [parsedUserId]
    );
    const targetUser = userRes.rows[0];
    if (!targetUser) {
      throw new StaffVerificationError(404, 'Selected user account does not exist.', 'USER_NOT_FOUND');
    }
    if (!ELIGIBLE_STAFF_USER_TYPES.includes(targetUser.user_type)) {
      throw new StaffVerificationError(
        400,
        `Account role "${targetUser.user_type}" is not an eligible staff/agent/volunteer/admin account.`,
        'INELIGIBLE_ACCOUNT_ROLE'
      );
    }

    const existing = await db.query(
      `SELECT id FROM staff_identities WHERE user_id = $1 LIMIT 1`,
      [parsedUserId]
    );
    if (existing.rows.length > 0) {
      throw new StaffVerificationError(409, 'This user already has a staff identity record.', 'DUPLICATE_STAFF_IDENTITY');
    }

    const cleanName = String(fullName || targetUser.full_name || '').trim();
    if (!cleanName || cleanName.length > 255) {
      throw new StaffVerificationError(400, 'Full registered name is required.', 'INVALID_FULL_NAME');
    }

    const sanitizedActivities = sanitizeApprovedActivities(approvedActivities);
    const safePhotoUrl = sanitizeOptionalPhotoUrl(officialPhotoUrl);
    const validFromDate = validFrom ? new Date(validFrom) : new Date();
    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
    if (Number.isNaN(validFromDate.getTime())) {
      throw new StaffVerificationError(400, 'Invalid validity start date.', 'INVALID_VALID_FROM');
    }
    if (expiresAtDate && (Number.isNaN(expiresAtDate.getTime()) || expiresAtDate <= validFromDate)) {
      throw new StaffVerificationError(400, 'Expiry date must be after the start date.', 'INVALID_EXPIRES_AT');
    }

    // Never auto-approve on creation: always starts as pending_approval
    let staffVerificationId = generateStaffVerificationId();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const collision = await db.query(
        `SELECT 1 FROM staff_identities WHERE staff_verification_id = $1 LIMIT 1`,
        [staffVerificationId]
      );
      if (collision.rows.length === 0) break;
      staffVerificationId = generateStaffVerificationId();
    }

    const inserted = await db.query(
      `INSERT INTO staff_identities (
         user_id, staff_verification_id, full_name, official_photo_url,
         official_role, department, engagement_type, status,
         approved_activities, financial_collection_authorized,
         valid_from, expires_at, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_approval', $8::jsonb, $9, $10, $11, $12, $12)
       RETURNING *`,
      [
        parsedUserId,
        staffVerificationId,
        cleanName,
        safePhotoUrl,
        cleanRole,
        cleanDepartment,
        engagementType,
        JSON.stringify(sanitizedActivities),
        Boolean(financialCollectionAuthorized),
        validFromDate,
        expiresAtDate,
        actorUser.id,
      ]
    );

    const record = inserted.rows[0];
    await logVerificationEvent(db, {
      staffIdentityId: record.id,
      eventType: 'admin_created',
      actorUserId: actorUser.id,
      outcome: 'pending_approval',
      ip,
      metadata: {
        staff_verification_id: record.staff_verification_id,
        target_user_id: parsedUserId,
        approved_activities: sanitizedActivities,
      },
    });
    await activityLogger.log({
      userId: actorUser.id,
      userName: actorUser.full_name,
      userType: actorUser.user_type,
      action: 'staff_identity_created',
      entityType: 'staff_identity',
      entityId: record.id,
      metadata: { staff_verification_id: record.staff_verification_id, target_user_id: parsedUserId },
      ip,
    });

    return {
      ...toAdminStaffIdentity({
        ...record,
        account_email: targetUser.email,
        account_user_type: targetUser.user_type,
        account_full_name: targetUser.full_name,
        account_active: targetUser.is_active,
      }),
      verify_url: buildPublicVerifyUrl(record.staff_verification_id),
    };
  };

  const updateStaffIdentity = async ({
    identityId,
    updates = {},
    actorUser,
    ip = null,
  }) => {
    const id = Number(identityId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new StaffVerificationError(400, 'Invalid staff identity ID.', 'INVALID_ID');
    }

    const existingRes = await db.query(
      `SELECT * FROM staff_identities WHERE id = $1 LIMIT 1`,
      [id]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new StaffVerificationError(404, 'Staff identity record not found.', 'NOT_FOUND');
    }

    const nextFullName =
      updates.full_name !== undefined ? String(updates.full_name).trim() : existing.full_name;
    const nextRole =
      updates.official_role !== undefined ? String(updates.official_role).trim() : existing.official_role;
    const nextDepartment =
      updates.department !== undefined ? String(updates.department).trim() : existing.department;
    const nextEngagement =
      updates.engagement_type !== undefined ? String(updates.engagement_type).trim() : existing.engagement_type;
    const nextActivities =
      updates.approved_activities !== undefined
        ? sanitizeApprovedActivities(updates.approved_activities)
        : sanitizeApprovedActivities(existing.approved_activities);
    const nextFinancial =
      updates.financial_collection_authorized !== undefined
        ? Boolean(updates.financial_collection_authorized)
        : Boolean(existing.financial_collection_authorized);
    const nextPhotoUrl =
      updates.official_photo_url !== undefined
        ? sanitizeOptionalPhotoUrl(updates.official_photo_url)
        : existing.official_photo_url;
    const nextValidFrom =
      updates.valid_from !== undefined
        ? (updates.valid_from ? new Date(updates.valid_from) : null)
        : existing.valid_from;
    const nextExpiresAt =
      updates.expires_at !== undefined
        ? (updates.expires_at ? new Date(updates.expires_at) : null)
        : existing.expires_at;

    if (!nextFullName || !nextRole || !nextDepartment) {
      throw new StaffVerificationError(400, 'Full name, official role, and department cannot be empty.', 'INVALID_FIELDS');
    }
    if (!ENGAGEMENT_TYPES[nextEngagement]) {
      throw new StaffVerificationError(400, 'Invalid engagement type.', 'INVALID_ENGAGEMENT_TYPE');
    }
    if (nextValidFrom && Number.isNaN(new Date(nextValidFrom).getTime())) {
      throw new StaffVerificationError(400, 'Invalid valid_from date.', 'INVALID_VALID_FROM');
    }
    if (nextExpiresAt && Number.isNaN(new Date(nextExpiresAt).getTime())) {
      throw new StaffVerificationError(400, 'Invalid expires_at date.', 'INVALID_EXPIRES_AT');
    }
    if (nextValidFrom && nextExpiresAt && new Date(nextExpiresAt) <= new Date(nextValidFrom)) {
      throw new StaffVerificationError(400, 'Expiry date must be after start date.', 'INVALID_EXPIRES_AT');
    }

    const updatedRes = await db.query(
      `UPDATE staff_identities
       SET full_name = $1,
           official_role = $2,
           department = $3,
           engagement_type = $4,
           approved_activities = $5::jsonb,
           financial_collection_authorized = $6,
           official_photo_url = $7,
           valid_from = $8,
           expires_at = $9,
           updated_by = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        nextFullName,
        nextRole,
        nextDepartment,
        nextEngagement,
        JSON.stringify(nextActivities),
        nextFinancial,
        nextPhotoUrl,
        nextValidFrom,
        nextExpiresAt,
        actorUser.id,
        id,
      ]
    );

    const record = updatedRes.rows[0];
    await logVerificationEvent(db, {
      staffIdentityId: id,
      eventType: 'admin_updated',
      actorUserId: actorUser.id,
      outcome: record.status,
      ip,
      metadata: {
        approved_activities: nextActivities,
        financial_collection_authorized: nextFinancial,
        department: nextDepartment,
        official_role: nextRole,
      },
    });
    await activityLogger.log({
      userId: actorUser.id,
      userName: actorUser.full_name,
      userType: actorUser.user_type,
      action: 'staff_identity_updated',
      entityType: 'staff_identity',
      entityId: id,
      metadata: { staff_verification_id: record.staff_verification_id, approved_activities: nextActivities },
      ip,
    });

    return {
      ...toAdminStaffIdentity(record),
      verify_url: buildPublicVerifyUrl(record.staff_verification_id),
    };
  };

  const setStaffIdentityStatus = async ({ identityId, action, reason = '', actorUser, ip = null }) => {
    const id = Number(identityId);
    const cleanAction = String(action || '').trim().toLowerCase();
    const actionMap = {
      approve: { status: 'active', event: 'admin_approved' },
      activate: { status: 'active', event: 'admin_activated' },
      reinstate: { status: 'active', event: 'admin_reinstated' },
      reject: { status: 'rejected', event: 'admin_rejected' },
      suspend: { status: 'suspended', event: 'admin_suspended' },
      revoke: { status: 'revoked', event: 'admin_revoked' },
    };

    const transition = actionMap[cleanAction];
    if (!Number.isInteger(id) || id <= 0 || !transition) {
      throw new StaffVerificationError(400, 'Invalid identity ID or status action.', 'INVALID_STATUS_ACTION');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existingRes = await client.query(
        `SELECT * FROM staff_identities WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        throw new StaffVerificationError(404, 'Staff identity record not found.', 'NOT_FOUND');
      }

      const cleanReason = String(reason || '').trim().slice(0, 500) || null;
      const setApproved = transition.status === 'active' && !existing.approved_at;

      const updatedRes = await client.query(
        `UPDATE staff_identities
         SET status = $1,
             status_reason = $2,
             approved_by = CASE WHEN $3 THEN $4 ELSE approved_by END,
             approved_at = CASE WHEN $3 THEN NOW() ELSE approved_at END,
             updated_by = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [transition.status, cleanReason, setApproved, actorUser.id, id]
      );

      // Immediately cancel any in-flight pending challenges when suspended/revoked/rejected
      if (['suspended', 'revoked', 'rejected'].includes(transition.status)) {
        await client.query(
          `UPDATE staff_verification_challenges
           SET status = 'cancelled', response_note = $1
           WHERE staff_identity_id = $2 AND status = 'pending'`,
          [`Cancelled due to staff identity ${transition.status}`, id]
        );
      }

      const record = updatedRes.rows[0];
      await logVerificationEvent(client, {
        staffIdentityId: id,
        eventType: transition.event,
        actorUserId: actorUser.id,
        outcome: transition.status,
        ip,
        metadata: {
          previous_status: existing.status,
          next_status: transition.status,
          reason: cleanReason,
        },
      });

      await client.query('COMMIT');

      await activityLogger.log({
        userId: actorUser.id,
        userName: actorUser.full_name,
        userType: actorUser.user_type,
        action: `staff_identity_${cleanAction}`,
        entityType: 'staff_identity',
        entityId: id,
        metadata: {
          staff_verification_id: record.staff_verification_id,
          previous_status: existing.status,
          next_status: transition.status,
          reason: cleanReason,
        },
        ip,
      });

      await createInAppNotification({
        userId: record.user_id,
        title: `Staff Identity Status Updated (${transition.status.toUpperCase()})`,
        message: `Your Amana Staff Verification ID (${record.staff_verification_id}) status is now ${transition.status.replace(/_/g, ' ')}.${cleanReason ? ` Note: ${cleanReason}` : ''}`,
        type: 'staff_identity_status',
        link: '/my-staff-identity',
      });

      return {
        ...toAdminStaffIdentity(record),
        verify_url: buildPublicVerifyUrl(record.staff_verification_id),
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  };

  const regenerateStaffVerificationId = async ({ identityId, actorUser, ip = null }) => {
    const id = Number(identityId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new StaffVerificationError(400, 'Invalid staff identity ID.', 'INVALID_ID');
    }

    const existingRes = await db.query(
      `SELECT id, staff_verification_id FROM staff_identities WHERE id = $1 LIMIT 1`,
      [id]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new StaffVerificationError(404, 'Staff identity record not found.', 'NOT_FOUND');
    }

    let nextId = generateStaffVerificationId();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const collision = await db.query(
        `SELECT 1 FROM staff_identities WHERE staff_verification_id = $1 LIMIT 1`,
        [nextId]
      );
      if (collision.rows.length === 0) break;
      nextId = generateStaffVerificationId();
    }

    const updated = await db.query(
      `UPDATE staff_identities
       SET staff_verification_id = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [nextId, actorUser.id, id]
    );

    await logVerificationEvent(db, {
      staffIdentityId: id,
      eventType: 'admin_id_regenerated',
      actorUserId: actorUser.id,
      outcome: 'regenerated',
      ip,
      metadata: { previous_id: existing.staff_verification_id, new_id: nextId },
    });

    const record = updated.rows[0];
    return {
      ...toAdminStaffIdentity(record),
      verify_url: buildPublicVerifyUrl(record.staff_verification_id),
    };
  };

  const getAdminVerificationHistory = async ({ limit = 100 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const [eventsRes, challengesRes, suspiciousRes] = await Promise.all([
      db.query(
        `SELECT e.id, e.event_type, e.outcome, e.ip_address, e.metadata, e.created_at,
                si.staff_verification_id, si.full_name AS staff_name,
                u.full_name AS actor_name
         FROM staff_verification_events e
         LEFT JOIN staff_identities si ON si.id = e.staff_identity_id
         LEFT JOIN users u ON u.id = e.actor_user_id
         ORDER BY e.created_at DESC
         LIMIT $1`,
        [safeLimit]
      ),
      db.query(
        `SELECT c.id, c.challenge_reference, c.purpose, c.status, c.expires_at,
                c.responded_at, c.requester_ip, c.created_at,
                si.staff_verification_id, si.full_name AS staff_name
         FROM staff_verification_challenges c
         INNER JOIN staff_identities si ON si.id = c.staff_identity_id
         ORDER BY c.created_at DESC
         LIMIT $1`,
        [safeLimit]
      ),
      db.query(
        `SELECT ip_address,
                COUNT(*) FILTER (WHERE event_type = 'public_lookup_not_found')::int AS failed_lookups,
                COUNT(*) FILTER (WHERE event_type = 'challenge_rejected')::int AS rejected_challenges,
                COUNT(*) FILTER (WHERE event_type = 'challenge_blocked_wrong_staff')::int AS wrong_staff_attempts,
                MAX(created_at) AS last_seen
         FROM staff_verification_events
         WHERE created_at >= NOW() - INTERVAL '24 hours'
           AND ip_address IS NOT NULL
         GROUP BY ip_address
         HAVING COUNT(*) FILTER (WHERE event_type = 'public_lookup_not_found') >= 5
             OR COUNT(*) FILTER (WHERE event_type = 'challenge_rejected') >= 2
             OR COUNT(*) FILTER (WHERE event_type = 'challenge_blocked_wrong_staff') >= 1
         ORDER BY failed_lookups DESC, last_seen DESC
         LIMIT 50`
      ),
    ]);

    return {
      events: eventsRes.rows,
      challenges: challengesRes.rows,
      suspicious_activity: suspiciousRes.rows,
    };
  };

  const listImpersonationReports = async ({ status = '', limit = 100 } = {}) => {
    const params = [];
    let where = '';
    if (status && ['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
      params.push(status);
      where = `WHERE r.status = $1`;
    }
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 250));

    const res = await db.query(
      `SELECT r.*, si.full_name AS linked_staff_name, si.status AS linked_staff_status,
              reviewer.full_name AS reviewed_by_name
       FROM staff_impersonation_reports r
       LEFT JOIN staff_identities si ON si.id = r.staff_identity_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.rows;
  };

  const updateImpersonationReport = async ({ reportId, status, investigationNotes = '', actorUser, ip = null }) => {
    const id = Number(reportId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new StaffVerificationError(400, 'Invalid report ID.', 'INVALID_REPORT_ID');
    }
    if (!['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
      throw new StaffVerificationError(400, 'Invalid report status.', 'INVALID_REPORT_STATUS');
    }

    const updated = await db.query(
      `UPDATE staff_impersonation_reports
       SET status = $1,
           investigation_notes = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, String(investigationNotes || '').trim().slice(0, 2000) || null, actorUser.id, id]
    );
    if (!updated.rows.length) {
      throw new StaffVerificationError(404, 'Impersonation report not found.', 'NOT_FOUND');
    }

    const row = updated.rows[0];
    await logVerificationEvent(db, {
      staffIdentityId: row.staff_identity_id,
      eventType: 'impersonation_report_updated',
      actorUserId: actorUser.id,
      outcome: status,
      ip,
      metadata: { report_reference: row.report_reference, status },
    });
    await activityLogger.log({
      userId: actorUser.id,
      userName: actorUser.full_name,
      userType: actorUser.user_type,
      action: 'staff_impersonation_report_updated',
      entityType: 'staff_impersonation_report',
      entityId: row.id,
      metadata: { report_reference: row.report_reference, status },
      ip,
    });

    return row;
  };

  return {
    VERIFICATION_STATES,
    ENGAGEMENT_TYPES,
    APPROVED_ACTIVITY_CATALOG,
    RESTRICTED_BY_DEFAULT_ACTIVITIES,
    IMPERSONATION_CATEGORIES,
    PAYMENT_SAFETY_NOTICE,
    FACE_MATCH_ADVISORY,
    ELIGIBLE_STAFF_USER_TYPES,
    CHALLENGE_TTL_SECONDS,
    StaffVerificationError,
    generateStaffVerificationId,
    parseStaffLookupInput,
    parseChallengeInput,
    sanitizeApprovedActivities,
    evaluateStaffRegistrationState,
    toPublicStaffProfile,
    lookupPublicStaff,
    createLiveChallenge,
    getPublicChallengeStatus,
    getMyStaffIdentity,
    lookupMyChallengeByCode,
    respondToChallenge,
    createImpersonationReport,
    searchEligibleUsers,
    listStaffIdentities,
    createStaffIdentity,
    updateStaffIdentity,
    setStaffIdentityStatus,
    regenerateStaffVerificationId,
    getAdminVerificationHistory,
    listImpersonationReports,
    updateImpersonationReport,
  };
}

const defaultInstance = createStaffIdentityService();
defaultInstance.createStaffIdentityService = createStaffIdentityService;

module.exports = defaultInstance;
