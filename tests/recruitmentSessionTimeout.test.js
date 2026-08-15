const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const recruitmentService = require('../services/recruitmentService');

const evaluate = recruitmentService.__test.evaluateInterviewSessionState;

const nowMs = Date.parse('2026-08-14T12:00:00.000Z');
const minutesAgo = (minutes) => new Date(nowMs - minutes * 60 * 1000).toISOString();
const minutesFromNow = (minutes) => new Date(nowMs + minutes * 60 * 1000).toISOString();

const activeBase = {
  interview_started_at: minutesAgo(10),
  interview_session_expires_at: minutesFromNow(50),
  interview_last_ping_at: minutesAgo(1),
  interview_abandoned_at: null,
  interview_completed: false,
};

test('an active interview session passes evaluation', () => {
  const result = evaluate(activeBase, nowMs);
  assert.deepEqual(result, { active: true });
});

test('a session without an interview start is not enforced', () => {
  const result = evaluate({ ...activeBase, interview_started_at: null }, nowMs);
  assert.deepEqual(result, { active: true });
});

test('a session past its expiry is rejected as expired', () => {
  const result = evaluate(
    { ...activeBase, interview_session_expires_at: minutesAgo(1) },
    nowMs
  );
  assert.equal(result.active, false);
  assert.equal(result.status, 'expired');
  assert.match(result.message, /expired/i);
});

test('a session whose heartbeat is older than the inactivity limit is abandoned', () => {
  const result = evaluate(
    { ...activeBase, interview_last_ping_at: minutesAgo(10) },
    nowMs
  );
  assert.equal(result.active, false);
  assert.equal(result.status, 'abandoned');
  assert.match(result.message, /inactivit/i);
});

test('abandonment takes precedence over an open expiry window', () => {
  const result = evaluate(
    {
      ...activeBase,
      interview_last_ping_at: minutesAgo(10),
      interview_session_expires_at: minutesFromNow(50),
    },
    nowMs
  );
  assert.equal(result.status, 'abandoned');
});

test('session expiry takes precedence over a recent heartbeat', () => {
  const result = evaluate(
    {
      ...activeBase,
      interview_session_expires_at: minutesAgo(1),
      interview_last_ping_at: minutesAgo(0.1),
    },
    nowMs
  );
  assert.equal(result.status, 'expired');
});

test('a previously abandoned session stays locked', () => {
  const result = evaluate(
    { ...activeBase, interview_abandoned_at: minutesAgo(30) },
    nowMs
  );
  assert.equal(result.active, false);
  assert.equal(result.status, 'abandoned');
});

test('a completed session is never re-entered', () => {
  const result = evaluate({ ...activeBase, interview_completed: true }, nowMs);
  assert.equal(result.active, false);
  assert.equal(result.status, 'completed');
});

test('inactivity within the limit is tolerated', () => {
  const result = evaluate(
    { ...activeBase, interview_last_ping_at: minutesAgo(4.9) },
    nowMs
  );
  assert.deepEqual(result, { active: true });
});

test('a missing application is treated as inactive', () => {
  const result = evaluate(null, nowMs);
  assert.equal(result.active, false);
});
