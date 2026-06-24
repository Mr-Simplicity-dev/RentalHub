import React, { useState } from "react";
import ReportDrawer from "./ReportDrawer";

const ReportsTab = ({ reports, updateReport }) => {
  const [selectedReport, setSelectedReport] = useState(null);

  const getStatusStyle = (status) => {
    if (status === "resolved")
      return "bg-green-100 text-green-700";

    if (status === "dismissed")
      return "bg-gray-200 text-gray-600";

    return "bg-yellow-100 text-yellow-700";
  };

  const handleUpdateReport = async (id, status) => {
    await updateReport(id, status);

    setSelectedReport((prev) =>
      prev && prev.id === id ? { ...prev, status } : prev
    );
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
                          handleUpdateReport(r.id, "resolved")
                        }
                        className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                      >
                        Resolve
                      </button>

                    )}

                    {r.status !== "dismissed" && (

                      <button
                        onClick={() =>
                          handleUpdateReport(r.id, "dismissed")
                        }
                        className="rounded-lg bg-gray-600 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-700"
                      >
                        Dismiss
                      </button>

                    )}

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      <ReportDrawer
        report={selectedReport}
        closeDrawer={() => setSelectedReport(null)}
        updateReport={handleUpdateReport}
      />
    </>
  );
};

export default ReportsTab;
