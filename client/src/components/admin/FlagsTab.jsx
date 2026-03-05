import React from "react";

const FlagsTab = ({ flags, toggleFlag }) => {

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

        {flags.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            No feature flags configured
          </div>
        )}

        {flags.map((f) => (

          <div
            key={f.key}
            className="flex items-center justify-between border border-soft rounded-lg px-4 py-3 hover:bg-gray-50 transition"
          >

            {/* FLAG INFO */}

            <div>

              <p className="font-medium">
                {f.key}
              </p>

              <p className="text-sm text-gray-500">
                {f.description}
              </p>

            </div>

            {/* STATUS + TOGGLE */}

            <div className="flex items-center gap-4">

              <span
                className={`px-2 py-1 text-xs rounded-full
                ${
                  f.enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {f.enabled ? "Enabled" : "Disabled"}
              </span>

              <button
                onClick={() => toggleFlag(f.key, !f.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition
                ${
                  f.enabled
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >

                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition
                  ${
                    f.enabled
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />

              </button>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
};

export default FlagsTab;