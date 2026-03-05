import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";

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
import ModerationOverview from "../components/admin/ModerationOverview";
import LiveModerationQueue from "../components/admin/LiveModerationQueue";

const tabs = [
  "overview",
  "users",
  "verifications",
  "properties",
  "analytics",
  "reports",
  "logs",
  "broadcast",
  "flags",
  "fraud",
];

export default function SuperAdminDashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [reports, setReports] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [flags, setFlags] = useState([]);
  const [fraud, setFraud] = useState([]);
  const [verifications, setVerifications] = useState([]);

  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProps, setSelectedProps] = useState([]);

  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [verificationUserType, setVerificationUserType] = useState("all");
  const [verificationPagination, setVerificationPagination] = useState({
    total: 0,
    pages: 1,
  });

  const [adminPerformance, setAdminPerformance] = useState([]);

  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    message: "",
    target_role: "",
  });

  const guardedLoad = async (fn, msg) => {
    try {
      setLoading(true);
      await fn();
    } catch (e) {
      console.error(e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    const res = await api.get("/super/users");
    setUsers(res.data.users || []);
  };

  const loadProperties = async () => {
    const res = await api.get("/super/properties");
    setProperties(res.data.properties || []);
  };

  const loadLogs = async () => {
    const res = await api.get("/super/logs");
    setLogs(res.data.logs || []);
  };

  const loadAnalytics = async () => {
    const res = await api.get("/super/analytics");
    setAnalytics(res.data.data);
  };

  const loadReports = async () => {
    const res = await api.get("/super/reports");
    setReports(res.data.reports || []);
  };

  const loadFraud = async () => {
    const res = await api.get("/super/fraud");
    setFraud(res.data.flags || []);
  };

  const loadFlags = async () => {
    const res = await api.get("/super/flags");
    setFlags(res.data.flags || []);
  };

  const loadVerifications = async () => {
    const res = await api.get("/super/verifications");
    setVerifications(res.data.verifications || []);
  };

  const loadBroadcasts = async () => {
    const res = await api.get("/super/broadcasts");
    setBroadcasts(res.data.broadcasts || []);
  };

  const loadTab = (name) => {
    setTab(name);

    if (name === "users") guardedLoad(loadUsers,"Failed loading users");
    if (name === "properties") guardedLoad(loadProperties,"Failed loading properties");
    if (name === "logs") guardedLoad(loadLogs,"Failed loading logs");
    if (name === "analytics") guardedLoad(loadAnalytics,"Failed loading analytics");
    if (name === "reports") guardedLoad(loadReports,"Failed loading reports");
    if (name === "fraud") guardedLoad(loadFraud,"Failed loading fraud");
    if (name === "flags") guardedLoad(loadFlags,"Failed loading flags");
    if (name === "verifications") guardedLoad(loadVerifications,"Failed loading verifications");
    if (name === "broadcast") guardedLoad(loadBroadcasts,"Failed loading broadcasts");
  };

  const verifyIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/approve`);
    toast.success("Identity verified");
    loadVerifications();
  };

  const rejectIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/reject`);
    toast.success("Identity rejected");
    loadVerifications();
  };

  const banUser = async (id) => {
    await api.patch(`/super/users/${id}/ban`);
    toast.success("User banned");
    loadUsers();
  };

  const promoteUser = async (id) => {
    await api.patch(`/super/users/${id}/promote`);
    toast.success("User promoted");
    loadUsers();
  };

  const unlistProperty = async (id) => {
    await api.patch(`/super/properties/${id}/unlist`);
    toast.success("Property unlisted");
    loadProperties();
  };

  const bulkUsers = async (action) => {
    await api.post("/super/users/bulk", {
      ids: selectedUsers,
      action,
    });
    toast.success("Bulk action completed");
    loadUsers();
  };

  const bulkProps = async () => {
    await api.post("/super/properties/bulk", {
      ids: selectedProps,
      action: "unlist",
    });
    toast.success("Bulk unlist completed");
    loadProperties();
  };

  const updateReport = async (id, status) => {
    await api.patch(`/super/reports/${id}`, { status });
    loadReports();
  };

  const sendBroadcast = async () => {
    await api.post("/super/broadcasts", broadcastForm);

    toast.success("Broadcast sent");

    setBroadcastForm({
      title: "",
      message: "",
      target_role: "",
    });

    loadBroadcasts();
  };

  const toggleFlag = async (key, enabled) => {
    await api.patch(`/super/flags/${key}`, { enabled });
    loadFlags();
  };

  useEffect(() => {

    if (!user) navigate("/login");

    if (user?.user_type !== "super_admin")
      navigate("/dashboard");

  }, [user]);

  return (
        <div className="max-w-7xl mx-auto px-4 py-8 text-center animate-fadeIn">

          <LiveModerationQueue
          loadReports={loadReports}
          loadVerifications={loadVerifications}
          loadFraud={loadFraud}
        />

        <h1 className="text-3xl font-bold mb-6">
          Super Admin Control Center
        </h1>

        <div className="flex justify-center">
          <AdminTabs tabs={tabs} tab={tab} loadTab={loadTab} />
        </div>

      {loading && <p className="text-gray-500">Loading...</p>}

      {tab === "users" && (
        <UsersTab
          users={users}
          selectedUsers={selectedUsers}
          setSelectedUsers={setSelectedUsers}
          bulkUsers={bulkUsers}
          verifyIdentity={verifyIdentity}
          promoteUser={promoteUser}
          banUser={banUser}
        />
      )}

      {tab === "verifications" && (
        <VerificationsTab
          verifications={verifications}
          verificationSearch={verificationSearch}
          setVerificationSearch={setVerificationSearch}
          verificationStatus={verificationStatus}
          setVerificationStatus={setVerificationStatus}
          verificationUserType={verificationUserType}
          setVerificationUserType={setVerificationUserType}
          verificationPagination={verificationPagination}
          loadVerifications={loadVerifications}
          verifyIdentity={verifyIdentity}
          rejectIdentity={rejectIdentity}
          adminPerformance={adminPerformance}
        />
      )}

      {tab === "properties" && (
        <PropertiesTab
          properties={properties}
          selectedProps={selectedProps}
          setSelectedProps={setSelectedProps}
          bulkProps={bulkProps}
          unlistProperty={unlistProperty}
        />
      )}

      {tab === "analytics" && (
        <AnalyticsTab analytics={analytics} />
      )}

      {tab === "reports" && (
        <ReportsTab reports={reports} updateReport={updateReport} />
      )}

      {tab === "logs" && (
        <LogsTab logs={logs} />
      )}

      {tab === "broadcast" && (
        <BroadcastTab
          broadcastForm={broadcastForm}
          setBroadcastForm={setBroadcastForm}
          sendBroadcast={sendBroadcast}
          broadcasts={broadcasts}
        />
      )}

      {tab === "flags" && (
        <FlagsTab flags={flags} toggleFlag={toggleFlag} />
      )}

      {tab === "fraud" && (
        <FraudTab fraud={fraud} loadFraud={loadFraud} />
      )}

      {tab === "overview" && (

          <ModerationOverview
            reports={reports}
            verifications={verifications}
            fraud={fraud}
            loadTab={loadTab}
          />

        )}

    </div>
  );
}
