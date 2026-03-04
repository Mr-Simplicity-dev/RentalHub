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

  const guardedLoad = async (fn, msg) => {
    try {
      setLoading(true);
      await fn();
    } catch (e) {
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

  useEffect(() => {

    if (!user) navigate("/login");

    if (user?.user_type !== "super_admin")
      navigate("/dashboard");

  }, [user]);

  useEffect(() => {

    if (tab === "users") guardedLoad(loadUsers,"Failed loading users");
    if (tab === "properties") guardedLoad(loadProperties,"Failed loading properties");
    if (tab === "logs") guardedLoad(loadLogs,"Failed loading logs");
    if (tab === "analytics") guardedLoad(loadAnalytics,"Failed loading analytics");
    if (tab === "reports") guardedLoad(loadReports,"Failed loading reports");
    if (tab === "fraud") guardedLoad(loadFraud,"Failed loading fraud");
    if (tab === "flags") guardedLoad(loadFlags,"Failed loading flags");
    if (tab === "verifications") guardedLoad(loadVerifications,"Failed loading verifications");

  }, [tab]);

  return (

    <div className="max-w-7xl mx-auto px-4 py-8">

      <h1 className="text-3xl font-bold mb-6">
        Super Admin Control Center
      </h1>

     <AdminTabs tabs={tabs} tab={tab} loadTab={loadTab} />

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
