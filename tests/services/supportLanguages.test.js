const {
    test
  } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const policy = require('../../config/utils/languagePolicy');
const other = policy.languages.find(x => x.iso === 'hau').id;
const skills = [{
  language_id: policy.PIDGIN,
  oral: 'fluent',
  written: 'conversational'
}, {
  language_id: other,
  oral: 'conversational',
  written: 'basic'
}];
function load(rel, mocks) {
  const file = require.resolve(rel),
    module = {
      exports: {}
    };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module,
    exports: module.exports,
    require: name => name in mocks ? mocks[name] : require(require.resolve(name, {
      paths: [path.dirname(file)]
    })),
    process,
    Buffer,
    console,
    setInterval: () => ({
      unref() {}
    }),
    setTimeout: () => ({
      unref() {}
    }),
    __dirname: path.dirname(file)
  });
  return module.exports;
}
test('Career language choices require 2–5 distinct languages including Pidgin and both skill levels', () => {
  assert.equal(policy.validateSkills(skills).length, 2);
  for (const value of [[], skills.slice(0, 1), [skills[1], {
    ...skills[1],
    language_id: policy.languages.find(x => x.iso === 'ibo').id
  }], Array(6).fill(skills[0]), [skills[0], skills[0]], [skills[0], {
    ...skills[1],
    oral: 'expert'
  }], [skills[0], {
    ...skills[1],
    written: ''
  }], [skills[0], {
    ...skills[1],
    language_id: 'fake'
  }]]) assert.throws(() => policy.validateSkills(value));
  assert.equal(policy.requiresLanguages({
    opportunity_type: 'volunteer',
    title: 'Outreach'
  }), true);
  assert.equal(policy.requiresLanguages({
    opportunity_type: 'employment',
    title: 'Customer Support Agent'
  }), true);
  assert.equal(policy.requiresLanguages({
    opportunity_type: 'employment',
    title: 'Accountant'
  }), false);
});
test('Nigeria catalogue has unique identifiers, Pidgin, English and Nigerian Sign Language', () => {
  assert.ok(policy.languages.length > 500);
  assert.equal(new Set(policy.languages.map(x => x.id)).size, policy.languages.length);
  for (const iso of ['pcm', 'eng', 'nsi', 'hau', 'yor', 'ibo']) assert.ok(policy.languages.some(x => x.iso === iso));
  assert.throws(() => policy.languagePreference("x' OR 1=1 --"));
  assert.equal(policy.languagePreference(undefined), null);
});
test('Agent matching binds the language and location, requires approved oral and written skills, duty and manageable load', async () => {
  const queries = [],
    db = {
      query: async (sql, params) => {
        queries.push({
          sql,
          params
        });
        return {
          rows: [{
            id: 12
          }]
        };
      }
    };
  const service = load('../../services/supportLanguageService', {
    '../config/middleware/database': db
  });
  assert.equal(await service.chooseAgent({
    preferred_language: other,
    state: 'Kogi State',
    lga: 'Okene'
  }, [9]), 12);
  const q = queries[0];
  assert.equal(q.params[0], other);
  assert.equal(q.params[1], 'kogi');
  assert.equal(q.params[2], 'okene');
  assert.deepEqual(q.params[3], [9]);
  assert.match(q.sql, /available_until>NOW/);
  assert.match(q.sql, /status='approved'/);
  assert.match(q.sql, /l\.oral IN/);
  assert.match(q.sql, /l\.written IN/);
  assert.match(q.sql, /account_suspended_at IS NULL/);
  assert.match(q.sql, /ORDER BY CASE/);
});
test('No approved language match is not silently assigned; manual assignment cannot bypass language approval', async () => {
  const db = {
      query: async () => ({
        rows: []
      })
    },
    service = load('../../services/supportLanguageService', {
      '../config/middleware/database': db
    });
  assert.equal(await service.chooseAgent({
    preferred_language: other,
    state: 'Kogi'
  }), null);
  assert.equal(await service.canTakeLanguageTicket(8, {
    preferred_language: other
  }), false);
  assert.equal(await service.canTakeLanguageTicket(8, {}), true);
});
test('Payment confirmation rejects wrong amount, currency, email, reference and unpaid status', () => {
  const service = load('../../services/conductPaymentService', {
    '../config/middleware/database': {},
    axios: {},
    '../config/utils/auditLogger': {},
    '../config/utils/notificationService': {}
  });
  const s = {
      payment_reference: 'CONDUCT-example',
      payment_email: 'real@example.test'
    },
    p = {
      status: 'success',
      reference: s.payment_reference,
      currency: 'NGN',
      amount: 500000,
      customer: {
        email: s.payment_email
      }
    };
  assert.equal(service.confirmedPayment(p, s), true);
  for (const bad of [{
    amount: 5000
  }, {
    amount: 0
  }, {
    currency: 'USD'
  }, {
    reference: 'OTHER'
  }, {
    customer: {
      email: 'someone@example.test'
    }
  }, {
    status: 'pending'
  }, {
    status: 'failed'
  }]) assert.equal(service.confirmedPayment({
    ...p,
    ...bad
  }, s), false);
});
test('Paid conduct submissions are idempotent and never create accounts or privileges', async () => {
  const calls = [],
    s = {
      id: 'x',
      user_id: 4,
      status: 'submitted',
      paid_at: new Date(),
      notified_at: new Date()
    };
  const service = load('../../services/conductPaymentService', {
    '../config/middleware/database': {
      query: async (sql, params) => {
        calls.push(sql);
        return {
          rows: [s]
        };
      }
    },
    axios: {
      get: () => {
        throw Error('Must not charge or recheck an already confirmed submission');
      }
    },
    '../config/utils/auditLogger': {},
    '../config/utils/notificationService': {}
  });
  assert.equal((await service.reconcile('x', 4)).status, 'submitted');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /user_id=\$2/);
  assert.equal(calls.some(x => /INSERT INTO users|UPDATE users/.test(x)), false);
});
test('Response monitor protects parallel workers, records real waiting periods and bounds typing delay', async () => {
  const calls = [],
    client = {
      query: async sql => {
        calls.push(sql);
        return {
          rows: sql.includes('pg_try_advisory') ? [{
            locked: true
          }] : []
        };
      },
      release() {}
    };
  const service = load('../../services/supportResponseMonitor', {
    '../config/middleware/database': {
      connect: async () => client
    },
    './supportReassignService': {
      ensureReassignSchema: async () => {}
    },
    '../config/utils/notificationService': {
      createNotification: async () => {}
    }
  });
  await service.runResponseMonitor();
  const q = calls.find(x => x.includes('waiting_customer_since') && x.includes('SELECT t.*'));
  assert.match(q, /\$3::int/);
  assert.match(q, /\$1::int/);
  assert.match(q, /FOR UPDATE SKIP LOCKED/);
  assert.match(q, /escalation_status='none'/);
  assert.match(q, /first_response_at IS NULL/);
  assert.ok(calls.includes('COMMIT'));
});
test('Response monitor does no work when another worker owns the database lock', async () => {
  const calls = [],
    client = {
      query: async sql => {
        calls.push(sql);
        return {
          rows: [{
            locked: false
          }]
        };
      },
      release() {}
    };
  const service = load('../../services/supportResponseMonitor', {
    '../config/middleware/database': {
      connect: async () => client
    },
    './supportReassignService': {
      ensureReassignSchema: async () => {}
    }
  });
  await service.runResponseMonitor();
  assert.equal(calls.some(x => x.includes('SELECT t.*')), false);
  assert.ok(calls.includes('ROLLBACK'));
});
function conductFixture(options = {}) {
  const routes = new Map(),
    middleware = [],
    queries = [],
    router = {
      use(...f) {
        middleware.push(...f);
      },
      get(p, ...f) {
        routes.set('GET ' + p, f.at(-1));
      },
      post(p, ...f) {
        routes.set('POST ' + p, f.at(-1));
      }
    };
  const document = {
      id: 2,
      role: 'lga_support_admin',
      active: true,
      sha256: 'a'.repeat(64)
    },
    saved = {
      id: 'existing',
      status: 'pending_payment',
      payment_reference: 'existing-reference',
      payment_email: 'real@example.test'
    };
  const db = {
    query: async (sql, params) => {
      queries.push({
        sql,
        params
      });
      if (sql.startsWith('SELECT * FROM admin_conduct_documents')) return {
        rows: [document]
      };
      if (sql.startsWith('INSERT INTO admin_conduct_submissions')) return {
        rows: options.existing ? [] : [saved]
      };
      if (sql.startsWith('SELECT * FROM admin_conduct_submissions')) return {
        rows: options.missing ? [] : [saved]
      };
      return {
        rows: []
      };
    }
  };
  const api = load('../../routes/adminConduct', {
    express: {
      Router: () => router
    },
    '../config/middleware/database': db,
    '../config/middleware/auth': {
      authenticate: (_q, _s, n) => n(),
      requireNotImpersonating: (_q, _s, n) => n()
    },
    'express-rate-limit': () => (_q, _s, n) => n(),
    '../config/utils/auditLogger': {
      logAction: async () => {}
    },
    axios: {
      post: () => {
        throw Error('Gateway must not run');
      }
    },
    pdfkit: function () {}
  });
  const user = {
    id: 9,
    user_type: 'lga_support_admin',
    full_name: 'Example Agent',
    email: 'real@example.test'
  };
  const request = async (key, body = {}, actor = user) => {
    let status = 200,
      payload;
    const res = {
      set() {
        return this;
      },
      status(v) {
        status = v;
        return this;
      },
      json(v) {
        payload = v;
        return this;
      }
    };
    await routes.get(key)({
      user: actor,
      params: {
        id: 'id-one'
      },
      body,
      logger: {
        error() {}
      }
    }, res);
    return {
      status,
      payload
    };
  };
  return {
    request,
    queries,
    middleware,
    document,
    user
  };
}
test('Conduct signing checks role, exact approved document hash, consent and account full name', async () => {
  for (const body of [{
    consent: false,
    signed_name: 'Example Agent',
    document_hash: 'a'.repeat(64)
  }, {
    consent: true,
    signed_name: 'Someone Else',
    document_hash: 'a'.repeat(64)
  }, {
    consent: true,
    signed_name: 'Example Agent',
    document_hash: 'forged'
  }]) {
    const f = conductFixture(),
      r = await f.request('POST /sign', {
        document_id: 2,
        ...body
      });
    assert.ok([400, 409].includes(r.status));
    assert.equal(f.queries.some(q => q.sql.startsWith('INSERT')), false);
  }
  const f = conductFixture(),
    r = await f.request('POST /sign', {
      document_id: 2,
      document_hash: f.document.sha256,
      signed_name: 'Example Agent',
      consent: true,
      amount: 0,
      status: 'submitted'
    });
  assert.equal(r.status, 200);
  const q = f.queries.find(q => q.sql.startsWith('INSERT'));
  assert.equal(q.params[7], 'real@example.test');
  assert.equal(q.params.includes('submitted'), false);
});
test('Repeated signing reuses the same pending submission and payment reference', async () => {
  const f = conductFixture({
      existing: true
    }),
    r = await f.request('POST /sign', {
      document_id: 2,
      document_hash: f.document.sha256,
      signed_name: 'Example Agent',
      consent: true
    });
  assert.equal(r.payload.data.payment_reference, 'existing-reference');
  assert.match(f.queries.find(q => q.sql.startsWith('INSERT')).sql, /ON CONFLICT\(user_id,document_id\) DO NOTHING/);
});
test('Super Admin cannot sign as a worker; customers are rejected by the conduct access gate', async () => {
  const f = conductFixture();
  assert.equal((await f.request('POST /sign', {}, {
    id: 1,
    user_type: 'super_admin'
  })).status, 403);
  let status = 200,
    next = false;
  f.middleware.at(-1)({
    user: {
      user_type: 'tenant'
    }
  }, {
    status(s) {
      status = s;
      return this;
    },
    json() {}
  }, () => next = true);
  assert.equal(status, 403);
  assert.equal(next, false);
});
test('Conduct payment initialization checks ownership before contacting Paystack', async () => {
  const f = conductFixture({
      missing: true
    }),
    r = await f.request('POST /:id/pay', {
      amount: 0
    });
  assert.equal(r.status, 404);
  const q = f.queries[0];
  assert.match(q.sql, /id=\$1 AND user_id=\$2/);
  assert.equal(q.params[1], f.user.id);
});
test('Administrators cannot download another role’s conduct file or approve their own submission', async () => {
  const f = conductFixture();
  assert.equal((await f.request('GET /documents/:id/download', {}, {
    id: 11,
    user_type: 'state_admin'
  })).status, 404);
  const r = await f.request('POST /:id/review', {
    status: 'accepted',
    note: 'Reviewed signed document'
  }, {
    id: 9,
    user_type: 'recruitment_admin'
  });
  assert.equal(r.status, 409);
  assert.match(f.queries.at(-1).sql, /user_id<>\$2/);
});
for(const firstReply of [true,false])test(`Missed ${firstReply?'first':'follow-up'} replies are persisted and the replacement agent is alerted`,async()=>{
 const queries=[],alerts=[],assigned=[];const ticket={id:4,assigned_to:9,handover_count:0,waiting_since:new Date(),first_response_at:firstReply?null:new Date(),state:'Kogi',preferred_language:other};
 const client={query:async(sql,params)=>{queries.push({sql,params});return {rows:sql.includes('pg_try_advisory')?[{locked:true}]:sql.includes('SELECT t.*')?[ticket]:[]};},release(){}};
 const service=load('../../services/supportResponseMonitor',{'../config/middleware/database':{connect:async()=>client,query:async()=>({rows:[{id:1}]})},'./supportReassignService':{ensureReassignSchema:async()=>{}},'./supportLanguageService':{chooseAgent:async()=>12,notifyAssignment:async(...v)=>assigned.push(v)},'../config/utils/notificationService':{createNotification:async(...v)=>alerts.push(v)}});
 await service.runResponseMonitor();const miss=queries.find(x=>x.sql.includes('INSERT INTO support_response_misses'));assert.equal(miss.params[1],9);assert.equal(miss.params[3],firstReply?'first_reply_waiting':'follow_up_waiting');assert.deepEqual(assigned,[[12,4]]);assert.equal(alerts.length,1);
});
test('The authoritative recruitment role enforces language skills and preserves volunteer zero fees and employment fees',async()=>{
 for(const [type,title,valid] of [['volunteer','Outreach',false],['volunteer','Outreach',true],['employment','Customer Support Agent',false],['employment','Accountant',true]]){
 const calls=[],role={id:2,cycle_id:3,opportunity_type:type,title,application_fee:5000,premium_fee:8000};
 const db={query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('INSERT INTO recruitment_settings'))return{rows:[{is_active:true,volunteer_applications_enabled:true}]};if(sql.includes('SELECT r.*, c.open_date'))return{rows:[role]};if(sql.includes('COUNT(*)::INT'))return{rows:[{count:0}]};if(sql.includes('INSERT INTO recruitment_applications'))return{rows:[{id:9,email_address:'applicant@example.test',reference_number:'ARH-APP-ABC',language_skills:valid?skills:[]}]};return{rows:[]};}};
 const service=load('../../services/recruitmentService',{'../config/middleware/database':db,'../config/utils/mailer':{sendEmail:async()=>{}},'../config/utils/notificationService':{createNotification:async()=>{}},axios:{post:()=>{throw Error('Paystack must not be initialized while creating this application');}}});
 const body={role_id:2,full_name:'Example Applicant',phone_number:'08012345678',email_address:'applicant@example.test',state_name:'Kogi',lga_name:'Okene',area_locality:'Example area',residential_address:'Example address',suitability_reason:'Experience',volunteer_motivation:'Help my community',availability:'Weekends',highest_education:'School',language_skills:valid?skills:[],opportunity_type:'volunteer',application_fee:0,payment_status:'paid'};
 let status=200;const res={status(v){status=v;return this;},json(){}};await service.createApplication({body,logger:{error(){},warn(){}}},res);
 assert.equal(status,valid?201:400);const insert=calls.find(x=>x.sql.includes('INSERT INTO recruitment_applications'));
 if(valid){assert.equal(insert.params[15],type==='volunteer'?0:5000);assert.equal(insert.params[19],type==='volunteer'?'not_applicable':'pending');}else assert.equal(insert,undefined);
 }
});
