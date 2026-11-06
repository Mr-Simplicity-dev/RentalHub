const {
  test
} = require('node:test');
const assert = require('node:assert/strict'),
  vm = require('vm'),
  fs = require('fs'),
  path = require('path'),
  sharp = require('sharp');
const source = fs.readFileSync(require.resolve('../../services/identityPhotoService'), 'utf8');
async function fixture(options = {}) {
  const image = await sharp({
    create: {
      width: 500,
      height: 500,
      channels: 3,
      background: '#ddbb99'
    }
  }).jpeg().toBuffer();
  const calls = [],
    queries = [];
  let saved = false;
  const user = {
    id: 5,
    full_name: 'Test Applicant',
    nin: 'encrypted-nin',
    nin_hash: 'nin-hash',
    passport_photo_url:options.legalImages?'/uploads/passports/passport_5_test.jpg':null,
    nin_verified: true
  };
  const db = {
    connect: async () => ({
      query: async () => ({
        rows: [{
          acquired: true
        }]
      }),
      release: () => {}
    }),
    query: async (sql, params) => {
      queries.push({
        sql,
        params
      });
      if (sql.includes('SELECT *,rentalhub_phone_key')) return { rows: [{...user,phone_key:'2348012345678'},{id:6,phone_key:options.legalDuplicate?'2348012345678':'2348099999999',passport_photo_url:options.legalImages?'/uploads/passports/passport_6_test.jpg':null}] };
      if(sql.includes('SELECT id FROM identity_review_flags WHERE user_id=$1 AND related_user_id=$2 AND photo_pair_key=$3'))return {rows:options.manualLegalReview?[{id:100}]:[]};
      if(sql.includes('SELECT user_id,image_hash FROM identity_photo_checks'))return {rows:options.legalConsents?[{user_id:5,image_hash:params[1][0]},{user_id:6,image_hash:params[1][1]}]:[]};
      if(sql.includes('INSERT INTO identity_face_comparisons'))return {rows:[{pair_key:'claimed'}]};
      if(sql.includes('SELECT face_gallery_enrolled'))return {rows:[{face_gallery_enrolled:options.enrolled===true}]};
      if (sql.includes('SELECT * FROM users')) return {
        rows: [user]
      };
      if (sql.includes('INSERT INTO identity_photo_checks')) {
        if (saved) return {
          rows: []
        };
        saved = true;
        return {
          rows: [{
            id: 10
          }]
        };
      }
      if (sql.includes('SELECT status,reasons FROM identity_photo_checks')) return {
        rows: [{
          status: options.cached || 'review_required',
          reasons: ['pending']
        }]
      };
      if (sql.includes('passport_photo_hash=$2 OR')) return {
        rows: options.duplicate ? [{
          id: 6,
          nin_hash: 'nin-hash'
        }] : []
      };
      if (sql.includes('SELECT id,full_name FROM users')) return {
        rows: options.sameName ? [{
          id: 6,
          full_name: 'Applicant Test'
        }] : []
      };
      if (sql.includes('SELECT id,provider_reference,reference_photo_encrypted')) return {
        rows: options.noReference ? [] : [{
          id: 1,
          reference_photo_encrypted: 'encrypted-reference'
        }]
      };
      if (sql.includes('INSERT INTO identity_review_flags')) return {
        rows: [{
          id: 30
        }]
      };
      if (sql.includes('SELECT other.id FROM users')) return {
        rows: options.duplicate ? [{
          id: 6
        }] : []
      };
      if (sql.includes('SELECT reason FROM identity_review_flags')) return {
        rows: options.hardFlag ? [{
          reason: 'duplicate_face'
        }] : []
      };
      return {
        rows: []
      };
    }
  };
  const axios = {
    delete: async () => {
      calls.push({
        erase: true
      });
      if (options.outage) throw Error('unavailable');
      return {
        data: {
          status: true
        }
      };
    },
    post: async (url, body) => {
      calls.push({
        url,
        body
      });
      if (options.outage) throw Error('unavailable');
      if (url.includes('liveliness')) return {
        data: {
          status: true,
          data: {
            confidence_in_percentage: options.lowLiveness ? 50 : 99
          }
        }
      };
      if (url.includes('/identify/')) return {
        data: {
          matched: options.galleryDuplicate === true,
          candidates: [],
          best_match: options.galleryDuplicate ? {
            subject_id: 'user-6',
            is_match: true,
            confidence: 99
          } : null
        }
      };
      if (url.includes('/enroll/')) return {
        data: {
          subject_id: 'user-5'
        }
      };
      return {
        data: {
          status: true,
          message: options.differentFaces?'No Match':'Face Match',
          confidence: options.differentFaces?20:99
        }
      };
    }
  };
  const module = {
    exports: {}
  };
  vm.runInNewContext(source, {
    module,
    Buffer,
    console,
    setTimeout,
    process: {
      env: {
        PREMBLY_SECRET_KEY: 'test-only'
      }
    },
    __dirname: path.dirname(require.resolve('../../services/identityPhotoService')),
    require: name => name === 'fs' && options.legalImages ? {...fs,promises:{...fs.promises,readFile:async filename=>String(filename).includes('passport_5_')?image:await sharp({create:{width:500,height:500,channels:3,background:'#abcdef'}}).jpeg().toBuffer()}} : name === 'axios' ? axios : name === '../config/middleware/database' ? db : name === '../config/utils/ninEncryption' ? {
      encryptNIN: v => v,
      decryptNIN: v => v === 'encrypted-nin' ? '12345678901' : 'data:image/jpeg;base64,' + image.toString('base64')
    } : name === '../config/utils/notificationService' ? {
      createNotification: async () => {}
    } : require(name)
  });
  return {
    api: module.exports,
    image,
    calls,
    queries
  };
}
test('identity conflicts cover same account, phone, NIN, passport, email and exact photo; same name alone is not proof', async () => {
  const {
    api
  } = await fixture();
  for (const field of ['nin_hash', 'international_passport_number', 'phone_key', 'email', 'passport_photo_hash']) assert.ok(api.identityConflict({
    id: 1,
    [field]: 'same'
  }, {
    id: 2,
    [field]: 'same'
  }));
  assert.equal(api.identityConflict({
    id: 1,
    full_name: 'Same Name'
  }, {
    id: 2,
    full_name: 'Same Name'
  }), false);
  assert.equal(api.normalName('Ada Obi'), api.normalName('OBI ADA'));
});
test('face comparison rejects ambiguous or malformed scores rather than declaring identity verified', async () => {
  const {
    api
  } = await fixture();
  for (const confidence of [null, '99', 0.9, 80, NaN, 101]) assert.equal(api.faceVerdict({
    confidence
  }).status, 'review_required');
  assert.equal(api.faceVerdict({
    confidence: 99
  }).status, 'match');
  assert.equal(api.faceVerdict({
    message: 'No Match',
    confidence: 20
  }).status, 'different');
});
test('declining gallery consent saves a manual-review result without sending any biometric provider request', async () => {
  const f = await fixture();
  const result = await f.api.screenPhoto({
    userId: 5,
    buffer: f.image,
    consent: false
  });
  assert.equal(result.status, 'review_required');
  assert.equal(f.calls.length, 0);
  assert.ok(result.reasons.includes('biometric_consent_not_given'));
});
test('successful live capture, trusted identity portrait and gallery search are all required for automatic verification', async () => {
  const f = await fixture();
  const result = await f.api.screenPhoto({
    userId: 5,
    buffer: f.image,
    consent: true
  });
  assert.equal(result.status, 'verified');
  assert.ok(f.calls.some(c => c.url.includes('/enroll/')));
  const enroll = f.calls.find(c => c.url.includes('/enroll/'));
  assert.equal(enroll.body.consent, true);
  assert.ok(enroll.body.consent_reference.includes('check-10'));
});
test('provider outage, missing portrait, same name, duplicate face and assisted capture never auto-verify', async () => {
  for (const options of [{
    outage: true
  }, {
    noReference: true
  }, {
    sameName: true
  }, {
    galleryDuplicate: true
  }, {
    lowLiveness: true
  }, {
    assisted: true
  }]) {
    const f = await fixture(options),
      result = await f.api.screenPhoto({
        userId: 5,
        buffer: f.image,
        consent: true,
        assisted: options.assisted
      });
    assert.notEqual(result.status, 'verified', JSON.stringify(options));
    assert.equal(f.calls.some(c => c.url.includes('/enroll/')), false);
  }
});
test('duplicate identity stops biometric calls and cached submissions do not repeat paid checks', async () => {
  const f = await fixture({
    duplicate: true
  });
  assert.equal((await f.api.screenPhoto({
    userId: 5,
    buffer: f.image,
    consent: true
  })).status, 'review_required');
  assert.equal(f.calls.length, 0);
  const g = await fixture();
  await g.api.screenPhoto({
    userId: 5,
    buffer: g.image,
    consent: true
  });
  const calls = g.calls.length;
  await g.api.screenPhoto({
    userId: 5,
    buffer: g.image,
    consent: true
  });
  assert.equal(g.calls.length, calls);
});
test('manual approval cannot override unresolved hard conflicts or approve its own actor', async () => {
  for (const options of [{
    duplicate: true
  }, {
    hardFlag: true
  }]) {
    const f = await fixture(options);
    await assert.rejects(f.api.guardManualVerification(5, 9), {
      statusCode: 409
    });
  }
  const f = await fixture();
  await assert.rejects(f.api.guardManualVerification(5, 5), {
    statusCode: 403
  });
  await f.api.guardManualVerification(5, 9);
});
test('legacy upload is delegated to protected upload and applications retain server-side identity enforcement', () => {
  const auth = fs.readFileSync(require.resolve('../../services/authService'), 'utf8');
  assert.match(auth, /exports.uploadPassport = \(req,res\) => require\('\.\.\/routes\/users'\).handlePassportUpload/);
  const routes = fs.readFileSync(require.resolve('../../routes/applications'), 'utf8');
  assert.match(routes, /authenticate,\s*isTenant,\s*isVerified/);
});
test('legal actions block the same actor, matching phone identities and unavailable face evidence', async () => {
  const f = await fixture({
    legalDuplicate: true
  });
  assert.equal(await f.api.legalConflict(5, [6]), true);
  assert.equal(f.calls.length, 0);
  const g = await fixture();
  assert.equal(await g.api.legalConflict(5, [5]), true);
  assert.equal(await g.api.legalConflict(5, [6]), true);
});
test('gallery erasure is required before clearing enrolment and is skipped for users never enrolled', async () => {
  const f = await fixture({
    enrolled: true
  });
  await f.api.eraseGallery(5);
  assert.equal(f.calls.filter(c => c.erase).length, 1);
  assert.ok(f.queries.some(q => q.sql.includes('SET face_gallery_enrolled=FALSE')));
  const failed = await fixture({
    enrolled: true,
    outage: true
  });
  await assert.rejects(failed.api.eraseGallery(5));
  assert.equal(failed.queries.some(q => q.sql.includes('SET face_gallery_enrolled=FALSE')), false);
  const empty = await fixture();
  await empty.api.eraseGallery(5);
  assert.equal(empty.calls.length, 0);
});

