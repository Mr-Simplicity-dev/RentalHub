import React from "react";

const AdminTabs = ({ tabs, tab, loadTab }) => {
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
          {name.charAt(0).toUpperCase() + name.slice(1)}
        </button>

      ))}

    </div>
  );
};

export default AdminTabs;
