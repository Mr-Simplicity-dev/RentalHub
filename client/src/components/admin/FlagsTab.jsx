import React from "react";

const FlagsTab = ({ flags, toggleFlag }) => {

  return (
    <div className="animate-fadeIn rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

      <h3 className="font-semibold mb-3">
        Platform Controls
      </h3>

      <ul className="space-y-3">

        {flags.map((f) => (

          <li key={f.key} className="flex items-center justify-between rounded-lg border border-soft px-3 py-2 transition hover:bg-gray-50">

            <div>

              <strong>
                {f.key}
              </strong>

              <div className="text-xs text-gray-500">
                {f.description}
              </div>

            </div>

            <input
              type="checkbox"
              checked={f.enabled}
              onChange={() =>
                toggleFlag(f.key, !f.enabled)
              }
              className="h-4 w-4 accent-blue-600"
            />

          </li>

        ))}

      </ul>

    </div>
  );
};

export default FlagsTab;
