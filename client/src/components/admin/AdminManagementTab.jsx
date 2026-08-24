import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { approvalService } from "../../services/approvalService";

import CreateAdminTab from "./CreateAdminTab";
import AdminListTab from "./AdminListTab";
import PendingAdminApprovalsTab from "./PendingAdminApprovalsTab";
import SFAPermissionsTab from "./SFAPermissionsTab";

const AdminManagementTab = ({ initialTab = "create" }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.user_type === "super_admin";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPendingCount = useCallback(async () => {
    try {
      const rows = await approvalService.fetchPendingAdminApprovals();
      setPendingCount(rows.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  const tabs = [
    { id: "create", label: "Create Admin" },
    { id: "list", label: "Manage Admins" },
    { id: "pending", label: "Pending Approvals", count: pendingCount },
    ...(isSuperAdmin ? [{ id: "sfa_permissions", label: "SFA Delegation" }] : []),
  ];

  const renderTab = () => {
    switch (activeTab) {
      case "create":
        return <CreateAdminTab />;
      case "list":
        return <AdminListTab />;
      case "pending":
        return <PendingAdminApprovalsTab />;
      case "sfa_permissions":
        return isSuperAdmin ? <SFAPermissionsTab /> : null;
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
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {typeof tab.count === "number" && tab.count > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {tab.count}
                </span>
              )}
            </span>
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