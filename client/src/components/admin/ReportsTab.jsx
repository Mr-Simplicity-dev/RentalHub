import React, { useState } from "react";
import ReportDrawer from "./ReportDrawer";

const ReportsTab = ({ reports, updateReport }) => {
  const [selectedReport, setSelectedReport] = useState(null);
  const [decisionDialog, setDecisionDialog] = useState({
    open: false,
    report: null,
    status: "",
    note: "",
    error: "",
  });

  const getStatusStyle = (status) => {
    if (status === "resolved")
      return "bg-green-100 text-green-700";

    if (status === "dismissed")
      return "bg-gray-200 text-gray-600";

    return "bg-yellow-100 text-yellow-700";
  };

  const openDecisionDialog = (report, status) => {
    setDecisionDialog({
      open: true,
      report,
      status,
      note: "",
      error: "",
    });
  };

  const closeDecisionDialog = () => {
    setDecisionDialog({
      open: false,
      report: null,
      status: "",
      note: "",
      error: "",
    });
  };

  const handleUpdateReport = async () => {
    const note = decisionDialog.note.trim();
    const report = decisionDialog.report;
    const status = decisionDialog.status;

    if (!note) {
      setDecisionDialog((prev) => ({
        ...prev,
        error: "An investigation note is required.",
      }));
      return;
    }

    try {
      await updateReport(report.id, status, note);

      setSelectedReport((prev) =>
        prev && prev.id === report.id ? { ...prev, status } : prev
      );
      closeDecisionDialog();
    } catch (err) {
      setDecisionDialog((prev) => ({
        ...prev,
        error: err.response?.data?.message || "Failed to update report.",
      }));
    }
  };

  return (
    <>
      <div className="animate-fadeIn rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-50 text-gray-700">

            <tr>

              <th className="p-3 text-left">Reporter</th>
              <th className="p-3 text-left">Target</th>
              <th className="p-3 text-left">Reason</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-center w-44">Actions</th>

            </tr>

          </thead>

          <tbody>

            {reports.length === 0 && (

              <tr>
                <td
                  colSpan="5"
                  className="text-center py-10 text-gray-500"
                >
                  No reports found
                </td>
              </tr>

            )}

            {reports.map((r) => (

              <tr
                key={r.id}
                className="border-t border-soft hover:bg-gray-50 transition"
              >

                <td className="p-3 font-medium">
                  {r.reporter_name || "Anonymous"}
                </td>

                <td className="p-3 text-gray-600">
                  {r.target_type} #{r.target_id}
                </td>

                <td className="p-3 max-w-xs truncate text-gray-700">
                  {r.reason}
                </td>

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full ${getStatusStyle(
                      r.status
                    )}`}
                  >
                    {r.status}
                  </span>

                </td>

                <td className="p-3">

                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => setSelectedReport(r)}
                      className="rounded-lg border border-soft bg-white px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
                    >
                      View
                    </button>

                    {r.status !== "resolved" && (

                      <button
                        onClick={() =>
                          openDecisionDialog(r, "resolved")
                        }
                        className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                      >
                        Resolve
                      </button>

                    )}

                    {r.status !== "dismissed" && (

                      <button
                        onClick={() =>
                          openDecisionDialog(r, "dismissed")
                        }
                        className="rounded-lg bg-gray-600 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-700"
                      >
                        Dismiss
                      </button>

                    )}

                  </div>

                  {Array.isArray(r.operations) && r.operations.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {r.operations.slice(0, 2).map((operation) => (
                        <p
                          key={operation.id}
                          className="max-w-[190px] truncate"
                          title={operation.note || operation.event_type}
                        >
                          {String(operation.event_type || "").replace(/_/g, " ")} by{" "}
                          {operation.actor_name || "Super admin"}
                        </p>
                      ))}
                    </div>
                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      <ReportDrawer
        report={selectedReport}
        closeDrawer={() => setSelectedReport(null)}
        updateReport={(id, status) => {
          const report =
            reports.find((item) => item.id === id) || selectedReport;
          openDecisionDialog(report, status);
        }}
      />

      {decisionDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl2 bg-white shadow-card">
            <div className="border-b border-soft px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {decisionDialog.status === "resolved"
                  ? "Resolve report"
                  : "Dismiss report"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {decisionDialog.report?.target_type} #{decisionDialog.report?.target_id}
              </p>
            </div>

            <div className="space-y-3 px-6 py-4">
              <label className="block text-sm font-medium text-gray-700">
                Investigation note
              </label>
              <textarea
                value={decisionDialog.note}
                onChange={(event) =>
                  setDecisionDialog((prev) => ({
                    ...prev,
                    note: event.target.value,
                    error: "",
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-soft px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder={
                  decisionDialog.status === "resolved"
                    ? "Explain what was fixed or what action was taken"
                    : "Explain why this report is being dismissed"
                }
              />
              <p className="text-xs text-gray-500">
                This note is saved in report governance history.
              </p>

              {decisionDialog.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {decisionDialog.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-soft px-6 py-4">
              <button
                type="button"
                onClick={closeDecisionDialog}
                className="rounded-lg border border-soft px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateReport}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  decisionDialog.status === "resolved"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-700 hover:bg-gray-800"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReportsTab;
