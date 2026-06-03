import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";
import { FaSync, FaUserShield, FaSearch, FaFilter, FaChevronDown, FaChevronUp } from "react-icons/fa";

const ACTION_COLORS = {
  ban: "bg-red-100 text-red-700",
  delete: "bg-red-100 text-red-700",
  reject: "bg-red-100 text-red-700",
  verify: "bg-green-100 text-green-700",
  approve: "bg-green-100 text-green-700",
  create: "bg-blue-100 text-blue-700",
  update: "bg-blue-100 text-blue-700",
  edit: "bg-blue-100 text-blue-700",
  login: "bg-purple-100 text-purple-700",
  logout: "bg-gray-100 text-gray-700",
  promote: "bg-amber-100 text-amber-700",
  feature: "bg-indigo-100 text-indigo-700",
  unlist: "bg-orange-100 text-orange-700",
  resolve: "bg-teal-100 text-teal-700",
  broadcast: "bg-cyan-100 text-cyan-700",
};

const getActionColor = (action) => {
  const a = String(action || "").toLowerCase();
  for (const [key, value] of Object.entries(ACTION_COLORS)) {
    if (a.includes(key)) return value;
  }
  return "bg-gray-100 text-gray-700";
};

const ADMIN_ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  lga_admin: "LGA Admin",
  financial_admin: "Financial Admin",
  lga_financial_admin: "LGA Financial Admin",
  super_financial_admin: "Super Financial Admin",
  state_admin: "State Admin",
  state_financial_admin: "State Financial Admin",
  lga_support_admin: "LGA Support Admin",
  state_support_admin: "State Support Admin",
  super_support_admin: "Super Support Admin",
  recruitment_admin: "Recruitment Admin",
  fumigation_admin: "Fumigation Admin",
  lga_fumigation_admin: "LGA Fumigation Admin",
  state_fumigation_admin: "State Fumigation Admin",
  super_fumigation_admin: "Super Fumigation Admin",
  transportation_admin: "Transportation Admin",
  lga_transportation_admin: "LGA Transportation Admin",
  state_transportation_admin: "State Transportation Admin",
  super_transportation_admin: "Super Transportation Admin",
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(dateStr);
};

