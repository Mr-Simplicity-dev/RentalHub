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

const DEPARTMENT_LABELS = Object.freeze({
  operations: 'Operations Team',
  support: 'Support Department',
  finance: 'Finance Department',
  legal: 'Legal Department',
  fumigation: 'Fumigation Department',
  transportation: 'Transportation Department',
  recruitment: 'Marketing Team',
  technical: 'Technical Team',
});

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

const getCallIdentity = (user = {}, recipient = {}) => {
  const role = canonicalRole(user.user_type || user.role);
  const recipientRole = canonicalRole(recipient.user_type || recipient.role);
  const roleLabel = getRoleLabel(role);
  const department = role === 'super_admin'
    ? 'technical'
    : getDepartmentInfo(role)?.department || (role === 'recruitment_admin' ? 'recruitment' : null);
  const departmentLabel = department ? DEPARTMENT_LABELS[department] : null;
  const recipientDepartment = getDepartmentInfo(recipientRole)?.department;
  const isAdmin = ALL_ADMIN_ROLES.includes(role);
  const isNationalAdmin = role.startsWith('super_') || role === 'financial_admin';
  const name = String(user.full_name || user.name || 'RentalHub user').trim();
  let callDisplayName = name;

  if (recipientRole !== 'super_admin') {
    if (role === 'super_admin') {
      callDisplayName = 'Amana RentalHub Technical Team';
    } else if (role === 'recruitment_admin') {
      callDisplayName = 'Marketing Team Lead';
    } else if (isNationalAdmin && department && recipientDepartment === department) {
      callDisplayName = `National ${departmentLabel.replace(/ (Department|Team)$/, '')} Admin`;
    } else if (isAdmin && departmentLabel) {
      callDisplayName = departmentLabel;
    }
  }

  const detailParts = recipientRole === 'super_admin'
    ? [roleLabel, departmentLabel, user.id != null ? `ID ${user.id}` : null]
    : role === 'super_admin'
      ? ['Amana RentalHub official call']
      : isAdmin
        ? [name, roleLabel]
        : [roleLabel];

  return {
    role_label: roleLabel,
    position_label: roleLabel,
    department,
    department_label: departmentLabel,
    passport_photo_url: user.passport_photo_url || null,
    call_display_name: callDisplayName,
    call_display_detail: detailParts.filter(Boolean).join(' · '),
    call_display_kind: isAdmin ? 'brand' : 'person',
  };
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
      canCallTeammates: false,
      canCallSubordinates: false,
      canCallAnyone: false,
      subordinateRoles: [],
      teammateRoles: [],
      bossRoles: ['recruitment_admin', 'state_admin', 'zonal_admin'],
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

    // 4. Fellow Teammates (e.g. Marketing Agents calling other Marketing Agents)
    if (
      policy.canCallTeammates &&
      Array.isArray(policy.teammateRoles) &&
      policy.teammateRoles.length > 0 &&
      (roleFilter === '' || roleFilter === 'all' || roleFilter === 'teammate' || roleFilter === 'marketing_agent')
    ) {
      const where = [
        'id <> $1',
        'deleted_at IS NULL',
        'COALESCE(is_active, TRUE) = TRUE',
        'user_type = ANY($2::text[])',
      ];
      const params = [caller.id, policy.teammateRoles];
      let pIdx = 3;

      if (q) {
        where.push(
          `(LOWER(COALESCE(full_name, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_state, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_city, '')) LIKE $${pIdx} OR LOWER(COALESCE(assigned_lga, '')) LIKE $${pIdx})`
        );
        params.push(`%${q.toLowerCase()}%`);
        pIdx += 1;
      }

      if (stateFilter) {
        where.push(`LOWER(COALESCE(assigned_state, '')) = $${pIdx}`);
        params.push(stateFilter.toLowerCase());
        pIdx += 1;
      }

      const res = await db.query(
        'SELECT id, full_name, user_type, assigned_state, assigned_city, assigned_lga, assigned_zone ' +
        'FROM users WHERE ' + where.join(' AND ') + ' ORDER BY full_name ASC LIMIT 50',
        params
      );

      for (const row of res.rows || []) {
        if (contactsMap.has(Number(row.id))) continue;
        const entry = formatDirectoryUser(row, 'teammate', isUserOnline);
        if (!onlineOnly || entry.online) {
          contactsMap.set(entry.id, entry);
        }
      }
    }
  }

  // Sort: online first, then relation priority (boss/teammate/subordinate), then alphabetical
  const relationWeight = { boss: 0, teammate: 1, subordinate: 2, platform: 3 };
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

