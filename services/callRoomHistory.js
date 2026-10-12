const normalizeUserCallRoomHistory = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row?.id || null,
    callId: row?.call_id || row?.callId || null,
    action: row?.action || null,
    actorUserId: row?.actor_user_id ?? row?.actorUserId ?? null,
    targetUserId: row?.target_user_id ?? row?.targetUserId ?? null,
    actorName: row?.actor_name || row?.actorName || null,
    targetName: row?.target_name || row?.targetName || null,
    propertyId: row?.property_id ?? row?.propertyId ?? null,
    propertyTitle: row?.property_title || row?.propertyTitle || null,
    createdAt: row?.created_at || row?.createdAt || null,
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }));

const fetchUserCallRoomHistory = async (db, userId, limit = 50) => {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 200)) : 50;
  const result = await db.query(
    `SELECT e.id,
            e.call_id,
            e.action,
            e.actor_user_id,
            e.target_user_id,
            actor.full_name AS actor_name,
            target.full_name AS target_name,
            cs.property_id,
            p.title AS property_title,
            e.metadata,
            e.created_at
     FROM call_room_events e
     LEFT JOIN users actor ON actor.id = e.actor_user_id
     LEFT JOIN users target ON target.id = e.target_user_id
     LEFT JOIN call_sessions cs ON cs.id = e.call_id
     LEFT JOIN properties p ON p.id = cs.property_id
     WHERE e.actor_user_id = $1 OR e.target_user_id = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [Number(userId), safeLimit]
  );

  return normalizeUserCallRoomHistory(result.rows);
};

module.exports = {
  normalizeUserCallRoomHistory,
  fetchUserCallRoomHistory,
};
