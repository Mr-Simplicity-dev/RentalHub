const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('fs'),
  vm = require('vm');
const {
  preferenceFor,
  sendOrdinaryPush,
  deliverNotification
} = require('../config/utils/notificationDelivery');
const notification = {
  id: 7,
  user_id: 2,
  title: 'New property available!',
  message: 'A new home is available.',
  type: 'property_posted',
  link: '/properties/123'
};
function fixture(preferences = {}) {
  const sent = [],
    queries = [];
  const q = {
    query: async (sql, args) => {
      queries.push([sql, args]);
      return {
        rows: sql.includes('SELECT preferences') ? [{
          preferences
        }] : [{
          count: sql.includes('FROM messages') ? 3 : 4
        }]
      };
    }
  };
  return {
    q,
    sent,
    queries,
    sendPush: async (...args) => {
      sent.push(args);
      return {
        sent: 1
      };
    }
  };
}
test('property alerts retain public copy, use the combined unread count, and do not change read/history state', async () => {
  const f = fixture();
  await deliverNotification(notification, f);
  assert.equal(f.sent.length, 1);
  const [owner, payload, options] = f.sent[0];
  assert.equal(owner, 2);
  assert.equal(payload.title, notification.title);
  assert.equal(payload.body, notification.message);
  assert.equal(payload.badge, 7);
  assert.equal(payload.data.notificationId, '7');
  assert.equal(payload.data.link, '/properties/123');
  assert.equal(payload.channelId, 'general');
  assert.equal(options.q, f.q);
  assert.equal(f.queries.some(([sql]) => /UPDATE|DELETE|INSERT/.test(sql)), false);
});
test('each notification category honours its existing choice without disabling other categories', async () => {
  for (const [type, key] of [['message', 'pushMessages'], ['dispute_update', 'pushMessages'], ['missed_call', 'pushMessages'], ['payment_confirmation', 'pushPayments'], ['application_approved', 'pushApplications'], ['booking_confirmation', 'pushBookings'], ['staff_verification', 'adminAlerts'], ['property_posted', 'updateAlerts']]) {
    assert.equal(preferenceFor({
      type
    }), key);
    const f = fixture({
      [key]: false
    });
    assert.equal((await deliverNotification({
      ...notification,
      type
    }, f)).disabled, true);
    assert.equal(f.sent.length, 0);
  }
  const f = fixture({
    pushPayments: false
  });
  await deliverNotification(notification, f);
  assert.equal(f.sent.length, 1);
});
test('direct messages keep their existing destination and booking alerts reach the existing booking route', async () => {
  const f = fixture();
  await sendOrdinaryPush(2, {
    title: 'Test',
    body: 'Hello',
    channelId: 'messages',
    data: {
      screen: 'Messages',
      senderId: '3'
    },
    badge: 5
  }, f);
  assert.equal(f.sent[0][1].badge, 5);
  assert.equal(f.sent[0][1].data.screen, 'Messages');
  await deliverNotification({
    ...notification,
    type: 'booking_confirmation',
    link: null,
    related_id: 23,
    related_type: 'fumigation_cleaning_booking'
  }, f);
  assert.equal(f.sent[1][1].data.link, '/fumigation-cleaning/bookings/23');
});
test('database/provider failure cannot delete a saved alert or escape as an unhandled error', async () => {
  const f = fixture();
  f.sendPush = async () => {
    throw Error('offline');
  };
  assert.equal((await deliverNotification(notification, f)).sent, 0);
  assert.equal((await deliverNotification(null, f)).sent, 0);
  assert.equal(f.queries.some(([sql]) => /UPDATE|DELETE/.test(sql)), false);
});
test('the central writer dispatches once for a new record and never for a duplicate', async () => {
  const delivered = [];
  let duplicate = false;
  const module = {
    exports: {}
  };
  const q = {
    query: async () => ({
      rows: duplicate ? [] : [notification]
    })
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../config/utils/notificationService'), 'utf8'), {
    module,
    exports: module.exports,
    process: {
      env: {
        NODE_ENV: 'test'
      }
    },
    require: name => name.includes('notificationDelivery') ? {
      deliverNotification: async n => delivered.push(n)
    } : name.includes('database') ? q : {
      error() {},
      warn() {}
    }
  });
  await module.exports.createNotification(2, 'property_posted', 'Title', 'Body', '/properties/123', 'one-event');
  duplicate = true;
  assert.equal(await module.exports.createNotification(2, 'property_posted', 'Title', 'Body', '/properties/123', 'one-event'), null);
  assert.equal(delivered.length, 1);
});
test('all six existing booking/general writers dispatch their saved record while retaining related fields', async () => {
  const sent = [],
    inserted = [];
  const module = {
    exports: {}
  };
  let next = 1;
  const q = {
    query: async (sql, args) => {
      if (sql.includes('SELECT full_name')) return {
        rows: [{
          full_name: 'Test Customer',
          email: 'test@example.invalid'
        }]
      };
      if (sql.includes('INSERT INTO notifications')) {
        assert.ok(sql.includes('RETURNING *'));
        const [user_id, title, message, type, related_id, related_type] = args;
        const row = {
          id: next++,
          user_id,
          title,
          message,
          type,
          related_id,
          related_type
        };
        inserted.push(row);
        return {
          rows: [row]
        };
      }
      return {
        rows: []
      };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/notificationService'), 'utf8'), {
    module,
    exports: module.exports,
    Intl,
    require: name => name.includes('database') ? q : name.includes('notificationDelivery') ? {
      deliverNotification: async row => sent.push(row)
    } : name.includes('mailer') ? {
      sendEmail: async () => {}
    } : name.includes('frontendUrl') ? {
      getFrontendUrl: () => 'https://example.invalid'
    } : {
      error() {}
    }
  });
  const svc = module.exports,
    data = {
      tenantId: 2,
      bookingId: 23,
      bookingReference: 'TEST',
      serviceType: 'cleaning',
      amount: 100,
      paymentReference: 'TEST',
      newStatus: 'confirmed',
      providerName: 'Test provider',
      contactPerson: 'Dispatch',
      cancellationFee: 0
    };
  for (const name of ['sendBookingConfirmation', 'sendBookingCancellation', 'sendPaymentConfirmation', 'sendBookingStatusUpdate', 'sendProviderAssignment']) assert.equal(await svc[name](data), true);
  assert.equal(await svc.sendNotification(2, 'Test', 'Body', 'general', 23, 'test_record'), true);
  assert.equal(sent.length, 6);
  assert.equal(inserted.length, 6);
  assert.equal(sent[0].related_type, 'fumigation_cleaning_booking');
  assert.equal(sent[5].related_type, 'test_record');
});
test('staff identity and missed-call inserts also dispatch only after returning their saved ID', () => {
  const staff = fs.readFileSync(require.resolve('../services/staffIdentityService'), 'utf8'),
    calls = fs.readFileSync(require.resolve('../config/utils/realtimeSocket'), 'utf8');
  assert.match(staff, /VALUES \(\$1, \$2, \$3, \$4, \$5, FALSE, NOW\(\)\) RETURNING \*/);
  assert.ok(staff.includes('deliverNotification(saved.rows[0])'));
  assert.ok(calls.includes('deliverNotification({ ...notif, user_id: receiverId })'));
});
