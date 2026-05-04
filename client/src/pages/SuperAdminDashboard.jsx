import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";

import UsersTab from "../components/admin/UsersTab";
import VerificationsTab from "../components/admin/VerificationsTab";
import PropertiesTab from "../components/admin/PropertiesTab";
import AnalyticsTab from "../components/admin/AnalyticsTab";
import ReportsTab from "../components/admin/ReportsTab";
import LogsTab from "../components/admin/LogsTab";
import BroadcastTab from "../components/admin/BroadcastTab";
import FlagsTab from "../components/admin/FlagsTab";
import FraudTab from "../components/admin/FraudTab";
import PricingRulesTab from "../components/admin/PricingRulesTab";
import PaginationControls from "../components/admin/PaginationControls";
import ModerationOverview from "../components/admin/ModerationOverview";
import LiveModerationQueue from "../components/admin/LiveModerationQueue";
import AdminNotifications from "../components/admin/AdminNotifications";
import AdminManagementTab from "../components/admin/AdminManagementTab";
import LawyerInvitesManager from "../components/admin/LawyerInvitesManager";
import PlatformLawyersTab from "../components/admin/PlatformLawyersTab";
import LawyerActivityMonitor from "../components/admin/LawyerActivityMonitor";
import InputDialog from "../components/common/InputDialog";

