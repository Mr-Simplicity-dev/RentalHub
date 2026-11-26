const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  vm = require('vm');
function fixture(rows, error = null) {
  let messages;
  const module = {
    exports: {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../config/utils/pushNotificationService'), 'utf8'), {
    module,
    exports: module.exports,
    require: name => name === 'axios' ? {
      post: async (_, body) => {
        messages = body;
        return {
          data: {
            data: body.map(() => ({
              status: error ? 'error' : 'ok',
              ...(error ? {
                details: {
                  error
                }
              } : {})
            }))
          }
        };
      }
    } : name.includes('database') ? {
      query: async sql => ({
        rows: sql.includes('SELECT expo_push_token') ? rows : []
      })
    } : {
      error() {}
    }
  });
  return {
    service: module.exports,
    get: () => messages
  };
}
const devices = [{
  expo_push_token: 'ExpoPushToken[native]',
  platform: 'android',
  device_id: 'phone:incoming-v1'
}, {
  expo_push_token: 'ExpoPushToken[old]',
  platform: 'android',
  device_id: 'phone'
}, {
  expo_push_token: 'ExpoPushToken[ios]',
  platform: 'ios',
  device_id: 'iphone'
}];
test('new Android calls receive data only while old Android/iOS keep their original alerts', async () => {
  const f = fixture(devices);
  await f.service.sendPushToUser(2, {
    title: 'Incoming call',
    body: 'Answer',
    sound: 'call_normal.wav',
    channelId: 'calls-normal-v1',
    ttl: 40,
    data: {
      type: 'incoming_call',
      callId: 'test'
    }
  });
  const [native, old, ios] = f.get();
  assert.equal(native.title, undefined);
  assert.equal(native.sound, undefined);
  assert.equal(native.data.type, 'incoming_call');
  assert.equal(native.priority, 'high');
  assert.equal(native.ttl, 40);
  for (const item of [old, ios]) {
    assert.equal(item.title, 'Incoming call');
    assert.equal(item.sound, 'call_normal.wav');
    assert.equal(item.channelId, 'calls-normal-v1');
  }
  assert.equal(native.badge, undefined);
});
test('ordinary messages retain titles, sound, channel, badge and payload on every device', async () => {
  const f = fixture(devices);
  await f.service.sendPushToUser(2, {
    title: 'Message',
    body: 'Hello',
    badge: 7,
    data: {
      screen: 'Messages'
    }
  });
  for (const item of f.get()) {
    assert.equal(item.title, 'Message');
    assert.equal(item.body, 'Hello');
    assert.equal(item.sound, 'default');
    assert.equal(item.channelId, 'messages');
    assert.equal(item.badge, 7);
    assert.equal(item.data.screen, 'Messages');
  }
});
test('silent cancellation reaches only capable Android devices and does not post empty notifications to old apps', async () => {
  const f = fixture(devices);
  await f.service.sendPushToUser(2, {
    nativeCallOnly: true,
    dataOnly: true,
    data: {
      type: 'call_cancelled'
    }
  });
  assert.equal(f.get().length, 1);
  assert.equal(f.get()[0].to, 'ExpoPushToken[native]');
  assert.equal(f.get()[0].title, undefined);
  assert.equal(f.get()[0].badge, undefined);
  const old = fixture(devices.slice(1));
  assert.equal((await old.service.sendPushToUser(2, {
    nativeCallOnly: true,
    dataOnly: true
  })).sent, 0);
  assert.equal(old.get(), undefined);
});
test('new ordinary Android alerts use the high-visibility channel while old apps retain their channel', async () => {
  const f = fixture(devices);
  await f.service.sendPushToUser(2, {
    title: 'Property',
    body: 'New listing',
    channelId: 'general',
    data: {
      type: 'property_posted'
    }
  });
  assert.equal(f.get()[0].channelId, 'activity-v2');
  assert.equal(f.get()[1].channelId, 'general');
  assert.equal(f.get()[2].channelId, 'general');
});
test('provider rejection is reported as a failure instead of a successful delivery', async () => {
  const f = fixture(devices.slice(0, 1), 'InvalidCredentials');
  const result = await f.service.sendPushToUser(2, {
    title: 'Test',
    data: {}
  });
  assert.equal(result.sent, 0);
  assert.equal(result.error, 'InvalidCredentials');
});
