'use strict';

const { normalizeRole, ALL_ADMIN_ROLES } = require('../config/utils/roleHierarchy');
const { zoneForState } = require('../config/utils/territorialZones');

const PEER_CALL_ROLES = new Set(['tenant', 'landlord', 'agent']);

const ROLE_LABELS = Object.freeze({
  super_admin: 'Super Admin',
  zonal_admin: 'Zonal Admin',
  state_admin: 'State Admin',
  lga_admin: 'LGA Admin',
  admin: 'LGA Admin',
  super_support_admin: 'National Support Admin',
  zonal_support_admin: 'Zonal Support Admin',
  state_support_admin: 'State Support Admin',
  lga_support_admin: 'LGA Support Admin',
  super_financial_admin: 'National Financial Admin',
  financial_admin: 'Financial Admin',
  zonal_financial_admin: 'Zonal Financial Admin',
  state_financial_admin: 'State Financial Admin',
  lga_financial_admin: 'LGA Financial Admin',
  super_lawyer: 'National Super Lawyer',
  zonal_lawyer: 'Zonal Lawyer',
  state_lawyer: 'State Lawyer',
  lawyer: 'LGA Lawyer',
  super_fumigation_admin: 'National Fumigation Admin',
  zonal_fumigation_admin: 'Zonal Fumigation Admin',
  state_fumigation_admin: 'State Fumigation Admin',
  lga_fumigation_admin: 'LGA Fumigation Admin',
  fumigation_admin: 'LGA Fumigation Admin',
  super_transportation_admin: 'National Transport Admin',
  zonal_transportation_admin: 'Zonal Transport Admin',
  state_transportation_admin: 'State Transport Admin',
  lga_transportation_admin: 'LGA Transport Admin',
  transportation_admin: 'LGA Transport Admin',
  recruitment_admin: 'Recruitment Admin',
  marketing_agent: 'Marketing Agent',
  agent: 'Property Agent',
  landlord: 'Landlord',
  tenant: 'Tenant',
});

// Department hierarchies (ordered highest -> lowest)
const DEPARTMENT_LADDERS = {
  operations: ['super_admin', 'zonal_admin', 'state_admin', 'lga_admin'],
  support: ['super_admin', 'super_support_admin', 'zonal_support_admin', 'state_support_admin', 'lga_support_admin'],
  finance: ['super_admin', 'super_financial_admin', 'financial_admin', 'zonal_financial_admin', 'state_financial_admin', 'lga_financial_admin'],
  legal: ['super_admin', 'super_lawyer', 'zonal_lawyer', 'state_lawyer', 'lawyer'],
  fumigation: ['super_admin', 'super_fumigation_admin', 'zonal_fumigation_admin', 'state_fumigation_admin', 'lga_fumigation_admin'],
  transportation: ['super_admin', 'super_transportation_admin', 'zonal_transportation_admin', 'state_transportation_admin', 'lga_transportation_admin'],
};

const ALIAS_TO_CANONICAL = {
  admin: 'lga_admin',
  fumigation_admin: 'lga_fumigation_admin',
  transportation_admin: 'lga_transportation_admin',
};

const CANONICAL_TO_DB_ROLES = {
  lga_admin: ['lga_admin', 'admin'],
  lga_fumigation_admin: ['lga_fumigation_admin', 'fumigation_admin'],
  lga_transportation_admin: ['lga_transportation_admin', 'transportation_admin'],
};

const canonicalRole = (role) => {
  const r = normalizeRole(role);
  return ALIAS_TO_CANONICAL[r] || r;
};

const expandDbRoles = (roles = []) => {
  const out = new Set();
  for (const r of roles) {
    const c = canonicalRole(r);
    out.add(c);
    for (const alias of CANONICAL_TO_DB_ROLES[c] || []) {
      out.add(alias);
    }
  }
  return Array.from(out);
};

const getRoleLabel = (role) => {
  const raw = String(role || '').trim().toLowerCase();
  return ROLE_LABELS[raw] || ROLE_LABELS[canonicalRole(raw)] || raw.replace(/_/g, ' ');
};

