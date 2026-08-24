import React, { useEffect, useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";

const BROADCASTS_PAGE_SIZE = 8;

const BroadcastTab = ({
  broadcastForm,
  setBroadcastForm,
  sendBroadcast,
  broadcasts
}) => {
  const [broadcastPage, setBroadcastPage] = useState(1);
  const [approvalDialog, setApprovalDialog] = useState({
    open: false,
    note: "",
    error: "",
    loading: false,
  });

  const totalBroadcastPages = useMemo(
    () => Math.max(Math.ceil((broadcasts?.length || 0) / BROADCASTS_PAGE_SIZE), 1),
    [broadcasts]
  );

  const pagedBroadcasts = useMemo(() => {
    const start = (broadcastPage - 1) * BROADCASTS_PAGE_SIZE;
    return (broadcasts || []).slice(start, start + BROADCASTS_PAGE_SIZE);
  }, [broadcasts, broadcastPage]);

  useEffect(() => {
    setBroadcastPage(1);
  }, [broadcasts?.length]);

  useEffect(() => {
    if (broadcastPage > totalBroadcastPages) {
      setBroadcastPage(totalBroadcastPages);
    }
  }, [broadcastPage, totalBroadcastPages]);

  const openApprovalDialog = () => {
    if (!broadcastForm.title.trim()) {
      setApprovalDialog({
        open: true,
        note: "",
        error: "Broadcast title is required.",
        loading: false,
      });
      return;
    }

    if (!broadcastForm.message.trim()) {
      setApprovalDialog({
        open: true,
        note: "",
        error: "Broadcast message is required.",
        loading: false,
      });
      return;
    }

    setApprovalDialog({
      open: true,
      note: "",
      error: "",
      loading: false,
    });
  };

  const closeApprovalDialog = () => {
    setApprovalDialog({
      open: false,
      note: "",
      error: "",
      loading: false,
    });
  };

  const submitBroadcast = async () => {
    const note = approvalDialog.note.trim();

    if (!note) {
      setApprovalDialog((prev) => ({
        ...prev,
        error: "A broadcast approval note is required.",
      }));
      return;
    }

    try {
      setApprovalDialog((prev) => ({
        ...prev,
        loading: true,
        error: "",
      }));

      await sendBroadcast(note);
      closeApprovalDialog();
    } catch (err) {
      setApprovalDialog((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || "Failed to send broadcast.",
      }));
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

        <h3 className="font-semibold mb-3">
          Send Broadcast
        </h3>

        <input
          className="input mb-2 w-full"
          placeholder="Title"
          value={broadcastForm.title}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              title: e.target.value
            })
          }
        />

        <textarea
          className="input mb-2 w-full h-24"
          placeholder="Message"
          value={broadcastForm.message}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              message: e.target.value
            })
          }
        />

        <select
          className="input mb-3 w-full"
          value={broadcastForm.target_role}
          onChange={(e) =>
            setBroadcastForm({
              ...broadcastForm,
              target_role: e.target.value
            })
          }
        >
          <option value="">Everyone</option>
          <option value="tenant">Tenants</option>
          <option value="landlord">Landlords</option>
          <option value="admin">Admins</option>
        </select>

        <button
          onClick={openApprovalDialog}
          className="btn btn-primary"
        >
          Send
        </button>

      </div>


      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

        <h3 className="font-semibold mb-3">
          Previous Broadcasts
        </h3>

        <ul className="space-y-3 text-sm">

          {pagedBroadcasts.map((b) => (

            <li key={b.id} className="border-b border-soft pb-2 transition hover:bg-gray-50">

              <strong>
                {b.title}
              </strong>

              <div className="text-gray-600">
                {b.message}
              </div>

              <div className="text-xs text-gray-400">

                To: {b.target_role || "Everyone"} |

                {" "}By {b.sender_name} |

                {" "}
                {new Date(b.created_at).toLocaleString()}

              </div>

              {Array.isArray(b.operations) && b.operations.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  {b.operations.slice(0, 2).map((operation) => (
                    <p
                      key={operation.id}
                      className="truncate"
                      title={operation.note || operation.event_type}
                    >
                      {String(operation.event_type || "").replace(/_/g, " ")} by{" "}
                      {operation.actor_name || "Super admin"}
                    </p>
                  ))}
                </div>
              )}

            </li>

          ))}

        </ul>

        <PaginationControls
          currentPage={broadcastPage}
          totalPages={totalBroadcastPages}
          onPageChange={setBroadcastPage}
          summary={`Showing ${(broadcasts?.length || 0) === 0 ? 0 : (broadcastPage - 1) * BROADCASTS_PAGE_SIZE + 1}-${Math.min(broadcastPage * BROADCASTS_PAGE_SIZE, broadcasts?.length || 0)} of ${broadcasts?.length || 0}`}
        />

      </div>

      {approvalDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl2 bg-white shadow-card">
            <div className="border-b border-soft px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Send broadcast
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                To: {broadcastForm.target_role || "Everyone"}
              </p>
            </div>

            <div className="space-y-3 px-6 py-4">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <p className="font-semibold">{broadcastForm.title || "Untitled broadcast"}</p>
                <p className="mt-1 line-clamp-3">{broadcastForm.message || "No message entered"}</p>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Approval note
              </label>
              <textarea
                value={approvalDialog.note}
                onChange={(event) =>
                  setApprovalDialog((prev) => ({
                    ...prev,
                    note: event.target.value,
                    error: "",
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-soft px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Explain why this broadcast is approved to send now"
              />
              <p className="text-xs text-gray-500">
                This note is saved in broadcast governance history.
              </p>

              {approvalDialog.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {approvalDialog.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-soft px-6 py-4">
              <button
                type="button"
                onClick={closeApprovalDialog}
                className="rounded-lg border border-soft px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBroadcast}
                disabled={approvalDialog.loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {approvalDialog.loading ? "Sending..." : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BroadcastTab;
