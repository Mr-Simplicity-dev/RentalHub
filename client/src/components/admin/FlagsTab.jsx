import React from "react";

const FLAG_META = {
  allow_registration: {
    label: "Allow Registration",
    description:
      "Master switch for all sign-ups. When off, tenant and landlord registration are both disabled.",
  },
  allow_tenant_registration: {
    label: "Tenant Registration",
    description:
      "Allow tenants to register. Only applies when Allow Registration is on.",
  },
  allow_landlord_registration: {
    label: "Landlord Registration",
    description:
      "Allow landlords to register. Only applies when Allow Registration is on.",
  },
  tenant_registration_payment: {
    label: "Tenant Registration Payment",
    description: "Require tenant registration payment before account creation. Base fee is ₦3,000 and location pricing rules can override it.",
  },
  landlord_registration_payment: {
    label: "Landlord Registration Payment",
    description: "Require landlord registration payment before account creation. Base fee is ₦5,000 and location pricing rules can override it.",
  },
  property_alert_payment: {
    label: "Property Alert Payment",
    description: 'Require payment before processing "Notify me when available" requests. Base fee is ₦5,000 and location pricing rules can override it.',
  },
  ads_enabled: {
    label: "Ad Spaces",
    description: "Show or hide Super Admin managed ads on Home, Dashboard, and Properties pages.",
  },
  tenant_landlord_referrals: {
    label: "Tenant & Landlord Referrals",
    description: "Allow tenants and landlords to share invite links and earn ₦1,000 subscription credit for each successful registration.",
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

const REGISTRATION_PARENT_KEY = "allow_registration";
const REGISTRATION_CHILD_KEYS = [
  "allow_tenant_registration",
  "allow_landlord_registration",
];
const REGISTRATION_OTHER_KEYS = [
  "tenant_registration_payment",
  "landlord_registration_payment",
  "nin_number",
  "passport_number",
];

const PLATFORM_PRIORITY_FLAG_ORDER = [
  "property_alert_payment",
  "ads_enabled",
  "tenant_landlord_referrals",
];

const FlagsTab = ({ flags, toggleFlag }) => {
  const [flagAction, setFlagAction] = React.useState({
    open: false,
    flag: null,
    enabled: false,
    reason: "",
    error: "",
  });

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

  const flagByKey = React.useMemo(
    () => new Map(mergedFlags.map((flag) => [flag.key, flag])),
    [mergedFlags]
  );

  const registrationMasterEnabled =
    flagByKey.get(REGISTRATION_PARENT_KEY)?.enabled === true;

  const platformFlags = React.useMemo(() => {
    const registrationKeys = new Set([
      REGISTRATION_PARENT_KEY,
      ...REGISTRATION_CHILD_KEYS,
      ...REGISTRATION_OTHER_KEYS,
    ]);

    const weight = new Map(
      PLATFORM_PRIORITY_FLAG_ORDER.map((key, index) => [key, index])
    );

    return mergedFlags
      .filter((flag) => !registrationKeys.has(flag.key))
      .sort((a, b) => {
        const aWeight = weight.has(a.key) ? weight.get(a.key) : Number.MAX_SAFE_INTEGER;
        const bWeight = weight.has(b.key) ? weight.get(b.key) : Number.MAX_SAFE_INTEGER;

        if (aWeight !== bWeight) {
          return aWeight - bWeight;
        }

        return a.key.localeCompare(b.key);
      });
  }, [mergedFlags]);

  const renderFlagRow = (f, { nested = false, inactive = false } = {}) => {
    const meta = FLAG_META[f.key];
    const effectiveEnabled = inactive ? false : f.enabled;

    return (
      <div
        key={f.key}
        className={`flex flex-col gap-3 border border-soft rounded-lg px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between ${
          nested ? "border-l-4 border-l-indigo-300 bg-white sm:ml-6" : ""
        } ${inactive ? "bg-gray-50 opacity-70" : "hover:bg-gray-50"}`}
      >
        <div className="min-w-0">
          <p className="font-medium">{meta?.label || f.key}</p>

          <p className="text-xs text-gray-400">{f.key}</p>

          <p className="text-sm text-gray-500">
            {meta?.description || f.description}
          </p>

          {Array.isArray(f.operations) && f.operations.length > 0 && (
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              {f.operations.slice(0, 2).map((operation) => (
                <p
                  key={operation.id}
                  className="truncate"
                  title={operation.note || operation.event_type}
                >
                  {String(operation.event_type || "").replace(/_/g, " ")} by{" "}
                  {operation.actor_name || "Super admin"}
                </p>
              ))}
            </div>
          )}

          {inactive && f.enabled && (
            <p className="mt-1 text-xs text-amber-700">
              Saved as on, but inactive while Allow Registration is off.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              effectiveEnabled
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {effectiveEnabled ? "Enabled" : "Disabled"}
          </span>

          <button
            type="button"
            onClick={() =>
              setFlagAction({
                open: true,
                flag: f,
                enabled: !f.enabled,
                reason: "",
                error: "",
              })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              f.enabled ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                f.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    );
  };

  const parentFlag = flagByKey.get(REGISTRATION_PARENT_KEY);
  const childFlags = REGISTRATION_CHILD_KEYS.map((key) => flagByKey.get(key)).filter(
    Boolean
  );
  const otherRegistrationFlags = REGISTRATION_OTHER_KEYS.map((key) =>
    flagByKey.get(key)
  ).filter(Boolean);

  return (
    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6 animate-fadeIn">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Platform Feature Flags</h3>

        <p className="text-sm text-gray-500">
          Enable or disable platform-wide features in real time.
        </p>
      </div>

      <div className="space-y-4">
        {mergedFlags.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            No feature flags configured
          </div>
        )}

        {parentFlag && (
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-gray-900">Registration Controls</h4>

              <p className="text-sm text-gray-500">
                Turn registration on or off platform-wide, then choose tenant and/or
                landlord access. Use the Registration Access tab for state and LGA
                rules.
              </p>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              {renderFlagRow(parentFlag)}

              <div className="mt-3 border-t border-indigo-100 pt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 sm:pl-6">
                  <p className="text-sm font-semibold text-indigo-900">
                    Tenant and landlord switches under Allow Registration
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-indigo-700">
                    {registrationMasterEnabled ? "Master on" : "Master off"}
                  </span>
                </div>

                <div className="space-y-3">
                  {childFlags.map((flag) =>
                    renderFlagRow(flag, {
                      nested: true,
                      inactive: !registrationMasterEnabled,
                    })
                  )}
                </div>
              </div>
            </div>

            {otherRegistrationFlags.length > 0 && (
              <div className="space-y-3 pt-2">
                {otherRegistrationFlags.map((flag) => renderFlagRow(flag))}
              </div>
            )}
          </div>
        )}

        {platformFlags.length > 0 && (
          <div className="space-y-3 pt-2">
            <div>
              <h4 className="font-semibold text-gray-900">Platform Controls</h4>

              <p className="text-sm text-gray-500">
                Manage the remaining platform-wide switches.
              </p>
            </div>

            {platformFlags.map((flag) => renderFlagRow(flag))}
          </div>
        )}
      </div>

      {flagAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl2 bg-white shadow-card">
            <div className="border-b border-soft px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {flagAction.enabled ? "Enable feature flag" : "Disable feature flag"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {FLAG_META[flagAction.flag?.key]?.label || flagAction.flag?.key}
              </p>
            </div>

            <div className="space-y-3 px-6 py-4">
              <label className="block text-sm font-medium text-gray-700">
                Change reason
              </label>
              <textarea
                value={flagAction.reason}
                onChange={(event) =>
                  setFlagAction((prev) => ({
                    ...prev,
                    reason: event.target.value,
                    error: "",
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-soft px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Explain why this platform switch is being changed"
              />
              <p className="text-xs text-gray-500">
                This reason is saved in feature flag governance history.
              </p>

              {flagAction.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {flagAction.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-soft px-6 py-4">
              <button
                type="button"
                onClick={() =>
                  setFlagAction({
                    open: false,
                    flag: null,
                    enabled: false,
                    reason: "",
                    error: "",
                  })
                }
                className="rounded-lg border border-soft px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const reason = flagAction.reason.trim();
                  if (!reason) {
                    setFlagAction((prev) => ({
                      ...prev,
                      error: "A feature flag change reason is required.",
                    }));
                    return;
                  }

                  try {
                    await toggleFlag(flagAction.flag.key, flagAction.enabled, reason);
                    setFlagAction({
                      open: false,
                      flag: null,
                      enabled: false,
                      reason: "",
                      error: "",
                    });
                  } catch (err) {
                    setFlagAction((prev) => ({
                      ...prev,
                      error:
                        err.response?.data?.message ||
                        "Failed to update feature flag.",
                    }));
                  }
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  flagAction.enabled
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-700 hover:bg-gray-800"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlagsTab;
