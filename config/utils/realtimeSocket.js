const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../middleware/database');
const { logAction } = require('./auditLogger');
const { getSocketAuthToken } = require('./authCookies');
const { getSessionTokenIdentity } = require('./sessionToken');
const { zoneForState } = require('./territorialZones');
const {
  verifyGuestAccessToken,
  canUseLegacyGuestEmailAccess,
} = require('./guestSupportAccess');

const CALL_ALLOWED_ROLES = new Set(['tenant', 'landlord', 'agent']);
const CALL_TYPES = new Set(['audio', 'video', 'virtual_tour']);
const CALL_RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS || 45000);
const SUPPORT_ADMIN_ROLES = new Set([
  'super_admin',
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
]);

const SUPPORT_AGENT_ROLES = new Set([
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
  'zonal_admin',
]);

const onlineUsers = new Map();
const socketUsers = new Map();
const activeCalls = new Map();
const multiPartyCallRooms = new Map();
const guestSocketAuthFailures = new Map();
const supportAvailability = new Map();
let callHistorySchemaReady = false;
let callRoomEventSchemaReady = false;
const MULTI_PARTY_CALL_LIMIT = 5;
const CALL_ROOM_ACTIONS = new Set(['created', 'accepted', 'join', 'leave', 'add_participant', 'remove_participant', 'host_transfer']);

const GUEST_SOCKET_AUTH_WINDOW_MS = Number(process.env.GUEST_SOCKET_AUTH_WINDOW_MS || 15 * 60 * 1000);
const GUEST_SOCKET_AUTH_MAX = Number(process.env.GUEST_SOCKET_AUTH_MAX || 30);

const getGuestSocketAddress = (socket) =>
  String(socket.handshake?.address || socket.conn?.remoteAddress || 'unknown');

const isGuestSocketAuthRateLimited = (socket) => {
  const key = getGuestSocketAddress(socket);
  const attempt = guestSocketAuthFailures.get(key);
  if (!attempt) return false;
  if (attempt.resetAt <= Date.now()) {
    guestSocketAuthFailures.delete(key);
    return false;
  }
  return attempt.count >= GUEST_SOCKET_AUTH_MAX;
};

const recordGuestSocketAuthFailure = (socket) => {
  const key = getGuestSocketAddress(socket);
  const now = Date.now();
  const attempt = guestSocketAuthFailures.get(key);

  if (!attempt || attempt.resetAt <= now) {
    guestSocketAuthFailures.set(key, { count: 1, resetAt: now + GUEST_SOCKET_AUTH_WINDOW_MS });
    return;
  }

  attempt.count += 1;
  guestSocketAuthFailures.set(key, attempt);
};

const guestSocketAuthCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of guestSocketAuthFailures) {
    if (attempt.resetAt <= now) guestSocketAuthFailures.delete(key);
  }
}, Math.min(GUEST_SOCKET_AUTH_WINDOW_MS, 60 * 1000));
if (typeof guestSocketAuthCleanup.unref === 'function') guestSocketAuthCleanup.unref();

const toUserRoom = (userId) => `user:${userId}`;

const getPublicUser = (user) => ({
  id: user.id,
  full_name: user.full_name,
  user_type: user.user_type,
});

const addOnlineSocket = (socket) => {
  const userId = String(socket.user.id);
  const sockets = onlineUsers.get(userId) || new Set();
  const wasOffline = sockets.size === 0;

  sockets.add(socket.id);
  onlineUsers.set(userId, sockets);
  socketUsers.set(socket.id, socket.user);

  return wasOffline;
};

const removeOnlineSocket = (socket) => {
  const userId = String(socket.user?.id || '');
  if (!userId) return false;

  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;

  sockets.delete(socket.id);
  socketUsers.delete(socket.id);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }

  onlineUsers.set(userId, sockets);
  return false;
};

const isUserOnline = (userId) => onlineUsers.has(String(userId));

const getOnlineUsersPayload = () =>
  Array.from(onlineUsers.keys())
    .map((userId) => {
      const socketId = Array.from(onlineUsers.get(userId) || [])[0];
      const user = socketUsers.get(socketId);
      return user ? getPublicUser(user) : null;
    })
    .filter(Boolean);

