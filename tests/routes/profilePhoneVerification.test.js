const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');

const createProfileRouter = ({ userRow, duplicateRows = [] }) => {
  const queries = [];
  let updatedState = { ...userRow };

  const mockDb = {
    query: async (sql, params = []) => {
      const normalized = String(sql).trim();
      queries.push({ sql: normalized, params });

      if (/^SELECT\s+id,\s*phone\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$1/i.test(normalized)) {
        return { rows: [{ id: updatedState.id, phone: updatedState.phone }] };
      }

      if (/rentalhub_phone_key\(phone\)\s*=\s*rentalhub_phone_key\(\$2\)/i.test(normalized)) {
        return { rows: duplicateRows };
      }

      if (/^UPDATE\s+users\s+SET\s+/i.test(normalized)) {
        if (/phone_verified\s*=\s*FALSE/i.test(normalized)) {
          updatedState.phone_verified = false;
        }
        const setMatch = normalized.match(/^UPDATE\s+users\s+SET\s+(.+?)\s+WHERE\s+id\s*=/i);
        if (setMatch) {
          for (const part of setMatch[1].split(',')) {
            const assign = part.trim().match(/^(\w+)\s*=\s*\$(\d+)$/);
            if (assign) {
              const col = assign[1];
              const idx = Number(assign[2]) - 1;
              updatedState[col] = params[idx];
            }
          }
        }
        return { rows: [{ ...updatedState }] };
      }

      return { rows: [] };
    },
  };

  const usersRoutePath = path.resolve(__dirname, '../../routes/users.js');
  const dbPath = path.resolve(__dirname, '../../config/middleware/database.js');
  const authPath = path.resolve(__dirname, '../../config/middleware/auth.js');

  delete require.cache[usersRoutePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === dbPath) return mockDb;
    if (resolved === authPath) {
      return {
        authenticate: (req, _res, next) => {
          req.user = { id: updatedState.id, user_type: updatedState.user_type || 'landlord' };
          next();
        },
        requireNotImpersonating: (_req, _res, next) => next(),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const router = require(usersRoutePath);
    return { router, queries };
  } finally {
    Module._load = originalLoad;
    delete require.cache[usersRoutePath];
  }
};

const invokePutProfile = async (router, body) => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('PUT /api/users/profile preserves phone_verified when saving unchanged phone', async () => {
  const { router, queries } = createProfileRouter({
    userRow: {
      id: 42,
      full_name: 'Amina Landlord',
      phone: '+2348031234567',
      phone_verified: true,
      user_type: 'landlord',
    },
  });

  const res = await invokePutProfile(router, {
    full_name: 'Amina Landlord Updated',
    phone: '+2348031234567',
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.data.phone_verified, true);
  assert.equal(res.data.data.full_name, 'Amina Landlord Updated');
  assert.ok(!queries.some((q) => /phone_verified\s*=\s*FALSE/i.test(q.sql)));
});

test('PUT /api/users/profile preserves phone_verified when phone is equivalent under rentalhub_phone_key', async () => {
  const { router, queries } = createProfileRouter({
    userRow: {
      id: 42,
      full_name: 'Amina Landlord',
      phone: '+2348031234567',
      phone_verified: true,
      user_type: 'landlord',
    },
  });

  const res = await invokePutProfile(router, {
    full_name: 'Amina Landlord',
    phone: '08031234567',
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.data.phone_verified, true);
  assert.ok(!queries.some((q) => /rentalhub_phone_key/i.test(q.sql)));
});

test('PUT /api/users/profile resets phone_verified when phone actually changes and rejects duplicates', async () => {
  const changed = createProfileRouter({
    userRow: {
      id: 42,
      full_name: 'Amina Landlord',
      phone: '+2348031234567',
      phone_verified: true,
      user_type: 'landlord',
    },
  });

  const res = await invokePutProfile(changed.router, {
    full_name: 'Amina Landlord',
    phone: '+2348099999999',
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.data.phone_verified, false);
  assert.equal(res.data.data.phone, '+2348099999999');

  const conflict = createProfileRouter({
    userRow: {
      id: 42,
      full_name: 'Amina Landlord',
      phone: '+2348031234567',
      phone_verified: true,
      user_type: 'landlord',
    },
    duplicateRows: [{ id: 99 }],
  });

  const conflictRes = await invokePutProfile(conflict.router, {
    phone: '+2348099999999',
  });

  assert.equal(conflictRes.status, 409);
  assert.equal(conflictRes.data.success, false);
});
