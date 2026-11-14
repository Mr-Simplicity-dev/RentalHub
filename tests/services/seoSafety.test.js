const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  createTechnicalAudit
} = require('../../services/seo/technicalAuditService');
const {
  createKeywords
} = require('../../services/seo/keywordService');
const {
  createContentPlanner
} = require('../../services/seo/contentPlannerService');
const site = 'https://rentalhub.com.ng';
const store = {
  observe: async (kind, subject, result) => ({
    kind,
    subject,
    ...result
  }),
  query: async () => ({
    rows: []
  }),
  reserve: async () => 1
};
test('HTML audit reports real missing fields and does not invent Core Web Vitals', async () => {
  const a = createTechnicalAudit({
    store,
    frontend: () => site,
    sitemap: async () => [],
    http: {
      get: async () => ({
        status: 200,
        headers: {},
        data: '<html><head><title>Home</title></head><body><h1>Home</h1><img src="a.png"></body></html>'
      })
    }
  });
  const r = await a.run({
    urls: [site + '/']
  }, {
    id: 1
  });
  assert.ok(r.pages[0].issues.some(x => x.code === 'CANONICAL'));
  assert.ok(r.pages[0].issues.some(x => x.code === 'IMAGE_ALT'));
  assert.equal(r.pages[0].has_next_action, false);
  assert.equal(r.field, undefined);
});
test('HTML audit rejects external inputs and never follows a redirect to a private endpoint', async () => {
  let called = 0;
  const a = createTechnicalAudit({
    store,
    frontend: () => site,
    sitemap: async () => [],
    http: {
      get: async () => {
        called++;
        return {
          status: 302,
          headers: {
            location: 'http://127.0.0.1/private'
          },
          data: ''
        };
      }
    }
  });
  await assert.rejects(() => a.run({
    urls: ['http://127.0.0.1/private']
  }, {
    id: 1
  }), {
    code: 'INVALID_PUBLIC_URL'
  });
  assert.equal(called, 0);
  const r = await a.run({
    urls: [site + '/']
  }, {
    id: 1
  });
  assert.equal(called, 1);
  assert.equal(r.pages[0].issues[0].code, 'UNSAFE_REDIRECT');
});
test('PageSpeed missing configuration is unavailable, not a passing result', async () => {
  const a = createTechnicalAudit({
    store,
    env: {},
    frontend: () => site
  });
  await assert.rejects(() => a.pagespeed({
    url: site + '/'
  }, {
    id: 1
  }), {
    code: 'PAGESPEED_NOT_CONFIGURED'
  });
});
test('Keyword Planner does not return estimated demand when Ads configuration is missing', async () => {
  let called = 0;
  const k = createKeywords({
    store,
    env: {},
    google: {
      request: async () => {
        called++;
      }
    }
  });
  await assert.rejects(() => k.research({
    seeds: ['rental homes']
  }, {
    id: 1
  }), {
    code: 'GOOGLE_ADS_SETUP_REQUIRED'
  });
  assert.equal(called, 0);
  assert.equal(k.trends(['rental homes']).api_available, false);
});
test('saved keyword metrics cannot be supplied by the browser', async () => {
  let args;
  const local = {
    ...store,
    settings: async () => ({}),
    query: async (sql, values) => {
      if (sql.startsWith('INSERT INTO seo_keywords')) {
        args = values;
        return {
          rows: [{
            id: 1
          }]
        };
      }
      return {
        rows: []
      };
    }
  };
  const k = createKeywords({
    store: local,
    env: {},
    google: {}
  });
  await k.save({
    keyword: 'rental homes',
    metrics: {
      average_monthly_searches: 999999
    }
  }, {
    id: 1
  });
  assert.equal(args[10], null);
  assert.equal(args[11], null);
});
test('content publication needs explicit approval and an available article store', async () => {
  let written = false;
  const c = createContentPlanner({
    store: {
      ...store,
      transaction: async () => {
        written = true;
      }
    },
    Blog: {
      db: {
        readyState: 0
      }
    }
  });
  await assert.rejects(() => c.publish({
    id: 'draft'
  }, {
    id: 1,
    user_type: 'super_admin'
  }), {
    code: 'CONTENT_APPROVAL_REQUIRED'
  });
  await assert.rejects(() => c.publish({
    id: 'draft',
    confirm: true,
    facts_checked: true,
    originality_checked: true,
    approval_note: 'Checked against current facts'
  }, {
    id: 1,
    user_type: 'super_admin'
  }), {
    code: 'BLOG_DATABASE_UNAVAILABLE'
  });
  assert.equal(written, false);
  await assert.rejects(() => c.publish({}, {
    id: 2,
    user_type: 'support_admin'
  }), {
    code: 'SUPER_ADMIN_REQUIRED'
  });
});
test('Keyword Planner preserves real provider estimates and labels advertising competition honestly', async () => {
  const requests = [],
    saved = [];
  const local = {
    ...store,
    observe: async (kind, subject, result) => {
      saved.push(result);
      return {
        id: 'research-id',
        ...result
      };
    }
  };
  const k = createKeywords({
    store: local,
    env: {
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'fake-developer',
      GOOGLE_ADS_API_VERSION: 'v25'
    },
    google: {
      request: async (provider, options) => {
        requests.push({
          provider,
          options
        });
        return {
          data: {
            results: [{
              text: 'homes in Lagos',
              keywordIdeaMetrics: {
                avgMonthlySearches: '1200',
                competition: 'HIGH',
                competitionIndex: '80',
                monthlySearchVolumes: [{
                  year: '2026',
                  month: 'JANUARY',
                  monthlySearches: '1000'
                }],
                lowTopOfPageBidMicros: '2000000'
              }
            }]
          }
        };
      }
    }
  });
  const r = await k.research({
    seeds: ['homes'],
    geoTargets: ['geoTargetConstants/2566']
  }, {
    id: 1
  });
  assert.equal(r.ideas[0].average_monthly_searches, 1200);
  assert.equal(r.ideas[0].competition, 'HIGH');
  assert.equal(r.estimates, true);
  assert.equal(r.source, 'google_ads_keyword_planner');
  assert.ok(r.note.includes('not actual Search Console traffic'));
  assert.equal(requests[0].options.data.keywordPlanNetwork, 'GOOGLE_SEARCH');
  assert.equal(requests[0].options.data.geoTargetConstants[0], 'geoTargetConstants/2566');
  assert.equal(saved.length, 1);
});
test('public link audit reports only confirmed broken links and ignores outside targets', async () => {
  const a = createTechnicalAudit({
    store,
    frontend: () => site,
    sitemap: async () => [],
    http: {
      get: async url => ({
        status: url.endsWith('/properties/7') ? 404 : 200,
        headers: {},
        data: url === site + '/' ? '<title>RentalHub</title><a href="/properties/7">Listing</a><a href="http://127.0.0.1/private">Outside</a>' : ''
      })
    }
  });
  const r = await a.run({
    urls: [site + '/']
  }, {
    id: 1
  });
  assert.equal(r.pages[0].checked_links.length, 1);
  assert.equal(r.pages[0].checked_links[0].status, 404);
  assert.ok(r.pages[0].issues.some(i => i.code === 'BROKEN_INTERNAL_LINK'));
});
test('content changed after review cannot be published with an old approval', async () => {
  let written = false;
  const row = {
    id: 'draft',
    title: 'Updated title',
    cluster: 'Rentals',
    keywords: [],
    intent: 'informational',
    target_url: null,
    outline: 'Outline',
    content: 'A'.repeat(300),
    status: 'draft'
  };
  const c = createContentPlanner({
    store: {
      ...store,
      transaction: async fn => fn({
        query: async sql => {
          if (sql.startsWith('UPDATE')) written = true;
          return {
            rows: [row]
          };
        }
      })
    },
    Blog: {
      db: {
        readyState: 1
      }
    }
  });
  await assert.rejects(() => c.publish({
    id: 'draft',
    confirm: true,
    facts_checked: true,
    originality_checked: true,
    approval_note: 'Facts and originality reviewed',
    expected_revision: 'stale-revision'
  }, {
    id: 1,
    user_type: 'super_admin'
  }), {
    code: 'CONTENT_CHANGED'
  });
  assert.equal(written, false);
});
test('article rendering preserves useful formatting but removes executable content',()=>{const {renderArticleBody,articlePlainText}=require('../../config/utils/blogHtml');const html=renderArticleBody('<h1>Renting safely</h1><p>Read <strong>the terms</strong>.</p><script>alert(1)</script><a href="javascript:alert(1)">Bad link</a>');assert.ok(html.includes('<h2>Renting safely</h2>'));assert.ok(html.includes('<strong>the terms</strong>'));assert.ok(!html.includes('<script'));assert.ok(!html.includes('javascript:'));assert.ok(!articlePlainText(html).includes('alert(1)'));});
test('private routes are noindex without blocking public rental and career pages',()=>{const middleware=require('../../config/middleware/seoRobots');for(const path of ['/admin/seo','/super-admin','/tenant/dashboard','/landlord-dashboard','/api/nigeria']){let header;middleware({path},{set:(name,value)=>{assert.equal(name,'X-Robots-Tag');header=value;}},()=>{});assert.equal(header,'noindex, nofollow');}for(const path of ['/','/properties/1','/nigeria/lagos','/careers','/landlord-guide','/legal-cases'])middleware({path},{set:()=>{throw Error('A public page was blocked');}},()=>{});});
test('period-change recommendations wait for complete imports on both periods',async()=>{const current={coverage:{complete:false},topQueries:[],topPages:[{label:'https://rentalhub.com.ng/nigeria/lagos',clicks:5,impressions:50,position:10}]},previous={coverage:{complete:true},topQueries:[],topPages:[{label:'https://rentalhub.com.ng/nigeria/lagos',clicks:10,impressions:200,position:10}]};const writes=[],local={...store,settings:async()=>({min_impressions:100,loss_ratio:0.2}),query:async(sql,args)=>{if(sql.startsWith('INSERT INTO seo_opportunities'))writes.push(args);return {rows:[]};}};const engine=require('../../services/seo/intelligenceService').createIntelligence({store:local,search:{performance:async period=>period.length?current:previous}});assert.equal((await engine.generate({},{id:1})).generated,0);current.coverage.complete=true;assert.equal((await engine.generate({},{id:1})).generated,1);assert.equal(writes[0][1],'declining_page');});
