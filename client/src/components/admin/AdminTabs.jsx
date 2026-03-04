import React from "react";

const tabs = [
  "users",
  "verifications",
  "properties",
  "analytics",
  "reports",
  "logs",
  "broadcast",
  "flags",
  "fraud"
];

export default function AdminTabs({ tab, setTab }) {

  return (

    <div className="flex flex-wrap gap-2 mb-6">

      {tabs.map((name) => (

        <button
          key={name}
          onClick={() => setTab(name)}
          className={`px-4 py-2 rounded-lg text-sm ${
            tab === name
              ? "bg-blue-600 text-white"
              : "border border-gray-300"
          }`}
        >
          {name.charAt(0).toUpperCase() + name.slice(1)}
        </button>

      ))}

    </div>

  );
}