const getDepartmentInfo = (role) => {
  const c = canonicalRole(role);
  for (const [dept, ladder] of Object.entries(DEPARTMENT_LADDERS)) {
    const idx = ladder.indexOf(c);
    if (idx > 0) {
      return {
        department: dept,
        index: idx,
        subordinates: ladder.slice(idx + 1),
        supervisors: ladder.slice(0, idx),
      };
    }
  }
  return null;
};

const getCallerPolicy = (caller = {}) => {
  const role = canonicalRole(caller.user_type || caller.role);

  if (role === 'super_admin') {
    return {
      role,
      mode: 'platform_all',
      canChatSupport: false,
      canCallSupport: false,
      canCallBoss: false,
      canCallSubordinates: true,
      canCallAnyone: true,
      subordinateRoles: [],
      bossRoles: [],
      scopeType: 'national',
    };
  }

  if (role === 'tenant' || role === 'landlord') {
    return {
      role,
      mode: 'support_only',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: false,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      bossRoles: [],
      scopeType: 'self',
    };
  }

  if (role === 'agent') {
    return {
      role,
      mode: 'support_and_boss',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      bossRoles: ['landlord', 'state_admin', 'zonal_admin', 'super_admin'],
      scopeType: 'agent_boss',
    };
  }

  if (role === 'marketing_agent') {
    return {
      role,
      mode: 'support_and_boss',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      bossRoles: ['recruitment_admin', 'state_admin', 'zonal_admin', 'super_admin'],
      scopeType: 'marketing_boss',
    };
  }

  if (role === 'recruitment_admin') {
    return {
      role,
      mode: 'admin_subordinates',
      canChatSupport: false,
      canCallSupport: false,
      canCallBoss: true,
      canCallSubordinates: true,
      canCallAnyone: false,
      subordinateRoles: expandDbRoles(['marketing_agent', 'zonal_admin', 'state_admin', 'lga_admin']),
      bossRoles: ['super_admin'],
      scopeType: 'national',
    };
  }

  const dept = getDepartmentInfo(role);
  if (dept) {
    const isNationalHead =
      role.startsWith('super_') || role === 'financial_admin';
    const isZonalHead = role.startsWith('zonal_');
    const isStateHead = role.startsWith('state_');
    const extraSubordinates =
      role === 'state_admin' || role === 'zonal_admin' ? ['marketing_agent'] : [];
    const subordinateRoles = expandDbRoles([...dept.subordinates, ...extraSubordinates]);
    const bossRoles = expandDbRoles(dept.supervisors);

    if (subordinateRoles.length > 0) {
      return {
        role,
        mode: 'admin_subordinates',
        canChatSupport: false,
        canCallSupport: false,
        canCallBoss: bossRoles.length > 0,
        canCallSubordinates: true,
        canCallAnyone: false,
        subordinateRoles,
        bossRoles,
        scopeType: isNationalHead ? 'national' : isZonalHead ? 'zonal' : isStateHead ? 'state' : 'lga',
      };
    }

    // Bottom-tier LGA admin or LGA lawyer: can call supervising boss & contact Support
    return {
      role,
      mode: 'boss_and_support',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: bossRoles.length > 0,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      bossRoles,
      scopeType: 'lga',
    };
  }

  // Fallback for any other admin role
  if (ALL_ADMIN_ROLES.includes(role)) {
    return {
      role,
      mode: 'boss_and_support',
      canChatSupport: true,
      canCallSupport: true,
      canCallBoss: true,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      bossRoles: ['super_admin'],
      scopeType: 'lga',
    };
  }

  return {
    role,
    mode: 'support_only',
    canChatSupport: true,
    canCallSupport: true,
    canCallBoss: false,
    canCallSubordinates: false,
    canCallAnyone: false,
    subordinateRoles: [],
    bossRoles: [],
    scopeType: 'self',
  };
};

const normText = (v) => String(v || '').trim().toLowerCase();

const targetMatchesCallerTerritory = (caller, target, scopeType) => {
  if (scopeType === 'national') return true;
  const callerState = normText(caller.assigned_state);
  const targetState = normText(target.assigned_state);
  const callerZone = normText(caller.assigned_zone) || normText(zoneForState(caller.assigned_state));
  const targetZone = normText(target.assigned_zone) || normText(zoneForState(target.assigned_state));

  if (scopeType === 'zonal') {
    if (!callerZone || !targetZone) return true;
    return callerZone === targetZone;
  }
  if (scopeType === 'state') {
    if (!callerState || !targetState) return true;
    return callerState === targetState;
  }
  return true;
};