const fetchSocketUser = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const { userId, tokenVersion } = getSessionTokenIdentity(decoded);

  const result = await db.query(
    `SELECT id, full_name, email, user_type, deleted_at, is_active, token_version,
            assigned_state, assigned_city, assigned_lga, assigned_zone
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  const user = result.rows[0];

  if (!user || user.deleted_at || user.is_active === false) {
    throw new Error('User is not active');
  }

  const dbVersion = Number(user.token_version || 1);
  if (tokenVersion !== dbVersion) {
    throw new Error('Session expired. Please log in again.');
  }

  return user;
};

const normalizeRoomParticipants = (participants = []) => {
  const deduped = [];
  const seen = new Set();

  for (const participant of Array.isArray(participants) ? participants : []) {
    const id = Number(participant?.id ?? participant?.userId ?? 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({
      id,
      name: participant?.name || participant?.full_name || participant?.displayName || 'Support participant',
      role: participant?.role || participant?.status || 'participant',
      status: participant?.status || 'connected',
    });
  }

  return deduped.slice(0, MULTI_PARTY_CALL_LIMIT);
};

const addParticipantToRoom = (participants = [], nextParticipant = {}) => {
  const normalized = normalizeRoomParticipants(participants);
  const nextId = Number(nextParticipant?.id ?? nextParticipant?.userId ?? 0);

  if (!nextId) {
    return {
      added: false,
      participants: normalized,
      message: 'A valid user must be selected to add to the call.',
    };
  }

  const existing = normalized.find((participant) => Number(participant.id) === Number(nextId));
  if (existing) {
    existing.name = nextParticipant?.name || nextParticipant?.full_name || existing.name || 'Support participant';
    existing.role = nextParticipant?.role || nextParticipant?.status || existing.role || 'participant';
    existing.status = nextParticipant?.status || 'connected';
    return {
      added: false,
      participants: normalized,
      message: 'This participant is already in the call room.',
    };
  }

  if (normalized.length >= MULTI_PARTY_CALL_LIMIT) {
    return {
      added: false,
      participants: normalized,
      message: 'This call room is full. Maximum 5 participants allowed.',
    };
  }

  normalized.push({
    id: nextId,
    name: nextParticipant?.name || nextParticipant?.full_name || nextParticipant?.displayName || 'Support participant',
    role: nextParticipant?.role || nextParticipant?.status || 'participant',
    status: nextParticipant?.status || 'connected',
  });

  return {
    added: true,
    participants: normalized.slice(0, MULTI_PARTY_CALL_LIMIT),
    message: 'Participant added to the call room.',
  };
};

const removeParticipantFromRoom = (participants = [], targetUserId = 0) => {
  const normalized = normalizeRoomParticipants(participants);
  const targetId = Number(targetUserId || 0);

  if (!targetId) {
    return {
      removed: false,
      participants: normalized,
      message: 'A valid participant must be selected to remove.',
    };
  }

  const filtered = normalized.filter((participant) => Number(participant.id) !== Number(targetId));
  if (filtered.length === normalized.length) {
    return {
      removed: false,
      participants: normalized,
      message: 'That participant is not in this call room.',
    };
  }

  return {
    removed: true,
    participants: filtered.slice(0, MULTI_PARTY_CALL_LIMIT),
    message: 'Participant removed from the call room.',
  };
};

const transferCallHost = (participants = [], currentHostUserId = 0, nextHostUserId = 0) => {
  const normalized = normalizeRoomParticipants(participants);
  const currentHostId = Number(currentHostUserId || 0);
  const nextHostId = Number(nextHostUserId || 0);

  if (!currentHostId) {
    return {
      transferred: false,
      participants: normalized,
      message: 'There is no active host to transfer from.',
    };
  }

  if (!nextHostId) {
    return {
      transferred: false,
      participants: normalized,
      message: 'Select a valid participant to become the new host.',
    };
  }

  if (currentHostId === nextHostId) {
    return {
      transferred: false,
      participants: normalized,
      message: 'This participant is already the active host.',
    };
  }

  const currentExists = normalized.some((participant) => Number(participant.id) === currentHostId);
  const nextExists = normalized.some((participant) => Number(participant.id) === nextHostId);

  if (!currentExists || !nextExists) {
    return {
      transferred: false,
      participants: normalized,
      message: 'The selected host transfer target is not in this room.',
    };
  }

  const updated = normalized.map((participant) => {
    const participantId = Number(participant.id);
    if (participantId === currentHostId) {
      return { ...participant, role: 'participant', status: participant.status || 'connected' };
    }
    if (participantId === nextHostId) {
      return { ...participant, role: 'host', status: participant.status || 'connected' };
    }
    return participant;
  });

  return {
    transferred: true,
    participants: updated,
    message: 'Host transferred to the selected participant.',
  };
};

const ensureCallRoom = (call) => {
  if (!call) return null;
  const callId = String(call.id);
  const room = multiPartyCallRooms.get(callId) || {
    callId,
    participants: [],
    createdAt: call.createdAt || new Date().toISOString(),
  };

  const baseParticipants = normalizeRoomParticipants(call.participants || [
    { id: call.caller?.id, name: call.caller?.full_name || call.caller?.name || 'Caller', role: 'caller', status: 'connected' },
    { id: call.receiver?.id, name: call.receiver?.full_name || call.receiver?.name || 'Receiver', role: 'receiver', status: 'connected' },
  ]);

  const mergedParticipants = normalizeRoomParticipants([
    ...baseParticipants,
    ...room.participants,
  ]);

  room.participants = mergedParticipants;
  call.participants = mergedParticipants.map((participant) => ({
    ...participant,
    userId: participant.id,
  }));
  multiPartyCallRooms.set(callId, room);
  return room;
};

const emitCallRoomUpdate = (io, call, extra = {}) => {
  const room = ensureCallRoom(call);
  const payload = {
    callId: call.id,
    callType: call.callType,
    propertyId: call.propertyId,
    propertyTitle: call.propertyTitle,
    status: call.status,
    participants: room?.participants || [],
    ...extra,
  };

  for (const participant of payload.participants || []) {
    io.to(toUserRoom(participant.id)).emit('call:room:updated', payload);
  }
};

const emitCallEvent = (io, call, eventName, payload = {}) => {
  const room = ensureCallRoom(call);
  const message = {
    callId: call.id,
    callType: call.callType,
    propertyId: call.propertyId,
    propertyTitle: call.propertyTitle,
    status: call.status,
    caller: call.caller,
    receiver: call.receiver,
    participants: room?.participants || [],
    createdAt: call.createdAt,
    ...payload,
  };

  if (call.caller?.id) io.to(toUserRoom(call.caller.id)).emit(eventName, message);
  if (call.receiver?.id) io.to(toUserRoom(call.receiver.id)).emit(eventName, message);
  for (const participant of room?.participants || []) {
    if (Number(participant.id) !== Number(call.caller?.id) && Number(participant.id) !== Number(call.receiver?.id)) {
      io.to(toUserRoom(participant.id)).emit(eventName, message);
    }
  }
};

const clearCallTimer = (call) => {
  if (call?.timeoutId) {
    clearTimeout(call.timeoutId);
  }
};

const isCallParticipant = (call, userId) =>
  Number(call?.caller?.id) === Number(userId) ||
  Number(call?.receiver?.id) === Number(userId);

const validateCallRoomParticipantAccess = async ({ propertyId, userId, targetUserId }) => {
  const normalizedPropertyId = Number(propertyId || 0);
  const normalizedUserId = Number(userId || 0);
  const normalizedTargetUserId = Number(targetUserId || 0);

  if (!normalizedPropertyId || !normalizedUserId || !normalizedTargetUserId) {
    return { allowed: true, message: null };
  }

  try {
    const propertyResult = await db.query(
      `SELECT landlord_id FROM properties WHERE id = $1 LIMIT 1`,
      [normalizedPropertyId]
    );
    const property = propertyResult.rows[0];

    if (!property) {
      return {
        allowed: false,
        message: 'This property is no longer available for a call.',
      };
    }

    if (
      Number(property.landlord_id) === normalizedUserId ||
      Number(property.landlord_id) === normalizedTargetUserId
    ) {
      return { allowed: true, message: null };
    }

    const applicationResult = await db.query(
      `SELECT 1 FROM applications
       WHERE property_id = $1
         AND tenant_id IN ($2, $3)
         AND status IN ('pending', 'approved', 'active', 'accepted')
       LIMIT 1`,
      [normalizedPropertyId, normalizedUserId, normalizedTargetUserId]
    );

    if (applicationResult.rows.length) {
      return { allowed: true, message: null };
    }

    const agreementResult = await db.query(
      `SELECT 1 FROM tenancy_agreements
       WHERE property_id = $1
         AND (
           landlord_id IN ($2, $3)
           OR tenant_id IN ($2, $3)
           OR agent_id IN ($2, $3)
         )
         AND status IN (
           'DRAFT',
           'PENDING_LANDLORD_REVIEW',
           'PENDING_LANDLORD_SIGNATURE',
           'PENDING_TENANT_REVIEW',
           'PENDING_TENANT_SIGNATURE',
           'PARTIALLY_EXECUTED',
           'FULLY_EXECUTED'
         )
       LIMIT 1`,
      [normalizedPropertyId, normalizedUserId, normalizedTargetUserId]
    );

    if (agreementResult.rows.length) {
      return { allowed: true, message: null };
    }

    return {
      allowed: false,
      message: 'This call is only available to the landlord, tenant, or agent linked to this property.',
    };
  } catch (error) {
    return {
      allowed: false,
      message: 'This call relationship could not be verified. Please try again.',
    };
  }
};

const getOtherParticipantId = (call, userId) => {
  if (Number(call?.caller?.id) === Number(userId)) {
    return call.receiver.id;
  }

  if (Number(call?.receiver?.id) === Number(userId)) {
    return call.caller.id;
  }

  return null;
};

const buildSignalPayload = (call, userId, payload = {}) => ({
  callId: call.id,
  callType: call.callType,
  propertyId: call.propertyId,
  propertyTitle: call.propertyTitle,
  caller: call.caller,
  receiver: call.receiver,
  fromUserId: userId,
  ...payload,
});

const ensureCallHistorySchema = async () => {
  if (callHistorySchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS call_sessions (
      id UUID PRIMARY KEY,
      caller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      receiver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      call_type VARCHAR(30) NOT NULL CHECK (call_type IN ('audio', 'video', 'virtual_tour')),
      status VARCHAR(30) NOT NULL CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed')),
      is_support_call BOOLEAN NOT NULL DEFAULT FALSE,
      support_tier VARCHAR(30),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_id ON call_sessions(caller_id);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_receiver_id ON call_sessions(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_property_id ON call_sessions(property_id);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_call_type ON call_sessions(call_type);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_call_sessions_requested_at ON call_sessions(requested_at DESC);
  `);

  callHistorySchemaReady = true;
};

