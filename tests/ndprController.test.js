const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const db = require('../config/middleware/database');
const ndprController = require('../controllers/ndprController');

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    clearedCookies: [],
  };
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.clearCookie = (name) => {
    res.clearedCookies.push(name);
    return res;
  };
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 41 },
  body: { password: 'correct-password' },
  ip: '127.0.0.1',
  logger: {
    error() {},
    warn() {},
  },
  ...overrides,
});

const normalizeSql = (text) => String(text).replace(/\s+/g, ' ').trim();

test('personal-data export uses correct ownership columns and scoped related records', async (t) => {
  const originalQuery = db.query;
  const queries = [];
  const existingTables = new Set([
    'saved_properties',
    'property_views',
    'push_device_tokens',
    'mobile_crash_reports',
    'support_tickets',
    'support_ticket_replies',
    'recruitment_applications',
    'recruitment_documents',
    'email_subscribers',
    'sms_subscribers',
  ]);

  t.after(() => {
    db.query = originalQuery;
  });

  db.query = async (text, params = []) => {
    const sql = normalizeSql(text);
    queries.push({ sql, params });

    if (sql.includes('FROM users') && sql.includes('WHERE id = $1')) {
      return {
        rows: [{
          id: 41,
          email: 'owner@example.test',
          phone: '08000000000',
          full_name: 'Data Owner',
        }],
      };
    }
    if (sql.includes('FROM information_schema.tables')) {
      return { rows: [{ exists: existingTables.has(params[0]) }] };
    }
    if (sql.includes('FROM "saved_properties"')) {
      return { rows: [{ id: 1, tenant_id: 41, property_id: 9 }] };
    }
    if (sql.includes('FROM "property_views"')) {
      return { rows: [{ id: 2, viewer_id: 41, property_id: 9 }] };
    }
    if (sql.includes('FROM "push_device_tokens"')) {
      return { rows: [{ id: 3, user_id: 41, platform: 'android' }] };
    }
    if (sql.includes('FROM "mobile_crash_reports"')) {
      return { rows: [{ id: 4, message: 'Crash', platform: 'android' }] };
    }
    if (sql.includes('FROM "recruitment_documents" child')) {
      return {
        rows: [{ id: 6, application_id: 5, document_type: 'cv', file_name: 'cv.pdf' }],
      };
    }
    if (sql.includes('FROM recruitment_applications WHERE user_id = $1')) {
      return { rows: [{ id: 5, user_id: 41, full_name: 'Data Owner' }] };
    }
    if (sql.includes('FROM support_tickets WHERE user_id = $1')) {
      return { rows: [{ id: 7, user_id: 41, subject: 'Help' }] };
    }
    if (sql.includes('FROM support_ticket_replies reply')) {
      return { rows: [{ id: 8, ticket_id: 7, message: 'Reply' }] };
    }
    if (sql.includes('FROM email_subscribers')) {
      return { rows: [{ id: 9, source: 'user', source_id: 41 }] };
    }
    if (sql.includes('FROM sms_subscribers')) {
      return { rows: [{ id: 10, source: 'user', source_id: 41 }] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  };

  const res = makeRes();
  await ndprController.exportPersonalData(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.saved_properties[0].tenant_id, 41);
  assert.equal(res.body.data.property_views[0].viewer_id, 41);
  assert.equal(res.body.data.support.tickets[0].user_id, 41);
  assert.equal(res.body.data.recruitment.documents[0].file_name, 'cv.pdf');
  assert.equal(res.body.data.marketing.email_subscription[0].source_id, 41);
  assert.equal(res.body.message.includes('all personal data'), false);

  const savedQuery = queries.find(({ sql }) => sql.includes('FROM "saved_properties"'));
  const viewsQuery = queries.find(({ sql }) => sql.includes('FROM "property_views"'));
  const supportReplyQuery = queries.find(({ sql }) =>
    sql.includes('FROM support_ticket_replies reply')
  );
  const recruitmentDocumentQuery = queries.find(({ sql }) =>
    sql.includes('FROM "recruitment_documents" child')
  );
  const pushQuery = queries.find(({ sql }) => sql.includes('FROM "push_device_tokens"'));
  const crashQuery = queries.find(({ sql }) => sql.includes('FROM "mobile_crash_reports"'));

  assert.match(savedQuery.sql, /WHERE "tenant_id" = \$1/);
  assert.match(viewsQuery.sql, /WHERE "viewer_id" = \$1/);
  assert.match(supportReplyQuery.sql, /ticket\.user_id = \$1/);
  assert.match(recruitmentDocumentQuery.sql, /WHERE user_id = \$1/);
  assert.doesNotMatch(recruitmentDocumentQuery.sql, /file_path/);
  assert.doesNotMatch(pushQuery.sql, /expo_push_token/);
  assert.doesNotMatch(crashQuery.sql, /\bstack\b|component_stack/);
  assert.ok(queries.every(({ params }) => !params.includes(99)));
});

test('account purge commits corrected deletions and accurate redaction in one transaction', async (t) => {
  const originalConnect = db.connect;
  const originalQuery = db.query;
  const originalCompare = bcrypt.compare;
  const transactionQueries = [];
  let released = false;
  const existingTables = new Set([
    'saved_properties',
    'property_views',
    'messages',
    'push_device_tokens',
    'user_notification_preferences',
    'mobile_crash_reports',
    'support_tickets',
    'support_ticket_replies',
    'recruitment_applications',
    'recruitment_documents',
    'recruitment_interview_assignments',
    'recruitment_interview_recordings',
    'recruitment_application_operations',
    'email_subscribers',
    'email_campaign_recipients',
    'sms_subscribers',
    'sms_campaign_recipients',
  ]);

  t.after(() => {
    db.connect = originalConnect;
    db.query = originalQuery;
    bcrypt.compare = originalCompare;
  });

  bcrypt.compare = async () => true;
  db.query = async (text) => {
    const sql = normalizeSql(text);
    if (sql.includes('SELECT current_hash FROM audit_logs')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO audit_logs')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  const client = {
    async query(text, params = []) {
      const sql = normalizeSql(text);
      transactionQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT password_hash, passport_photo_url')) {
        return {
          rows: [{
            password_hash: 'hash',
            passport_photo_url: null,
            email: 'owner@example.test',
            phone: '08000000000',
          }],
        };
      }
      if (sql.includes('AS has_active_properties')) {
        return {
          rows: [{
            has_active_properties: false,
            has_active_disputes: false,
            has_pending_payments: false,
          }],
        };
      }
      if (sql.includes('FROM information_schema.tables')) {
        return { rows: [{ exists: existingTables.has(params[0]) }] };
      }
      if (
        sql.includes('SELECT child.file_path') ||
        sql.includes('SELECT child.recording_path')
      ) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      released = true;
    },
  };
  db.connect = async () => client;

  const res = makeRes();
  await ndprController.purgeAccount(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message.includes('All personal data'), false);
  assert.equal(res.body.data.status, 'purged');
  assert.equal(released, true);

  const sqlStatements = transactionQueries.map(({ sql }) => sql);
  const savedDelete = sqlStatements.find((sql) =>
    sql.startsWith('DELETE FROM "saved_properties"')
  );
  const viewsDelete = sqlStatements.find((sql) =>
    sql.startsWith('DELETE FROM "property_views"')
  );
  const messageRedaction = sqlStatements.find((sql) =>
    sql.startsWith('UPDATE messages')
  );
  const userRedaction = sqlStatements.find((sql) => sql.startsWith('UPDATE users'));
  const commitIndex = sqlStatements.indexOf('COMMIT');
  const firstMutationIndex = sqlStatements.findIndex((sql) => sql.startsWith('DELETE FROM'));

  assert.match(savedDelete, /"tenant_id" = \$1/);
  assert.match(viewsDelete, /"viewer_id" = \$1/);
  assert.match(messageRedaction, /SET message_text = '\[redacted\]'/);
  assert.match(messageRedaction, /WHERE sender_id = \$1/);
  assert.doesNotMatch(messageRedaction, /receiver_id|SET message =/);
  assert.match(userRedaction, /deleted\+/);
  assert.match(userRedaction, /token_version = token_version \+ 1/);
  assert.equal(sqlStatements.some((sql) => /subscription_credit/.test(sql)), false);
  assert.ok(firstMutationIndex > sqlStatements.indexOf('BEGIN'));
  assert.ok(commitIndex > firstMutationIndex);
  assert.equal(sqlStatements.includes('ROLLBACK'), false);
  assert.equal(res.clearedCookies.length, 2);
});

test('account purge rolls back and reports failure when any mutation fails', async (t) => {
  const originalConnect = db.connect;
  const originalQuery = db.query;
  const originalCompare = bcrypt.compare;
  const transactionQueries = [];
  let released = false;

  t.after(() => {
    db.connect = originalConnect;
    db.query = originalQuery;
    bcrypt.compare = originalCompare;
  });

  bcrypt.compare = async () => true;
  db.query = async () => {
    throw new Error('The audit logger should not run after rollback');
  };

  const client = {
    async query(text, params = []) {
      const sql = normalizeSql(text);
      transactionQueries.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT password_hash, passport_photo_url')) {
        return {
          rows: [{
            password_hash: 'hash',
            passport_photo_url: null,
            email: 'owner@example.test',
            phone: '08000000000',
          }],
        };
      }
      if (sql.includes('AS has_active_properties')) {
        return {
          rows: [{
            has_active_properties: false,
            has_active_disputes: false,
            has_pending_payments: false,
          }],
        };
      }
      if (sql.includes('FROM information_schema.tables')) {
        return { rows: [{ exists: params[0] === 'saved_properties' }] };
      }
      if (sql.startsWith('DELETE FROM "saved_properties"')) {
        throw new Error('forced mutation failure');
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
    release() {
      released = true;
    },
  };
  db.connect = async () => client;

  const res = makeRes();
  await ndprController.purgeAccount(makeReq(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(transactionQueries.includes('ROLLBACK'), true);
  assert.equal(transactionQueries.includes('COMMIT'), false);
  assert.equal(released, true);
  assert.equal(res.clearedCookies.length, 0);
});