const bossMatchesCallerTerritory = (caller, boss) => {
  const bossRole = canonicalRole(boss.user_type);
  if (bossRole === 'super_admin' || bossRole.startsWith('super_') || bossRole === 'recruitment_admin' || bossRole === 'financial_admin') {
    return true;
  }
  const callerState = normText(caller.assigned_state);
  const bossState = normText(boss.assigned_state);
  const callerZone = normText(caller.assigned_zone) || normText(zoneForState(caller.assigned_state));
  const bossZone = normText(boss.assigned_zone) || normText(zoneForState(boss.assigned_state));

  if (bossRole.startsWith('state_')) {
    if (!callerState || !bossState) return true;
    return callerState === bossState;
  }
  if (bossRole.startsWith('zonal_')) {
    if (!callerZone || !bossZone) return true;
    return callerZone === bossZone;
  }
  return true;
};

const canSupportCall = (caller = {}) => {
  const policy = getCallerPolicy(caller);
  return Boolean(policy.canCallSupport);
};

const getAssignedLandlordIdsForAgent = async (agentUserId, db) => {
  try {
    const res = await db.query(
      `SELECT DISTINCT landlord_user_id
       FROM landlord_agents
       WHERE agent_user_id = $1 AND status = 'active'`,
      [agentUserId]
    );
    return (res.rows || []).map((r) => Number(r.landlord_user_id)).filter(Boolean);
  } catch {
    return [];
  }
};

const canUserInitiateDirectCall = async (caller, receiver, db) => {
  if (!caller || !receiver) {
    return { allowed: false, message: 'Invalid caller or recipient.' };
  }
  if (Number(caller.id) === Number(receiver.id)) {
    return { allowed: false, message: 'You cannot call yourself.' };
  }

  const callerRole = canonicalRole(caller.user_type);
  const receiverRole = canonicalRole(receiver.user_type);

  // 1. Super Admin can call anyone on the platform
  if (callerRole === 'super_admin') {
    return { allowed: true, relation: 'platform' };
  }

  // 2. Existing peer-to-peer calls (tenant <-> landlord <-> agent)
  if (PEER_CALL_ROLES.has(callerRole) && PEER_CALL_ROLES.has(receiverRole)) {
    return { allowed: true, relation: 'peer' };
  }

  // 3. Support admins returning or escalating calls
  if (['super_support_admin', 'zonal_support_admin', 'state_support_admin', 'lga_support_admin'].includes(callerRole)) {
    if (PEER_CALL_ROLES.has(receiverRole) || receiverRole === 'marketing_agent') {
      return { allowed: true, relation: 'support_callback' };
    }
  }

  const policy = getCallerPolicy(caller);

  // 4. Property Agent calling their boss (assigned landlord or supervising admin)
  if (callerRole === 'agent') {
    if (receiverRole === 'landlord') {
      const landlordIds = await getAssignedLandlordIdsForAgent(caller.id, db);
      if (landlordIds.includes(Number(receiver.id))) {
        return { allowed: true, relation: 'boss' };
      }
      // Peer call already allowed above, kept explicit for clarity
      return { allowed: true, relation: 'peer' };
    }
    if (policy.bossRoles.includes(receiverRole) && bossMatchesCallerTerritory(caller, receiver)) {
      return { allowed: true, relation: 'boss' };
    }
  }

  // 5. Marketing Agent calling their supervising boss
  if (callerRole === 'marketing_agent') {
    if (policy.bossRoles.includes(receiverRole) && bossMatchesCallerTerritory(caller, receiver)) {
      return { allowed: true, relation: 'boss' };
    }
  }

  // 6. National / Zonal / State Admin calling admins strictly below them in scope
  if (policy.canCallSubordinates && policy.subordinateRoles.includes(receiverRole)) {
    if (targetMatchesCallerTerritory(caller, receiver, policy.scopeType)) {
      return { allowed: true, relation: 'subordinate' };
    }
  }

  // 7. Subordinate Admin / Lawyer calling their supervising boss
  if (policy.canCallBoss && policy.bossRoles.includes(receiverRole)) {
    if (bossMatchesCallerTerritory(caller, receiver)) {
      return { allowed: true, relation: 'boss' };
    }
  }

  return {
    allowed: false,
    message: 'You are not authorized to call this user directly.',
  };
};

