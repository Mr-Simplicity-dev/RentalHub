const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const roundUp2 = (value) => Math.ceil((Number(value || 0) + Number.EPSILON) * 100) / 100;

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeRentEstimate = (input = {}) => {
  const rentAmount = num(input.rent_amount, 0);
  const frequency = String(input.payment_frequency || 'yearly') === 'monthly' ? 'monthly' : 'yearly';
  const monthlyIncome = num(input.monthly_income, 0);
  const ratioPct = num(input.ratio_pct, 33);
  const monthsToGoal = num(input.months_to_goal, 0);

  if (rentAmount <= 0) return null;

  const upfrontMonths = Math.max(1, Math.round(num(input.upfront_months, 0)) || (frequency === 'yearly' ? 12 : 1));

  const monthlyEquivalent = frequency === 'yearly' ? round2(rentAmount / 12) : rentAmount;
  const rentDueAtMoveIn = round2(monthlyEquivalent * upfrontMonths);

  const agentFeePct = num(input.fees?.agent_fee_pct, 0);
  const legalFeePct = num(input.fees?.legal_fee_pct, 0);
  const cautionMonths = num(input.fees?.caution_months, 0);
  const agreementFee = num(input.fees?.agreement_fee, 0);
  const serviceCharge = num(input.fees?.service_charge, 0);

  const agentFee = round2((rentDueAtMoveIn * agentFeePct) / 100);
  const legalFee = round2((rentDueAtMoveIn * legalFeePct) / 100);
  const cautionDeposit = round2(monthlyEquivalent * cautionMonths);
  const feesTotal = round2(agentFee + legalFee + cautionDeposit + agreementFee + serviceCharge);
  const moveInTotal = round2(rentDueAtMoveIn + feesTotal);

  const affordability = {
    enabled: monthlyIncome > 0,
    monthly_income: monthlyIncome,
    ratio_pct: ratioPct,
    affordable_monthly: round2(monthlyIncome * (ratioPct / 100)),
    affordable_annual_rent: round2(monthlyIncome * (ratioPct / 100) * 12),
    monthly_equivalent_within_budget: monthlyIncome > 0 ? monthlyEquivalent <= round2(monthlyIncome * (ratioPct / 100)) : null,
  };

  const savings = {
    enabled: monthsToGoal > 0,
    months_to_goal: monthsToGoal,
    monthly_savings_required: monthsToGoal > 0 ? roundUp2(moveInTotal / monthsToGoal) : null,
  };

  return {
    inputs: {
      rent_amount: rentAmount,
      payment_frequency: frequency,
      upfront_months: upfrontMonths,
      monthly_income: monthlyIncome,
      ratio_pct: ratioPct,
      months_to_goal: monthsToGoal,
    },
    frequency,
    monthly_equivalent: monthlyEquivalent,
    upfront_months: upfrontMonths,
    rent_due_at_move_in: rentDueAtMoveIn,
    fees: {
      agent_fee: agentFee,
      legal_fee: legalFee,
      caution_deposit: cautionDeposit,
      agreement_fee: agreementFee,
      service_charge: serviceCharge,
      agent_fee_pct: agentFeePct,
      legal_fee_pct: legalFeePct,
      caution_months: cautionMonths,
    },
    fees_total: feesTotal,
    move_in_total: moveInTotal,
    affordability,
    savings,
  };
};

module.exports = { computeRentEstimate, round2, roundUp2, num };