export default function AdminMonitorTab() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef(null);

  const loadActivities = useCallback(async (append = false) => {
    try {
      setLoading(true);
      const params = { limit: 100 };
      if (append) {
        params.offset = pagination.offset + pagination.limit;
      }

      const res = await api.get("/super/admin-monitor", { params });
      const items = res.data?.data || [];

      if (append) {
        setActivities((prev) => [...prev, ...items]);
      } else {
        setActivities(items);
      }

      setPagination(
        res.data?.pagination || { total: items.length, limit: 100, offset: 0 }
      );
    } catch (err) {
      toast.error("Failed to load admin activity");
    } finally {
      setLoading(false);
    }
  }, [pagination.offset, pagination.limit]);

  useEffect(() => {
    loadActivities();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      loadActivities();
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadActivities]);

  const filteredActivities = activities.filter((item) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        (item.actor_name || "").toLowerCase().includes(term) ||
        (item.actor_email || "").toLowerCase().includes(term) ||
        (item.action || "").toLowerCase().includes(term) ||
        (item.target_type || "").toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }

    if (roleFilter !== "all" && item.actor_role !== roleFilter) return false;

    if (actionFilter !== "all") {
      const action = (item.action || "").toLowerCase();
      if (actionFilter === "create" && !action.includes("create") && !action.includes("add")) return false;
      if (actionFilter === "update" && !action.includes("update") && !action.includes("edit") && !action.includes("change")) return false;
      if (actionFilter === "delete" && !action.includes("delete") && !action.includes("remove") && !action.includes("ban") && !action.includes("unlist")) return false;
      if (actionFilter === "approve" && !action.includes("approve") && !action.includes("verify") && !action.includes("resolve")) return false;
      if (actionFilter === "reject" && !action.includes("reject")) return false;
      if (actionFilter === "login" && !action.includes("login")) return false;
      if (actionFilter === "other") {
        if (action.includes("create") || action.includes("add") ||
            action.includes("update") || action.includes("edit") || action.includes("change") ||
            action.includes("delete") || action.includes("remove") || action.includes("ban") || action.includes("unlist") ||
            action.includes("approve") || action.includes("verify") || action.includes("resolve") ||
            action.includes("reject") || action.includes("login")) return false;
      }
    }

    return true;
  });

  const uniqueRoles = [...new Set(activities.map((a) => a.actor_role).filter(Boolean))];

  const loadMore = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      loadActivities(true);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FaUserShield className="text-indigo-500" />
            Admin Activity Monitor
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Real-time view of actions performed by all admin users across the platform.
            {pagination.total > 0 && (
              <span className="ml-1 text-gray-400">
                ({pagination.total} total actions recorded)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto-refresh
          </label>

          <button
            type="button"
            onClick={() => loadActivities()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FaSync className={`text-xs ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
          <input
            type="text"
            placeholder="Search by name, email, action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>

        <div className="relative">
          <FaFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm appearance-none bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          >
            <option value="all">All roles</option>
            {uniqueRoles.map((role) => (
              <option key={role} value={role}>
                {ADMIN_ROLE_LABELS[role] || role}
              </option>
            ))}
          </select>
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm appearance-none bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
        >
          <option value="all">All actions</option>
          <option value="create">Create / Add</option>
          <option value="update">Update / Edit</option>
          <option value="delete">Delete / Remove / Ban</option>
          <option value="approve">Approve / Verify / Resolve</option>
          <option value="reject">Reject</option>
          <option value="login">Login</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="rounded-md bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
          Showing {filteredActivities.length} of {activities.length} filtered
        </span>
        <span className="rounded-md bg-gray-50 px-2.5 py-1 font-medium text-gray-600">
          {uniqueRoles.length} admin roles active
        </span>
      </div>

      {/* Activity list */}
      {loading && activities.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <FaSync className="text-2xl animate-spin" />
            <p className="text-sm">Loading admin activity...</p>
          </div>
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <FaUserShield className="text-4xl mb-3" />
          <p className="text-sm font-medium">No admin activity found</p>
          <p className="text-xs mt-1">
            {searchTerm || roleFilter !== "all" || actionFilter !== "all"
              ? "Try adjusting your filters"
              : "Admin activity will appear here as admins perform actions"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActivities.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow transition"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 text-left"
              >
                {/* Actor avatar */}
                <div className="flex items-center gap-3 min-w-0 sm:w-56 shrink-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
                    {(item.actor_name || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {item.actor_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {item.actor_email || ""}
                    </p>
                  </div>
                </div>

                {/* Action badge */}
                <div className="shrink-0">
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${getActionColor(
                      item.action
                    )}`}
                  >
                    {item.action}
                  </span>
                </div>

                {/* Target */}
                <div className="min-w-0 flex-1">
                  {item.target_type ? (
                    <span className="text-sm text-gray-600">
                      <span className="font-medium">{item.target_type}</span>
                      {item.target_id ? (
                        <span className="text-gray-400"> #{item.target_id}</span>
                      ) : null}
                      {item.metadata && typeof item.metadata === "object" && item.metadata.target_label ? (
                        <span className="text-gray-400"> — {item.metadata.target_label}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">System action</span>
                  )}
                </div>

                {/* Time */}
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500" title={formatDateTime(item.created_at)}>
                    {timeAgo(item.created_at)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {item.actor_role ? (ADMIN_ROLE_LABELS[item.actor_role] || item.actor_role) : ""}
                  </p>
                </div>

                {/* Expand icon */}
                <div className="shrink-0 text-gray-400">
                  {expandedId === item.id ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                </div>
              </button>

              {/* Expanded details */}
              {expandedId === item.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 rounded-b-xl">
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Actor</p>
                      <p className="mt-1 text-gray-900">{item.actor_name || "—"}</p>
                      <p className="text-gray-500 text-xs">{item.actor_email || ""}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Action Details</p>
                      <p className="mt-1 text-gray-900">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getActionColor(item.action)}`}>
                          {item.action}
                        </span>
                      </p>
                      {item.target_type && (
                        <p className="mt-1 text-xs text-gray-500">
                          On {item.target_type}{item.target_id ? ` #${item.target_id}` : ""}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timestamp</p>
                      <p className="mt-1 text-gray-900">{formatDateTime(item.created_at)}</p>
                      {item.ip_address && (
                        <p className="mt-1 text-xs text-gray-400">IP: {item.ip_address}</p>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  {item.metadata && typeof item.metadata === "object" && Object.keys(item.metadata).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Metadata</p>
                      <pre className="text-xs text-gray-600 bg-white rounded-lg p-2 border border-gray-100 overflow-x-auto max-h-32">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Role badge */}
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                      <FaUserShield className="text-[10px]" />
                      {item.actor_role ? (ADMIN_ROLE_LABELS[item.actor_role] || item.actor_role) : "Unknown role"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Load more */}
          {pagination.offset + pagination.limit < pagination.total && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="rounded-lg border border-gray-200 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? "Loading..." : `Load more (${pagination.total - (pagination.offset + pagination.limit)} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