const formatDirectoryUser = (row, relation, isUserOnline) => ({
  id: Number(row.id),
  full_name: row.full_name || 'RentalHub User',
  user_type: row.user_type,
  role_label: getRoleLabel(row.user_type),
  assigned_state: row.assigned_state || null,
  assigned_city: row.assigned_city || null,
  assigned_lga: row.assigned_lga || null,
  assigned_zone: row.assigned_zone || null,
  online: typeof isUserOnline === 'function' ? Boolean(isUserOnline(row.id)) : false,
  relation,
});

const getCallDirectory = async (caller, filters = {}, db, isUserOnline) => {
  const policy = getCallerPolicy(caller);
  const q = String(filters.q || '').trim().slice(0, 80);
  const roleFilter = String(filters.role || '').trim().toLowerCase();
  const stateFilter = String(filters.state || '').trim().slice(0, 60);
  const onlineOnly = String(filters.onlineOnly || '').toLowerCase() === 'true';
  const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 40));

  // Count currently online support admins for support-enabled roles
  let supportOnlineCount = 0;
  if (policy.canCallSupport) {
    try {
      const supRes = await db.query(
        `SELECT id FROM users
         WHERE user_type IN ('super_support_admin', 'zonal_support_admin', 'state_support_admin', 'lga_support_admin', 'zonal_admin')
           AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE`
      );
      supportOnlineCount = (supRes.rows || []).filter((r) =>
        typeof isUserOnline === 'function' ? Boolean(isUserOnline(r.id)) : false
      ).length;
    } catch {
      supportOnlineCount = 0;
    }
  }

  // Tenants & Landlords only need Support (Chat / Call), not a user directory
  if (policy.mode === 'support_only') {
    return {
      policy,
      supportOnlineCount,
      contacts: [],
    };
  }

  const contactsMap = new Map();

  // Super Admin: platform-wide directory (can call anyone)
  if (policy.mode === 'platform_all') {
    const where = ['id <> $1', 'deleted_at IS NULL', 'COALESCE(is_active, TRUE) = TRUE'];
    const params = [caller.id];
    let pIdx = 2;

    if (roleFilter && roleFilter !== 'all') {
      if (roleFilter === 'admins') {
        where.push(`user_type = ANY($${pIdx}::text[])`);
        params.push(ALL_ADMIN_ROLES);
        pIdx += 1;
      } else if (roleFilter === 'lawyers') {
        where.push(`user_type = ANY($${pIdx}::text[])`);
        params.push(['lawyer', 'state_lawyer', 'zonal_lawyer', 'super_lawyer']);
        pIdx += 1;
      } else {
        where.push(`user_type = ANY($${pIdx}::text[])`);
        params.push(expandDbRoles([roleFilter]));
        pIdx += 1;
      }
    }

    if (stateFilter) {
      where.push(`LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx}`);
      params.push(`%${stateFilter.toLowerCase()}%`);
      pIdx += 1;
    }

    if (q) {
      where.push(`(LOWER(COALESCE(full_name, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_lga, '')) LIKE $${pIdx} OR LOWER(COALESCE(user_type, '')) LIKE $${pIdx})`);
      params.push(`%${q.toLowerCase()}%`);
      pIdx += 1;
    }

    params.push(limit * 2);
    const res = await db.query(
      `SELECT id, full_name, user_type, assigned_state, assigned_city, assigned_lga, assigned_zone
       FROM users
       WHERE ${where.join(' AND ')}
       ORDER BY full_name ASC
       LIMIT $${pIdx}`,
      params
    );

    for (const row of res.rows || []) {
      const entry = formatDirectoryUser(row, 'platform', isUserOnline);
      if (!onlineOnly || entry.online) {
        contactsMap.set(entry.id, entry);
      }
    }
  } else {
    // 1. Property Agent's assigned Landlord(s) ("My Boss")
    if (policy.role === 'agent') {
      const landlordIds = await getAssignedLandlordIdsForAgent(caller.id, db);
      if (landlordIds.length > 0) {
        const res = await db.query(
          `SELECT id, full_name, user_type, assigned_state, assigned_city, assigned_lga, assigned_zone
           FROM users
           WHERE id = ANY($1::int[]) AND id <> $2 AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
           ORDER BY full_name ASC`,
          [landlordIds, caller.id]
        );
        for (const row of res.rows || []) {
          const entry = formatDirectoryUser(row, 'boss', isUserOnline);
          if (q && !normText(entry.full_name).includes(q.toLowerCase())) continue;
          if (!onlineOnly || entry.online) {
            contactsMap.set(entry.id, entry);
          }
        }
      }
    }

    // 2. Subordinate admins (for National, Zonal, State admins)
    if (policy.canCallSubordinates && policy.subordinateRoles.length > 0) {
      const where = [
        'id <> $1',
        'deleted_at IS NULL',
        'COALESCE(is_active, TRUE) = TRUE',
        'user_type = ANY($2::text[])',
      ];
      const params = [caller.id, policy.subordinateRoles];
      let pIdx = 3;

      if (roleFilter && roleFilter !== 'all' && roleFilter !== 'boss') {
        where.push(`user_type = ANY($${pIdx}::text[])`);
        params.push(expandDbRoles([roleFilter]));
        pIdx += 1;
      }
      if (stateFilter) {
        where.push(`LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx}`);
        params.push(`%${stateFilter.toLowerCase()}%`);
        pIdx += 1;
      }
      if (q) {
        where.push(`(LOWER(COALESCE(full_name, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_lga, '')) LIKE $${pIdx})`);
        params.push(`%${q.toLowerCase()}%`);
        pIdx += 1;
      }

      const res = await db.query(
        `SELECT id, full_name, user_type, assigned_state, assigned_city, assigned_lga, assigned_zone
         FROM users
         WHERE ${where.join(' AND ')}
         ORDER BY full_name ASC
         LIMIT 120`,
        params
      );

      for (const row of res.rows || []) {
        if (!targetMatchesCallerTerritory(caller, row, policy.scopeType)) continue;
        const entry = formatDirectoryUser(row, 'subordinate', isUserOnline);
        if (!onlineOnly || entry.online) {
          contactsMap.set(entry.id, entry);
        }
      }
    }

    // 3. Supervising Boss(es) (for Agents, Marketing Agents, and subordinate/LGA/State/Zonal admins)
    const adminBossRoles = (policy.bossRoles || []).filter((r) => r !== 'landlord');
    if (policy.canCallBoss && adminBossRoles.length > 0 && (roleFilter === '' || roleFilter === 'all' || roleFilter === 'boss')) {
      const where = [
        'id <> $1',
        'deleted_at IS NULL',
        'COALESCE(is_active, TRUE) = TRUE',
        'user_type = ANY($2::text[])',
      ];
      const params = [caller.id, adminBossRoles];
      let pIdx = 3;

      if (q) {
        where.push(`(LOWER(COALESCE(full_name, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx})`);
        params.push(`%${q.toLowerCase()}%`);
        pIdx += 1;
      }

      const res = await db.query(
        `SELECT id, full_name, user_type, assigned_state, assigned_city, assigned_lga, assigned_zone
         FROM users
         WHERE ${where.join(' AND ')}
         ORDER BY full_name ASC
         LIMIT 50`,
        params
      );

      for (const row of res.rows || []) {
        if (contactsMap.has(Number(row.id))) continue;
        if (!bossMatchesCallerTerritory(caller, row)) continue;
        const entry = formatDirectoryUser(row, 'boss', isUserOnline);
        if (!onlineOnly || entry.online) {
          contactsMap.set(entry.id, entry);
        }
      }
    }
  }

  // Sort: online first, then relation priority (boss/subordinate), then alphabetical
  const relationWeight = { boss: 0, subordinate: 1, platform: 2 };
  const contacts = Array.from(contactsMap.values())
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const rw = (relationWeight[a.relation] ?? 9) - (relationWeight[b.relation] ?? 9);
      if (rw !== 0) return rw;
      return String(a.full_name || '').localeCompare(String(b.full_name || ''));
    })
    .slice(0, limit);

  return {
    policy,
    supportOnlineCount,
    contacts,
  };
};

module.exports = {
  getCallerPolicy,
  canSupportCall,
  canUserInitiateDirectCall,
  getCallDirectory,
  getRoleLabel,
};
