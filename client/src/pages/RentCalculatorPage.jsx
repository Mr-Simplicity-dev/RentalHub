import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaCalculator } from 'react-icons/fa';
import RentCalculatorPanel from '../components/dashboard/RentCalculatorPanel';
import { useTranslation } from 'react-i18next';

const RentCalculatorPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const initialValues = {
    rent_amount: searchParams.get('rent') || '',
    payment_frequency: searchParams.get('freq') === 'monthly' ? 'monthly' : 'yearly',
    upfront_months: searchParams.get('upfront') || '',
    monthly_income: searchParams.get('income') || '',
    ratio_pct: searchParams.get('ratio') || '33',
    months_to_goal: searchParams.get('months') || '',
    state_id: searchParams.get('state') || '',
    lga_id: searchParams.get('lga') || '',
  };

  return (
    <div className="bg-gradient-to-b from-primary-50/60 via-white to-white min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 bg-white border border-primary-100 text-primary-700 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
            <FaCalculator /> {t('dashboardUx.rent_calculator_title')}
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {t('dashboardUx.rent_calculator_heading')}
          </h1>
          <p className="mt-3 text-gray-500 leading-relaxed">
            {t('dashboardUx.rent_calculator_intro')}
          </p>
        </div>

        <RentCalculatorPanel initialValues={initialValues} mode="public" />
      </div>
    </div>
  );
};

export default RentCalculatorPage;
