const test = require('node:test');
const assert = require('node:assert');
const { computeRentEstimate, round2 } = require('../services/rentCalculatorMath');

const GLOBAL_FEES = {
  agent_fee_pct: 10,
  legal_fee_pct: 10,
  caution_months: 1,
  agreement_fee: 5000,
  service_charge: 0,
};

test('rent calculator: yearly listing converts to a monthly equivalent', () => {
  const result = computeRentEstimate({
    rent_amount: 1200000,
    payment_frequency: 'yearly',
    fees: GLOBAL_FEES,
  });

  assert.ok(result);
  assert.strictEqual(result.monthly_equivalent, 100000);
  assert.strictEqual(result.rent_due_at_move_in, 1200000);
  assert.strictEqual(result.move_in_total, 1200000 + 120000 + 120000 + 100000 + 5000);
});

test('rent calculator: monthly listing keeps the monthly figure', () => {
  const result = computeRentEstimate({
    rent_amount: 85000,
    payment_frequency: 'monthly',
    upfront_months: 6,
    fees: GLOBAL_FEES,
  });

  assert.ok(result);
  assert.strictEqual(result.monthly_equivalent, 85000);
  assert.strictEqual(result.upfront_months, 6);
  assert.strictEqual(result.rent_due_at_move_in, 510000);
});

test('rent calculator: itemised fee breakdown sums to the move-in total', () => {
  const result = computeRentEstimate({
    rent_amount: 2400000,
    payment_frequency: 'yearly',
    fees: { agent_fee_pct: 10, legal_fee_pct: 10, caution_months: 2, agreement_fee: 5000, service_charge: 20000 },
  });

  const feeSum = round2(
    result.fees.agent_fee + result.fees.legal_fee + result.fees.caution_deposit + result.fees.agreement_fee + result.fees.service_charge
  );

  assert.strictEqual(result.fees.agent_fee, 240000);
  assert.strictEqual(result.fees.legal_fee, 240000);
  assert.strictEqual(result.fees.caution_deposit, 400000);
  assert.strictEqual(feeSum, result.fees_total);
  assert.strictEqual(result.move_in_total, 2400000 + feeSum);
});

test('rent calculator: affordability uses income times ratio', () => {
  const withinBudget = computeRentEstimate({
    rent_amount: 1200000,
    payment_frequency: 'yearly',
    monthly_income: 500000,
    ratio_pct: 33,
    fees: GLOBAL_FEES,
  });

  assert.strictEqual(withinBudget.affordability.affordable_monthly, 165000);
  assert.strictEqual(withinBudget.affordability.affordable_annual_rent, 1980000);
  assert.strictEqual(withinBudget.affordability.monthly_equivalent_within_budget, true);

  const overBudget = computeRentEstimate({
    rent_amount: 3000000,
    payment_frequency: 'yearly',
    monthly_income: 500000,
    ratio_pct: 33,
    fees: GLOBAL_FEES,
  });

  assert.strictEqual(overBudget.affordability.monthly_equivalent_within_budget, false);
});

test('rent calculator: affordability is disabled without income', () => {
  const result = computeRentEstimate({
    rent_amount: 1000000,
    payment_frequency: 'yearly',
    fees: GLOBAL_FEES,
  });

  assert.strictEqual(result.affordability.enabled, false);
  assert.strictEqual(result.affordability.monthly_equivalent_within_budget, null);
});

test('rent calculator: savings-to-goal is rounded up to guarantee the target', () => {
  const result = computeRentEstimate({
    rent_amount: 1200000,
    payment_frequency: 'yearly',
    months_to_goal: 10,
    fees: GLOBAL_FEES,
  });

  assert.ok(result);
  assert.strictEqual(result.savings.enabled, true);
  assert.strictEqual(result.savings.months_to_goal, 10);
  assert.ok(result.savings.monthly_savings_required * 10 >= result.move_in_total);
});

test('rent calculator: rejects non-positive rent', () => {
  assert.strictEqual(computeRentEstimate({ rent_amount: 0, fees: GLOBAL_FEES }), null);
  assert.strictEqual(computeRentEstimate({ rent_amount: -5, fees: GLOBAL_FEES }), null);
});