test('legal face processing requires both consents; manual review is bound to the current photo pair',async()=>{const none=await fixture({legalImages:true});assert.equal(await none.api.legalConflict(5,[6]),true);assert.equal(none.calls.length,0);const flag=none.queries.find(q=>q.sql.includes('INSERT INTO identity_review_flags'));assert.equal(flag.params[3].length,64);const manual=await fixture({legalImages:true,manualLegalReview:true});assert.equal(await manual.api.legalConflict(5,[6]),false);assert.equal(manual.calls.length,0);const consented=await fixture({legalImages:true,legalConsents:true,differentFaces:true});assert.equal(await consented.api.legalConflict(5,[6]),false);assert.ok(consented.calls.some(call=>call.url?.endsWith('/face/comparison')));});

test('only verified provider responses can supply a bounded JPEG or PNG reference portrait',async()=>{const {normalizePremblyResponse}=require('../../config/utils/premblyResponse');const f=await fixture();const image=f.image.toString('base64');const good=normalizePremblyResponse({status:true,response_code:'00',nin_data:{base64Image:image}});assert.equal(good.reference_photo,'data:image/jpeg;base64,'+image);assert.equal(normalizePremblyResponse({status:false,response_code:'01',data:{photo:image}}).reference_photo,null);for(const photo of ['https://example.invalid/image.jpg','data:image/svg+xml;base64,PHN2Zz4='])assert.equal(normalizePremblyResponse({status:true,response_code:'00',data:{photo}}).reference_photo,null);});
