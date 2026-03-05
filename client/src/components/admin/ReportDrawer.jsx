import React, { useEffect } from "react";

const ReportDrawer = ({ report, closeDrawer, updateReport }) => {

  /* CLOSE WITH ESC KEY */

  useEffect(() => {

    const handleEsc = (e) => {
      if (e.key === "Escape") closeDrawer();
    };

    window.addEventListener("keydown", handleEsc);

    return () => window.removeEventListener("keydown", handleEsc);

  }, [closeDrawer]);

  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 flex">

      {/* BACKDROP */}

      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={closeDrawer}
      />

      {/* DRAWER */}

      <div className="w-[460px] bg-white shadow-2xl overflow-y-auto animate-slideInRight">

        {/* HEADER */}

        <div className="p-6 border-b">

          <div className="flex justify-between items-center">

            <h2 className="text-lg font-semibold">
              Report Investigation
            </h2>

            <button
              onClick={closeDrawer}
              className="text-gray-500 hover:text-black"
            >
              ✕
            </button>

          </div>

        </div>

        {/* CONTENT */}

        <div className="p-6 space-y-6 text-sm">

          {/* REPORT DETAILS */}

          <div>

            <p className="text-xs text-gray-500 uppercase mb-1">
              Reporter
            </p>

            <p className="font-medium">
              {report.reporter_name || "Anonymous"}
            </p>

          </div>

          <div>

            <p className="text-xs text-gray-500 uppercase mb-1">
              Target
            </p>

            <p className="font-medium">
              {report.target_type} #{report.target_id}
            </p>

          </div>

          <div>

            <p className="text-xs text-gray-500 uppercase mb-1">
              Report Reason
            </p>

            <p className="text-gray-700 leading-relaxed">
              {report.reason}
            </p>

          </div>

          <div>

            <p className="text-xs text-gray-500 uppercase mb-1">
              Current Status
            </p>

            <span
              className={`px-2 py-1 text-xs rounded-full
                ${
                  report.status === "resolved"
                    ? "bg-green-100 text-green-700"
                    : report.status === "dismissed"
                    ? "bg-gray-200 text-gray-600"
                    : "bg-yellow-100 text-yellow-700"
                }
              `}
            >
              {report.status}
            </span>

          </div>

          {/* PROPERTY PREVIEW */}

          {report.target_type === "property" && (

            <div className="border rounded-lg p-4 bg-gray-50">

              <p className="text-xs text-gray-500 uppercase mb-2">
                Property Preview
              </p>

              <p className="text-gray-700 text-sm">
                Property ID: #{report.target_id}
              </p>

              <p className="text-gray-500 text-xs">
                Full property details can be loaded here.
              </p>

            </div>

          )}

          {/* USER PREVIEW */}

          {report.target_type === "user" && (

            <div className="border rounded-lg p-4 bg-gray-50">

              <p className="text-xs text-gray-500 uppercase mb-2">
                User Preview
              </p>

              <p className="text-gray-700 text-sm">
                User ID: #{report.target_id}
              </p>

              <p className="text-gray-500 text-xs">
                Full user profile can be loaded here.
              </p>

            </div>

          )}

        </div>

        {/* ACTION FOOTER */}

        <div className="border-t p-6 flex gap-3">

          {report.status !== "resolved" && (

            <button
              onClick={() => updateReport(report.id, "resolved")}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 text-sm"
            >
              Resolve Report
            </button>

          )}

          {report.status !== "dismissed" && (

            <button
              onClick={() => updateReport(report.id, "dismissed")}
              className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 text-sm"
            >
              Dismiss Report
            </button>

          )}

        </div>

      </div>

    </div>
  );
};

export default ReportDrawer;