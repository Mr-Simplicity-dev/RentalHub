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
import PaginationControls from "../components/admin/PaginationControls";
import ModerationOverview from "../components/admin/ModerationOverview";
import LiveModerationQueue from "../components/admin/LiveModerationQueue";
import AdminNotifications from "../components/admin/AdminNotifications";

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

const PAGE_LIMITS = {
  users: 10,
  properties: 10,
  reports: 10,
  logs: 12,
  fraud: 10,
  verifications: 20,
};

const getTotalPages = (count, pageSize) =>
  Math.max(Math.ceil((count || 0) / pageSize), 1);

const getPageSlice = (items, page, pageSize) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

const getPageSummary = (page, pageSize, total) => {
  if (!total) return "Showing 0 of 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start}-${end} of ${total}`;
};

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
  const [usersPage, setUsersPage] = useState(1);
  const [propertiesPage, setPropertiesPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [fraudPage, setFraudPage] = useState(1);
  const [verificationPage, setVerificationPage] = useState(1);

  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [verificationUserType, setVerificationUserType] = useState("all");
  const [verificationPagination, setVerificationPagination] = useState({
    total: 0,
    pages: 1,
    page: 1,
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
    setUsersPage(1);
    setSelectedUsers([]);
  };

  const loadProperties = async () => {
    const res = await api.get("/super/properties");
    setProperties(res.data.properties || []);
    setPropertiesPage(1);
    setSelectedProps([]);
  };

  const loadLogs = async () => {
    const res = await api.get("/super/logs");
    setLogs(res.data.logs || []);
    setLogsPage(1);
  };

  const loadAnalytics = async () => {
    const res = await api.get("/super/analytics");
    setAnalytics(res.data.data);
  };

  const loadReports = async () => {
    const res = await api.get("/super/reports");
    setReports(res.data.reports || []);
    setReportsPage(1);
  };

  const loadFraud = async () => {
    const res = await api.get("/super/fraud");
    setFraud(res.data.flags || []);
    setFraudPage(1);
  };

  const loadFlags = async () => {
    const res = await api.get("/super/flags");
    setFlags(res.data.flags || []);
  };

  const loadVerifications = async (page = verificationPage) => {
    const requestedPage = Math.max(page, 1);

    const res = await api.get("/super/verifications", {
      params: {
        search: verificationSearch,
        status: verificationStatus,
        user_type: verificationUserType,
        page: requestedPage,
        limit: PAGE_LIMITS.verifications,
      },
    });

    const records = res.data.data || res.data.verifications || [];
    const pagination = res.data.pagination || {
      total: records.length,
      pages: 1,
      page: requestedPage,
    };

    setVerifications(records);
    setVerificationPage(pagination.page || requestedPage);
    setVerificationPagination(pagination);
  };

  const loadAdminPerformance = async () => {
    const res = await api.get("/super/admins/performance");
    setAdminPerformance(res.data.data || []);
  };

  const applyVerificationFilters = () =>
    guardedLoad(async () => {
      setVerificationPage(1);
      await Promise.all([
        loadVerifications(1),
        loadAdminPerformance(),
      ]);
    }, "Failed loading verifications");

  const handleVerificationPageChange = (page) =>
    guardedLoad(
      async () => {
        await loadVerifications(page);
      },
      "Failed loading verifications"
    );

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
    if (name === "verifications") applyVerificationFilters();
    if (name === "broadcast") guardedLoad(loadBroadcasts,"Failed loading broadcasts");
  };

  const verifyIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/approve`);
    toast.success("Identity verified");
    loadVerifications(verificationPage);
    loadUsers();
    loadAdminPerformance();
  };

  const rejectIdentity = async (id) => {
    await api.patch(`/super/verifications/${id}/reject`);
    toast.success("Identity rejected");
    loadVerifications(verificationPage);
    loadAdminPerformance();
  };

  const banUser = async (id) => {
    await api.patch(`/super/users/${id}/ban`);
    toast.success("User banned");
    loadUsers();
  };

  const unbanUser = async (id) => {
    await api.patch(`/super/users/${id}/unban`);
    toast.success("User unbanned");
    loadUsers();
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Delete this user? This action hides the user account.")) return;
    await api.delete(`/super/users/${id}`);
    toast.success("User deleted");
    loadUsers();
  };

  const promoteUser = async (id) => {
    await api.patch(`/super/users/${id}/promote`);
    toast.success("User promoted");
    loadUsers();
    loadAdminPerformance();
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
    if (action === "verify" || action === "promote") {
      loadVerifications(verificationPage);
      loadAdminPerformance();
    }
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

  useEffect(() => {
    if (user?.user_type === "super_admin") {
      loadTab("users");
    }
  }, [user]);

  const usersTotalPages = getTotalPages(users.length, PAGE_LIMITS.users);
  const pagedUsers = getPageSlice(users, usersPage, PAGE_LIMITS.users);

  const propertiesTotalPages = getTotalPages(
    properties.length,
    PAGE_LIMITS.properties
  );
  const pagedProperties = getPageSlice(
    properties,
    propertiesPage,
    PAGE_LIMITS.properties
  );

  const reportsTotalPages = getTotalPages(reports.length, PAGE_LIMITS.reports);
  const pagedReports = getPageSlice(reports, reportsPage, PAGE_LIMITS.reports);

  const logsTotalPages = getTotalPages(logs.length, PAGE_LIMITS.logs);
  const pagedLogs = getPageSlice(logs, logsPage, PAGE_LIMITS.logs);

  const fraudTotalPages = getTotalPages(fraud.length, PAGE_LIMITS.fraud);
  const pagedFraud = getPageSlice(fraud, fraudPage, PAGE_LIMITS.fraud);

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

      <AdminNotifications />

      {loading && <p className="text-gray-500">Loading...</p>}

      {tab === "users" && (
        <>
          <UsersTab
            users={pagedUsers}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            bulkUsers={bulkUsers}
            verifyIdentity={verifyIdentity}
            promoteUser={promoteUser}
            banUser={banUser}
            unbanUser={unbanUser}
            deleteUser={deleteUser}
          />
          <PaginationControls
            currentPage={usersPage}
            totalPages={usersTotalPages}
            onPageChange={setUsersPage}
            summary={getPageSummary(usersPage, PAGE_LIMITS.users, users.length)}
          />
        </>
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
          loadVerifications={applyVerificationFilters}
          verificationPage={verificationPage}
          onVerificationPageChange={handleVerificationPageChange}
          verifyIdentity={verifyIdentity}
          rejectIdentity={rejectIdentity}
          adminPerformance={adminPerformance}
        />
      )}

      {tab === "properties" && (
        <>
          <PropertiesTab
            properties={pagedProperties}
            selectedProps={selectedProps}
            setSelectedProps={setSelectedProps}
            bulkProps={bulkProps}
            unlistProperty={unlistProperty}
          />
          <PaginationControls
            currentPage={propertiesPage}
            totalPages={propertiesTotalPages}
            onPageChange={setPropertiesPage}
            summary={getPageSummary(
              propertiesPage,
              PAGE_LIMITS.properties,
              properties.length
            )}
          />
        </>
      )}

      {tab === "analytics" && (
        <AnalyticsTab analytics={analytics} />
      )}

      {tab === "reports" && (
        <>
          <ReportsTab reports={pagedReports} updateReport={updateReport} />
          <PaginationControls
            currentPage={reportsPage}
            totalPages={reportsTotalPages}
            onPageChange={setReportsPage}
            summary={getPageSummary(
              reportsPage,
              PAGE_LIMITS.reports,
              reports.length
            )}
          />
        </>
      )}

      {tab === "logs" && (
        <>
          <LogsTab logs={pagedLogs} />
          <PaginationControls
            currentPage={logsPage}
            totalPages={logsTotalPages}
            onPageChange={setLogsPage}
            summary={getPageSummary(logsPage, PAGE_LIMITS.logs, logs.length)}
          />
        </>
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
        <>
          <FraudTab fraud={pagedFraud} loadFraud={loadFraud} />
          <PaginationControls
            currentPage={fraudPage}
            totalPages={fraudTotalPages}
            onPageChange={setFraudPage}
            summary={getPageSummary(fraudPage, PAGE_LIMITS.fraud, fraud.length)}
          />
        </>
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
