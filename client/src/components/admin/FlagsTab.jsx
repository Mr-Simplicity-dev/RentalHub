import React from "react";

const FLAG_META = {
  allow_registration: {
    label: "Allow Registration",
    description: "Allow new tenants and landlords to register.",
  },
  tenant_registration_payment: {
    label: "Tenant Registration Payment",
    description: "Require N2,500 payment before tenant account creation.",
  },
  landlord_registration_payment: {
    label: "Landlord Registration Payment",
    description: "Require N5,000 payment before landlord account creation.",
  },
  property_alert_payment: {
    label: "Property Alert Payment",
    description: 'Require N5,000 payment before processing "Notify me when available" requests.',
  },
  nin_number: {
    label: "NIN Requirement",
    description: "Require and allow NIN collection for local registrations.",
  },
  passport_number: {
    label: "Passport Requirement",
    description: "Require and allow passport collection for foreign registrations.",
  },
};

const REGISTRATION_FLAG_ORDER = [
  "allow_registration",
  "tenant_registration_payment",
  "landlord_registration_payment",
  "nin_number",
  "passport_number",
];

const PLATFORM_PRIORITY_FLAG_ORDER = [
  "property_alert_payment",
];

const FlagsTab = ({ flags, toggleFlag }) => {
  const mergedFlags = React.useMemo(() => {
    const map = new Map((flags || []).map((flag) => [flag.key, { ...flag }]));

    Object.entries(FLAG_META).forEach(([key, meta]) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          enabled: false,
          description: meta.description,
        });
      }
    });

    return Array.from(map.values());
  }, [flags]);

  const orderedFlags = React.useMemo(() => {
    const weight = new Map(
      [...REGISTRATION_FLAG_ORDER, ...PLATFORM_PRIORITY_FLAG_ORDER].map(
        (key, index) => [key, index]
      )
    );

    return [...mergedFlags].sort((a, b) => {
      const aWeight = weight.has(a.key) ? weight.get(a.key) : Number.MAX_SAFE_INTEGER;
      const bWeight = weight.has(b.key) ? weight.get(b.key) : Number.MAX_SAFE_INTEGER;

      if (aWeight !== bWeight) {
        return aWeight - bWeight;
      }

      return a.key.localeCompare(b.key);
    });
  }, [mergedFlags]);

  const registrationFlags = orderedFlags.filter((flag) =>
    REGISTRATION_FLAG_ORDER.includes(flag.key)
  );
  const platformFlags = orderedFlags.filter(
    (flag) => !REGISTRATION_FLAG_ORDER.includes(flag.key)
  );

  const renderFlagRow = (f) => {
    const meta = FLAG_META[f.key];

    return (
      <div
        key={f.key}
        className="flex items-center justify-between border border-soft rounded-lg px-4 py-3 hover:bg-gray-50 transition"
      >
        <div>
          <p className="font-medium">
            {meta?.label || f.key}
          </p>

          <p className="text-xs text-gray-400">
            {f.key}
          </p>

          <p className="text-sm text-gray-500">
            {meta?.description || f.description}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              f.enabled
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {f.enabled ? "Enabled" : "Disabled"}
          </span>

          <button
            type="button"
            onClick={() => toggleFlag(f.key, !f.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              f.enabled
                ? "bg-green-500"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                f.enabled
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6 animate-fadeIn">

      <div className="mb-6">

        <h3 className="text-lg font-semibold">
          Platform Feature Flags
        </h3>

        <p className="text-sm text-gray-500">
          Enable or disable platform-wide features in real time.
        </p>

      </div>

      <div className="space-y-4">

        {orderedFlags.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            No feature flags configured
          </div>
        )}

        {registrationFlags.length > 0 && (
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-gray-900">
                Registration Controls
              </h4>

              <p className="text-sm text-gray-500">
                Manage account creation requirements and payment rules.
              </p>
            </div>

            {registrationFlags.map(renderFlagRow)}
          </div>
        )}

        {platformFlags.length > 0 && (
          <div className="space-y-3 pt-2">
            <div>
              <h4 className="font-semibold text-gray-900">
                Platform Controls
              </h4>

              <p className="text-sm text-gray-500">
                Manage the remaining platform-wide switches.
              </p>
            </div>

            {platformFlags.map(renderFlagRow)}
          </div>
        )}

      </div>

    </div>
  );
};

export default FlagsTab;
