import React, { useMemo, useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaQuestionCircle } from 'react-icons/fa';
import { summariseStructuredFeatures } from '../../data/propertyFeatureSchema';

const StateBadge = ({ state }) => {
  if (state === true) {
    return <FaCheckCircle className="mt-0.5 shrink-0 text-green-500" aria-label="Available" />;
  }
  if (state === false) {
    return <FaTimesCircle className="mt-0.5 shrink-0 text-red-400" aria-label="Not available" />;
  }
  return <FaQuestionCircle className="mt-0.5 shrink-0 text-gray-400" aria-label="Unspecified" />;
};

const PropertyFeaturesDisplay = ({ structuredFeatures, className = '', showUnspecified = false }) => {
  const [showAll, setShowAll] = useState(false);
  const summary = useMemo(
    () => summariseStructuredFeatures(structuredFeatures),
    [structuredFeatures]
  );

  if (!summary.answeredCount) {
    return null;
  }

  const includeUnspecified = showAll || showUnspecified;

  return (
    <section className={`mb-6 ${className}`}>
      <h2 className="mb-3 text-xl font-semibold">Property Features</h2>
      <p className="mb-3 text-xs text-gray-500">
        Reported by the landlord. “Unspecified” means not confirmed — not that it is missing.
      </p>

      {summary.available.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {summary.available.map((feature) => (
            <div key={feature.key} className="rounded-lg border border-green-100 bg-green-50/50 p-3">
              <div className="flex items-start gap-2">
                <StateBadge state={true} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{feature.label}</p>
                  {feature.details.map((detail) => (
                    <p key={detail.key} className="text-xs text-gray-600">
                      {detail.label}: {detail.value}
                    </p>
                  ))}
                  {feature.description && (
                    <p className="mt-1 text-xs italic text-gray-500">{feature.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.unavailable.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-gray-700">Not available</p>
          <div className="flex flex-wrap gap-2">
            {summary.unavailable.map((feature) => (
              <span
                key={feature.key}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
              >
                <StateBadge state={false} />
                {feature.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {includeUnspecified && summary.unspecified.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-gray-700">Unspecified</p>
          <div className="flex flex-wrap gap-2">
            {summary.unspecified.map((feature) => (
              <span
                key={feature.key}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500"
              >
                <StateBadge state={null} />
                {feature.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!showUnspecified && summary.unspecified.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-3 text-xs font-medium text-blue-600 hover:underline"
        >
          {showAll
            ? 'Hide unspecified features'
            : `Show ${summary.unspecified.length} unspecified feature(s)`}
        </button>
      )}
    </section>
  );
};

export default PropertyFeaturesDisplay;
