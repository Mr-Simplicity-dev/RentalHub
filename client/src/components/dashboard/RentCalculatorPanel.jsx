import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaPiggyBank,
  FaCheckCircle,
  FaTimesCircle,
  FaWallet,
  FaArrowRight,
  FaInfoCircle,
  FaCalculator,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../common/Loader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

const formatNgn = (value) =>
  `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const SectionHeading = ({ icon, title, subtitle }) => (
  <div className="flex items-start gap-3 mb-5">
    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center text-lg shrink-0">
      {icon}
    </div>
    <div>
      <h2 className="text-lg font-bold text-gray-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const FeeRow = ({ label, hint, value }) => (
  <div className="flex items-center justify-between py-2.5">
    <div>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
    <p className="text-sm font-semibold text-gray-700">{formatNgn(value)}</p>
  </div>
);

const RentCalculatorPanel = ({ initialValues = {}, mode = 'public', onPlanReady }) => {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [form, setForm] = useState({
    rent_amount: initialValues.rent_amount || '',
    payment_frequency: initialValues.payment_frequency === 'monthly' ? 'monthly' : 'yearly',
    upfront_months: initialValues.upfront_months || '',
    monthly_income: initialValues.monthly_income || '',
    ratio_pct: initialValues.ratio_pct || '33',
    months_to_goal: initialValues.months_to_goal || '',
    state_id: initialValues.state_id || '',
    lga_id: initialValues.lga_id || '',
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canCalculate = useMemo(() => {
    const rent = Number(form.rent_amount);
    return Number.isFinite(rent) && rent > 0;
  }, [form.rent_amount]);

  const calculate = useCallback(async () => {
    if (!canCalculate) {
      setError(t('dashboardUx.enter_rent'));
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/rent-calculator/estimate', {
        rent_amount: Number(form.rent_amount),
        payment_frequency: form.payment_frequency,
        upfront_months: form.upfront_months ? Number(form.upfront_months) : undefined,
        state_id: form.state_id ? Number(form.state_id) : undefined,
        lga_id: form.lga_id ? Number(form.lga_id) : undefined,
        monthly_income: form.monthly_income ? Number(form.monthly_income) : undefined,
        ratio_pct: form.ratio_pct ? Number(form.ratio_pct) : undefined,
        months_to_goal: form.months_to_goal ? Number(form.months_to_goal) : undefined,
      });
      if (data.success) setResult(data.data);
      else setError(data.message || t('dashboardUx.calculation_failed'));
    } catch (err) {
      setError(err.response?.data?.message || t('dashboardUx.calculator_unreachable'));
    } finally {
      setLoading(false);
    }
  }, [canCalculate, form]);

  useEffect(() => {
    if (canCalculate) calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const afford = result?.affordability?.enabled ? result.affordability : null;
  const withinBudget = afford?.monthly_equivalent_within_budget;

  return (
    <div className="grid gap-6 lg:grid-cols-5 items-start">
      {/* Form */}
      <section className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <SectionHeading icon={<FaCalculator />} title={t('dashboardUx.rent_details')} subtitle={t('dashboardUx.rent_details_subtitle')} />

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('dashboardUx.rent_amount')}</label>
            <input
              type="number"
              min="1"
              step="1000"
              value={form.rent_amount}
              onChange={set('rent_amount')}
              placeholder="1200000"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t('dashboardUx.rent_per')}</label>
            <div className="grid grid-cols-2 gap-2">
              {['yearly', 'monthly'].map((freq) => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, payment_frequency: freq }))}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    form.payment_frequency === freq
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                  }`}
                >
                  {freq === 'yearly' ? t('dashboardUx.per_year') : t('dashboardUx.per_month')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {t('dashboardUx.upfront_months')}
            </label>
            <select
              value={form.upfront_months || (form.payment_frequency === 'yearly' ? '12' : '1')}
              onChange={set('upfront_months')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {form.payment_frequency === 'yearly' ? (
                <>
                  <option value="12">12 months (1 year)</option>
                  <option value="24">24 months (2 years)</option>
                  <option value="6">6 months</option>
                </>
              ) : (
                <>
                  <option value="1">1 month</option>
                  <option value="2">2 months</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </>
              )}
            </select>
            {form.payment_frequency === 'yearly' && (
              <p className="mt-1 text-xs text-gray-400">{t('dashboardUx.yearly_due_hint')}</p>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">{t('dashboardUx.monthly_income')}</p>
            <input
              type="number"
              min="0"
              step="10000"
              value={form.monthly_income}
              onChange={set('monthly_income')}
              placeholder="e.g. 400000"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          {form.monthly_income && (
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <label className="font-semibold text-gray-700">{t('dashboardUx.rent_share')}</label>
                <span className="text-primary-700 font-bold">{form.ratio_pct}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="70"
                value={form.ratio_pct || 33}
                onChange={set('ratio_pct')}
                className="w-full accent-primary-600"
              />
              <p className="text-xs text-gray-400 mt-1">{t('dashboardUx.rent_share_hint')}</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {t('dashboardUx.months_until_due')}
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={form.months_to_goal}
              onChange={set('months_to_goal')}
              placeholder="e.g. 12"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">{t('dashboardUx.months_until_due_hint')}</p>
          </div>

          <button
            type="button"
            onClick={calculate}
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold py-3 text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-60"
          >
            {loading ? t('dashboardUx.calculating') : t('dashboardUx.calculate')}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </section>

      {/* Results */}
      <section className="lg:col-span-3 space-y-5">
        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex items-center justify-center">
            <Loader />
          </div>
        )}

        {!loading && !result && !error && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
            {t('dashboardUx.enter_amount_prompt')}
          </div>
        )}

        {!loading && result && (
          <>
            {/* Headline: monthly cost */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-lg text-white p-6 sm:p-7">
              <p className="text-primary-100 text-sm font-semibold uppercase tracking-wide">
                {result.frequency === 'yearly'
                  ? t('dashboardUx.monthly_equivalent_yearly', { amount: `₦${Number(result.inputs.rent_amount).toLocaleString()}` })
                  : t('dashboardUx.monthly_rent')}
              </p>
              <p className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight">
                {formatNgn(result.monthly_equivalent)}
              </p>
              <p className="mt-2 text-primary-100 text-sm">
                {t('dashboardUx.upfront_summary', { months: result.upfront_months, amount: formatNgn(result.rent_due_at_move_in) })}
              </p>
            </div>

            {afford && (
              <div
                className={`rounded-2xl border p-5 flex items-start gap-4 ${
                  withinBudget ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    withinBudget ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                  }`}
                >
                  {withinBudget ? <FaCheckCircle /> : <FaTimesCircle />}
                </div>
                <div>
                  <p className="font-bold text-gray-900">
                    {withinBudget ? t('dashboardUx.fits_budget') : t('dashboardUx.above_budget')}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    At {afford.ratio_pct}% of {formatNgn(afford.monthly_income)}/month, you can comfortably put{' '}
                    <span className="font-semibold">{formatNgn(afford.affordable_monthly)}</span> toward rent each
                    month — about <span className="font-semibold">{formatNgn(afford.affordable_annual_rent)}</span>{' '}
                    per year.
                  </p>
                </div>
              </div>
            )}

            {/* Move-in total */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeading
                icon={<FaWallet />}
                title={t('dashboardUx.money_day_one')}
                subtitle={t('dashboardUx.usual_fees')}
              />
              <div className="divide-y divide-gray-100">
                <FeeRow label={`Rent (${result.upfront_months} months)`} value={result.rent_due_at_move_in} />
                <FeeRow
                  label={t('dashboardUx.agent_fee')}
                  hint={`${result.fees.agent_fee_pct}% of the rent due`}
                  value={result.fees.agent_fee}
                />
                <FeeRow
                  label={t('dashboardUx.legal_fee')}
                  hint={`${result.fees.legal_fee_pct}% of the rent due`}
                  value={result.fees.legal_fee}
                />
                <FeeRow
                  label={t('dashboardUx.caution_deposit')}
                  hint={`${result.fees.caution_months} month(s) of rent (refundable)`}
                  value={result.fees.caution_deposit}
                />
                <FeeRow label={t('dashboardUx.agreement_fee')} value={result.fees.agreement_fee} />
                {Number(result.fees.service_charge) > 0 && (
                  <FeeRow label={t('dashboardUx.service_charge')} value={result.fees.service_charge} />
                )}
                <div className="flex items-center justify-between py-3">
                  <p className="text-base font-bold text-gray-900">{t('dashboardUx.move_in_total')}</p>
                  <p className="text-xl font-extrabold text-primary-700">{formatNgn(result.move_in_total)}</p>
                </div>
              </div>
              {result.fees_config && (
                <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
                  <FaInfoCircle />
                  Fee rates shown are the current {result.fees_config.is_default ? 'default' : 'location'} settings
                  and may vary by landlord.
                </p>
              )}
            </div>

            {/* Rent savings */}
            {result.savings?.enabled && (
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl shadow-lg text-white p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-lg">
                    <FaPiggyBank />
                  </div>
                  <div>
                    <p className="font-bold">{t('dashboardUx.rent_savings')}</p>
                    <p className="text-emerald-100 text-sm">
                      {result.savings.months_to_goal} month(s) until your target
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-3xl font-extrabold">
                  {formatNgn(result.savings.monthly_savings_required)}
                  <span className="text-base font-semibold text-emerald-100"> / month</span>
                </p>
                <p className="text-emerald-100 text-sm mt-1">
                  Setting this aside monthly covers the full {formatNgn(result.move_in_total)} by your due date.
                </p>
              </div>
            )}

            {mode === 'public' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/register'}
                  className="flex-1 rounded-xl border-2 border-primary-600 text-primary-700 font-bold py-3 text-sm text-center hover:bg-primary-50 transition-colors"
                >
                  {t('dashboardUx.create_savings')}
                </Link>
                <Link
                  to="/properties"
                  className="flex-1 rounded-xl bg-gray-900 text-white font-bold py-3 text-sm text-center hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  {t('dashboardUx.browse_properties')} <FaArrowRight />
                </Link>
              </div>
            )}

            {mode === 'savings' && onPlanReady && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onPlanReady({
                      target_amount: result.rent_due_at_move_in,
                      monthly_amount: result.monthly_equivalent,
                    })
                  }
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold py-3 text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <FaPiggyBank /> Start a rent savings plan for this amount
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default RentCalculatorPanel;
