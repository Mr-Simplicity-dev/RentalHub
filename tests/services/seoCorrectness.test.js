const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  path = require('path'),
  vm = require('vm'),
  {
    createRequire
  } = require('module');
const {
  PGlite
} = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}) {
  const filename = path.join(root, file),
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
async function fixture() {
  const pg = await PGlite.create();
  await pg.exec(`CREATE TABLE states(id INTEGER PRIMARY KEY,state_name TEXT,state_code TEXT);CREATE TABLE feature_flags(key TEXT,enabled BOOLEAN,ownership_gate_enabled_at TIMESTAMP);CREATE TABLE properties(id INTEGER PRIMARY KEY,state_id INTEGER,lga_name TEXT,city TEXT,area TEXT,title TEXT,property_type TEXT,rent_amount NUMERIC,payment_frequency TEXT,is_verified BOOLEAN,is_available BOOLEAN,expires_at TIMESTAMP,ownership_verification_status TEXT,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW(),bedrooms INTEGER,bathrooms INTEGER);CREATE TABLE property_photos(id INTEGER,property_id INTEGER,photo_url TEXT,is_primary BOOLEAN,upload_order INTEGER);INSERT INTO states VALUES(1,'Lagos','LA'),(2,'Kogi','KO');INSERT INTO properties(id,state_id,lga_name,city,area,title,rent_amount,payment_frequency,is_verified,is_available) VALUES(1,1,'Ikeja','Ikeja','Opebi','Home one',100,'yearly',true,true),(2,1,'Epe','Epe','Town','Home two',900,'yearly',true,true),(3,1,'Ikeja','Ikeja','Opebi','Monthly home',20,'monthly',true,true),(4,2,'Lokoja','Lokoja','Town','Hidden',30,'yearly',false,true);`);
  const db = {
    query: (...a) => pg.query(...a),
    isMockActive: () => false
  };
  return {
    pg,
    service: load('config/utils/seoPageService.js', {
      '../middleware/database': db,
      './frontendUrl': {
        getFrontendUrl: () => 'https://rentalhub.com.ng'
      }
    })
  };
}
test('LGA figures use the selected LGA, exclude monthly prices, and disclose the sample', async () => {
  const f = await fixture();
  try {
    const d = await f.service.getLocationPageData({
      stateSlug: 'lagos',
      lgaSlug: 'ikeja'
    });
    assert.equal(d.stats.total_properties, 2);
    assert.equal(Number(d.stats.avg_rent), 100);
    assert.equal(d.stats.sample_size, 1);
    assert.equal(d.indexable, true);
    assert.equal(d.properties.length, 2);
    assert.ok(!d.content.strategy.includes('Google'));
  } finally {
    await f.pg.close();
  }
});
test('empty locations are noindex and never become sitemap entries', async () => {
  const f = await fixture();
  try {
    const d = await f.service.getLocationPageData({
      stateSlug: 'kogi'
    });
    assert.equal(d.indexable, false);
    const urls = await f.service.getSitemapUrls();
    assert.ok(!urls.some(u => u.includes('/nigeria/kogi')));
    assert.ok(!urls.some(u => u.endsWith('/properties/4')));
    assert.ok(urls.some(u => u.endsWith('/nigeria/lagos/ikeja')));
  } finally {
    await f.pg.close();
  }
});
test('expiry and the existing ownership gate also apply to SEO', async () => {
  const f = await fixture();
  try {
    await f.pg.exec("UPDATE properties SET expires_at=NOW()-INTERVAL '1 day' WHERE id=1;INSERT INTO feature_flags VALUES('require_property_ownership_verification',true,NULL)");
    assert.equal((await f.service.getSitemapUrls()).some(u => u.includes('/properties/')), false);
    await f.pg.exec("UPDATE properties SET ownership_verification_status='verified' WHERE id=2");
    assert.ok((await f.service.getSitemapUrls()).some(u => u.endsWith('/properties/2')));
  } finally {
    await f.pg.close();
  }
});
test('crawler output has the actual SEO title, noindex and escaped structured data', () => {
  const renderer = require('../../config/utils/seoHtmlRenderer');
  const title = 'A real title',
    evil = '</script><script>alert(1)</script>';
  const html = renderer.renderLocationHtml({
    title,
    description: 'Description',
    canonical: 'https://rentalhub.com.ng/nigeria/kogi',
    indexable: false,
    stats: {},
    content: {},
    properties: [{
      title: 'Home',
      city: evil,
      url: '/properties/1'
    }],
    faq: [{
      question: evil,
      answer: 'Safe'
    }]
  });
  assert.ok(html.includes('<title>A real title</title>'));
  assert.ok(html.includes('noindex,follow'));
  assert.ok(!html.includes('<script>alert(1)'));
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json)[1].mainEntity[0].name, evil);
});
test('ordinary pages never invoke the Google Indexing API', async () => {
  const helper = require('../../config/utils/googleIndexing');
  const result = await helper.submitUrl('https://rentalhub.com.ng/properties/1');
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INELIGIBLE_CONTENT_TYPE');
});
test('sitemap has genuine update times, removes duplicates, and rejects private URLs', async () => {
  const policy = load('config/utils/seoPolicy.js', {
    './frontendUrl': {
      getFrontendUrl: () => 'https://rentalhub.com.ng'
    }
  });
  const service = load('config/utils/sitemapGenerator.js', {
    './seoPageService': {
      getSitemapUrls: async () => [{
        url: 'https://rentalhub.com.ng/'
      }, {
        url: 'https://rentalhub.com.ng/properties/1',
        lastmod: '2026-01-01'
      }, {
        url: 'https://rentalhub.com.ng/properties/1'
      }]
    },
    './seoPolicy': policy
  });
  const xml = await service.generateSitemap({
    force: true
  });
  assert.equal((xml.match(/<loc>/g) || []).length, 2);
  assert.ok(xml.includes('2026-01-01T00:00:00.000Z'));
  assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
  assert.throws(() => policy.canonicalUrl('https://rentalhub.com.ng/super-admin'));
  assert.throws(() => policy.canonicalUrl('https://example.test/'));
});
test('large sitemaps split into valid parts without inventing modification times', async () => {
  const frontend = {
      './frontendUrl': {
        getFrontendUrl: () => 'https://rentalhub.com.ng'
      }
    },
    policy = load('config/utils/seoPolicy.js', frontend);
  const service = load('config/utils/sitemapGenerator.js', {
    './seoPageService': {
      getSitemapUrls: async () => Array.from({
        length: 45001
      }, (_, i) => ({
        url: 'https://rentalhub.com.ng/properties/' + (i + 1)
      }))
    },
    './seoPolicy': policy,
    ...frontend
  });
  const index = await service.generateSitemap({
    force: true
  });
  assert.ok(index.includes('<sitemapindex'));
  assert.ok(index.includes('/sitemap-2.xml'));
  assert.equal((await service.getSitemapInfo()).urlCount, 45001);
  assert.equal(((await service.generateSitemap({
    part: 1
  })).match(/<url>/g) || []).length, 45000);
  assert.equal(((await service.generateSitemap({
    part: 2
  })).match(/<url>/g) || []).length, 1);
  assert.ok(!index.includes('<lastmod>'));
  await assert.rejects(() => service.generateSitemap({
    part: 3
  }), {
    code: 'SITEMAP_PART_NOT_FOUND'
  });
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8'),
    expression = source.match(/app.get\((\['\/sitemap.xml',[^\]]+\])/)[1],
    routes = vm.runInNewContext(expression),
    router = require('express').Router();
  router.get(routes, () => {});
  assert.ok(router.stack[0].regexp.test('/sitemap-1.xml'));
});
test('area pages and sitemap agree when city is blank or an area contains underscores',async()=>{const f=await fixture();try{await f.pg.exec("UPDATE properties SET city='  ',area='phase_2' WHERE id=1");const d=await f.service.getAreaPageData({stateSlug:'lagos',citySlug:'lagos',areaSlug:'phase_2'});assert.equal(d.indexable,true);assert.equal(d.properties.length,1);assert.equal(Number(d.stats.avg_rent),100);const url=(await f.service.getSitemapUrls()).find(u=>u.endsWith('/areas/lagos/lagos/phase_2'));assert.ok(url);assert.equal(require('../../config/utils/seoPolicy').canonicalUrl(url,'https://rentalhub.com.ng'),url);}finally{await f.pg.close();}});
test('location API JSON takes precedence even when the caller uses a crawler user agent',async()=>{const page={seo:{title:'Current rentals',description:'Current verified homes'},states:[],popular_areas:[],indexable:false},service=load('services/locationService.js',{'../config/utils/seoPageService':{getNigeriaDirectoryPage:async()=>page}});let sent;const res={json:value=>{sent=value;return value;},set(){throw Error('HTML must not be sent');},send(){throw Error('HTML must not be sent');}};await service.getNigeriaDirectory({headers:{'user-agent':'Googlebot',accept:'application/json'},baseUrl:'/api'},res);assert.equal(sent.success,true);assert.equal(sent.seo.title,page.seo.title);});
