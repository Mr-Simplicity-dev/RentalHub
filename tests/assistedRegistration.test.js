const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const policy = require('../services/assistedRegistrationPolicy');
const load = (file, mocks) => {
  const full = path.join(__dirname, '..', file);
  const mod = {
    exports: {}
  };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), {
    module: mod,
    exports: mod.exports,
    require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(require.resolve(id, {
      paths: [path.dirname(full)]
    })),
    console,
    process,
    Buffer,
    setTimeout,
    URL
  }, {
    filename: full
  });
  return mod.exports;
};
const base = {
  full_name: 'Customer Example',
  phone: '08031234567',
  email: '',
  user_type: 'tenant',
  consent_confirmed: true,
  request_id: 'b1234567-1234-4123-9123-123456789abc'
};
const actor = {
  id: 9,
  user_type: 'state_support_admin',
  assigned_state: 'Lagos'
};
test('phone aliases normalize and malformed identities are rejected', () => {
  for (const phone of ['08031234567', '2348031234567', '+234 803 123 4567']) assert.equal(policy.phoneKey(phone), '+2348031234567');
  for (const phone of ['8031234567', 'abc', '+000000000', '']) assert.equal(policy.phoneKey(phone), null);
});
test('assisted accounts may omit email but cannot request privileged roles or omit consent', () => {
  policy.validateAccount(base);
  for (const user_type of ['super_admin', 'lawyer', 'agent', 'recruitment_admin']) assert.throws(() => policy.validateAccount({
    ...base,
    user_type
  }), /tenant and landlord/);
  assert.throws(() => policy.validateAccount({
    ...base,
    email: 'fake'
  }), /valid email/);
  assert.throws(() => policy.validateAccount({
    ...base,
    consent_confirmed: false
  }), /agreement/);
  assert.throws(() => policy.validateAccount({
    ...base,
    request_id: 'x'
  }), /identifier/);
});
test('staff scope rejects wrong states, wrong LGAs and missing zones', () => {
  policy.requireScope(actor, {
    state_name: 'Lagos'
  });
  assert.throws(() => policy.requireScope(actor, {
    state_name: 'Kano'
  }));
  assert.throws(() => policy.requireScope({
    ...actor,
    user_type: 'lga_support_admin',
    assigned_lga: 'Ikeja'
  }, {
    state_name: 'Lagos',
    lga_name: 'Epe'
  }));
  assert.throws(() => policy.requireScope({
    user_type: 'zonal_admin'
  }, {
    state_name: 'Unknown'
  }));
  assert.throws(() => policy.requireScope({
    user_type: 'tenant'
  }, {
    state_name: 'Lagos'
  }));
  policy.requireScope({
    user_type: 'super_admin'
  }, {
    state_name: 'Kano'
  });
});
test('staff-safe customer summary excludes credentials and identity details', () => {
  const safe = policy.safeUser({
    id: 1,
    email: null,
    password_hash: 'secret',
    nin: 'sensitive',
    token: 'jwt',
    user_type: 'tenant',
    assisted_registration: true,
    registration_payment_required: true
  });
  assert.equal(safe.registration_payment_required, true);
  for (const key of ['password_hash', 'nin', 'token']) assert.equal(safe[key], undefined);
});
const serviceWith = (db, extra = {}) => load('services/assistedRegistrationService.js', {
  '../config/middleware/database': db,
  '../config/middleware/featureFlags': {
    getFeatureFlagsMap: async () => ({})
  },
  '../config/utils/locationDirectory': {
    resolveLocationSelection: async () => ({
      state_id: 1,
      state_name: 'Lagos',
      lga_name: 'Ikeja'
    })
  },
  '../config/utils/registrationAccess': {
    assertRegistrationAllowed: async () => {}
  },
  './activityLogger': {
    log: async () => {}
  },
  './authService': {
    assistedRegistrationInternals: {
      buildRegistrationPricingQuote: async () => ({
        enabled: true,
        amount: 3000
      })
    }
  },
  ...extra
});
test('fee quote uses server pricing and ignores submitted fee/payment status', async () => {
  const service = serviceWith({});
  const q = await service.quote(actor, {
    ...base,
    state_id: 1,
    lga_name: 'Ikeja',
    amount: 0,
    application_fee: 0,
    payment_status: 'paid',
    use_rentalhub_lawyers: true,
    use_rentalhub_agents: true
  });
  assert.equal(q.amount, 5000);
  assert.equal(q.agent_amount, 0);
  await assert.rejects(service.quote(actor, {
    user_type: 'super_admin'
  }));
});
test('unpaid accounts are blocked from private APIs, including query-string and trailing-slash forms', async () => {
  const gate = load('config/middleware/assistedAccessGate.js', {
    './database': {
      query: async () => ({
        rows: [{
          status: 'unpaid'
        }]
      })
    }
  });
  for (const url of ['/api/wallet', '/api/properties/mine?x=1', '/api/support/']) {
    let status;
    let allowed = false;
    await gate({
      user: {
        id: 1,
        assisted_registration: true
      },
      originalUrl: url
    }, {
      status: n => {
        status = n;
        return {
          json: data => assert.equal(data.code, 'REGISTRATION_PAYMENT_REQUIRED')
        };
      }
    }, () => {
      allowed = true;
    });
    assert.equal(status, 402);
    assert.equal(allowed, false);
  }
});
test('unpaid customers retain own payment and logout access; paid and ordinary users pass', async () => {
  for (const url of ['/api/assisted-registration/me', '/api/assisted-registration/payment/', '/api/auth/logout']) {
    let next = false;
    const gate = load('config/middleware/assistedAccessGate.js', {
      './database': {
        query: async () => ({
          rows: [{
            status: 'unpaid'
          }]
        })
      }
    });
    await gate({
      user: {
        id: 1,
        assisted_registration: true
      },
      originalUrl: url
    }, {}, () => {
      next = true;
    });
    assert.equal(next, true);
  }
  let next = 0;
  const gate = load('config/middleware/assistedAccessGate.js', {
    './database': {
      query: async () => ({
        rows: [{
          status: 'paid'
        }]
      })
    }
  });
  await gate({
    user: {
      id: 1,
      assisted_registration: true
    },
    originalUrl: '/api/wallet'
  }, {}, () => next++);
  await gate({
    user: {
      id: 2
    },
    originalUrl: '/api/wallet'
  }, {}, () => next++);
  assert.equal(next, 2);
});
test('missing invoice fails closed', async () => {
  let status;
  const gate = load('config/middleware/assistedAccessGate.js', {
    './database': {
      query: async () => ({
        rows: []
      })
    }
  });
  await gate({
    user: {
      id: 1,
      assisted_registration: true
    },
    originalUrl: '/api/wallet'
  }, {
    status: n => {
      status = n;
      return {
        json: () => {}
      };
    }
  }, () => assert.fail('Access must be denied'));
  assert.equal(status, 402);
});
test('settlement rejects underpayments before writing any ledger rows', async () => {
  const calls = [];
  const service = serviceWith({
    connect: async () => ({
      query: async sql => {
        calls.push(sql);
        return {
          rows: sql.startsWith('SELECT *') ? [{
            user_id: 1,
            status: 'unpaid',
            amount_due: 5000
          }] : []
        };
      },
      release: () => {}
    })
  });
  await assert.rejects(service.settleVerifiedPayment({
    reference: 'ref',
    payment: {
      payment_status: 'completed',
      amount: 10
    }
  }), /does not cover/);
  assert.equal(calls.some(sql => sql.startsWith('INSERT INTO payments')), false);
  assert.ok(calls.includes('ROLLBACK'));
  await assert.rejects(service.settleVerifiedPayment({
    reference: 'ref',
    payment: {
      payment_status: 'pending',
      amount: 5000
    }
  }), /not been confirmed/);
});
test('settlement is idempotent after payment has been recorded', async () => {
  const calls = [];
  const service = serviceWith({
    connect: async () => ({
      query: async sql => {
        calls.push(sql);
        return {
          rows: sql.startsWith('SELECT *') ? [{
            user_id: 1,
            status: 'paid',
            amount_due: 5000
          }] : []
        };
      },
      release: () => {}
    })
  });
  const r = await service.settleVerifiedPayment({
    reference: 'ref',
    payment: {
      payment_status: 'completed',
      amount: 5000
    }
  });
  assert.equal(r.registration_paid, true);
  assert.equal(r.token, undefined);
  assert.equal(calls.some(sql => sql.startsWith('INSERT')), false);
});
test('cash requires scoped ownership and exact server amount', async () => {
  const db = {
    query: async () => ({
      rows: [{
        reference: 'ref',
        user_id: 1,
        state_name: 'Lagos',
        lga_name: 'Ikeja',
        amount_due: 5000
      }]
    })
  };
  const service = serviceWith(db);
  await assert.rejects(service.collectCash(actor, 'ref', {
    cash_received: true,
    amount: 0
  }), /exact/);
  await assert.rejects(service.collectCash({
    ...actor,
    assigned_state: 'Kano'
  }, 'ref', {
    cash_received: true,
    amount: 5000
  }), /outside/);
  await assert.rejects(service.collectCash(actor, 'ref', {
    cash_received: false,
    amount: 5000
  }), /exact/);
});
test('collector cannot acknowledge their own remittance', async () => {
  const service = serviceWith({
    query: async () => ({
      rows: [{
        reference: 'ref',
        user_id: 1,
        collected_by: 9,
        state_name: 'Lagos'
      }]
    })
  });
  await assert.rejects(service.remit({
    id: 9,
    user_type: 'super_admin'
  }, 'ref'), /different supervisor/);
  await assert.rejects(service.remit(actor, 'ref'), /Supervisor/);
});
test('phone-only card payment cannot invent a customer email or call Paystack', async () => {
  let called = false;
  const service = serviceWith({
    query: async sql => ({
      rows: sql === 'SELECT reference FROM assisted_registrations WHERE user_id=$1' ? [{
        reference: 'ref'
      }] : sql.startsWith('SELECT ar.') ? [{
        reference: 'ref',
        user_id: 1,
        status: 'unpaid',
        email: null
      }] : [{}]
    })
  }, {
    axios: {
      post: async () => {
        called = true;
      }
    }
  });
  await assert.rejects(service.initializePayment({
    id: 1
  }, 'paystack'), /own email/);
  assert.equal(called, false);
});
test('used, expired and exhausted phone challenges never authenticate', async () => {
  for (const row of [{
    consumed_at: new Date()
  }, {
    expires_at: '2000-01-01'
  }, {
    expires_at: '2099-01-01',
    attempts: 5
  }]) {
    const service = serviceWith({
      connect: async () => ({
        query: async sql => ({
          rows: sql.startsWith('SELECT *') ? [row] : []
        }),
        release: () => {}
      })
    });
    await assert.rejects(service.verifyPhoneCode({
      challenge_id: base.request_id,
      code: '123456'
    }), /expired/);
  }
});
test('migration preserves ordinary accounts and does not store raw fingerprint images', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/2030_assisted_registration_office_verification.sql'), 'utf8');
  assert.match(sql, /assisted_registration BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /CREATE UNIQUE INDEX.*users_phone_login_key_unique/);
  assert.match(sql, /FOREIGN|REFERENCES users/);
  assert.doesNotMatch(sql, /encrypted_template|fingerprint_image/);
});
test('creation reuses identity validation, commits an unpaid invoice and never returns a customer session to staff', async () => {
  let password,
    preparedOptions,
    hookQueries = [];
  const invoice = {
    reference: 'ref',
    user_id: 100,
    staff_id: 9,
    state_name: 'Lagos',
    lga_name: 'Ikeja',
    amount_due: 3000,
    status: 'unpaid'
  };
  const db = {
    query: async sql => ({
      rows: sql.startsWith('INSERT INTO assisted_registration_requests') ? [{
        request_id: base.request_id
      }] : [invoice]
    })
  };
  const internal = {
    buildRegistrationPricingQuote: async () => ({
      enabled: true,
      amount: 3000
    }),
    validateAndPrepareRegistration: async (input, options) => {
      password = input.password;
      preparedOptions = options;
      return {
        preparedRegistration: {
          ...input
        },
        verificationMeta: {}
      };
    },
    withPreparedRegistrationLocation: input => input,
    createUserFromPreparedRegistration: async args => {
      assert.equal(args.deferPaidBenefits, true);
      assert.equal(typeof args.passwordHash, 'string');
      await args.beforeCommit({
        query: async (sql, params) => {
          hookQueries.push({
            sql,
            params
          });
        }
      }, {
        id: 100,
        email: null,
        user_type: 'tenant',
        full_name: base.full_name
      });
      return {
        token: 'customer-secret'
      };
    }
  };
  const service = serviceWith(db, {
    './authService': {
      assistedRegistrationInternals: internal
    }
  });
  const r = await service.create(actor, {
    ...base,
    expected_amount: 3000,
    lawyer_email: 'lawyer@rentalhub.com.ng',
    state_id: 1,
    lga_name: 'Ikeja'
  });
  assert.equal(preparedOptions.allowMissingEmail, true);
  assert.ok(password.length > 40);
  assert.equal(r.status, 'unpaid');
  assert.equal(r.token, undefined);
  assert.ok(hookQueries.some(x => x.sql.startsWith('UPDATE users SET assisted_registration=TRUE')));
  const pending = hookQueries.find(x => x.sql.startsWith('INSERT INTO tenant_registration_payments'));
  assert.equal(pending.params[1], null);
  const stored = JSON.parse(pending.params[6]);
  assert.equal(stored.assisted_registration, true);
  assert.equal(stored.password_hash, undefined);
  assert.equal(stored.nin, undefined);
});
test('stale quotes cannot silently change the fee agreed by the customer', async () => {
  const service = serviceWith({});
  await assert.rejects(service.create(actor, {
    ...base,
    expected_amount: 1
  }), /fee has changed/);
});
test('a successful cash settlement uses the database amount and leaves an outstanding remittance', async () => {
  let writes = [];
  let id = 20;
  const invoice = {
    reference: 'ref',
    user_id: 1,
    status: 'unpaid',
    amount_due: 5000,
    quote: {
      base_amount: 5000,
      lawyer_amount: 0,
      agent_amount: 0
    }
  };
  const db = {
    connect: async () => ({
      query: async (sql, params) => {
        writes.push({
          sql,
          params
        });
        if (sql.startsWith('SELECT *')) return {
          rows: [invoice]
        };
        if (sql.startsWith('INSERT INTO payments')) return {
          rows: [{
            id: id++
          }]
        };
        return {
          rows: []
        };
      },
      release: () => {}
    }),
    query: async sql => ({
      rows: sql.startsWith('SELECT ar.') ? [{
        ...invoice,
        status: 'paid',
        benefits_completed_at: new Date()
      }] : []
    })
  };
  const service = serviceWith(db);
  const r = await service.settleVerifiedPayment({
    reference: 'ref',
    actor,
    payment: {
      payment_status: 'completed',
      payment_method: 'cash',
      amount: 5000
    }
  });
  assert.equal(r.registration_paid, true);
  const ledger = writes.find(x => x.sql.startsWith('INSERT INTO payments'));
  assert.equal(ledger.params[2], 5000);
  assert.equal(ledger.params[3], 'cash');
  const paid = writes.find(x => x.sql.startsWith('UPDATE assisted_registrations SET status'));
  assert.equal(paid.params[4], 'outstanding');
  assert.equal(paid.params[3], actor.id);
  assert.equal(writes.filter(x => x.sql.startsWith('INSERT INTO payments')).length, 1);
});
test('registration reminders exclude assisted invoices from reconciliation, abandonment and resume emails', async () => {
  const queries = [];
  const jobs = load('jobs/registrationReminderJobs.js', {
    '../config/middleware/database': {
      query: async sql => {
        queries.push(sql);
        return {
          rows: []
        };
      }
    },
    '../config/utils/logger': {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    '../config/utils/emailService': {
      sendCompleteRegistrationEmail: async () => assert.fail('No reminders should be sent')
    },
    '../services/assistedRegistrationService': {
      reconcilePendingBenefits: async () => {}
    }
  });
  await jobs.runRegistrationReminders();
  const sensitive = queries.filter(sql => sql.includes('tenant_registration_payments') && sql.includes("payment_status = 'pending'"));
  assert.equal(sensitive.length, 3);
  for (const sql of sensitive) assert.match(sql, /registration_payload->>'assisted_registration'/);
});
test('all public assisted-account copy exists in eight languages and matches the native copy', () => {
  const web = JSON.parse(fs.readFileSync(path.join(__dirname, '../client/src/i18n/assistedRegistration.json'), 'utf8'));
  const mobile = JSON.parse(fs.readFileSync(path.join(__dirname, '../RentalHubMobile/src/i18n/assistedRegistration.json'), 'utf8'));
  assert.deepEqual(web, mobile);
  for (const language of ['en', 'fr', 'ar', 'ru', 'zh', 'ha', 'yo', 'ig']) {
    assert.deepEqual(Object.keys(web[language]), Object.keys(web.en));
    assert.ok(Object.values(web[language]).every(x => typeof x === 'string' && x.length > 0));
  }
});
test('a correct phone code still cannot sign in to a privileged account', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-assisted-registration-secret';
  try {
    const challenge = {
      id: base.request_id,
      purpose: 'access',
      phone_key: '+2348031234567',
      code_hash: policy.otpHash(base.request_id, '123456'),
      expires_at: '2099-01-01',
      attempts: 0
    };
    const service = serviceWith({
      connect: async () => ({
        query: async sql => ({
          rows: sql.startsWith('SELECT *') ? [challenge] : []
        }),
        release: () => {}
      }),
      query: async () => ({
        rows: [{
          id: 1,
          user_type: 'super_admin',
          email_verified: true,
          phone_verified: true,
          is_active: true
        }]
      })
    });
    await assert.rejects(service.verifyPhoneCode({
      challenge_id: base.request_id,
      code: '123456'
    }), /Unable to verify/);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;else process.env.JWT_SECRET = previous;
  }
});
test('staff endpoints enforce authentication, support roles and privileged MFA', async () => {
  const express = require('express');
  let touched = false,
    mfa = false;
  const pass = (req, res, next) => next();
  const service = {
    list: async () => {
      touched = true;
      return [];
    }
  };
  const router = load('routes/assistedRegistration.js', {
    '../config/middleware/auth': {
      authenticate: (req, res, next) => {
        if (!req.headers['x-test-role']) return res.status(401).json({
          success: false
        });
        req.user = {
          id: 9,
          user_type: req.headers['x-test-role']
        };
        next();
      }
    },
    '../config/middleware/turnstileVerify': {
      requireTurnstile: () => pass
    },
    '../config/middleware/securityRateLimiters': {
      otpSendLimiter: pass,
      otpLimiter: pass,
      sensitiveActionLimiter: pass,
      registrationLimiter: pass
    },
    '../config/utils/twoFactor': {
      requirePrivilegedMfa: (req, res, next) => {
        mfa = true;
        next();
      }
    },
    '../services/assistedRegistrationService': service
  });
  const app = express();
  app.use(express.json());
  app.use('/api/assisted-registration', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/assisted-registration/staff';
    assert.equal((await fetch(url)).status, 401);
    for (const role of ['tenant', 'landlord', 'lawyer', 'marketing_agent', 'recruitment_admin']) assert.equal((await fetch(url, {
      headers: {
        'x-test-role': role
      }
    })).status, 403);
    assert.equal(touched, false);
    assert.equal(mfa, false);
    const response = await fetch(url, {
      headers: {
        'x-test-role': 'state_support_admin'
      }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(touched, true);
    assert.equal(mfa, true);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
test('password setup requires a fresh recovery code for the same customer and revokes older sessions', async () => {
  const express = require('express');
  const pass = (req, res, next) => next();
  let verifiedId = 10,
    writes = [];
  const router = load('routes/assistedRegistration.js', {
    '../config/middleware/auth': {
      authenticate: (req, res, next) => {
        req.user = {
          id: 9,
          user_type: 'tenant',
          assisted_registration: true
        };
        next();
      }
    },
    '../config/middleware/turnstileVerify': {
      requireTurnstile: () => pass
    },
    '../config/middleware/securityRateLimiters': {
      otpSendLimiter: pass,
      otpLimiter: pass,
      sensitiveActionLimiter: pass,
      registrationLimiter: pass
    },
    '../config/utils/twoFactor': {
      requirePrivilegedMfa: pass
    },
    '../services/assistedRegistrationService': {
      recordForUser: async () => ({
        user_id: 9
      }),
      verifyPhoneCode: async (body, purpose) => {
        assert.equal(purpose, 'recovery');
        if (!body.code) throw policy.fail(401, 'Verification required');
        return {
          id: verifiedId
        };
      }
    },
    '../config/middleware/database': {
      query: async (sql, params) => {
        writes.push({
          sql,
          params
        });
        return {
          rows: []
        };
      }
    },
    bcryptjs: {
      hash: async () => 'test-password-hash'
    }
  });
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const send = body => fetch('http://127.0.0.1:' + server.address().port + '/password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    assert.equal((await send({
      password: 'CustomerPass1!'
    })).status, 401);
    assert.equal((await send({
      password: 'CustomerPass1!',
      code: '123456'
    })).status, 403);
    assert.equal(writes.length, 0);
    verifiedId = 9;
    const r = await send({
      password: 'CustomerPass1!',
      code: '123456'
    });
    assert.equal(r.status, 200);
    assert.equal(writes.length, 1);
    assert.match(writes[0].sql, /token_version=COALESCE\(token_version,1\)\+1/);
    assert.equal(writes[0].params[0], 9);
    assert.equal((await r.json()).data.token, undefined);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
test('missing payment email is rejected before card initialization, while a real address is normalized',()=>{const email=require('../config/utils/paymentEmail');for(const value of [null,undefined,'','not-an-email'])assert.throws(()=>email(value),error=>error.code==='PAYMENT_EMAIL_REQUIRED'&&error.statusCode===400);assert.equal(email(' Customer@RentalHub.com.ng '),'customer@rentalhub.com.ng');});
test('mailer skips absent recipients and refuses invalid recipients without contacting the provider',async()=>{let sends=0;const mailer=load('config/utils/mailer.js',{'./logger':{warn:()=>{},error:()=>{}},resend:{Resend:class{constructor(){this.emails={send:async()=>{sends++;return{};}};}}}});assert.equal((await mailer.sendEmail({to:null,subject:'Receipt',html:'Receipt'})).skipped,true);assert.equal((await mailer.sendEmail({to:[],subject:'Receipt',html:'Receipt'})).skipped,true);await assert.rejects(mailer.sendEmail({to:'invalid',subject:'Receipt',html:'Receipt'}),/valid recipient/);assert.equal(sends,0);});
test('native staff entry points resolve to a registered screen and unpaid users receive a payment screen',()=>{const root=path.join(__dirname,'../RentalHubMobile/src');const navigator=fs.readFileSync(path.join(root,'navigation/AppNavigator.js'),'utf8');assert.match(navigator,/name="AssistedRegistration" component=\{AssistedRegistrationScreen\}/);assert.match(navigator,/registration_payment_required/);assert.match(navigator,/name="RegistrationPayment" component=\{RegistrationPaymentScreen\}/);for(const file of ['screens/admin/SuperAdminDashboardScreen.js','screens/service-admin/ServiceOperationsDashboardScreen.js','screens/shared/ZonalAdminScreen.js'])assert.match(fs.readFileSync(path.join(root,file),'utf8'),/AssistedRegistration/);});
test('zero-fee accounts are completed in the account transaction without contacting a payment provider',async()=>{const queries=[];const db={query:async sql=>({rows:sql.startsWith('INSERT INTO assisted_registration_requests')?[{request_id:base.request_id}]:[{reference:'zero',state_name:'Lagos',lga_name:'Ikeja',status:'paid'}]})};const internal={buildRegistrationPricingQuote:async()=>({enabled:false,amount:3000}),validateAndPrepareRegistration:async input=>({preparedRegistration:input,verificationMeta:{}}),withPreparedRegistrationLocation:input=>input,createUserFromPreparedRegistration:async args=>{assert.equal(args.assistedRegistration,true);await args.beforeCommit({query:async sql=>{queries.push(sql);return{rows:[]};}},{id:1,email:null,user_type:'tenant',full_name:base.full_name});}};const service=serviceWith(db,{'./authService':{assistedRegistrationInternals:internal},axios:{post:async()=>assert.fail('Zero fee must not initialize payment')}});const result=await service.create(actor,{...base,expected_amount:0,lawyer_email:'lawyer@rentalhub.com.ng'});assert.equal(result.status,'paid');assert.ok(queries.some(sql=>sql.includes("status='paid',collection_method='waived'")));});
