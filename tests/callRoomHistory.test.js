const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeUserCallRoomHistory } = require('../services/callRoomHistory');

test('normalizeUserCallRoomHistory keeps room events in a user-facing timeline', () => {
  const rows = [{
    id: 'evt-1',
    call_id: 'call-123',
    action: 'add_participant',
    actor_user_id: 2,
    target_user_id: 3,
    actor_name: 'Alice',
    target_name: 'Bob',
    property_title: 'Sunset Villa',
    metadata: { invitedBy: 'host' },
    created_at: '2026-10-12T00:00:00.000Z',
  }];

  const history = normalizeUserCallRoomHistory(rows);

  assert.equal(history.length, 1);
  assert.equal(history[0].callId, 'call-123');
  assert.equal(history[0].action, 'add_participant');
  assert.equal(history[0].propertyTitle, 'Sunset Villa');
  assert.deepEqual(history[0].metadata, { invitedBy: 'host' });
  assert.equal(history[0].actorName, 'Alice');
  assert.equal(history[0].targetName, 'Bob');
});