const computeCallDurationSeconds = (startedAt, endedAt) => {
  if (!startedAt || !endedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 1000);
};

const markIncomingMissedCallsAsViewed = async (userId, db) => {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return 0;
  const result = await db.query(
    `UPDATE call_sessions
     SET receiver_viewed_at = NOW()
     WHERE receiver_id = $1 AND status = 'missed' AND receiver_viewed_at IS NULL`,
    [id]
  );
  return Number(result.rowCount || 0);
};

const getCallHistory = async (caller, filters = {}, db, isUserOnline) => {
  const userId = Number(caller?.id);
  const emptySummary = {
    total_count: 0,
    missed_count: 0,
    incoming_missed_count: 0,
    incoming_unread_missed_count: 0,
    answered_count: 0,
    incoming_count: 0,
    outgoing_count: 0,
  };
  if (!Number.isFinite(userId) || userId <= 0) {
    return { records: [], summary: emptySummary };
  }

  const rawFilter = String(filters.filter || 'all').trim().toLowerCase();
  const filter = ['all', 'missed', 'incoming', 'outgoing'].includes(rawFilter) ? rawFilter : 'all';
  const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 30));

  try {
    const summaryRes = await db.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE status = 'missed')::int AS missed_count,
         COUNT(*) FILTER (WHERE status = 'missed' AND receiver_id = $1)::int AS incoming_missed_count,
         COUNT(*) FILTER (WHERE status = 'missed' AND receiver_id = $1 AND receiver_viewed_at IS NULL)::int AS incoming_unread_missed_count,
         COUNT(*) FILTER (WHERE started_at IS NOT NULL OR status IN ('accepted', 'ended'))::int AS answered_count,
         COUNT(*) FILTER (WHERE receiver_id = $1)::int AS incoming_count,
         COUNT(*) FILTER (WHERE caller_id = $1)::int AS outgoing_count
       FROM call_sessions
       WHERE caller_id = $1 OR receiver_id = $1`,
      [userId]
    );

    const whereClauses = ['(cs.caller_id = $1 OR cs.receiver_id = $1)'];
    if (filter === 'missed') {
      whereClauses.push("cs.status = 'missed'");
    } else if (filter === 'incoming') {
      whereClauses.push('cs.receiver_id = $1');
    } else if (filter === 'outgoing') {
      whereClauses.push('cs.caller_id = $1');
    }

    const listRes = await db.query(
      `SELECT
         cs.id,
         cs.caller_id,
         cs.receiver_id,
         cs.property_id,
         cs.call_type,
         cs.status,
         COALESCE(cs.is_support_call, FALSE) AS is_support_call,
         cs.support_tier,
         cs.requested_at,
         cs.started_at,
         cs.ended_at,
         cu.full_name AS caller_name,
         cu.user_type AS caller_user_type,
         cu.assigned_state AS caller_state,
         cu.assigned_city AS caller_city,
         cu.assigned_lga AS caller_lga,
         cu.assigned_zone AS caller_zone,
         ru.full_name AS receiver_name,
         ru.user_type AS receiver_user_type,
         ru.assigned_state AS receiver_state,
         ru.assigned_city AS receiver_city,
         ru.assigned_lga AS receiver_lga,
         ru.assigned_zone AS receiver_zone
       FROM call_sessions cs
       LEFT JOIN users cu ON cu.id = cs.caller_id
       LEFT JOIN users ru ON ru.id = cs.receiver_id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY cs.requested_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const records = [];
    for (const row of listRes.rows || []) {
      const isOutgoing = Number(row.caller_id) === userId;
      const direction = isOutgoing ? 'outgoing' : 'incoming';
      const counterpartId = isOutgoing ? Number(row.receiver_id) || null : Number(row.caller_id) || null;
      const counterpartName = isOutgoing
        ? (row.receiver_name || 'Unknown Recipient')
        : (row.caller_name || 'Unknown Caller');
      const counterpartType = isOutgoing ? row.receiver_user_type : row.caller_user_type;
      const counterpart = {
        id: counterpartId,
        full_name: counterpartName,
        user_type: counterpartType || null,
        role_label: counterpartType ? getRoleLabel(counterpartType) : 'User',
        assigned_state: isOutgoing ? (row.receiver_state || null) : (row.caller_state || null),
        assigned_city: isOutgoing ? (row.receiver_city || null) : (row.caller_city || null),
        assigned_lga: isOutgoing ? (row.receiver_lga || null) : (row.caller_lga || null),
        assigned_zone: isOutgoing ? (row.receiver_zone || null) : (row.caller_zone || null),
        online:
          counterpartId && typeof isUserOnline === 'function'
            ? Boolean(isUserOnline(counterpartId))
            : false,
      };

      let canCallBack = false;
      if (counterpart.id && counterpart.user_type) {
        try {
          const perm = await canUserInitiateDirectCall(caller, counterpart, db);
          canCallBack = Boolean(perm?.allowed);
        } catch {
          canCallBack = false;
        }
      }

      const status = String(row.status || 'ended').toLowerCase();
      const isMissed = status === 'missed';
      const durationSeconds = computeCallDurationSeconds(row.started_at, row.ended_at);

      records.push({
        id: row.id,
        status,
        direction,
        is_missed: isMissed,
        is_missed_for_me: isMissed && direction === 'incoming',
        call_type: row.call_type || 'audio',
        is_support_call: Boolean(row.is_support_call),
        support_tier: row.support_tier || null,
        property_id: row.property_id || null,
        requested_at: row.requested_at,
        started_at: row.started_at || null,
        ended_at: row.ended_at || null,
        duration_seconds: durationSeconds,
        caller: {
          id: Number(row.caller_id) || null,
          full_name: row.caller_name || 'Unknown Caller',
          user_type: row.caller_user_type || null,
          role_label: row.caller_user_type ? getRoleLabel(row.caller_user_type) : 'User',
        },
        receiver: {
          id: Number(row.receiver_id) || null,
          full_name: row.receiver_name || 'Unknown Recipient',
          user_type: row.receiver_user_type || null,
          role_label: row.receiver_user_type ? getRoleLabel(row.receiver_user_type) : 'User',
        },
        counterpart,
        can_call_back: canCallBack,
      });
    }

    const sRow = summaryRes.rows?.[0] || {};
    return {
      records,
      summary: {
        total_count: Number(sRow.total_count || 0),
        missed_count: Number(sRow.missed_count || 0),
        incoming_missed_count: Number(sRow.incoming_missed_count || 0),
        incoming_unread_missed_count: Number(sRow.incoming_unread_missed_count || 0),
        answered_count: Number(sRow.answered_count || 0),
        incoming_count: Number(sRow.incoming_count || 0),
        outgoing_count: Number(sRow.outgoing_count || 0),
      },
    };
  } catch (error) {
    if (error?.code === '42P01') {
      return { records: [], summary: emptySummary };
    }
    throw error;
  }
};

module.exports = {
  getCallerPolicy,
  canSupportCall,
  canUserInitiateDirectCall,
  getCallDirectory,
  getCallHistory,
  markIncomingMissedCallsAsViewed,
  getRoleLabel,
  getCallIdentity,
};
