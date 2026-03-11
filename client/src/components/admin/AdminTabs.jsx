import React from "react";

const AdminTabs = ({ tabs, tab, loadTab }) => {
  const formatLabel = (name) =>
    String(name)
      .split(/[_-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  return (
    <div className="flex flex-wrap justify-center gap-3 mb-8">

      {tabs.map((name) => (

        <button
          key={name}
          className={`rounded-xl2 border px-4 py-2 text-sm font-medium transition
          ${
            tab === name
              ? "border-blue-600 bg-blue-600 text-white shadow-card"
              : "border-soft bg-white text-gray-700 hover:bg-gray-50 hover:shadow-card"
          }`}
          onClick={() => loadTab(name)}
        >
          {formatLabel(name)}
        </button>

      ))}

    </div>
  );
};

export default AdminTabs;
