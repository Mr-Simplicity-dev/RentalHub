const test = require('node:test');
const assert = require('node:assert/strict');

const socketModule = require('../config/utils/realtimeSocket');

test('addParticipantToRoom adds a valid participant and respects the room cap', () => {
  const first = socketModule.addParticipantToRoom(
    [
      { id: 1, name: 'Alice', role: 'tenant', status: 'connected' },
      { id: 2, name: 'Bob', role: 'tenant', status: 'connected' },
    ],
    { id: 3, name: 'Carol', role: 'agent', status: 'connected' }
  );

  assert.equal(first.added, true);
  assert.equal(first.participants.length, 3);
  assert.equal(first.participants.some((participant) => Number(participant.id) === 3), true);

  const fullRoom = socketModule.addParticipantToRoom(
    Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      name: `User ${index + 1}`,
      role: 'participant',
      status: 'connected',
    })),
    { id: 99, name: 'Overflow user', role: 'tenant', status: 'connected' }
  );

  assert.equal(fullRoom.added, false);
  assert.match(String(fullRoom.message || ''), /full|maximum/i);
});

test('removeParticipantFromRoom removes the selected user and keeps the rest intact', () => {
  const participants = [
    { id: 1, name: 'Alice', role: 'tenant', status: 'connected' },
    { id: 2, name: 'Bob', role: 'tenant', status: 'connected' },
    { id: 3, name: 'Carol', role: 'agent', status: 'connected' },
  ];

  const updated = socketModule.removeParticipantFromRoom(participants, 2);

  assert.equal(updated.removed, true);
  assert.equal(updated.participants.length, 2);
  assert.equal(updated.participants.some((participant) => Number(participant.id) === 2), false);
  assert.equal(updated.message, 'Participant removed from the call room.');
});

test('buildCallRoomEvent creates a timestamped evidence record for participant additions', () => {
  const event = socketModule.buildCallRoomEvent({
    callId: '6c08d7a3-7ddd-4ad8-b46d-cd7d933f4b4f',
    action: 'add_participant',
    actorUserId: 12,
    targetUserId: 29,
    metadata: { addedBy: 'tenant', propertyId: 44 },
  });

  assert.ok(event);
  assert.equal(event.action, 'add_participant');
  assert.equal(event.actorUserId, 12);
  assert.equal(event.targetUserId, 29);
  assert.equal(event.metadata.propertyId, 44);
  assert.ok(event.createdAt);
});

test('validateCallRoomParticipantAccess blocks unrelated property calls', async () => {
  const originalQuery = require('../config/middleware/database').query;
  require('../config/middleware/database').query = async (sql, params) => {
    if (sql.includes('FROM properties')) {
      return { rows: [{ landlord_id: 10 }] };
    }

    return { rows: [] };
  };

  try {
    const result = await socketModule.validateCallRoomParticipantAccess({
      propertyId: 7,
      userId: 20,
      targetUserId: 30,
    });

    assert.equal(result.allowed, false);
    assert.match(String(result.message || ''), /landlord|tenant|property/i);
  } finally {
    require('../config/middleware/database').query = originalQuery;
  }
});

test('transferCallHost promotes a participant to host and keeps one active host', () => {
  const participants = [
    { id: 10, name: 'Host', role: 'host', status: 'connected' },
    { id: 20, name: 'Guest', role: 'participant', status: 'connected' },
    { id: 30, name: 'Other', role: 'participant', status: 'connected' },
  ];

  const updated = socketModule.transferCallHost(participants, 10, 30);

  assert.equal(updated.transferred, true);
  assert.equal(updated.participants.find((participant) => Number(participant.id) === 30).role, 'host');
  assert.equal(updated.participants.find((participant) => Number(participant.id) === 10).role, 'participant');
  assert.match(String(updated.message || ''), /host/i);
});
