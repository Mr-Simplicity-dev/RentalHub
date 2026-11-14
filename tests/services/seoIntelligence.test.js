const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  path = require('path');
const {
  PGlite
} = require('@electric-sql/pglite');
const {
  createStore,
  day,
  range
} = require('../../services/seo/core');
const {
  createGoogleConnections
} = require('../../services/seo/googleConnectionService');
const {
  createSearchConsole
} = require('../../services/seo/searchConsoleService');
async function fixture() {
  const pg = await PGlite.create();
  await pg.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,user_type TEXT,token_version INTEGER,is_active BOOLEAN,deleted_at TIMESTAMPTZ);INSERT INTO users VALUES(1,'super_admin',1,true,NULL),(2,'support_admin',1,true,NULL);");
  await pg.exec(fs.readFileSync(path.join(__dirname, '../../migrations/2050_seo_intelligence.sql'), 'utf8'));
  const db = {
    query: (...a) => pg.query(...a),
    isMockActive: () => false,
    connect: async () => ({
      query: (...a) => pg.query(...a),
      release() {}
    })
  };
  return {
    pg,
    store: createStore(db)
  };
}
const env = {
  SEO_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  GOOGLE_OAUTH_CLIENT_ID: 'test-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
  GOOGLE_SEARCH_CONSOLE_REDIRECT_URI: 'https://rentalhub.com.ng/api/admin/seo/google/callback'
};
class OAuth {
  generateAuthUrl(input) {
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      ...input,
      scope: input.scope.join(' ')
    });
  }
  async getToken() {
    return {
      tokens: {
        refresh_token: 'private-refresh',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly'
      }
    };
  }
  setCredentials() {}
  async revokeToken() {}
}
test('SEO migration preserves existing users and starts disconnected with no invented metrics', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n, 2);
    assert.equal((await f.pg.query("SELECT COUNT(*)::int AS n FROM seo_integrations WHERE status='disconnected'")).rows[0].n, 2);
    assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM seo_search_metrics')).rows[0].n, 0);
  } finally {
    await f.pg.close();
  }
});
test('strict dates reject extra text, invalid calendar dates and reversed periods', () => {
  assert.throws(() => day('2026-01-01ignored'));
  assert.throws(() => day('2026-02-30'));
  assert.throws(() => range({
    start: '2026-02-02',
    end: '2026-02-01'
  }));
});
test('provider budget is stored and cannot exceed the configured daily cap', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.store.reserve('serpapi', 2), 1);
    assert.equal(await f.store.reserve('serpapi', 2), 2);
    await assert.rejects(() => f.store.reserve('serpapi', 2), {
      code: 'PROVIDER_BUDGET_EXHAUSTED'
    });
    assert.equal((await f.pg.query("SELECT used FROM seo_provider_usage WHERE provider='serpapi'")).rows[0].used, 2);
  } finally {
    await f.pg.close();
  }
});
test('Google tokens are encrypted, purpose-bound and absent from status responses', async () => {
  const f = await fixture();
  try {
    const g = createGoogleConnections({
        store: f.store,
        env,
        OAuth2: OAuth
      }),
      sealed = g.seal({
        refresh_token: 'never-show'
      }, 'search_console');
    assert.ok(!sealed.includes('never-show'));
    assert.equal(g.open(sealed, 'search_console').refresh_token, 'never-show');
    assert.throws(() => g.open(sealed, 'google_ads'), {
      code: 'SEO_CREDENTIALS_UNREADABLE'
    });
    await f.pg.query("UPDATE seo_integrations SET credentials_encrypted=$1 WHERE provider='search_console'", [sealed]);
    assert.ok(!JSON.stringify(await g.status()).includes(sealed));
    await assert.rejects(() => g.start('search_console', {
      id: 2,
      user_type: 'support_admin'
    }), {
      code: 'SUPER_ADMIN_REQUIRED'
    });
  } finally {
    await f.pg.close();
  }
});
test('OAuth state is single-use and disconnect blocks a previously started connection', async () => {
  const f = await fixture();
  try {
    const g = createGoogleConnections({
        store: f.store,
        env,
        OAuth2: OAuth
      }),
      actor = {
        id: 1,
        user_type: 'super_admin',
        token_version: 1
      };
    let state = new URL((await g.start('search_console', actor)).url).searchParams.get('state');
    await g.callback({
      state,
      code: 'test-code'
    });
    await assert.rejects(() => g.callback({
      state,
      code: 'test-code'
    }), {
      code: 'OAUTH_STATE_INVALID'
    });
    state = new URL((await g.start('search_console', actor)).url).searchParams.get('state');
    await g.disconnect('search_console', actor);
    await assert.rejects(() => g.callback({
      state,
      code: 'test-code'
    }), {
      code: 'OAUTH_STATE_INVALID'
    });
  } finally {
    await f.pg.close();
  }
});
test('OAuth refuses a changed session and does not connect a disabled user', async () => {
  const f = await fixture();
  try {
    const g = createGoogleConnections({
        store: f.store,
        env,
        OAuth2: OAuth
      }),
      actor = {
        id: 1,
        user_type: 'super_admin',
        token_version: 1
      };
    const state = new URL((await g.start('search_console', actor)).url).searchParams.get('state');
    await f.pg.exec('UPDATE users SET token_version=2 WHERE id=1');
    await assert.rejects(() => g.callback({
      state,
      code: 'test-code'
    }), {
      code: 'OAUTH_SESSION_CHANGED'
    });
    assert.equal((await g.status())[1].connected, false);
  } finally {
    await f.pg.close();
  }
});
test('Search Console synchronization uses real total rows separately from query rows and does not duplicate a repeated import', async () => {
  const f=await fixture();const syncDate=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
  try {
    await f.pg.exec("UPDATE seo_integrations SET status='connected',property_url='sc-domain:rentalhub.com.ng' WHERE provider='search_console'");
    let calls = 0;
    const google = {
      connection: async () => (await f.pg.query("SELECT * FROM seo_integrations WHERE provider='search_console'")).rows[0],
      request: async (_, options) => {
        calls++;
        return {
          data: {
            rows: options.data.dimensions[0] === 'date' ? [{
              keys: [syncDate],
              clicks: 10,
              impressions: 100,
              position: 4
            }] : [{
              keys: ['rental homes', 'https://rentalhub.com.ng/', 'nga', 'mobile'],
              clicks: 6,
              impressions: 60,
              position: 5
            }]
          }
        };
      }
    };
    const s = createSearchConsole({
      store: f.store,
      google,
      frontend: () => 'https://rentalhub.com.ng'
    });
    await s.enqueue({
      start: syncDate,
      end: syncDate
    }, {
      id: 1
    });
    assert.equal((await s.work()).ok, true);
    const p = await s.performance({
      start: syncDate,
      end: syncDate
    });
    assert.equal(p.summary.clicks, 10);
    assert.equal(p.topQueries[0].clicks, 6);
    assert.equal(p.summary.ctr, 0.1);
    await s.enqueue({
      start: syncDate,
      end: syncDate
    }, {
      id: 1
    });
    await s.work();
    assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM seo_search_metrics')).rows[0].n, 2);
    assert.equal(calls, 4);
  } finally {
    await f.pg.close();
  }
});
test('SEO never accepts the development mock database as real measured data', async () => {
  await assert.rejects(() => createStore({
    isMockActive: () => true
  }).query('SELECT 1'), {
    code: 'SEO_DATABASE_UNAVAILABLE'
  });
});
test('changing a tracked keyword location updates one record instead of creating a second paid job', async () => {
  const f = await fixture();
  try {
    const keywords = require('../../services/seo/keywordService').createKeywords({
        store: f.store,
        env: {},
        google: {}
      }),
      saved = await keywords.save({
        keyword: 'rental homes',
        location: 'Lagos, Nigeria',
        is_tracked: true
      }, {
        id: 1
      });
    const changed = await keywords.save({
      ...saved,
      location: 'Abuja, Nigeria'
    }, {
      id: 1
    });
    assert.equal(String(changed.id), String(saved.id));
    assert.equal((await f.pg.query('SELECT COUNT(*)::int AS n FROM seo_keywords')).rows[0].n, 1);
    assert.equal(changed.location, 'Abuja, Nigeria');
    assert.equal(changed.is_tracked, true);
  } finally {
    await f.pg.close();
  }
});
test('completed empty Google imports stay unavailable instead of inventing zero traffic',async()=>{const f=await fixture();const syncDate=new Date(Date.now()-10*86400000).toISOString().slice(0,10);try{await f.pg.exec("UPDATE seo_integrations SET status='connected',property_url='sc-domain:rentalhub.com.ng' WHERE provider='search_console'");const google={connection:async()=> (await f.pg.query("SELECT * FROM seo_integrations WHERE provider='search_console'")).rows[0],request:async()=>({data:{rows:[]}})},search=createSearchConsole({store:f.store,google,frontend:()=> 'https://rentalhub.com.ng'});await search.enqueue({start:syncDate,end:syncDate},{id:1});await search.work();const report=await search.performance({start:syncDate,end:syncDate});assert.equal(report.coverage.recorded_days,1);assert.equal(report.coverage.complete,true);assert.equal(report.summary,null);assert.match(report.empty_message,/not a measured zero/);}finally{await f.pg.close();}});
