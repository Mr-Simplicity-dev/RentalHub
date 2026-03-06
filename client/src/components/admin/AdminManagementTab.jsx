import React, { useState } from "react";

import CreateAdminTab from "./CreateAdminTab";
import AdminListTab from "./AdminListTab";

const AdminManagementTab = () => {
  const [activeTab, setActiveTab] = useState("create");

  const tabs = [
    { id: "create", label: "Create Admin" },
    { id: "list", label: "Manage Admins" },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case "create":
        return <CreateAdminTab />;
      case "list":
        return <AdminListTab />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">
          Admin Management
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Create and manage platform administrators
        </p>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-3 border-b pb-3 mb-6">

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition
              ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }
            `}
          >
            {tab.label}
          </button>
        ))}

      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {renderTab()}
      </div>

    </div>
  );
};

export default AdminManagementTab;