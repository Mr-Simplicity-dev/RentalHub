import React, { useState } from "react";

import AdminTabs from "../components/admin/AdminTabs";
import UsersTab from "../components/admin/UsersTab";
import VerificationsTab from "../components/admin/VerificationsTab";
import PropertiesTab from "../components/admin/PropertiesTab";
import AnalyticsTab from "../components/admin/AnalyticsTab";
import ReportsTab from "../components/admin/ReportsTab";
import LogsTab from "../components/admin/LogsTab";
import BroadcastTab from "../components/admin/BroadcastTab";
import FlagsTab from "../components/admin/FlagsTab";
import FraudTab from "../components/admin/FraudTab";

export default function SuperAdminDashboard() {

  const [tab, setTab] = useState("users");

  return (

    <div className="max-w-7xl mx-auto px-4 py-8">

      <h1 className="text-3xl font-bold mb-6">
        Super Admin Control Center
      </h1>

      <AdminTabs tab={tab} setTab={setTab} />

      {tab === "users" && <UsersTab />}
      {tab === "verifications" && <VerificationsTab />}
      {tab === "properties" && <PropertiesTab />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "broadcast" && <BroadcastTab />}
      {tab === "flags" && <FlagsTab />}
      {tab === "fraud" && <FraudTab />}

    </div>

  );
}