import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../../hooks/useAuth";
import { approvalService } from "../../services/approvalService";
import RoleBadge from "../common/RoleBadge";

const STATUS_BADGE = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const ESCALATION_TICKET_OPTIONS = [
  { value: "approval_pending", label: "Approval Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function PendingAdminApprovalsTab() {
  const { user } = useAuth();
  const isSuperAdmin = user?.user_type === "super_admin";

  const [pending, setPending] = useState([]);
  const [recentDecisions, setRecentDecisions] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [decisionDialog, setDecisionDialog] = useState({
    open: false,
    admin: null,
    decision: "",
    note: "",
  });

  const parseEscalationBody = (rawText) => {
    try {
      const parsed = JSON.parse(String(rawText || '{}'));
      return {
        escalationType: parsed?.escalation_type || 'general_review',
        summary: parsed?.summary || '',
      };
    } catch {
      return {
        escalationType: 'general_review',
        summary: String(rawText || ''),
      };
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await approvalService.fetchPendingAdminApprovals();
      setPending(result.pending || []);
      setRecentDecisions(result.recent_decisions || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load pending admins");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEscalations = useCallback(async () => {
    try {
      setEscalationsLoading(true);
      const rows = await approvalService.fetchEscalations();
      setEscalations(rows);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load escalation inbox');
    } finally {
      setEscalationsLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([load(), loadEscalations()]);
  }, [load, loadEscalations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openDecisionDialog = (admin, decision) => {
    setDecisionDialog({
      open: true,
      admin,
      decision,
      note: "",
    });
  };

  const closeDecisionDialog = () => {
    setDecisionDialog({
      open: false,
      admin: null,
      decision: "",
      note: "",
    });
  };

  const submitDecision = async () => {
    const { admin, decision, note } = decisionDialog;

    if (!admin || !decision) return;

    if (decision === "rejected" && !note.trim()) {
      toast.error("Add a rejection reason before rejecting this admin");
      return;
    }

    try {
      setActionId(admin.id);
      const payload = { decision_note: note.trim() };

      if (decision === "approved") {
        await approvalService.approvePendingAdmin(admin.id, payload);
        toast.success("Admin account approved");
      } else {
        await approvalService.rejectPendingAdmin(admin.id, payload);
        toast.success("Admin account rejected and removed");
      }

      closeDecisionDialog();
      await load();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          `Failed to ${decision === "approved" ? "approve" : "reject"}`
      );
    } finally {
      setActionId(null);
    }
  };

  const openFullMessageThread = (entry) => {
    const userId = Number(entry?.sender_id);
    if (!userId) {
      toast.error("Unable to open thread for this escalation");
      return;
    }
    window.location.href = `/messages?conversationUser=${userId}`;
  };

  const markEscalationHandled = async (entryId) => {
    try {
      setActionId(`escalation-${entryId}`);
      await approvalService.markEscalationHandled(entryId);
      setEscalations((prev) => prev.map((item) => (
        Number(item.id) === Number(entryId)
          ? { ...item, is_read: true, is_handled: true, handled_at: new Date().toISOString() }
          : item
      )));
      toast.success("Escalation marked as handled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark escalation as handled");
    } finally {
      setActionId(null);
    }
  };

  const convertEscalationToApprovalTicket = async (entry) => {
    if (entry.ticket_status) {
      toast.info("Escalation is already being tracked as an approval ticket");
      return;
    }

    try {
      setActionId(`ticket-${entry.id}`);
      const res = await approvalService.convertEscalationToTicket(entry.id);
      const nextStatus = res?.data?.ticket_status || "approval_pending";
      setEscalations((prev) => prev.map((item) => (
        Number(item.id) === Number(entry.id)
          ? { ...item, ticket_status: nextStatus }
          : item
      )));
      toast.success("Escalation converted to tracked approval ticket");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to convert escalation to ticket");
    } finally {
      setActionId(null);
    }
  };

  const updateEscalationTicketStatus = async (entryId, status) => {
    try {
      setActionId(`ticket-${entryId}`);
      await approvalService.updateEscalationTicketStatus(entryId, status);
      setEscalations((prev) => prev.map((item) => (
        Number(item.id) === Number(entryId)
          ? { ...item, ticket_status: status }
          : item
      )));
      toast.success("Ticket status updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update ticket status");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Pending Admin Approvals</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSuperAdmin
              ? "Review and approve or reject newly created admin accounts awaiting activation."
              : "As a delegated Super Financial Admin you can approve most admin types (except Super Financial Admin accounts)."}
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading || escalationsLoading}
          className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
        >
          {loading || escalationsLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {loading && pending.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center">Loading pending approvals…</p>
          ) : pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
              No pending admin accounts right now.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pending.map((adm) => {
                    const isBusy = actionId === adm.id;
                    return (
                      <tr key={adm.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{adm.full_name}</td>
                        <td className="px-4 py-3 text-gray-600">{adm.email}</td>
                        <td className="px-4 py-3 text-gray-600">{adm.phone}</td>
                        <td className="px-4 py-3">
                          <RoleBadge role={adm.user_type} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">{adm.assigned_state || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(adm.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              STATUS_BADGE[adm.approval_status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {adm.approval_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openDecisionDialog(adm, "approved")}
                              disabled={isBusy}
                              className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openDecisionDialog(adm, "rejected")}
                              disabled={isBusy}
                              className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">Recent Approval Decisions</h4>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {recentDecisions.length}
              </span>
            </div>

            {recentDecisions.length === 0 ? (
              <p className="text-xs text-gray-500">No approval decisions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {recentDecisions.slice(0, 8).map((decision) => {
                  const snapshot = decision.target_snapshot || {};
                  return (
                    <article key={decision.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            {snapshot.full_name || snapshot.email || `Admin #${decision.target_user_id}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {snapshot.email || "No email"} - {snapshot.user_type || "admin"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                            decision.decision === "approved"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {decision.decision}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        By {decision.actor_name || "Approver"} on {new Date(decision.created_at).toLocaleString()}
                      </p>
                      {decision.note ? (
                        <p className="mt-1 text-xs text-gray-600">{decision.note}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800">Escalations Inbox</h4>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {escalations.length}
            </span>
          </div>

          {escalationsLoading && escalations.length === 0 ? (
            <p className="text-xs text-gray-500">Loading escalations…</p>
          ) : escalations.length === 0 ? (
            <p className="text-xs text-gray-500">No escalation requests.</p>
          ) : (
            <div className="space-y-2">
              {escalations.slice(0, 20).map((entry) => {
                const parsed = parseEscalationBody(entry.message_text);
                const ticketStatus = entry.ticket_status || "";
                const escalationBusy = actionId === `escalation-${entry.id}`;
                const ticketBusy = actionId === `ticket-${entry.id}`;
                return (
                  <article key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-900">{entry.sender_name}</p>
                      <span className="text-[10px] text-gray-500">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-indigo-700">
                      {String(parsed.escalationType || 'general_review').replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-xs text-gray-600 line-clamp-3">
                      {parsed.summary || entry.subject || 'Escalation request submitted'}
                    </p>
                    {(entry.ticket_updated_at || entry.handled_at) && (
                      <p className="mt-2 text-[10px] text-gray-500">
                        {entry.ticket_updated_at && (
                          <>
                            Ticket updated by {entry.ticket_updated_by_name || 'Unknown'} on {new Date(entry.ticket_updated_at).toLocaleString()}
                          </>
                        )}
                        {entry.ticket_updated_at && entry.handled_at ? ' · ' : ''}
                        {entry.handled_at && (
                          <>
                            Handled by {entry.handled_by_name || 'Unknown'} on {new Date(entry.handled_at).toLocaleString()}
                          </>
                        )}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openFullMessageThread(entry)}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                      >
                        Open Full Message Thread
                      </button>
                      <button
                        type="button"
                        onClick={() => markEscalationHandled(entry.id)}
                        disabled={Boolean(entry.is_handled || entry.handled_at || entry.is_read) || escalationBusy}
                        className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {entry.is_handled || entry.handled_at || entry.is_read ? "Handled" : escalationBusy ? "Saving..." : "Mark Escalation as Handled"}
                      </button>
                      {!ticketStatus ? (
                        <button
                          type="button"
                          onClick={() => convertEscalationToApprovalTicket(entry)}
                          disabled={ticketBusy}
                          className="rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {ticketBusy ? "Saving..." : "Convert to Tracked Approval Ticket"}
                        </button>
                      ) : (
                        <label className="flex items-center gap-2 text-[11px] text-gray-700">
                          Ticket Status
                          <select
                            value={ticketStatus}
                            onChange={(event) => updateEscalationTicketStatus(entry.id, event.target.value)}
                            disabled={ticketBusy}
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700"
                          >
                            {ESCALATION_TICKET_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {decisionDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {decisionDialog.decision === "approved"
                    ? "Approve admin account"
                    : "Reject admin account"}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {decisionDialog.admin?.full_name} - {decisionDialog.admin?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDecisionDialog}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              {decisionDialog.decision === "approved"
                ? "Approval note"
                : "Rejection reason"}
            </label>
            <textarea
              className="mt-2 h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder={
                decisionDialog.decision === "approved"
                  ? "Optional note for the approval record"
                  : "Explain why this admin account is being rejected"
              }
              value={decisionDialog.note}
              onChange={(event) =>
                setDecisionDialog((prev) => ({ ...prev, note: event.target.value }))
              }
            />
            {decisionDialog.decision === "rejected" ? (
              <p className="mt-2 text-xs text-gray-500">
                This reason is required and will be saved in the approval history.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDecisionDialog}
                disabled={actionId === decisionDialog.admin?.id}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecision}
                disabled={actionId === decisionDialog.admin?.id}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  decisionDialog.decision === "approved"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionId === decisionDialog.admin?.id
                  ? "Saving..."
                  : decisionDialog.decision === "approved"
                    ? "Approve account"
                    : "Reject account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
