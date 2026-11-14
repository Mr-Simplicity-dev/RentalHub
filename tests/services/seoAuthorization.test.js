const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  {
    createRequire
  } = require('module'),
  http = require('http');
const express = require('express');
function load(file, mocks) {
  const filename = path.resolve(__dirname, '../..', file),
    real = createRequire(filename),
    m = {
      exports: {}
    };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: m,
    exports: m.exports,
    require: n => Object.hasOwn(mocks, n) ? mocks[n] : real(n),
    process,
    URL,
    Buffer,
    Date,
    console,
    setTimeout,
    clearTimeout
  }, {
    filename
  });
  return m.exports;
}
test('SEO routes deny ordinary roles and require the existing Super Admin MFA gate', async () => {
  let calls = 0;
  const auth = load('config/middleware/auth.js', {
    '../utils/twoFactor': {
      requirePrivilegedMfa: (req, res, next) => req.get('x-test-mfa') === 'verified' ? next() : res.status(403).json({
        message: 'Administrator verification required'
      })
    }
  });
  const router = load('routes/seoIntelligenceRoutes.js', {
    '../services/seo': {
      google: {
        status: async () => {
          calls++;
          return [{
            provider: 'search_console',
            status: 'disconnected'
          }];
        }
      }
    },
    '../config/middleware/auth': {
      authenticate: (req, res, next) => {
        const role = req.get('x-test-role');
        if (!role) return res.sendStatus(401);
        req.user = {
          id: 1,
          user_type: role
        };
        next();
      },
      requireSuperAdmin: auth.requireSuperAdmin
    }
  });
  const app = express();
  app.use(express.json());
  app.use('/admin/seo', router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/admin/seo';
    assert.equal((await fetch(base + '/integrations')).status, 401);
    for (const role of ['tenant', 'landlord', 'support_admin', 'recruitment_admin']) assert.equal((await fetch(base + '/integrations', {
      headers: {
        'x-test-role': role,
        'x-test-mfa': 'verified'
      }
    })).status, 403);
    assert.equal((await fetch(base + '/integrations', {
      headers: {
        'x-test-role': 'super_admin'
      }
    })).status, 403);
    assert.equal(calls, 0);
    const r = await fetch(base + '/integrations', {
      headers: {
        'x-test-role': 'super_admin',
        'x-test-mfa': 'verified'
      }
    });
    assert.equal(r.status, 200);
    assert.equal(calls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
test('a zero SerpAPI budget makes no paid request', async () => {
  let requested = 0;
  const checker = load('config/utils/rankChecker.js', {
    './serpTracker': {
      getSerpApiKey: () => 'fake-key',
      fetchOrganicResults: async () => [],
      findTargetResult: () => null
    },
    '../models/Ranking': {
      db: {
        readyState: 1
      }
    },
    './logger': {
      info() {}
    }
  });
  const store = {
    settings: async () => ({
      serp_daily_limit: 0,
      serp_batch_size: 3
    }),
    query: async sql => ({
      rows: sql.includes('seo_competitors') ? [] : [{
        id: 1,
        keyword: 'rental homes',
        country: 'ng',
        language: 'en'
      }]
    }),
    reserve: async (_, limit) => {
      assert.equal(limit, 0);
      throw Object.assign(new Error('Budget stopped'), {
        code: 'PROVIDER_BUDGET_EXHAUSTED'
      });
    }
  };
  const r = await checker.runManagedRankingChecks({
    store,
    RankingModel: {
      db: {
        readyState: 1
      }
    },
    tracker: async () => {
      requested++;
    }
  });
  assert.equal(requested, 0);
  assert.equal(r.checked, 0);
});
test('ranking matches only the real site and never invents a missing provider position',()=>{const {findTargetResult}=require('../../config/utils/serpTracker');assert.equal(findTargetResult([{link:'https://rentalhub.com.ng.attacker.test/',position:1}],'https://rentalhub.com.ng'),null);assert.equal(findTargetResult([{link:'javascript://rentalhub.com.ng/alert(1)',position:1}],'https://rentalhub.com.ng'),null);assert.throws(()=>findTargetResult([{link:'https://rentalhub.com.ng/'}],'https://rentalhub.com.ng'),{code:'SERP_INVALID_DATA'});assert.equal(findTargetResult([{link:'https://rentalhub.com.ng/',position:7}],'https://rentalhub.com.ng').position,7);});
