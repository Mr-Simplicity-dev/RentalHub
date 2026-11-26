const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AUDIENCE = 'rentalhub-incoming-call';
const key = () => {
  if (!process.env.JWT_SECRET) throw Error('Call notification signing is unavailable');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(AUDIENCE).digest();
};
const issueToken = (callId, receiverId, expires) => jwt.sign({ callId, receiverId: Number(receiverId), exp: Math.ceil(Date.parse(expires) / 1000) }, key(), { algorithm: 'HS256', audience: AUDIENCE });
function verifyToken(token, callId) {
  const claims = jwt.verify(String(token || ''), key(), { algorithms: ['HS256'], audience: AUDIENCE });
  if (claims.callId !== callId || !Number.isSafeInteger(claims.receiverId) || claims.receiverId <= 0) throw Error('Invalid call notification');
  return claims;
}
function createHandlers({ db, emit, notifyStopped }) {
  const authorize = req => verifyToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), req.params.callId);
  const status = async (req, res) => {
    let claims; try { claims = authorize(req); } catch { return res.status(401).json({ success: false }); }
    try {
      const row = (await db.query('SELECT status FROM call_sessions WHERE id=$1 AND receiver_id=$2', [req.params.callId, claims.receiverId])).rows[0];
      return res.json({ success: true, ringing: row?.status === 'ringing' });
    } catch { return res.status(503).json({ success: false }); }
  };
  const decline = async (req, res) => {
    let claims; try { claims = authorize(req); } catch { return res.status(401).json({ success: false }); }
    try {
      // This short-lived capability can only decline its own still-ringing call.
      // It is signed with a separate derived key and cannot authenticate a user.
      const row = (await db.query("UPDATE call_sessions SET status='rejected', ended_at=NOW(), updated_at=NOW(), room_state=jsonb_set(COALESCE(room_state,'{}'::jsonb),'{status}','\"rejected\"'::jsonb) WHERE id=$1 AND receiver_id=$2 AND status='ringing' RETURNING caller_id, receiver_id, room_state", [req.params.callId, claims.receiverId])).rows[0];
      if (row) {
        await db.query("SELECT pg_notify('rentalhub_call_state',$1)", [req.params.callId]);
        const payload = { callId: req.params.callId, status: 'rejected', endedAt: new Date().toISOString() };
        for (const id of new Set([row.caller_id, row.receiver_id])) emit(id, 'call:rejected', payload);
        await db.query("INSERT INTO call_room_events(id,call_id,action,actor_user_id,metadata,created_at) VALUES($1,$2,'rejected',$3,$4,NOW())", [crypto.randomUUID(), req.params.callId, claims.receiverId, JSON.stringify({ source: 'android_notification' })]);
        await notifyStopped({ ...row.room_state, id: req.params.callId, receiver: { id: row.receiver_id }, status: 'rejected' });
      }
      return res.json({ success: true });
    } catch { return res.status(503).json({ success: false }); }
  };
  return { status, decline };
}
module.exports = { issueToken, verifyToken, createHandlers };
