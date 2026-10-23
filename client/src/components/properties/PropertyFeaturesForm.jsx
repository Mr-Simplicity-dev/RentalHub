import React, { useMemo, useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import {
  FEATURE_CATEGORIES,
  getFeaturesByCategory,
  getVisibleDetailFields,
} from '../../data/propertyFeatureSchema';

const EMPTY_FEATURE = { available: null, details: {}, description: '' };

const PropertyFeaturesForm = ({ value = {}, onChange }) => {
  const [open, setOpen] = useState({});
  const grouped = useMemo(() => {
    const byCategory = getFeaturesByCategory();
    return FEATURE_CATEGORIES.map((category) => ({
      ...category,
      features: byCategory[category.key] || [],
    })).filter((group) => group.features.length);
  }, []);

  const getFeature = (key) => {
    const current = value[key];
    if (!current || typeof current !== 'object') {
      return EMPTY_FEATURE;
    }
    return {
      available: current.available === true ? true : current.available === false ? false : null,
      details: current.details || {},
      description: current.description || '',
    };
  };

  const setFeature = (key, available) => {
    const next = { ...value };
    if (available === null) {
      next[key] = { ...EMPTY_FEATURE };
    } else if (available === true) {
      const existing = getFeature(key);
      next[key] = { available: true, details: existing.details, description: existing.description };
    } else {
      next[key] = { available: false, details: {}, description: '' };
    }
    onChange(next);
  };

  const setDetail = (key, detailKey, detailValue) => {
    const next = { ...value };
    const current = getFeature(key);
    next[key] = {
      ...current,
      available: current.available === null ? true : current.available,
      details: { ...(current.details || {}), [detailKey]: detailValue },
    };
    onChange(next);
  };

  const answeredCount = Object.values(value || {}).filter(
    (entry) => entry && typeof entry === 'object' && entry.available !== null
  ).length;

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <label className="block text-sm font-semibold text-gray-900">Property Features</label>
        <p className="mt-1 text-xs text-gray-500">
          Answer Yes / No / Unspecified. Only add details you can verify — unspecified is treated as
          unknown, never as “no”.
        </p>
        {answeredCount > 0 && (
          <p className="mt-1 text-xs text-gray-400">{answeredCount} feature(s) answered</p>
        )}
      </div>
      {grouped.map((group) => (
        <div key={group.key} className="rounded-lg border border-gray-100">
          <button
            type="button"
            onClick={() => setOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
            className="flex w-full items-center justify-between bg-gray-50 px-4 py-2"
          >
            <span className="text-sm font-medium">{group.label}</span>
            {open[group.key] ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          {open[group.key] && (
            <div className="divide-y divide-gray-100">
              {group.features.map((feature) => {
                const current = getFeature(feature.key);
                const details = current.details || {};
                const detailFields = getVisibleDetailFields(feature, details);

                return (
                  <div key={feature.key} className="space-y-3 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-gray-900">{feature.label}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFeature(feature.key, true)}
                          className={`rounded px-3 py-1 text-xs ${
                            current.available === true ? 'bg-green-600 text-white' : 'bg-gray-100'
                          }`}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeature(feature.key, false)}
                          className={`rounded px-3 py-1 text-xs ${
                            current.available === false ? 'bg-red-600 text-white' : 'bg-gray-100'
                          }`}
                        >
                          NO
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeature(feature.key, null)}
                          className={`rounded px-3 py-1 text-xs ${
                            current.available === null ? 'bg-gray-600 text-white' : 'bg-gray-100'
                          }`}
                        >
                          UNSPECIFIED
                        </button>
                      </div>
                    </div>
                    {current.available === true && detailFields.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 pl-2 sm:grid-cols-2">
                        {detailFields.map((field) => {
                          if (field.type === 'select') {
                            return (
                              <div key={field.key} className="space-y-1">
                                <label className="text-xs text-gray-600">{field.label}</label>
                                <select
                                  value={details[field.key] || ''}
                                  onChange={(event) => setDetail(feature.key, field.key, event.target.value)}
                                  className="input text-sm"
                                >
                                  <option value="">Select</option>
                                  {(field.options || []).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div key={field.key} className="space-y-1">
                              <label className="text-xs text-gray-600">{field.label}</label>
                              <input
                                type={field.type || 'text'}
                                min={field.min}
                                value={details[field.key] ?? ''}
                                onChange={(event) => setDetail(feature.key, field.key, event.target.value)}
                                className="input text-sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {current.available === true && (
                      <div className="space-y-1 pl-2">
                        <label className="text-xs text-gray-600">Notes (optional)</label>
                        <input
                          type="text"
                          value={current.description || ''}
                          maxLength={200}
                          placeholder="Anything else a tenant should know"
                          onChange={(event) => {
                            const next = { ...value };
                            next[feature.key] = { ...current, description: event.target.value };
                            onChange(next);
                          }}
                          className="input text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  );
};

export default PropertyFeaturesForm;
