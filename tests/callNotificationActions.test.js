const test = require('node:test'),
  assert = require('node:assert/strict'),
  jwt = require('jsonwebtoken');
const {
  PGlite
} = require('@electric-sql/pglite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'isolated-notification-test-secret-only';
const actions = require('../services/callNotificationActions');
const id = '62b9a4d0-5590-414e-abbb-0c9d459d188c';
const expires = () => new Date(Date.now() + 40000).toISOString();
const token = () => actions.issueToken(id, 2, expires());
const response = () => ({
  code: 200,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});
test('notification capability is scoped to one call and cannot sign in as a user', () => {
  const signed = token();
  assert.equal(actions.verifyToken(signed, id).receiverId, 2);
  assert.throws(() => actions.verifyToken(signed, 'wrong-call'));
  assert.throws(() => jwt.verify(signed, process.env.JWT_SECRET, {
    algorithms: ['HS256']
  }));
  assert.throws(() => actions.verifyToken(actions.issueToken(id, 2, '2000-01-01T00:00:00.000Z'), id));
  assert.throws(() => actions.verifyToken(signed.slice(0, -2) + 'xx', id));
});
test('status and decline reject missing, expired or ordinary login tokens before reading the database', async () => {
  let reads = 0;
  const handlers = actions.createHandlers({
    db: {
      query() {
        reads++;
      }
    },
    emit() {},
    notifyStopped() {}
  });
  for (const signed of ['', jwt.sign({
    id: 2
  }, process.env.JWT_SECRET), actions.issueToken(id, 2, '2000-01-01T00:00:00.000Z')]) for (const method of ['status', 'decline']) {
    const res = response();
    await handlers[method]({
      params: {
        callId: id
      },
      headers: {
        authorization: 'Bearer ' + signed
      }
    }, res);
    assert.equal(res.code, 401);
  }
  assert.equal(reads, 0);
});
test('real SQL keeps decline bound to the recipient and permits only one ringing transition', async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE call_sessions(id uuid PRIMARY KEY,caller_id int,receiver_id int,status text,room_state jsonb,started_at timestamptz,ended_at timestamptz,updated_at timestamptz); CREATE TABLE call_room_events(id uuid PRIMARY KEY,call_id uuid,action text CHECK(action IN ('created','accepted','join','leave','add_participant','remove_participant','host_transfer')),actor_user_id int,metadata jsonb,created_at timestamptz);`);
  await pg.query("INSERT INTO call_sessions(id,caller_id,receiver_id,status,room_state) VALUES($1,1,2,'ringing',$2)", [id, JSON.stringify({
    id,
    receiver: {
      id: 2
    }
  })]);
  const emitted = [],
    stopped = [];
  const db = {
    query: (sql, args) => sql.includes('pg_notify') ? Promise.resolve({
      rows: []
    }) : pg.query(sql, args)
  };
  const handlers = actions.createHandlers({
    db,
    emit: (...args) => emitted.push(args),
    notifyStopped: async call => stopped.push(call)
  });
  const req = {
    params: {
      callId: id
    },
    headers: {
      authorization: 'Bearer ' + token()
    }
  };
  try {
    const status = response();
    await handlers.status(req, status);
    assert.deepEqual(status.body, {
      success: true,
      ringing: true
    });
    const wrong = response();
    await handlers.status({
      ...req,
      headers: {
        authorization: 'Bearer ' + actions.issueToken(id, 3, expires())
      }
    }, wrong);
    assert.equal(wrong.body.ringing, false);
    const wrongDecline = response();
    await handlers.decline({
      ...req,
      headers: {
        authorization: 'Bearer ' + actions.issueToken(id, 3, expires())
      }
    }, wrongDecline);
    assert.equal((await pg.query('SELECT status FROM call_sessions')).rows[0].status, 'ringing');
    const declines = await Promise.all(Array.from({
      length: 8
    }, async () => { const res = response(); await handlers.decline(req, res); return res; }));
    for (const res of declines) { assert.equal(res.code, 200); assert.equal(res.body.success, true); }
    assert.equal((await pg.query('SELECT status FROM call_sessions')).rows[0].status, 'rejected');
    assert.equal((await pg.query('SELECT * FROM call_room_events')).rows.length, 0);
    assert.ok((await pg.query('SELECT ended_at FROM call_sessions')).rows[0].ended_at);
    assert.equal(emitted.length, 2);
    assert.equal(stopped.length, 1);
    await pg.query("UPDATE call_sessions SET status='accepted'");
    await handlers.decline(req, response());
    assert.equal((await pg.query('SELECT status FROM call_sessions')).rows[0].status, 'accepted');
    assert.equal(stopped.length, 1);
    const source = require('fs').readFileSync(require.resolve('../config/utils/realtimeSocket'), 'utf8');
    const start = source.indexOf('const recordCallSession ='),
      end = source.indexOf('const notifyMissedCall', start);
    const module = {
      exports: {}
    };
    require('vm').runInNewContext(source.slice(start, end) + 'module.exports=recordCallSession;', {
      module,
      db,
      ensureCallHistorySchema: async () => {},
      logger: {
        error() {}
      },
      require: name => {
        if (name.includes('callStateBridge')) return {
          serialize: require('../services/callStateBridge').serialize
        };
        throw Error(name);
      }
    });
    await pg.query("UPDATE call_sessions SET status='rejected'");
    assert.equal(await module.exports({
      id,
      status: 'accepted',
      receiver: {
        id: 2
      }
    }, 'accepted', {}), false);
    await pg.query("UPDATE call_sessions SET status='ringing'");
    assert.equal(await module.exports({
      id,
      status: 'accepted',
      receiver: {
        id: 2
      }
    }, 'accepted', {}), true);
    await handlers.decline(req, response());
    assert.equal((await pg.query('SELECT status FROM call_sessions')).rows[0].status, 'accepted');
  } finally {
    await pg.close();
  }
});
test('cancellation push is silent, new-native-device-only and has no unread badge', async () => {
  let sent;
  await require('../services/callSoundService').notifyStopped({
    id,
    receiver: {
      id: 2
    }
  }, {
    sendPush: async (userId, message) => {
      sent = {
        userId,
        message
      };
    }
  });
  assert.equal(sent.userId, 2);
  assert.equal(sent.message.nativeCallOnly, true);
  assert.equal(sent.message.dataOnly, true);
  assert.equal(sent.message.data.type, 'call_cancelled');
  assert.equal(sent.message.badge, undefined);
});
test('call notification checks use a separate limiter from voice sign-in tokens', () => {
  const fs = require('fs');
  const source = fs.readFileSync(require.resolve('../routes/voice'), 'utf8');
  assert.match(source, /notification-status', callNotificationLimiter/);
  assert.match(source, /notification-decline', callNotificationLimiter/);
  const limits = require('../config/middleware/securityRateLimiters');
  assert.equal(typeof limits.callNotificationLimiter, 'function');
  assert.notEqual(limits.callNotificationLimiter, limits.voiceTokenLimiter);
});
