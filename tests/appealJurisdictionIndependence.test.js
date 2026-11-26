const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const appealsRouter = require('../routes/appeals');

const { assertIndependentReviewer, appealDetailsQuery } = appealsRouter._appealScopeForTest;

test('appeal details derive jurisdiction from existing authoritative relationships', () => {
  const query = appealDetailsQuery();
  assert.match(query, /COALESCE\(ps\.state_name, target_state\.state_name, target_user\.assigned_state\) AS appeal_state/);
  assert.equal(query.includes('jurisdiction_state'), false);

  const schema = fs.readFileSync(path.join(__dirname, '..', 'migrations', '101_admin_appeals.sql'), 'utf8');
  assert.equal(schema.includes('jurisdiction_state'), false);
});

test('a reviewer involved in the original decision is rejected', () => {
  assert.throws(
    () => assertIndependentReviewer({ id: 5 }, { appellant_id: 5, original_decision_maker_id: 9 }),
    (error) => error.statusCode === 403
  );
  assert.throws(
    () => assertIndependentReviewer({ id: 9 }, { appellant_id: 5, original_decision_maker_id: 9 }),
    (error) => error.statusCode === 403
  );
});

test('an independent eligible reviewer is allowed', () => {
  assert.doesNotThrow(() => assertIndependentReviewer(
    { id: 12 },
    { appellant_id: 5, original_decision_maker_id: 9 }
  ));
});

test('the review endpoint enforces reviewer independence before updating an appeal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'appeals.js'), 'utf8');
  const start = source.indexOf("'/admin/appeals/:id/review'");
  assert.ok(start > -1);
  const review = source.slice(start, start + 12000);

  assert.match(review, /requireAppealReviewer/);
  assert.match(review, /assertIndependentReviewer\(req\.user, appeal\)/);
  assert.match(review, /await assertAppealJurisdiction\(client, req\.user, appeal\.appeal_state\)/);
  assert.match(review, /await lockAndAssertAppealTarget\(client, req\.user, appeal\)/);

  const guardIndex = review.indexOf('assertIndependentReviewer(req.user, appeal);');
  const jurisdictionIndex = review.indexOf('await assertAppealJurisdiction(client, req.user, appeal.appeal_state);');
  const updateIndex = review.indexOf('UPDATE admin_appeals');
  assert.ok(guardIndex > -1 && guardIndex < jurisdictionIndex);
  assert.ok(jurisdictionIndex < updateIndex);
});