const tabs = [
  "overview",
  "users",
  "verifications",
  "lawyer_invites",
  "platform_lawyers",
  "lawyer_activity",
  "properties",
  "analytics",
  "reports",
  "logs",
  "broadcast",
  "pricing",
  "flags",
  "fraud",
  "admin",
  "pending_approvals",
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

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

export default function SuperAdminDashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasInitializedDashboard = useRef(false);

  const [tab, setTab] = useState("overview");
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
  const [showPersonalWithdrawDialog, setShowPersonalWithdrawDialog] = useState(false);
  const [personalWithdrawForm, setPersonalWithdrawForm] = useState({
    amount: "",
    bank_name: "",
    bank_code: "",
    account_number: "",
    account_name: "",
    password: "",
  });
  const [submittingPersonalWithdraw, setSubmittingPersonalWithdraw] = useState(false);
  const [withdrawAccountNameLoading, setWithdrawAccountNameLoading] = useState(false);
  const [withdrawAccountNameError, setWithdrawAccountNameError] = useState("");
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState("");
  const withdrawAccountLookupTimerRef = useRef(null);
  const [withdrawableSnapshot, setWithdrawableSnapshot] = useState({
    withdrawable_amount: 0,
    total_earned: 0,
  });
  const [isWithdrawableVisible, setIsWithdrawableVisible] = useState(false);
  const [showRevealAmountDialog, setShowRevealAmountDialog] = useState(false);
  const [revealPasswordInput, setRevealPasswordInput] = useState({ password: "" });
  const [verifyingRevealPassword, setVerifyingRevealPassword] = useState(false);

        const guardedLoad = useCallback(async (fn, msg) => {
        try {
          setLoading(true);
          await fn();
        } catch (e) {
          console.error(e);
          toast.error(msg);
        } finally {
          setLoading(false);
        }
      }, [setLoading]);

    const loadUsers = useCallback(async () => {
    const res = await api.get("/super/users");
    setUsers(res.data.users || []);
    setUsersPage(1);
    setSelectedUsers([]);
  }, []);

  const loadProperties = useCallback(async () => {
    const res = await api.get("/super/properties");
    setProperties(res.data.properties || []);
    setPropertiesPage(1);
    setSelectedProps([]);
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await api.get("/super/logs");
    setLogs(res.data.logs || []);
    setLogsPage(1);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const res = await api.get("/super/analytics");
    setAnalytics(res.data.data);
  }, []);

  const loadReports = useCallback(async () => {
    const res = await api.get("/super/reports");
    setReports(res.data.reports || []);
    setReportsPage(1);
  }, []);

  const loadFraud = useCallback(async () => {
    const res = await api.get("/super/fraud");
    setFraud(res.data.flags || []);
    setFraudPage(1);
  }, []);

  const loadFlags = useCallback(async () => {
    const res = await api.get("/super/flags");
    setFlags(res.data.flags || []);
  }, []);

  const loadVerifications = useCallback(async (page = verificationPage) => {
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
  }, [
    verificationPage,
    verificationSearch,
    verificationStatus,
    verificationUserType
  ]);
  const loadAdminPerformance = useCallback(async () => {
  const res = await api.get("/super/admins/performance");
  setAdminPerformance(res.data.data || []);
}, []);

  const resetPersonalWithdrawalForm = useCallback(() => {
    setPersonalWithdrawForm({ amount: '', bank_name: '', bank_code: '', account_number: '', account_name: '', password: '' });
    setWithdrawAccountNameError('');
  }, []);

  const loadBanks = useCallback(async () => {
    try {
      setBanksLoading(true);
      setBanksError('');
      const res = await api.get('/payments/banks');
      if (res.data?.success) {
        const normalizedBanks = (res.data.data || [])
          .filter((bank) => bank?.name && bank?.code)
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setBanks(normalizedBanks);
        return;
      }
      throw new Error('Bank list is unavailable right now.');
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to load bank list. Check your connection and retry.';
      setBanksError(message);
      setBanks([]);
    } finally {
      setBanksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showPersonalWithdrawDialog) return;
    resetPersonalWithdrawalForm();
    loadBanks();
  }, [showPersonalWithdrawDialog, loadBanks, resetPersonalWithdrawalForm]);

  useEffect(() => {
    return () => {
      if (withdrawAccountLookupTimerRef.current) {
        clearTimeout(withdrawAccountLookupTimerRef.current);
      }
    };
  }, []);

  const fetchWithdrawAccountName = useCallback(async (bankCode, accountNumber) => {
    if (!bankCode || !accountNumber || accountNumber.length !== 10) return;
    setWithdrawAccountNameLoading(true);
    setWithdrawAccountNameError('');
    try {
      const res = await api.post('/payments/verify-account', {
        bank_code: bankCode,
        account_number: accountNumber,
      });
      if (res.data?.success && res.data.data?.account_name) {
        setPersonalWithdrawForm((prev) => ({ ...prev, account_name: res.data.data.account_name }));
      } else {
        setWithdrawAccountNameError('Could not auto-resolve account name. Enter it manually.');
      }
    } catch (error) {
      setWithdrawAccountNameError(error?.response?.data?.message || 'Could not auto-resolve account name. Enter it manually.');
    } finally {
      setWithdrawAccountNameLoading(false);
    }
  }, []);

  const handlePersonalBankChange = (event) => {
    const selectedCode = event.target.value;
    const selectedBank = banks.find((bank) => bank.code === selectedCode);

    setPersonalWithdrawForm((prev) => {
      const next = {
        ...prev,
        bank_code: selectedCode,
        bank_name: selectedBank?.name || '',
        account_name: '',
      };

      if (next.account_number.length === 10 && selectedCode) {
        fetchWithdrawAccountName(selectedCode, next.account_number);
      }

      return next;
    });
    setWithdrawAccountNameError('');
  };

  const handlePersonalAccountNumberChange = (event) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 10);
    setPersonalWithdrawForm((prev) => ({ ...prev, account_number: value, account_name: '' }));
    setWithdrawAccountNameError('');

    if (withdrawAccountLookupTimerRef.current) {
      clearTimeout(withdrawAccountLookupTimerRef.current);
    }

    if (value.length === 10 && personalWithdrawForm.bank_code) {
      withdrawAccountLookupTimerRef.current = setTimeout(() => {
        fetchWithdrawAccountName(personalWithdrawForm.bank_code, value);
      }, 450);
    }
  };

  const submitPersonalWithdrawal = async () => {
    const { amount, bank_name, bank_code, account_number, account_name, password } = personalWithdrawForm;
    if (!amount || !bank_name || !bank_code || !account_number || !account_name || !password) {
      toast.error('All fields including password are required');
      return;
    }
    if (!/^\d{10}$/.test(account_number)) {
      toast.error('Account number must be 10 digits');
      return;
    }
    if (parseFloat(amount) < 1000) {
      toast.error('Minimum withdrawal is ₦1,000');
      return;
    }
    if (isWithdrawableVisible && parseFloat(amount) > Number(withdrawableSnapshot.withdrawable_amount || 0)) {
      toast.error('Requested amount exceeds your withdrawable balance');
      return;
    }
    try {
      setSubmittingPersonalWithdraw(true);
      await api.post('/super/withdraw/direct', {
        amount: parseFloat(amount),
        bank_name: String(bank_name).trim(),
        bank_code: String(bank_code || '').trim(),
        account_number: String(account_number).trim(),
        account_name: String(account_name).trim(),
        password: String(password),
      });
      toast.success('Withdrawal processed successfully');
      setShowPersonalWithdrawDialog(false);
      resetPersonalWithdrawalForm();
      await loadWithdrawableSnapshot();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Withdrawal failed');
    } finally {
      setSubmittingPersonalWithdraw(false);
    }
  };

  const loadWithdrawableSnapshot = useCallback(async () => {
    try {
      const res = await api.get('/api/financial-admin/commissions/withdrawable');
      const data = res.data?.data || {};
      setWithdrawableSnapshot({
        withdrawable_amount: Number(data.withdrawable_amount || 0),
        total_earned: Number(data.total_earned || 0),
      });
    } catch (error) {
      console.error('Failed to load withdrawable snapshot:', error);
    }
  }, []);

  const revealWithdrawableAmount = async (inputs) => {
    try {
      setVerifyingRevealPassword(true);
      setRevealPasswordInput(inputs);

      await api.post('/api/users/verify-password', {
        password: String(inputs.password || ''),
      });

      setIsWithdrawableVisible(true);
      setShowRevealAmountDialog(false);
      setRevealPasswordInput({ password: '' });
      toast.success('Withdrawable amount unlocked');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Password verification failed');
    } finally {
      setVerifyingRevealPassword(false);
    }
  };
  const applyVerificationFilters = useCallback(() =>
  guardedLoad(async () => {
    setVerificationPage(1);
    await Promise.all([
      loadVerifications(1),
      loadAdminPerformance(),
    ]);
  }, "Failed loading verifications"),
[
  guardedLoad,
  loadVerifications,
  loadAdminPerformance
]);
    const handleVerificationPageChange = (page) =>
    guardedLoad(
      async () => {
        await loadVerifications(page);
      },
      "Failed loading verifications"
    );

  const loadBroadcasts = useCallback(async () => {
  const res = await api.get("/super/broadcasts");
  setBroadcasts(res.data.broadcasts || []);
}, []);

  const loadTab = useCallback((name) => {
  if (!tabs.includes(name)) return;

  setTab(name);
  setSearchParams({ tab: name }, { replace: true });

  if (name === "users") guardedLoad(loadUsers, "Failed loading users");
  if (name === "properties") guardedLoad(loadProperties, "Failed loading properties");
  if (name === "logs") guardedLoad(loadLogs, "Failed loading logs");
  if (name === "analytics") guardedLoad(loadAnalytics, "Failed loading analytics");
  if (name === "reports") guardedLoad(loadReports, "Failed loading reports");
  if (name === "fraud") guardedLoad(loadFraud, "Failed loading fraud");
  if (name === "flags") guardedLoad(loadFlags, "Failed loading flags");
  if (name === "verifications") applyVerificationFilters();
  if (name === "broadcast") guardedLoad(loadBroadcasts, "Failed loading broadcasts");

}, [
  guardedLoad,
  loadUsers,
  loadProperties,
  loadLogs,
  loadAnalytics,
  loadReports,
  loadFraud,
  loadFlags,
  applyVerificationFilters,
  loadBroadcasts,
  setSearchParams
]);

  const verifyIdentity = async (id) => {
    try {
      await api.patch(`/super/verifications/${id}/approve`);
      toast.success("Identity verified");
      await Promise.all([
        loadVerifications(verificationPage),
        loadUsers(),
        loadAdminPerformance(),
      ]);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to verify identity");
    }
  };

  const rejectIdentity = async (id) => {
    try {
      await api.patch(`/super/verifications/${id}/reject`);
      toast.success("Identity rejected");
      await Promise.all([
        loadVerifications(verificationPage),
        loadUsers(),
        loadAdminPerformance(),
      ]);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject identity");
    }
  };

  const deleteRejectedVerification = async (id) => {
    if (!window.confirm("Delete this rejected verification record?")) {
      return;
    }

    try {
      await api.delete(`/super/verifications/${id}`);
      toast.success("Rejected verification deleted");
      await Promise.all([
        loadVerifications(verificationPage),
        loadUsers(),
        loadAdminPerformance(),
      ]);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete rejected verification");
    }
  };

  const banUser = async (id) => {
    try {
      await api.patch(`/super/users/${id}/ban`);
      toast.success("User banned");
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to ban user");
    }
  };

  const unbanUser = async (id) => {
    try {
      await api.patch(`/super/users/${id}/unban`);
      toast.success("User unbanned");
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to unban user");
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Delete this user? This action hides the user account.")) return;
    try {
      await api.delete(`/super/users/${id}`);
      toast.success("User deleted");
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete user");
    }
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

  const toggleFeaturedProperty = async (id, shouldFeature) => {
    await api.patch(
      `/super/properties/${id}/${shouldFeature ? "feature" : "unfeature"}`
    );
    toast.success(
      shouldFeature ? "Property featured" : "Property removed from featured"
    );
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
    if (status === "resolved") {
      await api.patch(`/super/reports/${id}/resolve`);
    } else {
      await api.patch(`/super/reports/${id}`, { status });
    }
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
    try {
      await api.patch(`/super/flags/${key}`, { enabled });
      toast.success(`Flag ${enabled ? "enabled" : "disabled"}`);
      loadFlags();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update flag");
    }
  };

 useEffect(() => {
  if (!user) {
    hasInitializedDashboard.current = false;
    navigate("/login");
    return;
  }

  if (user.user_type !== "super_admin") {
    hasInitializedDashboard.current = false;
    navigate("/dashboard");
    return;
  }

  if (hasInitializedDashboard.current) {
    return;
  }

  hasInitializedDashboard.current = true;
  loadWithdrawableSnapshot();
  const initialTab = searchParams.get("tab");
  loadTab(tabs.includes(initialTab) ? initialTab : "overview");
}, [user, navigate, loadTab, searchParams, loadWithdrawableSnapshot]);

  useEffect(() => {
    if (!hasInitializedDashboard.current) {
      return;
    }

    const requestedTab = searchParams.get("tab");
    if (!tabs.includes(requestedTab)) {
      if (tab !== "overview") {
        loadTab("overview");
      }
      return;
    }

    if (requestedTab !== tab) {
      loadTab(requestedTab);
    }
  }, [searchParams, tab, loadTab]);

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
      <div className="max-w-7xl mx-auto px-4 py-8 animate-fadeIn">

          <LiveModerationQueue
          loadReports={loadReports}
          loadVerifications={loadVerifications}
          loadFraud={loadFraud}
        />

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Platform Control</p>
              <h1 className="mt-2 text-2xl font-semibold md:text-3xl">Super Admin Control Center</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">
                Manage platform operations, trust, legal workflows, and broadcast actions from a single command layer.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-indigo-300/40 bg-indigo-400/20 px-3 py-1 font-medium">Role: Super Admin</span>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 font-medium">Live Moderation Enabled</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <div className="w-full text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-200">Withdrawable Earnings</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!isWithdrawableVisible) {
                      setShowRevealAmountDialog(true);
                    }
                  }}
                  className="mt-1 text-lg font-semibold text-white hover:text-indigo-200"
                >
                  {isWithdrawableVisible ? formatCurrency(withdrawableSnapshot.withdrawable_amount) : '*****'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonalWithdrawDialog(true)}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Request Personal Withdrawal
              </button>
              <button
                type="button"
                onClick={() => loadTab('analytics')}
                className="rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
              >
                Open Analytics
              </button>
            </div>
          </div>
        </section>

        <div className="mb-4 text-sm text-slate-600">
          Active section: <span className="font-semibold text-slate-800">{String(tab || '').replace(/_/g, ' ')}</span>
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
          deleteRejectedVerification={deleteRejectedVerification}
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
            toggleFeatured={toggleFeaturedProperty}
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

      {tab === "pricing" && (
        <PricingRulesTab />
      )}

      {tab === "lawyer_invites" && (
        <LawyerInvitesManager
          title="Lawyer Invites"
          description="Resend pending lawyer invitations or change the invited lawyer email."
        />
      )}

      {tab === "platform_lawyers" && <PlatformLawyersTab />}

      {tab === "lawyer_activity" && <LawyerActivityMonitor />}

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

        {tab === "admin" && (
          <AdminManagementTab />
        )}

        {tab === "pending_approvals" && (
          <AdminManagementTab initialTab="pending" />
        )}

      <InputDialog
        isOpen={showRevealAmountDialog}
        onConfirm={revealWithdrawableAmount}
        onCancel={() => setShowRevealAmountDialog(false)}
        title="Unlock Withdrawable Earnings"
        message="Enter your login password to reveal your withdrawable earnings amount."
        type="info"
        confirmText="Unlock Amount"
        cancelText="Cancel"
        isLoading={verifyingRevealPassword}
        initialValues={revealPasswordInput}
        inputs={[
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            placeholder: 'Enter your login password',
            required: true,
            validate: (value) => String(value || '').trim().length > 0
              ? true
              : 'Password is required',
          },
        ]}
      />

      {/* Direct Withdrawal Modal — custom form with bank auto-resolve */}
      {showPersonalWithdrawDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Personal Commission Withdrawal</h2>
              <button
                type="button"
                onClick={() => {
                  setShowPersonalWithdrawDialog(false);
                  resetPersonalWithdrawalForm();
                }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Payout destination is verified before submission. Enter bank details exactly as registered.
              </div>
              <p className="text-sm text-gray-500">
                Withdrawable balance:{' '}
                <span className="font-semibold text-gray-800">
                  {isWithdrawableVisible
                    ? formatCurrency(withdrawableSnapshot.withdrawable_amount)
                    : '*****'}
                </span>
              </p>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (NGN) *</label>
                <input
                  type="number"
                  min="1000"
                  value={personalWithdrawForm.amount}
                  onChange={(e) => setPersonalWithdrawForm((p) => ({ ...p, amount: e.target.value }))}
                  className="input w-full"
                  placeholder="Minimum ₦1,000"
                />
              </div>

              {/* Bank select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank *</label>
                {banksLoading && (
                  <p className="mb-1 text-xs text-indigo-600">Loading bank list...</p>
                )}
                {banksError && (
                  <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    <span>{banksError}</span>
                    <button
                      type="button"
                      onClick={loadBanks}
                      className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <select
                  value={personalWithdrawForm.bank_code}
                  onChange={handlePersonalBankChange}
                  className="input w-full"
                  disabled={banksLoading || banks.length === 0}
                >
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Account number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                <input
                  type="text"
                  maxLength={10}
                  value={personalWithdrawForm.account_number}
                  onChange={handlePersonalAccountNumberChange}
                  className="input w-full"
                  placeholder="10-digit account number"
                />
              </div>

              {/* Account name — auto-resolved */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={personalWithdrawForm.account_name}
                    onChange={(e) => setPersonalWithdrawForm((p) => ({ ...p, account_name: e.target.value }))}
                    className="input w-full pr-20"
                    placeholder={withdrawAccountNameLoading ? 'Verifying…' : 'Auto-filled after bank & account number'}
                    readOnly={withdrawAccountNameLoading || (personalWithdrawForm.account_name && !withdrawAccountNameError)}
                  />
                  {withdrawAccountNameLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-500 animate-pulse">
                      Verifying…
                    </span>
                  )}
                </div>
                {withdrawAccountNameError && (
                  <p className="mt-1 text-xs text-amber-600">{withdrawAccountNameError}</p>
                )}
                {personalWithdrawForm.account_name && !withdrawAccountNameLoading && (
                  <p className="mt-1 text-xs text-green-600">Account resolved: {personalWithdrawForm.account_name}</p>
                )}
              </div>

              {/* Password confirm */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                <input
                  type="password"
                  value={personalWithdrawForm.password}
                  onChange={(e) => setPersonalWithdrawForm((p) => ({ ...p, password: e.target.value }))}
                  className="input w-full"
                  placeholder="Your login password"
                />
                <p className="mt-1 text-xs text-gray-500">Password required to authorize the payout.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPersonalWithdrawDialog(false);
                    resetPersonalWithdrawalForm();
                  }}
                  className="btn w-full"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPersonalWithdrawal}
                  disabled={
                    submittingPersonalWithdraw ||
                    withdrawAccountNameLoading ||
                    banksLoading ||
                    banks.length === 0
                  }
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingPersonalWithdraw ? 'Processing…' : 'Withdraw Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