const buildCallRoomEvent = ({ callId, action, actorUserId, targetUserId, metadata = {} }) => {
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!callId || !CALL_ROOM_ACTIONS.has(normalizedAction)) {
    return null;
  }

  return {
    callId: String(callId),
    action: normalizedAction,
    actorUserId: Number(actorUserId) || null,
    targetUserId: Number(targetUserId) || null,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    createdAt: new Date().toISOString(),
  };
};

const ensureCallRoomEventSchema = async () => {
  if (callRoomEventSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS call_room_events (
      id UUID PRIMARY KEY,
      call_id UUID NOT NULL,
      action VARCHAR(40) NOT NULL CHECK (action IN ('created', 'accepted', 'join', 'leave', 'add_participant', 'remove_participant', 'host_transfer')),
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_call_room_events_call_id ON call_room_events(call_id);
    CREATE INDEX IF NOT EXISTS idx_call_room_events_actor_user_id ON call_room_events(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_call_room_events_created_at ON call_room_events(created_at DESC);
  `);

  callRoomEventSchemaReady = true;
};

const recordCallRoomEvent = async ({ callId, action, actorUserId, targetUserId, metadata = {} }) => {
  try {
    const event = buildCallRoomEvent({ callId, action, actorUserId, targetUserId, metadata });
    if (!event) return;

    await ensureCallRoomEventSchema();
    await db.query(
      `INSERT INTO call_room_events (
         id,
         call_id,
         action,
         actor_user_id,
         target_user_id,
         metadata,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        event.callId,
        event.action,
        event.actorUserId,
        event.targetUserId,
        JSON.stringify(event.metadata || {}),
        event.createdAt,
      ]
    );
  } catch (error) {
    logger.error('Call room event audit failed:', error.message);
  }
};

const recordCallSession = async (call, status, timestamps = {}) => {
  try {
    await ensureCallHistorySchema();

    await db.query(
      `INSERT INTO call_sessions (
         id,
         caller_id,
         receiver_id,
         property_id,
         call_type,
         status,
         is_support_call,
         support_tier,
         requested_at,
         started_at,
         ended_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         started_at = COALESCE(EXCLUDED.started_at, call_sessions.started_at),
         ended_at = COALESCE(EXCLUDED.ended_at, call_sessions.ended_at),
         updated_at = NOW()`,
      [
        call.id,
        call.caller?.id || null,
        call.receiver?.id || null,
        call.propertyId || null,
        call.callType,
        status,
        call.isSupport === true,
        call.supportTier || null,
        call.createdAt || new Date().toISOString(),
        timestamps.startedAt || null,
        timestamps.endedAt || null,
      ]
    );
  } catch (error) {
    logger.error('Call session history failed:', error.message);
  }
};

const logVirtualTourAudit = async (call, action, actorId) => {
  if (call.callType !== 'virtual_tour') return;

  await logAction({
    actorId,
    action,
    targetType: 'property',
    targetId: call.propertyId || null,
  });
};

const normLocation = (value) => String(value || '').trim().toLowerCase();

const resolveCallerLocation = async (userId) => {
  const result = await db.query(
    `SELECT s.state_name, u.preferred_lga_name
     FROM users u
     LEFT JOIN states s ON s.id = u.preferred_state_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  const state = String(result.rows[0]?.state_name || '').trim();
  const lga = String(result.rows[0]?.preferred_lga_name || '').trim();
  return { state, lga, zone: state ? zoneForState(state) : null };
};

const resolveSupportChain = async (callerLoc) => {
  const chain = [];

  if (callerLoc.state && callerLoc.lga) {
    const lgaResult = await db.query(
      `SELECT id FROM users
       WHERE user_type = 'lga_support_admin'
         AND LOWER(TRIM(COALESCE(assigned_state, ''))) = $1
         AND LOWER(TRIM(COALESCE(NULLIF(assigned_city, ''), assigned_lga, ''))) = $2
         AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY id ASC`,
      [normLocation(callerLoc.state), normLocation(callerLoc.lga)]
    );
    chain.push({ name: 'lga', userIds: lgaResult.rows.map((row) => row.id) });
  }

  if (callerLoc.state) {
    const stateResult = await db.query(
      `SELECT id FROM users
       WHERE user_type = 'state_support_admin'
         AND LOWER(TRIM(COALESCE(assigned_state, ''))) = $1
         AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY id ASC`,
      [normLocation(callerLoc.state)]
    );
    chain.push({ name: 'state', userIds: stateResult.rows.map((row) => row.id) });
  }

  if (callerLoc.zone) {
    const zonalResult = await db.query(
      `SELECT id FROM users
       WHERE user_type = 'zonal_admin'
         AND LOWER(TRIM(COALESCE(assigned_zone, ''))) = $1
         AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY id ASC`,
      [normLocation(callerLoc.zone)]
    );
    chain.push({ name: 'zonal', userIds: zonalResult.rows.map((row) => row.id) });
  }

  const nationalResult = await db.query(
    `SELECT id FROM users
     WHERE user_type = 'super_support_admin'
       AND deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY id ASC`
  );
  chain.push({ name: 'national', userIds: nationalResult.rows.map((row) => row.id) });

  return chain;
};

const findAvailableSupportAgent = async (callerLoc) => {
  const chain = await resolveSupportChain(callerLoc);
  for (const tier of chain) {
    for (const userId of tier.userIds) {
      if (supportAvailability.get(String(userId)) === true) {
        return { tier: tier.name, userId };
      }
    }
  }
  return null;
};

const configureRealtimeSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = getSocketAuthToken(socket);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      socket.user = await fetchSocketUser(token);
      return next();
    } catch (error) {
      return next(new Error(error.message || 'Socket authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const wasOffline = addOnlineSocket(socket);

    socket.join(toUserRoom(user.id));
    socket.join(`role:${user.user_type}`);

    socket.emit('presence:state', {
      users: getOnlineUsersPayload(),
    });

    if (wasOffline) {
      socket.broadcast.emit('presence:online', {
        user: getPublicUser(user),
      });
    }

    socket.on('presence:check', (payload = {}, callback) => {
      const userIds = Array.isArray(payload.userIds) ? payload.userIds : [];
      const statuses = Object.fromEntries(
        userIds.map((userId) => [String(userId), isUserOnline(userId)])
      );

      if (typeof callback === 'function') {
        callback({ success: true, statuses });
      }
    });

    socket.on('support:available', (payload = {}, callback) => {
      try {
        const role = String(user.user_type || '').toLowerCase();
        if (!SUPPORT_AGENT_ROLES.has(role)) {
          throw new Error('Only support agents can set availability');
        }

        if (payload.available) {
          supportAvailability.set(String(user.id), true);
        } else {
          supportAvailability.delete(String(user.id));
        }

        if (typeof callback === 'function') {
          callback({ success: true, available: Boolean(payload.available) });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('message:typing', async (payload = {}, callback) => {
      try {
        const receiverId = Number(payload.receiverId || payload.receiver_id);
        if (!Number.isInteger(receiverId) || receiverId <= 0 || receiverId === Number(user.id)) {
          throw new Error('Select a valid message recipient');
        }

        const receiverResult = await db.query(
          `SELECT id, user_type
           FROM users
           WHERE id = $1
             AND deleted_at IS NULL
             AND COALESCE(is_active, TRUE) = TRUE
           LIMIT 1`,
          [receiverId]
        );
        const receiver = receiverResult.rows[0];
        if (!receiver) {
          throw new Error('Message recipient is not available');
        }

        const senderRole = String(user.user_type || '').toLowerCase();
        const receiverRole = String(receiver.user_type || '').toLowerCase();
        const canMessage =
          (senderRole === 'super_admin' &&
            ['admin', 'lga_admin', 'tenant', 'landlord'].includes(receiverRole)) ||
          (['admin', 'lga_admin'].includes(senderRole) &&
            ['tenant', 'landlord', 'super_admin'].includes(receiverRole)) ||
          (['tenant', 'landlord'].includes(senderRole) &&
            ['admin', 'lga_admin', 'super_admin'].includes(receiverRole));

        if (!canMessage) {
          throw new Error('You are not allowed to message this user');
        }

        io.to(toUserRoom(receiverId)).emit('message:typing', {
          user_id: user.id,
          user_name: user.full_name || user.email || 'RentalHub user',
          receiver_id: receiverId,
          is_typing: Boolean(payload.isTyping ?? payload.is_typing),
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('ticket:typing', async (payload = {}) => {
      try {
        const ticketId = Number(payload.ticketId || payload.ticket_id);
        if (!Number.isInteger(ticketId) || ticketId <= 0) return;

        const ticketResult = await db.query(
          `SELECT id, user_id, assigned_to
           FROM support_tickets
           WHERE id = $1
           LIMIT 1`,
          [ticketId]
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) return;

        const isAdmin = SUPPORT_ADMIN_ROLES.has(String(user.user_type || '').toLowerCase());
        const eventPayload = {
          ticketId,
          userId: user.id,
          userName: user.full_name || user.email || 'User',
          isAdmin,
        };

        if (isAdmin) {
          if (ticket.user_id) {
            io.to(toUserRoom(ticket.user_id)).emit('ticket:typing', eventPayload);
          } else {
            io.of('/guest').to(`ticket:guest:${ticketId}`).emit('ticket:typing', eventPayload);
          }
          return;
        }

        if (Number(ticket.user_id) !== Number(user.id)) return;

        if (ticket.assigned_to) {
          io.to(toUserRoom(ticket.assigned_to)).emit('ticket:typing', eventPayload);
        } else {
          for (const role of SUPPORT_ADMIN_ROLES) {
            io.to(`role:${role}`).emit('ticket:typing', eventPayload);
          }
        }
      } catch (error) {
        logger.error('ticket:typing socket error:', error.message);
      }
    });

    socket.on('call:invite', async (payload = {}, callback) => {
      try {
        const receiverId = Number(payload.receiverId || payload.receiver_id);
        const callType = CALL_TYPES.has(payload.callType)
          ? payload.callType
          : 'audio';

        if (!CALL_ALLOWED_ROLES.has(user.user_type)) {
          throw new Error('Only tenants, landlords and agents can start calls');
        }

        if (!receiverId || receiverId === Number(user.id)) {
          throw new Error('Select a valid call recipient');
        }

        const receiverResult = await db.query(
          `SELECT id, full_name, email, user_type, deleted_at, is_active
           FROM users
           WHERE id = $1
           LIMIT 1`,
          [receiverId]
        );
        const receiver = receiverResult.rows[0];

        if (!receiver || receiver.deleted_at || receiver.is_active === false) {
          throw new Error('Call recipient is not available');
        }

        if (!CALL_ALLOWED_ROLES.has(receiver.user_type)) {
          throw new Error('Calls can only be sent to tenants, landlords or agents');
        }

        if (payload.propertyId) {
          const access = await validateCallRoomParticipantAccess({
            propertyId: payload.propertyId,
            userId: user.id,
            targetUserId: receiver.id,
          });
          if (!access.allowed) {
            throw new Error(access.message || 'This user cannot be called for this property.');
          }
        }

        const call = {
          id: crypto.randomUUID(),
          caller: getPublicUser(user),
          receiver: getPublicUser(receiver),
          callType,
          propertyId: payload.propertyId ? Number(payload.propertyId) : null,
          propertyTitle: payload.propertyTitle || '',
          status: 'ringing',
          createdAt: new Date().toISOString(),
        };

        call.timeoutId = setTimeout(() => {
          const currentCall = activeCalls.get(call.id);
          if (!currentCall || currentCall.status !== 'ringing') return;

          currentCall.status = 'missed';
          activeCalls.delete(call.id);
          const endedAt = new Date().toISOString();
          void recordCallSession(currentCall, 'missed', { endedAt });
          void logVirtualTourAudit(
            currentCall,
            'VIRTUAL_TOUR_MISSED',
            currentCall.caller?.id || null
          );
          emitCallEvent(io, currentCall, 'call:missed', {
            endedAt,
          });
        }, CALL_RING_TIMEOUT_MS);

        call.participants = normalizeRoomParticipants([
          { id: call.caller.id, name: call.caller.full_name || call.caller.name || 'Caller', role: 'caller', status: 'connected' },
          { id: call.receiver.id, name: call.receiver.full_name || call.receiver.name || 'Receiver', role: 'receiver', status: 'connected' },
        ]);

        activeCalls.set(call.id, call);
        ensureCallRoom(call);
        await recordCallSession(call, 'ringing');
        await recordCallRoomEvent({
          callId: call.id,
          action: 'created',
          actorUserId: user.id,
          targetUserId: receiver.id,
          metadata: {
            callType: call.callType,
            propertyId: call.propertyId,
            propertyTitle: call.propertyTitle,
          },
        });
        await logVirtualTourAudit(call, 'VIRTUAL_TOUR_REQUESTED', user.id);

        io.to(toUserRoom(receiver.id)).emit('call:incoming', {
          callId: call.id,
          callType: call.callType,
          propertyId: call.propertyId,
          propertyTitle: call.propertyTitle,
          status: call.status,
          caller: call.caller,
          createdAt: call.createdAt,
        });

        socket.emit('call:outgoing', {
          callId: call.id,
          callType: call.callType,
          propertyId: call.propertyId,
          propertyTitle: call.propertyTitle,
          status: call.status,
          receiver: call.receiver,
          createdAt: call.createdAt,
          receiverOnline: isUserOnline(receiver.id),
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            call: {
              callId: call.id,
              status: call.status,
              receiver: call.receiver,
              receiverOnline: isUserOnline(receiver.id),
            },
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:support', async (payload = {}, callback) => {
      try {
        if (!CALL_ALLOWED_ROLES.has(user.user_type)) {
          throw new Error('Only tenants, landlords and agents can call support');
        }

        const callerLoc = await resolveCallerLocation(user.id);
        const target = await findAvailableSupportAgent(callerLoc);

        if (!target) {
          if (typeof callback === 'function') {
            callback({
              success: false,
              code: 'NO_AGENT',
              message: 'No support agent is available right now. Please leave a message.',
            });
          }
          return;
        }

        const receiverResult = await db.query(
          `SELECT id, full_name, email, user_type, deleted_at, is_active
           FROM users
           WHERE id = $1
           LIMIT 1`,
          [target.userId]
        );
        const receiver = receiverResult.rows[0];

        if (!receiver || receiver.deleted_at || receiver.is_active === false) {
          throw new Error('Support agent is not available');
        }

        const call = {
          id: crypto.randomUUID(),
          caller: getPublicUser(user),
          receiver: getPublicUser(receiver),
          callType: 'audio',
          propertyId: null,
          propertyTitle: '',
          status: 'ringing',
          isSupport: true,
          supportTier: target.tier,
          createdAt: new Date().toISOString(),
        };

        call.timeoutId = setTimeout(() => {
          const currentCall = activeCalls.get(call.id);
          if (!currentCall || currentCall.status !== 'ringing') return;

          currentCall.status = 'missed';
          activeCalls.delete(call.id);
          const endedAt = new Date().toISOString();
          void recordCallSession(currentCall, 'missed', { endedAt });
          emitCallEvent(io, currentCall, 'call:missed', { endedAt });
        }, CALL_RING_TIMEOUT_MS);

        activeCalls.set(call.id, call);
        await recordCallSession(call, 'ringing');

        io.to(toUserRoom(receiver.id)).emit('call:incoming', {
          callId: call.id,
          callType: call.callType,
          propertyId: call.propertyId,
          propertyTitle: call.propertyTitle,
          status: call.status,
          caller: call.caller,
          isSupport: true,
          supportTier: call.supportTier,
          createdAt: call.createdAt,
        });

        socket.emit('call:outgoing', {
          callId: call.id,
          callType: call.callType,
          propertyId: call.propertyId,
          propertyTitle: call.propertyTitle,
          status: call.status,
          receiver: call.receiver,
          isSupport: true,
          supportTier: call.supportTier,
          createdAt: call.createdAt,
          receiverOnline: isUserOnline(receiver.id),
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            call: {
              callId: call.id,
              status: call.status,
              receiver: call.receiver,
              receiverOnline: isUserOnline(receiver.id),
              isSupport: true,
              supportTier: call.supportTier,
            },
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:accept', async (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      if (!call || call.status !== 'ringing') {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Call is no longer available' });
        }
        return;
      }

      if (Number(call.receiver.id) !== Number(user.id)) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Only the receiver can accept this call' });
        }
        return;
      }

      clearCallTimer(call);
      call.status = 'accepted';
      call.acceptedAt = new Date().toISOString();
      call.participants = ensureCallRoom(call)?.participants || call.participants || normalizeRoomParticipants([
        { id: call.caller.id, name: call.caller.full_name || call.caller.name || 'Caller', role: 'caller', status: 'connected' },
        { id: call.receiver.id, name: call.receiver.full_name || call.receiver.name || 'Receiver', role: 'receiver', status: 'connected' },
      ]);
      activeCalls.set(call.id, call);
      await recordCallSession(call, 'accepted', {
        startedAt: call.acceptedAt,
      });
      await recordCallRoomEvent({
        callId: call.id,
        action: 'accepted',
        actorUserId: user.id,
        metadata: {
          acceptedAt: call.acceptedAt,
        },
      });
      await logVirtualTourAudit(call, 'VIRTUAL_TOUR_ACCEPTED', user.id);
      emitCallEvent(io, call, 'call:accepted', { acceptedAt: call.acceptedAt });
      emitCallRoomUpdate(io, call, { status: 'accepted', action: 'accept' });

      if (typeof callback === 'function') {
        callback({ success: true, callId: call.id });
      }
    });

    socket.on('call:reject', async (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      if (!call) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Call is no longer available' });
        }
        return;
      }

      if (Number(call.receiver.id) !== Number(user.id)) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Only the receiver can reject this call' });
        }
        return;
      }

      clearCallTimer(call);
      call.status = 'rejected';
      activeCalls.delete(call.id);
      const endedAt = new Date().toISOString();
      await recordCallSession(call, 'rejected', { endedAt });
      await logVirtualTourAudit(call, 'VIRTUAL_TOUR_REJECTED', user.id);
      emitCallEvent(io, call, 'call:rejected', {
        endedAt,
      });

      if (typeof callback === 'function') {
        callback({ success: true, callId: call.id });
      }
    });

    socket.on('call:end', async (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      if (!call) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Call is no longer available' });
        }
        return;
      }

      const isParticipant =
        Number(call.caller.id) === Number(user.id) ||
        Number(call.receiver.id) === Number(user.id);

      if (!isParticipant) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Only call participants can end this call' });
        }
        return;
      }

      clearCallTimer(call);
      call.status = 'ended';
      activeCalls.delete(call.id);
      multiPartyCallRooms.delete(String(call.id));
      const endedAt = new Date().toISOString();
      await recordCallSession(call, 'ended', { endedAt });
      await logVirtualTourAudit(call, 'VIRTUAL_TOUR_ENDED', user.id);
      emitCallEvent(io, call, 'call:ended', {
        endedAt,
      });

      if (typeof callback === 'function') {
        callback({ success: true, callId: call.id });
      }
    });

    socket.on('call:room:join', async (payload = {}, callback) => {
      try {
        const call = activeCalls.get(payload.callId);
        if (!call || call.status !== 'accepted') {
          throw new Error('This call room is not active');
        }
        if (!isCallParticipant(call, user.id) && !call.participants?.some((participant) => Number(participant.id) === Number(user.id))) {
          throw new Error('You are not a participant in this call');
        }

        const room = ensureCallRoom(call);
        const existing = room.participants.find((participant) => Number(participant.id) === Number(user.id));
        if (existing) {
          existing.role = String(payload.role || existing.role || 'participant');
          existing.status = 'connected';
        } else {
          const roomUpdate = addParticipantToRoom(room.participants, {
            id: Number(user.id),
            name: user.full_name || user.email || 'Support participant',
            role: String(payload.role || 'participant'),
            status: 'connected',
          });
          if (!roomUpdate.added) {
            throw new Error(roomUpdate.message || 'This call room is full.');
          }
          room.participants = roomUpdate.participants;
        }

        call.participants = room.participants.map((participant) => ({
          ...participant,
          userId: participant.id,
        }));
        await recordCallRoomEvent({
          callId: call.id,
          action: 'join',
          actorUserId: user.id,
          metadata: {
            participants: room.participants,
            role: payload.role || 'participant',
          },
        });
        emitCallRoomUpdate(io, call, { action: 'join' });
        if (typeof callback === 'function') {
          callback({ success: true, participants: room.participants });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:room:add-participant', async (payload = {}, callback) => {
      try {
        const call = activeCalls.get(payload.callId);
        if (!call || call.status !== 'accepted') {
          throw new Error('This call room is not active');
        }

        const currentHostUserId = Number(call.hostUserId || call.caller?.id || 0);
        if (Number(user.id) !== currentHostUserId) {
          throw new Error('Only the host can add another user to this call');
        }

        const invitedUserId = Number(payload.userId || payload.memberId || payload.receiverId || payload.targetUserId || 0);
        if (!invitedUserId || invitedUserId === Number(user.id)) {
          throw new Error('Select a valid user to add to the call');
        }

        const invitedResult = await db.query(
          `SELECT id, full_name, email, user_type, deleted_at, is_active
           FROM users
           WHERE id = $1
           LIMIT 1`,
          [invitedUserId]
        );
        const invitedUser = invitedResult.rows[0];

        if (!invitedUser || invitedUser.deleted_at || invitedUser.is_active === false) {
          throw new Error('That user is not available to join the call');
        }

        if (!CALL_ALLOWED_ROLES.has(invitedUser.user_type)) {
          throw new Error('Only tenants, landlords and agents can join an in-app call room');
        }

        if (call.propertyId) {
          const access = await validateCallRoomParticipantAccess({
            propertyId: call.propertyId,
            userId: user.id,
            targetUserId: invitedUser.id,
          });
          if (!access.allowed) {
            throw new Error(access.message || 'This user cannot join this property call.');
          }
        }

        const room = ensureCallRoom(call);
        const roomUpdate = addParticipantToRoom(room.participants, {
          id: invitedUser.id,
          name: invitedUser.full_name || invitedUser.email || 'Platform user',
          role: invitedUser.user_type || 'participant',
          status: 'connected',
        });

        if (!roomUpdate.added && roomUpdate.message && !/already in the call room/i.test(roomUpdate.message)) {
          throw new Error(roomUpdate.message);
        }

        room.participants = roomUpdate.participants;
        call.participants = room.participants.map((participant) => ({
          ...participant,
          userId: participant.id,
        }));
        const roomPayload = {
          action: 'participant:add',
          addedUserId: invitedUser.id,
          addedByUserId: user.id,
          addedUser: getPublicUser(invitedUser),
          status: call.status,
        };

        await recordCallRoomEvent({
          callId: call.id,
          action: 'add_participant',
          actorUserId: user.id,
          targetUserId: invitedUser.id,
          metadata: {
            addedUser: getPublicUser(invitedUser),
            participants: room.participants,
            role: payload.role || 'participant',
          },
        });
        emitCallRoomUpdate(io, call, roomPayload);
        io.to(toUserRoom(invitedUser.id)).emit('call:incoming', {
          callId: call.id,
          callType: call.callType,
          propertyId: call.propertyId,
          propertyTitle: call.propertyTitle,
          status: call.status,
          caller: call.caller,
          receiver: call.receiver,
          participants: room.participants,
          addedByUserId: user.id,
          addedToRoom: true,
          createdAt: call.createdAt,
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            participants: room.participants,
            added: roomUpdate.added,
            message: roomUpdate.message,
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:room:transfer-host', async (payload = {}, callback) => {
      try {
        const call = activeCalls.get(payload.callId);
        if (!call || call.status !== 'accepted') {
          throw new Error('This call room is not active');
        }

        const currentHostUserId = Number(call.hostUserId || call.caller?.id || call.receiver?.id || 0);
        const targetUserId = Number(payload.userId || payload.memberId || payload.targetUserId || 0);
        if (!targetUserId) {
          throw new Error('Select a valid participant to promote to host');
        }

        const room = ensureCallRoom(call);
        const isCurrentHost = Number(user.id) === currentHostUserId || Number(user.id) === Number(call.caller?.id);
        if (!isCurrentHost) {
          throw new Error('Only the current host can transfer host access');
        }

        const transfer = transferCallHost(room.participants, currentHostUserId, targetUserId);
        if (!transfer.transferred) {
          throw new Error(transfer.message || 'Host transfer failed.');
        }

        room.participants = transfer.participants;
        call.participants = room.participants.map((participant) => ({
          ...participant,
          userId: participant.id,
        }));
        call.hostUserId = targetUserId;

        await recordCallRoomEvent({
          callId: call.id,
          action: 'host_transfer',
          actorUserId: user.id,
          targetUserId,
          metadata: {
            previousHostUserId: currentHostUserId,
            newHostUserId: targetUserId,
            participants: room.participants,
          },
        });

        emitCallRoomUpdate(io, call, {
          action: 'host:transfer',
          hostUserId: targetUserId,
          previousHostUserId: currentHostUserId,
        });
        io.to(toUserRoom(targetUserId)).emit('call:room:host-assigned', {
          callId: call.id,
          hostUserId: targetUserId,
          participants: room.participants,
          message: 'You are now the host of this call room.',
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            participants: room.participants,
            transferred: true,
            message: transfer.message,
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:room:remove-participant', async (payload = {}, callback) => {
      try {
        const call = activeCalls.get(payload.callId);
        if (!call || call.status !== 'accepted') {
          throw new Error('This call room is not active');
        }

        const targetUserId = Number(payload.userId || payload.memberId || payload.targetUserId || 0);
        if (!targetUserId || targetUserId === Number(user.id)) {
          throw new Error('Select a valid participant to remove from the call');
        }

        const currentHostUserId = Number(call.hostUserId || call.caller?.id || 0);
        if (Number(user.id) !== currentHostUserId) {
          throw new Error('Only the host can remove participants from this call');
        }

        const room = ensureCallRoom(call);
        const removal = removeParticipantFromRoom(room.participants, targetUserId);
        if (!removal.removed) {
          throw new Error(removal.message || 'That participant cannot be removed from this room.');
        }

        room.participants = removal.participants;
        call.participants = room.participants.map((participant) => ({
          ...participant,
          userId: participant.id,
        }));

        await recordCallRoomEvent({
          callId: call.id,
          action: 'remove_participant',
          actorUserId: user.id,
          targetUserId,
          metadata: {
            removedUserId: targetUserId,
            participants: room.participants,
          },
        });

        emitCallRoomUpdate(io, call, {
          action: 'participant:remove',
          removedUserId: targetUserId,
        });
        io.to(toUserRoom(targetUserId)).emit('call:room:removed', {
          callId: call.id,
          removedUserId: targetUserId,
          participants: room.participants,
          message: 'You were removed from the call room.',
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            participants: room.participants,
            removed: true,
            message: removal.message,
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:room:leave', async (payload = {}, callback) => {
      try {
        const call = activeCalls.get(payload.callId);
        if (!call) {
          throw new Error('This call room is no longer available');
        }

        const room = ensureCallRoom(call);
        const nextParticipants = room.participants.filter((participant) => Number(participant.id) !== Number(user.id));
        room.participants = nextParticipants;
        call.participants = nextParticipants.map((participant) => ({
          ...participant,
          userId: participant.id,
        }));

        if (!room.participants.length) {
          multiPartyCallRooms.delete(String(call.id));
        }

        await recordCallRoomEvent({
          callId: call.id,
          action: 'leave',
          actorUserId: user.id,
          metadata: {
            participants: room.participants,
          },
        });
        emitCallRoomUpdate(io, call, { action: 'leave' });
        if (typeof callback === 'function') {
          callback({ success: true, participants: room.participants });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ success: false, message: error.message });
        }
      }
    });

    socket.on('call:signal:offer', (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      const targetUserId = getOtherParticipantId(call, user.id);

      if (!call || call.status !== 'accepted' || !targetUserId || !payload.description) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Cannot relay offer for this call' });
        }
        return;
      }

      io.to(toUserRoom(targetUserId)).emit(
        'call:signal:offer',
        buildSignalPayload(call, user.id, { description: payload.description })
      );

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on('call:signal:answer', (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      const targetUserId = getOtherParticipantId(call, user.id);

      if (!call || call.status !== 'accepted' || !targetUserId || !payload.description) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Cannot relay answer for this call' });
        }
        return;
      }

      io.to(toUserRoom(targetUserId)).emit(
        'call:signal:answer',
        buildSignalPayload(call, user.id, { description: payload.description })
      );

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on('call:signal:ice-candidate', (payload = {}, callback) => {
      const call = activeCalls.get(payload.callId);
      const targetUserId = getOtherParticipantId(call, user.id);

      if (!call || !isCallParticipant(call, user.id) || !targetUserId || !payload.candidate) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Cannot relay ICE candidate for this call' });
        }
        return;
      }

      io.to(toUserRoom(targetUserId)).emit(
        'call:signal:ice-candidate',
        buildSignalPayload(call, user.id, { candidate: payload.candidate })
      );

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on('disconnect', () => {
      const wentOffline = removeOnlineSocket(socket);
      supportAvailability.delete(String(user.id));
      if (wentOffline) {
        socket.broadcast.emit('presence:offline', {
          userId: user.id,
        });
      }
    });
  });

  // Guest namespace for anonymous support ticket conversations
  const guestNsp = io.of('/guest');
  guestNsp.use(async (socket, next) => {
    try {
      if (isGuestSocketAuthRateLimited(socket)) {
        return next(new Error('Guest authentication failed'));
      }

      const {
        ticketId,
        guestAccessToken,
        accessToken,
        email,
      } = socket.handshake.auth || {};
      const normalizedTicketId = Number(ticketId);
      if (!Number.isInteger(normalizedTicketId) || normalizedTicketId <= 0) {
        recordGuestSocketAuthFailure(socket);
        return next(new Error('Guest authentication failed'));
      }

      const result = await db.query(
        `SELECT id, contact_email, guest_access_token_hash,
                guest_access_token_revoked_at, guest_legacy_access_expires_at
         FROM support_tickets
         WHERE id = $1 AND user_id IS NULL
         LIMIT 1`,
        [normalizedTicketId]
      );
      const ticket = result.rows[0];
      const tokenAuthorized = Boolean(
        ticket
          && !ticket.guest_access_token_revoked_at
          && ticket.guest_access_token_hash
          && verifyGuestAccessToken(
            String(guestAccessToken || accessToken || '').trim(),
            ticket.guest_access_token_hash
          )
      );
      const legacyAuthorized = canUseLegacyGuestEmailAccess(ticket, email);

      if (!tokenAuthorized && !legacyAuthorized) {
        recordGuestSocketAuthFailure(socket);
        return next(new Error('Guest authentication failed'));
      }

      if (tokenAuthorized) {
        await db.query(
          `UPDATE support_tickets
           SET guest_access_token_last_used_at = CURRENT_TIMESTAMP
           WHERE id = $1
             AND (
               guest_access_token_last_used_at IS NULL
               OR guest_access_token_last_used_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
             )`,
          [normalizedTicketId]
        );
      }

      socket.ticketId = normalizedTicketId;
      socket.contactEmail = ticket.contact_email;
      next();
    } catch (err) {
      recordGuestSocketAuthFailure(socket);
      return next(new Error('Guest authentication failed'));
    }
  });

  guestNsp.on('connection', (socket) => {
    const room = `ticket:guest:${socket.ticketId}`;
    socket.join(room);

    socket.on('ticket:typing', () => {
      socket.to(room).emit('ticket:typing', { ticketId: socket.ticketId, isAdmin: false });
    });

    socket.on('disconnect', () => {});
  });

  return {
    onlineUsers,
    isUserOnline,
    guestNsp,
  };
};

module.exports = Object.assign(configureRealtimeSocket, {
  addParticipantToRoom,
  removeParticipantFromRoom,
  transferCallHost,
  validateCallRoomParticipantAccess,
  buildCallRoomEvent,
  normalizeRoomParticipants,
  MULTI_PARTY_CALL_LIMIT,
});
