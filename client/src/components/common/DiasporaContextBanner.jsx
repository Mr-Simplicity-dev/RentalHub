import React from 'react';
import { FaGlobeAfrica } from 'react-icons/fa';

const countryName = (code) => {
  if (!code) return '';
  return String(code).toUpperCase();
};

/**
 * Shown to diaspora users (registered from outside Nigeria) on their dashboard.
 */
const DiasporaContextBanner = ({ diasporaCountry, billingCountry, cardBrand }) => {
  const country = countryName(diasporaCountry);
  if (!country) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <FaGlobeAfrica className="text-xl" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">
            Diaspora account · renting from {country}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Your registration was quoted in USD and charged in Naira at the live FX rate
            {cardBrand ? ` (funded with a ${cardBrand} card${billingCountry && String(billingCountry).toUpperCase() !== 'NG' ? ` issued in ${countryName(billingCountry)}` : ''})` : ''}.
            All property payments on this dashboard are in Naira (₦).
          </p>
        </div>
      </div>
    </div>
  );
};

export default DiasporaContextBanner;
