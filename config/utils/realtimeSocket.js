const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../middleware/database');
const { logAction } = require('./auditLogger');

const CALL_ALLOWED_ROLES = new Set(['tenant', 'landlord', 'agent']);
const CALL_TYPES = new Set(['audio', 'video', 'virtual_tour']);
const CALL_RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS || 45000);

const onlineUsers = new Map();
const socketUsers = new Map();
const activeCalls = new Map();
let callHistorySchemaReady = false;

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
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.userId || decoded.id || decoded.user_id;

  if (!userId) {
    throw new Error('Invalid token payload');
  }

  const result = await db.query(
    `SELECT id, full_name, email, user_type, deleted_at, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  const user = result.rows[0];

  if (!user || user.deleted_at || user.is_active === false) {
    throw new Error('User is not active');
  }

  return user;
};

const emitCallEvent = (io, call, eventName, payload = {}) => {
  const message = {
    callId: call.id,
    callType: call.callType,
    propertyId: call.propertyId,
    propertyTitle: call.propertyTitle,
    status: call.status,
    caller: call.caller,
    receiver: call.receiver,
    createdAt: call.createdAt,
    ...payload,
  };

  io.to(toUserRoom(call.caller.id)).emit(eventName, message);
  io.to(toUserRoom(call.receiver.id)).emit(eventName, message);
};

const clearCallTimer = (call) => {
  if (call?.timeoutId) {
    clearTimeout(call.timeoutId);
  }
};

const isCallParticipant = (call, userId) =>
  Number(call?.caller?.id) === Number(userId) ||
  Number(call?.receiver?.id) === Number(userId);

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
         requested_at,
         started_at,
         ended_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        call.createdAt || new Date().toISOString(),
        timestamps.startedAt || null,
        timestamps.endedAt || null,
      ]
    );
  } catch (error) {
    console.error('Call session history failed:', error.message);
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

const configureRealtimeSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

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

        activeCalls.set(call.id, call);
        await recordCallSession(call, 'ringing');
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
      activeCalls.set(call.id, call);
      await recordCallSession(call, 'accepted', {
        startedAt: call.acceptedAt,
      });
      await logVirtualTourAudit(call, 'VIRTUAL_TOUR_ACCEPTED', user.id);
      emitCallEvent(io, call, 'call:accepted', { acceptedAt: call.acceptedAt });

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
      if (wentOffline) {
        socket.broadcast.emit('presence:offline', {
          userId: user.id,
        });
      }
    });
  });

  return {
    onlineUsers,
    isUserOnline,
  };
};

module.exports = configureRealtimeSocket;
